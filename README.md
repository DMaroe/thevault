# The Vault

This app runs as a Cloudflare Worker with a D1 binding named `DB`. `bun run dev` builds the app and starts Wrangler at `http://localhost:8080`, so Worker bindings and `.dev.vars` are available. It explicitly uses the root `wrangler.jsonc`, avoiding stale generated Wrangler configuration. `bun run dev:vite` is browser-only Vite development and cannot run database-backed server functions.

## One-time Cloudflare setup

1. Authenticate Wrangler (`bunx wrangler login`) or export a `CLOUDFLARE_API_TOKEN` with D1 and Workers permissions.
2. Find the D1 ID with `bunx wrangler d1 list`, then copy `wrangler.jsonc.example` to `wrangler.jsonc` and replace `REPLACE_WITH_THE_D1_DATABASE_ID`.
3. Configure the required Worker secrets:

   ```sh
   bunx wrangler secret put SESSION_SECRET
   bunx wrangler secret put SITE_PASSWORD
   bunx wrangler secret put OPENAI_API_KEY
   ```

4. Apply the tracked migration: `bun run db:migrate:remote`.
5. Deploy with `bun run deploy`.

For local Worker testing, set `SESSION_SECRET`, `SITE_PASSWORD`, and `OPENAI_API_KEY` in `.dev.vars`, then run `bun run db:migrate:local` followed by `bun run dev`.

`migrations/0001_create_ideas_table.sql` is the canonical D1 migration. `schema.sql` is retained as a schema reference only.
