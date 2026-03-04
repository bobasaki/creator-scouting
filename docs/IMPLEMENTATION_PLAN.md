# Implementation Plan

## Purpose
This document turns the catalog-first architecture into a phased implementation checklist.

The goal is to migrate from the current run-oriented system to a continuously refreshed channel
catalog without breaking the existing product during the transition.

Last updated: March 1, 2026

---

## Guiding Rules
- Keep the existing run flow working until the catalog is good enough to replace it
- Prefer dual-write and side-by-side validation over big-bang cutovers
- Build the read model early so the UI can move to the catalog before runs are removed
- Treat quota budgeting and freshness as core infrastructure, not later cleanup
- Keep admin-only backfill and force-refresh tools available throughout migration

---

## Phase 0: Baseline And Migration Guardrails

### Goal
Create enough structure to migrate safely without losing current behavior.

### Checklist
- [x] Define the canonical catalog entities to implement first
- [x] Decide whether the migration stays on SQLite temporarily or moves to Postgres first
- [x] Add a clear status label in docs for `current state` vs `target state`
- [x] Identify the current run pipeline outputs that must dual-write into catalog tables
- [ ] Add feature flags for catalog read paths and catalog write paths
- [x] Define the freshness fields and naming conventions once
- [x] Define the quota accounting model once

### Exit Criteria
- There is a single agreed schema direction
- Dual-write is planned before any UI cutover
- New work is aligned to catalog terms, not ad hoc run terms

---

## Phase 1: Catalog Schema And Dual-Write

### Goal
Create the first canonical catalog tables and populate them from the existing run pipeline.

### Checklist
- [x] Add a `channels` table as the main read model
- [x] Add a `channel_video_samples` table for recent scanned videos
- [x] Add a `channel_discovery_events` table
- [x] Add a `saved_segments` table placeholder, even if the UI does not use it yet
- [x] Add the timestamps needed for freshness:
  `first_seen_at`, `last_seen_at`, `last_metrics_refresh_at`, `last_content_refresh_at`,
  `last_enriched_at`
- [x] Add enrichment fields directly to the catalog read model:
  `estimated_category`, `estimated_type`, `language_detected`, `country_inferred`,
  `contact_email`, `contact_email_source`
- [x] Update the current run execution path so completed scans write to the catalog tables
- [x] Make writes idempotent for repeated discovery of the same channel
- [x] Preserve provenance from the originating run/search inputs

### Exit Criteria
- Running the current system produces catalog records
- Known channels stop existing only inside run results
- The catalog contains enough fields to support a future `/channels` API

---

## Phase 2: Job Queue, Seeds, And Quota Ledger

### Goal
Introduce durable background execution primitives for continuous scanning.

### Checklist
- [x] Add a durable `jobs` table or queue mechanism
- [x] Add a `discovery_seeds` table
- [x] Add a `quota_ledger` table
- [x] Define job types:
  `discover`, `refresh_metrics`, `enrich`, `force_refresh`, `force_enrich`
- [x] Add locking / claim semantics so multiple workers cannot process the same job incorrectly
- [x] Define per-day quota budget fields and reserve logic
- [x] Add seed priority and seed yield tracking
- [x] Add retry rules and dead-letter behavior for failed jobs

### Exit Criteria
- Work can be scheduled without user-triggered runs
- Quota can be tracked explicitly
- Discovery and refresh no longer depend on manual API calls to happen

---

## Phase 3: Continuous Discovery And Refresh Workers

### Goal
Turn the catalog from passive storage into a living dataset.

### Checklist
- [x] Implement the `discover` worker loop
- [x] Implement the `refresh_metrics` worker loop
- [x] Implement the `enrich` worker loop
- [x] Use search seeds for discovery rather than user requests
- [x] Batch channel/video refresh calls wherever YouTube allows it
- [x] Recompute the filterable metrics on refresh:
  `min_views_last_n`, `avg_views_last_n`, `engagement_rate_last_n`,
  `days_since_last_upload`
- [x] Re-enrich only when content changed or enrichment is stale
- [x] Add a `content_fingerprint` or equivalent change detector
- [x] Persist scanned video samples and contact-email traces on refresh

### Exit Criteria
- The catalog grows without manual runs
- Known channels get refreshed on schedule
- Enrichment becomes incremental instead of always tied to a run

---

## Phase 4: Catalog Read API

### Goal
Expose the catalog as the main read surface for the UI.

### Checklist
- [x] Add `GET /channels`
- [x] Add filtering for country, language, size, views, engagement, freshness, category, type,
  and email presence
- [x] Add sorting for final score, subscribers, avg views, last post recency, and freshness
- [x] Add pagination
- [x] Add `GET /channels/:channelId`
- [x] Add freshness metadata to responses
- [x] Add country confidence and language confidence where available
- [x] Add response shapes for scanned video samples and contact source traceability
- [x] Keep `/runs` available during migration, but treat it as legacy/internal

### Exit Criteria
- The UI can read everything it needs from catalog endpoints
- Users no longer need run results to inspect channels

---

## Phase 5: UI Migration To Catalog And Saved Segments

### Goal
Move the user-facing workflow from run creation to catalog filtering.

### Checklist
- [x] Add a primary `Channels` page
- [x] Build the filter sidebar around catalog fields
- [x] Add channel detail pages backed by `/channels/:channelId`
- [x] Expose freshness in the list and detail views
- [x] Add saveable segments
- [x] Add segment list, create, update, and delete flows
- [x] Hide or demote run creation from the main navigation
- [x] Keep a way for admins to trigger targeted scans separately from user filtering

### Exit Criteria
- A normal user can accomplish scouting without creating a run
- Saved segments replace repeated manual search setup

---

## Phase 6: Admin Operations And Coverage Tooling

### Goal
Make the catalog operable as a long-running system.

### Checklist
- [x] Add quota dashboard
- [x] Add coverage dashboard by country, language, and category
- [x] Add stale-channel dashboard
- [x] Add worker health and queue status views
- [x] Add admin actions for force refresh, force enrich, and targeted discovery
- [x] Add seed performance reporting
- [x] Add alerts or logs for quota exhaustion and stuck workers

### Exit Criteria
- Operators can understand whether the catalog is healthy
- Under-covered areas can be intentionally backfilled

---

## Phase 7: Cutover And Run Decommissioning

### Goal
Make the catalog the primary system and shrink the run flow to an internal tool or remove it.

### Checklist
- [ ] Confirm the catalog has enough coverage for key countries/languages/niches
- [ ] Confirm freshness SLAs are being met for top-priority channels
- [ ] Confirm the channel UI is stable and complete
- [x] Switch the default landing page and navigation to catalog-first
- [x] Restrict run creation to admins or internal tooling
- [ ] Decide whether runs remain as a debug tool or are fully removed
- [x] Remove now-obsolete run-only code paths after the catalog proves out

### Exit Criteria
- The main product no longer depends on user-created runs
- Runs are either internal-only or removed

---

## Suggested Order Of Implementation
1. Phase 0
2. Phase 1
3. Phase 2
4. Phase 3
5. Phase 4
6. Phase 5
7. Phase 6
8. Phase 7

---

## First Practical Slice
If implementation starts immediately, the smallest useful slice is:
- build `channels` and `channel_video_samples`
- dual-write from the existing run pipeline
- add `GET /channels`
- build a basic channels list page

That gives the product a real catalog read path before the full worker system is finished.
