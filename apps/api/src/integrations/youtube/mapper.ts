import { ChannelMetrics } from "../../domain/types";

export function mapYoutubeToChannelMetrics(input: {
  channelId: string;
  channelName: string;
  channelUrl: string;
  subscriberCount: number;
  recentViews: number[];
  daysSinceLastUpload: number;
}): ChannelMetrics {
  const views = input.recentViews ?? [];
  const avgViewsLastN =
    views.length > 0
      ? Math.round(views.reduce((a, b) => a + b, 0) / views.length)
      : 0;

  return {
    channelId: input.channelId,
    channelName: input.channelName,
    channelUrl: input.channelUrl,
    subscriberCount: input.subscriberCount,
    avgViewsLastN,
    daysSinceLastUpload: input.daysSinceLastUpload,
    recentViews: views
  };
}