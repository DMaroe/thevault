// Access to the Cloudflare D1 database bound as "DB" in wrangler.jsonc.
//
// The Worker entry assigns the current request's bindings to
// `globalThis.__env__` before the TanStack server handler executes. This keeps
// the binding available to server functions without passing it through each
// function signature.
//
// Available whenever the app is running under `wrangler dev` (after
// `npm run build`) or deployed to Cloudflare Workers. It is NOT available
// under plain `vite dev`, since that runs a Node dev server with no Workers
// runtime/bindings — see README.md for the local development workflow.
import type { D1Database } from "@cloudflare/workers-types";

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

const getRuntimeEnv = (): WorkerEnv | NodeJS.ProcessEnv | undefined => {
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
