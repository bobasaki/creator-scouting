import { randomUUID } from "node:crypto";
import { buildChannelContentFingerprint } from "../domain/content-fingerprint";
import { passesFilters } from "../domain/filter";
import { scoreChannel } from "../domain/score";
import { getChannelDetails, getRecentVideos, searchChannelsByKeyword } from "../integrations/youtube/client";
import { mapYoutubeToChannelMetrics } from "../integrations/youtube/mapper";
import { type CachedYouTubeContext, saveCachedContext } from "../repositories/enrichment.repo";
import {
  recordCatalogDiscoveryEvent,
  replaceCatalogVideoSamples,
  upsertCatalogChannelSnapshot
} from "../repositories/catalog.repo";
import { createRunWithResults, getRunById } from "../repositories/runs.repo";
import { type RunRequest } from "../schemas/run.schema";

export type LoggerLike = {
  warn: (payload: unknown, message?: string) => void;
  error: (payload: unknown, message?: string) => void;
};

export type RunExecutionResult = {
  run_id: string;
  created_at: string;
  results: any[];
};

type ContactEmailSource = "bio" | "video_description";

type ContactEmailMatch = {
  email: string;
  source: ContactEmailSource;
  videoId?: string;
};

const GENERAL_DISCOVERY_KEYWORDS = [
  "lifestyle",
  "travel",
  "fashion",
  "fitness",
  "food",
  "gaming",
  "music",
  "technology"
];

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function normalizeOptionalMinimum(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

function normalizeRunInput(input: {
  min_views?: unknown;
  min_avg_views?: unknown;
  min_engagement_rate?: unknown;
  max_days_since_upload?: unknown;
}) {
  return {
    min_views: normalizeOptionalMinimum(input.min_views),
    min_avg_views: normalizeOptionalMinimum(input.min_avg_views),
    min_engagement_rate: normalizeOptionalMinimum(input.min_engagement_rate),
    max_days_since_upload: normalizeOptionalMinimum(input.max_days_since_upload)
  };
}

function normalizeRegionInput(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .slice(0, 2);
}

function normalizeLanguageInput(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/_/g, "-")
    .toLowerCase()
    .slice(0, 5);
}

function normalizeKeywordList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter((item) => item.length > 0);
}

function normalizeEmailCandidate(value: string): string {
  return value
    .trim()
    .replace(/^[<(\["']+/, "")
    .replace(/[>),\]"';:.!?]+$/, "")
    .toLowerCase();
}

function extractEmailFromText(value: string): string | null {
  if (value.trim().length === 0) return null;

  const matches = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  for (const match of matches) {
    const normalized = normalizeEmailCandidate(match);
    if (/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalized)) {
      return normalized;
    }
  }

  return null;
}

function findContactEmail(input: CachedYouTubeContext): ContactEmailMatch | null {
  const bioEmail = extractEmailFromText(input.description);
  if (bioEmail) {
    return { email: bioEmail, source: "bio" };
  }

  const n = Math.max(input.videoIds.length, input.descriptions.length);
  for (let i = 0; i < n; i++) {
    const description = input.descriptions[i] ?? "";
    const videoEmail = extractEmailFromText(description);
    if (!videoEmail) continue;

    return {
      email: videoEmail,
      source: "video_description",
      videoId: input.videoIds[i] ?? undefined
    };
  }

  return null;
}

function matchesExcludedKeywords(args: {
  channelName?: unknown;
  channelDescription?: unknown;
  titles?: unknown;
  descriptions?: unknown;
  excludeKeywords: string[];
}): boolean {
  if (args.excludeKeywords.length === 0) return false;

  const haystack = [
    typeof args.channelName === "string" ? args.channelName : "",
    typeof args.channelDescription === "string" ? args.channelDescription : "",
    ...toStringArray(args.titles),
    ...toStringArray(args.descriptions)
  ]
    .join("\n")
    .toLowerCase();

  return args.excludeKeywords.some((keyword) =>
    haystack.includes(keyword.trim().toLowerCase())
  );
}

export async function executeRunRequest(
  validatedInput: RunRequest,
  logger: LoggerLike
): Promise<RunExecutionResult> {
  const {
    keywords: rawKeywords,
    exclude_keywords: rawExcludeKeywords,
    region: rawRegion,
    language: rawLanguage,
    min_views,
    min_avg_views,
    min_engagement_rate,
    max_days_since_upload,
    min_subscribers,
    videos_to_analyze = 5,
    max_channels = 25
  } = validatedInput;
  const normalizedInput = normalizeRunInput({
    min_views,
    min_avg_views,
    min_engagement_rate,
    max_days_since_upload
  });
  const region = normalizeRegionInput(rawRegion);
  const language = normalizeLanguageInput(rawLanguage);
  const keywords = normalizeKeywordList(rawKeywords);
  const excludeKeywords = normalizeKeywordList(rawExcludeKeywords);

  const safeMaxChannels = Math.max(1, Math.min(Number(max_channels) || 25, 50));
  const safeVideosToAnalyze = Math.max(1, Math.min(Number(videos_to_analyze) || 5, 10));

  const uniqueChannelIdSet = new Set<string>();
  if (keywords.length > 0) {
    for (const keyword of keywords) {
      if (uniqueChannelIdSet.size >= safeMaxChannels) break;
      const found = await searchChannelsByKeyword(keyword, safeMaxChannels, region, language);
      for (const row of found) {
        if (!row?.channelId) continue;
        uniqueChannelIdSet.add(row.channelId);
        if (uniqueChannelIdSet.size >= safeMaxChannels) break;
      }
    }
  } else {
    const perKeywordMax = Math.max(
      1,
      Math.ceil(safeMaxChannels / GENERAL_DISCOVERY_KEYWORDS.length)
    );
    for (const keyword of GENERAL_DISCOVERY_KEYWORDS) {
      if (uniqueChannelIdSet.size >= safeMaxChannels) break;
      const found = await searchChannelsByKeyword(keyword, perKeywordMax, region, language);
      for (const row of found) {
        if (!row?.channelId) continue;
        uniqueChannelIdSet.add(row.channelId);
        if (uniqueChannelIdSet.size >= safeMaxChannels) break;
      }
    }
  }

  const uniqueChannelIds = Array.from(uniqueChannelIdSet).slice(0, safeMaxChannels);
  const details = await getChannelDetails(uniqueChannelIds);
  const runId = randomUUID();

  const results: any[] = [];
  const cachedYoutubeContexts: Array<{ channelId: string; context: CachedYouTubeContext }> = [];
  const catalogSnapshots: Array<{
    channelId: string;
    channelName: string;
    channelUrl: string;
    channelDescription: string | null;
    subscriberCount: number;
    minViewsLastN: number;
    avgViewsLastN: number;
    engagementRateLastN: number;
    daysSinceLastUpload: number;
    countryInferred: string;
    countryConfidence: "low";
    languageCode: string;
    languageConfidence: "low";
    contactEmail: string | null;
    contactEmailSource: string | null;
    contentFingerprint: string;
    scoreFinal: number;
    scoreBreakdown: unknown;
    lastRunId: string;
  }> = [];
  const catalogVideoSamples: Array<{
    channelId: string;
    videos: Array<{
      channelId: string;
      videoId: string;
      title: string;
      description: string;
      views: number;
      likes: number;
      comments: number;
      publishedAt: string | null;
      emailFound: boolean;
      emailSource: string | null;
    }>;
  }> = [];
  const discoveryEvents: Array<{
    channelId: string;
    runId: string;
    seedRegion: string;
    seedLanguage: string;
    seedKeywords: string[];
    source: string;
  }> = [];

  for (const ch of details as any[]) {
    const channelId = ch.channelId;

    const videoData = await getRecentVideos(
      channelId,
      safeVideosToAnalyze,
      ch.uploadsPlaylistId ?? undefined
    );

    const titles = toStringArray(videoData.titles);
    const descriptions = toStringArray(videoData.descriptions);
    const videoIds = toStringArray(videoData.videoIds);

    const metrics = mapYoutubeToChannelMetrics({
      channelId,
      channelName: ch.channelName ?? ch.title ?? ch.name ?? channelId,
      channelUrl: ch.channelUrl ?? `https://youtube.com/channel/${channelId}`,
      subscriberCount: Number(ch.subscriberCount ?? 0),
      recentViews: videoData.views ?? [],
      recentLikes: videoData.likes ?? [],
      recentComments: videoData.comments ?? [],
      daysSinceLastUpload: Number(videoData.daysSinceLastUpload ?? 9999)
    });

    if (
      matchesExcludedKeywords({
        channelName: ch.channelName ?? ch.title ?? ch.name ?? channelId,
        channelDescription: ch.description,
        titles,
        descriptions,
        excludeKeywords
      })
    ) {
      continue;
    }

    const passes = passesFilters(metrics, {
      minViews: normalizedInput.min_views,
      minAvgViews: normalizedInput.min_avg_views,
      minEngagementRate: normalizedInput.min_engagement_rate,
      maxDaysSinceUpload: normalizedInput.max_days_since_upload,
      minSubscribers: min_subscribers
    });

    if (!passes) continue;

    const scoredChannel = scoreChannel(metrics);
    const youtubeContext: CachedYouTubeContext = {
      description: typeof ch.description === "string" ? ch.description : "",
      recentTitles: titles.slice(0, 5),
      videoIds,
      titles,
      descriptions
    };
    const contactEmail = findContactEmail(youtubeContext);
    const contentFingerprint = buildChannelContentFingerprint({
      description: typeof ch.description === "string" ? ch.description : "",
      titles,
      descriptions,
      publishedAts: videoData.publishedAts ?? []
    });

    results.push(scoredChannel);
    cachedYoutubeContexts.push({
      channelId,
      context: youtubeContext
    });

    catalogSnapshots.push({
      channelId,
      channelName: metrics.channelName,
      channelUrl: metrics.channelUrl,
      channelDescription: typeof ch.description === "string" ? ch.description : null,
      subscriberCount: metrics.subscriberCount,
      minViewsLastN: metrics.minViewsLastN,
      avgViewsLastN: metrics.avgViewsLastN,
      engagementRateLastN: metrics.engagementRateLastN,
      daysSinceLastUpload: metrics.daysSinceLastUpload,
      countryInferred: region,
      countryConfidence: "low",
      languageCode: language,
      languageConfidence: "low",
      contactEmail: contactEmail?.email ?? null,
      contactEmailSource: contactEmail?.source ?? null,
      contentFingerprint,
      scoreFinal: scoredChannel.finalScore,
      scoreBreakdown: {
        base: scoredChannel.scores,
        final: scoredChannel.finalScore
      },
      lastRunId: runId
    });

    const emailVideoId =
      contactEmail?.source === "video_description" ? contactEmail.videoId ?? null : null;
    catalogVideoSamples.push({
      channelId,
      videos: videoIds.map((videoId, index) => ({
        channelId,
        videoId,
        title: titles[index] ?? "",
        description: descriptions[index] ?? "",
        views: Number(videoData.views[index] ?? 0),
        likes: Number(videoData.likes[index] ?? 0),
        comments: Number(videoData.comments[index] ?? 0),
        publishedAt: videoData.publishedAts[index] ?? null,
        emailFound: emailVideoId === videoId,
        emailSource: emailVideoId === videoId ? "video_description" : null
      }))
    });
    discoveryEvents.push({
      channelId,
      runId,
      seedRegion: region,
      seedLanguage: language,
      seedKeywords: keywords.length > 0 ? keywords : GENERAL_DISCOVERY_KEYWORDS,
      source: "run"
    });
  }

  results.sort((a: any, b: any) => b.finalScore - a.finalScore);

  await createRunWithResults({
    runId,
    input: {
      ...validatedInput,
      keywords,
      exclude_keywords: excludeKeywords,
      region,
      language,
      ...normalizedInput
    },
    results
  });

  const catalogWriteResults = await Promise.allSettled(
    catalogSnapshots.map(async (snapshot, index) => {
      await upsertCatalogChannelSnapshot(snapshot);
      await replaceCatalogVideoSamples(snapshot.channelId, catalogVideoSamples[index]?.videos ?? []);
      await recordCatalogDiscoveryEvent(discoveryEvents[index]);
    })
  );
  for (let i = 0; i < catalogWriteResults.length; i++) {
    const writeResult = catalogWriteResults[i];
    if (writeResult.status === "rejected") {
      logger.warn(
        {
          runId,
          channelId: catalogSnapshots[i]?.channelId,
          err:
            writeResult.reason instanceof Error
              ? writeResult.reason.message
              : String(writeResult.reason)
        },
        "Failed to persist catalog snapshot"
      );
    }
  }

  const cacheWriteResults = await Promise.allSettled(
    cachedYoutubeContexts.map(({ channelId, context }) =>
      saveCachedContext({ runId, channelId, context })
    )
  );
  for (let i = 0; i < cacheWriteResults.length; i++) {
    const writeResult = cacheWriteResults[i];
    if (writeResult.status === "rejected") {
      logger.warn(
        {
          runId,
          channelId: cachedYoutubeContexts[i]?.channelId,
          err:
            writeResult.reason instanceof Error
              ? writeResult.reason.message
              : String(writeResult.reason)
        },
        "Failed to persist YouTube context cache"
      );
    }
  }

  const persisted = await getRunById(runId);
  const createdAt = persisted?.run?.createdAt
    ? new Date(persisted.run.createdAt).toISOString()
    : new Date().toISOString();

  return {
    run_id: runId,
    created_at: createdAt,
    results
  };
}
