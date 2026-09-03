# AGENTS.md — timerich

Vue 3 + TypeScript + Vite single-page app, deployed as Toss mini-app via `@apps-in-toss/web-framework` (`ait` CLI). Entry: `src/main.ts` → `src/App.vue`. No router/store, no tests, no lint, no CI.

## Commands

- `npm run dev` — local dev (Vite, port 5173)
- `npm run build` — typecheck (`vue-tsc -b`) + `vite build` + `ait build` (produces `dist/` + `timerich.ait`). Always use this before deploy; do not substitute `build:vite`.
- `npm run build:vite` — typecheck + Vite build only (no `.ait` packaging). Use for quick verification.
- `npm run preview` / `npm run deploy` — preview dist / `ait deploy`.
- `npm run dev:vite` — plain Vite dev without Toss shell.

No test/lint/typecheck-only scripts. Verification is `npm run build:vite` (or full `npm run build` when touching deploy packaging).

## Gotchas

- `vue-tsc -b` runs first in every build and fails on unused locals/params (`noUnusedLocals`, `noUnusedParameters: true` in `tsconfig.app.json`). Remove dead imports/vars; don't prefix-and-ignore.
- `apps-in-toss.config.ts` is the deploy source of truth: `appName`, `brand`, `outdir: "dist"`. Its `web.commands` say `vite dev` / `vite build` — but via npm use the `dev`/`build` scripts above (which add typecheck + `ait` steps).
- Committed `timerich.ait` is a build artifact — regenerate with `npm run build`, don't hand-edit.
- SFC convention: `<script setup lang="ts">`, scoped styles; global styles only in `src/style.css`.
