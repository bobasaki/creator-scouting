# Scoring & Ranking Specification

### Purpose
This document defines how YouTube channels in the catalog are scored and ranked.
The goal is to surface creators who are:
- active
- consistently performing
- relevant to the niche

---

## 1. Scoring Philosophy
- Scores must be explainable
- No black-box ML for MVP
- All weights must be configurable
- Final score range: 0–100

---

## 2. Base Metrics
For each stored channel snapshot, the following metrics are calculated:

- avg_views_last_n
- days_since_last_upload
- subscriber_count
- consistency_score (variation between recent videos)
- niche_match_score

---

## 3. Individual Score Components

### 3.1 Activity Score (0–25 points)
Based on days since last upload.

Example:
- 0–7 days → 25 points
- 8–14 days → 20 points
- 15–30 days → 10 points
- >30 days → 0 points

---

### 3.2 Performance Score (0–30 points)
Based on average views over the last N videos.

Normalized relative to:
- minimum acceptable views
- high-performing benchmark

---

### 3.3 Consistency Score (0–20 points)
Measures how stable recent performance is.

- Low variance between videos → higher score
- High variance → lower score

This prevents ranking creators with one viral spike too highly.

---

### 3.4 Audience Size Score (0–15 points)
Based on subscriber count.

Used as a soft signal only.
High subscribers ≠ high performance.

---

### 3.5 Niche Relevance Score (0–10 points)
Based on:
- keyword matches in:
  - channel title
  - description
  - recent video titles

---

## 4. Final Score Formula
final_score =
activity_score +
performance_score +
consistency_score +
audience_size_score +
niche_relevance_score

Max score: 100

---

## 5. Filtering vs Scoring
Important rule:
- **Filtering happens BEFORE scoring**
- Inactive or underperforming channels never receive a score

In the catalog model, filtering is performed on stored channel fields and the latest snapshot is
then scored and sorted for presentation.

---

## 6. Tunability
All thresholds and weights must be configurable:
- via config, admin controls, or saved segment filters
- without code changes

---

## 7. Transparency Requirement
For each scored channel, the system must expose:
- each sub-score
- final score
- reason for exclusion (if filtered out)
