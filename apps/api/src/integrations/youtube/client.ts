import { ExternalApiError } from "../../errors/externalApiError";

type YouTubeSearchChannelItem = {
  id?: { channelId?: string };
};

type YouTubeChannelListItem = {
  id: string;
  snippet?: { title?: string; description?: string };
  statistics?: { subscriberCount?: string };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
};

type YouTubeVideoListItem = {
  id: string;
  statistics?: { viewCount?: string };
};

type YouTubePlaylistItem = {
  contentDetails?: { videoId?: string; videoPublishedAt?: string };
  snippet?: { title?: string; description?: string; publishedAt?: string };
};

type YouTubeErrorResponse = {
  error?: {
    message?: string;
    errors?: { reason?: string }[];
  };
};

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, "");
}

function requireApiKey(): string {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("Missing YOUTUBE_API_KEY in environment");
  return key;
}

function buildUrl(base: string, params: Record<string, string | number | undefined>): string {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    u.searchParams.set(k, String(v));
  }
  return u.toString();
}

type CacheEntry = {
  expiresAt: number;
  value: unknown;
};

const youtubeResponseCache = new Map<string, CacheEntry>();
const youtubeInflightRequests = new Map<string, Promise<unknown>>();

function youtubeCacheConfig() {
  const ttlMs = Math.max(0, Number(process.env.YOUTUBE_CACHE_TTL_MS ?? 120_000));
  const maxEntries = Math.max(0, Number(process.env.YOUTUBE_CACHE_MAX_ENTRIES ?? 500));
  return { ttlMs, maxEntries };
}

function pruneYoutubeCache(now: number, maxEntries: number) {
  for (const [k, v] of youtubeResponseCache.entries()) {
    if (v.expiresAt <= now) youtubeResponseCache.delete(k);
  }
  while (maxEntries > 0 && youtubeResponseCache.size > maxEntries) {
    const oldest = youtubeResponseCache.keys().next().value as string | undefined;
    if (!oldest) break;
    youtubeResponseCache.delete(oldest);
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const { ttlMs, maxEntries } = youtubeCacheConfig();
  const now = Date.now();

  if (ttlMs > 0) {
    const cached = youtubeResponseCache.get(url);
    if (cached && cached.expiresAt > now) {
      return cached.value as T;
    }
    if (cached) youtubeResponseCache.delete(url);
  }

  const inflight = youtubeInflightRequests.get(url);
  if (inflight) return (await inflight) as T;

  const requestPromise = (async () => {
    const res = await fetch(url);
    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      const errData = data as YouTubeErrorResponse;
      const reason = errData?.error?.errors?.[0]?.reason;
      const rawMessage =
        errData?.error?.message || reason || (typeof (data as { raw?: string })?.raw === "string" ? (data as { raw?: string }).raw : "");
      const message = stripHtml(
        rawMessage && String(rawMessage).trim().length > 0
          ? String(rawMessage)
          : `HTTP ${res.status}`
      );
      const lowerMessage = message.toLowerCase();
      const isQuota =
        reason === "quotaExceeded" ||
        reason === "dailyLimitExceeded" ||
        lowerMessage.includes("exceeded your quota");

      if (isQuota) {
        throw new ExternalApiError(429, "YOUTUBE_QUOTA_EXCEEDED", "YouTube API quota exceeded", {
          reason,
          message
        });
      }

      throw new ExternalApiError(502, "YOUTUBE_API_ERROR", "YouTube API request failed", {
        reason,
        message
      });
    }

    if (ttlMs > 0) {
      const writeNow = Date.now();
      pruneYoutubeCache(writeNow, maxEntries);
      youtubeResponseCache.set(url, { expiresAt: writeNow + ttlMs, value: data });
    }

    return data as T;
  })();

  youtubeInflightRequests.set(url, requestPromise);
  try {
    return await requestPromise;
  } finally {
    youtubeInflightRequests.delete(url);
  }
}

export async function searchChannelsByKeyword(
  keyword: string,
  maxResults: number,
  regionCode?: string,
  language?: string
): Promise<{ channelId: string }[]> {
  const key = requireApiKey();
  const safeMax = Math.max(1, Math.min(maxResults, 50));

  const url = buildUrl("https://www.googleapis.com/youtube/v3/search", {
    key,
    part: "snippet",
    type: "channel",
    q: keyword,
    maxResults: safeMax,
    regionCode,
    relevanceLanguage: language
  });

  const json = await fetchJson<{ items?: YouTubeSearchChannelItem[] }>(url);

  const ids =
    json.items?.map((it) => it.id?.channelId).filter((id): id is string => Boolean(id)) ?? [];

  return ids.map((channelId) => ({ channelId }));
}

export async function getChannelDetails(
  channelIds: string[]
): Promise<
  {
    channelId: string;
    channelName: string;
    channelUrl: string;
    subscriberCount: number;
    description: string;
    uploadsPlaylistId: string | null;
  }[]
> {
  const key = requireApiKey();
  const ids = Array.from(new Set(channelIds)).filter(Boolean);
  if (ids.length === 0) return [];

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));

  const out: {
    channelId: string;
    channelName: string;
    channelUrl: string;
    subscriberCount: number;
    description: string;
    uploadsPlaylistId: string | null;
  }[] = [];

  for (const chunk of chunks) {
    const url = buildUrl("https://www.googleapis.com/youtube/v3/channels", {
      key,
      part: "snippet,statistics,contentDetails",
      id: chunk.join(",")
    });

    const json = await fetchJson<{ items?: YouTubeChannelListItem[] }>(url);

    for (const it of json.items ?? []) {
      const channelId = it.id;
      const channelName = it.snippet?.title ?? channelId;
      const subscriberCount = Number(it.statistics?.subscriberCount ?? 0);
      out.push({
        channelId,
        channelName,
        channelUrl: `https://youtube.com/channel/${channelId}`,
        subscriberCount,
        description: it.snippet?.description ?? "",
        uploadsPlaylistId: it.contentDetails?.relatedPlaylists?.uploads ?? null
      });
    }
  }

  return out;
}

export async function getRecentVideos(
  channelId: string,
  maxVideos: number,
  uploadsPlaylistId?: string
): Promise<{
  videoIds: string[];
  views: number[];
  titles: string[];
  descriptions: string[];
  daysSinceLastUpload: number;
}> {
  const key = requireApiKey();
  const safeMax = Math.max(1, Math.min(maxVideos, 50));

  let uploadsId = uploadsPlaylistId;
  if (!uploadsId) {
    const channelUrl = buildUrl("https://www.googleapis.com/youtube/v3/channels", {
      key,
      part: "contentDetails",
      id: channelId
    });
    const channelJson = await fetchJson<{ items?: YouTubeChannelListItem[] }>(channelUrl);
    uploadsId = channelJson.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  }

  if (!uploadsId) {
    return { videoIds: [], views: [], titles: [], descriptions: [], daysSinceLastUpload: 9999 };
  }

  const playlistUrl = buildUrl("https://www.googleapis.com/youtube/v3/playlistItems", {
    key,
    part: "contentDetails,snippet", 
    playlistId: uploadsId,
    maxResults: safeMax
  });

  const playlistJson = await fetchJson<{ items?: YouTubePlaylistItem[] }>(playlistUrl);
  const playlistItems = playlistJson.items ?? [];

  const metaById = new Map<
    string,
    { title: string; description: string; publishedAt: string | null }
  >();

  const videoIds: string[] = [];
  for (const it of playlistItems) {
    const videoId = it.contentDetails?.videoId;
    if (!videoId) continue;
    videoIds.push(videoId);
    metaById.set(videoId, {
      title: it.snippet?.title ?? "",
      description: it.snippet?.description ?? "",
      publishedAt: it.contentDetails?.videoPublishedAt ?? it.snippet?.publishedAt ?? null
    });
  }

  if (videoIds.length === 0) {
    return { videoIds: [], views: [], titles: [], descriptions: [], daysSinceLastUpload: 9999 };
  }

  const videosUrl = buildUrl("https://www.googleapis.com/youtube/v3/videos", {
    key,
    part: "statistics",
    id: videoIds.join(",")
  });

  const videosJson = await fetchJson<{ items?: YouTubeVideoListItem[] }>(videosUrl);

  const viewsById = new Map<string, number>();
  for (const it of videosJson.items ?? []) {
    viewsById.set(it.id, Number(it.statistics?.viewCount ?? 0));
  }

  const views = videoIds.map((id) => viewsById.get(id) ?? 0);
  const titles = videoIds.map((id) => metaById.get(id)?.title ?? "");
  const descriptions = videoIds.map((id) => metaById.get(id)?.description ?? "");

  const newestPublishedAt = metaById.get(videoIds[0])?.publishedAt ?? null;
  let daysSinceLastUpload = 9999;
  if (newestPublishedAt) {
    const published = new Date(newestPublishedAt).getTime();
    const diffMs = Math.max(0, Date.now() - published);
    daysSinceLastUpload = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  return { videoIds, views, titles, descriptions, daysSinceLastUpload };
}

export async function getChannelText(
  channelId: string,
  maxTitles = 5
): Promise<{ description: string; recentTitles: string[] }> {
  const safeMax = Math.max(1, Math.min(maxTitles, 10));

  const [detail] = await getChannelDetails([channelId]);
  const recent = await getRecentVideos(channelId, safeMax, detail?.uploadsPlaylistId ?? undefined);

  const recentTitles = recent.titles.map((t) => t.trim()).filter(Boolean).slice(0, safeMax);
  return { description: detail?.description?.trim() ?? "", recentTitles };
}
