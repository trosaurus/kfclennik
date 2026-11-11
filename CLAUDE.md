# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Voetbaltraining.app (originally built for KFC Lennik 4157): a Dutch-language playing-time / training-management app for youth football clubs. Track player rosters per team, live playing time per match period, and prepare/export trainings. UI copy, comments, and domain vocabulary are in Dutch (ploeg = team, speler = player, wedstrijd = match, training = training session, oefening = exercise, speeltijd = playing time).

```
kfc-lennik/
├── backend/   → Keystone.js 6 (GraphQL API + Prisma/PostgreSQL)
└── frontend/  → Vite + React 18 + TypeScript + React Router 6
```

## Commands

### Backend (`backend/`)
```bash
npm install --legacy-peer-deps   # Keystone's peer deps require this
npm run dev                       # keystone dev — http://localhost:3000, Admin UI at /admin
npm run build                     # keystone build (required before `start`)
npm run start                     # prisma db push --accept-data-loss, then keystone start
```
There is no lint or test script for the backend.

**After editing `backend/schema.ts`** (adding/changing a list or field), the Prisma/GraphQL schema files are generated, not hand-written — regenerate and sync the dev database:
```bash
npx keystone postinstall --fix              # regenerates schema.prisma + schema.graphql from schema.ts
npx keystone prisma db push --accept-data-loss   # pushes the schema to Postgres (safe: adds/alters, doesn't drop data by itself)
```
On Windows, a running `keystone dev` process locks the Prisma query-engine binary — stop it first or the regenerate step fails with `EPERM: operation not permitted, unlink ...query_engine-windows.dll.node`.

Type-check the backend (no local `tsc` binary; keystone bundles its own bundler but not a standalone type-checker):
```bash
npx --yes --package typescript tsc --noEmit -p tsconfig.json
```

### Frontend (`frontend/`)
```bash
npm install
npm run dev       # vite — http://localhost:5173, proxies /api/graphql → localhost:3000
npm run build     # tsc && vite build
npm run preview
npx tsc --noEmit  # type-check only
```
No lint or test script exists on the frontend either — `tsc --noEmit` is the only automated check on both sides.

### Ports & proxy
Backend: 3000 (GraphQL at `/api/graphql` in prod, `/graphql` directly via Keystone in dev — the frontend always calls `/api/graphql`, which Vite proxies to `localhost:3000` in dev). Frontend dev server: 5173. Production frontend reads the API origin from `VITE_API_URL` (see `frontend/.env.production`); in dev this is unset so requests go through the Vite proxy.

## Architecture

### Data model & multi-tenancy (the core thing to understand)
`Club` sits above `Team`: each team belongs to one club (`Team.club`), and the club's name, stamnummer and logo (a PNG/JPEG data URL stored in the DB) drive the branding the trainer sees (sidebar, match screens, lineup/training PDF exports). Nothing club-specific should be hardcoded; the app's own brand is in `frontend/src/lib/brand.ts`. A trainer can read only their own team's club (`ownClubFilter`); club create/update/delete is admin-only. `backend/lib/migrateLegacyClub.ts` (run from `db.onConnect`) creates a single club for pre-Club databases, and only while zero clubs exist.

Every list in `backend/schema.ts` is scoped to a `Team`, directly or transitively:
- Direct `team` relation: `Player`, `Match`, `Training`.
- Via `match`: `Period`, `Goal`, `Attendance`, `Evaluation`.
- Via `attendance.match`: `PlayTimeSession`.
- Via `training`: `Exercise`.
- Shared across everyone (not team-scoped, and not yet club-scoped either): `WeekTheme`, `OefeningDatabank` (shared exercise library) — any signed-in trainer can read/create these; `WeekTheme` update/delete is admin-only.

A `Trainer` has a `role` (`admin` | `trainer`) and an optional `team`. **Admins bypass all scoping; a `trainer` only sees their own team's data.** This is enforced server-side in `backend/access.ts`, not just filtered client-side — every list's `access.operation`/`access.filter` uses one of the helper functions there (`teamOwnedFilter`, `matchScopedFilter`, `attendanceScopedFilter`, `trainingOwnedFilter`/`trainingVisibleFilter`, `exerciseScopedFilter`/`exerciseVisibleFilter`, `selfOrAdminFilter`, `ownTeamFilter`, `anySignedInFilter`). When adding a new list or relation, follow this same pattern — plug in (or extend) one of these filters rather than defaulting to `allowAll`.

Two non-obvious wrinkles baked into that access layer:
- **Trainers can exist without a team** (created but not yet assigned). `Training`/`Exercise` therefore fall back to an "owned by me" branch (via the `trainer`/`training.trainer` relation) in addition to the team branch, so a teamless trainer doesn't lose access to their own drafts. `Player`/`Match`/etc. have no such fallback — they are purely team-scoped by design.
- **Training sharing**: `Training.sharedWith` (many-to-many to `Trainer`) grants read-only visibility to explicitly selected trainers from other teams (`trainingVisibleFilter`/`exerciseVisibleFilter`), used so a trainer can view and *copy* another team's training — never co-edit it. Update/delete/re-sharing stays restricted to the owner (creator or their team) and admins via `trainingOwnedFilter`/`exerciseScopedFilter`. The frontend implements "share" as duplication (`duplicateTraining` in `frontend/src/lib/api.ts`), not live collaboration.
- `relationGuard(...)` in `access.ts` is a `validateInput` hook factory used across lists as defense-in-depth: it re-checks that a relationship being connected is visible under the target list's own access filter (Keystone's built-in relationship-connect check already does this, so this is a deliberate belt-and-suspenders re-check, not the primary enforcement).

Custom mutations in `backend/customSchema.ts` (`uploadTeamManual`, `removeTeamManual`, `exportTrainingPptx`, `exportExercisePptx`) sit outside normal list access control and must do their own auth checks — see `requireSignedIn`/`requireOwnTeamOrAdmin` there. `uploadTeamManual`/`removeTeamManual` write via `context.sudo()` after an explicit authorization check, because the generic `Team.update` operation is admin-only but a trainer must still be able to upload their own team's manual.

Session shape (`sessionData` in `backend/keystone.ts`): `{ id, email, name, role, team: { id, name, category } | null }`. Field-level access on `Trainer.email`/`Trainer.role` (`selfOrAdminFieldRead`) hides other trainers' e-mail/role from the now club-wide-readable trainer list (needed so trainers can pick each other when sharing a training) while still exposing name + team.

### Backend file map
- `schema.ts` — all Keystone list definitions (fields + access).
- `access.ts` — every access-control filter/helper described above; the single place to look when access seems wrong.
- `customSchema.ts` — hand-written GraphQL mutations merged onto the generated schema (PPTX export, manual upload).
- `lib/drawingSvg.ts`, `lib/renderDrawingPng.ts` — render a training exercise's whiteboard drawing (stored as JSON in `drawingData`) to SVG/PNG for embedding in exports.
- `lib/exportTrainingPptx.ts` — builds the PowerPoint export from a Training + its Exercises.
- `lib/manualUpload.ts` — stores/reads a team's trainer-manual PDF on disk (`backend/uploads/manuals/<teamId>.pdf`) and extracts its text for the training-suggestion feature.

### Frontend structure
- `App.tsx` — route table. `/` is the tile-based `Home` dashboard; module pages live under distinct paths (`/matchday`, `/spelers`, `/wedstrijden`, `/seizoen`, `/trainingen`, `/oefendatabank`); `/admin` is gated on `trainer.role === 'admin'` in the route itself (in addition to backend enforcement).
- `lib/TeamContext.tsx` — the auth/session context (`trainer`, `teamId`, `category`, `isAdmin`, `club`, `clubName`; `useHomeLabel()` gives the own-team label for match screens); populated from `lib/auth.ts`'s `getMe()`. Nearly every page reads `teamId`/`isAdmin` from here to scope its own queries client-side (mirroring, not replacing, the backend scoping).
- `lib/api.ts` — a single large GraphQL client module (~2000 lines): every query/mutation the frontend makes, plus CSV import/export and full-data backup/restore helpers. There is no codegen — GraphQL query strings are hand-written here, and many use raw string interpolation for `where` clauses (e.g. ``where: { id: { equals: "${id}" } }``) instead of GraphQL variables; this is an existing/inconsistent pattern in the file, not a template to copy for new IDs from untrusted input.
- `lib/teamConfig.ts` — the category → format table (U6 2v2 / 10 min quarters up to U13/U15/U17 11v11 / 25 min quarters) and per-category field positions; this drives period duration, field layout, and role labels throughout the app.
- `lib/jaarplan.ts`, `lib/trainingsschema.ts`, `lib/oefeningenbibliotheek.ts`, `lib/manualOefeningen.ts` — static/derived training-content helpers (season plan by week, training-structure templates, built-in exercise suggestions, and suggestions parsed from an uploaded team manual).
- `lib/claudePrompt.ts` — builds a copy-pasteable prompt for a trainer to run in their own Claude conversation to draft an exercise; there is no in-app LLM API call.
- `components/DrawingCanvas.tsx` — the whiteboard editor for sketching an exercise (produces the `drawingData` JSON consumed by `backend/lib/drawingSvg.ts`).
- Pages under `pages/` generally follow: load own-team-scoped data via `lib/api.ts` in a `useEffect`, hold it in local state, mutate via `lib/api.ts` calls followed by a re-`load()`. `SpelerBeheer.tsx` embeds `SpelerProfiel.tsx` as an in-page tab rather than a separate route.

### Deployment shape
Frontend builds to static files served behind IIS (`frontend/web.config` handles SPA rewriting and MIME types for `.mjs`/`.wasm`); backend runs standalone (`npm run start`) as the GraphQL API, reached by the built frontend via `VITE_API_URL`. `backend/keystone.ts` falls back to hardcoded dev defaults for `DATABASE_URL`/`SESSION_SECRET`/CORS origin when the corresponding env vars aren't set — real deployments must set these explicitly.
