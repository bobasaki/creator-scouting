# Product Requirements Document (PRD)
## Project: Creator Catalog & Scouting Platform

### 1. Purpose
The product maintains a continuously refreshed catalog of YouTube channels for influencer
scouting. Instead of asking users to create one discovery run at a time, the system spends
available YouTube quota in the background to discover, refresh, and enrich channels so users
can filter the catalog instantly when they need creators for a campaign.

This tool is designed to support influencer scouting for marketing campaigns.

---

### 2. Problem Statement
Manual YouTube scouting is:
- time-consuming
- inconsistent
- hard to reproduce
- biased by search results and personal judgment

Run-by-run discovery is also inefficient because it:
- repeats the same YouTube searches for different users
- delays users while scans execute
- spends quota on one-off requests instead of building durable coverage
- makes cross-campaign reuse of known channels harder

Existing tools either:
- lack sufficient filtering, or
- do not provide transparent ranking logic, or
- do not expose freshness and source confidence for the data shown

---

### 3. Goals
- Continuously discover YouTube channels while quota is available
- Build and maintain a central channel catalog that users can filter instantly
- Refresh channel metrics and enrichment data based on freshness rules
- Let users filter channels by country, language, size, activity, performance, category, type,
  and contact availability
- Expose transparent scoring, freshness, and provenance for each channel
- Support saved user segments instead of forcing repeated manual runs

---

### 4. Non-Goals
- No automatic creator outreach
- No messaging or email sending
- No contract or payment handling
- No content downloading
- No social media platforms other than YouTube for the first catalog release
- No claim that the system covers all of YouTube

---

### 5. Target User
Primary users:
- Influencer / performance marketer
- Agency scout
- Campaign manager

User skill level:
- Non-technical
- Comfortable reviewing tables, filters, and ranked results

---

### 6. Product Model

#### 6.1 Continuous Catalog
The system must maintain a durable catalog of channels discovered over time.

Users should query stored channel data, not trigger YouTube discovery as the primary workflow.

The catalog must store:
- stable channel identity
- latest filterable metrics
- inferred metadata
- refresh timestamps
- enrichment output
- contact signals

#### 6.2 Background Ingestion
The system must use background workers to:
- discover new channels
- refresh metrics for known channels
- enrich channels with inferred metadata only when needed

Quota must be budgeted across those jobs, with refresh prioritized over repeated discovery of
already known channels.

#### 6.3 Catalog Filtering
Users must be able to filter the catalog by:
- inferred country
- language
- subscriber count
- average recent views
- minimum recent views
- engagement rate
- days since last upload
- estimated category
- estimated type
- email found
- freshness / staleness

Filtering must be fast enough to feel like querying a database, not starting a job.

#### 6.4 Channel Detail
Each channel detail view must expose:
- raw metrics
- score and score breakdown
- estimated category
- estimated type
- language and country signals
- contact email if found and where it was found
- scanned video sample
- freshness metadata

#### 6.5 Saved Segments
Users must be able to save filters as reusable segments for repeated scouting needs.

Segments replace user-facing runs as the main workflow object.

#### 6.6 Internal Scans
The system may still support internal or admin-triggered scans for:
- backfilling under-covered niches
- debugging discovery quality
- forcing refresh or enrichment on stale data

These are operational tools, not the primary user experience.

---

### 7. Data Requirements
For each channel, the system should aim to store:
- Channel ID
- Channel name
- Channel URL
- Subscriber count
- Recent video metrics
- Average views over the last N videos
- Minimum views over the last N videos
- Engagement rate over the last N videos
- Last upload date
- Estimated category
- Estimated type
- Detected language
- Inferred country
- Contact email if found
- Whether the email came from the bio or a video description
- First seen, last seen, and last refreshed timestamps

Country is an inferred field, not a guaranteed YouTube-native truth field.

---

### 8. Constraints
- YouTube API quota limits apply
- Quota must be budgeted across discovery, refresh, and enrichment
- The system must avoid repeatedly scanning already known channels unless data is stale
- Country inference is probabilistic and should carry confidence
- The system must fail gracefully when quota is exhausted
- The catalog must surface freshness so users can judge stale results

---

### 9. Success Metrics
- Filtered catalog results return fast enough for interactive use
- Freshness targets are met for the highest-priority channels
- Coverage grows over time across countries, languages, and topics
- Users can find campaign-fit creators without waiting for an ad hoc run
- Human reviewers accept a high share of top-ranked channels
- Zero API key leaks

---

### 10. Migration Strategy
- Keep the current run pipeline temporarily as an ingestion path
- Start writing discovered and enriched channels into a canonical catalog
- Move the UI primary flow from "create run" to "filter catalog"
- Keep runs only as internal jobs until the catalog has enough coverage

---

### 11. Future Extensions
- Multi-platform scouting (TikTok, Instagram)
- Better country inference and confidence scoring
- Trend detection and growth-rate analysis
- Outreach automation
- Campaign feedback loops into ranking
