# Product Requirements Document (PRD)
## Project: Creator Scouting & Ranking System

### 1. Purpose
The purpose of this application is to automatically discover, filter, and rank YouTube creators
based on configurable criteria, so that a human can quickly review a high-quality shortlist
instead of manually searching YouTube.

This tool is designed to support influencer scouting for marketing campaigns.

---

### 2. Problem Statement
Manual YouTube scouting is:
- time-consuming
- inconsistent
- hard to reproduce
- biased by search results and personal judgment

Existing tools either:
- lack sufficient filtering, or
- do not provide transparent ranking logic

---

### 3. Goals (What the app MUST do)
- Discover YouTube channels by:
  - keywords
  - region
  - language
- Collect recent performance data for each channel
- Filter out creators that do not meet minimum criteria
- Rank remaining creators using a transparent scoring system
- Output results in a format ready for human review

---

### 4. Non-Goals (What the app will NOT do)
- No automatic creator outreach
- No messaging or email sending
- No contract or payment handling
- No content downloading
- No social media platforms other than YouTube (for MVP)

---

### 5. Target User
Primary user:
- Influencer / performance marketer
- Agency scout
- Campaign manager

User skill level:
- Non-technical
- Comfortable reviewing tables and rankings

---

### 6. Core Features

#### 6.1 Channel Discovery
The system must be able to:
- Search YouTube using keywords
- Restrict results by:
  - region (country)
  - language
- Collect a list of candidate channels

---

#### 6.2 Data Collection
For each channel, the system must collect:
- Channel ID
- Channel name
- Channel URL
- Subscriber count
- Last upload date
- Views for the last N videos (configurable, default 5–10)
- Average views over the last N videos

---

#### 6.3 Filtering Rules
The system must allow configurable filters, including:
- Minimum average views
- Maximum days since last upload
- Minimum subscriber count (optional)
- Required keywords or niches

Channels failing any required filter must be excluded.

---

#### 6.4 Ranking & Scoring
Remaining channels must be ranked using a scoring system defined in `SCORING.md`.

Scores must be:
- deterministic
- explainable
- reproducible

---

#### 6.5 Output
The system must output:
- A ranked list of creators
- Raw metrics per creator
- Final score per creator

Output formats (MVP):
- JSON
- CSV (for spreadsheet review)

---

### 7. Constraints
- YouTube API quota limits apply
- Default max:
  - 1000 channels per run
  - 2 runs per day
- System must fail gracefully when quota is exceeded

---

### 8. Success Metrics
- Time to produce a shortlist < 5 minutes
- At least 70–80% of top-ranked creators accepted by human reviewer
- Zero API key leaks
- Fully reproducible runs

---

### 9. Future Extensions (Out of Scope for MVP)
- Multi-platform scouting (TikTok, Instagram)
- ML-based scoring
- Outreach automation
- Campaign performance feedback loops