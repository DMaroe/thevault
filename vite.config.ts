// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  nitro: {
    // Keep in sync with `compatibility_date` in wrangler.jsonc.
    compatibilityDate: "2026-07-15",
    cloudflare: {
      // Node.js API shims (needed for node:crypto in gate.functions.ts).
      nodeCompat: true,
      // We maintain a single, explicit wrangler.jsonc at the project root
      // (with the D1 binding, migrations dir, etc.) instead of letting Nitro
      // generate its own wrangler.json inside the build output.
      deployConfig: false,
    },
  },
});