import { ChannelMetrics, FilterParams } from "./types";

export function passesFilters(
  channel: ChannelMetrics,
  filters: FilterParams
): boolean {
  if (
    filters.minViews !== undefined &&
    channel.minViewsLastN < filters.minViews
  ) {
    return false;
  }

  if (
    filters.minAvgViews !== undefined &&
    channel.avgViewsLastN < filters.minAvgViews
  ) {
    return false;
  }

  if (
    filters.minEngagementRate !== undefined &&
    channel.engagementRateLastN < filters.minEngagementRate
  ) {
    return false;
  }

  if (
    filters.maxDaysSinceUpload !== undefined &&
    channel.daysSinceLastUpload > filters.maxDaysSinceUpload
  ) {
    return false;
  }

  if (
    filters.minSubscribers !== undefined &&
    channel.subscriberCount < filters.minSubscribers
  ) {
    return false;
  }

  return true;
}
