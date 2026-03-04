# Creator Scouting

Creator Scouting is a YouTube creator discovery system that is evolving from a run-based tool
into a continuously refreshed channel catalog.

The target product model is:
- background workers discover and refresh channels while quota is available
- the app stores channels, metrics, enrichment, and contact signals in a central catalog
- users filter the catalog instantly instead of launching one-off discovery runs

The current codebase still contains run-oriented flows during migration, but the product and
architecture docs now describe the catalog-first direction.

## Repo Layout

- `apps/api`: Fastify API
- `apps/ui`: Next.js UI
- `docs`: product, API, scoring, and architecture docs

## Docs

- [docs/PRD.md](/Users/ivanbobas/Projects/creator-scouting/docs/PRD.md): product direction and user workflow
- [docs/API.md](/Users/ivanbobas/Projects/creator-scouting/docs/API.md): target API surface for the catalog model
- [docs/ARCHITECTURE.md](/Users/ivanbobas/Projects/creator-scouting/docs/ARCHITECTURE.md): data model, workers, quota policy, migration path
- [docs/IMPLEMENTATION_PLAN.md](/Users/ivanbobas/Projects/creator-scouting/docs/IMPLEMENTATION_PLAN.md): phased migration checklist from runs to the catalog model
- [docs/SCORING.md](/Users/ivanbobas/Projects/creator-scouting/docs/SCORING.md): ranking logic for stored channel snapshots

## Deployment Shape

The default web setup is:
- the browser talks only to the UI origin
- the UI proxies `/backend/:path*` to the API
- the UI server decides the API address with `BACKEND_URL`

That works the same on localhost, on a LAN, and on a deployed server.

## Environment Files

Use the app-specific examples:

- [apps/api/.env.example](/Users/ivanbobas/Projects/creator-scouting/apps/api/.env.example)
- [apps/ui/.env.example](/Users/ivanbobas/Projects/creator-scouting/apps/ui/.env.example)

The root [.env.example](/Users/ivanbobas/Projects/creator-scouting/.env.example) is only a
reference sheet.

## Local Development

1. Copy the example env files into place:
   `apps/api/.env.example` -> `apps/api/.env`
   `apps/ui/.env.example` -> `apps/ui/.env.local`
2. Start the API:
   `cd apps/api && npm run dev`
3. Start the UI:
   `cd apps/ui && npm run dev`
4. Open [http://localhost:3001](http://localhost:3001)

## Current State

Today, the implementation still exposes run-based behavior in parts of the app. The intended
direction is:
- canonical channel catalog
- saved user segments instead of repeated runs
- background discovery, refresh, and enrichment
- admin-only forced scans for backfill and debugging

By default, the legacy runs UI is now hidden from normal navigation. Re-enable it only for
internal use with `NEXT_PUBLIC_ENABLE_RUNS_UI=true` in
[apps/ui/.env.example](/Users/ivanbobas/Projects/creator-scouting/apps/ui/.env.example).

The legacy `/runs` API is also internal-only by default. Public access stays off unless you set
`RUNS_API_PUBLIC_ENABLED=true` in
[apps/api/.env.example](/Users/ivanbobas/Projects/creator-scouting/apps/api/.env.example), and
private internal tooling can use `RUNS_API_INTERNAL_TOKEN` when needed.

If you are making product or architecture decisions, use the docs in `docs/` as the source of
truth for the target system shape.
