import { ChannelMetrics, FilterParams } from "./types";

export function passesFilters(
  channel: ChannelMetrics,
  filters: FilterParams
): boolean {
  if (
    filters.minAvgViews !== undefined &&
    channel.avgViewsLastN < filters.minAvgViews
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