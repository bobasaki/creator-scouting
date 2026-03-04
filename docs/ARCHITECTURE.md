# Catalog Architecture

## 1. Overview
The target system is a continuously refreshed channel catalog, not a user-triggered run engine.
Background workers spend YouTube quota to discover channels, refresh known channels, and enrich
metadata. The application UI reads from stored catalog tables and lets users filter instantly.

Core principle:
- Discover once
- Refresh many times
- Re-enrich only when needed

---

## 2. Core Entities

### 2.1 channels
Primary read model for the app.

Recommended fields:
- channel_id
- channel_name
- channel_url
- subscriber_count
- min_views_last_n
- avg_views_last_n
- engagement_rate_last_n
- days_since_last_upload
- last_video_published_at
- language_detected
- language_confidence
- country_inferred
- country_confidence
- estimated_category
- estimated_type
- contact_email
- contact_email_source
- score_final
- score_breakdown_json
- first_seen_at
- last_seen_at
- last_metrics_refresh_at
- last_content_refresh_at
- last_enriched_at
- content_fingerprint
- status

This table should be denormalized enough to power the main filter UI efficiently.

### 2.2 channel_video_samples
Stores a rolling sample of recent scanned videos for each channel.

Recommended fields:
- channel_id
- video_id
- title
- description
- published_at
- views
- likes
- comments
- email_found
- email_source

Keep this table small and recent. It exists to support UI detail, scoring inputs, and contact
traceability, not full historical warehousing.

### 2.3 channel_discovery_events
Audit trail for how channels entered the catalog.

Recommended fields:
- channel_id
- discovered_at
- seed_country
- seed_language
- seed_topic
- discovery_source
- new_channel

### 2.4 discovery_seeds
Configurable search plan for discovery workers.

Recommended fields:
- id
- country
- language
- seed_topic
- active
- priority
- last_run_at
- last_yield
- channels_found
- new_channels_found

### 2.5 quota_ledger
Tracks daily budget consumption.

Recommended fields:
- day
- budget_units
- used_units
- reserved_units
- discovery_units
- refresh_units
- enrichment_units

### 2.6 jobs
Durable worker queue for catalog maintenance.

Recommended fields:
- id
- job_type
- target_id
- priority
- scheduled_for
- locked_at
- attempts
- status
- last_error

### 2.7 saved_segments
Stores user-saved filters.

Recommended fields:
- id
- user_id
- name
- filters_json
- sort_json
- created_at
- last_used_at

---

## 3. Worker Loops

### 3.1 discover
Purpose:
- find new channel IDs from controlled search seeds

Rules:
- rotate across country x language x topic seeds
- stop once the seed budget is consumed
- write new channels into the catalog
- record discovery provenance
- do not keep re-running the same high-duplicate seed at the same priority forever

### 3.2 refresh_metrics
Purpose:
- refresh metrics for known channels

Rules:
- prioritize active and high-value channels
- batch requests wherever the API allows it
- compute the filterable fields the UI needs
- avoid rediscovery when a refresh is enough

### 3.3 enrich
Purpose:
- infer category, type, language, country hints, fit summary, and other metadata

Rules:
- run only if enrichment is missing, stale, or content changed
- reuse cached YouTube context whenever possible
- store enough raw context to explain the result

---

## 4. Freshness Model
Not all channels should refresh on the same schedule.

Example policy:
- highly active or highly viewed channels: every 1-3 days
- medium-priority channels: every 7 days
- low-priority or dormant channels: every 30 days

User-facing records should expose:
- last_metrics_refresh_at
- last_enriched_at
- last_seen_at

The UI should never hide staleness.

---

## 5. Quota Policy
Quota should be managed by an explicit scheduler, not implicitly by user traffic.

Recommended daily split:
- 60% refresh
- 25% discovery
- 15% enrichment / backfill

Rules:
- keep a reserve so quota is not fully exhausted early
- discovery should be downranked when it mostly returns duplicates
- refresh wins over discovery when a known channel is going stale
- forced admin jobs must still respect quota guards unless manually overridden

---

## 6. Discovery Strategy
The catalog is only as good as the seeds used to find channels.

Recommended approach:
- maintain a seed matrix by country, language, and topic
- score each seed by yield of new usable channels
- increase priority for under-covered locales even when short-term yield is lower
- reduce priority for saturated seeds that mostly produce duplicates

Important:
- this system will not cover all of YouTube
- it should expose coverage and freshness honestly

---

## 7. Country And Language
Language is usually easier than country.

Country should be treated as:
- inferred
- confidence-scored
- explainable

Potential signals:
- channel bio
- detected language
- recent video titles and descriptions
- search seed provenance

The catalog should store both the inferred value and a confidence score.

---

## 8. Scoring In This Model
Scoring happens over the latest stored snapshot for a channel.

This means:
- users should not need to launch a new run to get a score
- score recalculation can happen on refresh
- filters should operate on stored fields before sorting by score

`SCORING.md` defines the ranking logic. This document defines how the data feeding that logic is
kept fresh.

---

## 9. UI Model
Primary UI:
- Channels page with filters and sorting
- Channel detail page
- Saved segments

Operational UI:
- quota dashboard
- coverage dashboard
- stale channel dashboard
- worker health and queue status

Runs can remain as an internal ingestion/debug tool during migration.

---

## 10. Migration Path
Recommended migration:
1. Keep the current run pipeline alive
2. Write discovered channels and enrichment into canonical catalog tables
3. Build the user UI on top of catalog filtering
4. Retain runs only for admin/debug workflows
5. Remove run-first user flows once coverage is strong enough
