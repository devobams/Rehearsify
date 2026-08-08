# Contributing to Rehearsify

This document is the source of truth for how we work on this project. If something here 
conflicts with what's happening in the code, the code is probably wrong — fix it or raise 
it with the team, don't just work around it.

## Team

| Name | Primary modules |
|---|---|
| Michael Bamidele Ipadeola | Auth & Access, Repertoire, Reporting |
| John Ughiovhe Oshioriamhe | Scheduling, Planning |
| Okuo Iramofu John | Performance History, Recommendation |

"Primary" means first-pass owner and point of contact for that module — not the only 
person allowed to touch it.

## Branching

- `dev` is the default branch. All feature work branches off `dev` and PRs back into `dev`.
- `main` is protected — requires a PR and at least one approval. Only merges from `dev`, 
  and only when it's demo-ready.
- Never push directly to `main`.

```bash
git checkout dev
git pull origin dev
git checkout -b feature/short-description
```

## Local setup

```bash
git clone [Rehearsify-Repo-URL](https://github.com/devobams/Rehearsify)
git checkout dev
npm install
cp .env.example .env      # then set your own JWT_SECRET
docker-compose up -d
npx prisma migrate dev
npx prisma db seed
npm run db:test           # confirms DB connection is actually working
npm run dev
```

Each person runs their **own local Postgres** via Docker — schema is shared through 
committed migrations, but data is never shared between machines. Never assume your local data exists on a teammate's machine.

## Architecture rules (non-negotiable)

- **Modular monolith.** Every module in `src/modules/` follows the same four-file shape: 
  `*.routes.js`, `*.controller.js`, `*.service.js`, `*.model.js`.
- **A module only calls another module's exported `*.service.js` functions.** Never another module's `.model.js` or `.controller.js` directly.
- **Never create a new `PrismaClient()` anywhere.** Always import the single shared instance from `src/shared/db.js` — creating multiple instances exhausts the Postgres connection pool.
- **Inside `src/modules/`, only `*.model.js` files import `prisma`.** Other files in a module (service, controller, routes) go through the model layer, never around it.
- **Outside `src/modules/`** — seed files (`src/db/seeds/`), test setup, and one-off scripts — importing `prisma` directly from `shared/db.js` is fine, since there's no module boundary to preserve there. The connection-instance rule above still applies.
- **ESM only.** `import`/`export`, never `require()`.
- **Only `src/config/index.js` reads `process.env` directly.** Everything else imports 
  `config` from there.

## Database & migrations

- Never edit an already-applied migration file. If the schema needs to change, run 
  `npx prisma migrate dev --name <description>` to create a new one.
- **Any change to `schema.prisma` is a "tell the team first" change**, not a solo call — 
announce it before you push it, since everyone's local DB depends on the same migration 
  history staying in sync.
- Pull `dev` and run `npx prisma migrate dev` before starting work each day, so your local 
  schema doesn't drift from the team's.
- If your local DB gets into a broken/inconsistent state, `npx prisma migrate reset` wipes 
  and reseeds it cleanly — safe to use anytime, since it only affects your own local data.

## Seeding

- All seed files live in `src/db/seeds/`, one file per module (e.g. `songs.seed.js`).
- Each seed file **exports a named function** — it must NOT run itself on import.
- `src/db/seeds/index.js` is the one file that imports and runs every module's seed 
  function, in dependency order (referenced tables before referencing tables).
- **Every seed function must be idempotent** — check if a row exists (or use `upsert()` on 
  a unique field) before creating it. Running `npx prisma db seed` any number of times 
  should never create duplicates. See `eventTypes.seed.js` or `songs.seed.js` for the 
  pattern.
- Adding a new seed file? Add its import + call to `src/db/seeds/index.js` in the correct 
  dependency order, and mention it to the team.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/) style: <type>: <short description>

Types we use: `feat`, `fix`, `chore`, `docs`, `test`.

Examples:
- feat: add song CRUD endpoints with season/difficulty filters
- fix: apply createServiceSchema validation on service creation
- chore: formalize src/db/seeds/ orchestrator pattern
- test: add rotation-window edge cases for recommendation engine

Keep commits scoped and meaningful — one logical change per commit, not one giant commit 
at the end of the day.

## Pull requests

- PR into `dev`, not `main`.
- At least one teammate reviews before merging (per the Definition of Done below).
- If your PR changes something another module depends on (schema, a shared service 
  function's signature, middleware behavior), say so explicitly in the PR description — 
  don't make reviewers discover it.
- Keep PRs scoped to one module or one concern where possible — easier to review under 
  time pressure than one PR touching five things.

## Definition of Done (per endpoint/feature)

- [ ] Input validation (zod schema) where applicable
- [ ] Role guard (`requireAuth` / `requireRole`) applied where applicable
- [ ] At least one unit test: the primary success path, plus one edge case
- [ ] Error responses go through the shared error format (`shared/middleware/errorHandler.js`)
- [ ] Reviewed by at least one other teammate before merging to `dev`

## Known conventions & decisions log

Kept here so nobody has to re-derive *why* something is the way it is.

- **Prisma is pinned to v6** (`prisma@6`, `@prisma/client@6`), exact version, no `^`/`~` 
  ranges. Prisma 7 changes datasource config in a breaking way and isn't worth the churn 
  on this timeline. If `npm install` ever pulls v7, downgrade immediately.
- **Postgres runs on host port 5433**, not 5432, to avoid conflicting with a native 
  Postgres install on a team member's machine. Match this in your own `.env` if you also 
  have Postgres installed locally outside Docker.
- **Difficulty is a 1–5 integer** on `Song`, scored against one overall choir-skill 
  setting — not per-chorister or per-section (explicitly out of scope).
- **`Song.active`** doubles as the soft-delete flag (no separate `deletedAt` on Song). 
  **`Service.deletedAt`** is a separate, explicit soft-delete timestamp. These are 
  intentionally different patterns on different models — don't try to unify them.
- **Season values are a fixed set**: `ADVENT`, `CHRISTMAS`, `LENT`, `EASTER`, `PENTECOST`, 
  `ORDINARY`. These must match exactly between `Song.season` and `Service.season` for the 
  recommendation engine's season-matching to work — don't introduce new season strings 
  without updating both.
- **ID strategy is currently inconsistent**: `User`/`Song` use `uuid()`, `EventType`/
  `Service` use `cuid()`. Not yet resolved — flagged, not fixed. *(Update this note once 
  the team decides.)*
- **The "four decisions" for the recommendation engine** (scoring weights, difficulty-
  relative-to-what, fallback for too-few-eligible-songs, rotation override path) must be 
  locked as a team before Recommendation work begins in earnest. Document the answers 
  here once decided. *(Currently unfilled — update once Okuo's team session happens.)*

## Questions / issues
Use GitHub Issues for anything that needs tracking beyond a quick chat message — 
especially bugs found in someone else's module, or schema change proposals. Tag with the 
module name so it's easy to filter.

## UPDATES:
#### Sheet music — current limitations (documented, not blocking):

- One sheetUrl per song. Multi-arrangement support (e.g. SATB + descant) would need either sheetUrls String[] (simple, no metadata) or a SheetMusic model (proper CRUD, needs migration) — **deferred**, *not needed for MVP*.
- Duplicate-file detection on upload — deferred, needs content hash

*"Cross-module imports use two patterns inconsistently — some via module's index.js barrel (scheduling, planning), some direct to .service.js (repertoire, performance-history). Pick one convention post-capstone; both are functionally safe."