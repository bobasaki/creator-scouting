export interface ChannelMetrics {
  channelId: string;
  channelName: string;
  channelUrl: string;

  subscriberCount: number;
  avgViewsLastN: number;
  daysSinceLastUpload: number;

  recentViews: number[]; // used for consistency
}

export interface FilterParams {
  minAvgViews?: number;
  maxDaysSinceUpload?: number;
  minSubscribers?: number;
}

export interface ScoreBreakdown {
  activityScore: number;
  performanceScore: number;
  consistencyScore: number;
  audienceSizeScore: number;
  nicheRelevanceScore: number;
}

export interface ScoredChannel {
  metrics: ChannelMetrics;
  scores: ScoreBreakdown;
  finalScore: number;
}