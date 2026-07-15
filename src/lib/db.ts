// Access to the Cloudflare D1 database bound as "DB" in wrangler.jsonc.
//
// Nitro's `cloudflare-module` preset sets `globalThis.__env__` to the Worker's
// bindings object at the very start of every request, before any application
// code runs — this is the same mechanism the official `cloudflare-d1` db0
// connector relies on. That makes it safe to read here, from any server
// function or server route handler, without needing to thread the request
// context through manually.
//
// Available whenever the app is running under `wrangler dev` (after
// `npm run build`) or deployed to Cloudflare Workers. It is NOT available
// under plain `vite dev`, since that runs a Node dev server with no Workers
// runtime/bindings — see README.md for the local development workflow.
import type { D1Database } from "@cloudflare/workers-types";

declare global {
  // eslint-disable-next-line no-var
  var __env__: { DB?: D1Database } | undefined;
}

export function getDB(): D1Database {
  const db = globalThis.__env__?.DB;
  if (!db) {
    throw new Error(
      "D1 binding 'DB' not found. This code path needs the Cloudflare Workers runtime. " +
        "Run `npm run build && npm run preview` (wrangler dev) locally, or deploy with " +
        "`npm run deploy`. See README.md for setup.",
    );
  }
  return db;
}
