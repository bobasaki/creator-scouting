type YouTubeSearchChannelItem = {
  id?: { channelId?: string };
};

type YouTubeChannelListItem = {
  id: string;
  snippet?: { title?: string };
  statistics?: { subscriberCount?: string };
};

type YouTubeSearchVideoItem = {
  id?: { videoId?: string };
};

type YouTubeVideoListItem = {
  id: string;
  snippet?: { publishedAt?: string };
  statistics?: { viewCount?: string };
};

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

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const text = await res.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const message =
      (data && data.error && (data.error.message || data.error.errors?.[0]?.reason)) ||
      `HTTP ${res.status}`;
    throw new Error(`YouTube API request failed: ${message}`);
  }

  return data as T;
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
  }[] = [];

  for (const chunk of chunks) {
    const url = buildUrl("https://www.googleapis.com/youtube/v3/channels", {
      key,
      part: "snippet,statistics",
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
        subscriberCount
      });
    }
  }

  return out;
}

export async function getRecentVideos(
  channelId: string,
  maxVideos: number
): Promise<{ views: number[]; daysSinceLastUpload: number }> {
  const key = requireApiKey();
  const safeMax = Math.max(1, Math.min(maxVideos, 50));

  const searchUrl = buildUrl("https://www.googleapis.com/youtube/v3/search", {
    key,
    part: "snippet",
    channelId,
    order: "date",
    type: "video",
    maxResults: safeMax
  });

  const searchJson = await fetchJson<{ items?: YouTubeSearchVideoItem[] }>(searchUrl);

  const videoIds =
    searchJson.items?.map((it) => it.id?.videoId).filter((id): id is string => Boolean(id)) ?? [];

  if (videoIds.length === 0) return { views: [], daysSinceLastUpload: 9999 };

  const videosUrl = buildUrl("https://www.googleapis.com/youtube/v3/videos", {
    key,
    part: "statistics,snippet",
    id: videoIds.join(",")
  });

  const videosJson = await fetchJson<{ items?: YouTubeVideoListItem[] }>(videosUrl);

  // preserve order from videoIds
  const orderMap = new Map<string, number>();
  videoIds.forEach((id, idx) => orderMap.set(id, idx));

  const items = (videosJson.items ?? []).slice().sort((a, b) => {
    return (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0);
  });

  const views = items.map((it) => Number(it.statistics?.viewCount ?? 0));

  const newestPublishedAt = items[0]?.snippet?.publishedAt;
  let daysSinceLastUpload = 9999;
  if (newestPublishedAt) {
    const published = new Date(newestPublishedAt).getTime();
    const diffMs = Math.max(0, Date.now() - published);
    daysSinceLastUpload = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  return { views, daysSinceLastUpload };
}

// Move these types and function to top-level scope

type YouTubeChannelSnippetItem = {
  id: string;
  snippet?: { description?: string };
};

type YouTubeSearchVideoSnippetItem = {
  id?: { videoId?: string };
  snippet?: { title?: string };
};

export async function getChannelText(
  channelId: string,
  maxTitles = 5
): Promise<{ description: string; recentTitles: string[] }> {
  const key = requireApiKey();
  const safeMax = Math.max(1, Math.min(maxTitles, 10));

  // 1) Fetch channel description
  const channelUrl = buildUrl("https://www.googleapis.com/youtube/v3/channels", {
    key,
    part: "snippet",
    id: channelId
  });

  const channelJson = await fetchJson<{ items?: YouTubeChannelSnippetItem[] }>(channelUrl);
  const description =
    channelJson.items?.[0]?.snippet?.description?.trim() ?? "";

  // 2) Fetch recent video titles
  const searchUrl = buildUrl("https://www.googleapis.com/youtube/v3/search", {
    key,
    part: "snippet",
    channelId,
    order: "date",
    type: "video",
    maxResults: safeMax
  });

  const searchJson = await fetchJson<{ items?: YouTubeSearchVideoSnippetItem[] }>(searchUrl);

  const recentTitles =
    searchJson.items
      ?.map((it) => it.snippet?.title?.trim())
      .filter((t): t is string => Boolean(t)) ?? [];

  return { description, recentTitles };
}