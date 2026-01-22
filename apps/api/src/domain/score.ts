import {
  ChannelMetrics,
  ScoreBreakdown,
  ScoredChannel
} from "./types";

// ---------- Helpers ----------

function activityScore(daysSinceUpload: number): number {
  if (daysSinceUpload <= 7) return 25;
  if (daysSinceUpload <= 14) return 20;
  if (daysSinceUpload <= 30) return 10;
  return 0;
}

function performanceScore(avgViews: number): number {
  if (avgViews >= 50000) return 30;
  if (avgViews >= 20000) return 22;
  if (avgViews >= 10000) return 15;
  if (avgViews >= 5000) return 8;
  return 0;
}

function consistencyScore(recentViews: number[]): number {
  if (recentViews.length < 2) return 0;

  const avg =
    recentViews.reduce((a, b) => a + b, 0) / recentViews.length;

  const variance =
    recentViews.reduce(
      (sum, v) => sum + Math.pow(v - avg, 2),
      0
    ) / recentViews.length;

  if (variance < avg * avg * 0.1) return 20;
  if (variance < avg * avg * 0.25) return 12;
  return 5;
}

function audienceSizeScore(subscribers: number): number {
  if (subscribers >= 500000) return 15;
  if (subscribers >= 100000) return 10;
  if (subscribers >= 50000) return 6;
  return 2;
}

// Placeholder until niche logic or LLM enrichment
function nicheRelevanceScore(): number {
  return 5;
}

// ---------- Public API ----------

export function scoreChannel(
  metrics: ChannelMetrics
): ScoredChannel {
  const scores: ScoreBreakdown = {
    activityScore: activityScore(metrics.daysSinceLastUpload),
    performanceScore: performanceScore(metrics.avgViewsLastN),
    consistencyScore: consistencyScore(metrics.recentViews),
    audienceSizeScore: audienceSizeScore(metrics.subscriberCount),
    nicheRelevanceScore: nicheRelevanceScore()
  };

  const finalScore =
    scores.activityScore +
    scores.performanceScore +
    scores.consistencyScore +
    scores.audienceSizeScore +
    scores.nicheRelevanceScore;

  return {
    metrics,
    scores,
    finalScore
  };
}