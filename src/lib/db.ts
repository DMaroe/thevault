// Access to the Cloudflare D1 database bound as "DB" in wrangler.jsonc.
//
// IMPORTANT: bindings are read off the *current request*, not off a shared
// global. Nitro's cloudflare-module preset does set `globalThis.__env__ = env`
// at the top of every `fetch(request, env, ctx)` call, but that assignment
// lands on a single process-wide global. Cloudflare Workers isolates can
// interleave multiple concurrent requests (e.g. the browser firing off a
// POST unlock + a follow-up GET + parallel asset requests all at once), so by
// the time an `await`-heavy server function actually reads
// `globalThis.__env__`, a *different* concurrent request may have already
// overwritten it (or Miniflare may have revoked the earlier request's
// binding proxies). That race is exactly what caused "D1 binding 'DB' not
// found" to fire intermittently right after unlocking, when several requests
// land back-to-back.
//
// The safe fix: Nitro also attaches the same bindings directly onto the
// per-request `Request` object itself (`request.runtime.cloudflare.env`, see
// `augmentReq` in nitro's cloudflare preset), which is 1:1 with the request
// being handled and never shared across requests. We fetch that via
// `getRequest()` from `@tanstack/react-start/server`, which resolves to the
// in-flight request for the server function currently executing.
//
// Available whenever the app is running under `wrangler dev` (after
// `npm run build`) or deployed to Cloudflare Workers. It is NOT available
// under plain `vite dev`, since that runs a Node dev server with no Workers
// runtime/bindings — see README.md for the local development workflow.
import type { D1Database } from "@cloudflare/workers-types";
import { getRequest } from "@tanstack/react-start/server";

export type WorkerEnv = {
  DB?: D1Database;
  SESSION_SECRET?: string;
  SITE_PASSWORD?: string;
  OPENAI_API_KEY?: string;
};

declare global {
  var __env__: WorkerEnv | undefined;
  var __cf_env__: WorkerEnv | undefined;
}

type CloudflareRequest = Request & {
  runtime?: { cloudflare?: { env?: WorkerEnv } };
};

const getRuntimeEnv = (): WorkerEnv | NodeJS.ProcessEnv | undefined => {
  // Preferred: bindings attached to the current request (race-free).
  try {
    const request = getRequest() as CloudflareRequest | undefined;
    const requestEnv = request?.runtime?.cloudflare?.env;
    if (requestEnv) return requestEnv;
  } catch {
    // getRequest() throws outside of a request context (e.g. during a cold
    // module init) — fall through to the other lookups below.
  }
  // Fallbacks: the shared globals (best-effort, can race — see above) and,
  // for plain `vite dev`/tests, process.env.
  if (typeof globalThis !== "undefined") {
    return globalThis.__env__ ?? globalThis.__cf_env__ ?? (typeof process !== "undefined" ? process.env : undefined);
  }
  return typeof process !== "undefined" ? process.env : undefined;
};

export function getDB(): D1Database {
  const env = getRuntimeEnv();
  const db = env?.DB as D1Database | undefined;
  if (!db) {
    throw new Error(
      "D1 binding 'DB' not found. This code path needs the Cloudflare Workers runtime. " +
        "Run `npm run build && npm run preview` (wrangler dev) locally, or deploy with " +
        "`npm run deploy`. See README.md for setup.",
    );
  }
  return db;
}

/** Read a secret or variable from the current Cloudflare Worker binding set. */
export function getRequiredEnv(name: keyof Omit<WorkerEnv, "DB">): string {
  const env = getRuntimeEnv();
  const value = env?.[name] as string | undefined;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} is not set`);
  }
  return value;
}