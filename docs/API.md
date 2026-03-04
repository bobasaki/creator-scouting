# API Specification (Catalog Target State)

Base URL:
/api

This API is designed for a continuously refreshed YouTube channel catalog. Users query stored
channel data. Background workers and internal tools handle discovery, refresh, and enrichment.

`/runs` may continue to exist during migration, but it is a legacy/internal surface rather than
the primary product workflow. Public clients should use `/channels`. Legacy `/runs` access is
intended for private-network callers or explicitly authorized internal tooling.

====================================================================

1. GET /channels

Purpose:
Query the catalog of scanned channels using stored metrics and inferred metadata.

Typical Query Parameters:
- country
- min_country_confidence
- language
- min_language_confidence
- min_subscribers
- min_avg_views
- min_engagement_rate
- max_days_since_upload
- estimated_category
- estimated_type
- email_found
- sort
- sort_dir
- page
- per_page

Example:
GET /channels?country=IT&language=it&min_avg_views=10000&estimated_category=Travel&email_found=true

Response (example):
{
  "page": 1,
  "per_page": 25,
  "total": 128,
  "results": [
    {
      "channel_id": "UCxxxx",
      "channel_name": "Example Channel",
      "channel_url": "https://youtube.com/channel/UCxxxx",
      "metrics": {
        "subscriber_count": 120000,
        "min_views_last_n": 9200,
        "avg_views_last_n": 15400,
        "engagement_rate_last_n": 3.8,
        "days_since_last_upload": 4
      },
      "enrichment": {
        "estimated_category": "Travel",
        "estimated_type": "Male",
        "language_code": "it",
        "language_detected": "Italian",
        "language_confidence": "high",
        "country_inferred": "IT",
        "country_confidence": "medium"
      },
      "contact": {
        "email": "hello@example.com",
        "source": "bio"
      },
      "freshness": {
        "last_metrics_refresh_at": "2026-03-01T09:00:00Z",
        "last_enriched_at": "2026-02-26T11:00:00Z"
      },
      "score": {
        "final_score": 83
      }
    }
  ]
}

====================================================================

2. GET /channels/{channel_id}

Purpose:
Retrieve full stored detail for a single channel.

Response should include:
- channel identity
- latest metrics snapshot
- score breakdown
- estimated category and type
- language and country inference
- contact email and source
- scanned video sample
- freshness and provenance metadata

====================================================================

3. GET /segments

Purpose:
List saved user segments.

Response:
[
  {
    "id": "seg_123",
    "name": "Italian travel creators",
    "filters": {
      "country": "IT",
      "language": "it",
      "estimated_category": "Travel",
      "min_avg_views": 10000
    },
    "created_at": "2026-03-01T10:00:00Z",
    "last_used_at": "2026-03-01T10:05:00Z"
  }
]

====================================================================

4. POST /segments

Purpose:
Create a saved filter preset.

Request Body (example):
{
  "name": "German fitness channels",
  "filters": {
    "country": "DE",
    "language": "de",
    "estimated_category": "Fitness",
    "min_avg_views": 15000,
    "email_found": true
  }
}

Response:
{
  "id": "seg_456",
  "status": "created"
}

====================================================================

5. PATCH /segments/{segment_id}

Purpose:
Update the name or filters of a saved segment.

====================================================================

6. DELETE /segments/{segment_id}

Purpose:
Delete a saved segment.

====================================================================

7. POST /segments/{segment_id}/use

Purpose:
Mark a segment as used so the UI can sort and display recent segment activity.

====================================================================

8. Internal/Admin Endpoints

These endpoints are operational and not part of the main end-user workflow.

8.1 GET /admin/discovery/seeds
- Lists discovery seeds with their current priority, active flag, last outcome, and yield stats

8.2 POST /admin/discovery/seeds
- Creates a discovery seed using the same core filters as a run input

8.3 PATCH /admin/discovery/seeds/{seed_id}
- Updates a discovery seed's targeting, active flag, priority, or retry policy

8.4 POST /admin/discovery/bootstrap
- Creates queued `discover` jobs for active seeds for a given day
- Reserves quota up front and prevents duplicate seed/day jobs

8.5 POST /admin/refresh/bootstrap
- Creates queued `refresh_metrics` jobs for stale or explicitly selected catalog channels

8.6 POST /admin/enrich/bootstrap
- Creates queued `enrich` jobs for stale channels or channels missing enrichment fields
- `missing_only=true` also backfills missing inferred country/language codes and confidence

8.7 POST /admin/force-refresh
- Creates queued `force_refresh` jobs for explicitly selected channel IDs

8.8 POST /admin/force-enrich
- Creates queued `force_enrich` jobs for explicitly selected channel IDs

8.9 POST /admin/jobs/dispatch
- Claims queued jobs with lock semantics and executes them manually
- Manual dispatcher executes:
  - `discover` via the existing `/runs` path
  - `refresh_metrics` via direct catalog refresh
  - `enrich` via direct catalog enrichment
  - `force_refresh` and `force_enrich` if queued internally

8.10 POST /admin/discovery/start
- One-shot manual daily entry point
- Bootstraps discovery jobs and immediately dispatches them

8.11 GET /admin/jobs
- Lists queued, running, succeeded, failed, and dead-letter jobs

8.12 GET /admin/quota
- Returns current quota budget, used units, and reserved units

8.13 GET /admin/catalog/coverage
- Returns aggregate catalog coverage by inferred country, language, and estimated category

8.14 GET /admin/catalog/stale
- Returns stale refresh and stale enrichment candidate lists from the catalog

8.15 GET /admin/workers/health
- Returns queue totals, per-job-type status counts, stuck running jobs, and auto-scheduler config flags

====================================================================

8. Freshness Design

Every catalog response should expose freshness fields such as:
- first_seen_at
- last_seen_at
- last_metrics_refresh_at
- last_content_refresh_at
- last_enriched_at

Users are filtering a living catalog, so freshness is a first-class property of the API.

====================================================================

9. Error Handling

All errors should follow a consistent structure:
{
  "error": "Quota exceeded",
  "code": "YOUTUBE_QUOTA_LIMIT"
}

Possible error classes:
- invalid filters
- unsupported sort field
- quota exhausted for internal scan requests
- resource not found
- worker queue unavailable

====================================================================

10. Authentication

End-user catalog endpoints should require application authentication once the product leaves
internal-only usage.

Internal/admin endpoints should require stronger access controls than catalog read endpoints.

====================================================================

11. Design Principles

- Users query the database, not YouTube
- Discovery is continuous and quota-budgeted
- Refresh is prioritized over repeated rediscovery
- Enrichment is incremental and freshness-aware
- Scores must be explainable
- Country must be treated as inferred, not absolute truth
