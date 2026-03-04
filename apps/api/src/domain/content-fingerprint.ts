import { createHash } from "node:crypto";

type ChannelContentFingerprintInput = {
  description?: string | null;
  titles?: string[];
  descriptions?: string[];
  publishedAts?: Array<string | null | undefined>;
  maxVideos?: number;
};

function normalizeText(value: string | null | undefined) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function buildChannelContentFingerprint(
  input: ChannelContentFingerprintInput
): string {
  const maxVideos = Math.max(1, Math.min(Number(input.maxVideos ?? 5), 10));
  const titles = Array.isArray(input.titles) ? input.titles : [];
  const descriptions = Array.isArray(input.descriptions) ? input.descriptions : [];
  const publishedAts = Array.isArray(input.publishedAts) ? input.publishedAts : [];
  const videoCount = Math.min(
    maxVideos,
    Math.max(titles.length, descriptions.length, publishedAts.length)
  );

  const videos = Array.from({ length: videoCount }, (_, index) => ({
    title: normalizeText(titles[index]),
    description: normalizeText(descriptions[index]),
    published_at: normalizeText(publishedAts[index] ?? "")
  }));

  const payload = {
    description: normalizeText(input.description),
    videos
  };

  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
