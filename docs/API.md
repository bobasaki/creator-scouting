# API Specification (MVP)

Base URL:
/api

This API supports automated YouTube creator scouting runs. It is designed for deterministic,
reproducible execution and internal use during the MVP phase.

====================================================================

1. POST /runs

Purpose:
Start a new scouting run. This endpoint triggers channel discovery, data collection,
filtering, scoring, and result persistence.

Request Body (example):
{
  "keywords": ["true crime", "mystery", "unsolved"],
  "region": "DE",
  "language": "de",
  "min_avg_views": 8000,
  "max_days_since_upload": 30,
  "min_subscribers": 0,
  "videos_to_analyze": 5,
  "max_channels": 1000
}

Request Parameters:
- keywords (string[])
  Search terms used to discover relevant channels.
- region (string, ISO country code)
  Geographic bias for discovery.
- language (string, ISO language code)
  Language bias for discovery.
- min_avg_views (number)
  Minimum average views over the last N videos.
- max_days_since_upload (number)
  Maximum allowed days since last upload.
- min_subscribers (number, optional)
  Optional soft audience size filter.
- videos_to_analyze (number)
  Number of recent videos analyzed.
- max_channels (number)
  Hard cap to protect YouTube API quotas.

Response:
{
  "run_id": "uuid",
  "status": "completed"
}

====================================================================

2. GET /runs/{run_id}

Purpose:
Retrieve full results of a completed scouting run.

Response:
{
  "run_id": "uuid",
  "created_at": "2026-01-21T10:00:00Z",
  "parameters": {
    "keywords": ["true crime", "mystery"],
    "region": "DE",
    "language": "de"
  },
  "results": [
    {
      "channel_id": "UCxxxx",
      "channel_name": "Example Channel",
      "channel_url": "https://youtube.com/channel/UCxxxx",
      "metrics": {
        "subscriber_count": 120000,
        "avg_views_last_n": 15400,
        "days_since_last_upload": 4
      },
      "scores": {
        "activity_score": 25,
        "performance_score": 22,
        "consistency_score": 18,
        "audience_size_score": 10,
        "niche_relevance_score": 8
      },
      "final_score": 83
    }
  ]
}

====================================================================

3. GET /runs/{run_id}/export

Purpose:
Export run results for human review.

Query Parameters:
- format=csv
- format=json

Response:
File download containing channel identifiers, raw metrics, sub-scores, and final scores.

====================================================================

4. Error Handling

All errors follow a consistent structure:
{
  "error": "Quota exceeded",
  "code": "YOUTUBE_QUOTA_LIMIT"
}

====================================================================

5. Authentication (MVP)

No authentication is required.
The API is assumed to be internal and environment-protected.

====================================================================

6. Rate Limiting & Safety

- Hard limits enforced per run
- Quota exhaustion must fail gracefully
- Partial results may be returned if available
- No retries that risk runaway quota usage

====================================================================

7. Design Principles

- Deterministic outputs
- Reproducible runs
- Transparent scoring
- Human-review-first design
- No mandatory LLM dependency at API level