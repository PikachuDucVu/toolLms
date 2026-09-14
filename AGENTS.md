# AGENTS.md

This repository is an LMS Auto Comment Tool running on Cloudflare Workers with a React + Tailwind frontend.

## Commands

```bash
npm run verify
npm run dev
npm run dev:frontend
npm run build:frontend
npm run db:migrate:verify
```

## Architecture

- `src/worker.ts` is the Worker fetch and Queue entry point.
- `src/router.ts` serves the React document at `/`, `/homework`, `/new`, and `/new/homework`, and mounts `/api/*` plus `/api/v2/*`.
- `src/routes/**` contains Hono API routes.
- `src/services/**` contains LMS, AI, assessment, comments, homework, and grading business logic.
- `frontend/` contains the React 19 + TypeScript + Tailwind v4 source.
- `packages/contracts/` contains shared Zod schemas and DTO types.
- `public/new/` is generated Vite output. Do not edit it manually.
- `public/assets/` contains only explicitly retained public assets; the former HTML/CSS/JS frontend has been removed. `public/` must not contain `index.html`, `homework.html`, `css/`, or `js/`.

## Frontend boundaries

- Components do not call `fetch` directly; use `frontend/src/lib/apiClient.ts`.
- React must not import DOM modules or global bridges from the removed legacy frontend.
- TanStack Query owns server state; Zustand owns feature workflow drafts and operation state.
- API keys, LMS tokens, and server secrets must not be embedded in frontend source or production assets.
- Keep root and `/new` route families compatible through `frontend/src/lib/runtimeRoutes.ts`.

## Cloudflare resources

The Worker uses D1, KV, R2, Queue, and Static Assets bindings configured in `wrangler.toml`. Apply D1 migrations with Wrangler before deploying schema-dependent server changes. Never delete production D1, KV, R2, or Queue data as part of a frontend rollback.
