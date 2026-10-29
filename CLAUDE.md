# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Vietnamese-language factory/ERP app (production reports, warehouse, weighing, orders, BB machine analysis). React 19 + Vite + Tailwind 4 frontend, one large Express `server.ts` backend, multiple Supabase projects. UI strings, comments, docs and table names are in Vietnamese.

## Commands

Package scripts are npm-style (`package.json`), though `packageManager` says pnpm.

- `npm run dev` — `tsx watch server.ts`; Express serves the API and mounts Vite as middleware (HMR) on one port. Open `http://127.0.0.1:<PORT>` (the server logs it; `localhost` can hit a different IPv6 listener).
- `npm run lint` — `tsc --noEmit` (the only lint/typecheck step).
- `npm run build` — `vite build` → `dist/`, then esbuild bundles `server.ts` → `dist/server.cjs` and `scripts/vercel-api-entry.ts` → `api/_handler.cjs`.
- `npm start` — `node dist/server.cjs` (production).
- Tests: no test runner is configured. `src/lib/mixingReportModel.test.ts` exists but there is no vitest/jest script or dependency. `test/*.md` are manual test-case docs, not automated tests.
- DB migrations are plain SQL files at the repo root (`supabase-*.sql`), run manually in the Supabase SQL Editor or via `node scripts/run-sql-file.mjs <file.sql>` (needs `SUPABASE_DB_PASSWORD` or `SUPABASE_DB_URL` in `.env`). Other `scripts/*.mjs` are one-off migration/data-fix tools.
- Env: copy `.env.example` → `.env.local`/`.env`. `server.ts` calls `dotenv.config({ override: true })`, so `.env` wins over the shell environment.

## Architecture

**Deployment targets:** `server.ts` exports `createApp()` and also starts a listener when run directly. On Vercel, `api/index.ts` re-exports the esbuild bundle `api/_handler.cjs` (built from `scripts/vercel-api-entry.ts`), and `vercel.json` rewrites `/api/*` to it and everything else to `index.html`. On Vercel the JSON fallback DBs are written to `/tmp`.

**Backend (`server.ts`, ~23k lines):** a single file containing every `/api/*` route. It creates several separate Supabase clients, each pointing at a different Supabase project and configured by its own env prefix:
- main system DB (`SUPABASE_URL`/`SUPABASE_SERVICE_KEY`) — reports, warehouse, production orders, etc.
- weighing (`SUPABASE_WEIGHING_*`) — `phieu_can_dinh_ki`, `can_tu_dong`
- kiểm kho (`SUPABASE_KIEM_KHO_*`), kho chờ (`SUPABASE_KHO_CHO_*`), tồn (`SUPABASE_TON_*`), new warehouse DB (`SUPABASE_KHO_*`)

So a table's location depends on which DB it lives in; check the manifest before assuming. Some data has local JSON-file fallbacks (`reports-db.json` etc.) when Supabase isn't configured. Cloudinary is used for image uploads; Vietmap for maps; Gemini for AI.

**Frontend:** `src/App.tsx` is only the shell (~2k lines: layout, menu, routing). Tabs are typed as `AppTab` and mapped to URL paths in `src/routes.ts` (`TAB_ROUTES`). Menus/permissions live in `src/app/` (`menus.tsx`, `tabAccess.ts`, `accessControl.tsx`). Real screens are in `src/features/<slug>/index.tsx`; shared UI/print sheets/list views are in `src/components/` (table/filter building blocks in `src/components/shared/table/`); pure calculation and export logic is in `src/utils/` (many `bb*`, `baoCao*`, `controlBoard*` files hold report math). `src/types.ts` has shared types. `src/App.monolith.backup.tsx` is a dead 18k-line backup — never open it.

**Table-centric code map (follow this first, it is the repo's main navigation aid):** each Supabase table has a ~20-line manifest in `docs/ai-tables/<table>.md` listing its SQL file, API routes with `server.ts` line ranges (`serverLines`), feature/components, and utils. Index is `docs/ai-tables/README.md`; the code-side mirror is `src/features/registry.ts`. Workflow when changing a feature:
1. Identify the table → read its manifest.
2. Open only the listed feature/component files, and only the listed line range in `server.ts`. Don't read all of `server.ts` or `App.tsx`.
3. When you split a panel out of `App.tsx` into `src/features/<slug>/`, or shift `server.ts` code, update the manifest and `registry.ts` in the same change so the line references stay valid.

Example: BB machine report math flows `bb_bao_cao_tinh_toan` manifest → `src/utils/bbBaoCaoTinhToan.ts`, `controlBoardBbMachineReport.ts`, `bbTieuHaoNvlPrintRows.ts` → `src/features/control-board/` and `src/components/ControlBoardBbMachineReportTable.tsx`. Snapshot is only recomputed when the user clicks **Tính toán**; the printed sheet mirrors the on-screen tab data rather than recomputing it.

## Conventions from existing rules

- Weighing images (`WeighingReportForm`, `WeighingShiftSummary`, `/tong-hop-ca`, `src/features/can-tu-dong`): viewing an image must open the in-app modal via `WeighingImageThumbnail` / `WeighingImagePreviewModal` (`src/components/WeighingImagePreviewModal.tsx`). Never use `<a target="_blank">` or `window.open()` for images. Details in `.cursor/rules/weighing-image-preview.mdc`.
- List/table screens follow the standard in `agents/README.md`: use `/lenh-san-xuat` (`src/features/lenh-sx/index.tsx`) as the reference — single-row compact filter bar with search first, black table header with white text, uniform status badges, pagination; reuse `src/components/shared/table/`.
- Other root docs: `TON-KHO-README.md` (inventory feature status and the order SQL migrations to run), `bao-cao-phoi-tron.md`, `agents/*.md` (plans).
- Stray root files (`tmp-*.png`, `*.traineddata`, `.tmp-bug-imgs/`, xlsx) are untracked scratch material, not part of the app.
