# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LMS Auto Comment Tool - A Cloudflare Worker (Hono) web application with React & Tailwind frontend for MindX Technology School teachers to:
1. Auto-generate student comments in Vietnamese using AI (OpenRouter or Antigravity API)
2. Submit comments, checkpoint evaluations, and demo scores to the MindX LMS system
3. Track student learning levels (L1–L4 / SPCK progress levels) with optimistic autosave
4. Grade homework assignments (batch or individual) with background grading queue support

## Commands

```bash
# Full verification suite (typecheck, unit tests, contracts, frontend, build, static checks)
npm run verify

# Development
npm run dev                  # Start local Cloudflare Worker (port 8787)
npm run dev:frontend         # Start Vite dev server for frontend
npm run dev:full             # Run both worker and frontend

# Build
npm run build:frontend       # Build React SPA to public/new

# Typecheck & Tests
npm run typecheck            # Typecheck root worker, frontend, and contracts
npm test                     # Run Node unit tests
npm run test:vitest          # Run Vitest tests for backend
npm run test:frontend        # Run Vitest tests for React frontend
npm run test:contracts       # Run Vitest tests for shared contracts
```

## Architecture

### Tech Stack
- **Backend**: Cloudflare Workers + Hono (`src/worker.ts`, `src/router.ts`)
- **Frontend (Modern)**: React 19 + TypeScript + Tailwind CSS v4 + Vite (`frontend/`)
  - Server state: TanStack React Query v5
  - Workflow & drafts: Zustand v5
  - Form & boundary validation: Zod v4
  - Icons: Lucide React
  - Accessible dialogs: Radix UI primitives
- **Contracts**: Shared schemas and DTOs (`packages/contracts/`)
- **Storage & Infrastructure**: Cloudflare D1 (database), KV (session/token cache), R2 (attachments), Cloudflare Queues (async homework grading)
- **Static Assets**: Cloudflare Workers Static Assets (`wrangler.toml` assets directory: `./public`)

### Routing
- `/` - React Comments & Assessment Workspace (`public/new/index.html`)
- `/homework` - React Homework Workspace (`public/new/index.html`)
- `/new` and `/new/homework` - React aliases for existing bookmarks
- `/api/*` - Core backend API (auth, classes, assessments, comments, homework, config)
- `/api/v2/*` - Typed backend compatibility layer for React frontend

### Core Directories & Files

- `src/`
  - `worker.ts` - Cloudflare Worker fetch & queue entry point
  - `router.ts` - Hono application router and asset serving
  - `routes/` - Route handlers (`auth.ts`, `classes.ts`, `comments.ts`, `homework.ts`, `assessments.ts`, `config.ts`, `v2/`)
  - `services/` - Business logic (`lmsClient.ts`, `aiClient.ts`, `commentPrompt.ts`, `assessmentService.ts`, `homeworkService.ts`, etc.)
  - `constants/` - LMS queries, AI models, learning levels
- `frontend/`
  - `src/app/` - React shell, providers (Query, Auth, Theme, Dialog, Toast), ErrorBoundary, router
  - `src/components/` - Shared UI primitives (`Button`, `Card`, `Dialog`, `ConfirmDialog`, `Field`, `Status`, `Toast`)
  - `src/features/` - Domain features (`auth`, `configuration`, `classes`, `assessments`, `comments`, `review`, `demo`, `checkpoint`, `homework`)
  - `src/lib/` - `apiClient`, `apiError`, `persistence` (localStorage sync), `runtimeRoutes`
  - `src/styles/` - Tailwind v4 styles, `tokens.css`, `app.css`, `animations.css`
- `packages/contracts/` - Independent Zod schemas and TypeScript contracts shared across frontend and backend
- `public/new/` - Built React static document and hashed assets
- `public/assets/` - Explicitly retained public assets not bundled by Vite
