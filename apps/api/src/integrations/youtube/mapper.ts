import { ChannelMetrics } from "../../domain/types";

export function mapYoutubeToChannelMetrics(input: {
  channelId: string;
  channelName: string;
  channelUrl: string;
  subscriberCount: number;
  recentViews: number[];
  recentLikes: number[];
  recentComments: number[];
  daysSinceLastUpload: number;
}): ChannelMetrics {
  const views = input.recentViews ?? [];
  const likes = input.recentLikes ?? [];
  const comments = input.recentComments ?? [];
  const minViewsLastN = views.length > 0 ? Math.min(...views) : 0;
  const avgViewsLastN =
    views.length > 0
      ? Math.round(views.reduce((a, b) => a + b, 0) / views.length)
      : 0;
  const totalViews = views.reduce((sum, value) => sum + value, 0);
  const totalEngagements = views.reduce((sum, _, index) => {
    return sum + (likes[index] ?? 0) + (comments[index] ?? 0);
  }, 0);
  const engagementRateLastN =
    totalViews > 0 ? Math.round((totalEngagements / totalViews) * 10_000) / 100 : 0;

  return {
    channelId: input.channelId,
    channelName: input.channelName,
    channelUrl: input.channelUrl,
    subscriberCount: input.subscriberCount,
    minViewsLastN,
    avgViewsLastN,
    engagementRateLastN,
    daysSinceLastUpload: input.daysSinceLastUpload,
    recentViews: views
  };
}
