import { randomUUID } from "node:crypto";
import { prisma } from "../db/prisma";
import { buildChannelContentFingerprint } from "../domain/content-fingerprint";
import {
  normalizeCountryCode,
  normalizeLanguageCode,
  normalizeLocaleConfidence,
  type LocaleConfidence
} from "../domain/locale";
import type { CatalogSegmentFilters } from "../schemas/catalog.schema";

type TableInfoRow = {
  name: string;
};

export type CatalogChannelSnapshotInput = {
  channelId: string;
  channelName: string;
  channelUrl: string;
  channelDescription?: string | null;
  subscriberCount: number;
  minViewsLastN: number;
  avgViewsLastN: number;
  engagementRateLastN: number;
  daysSinceLastUpload: number;
  countryInferred?: string | null;
  countryConfidence?: LocaleConfidence | null;
  languageCode?: string | null;
  languageConfidence?: LocaleConfidence | null;
  contactEmail?: string | null;
  contactEmailSource?: string | null;
  contentFingerprint?: string | null;
  scoreFinal?: number | null;
  scoreBreakdown?: unknown;
  lastRunId?: string | null;
  observedAt?: string;
};

export type CatalogVideoSampleInput = {
  channelId: string;
  videoId: string;
  title: string;
  description: string;
  views: number;
  likes: number;
  comments: number;
  publishedAt?: string | null;
  emailFound?: boolean;
  emailSource?: string | null;
};

export type CatalogChannelEnrichmentInput = {
  channelId: string;
  estimatedCategory?: string | null;
  estimatedType?: string | null;
  countryInferred?: string | null;
  countryConfidence?: LocaleConfidence | null;
  languageCode?: string | null;
  languageDetected?: string | null;
  languageConfidence?: LocaleConfidence | null;
  enrichedAt?: string;
};

export type CatalogDiscoveryEventInput = {
  channelId: string;
  runId?: string | null;
  seedRegion?: string | null;
  seedLanguage?: string | null;
  seedKeywords?: string[];
  source?: string;
  discoveredAt?: string;
};

export type CatalogListFilters = {
  country?: string;
  language?: string;
  minSubscribers?: number;
  minAvgViews?: number;
  minEngagementRate?: number;
  maxDaysSinceUpload?: number;
  maxMetricsRefreshAgeDays?: number;
  maxContentRefreshAgeDays?: number;
  maxEnrichmentAgeDays?: number;
  estimatedCategory?: string;
  estimatedType?: string;
  minCountryConfidence?: LocaleConfidence | null;
  minLanguageConfidence?: LocaleConfidence | null;
  emailFound?: boolean;
  sort?: string;
  sortDir?: string;
  page?: number;
  perPage?: number;
};

export type SavedSegment = {
  id: string;
  name: string;
  filters: CatalogSegmentFilters;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
};

export type CatalogMaintenanceCandidate = {
  channel_id: string;
  channel_name: string;
  channel_url: string;
  last_metrics_refresh_at: string;
  last_enriched_at: string | null;
  subscriber_count: number;
};

export type CatalogCoverageBucket = {
  key: string | null;
  label: string;
  channel_count: number;
  email_count: number;
  stale_metrics_count: number;
  stale_enrichment_count: number;
  confidence_breakdown: {
    high: number;
    medium: number;
    low: number;
    unknown: number;
  } | null;
};

export type CatalogStaleChannel = {
  channel_id: string;
  channel_name: string;
  channel_url: string;
  subscriber_count: number;
  days_since_last_upload: number;
  country_inferred: string | null;
  country_confidence: LocaleConfidence | null;
  language_code: string | null;
  language_confidence: LocaleConfidence | null;
  estimated_category: string | null;
  estimated_type: string | null;
  last_metrics_refresh_at: string;
  last_enriched_at: string | null;
};

export type CatalogMaintenanceChannel = {
  channel_id: string;
  channel_name: string;
  channel_url: string;
  channel_description: string | null;
  metrics: {
    subscriber_count: number;
    min_views_last_n: number;
    avg_views_last_n: number;
    engagement_rate_last_n: number;
    days_since_last_upload: number;
  };
  enrichment: {
    country_inferred: string | null;
    country_confidence: LocaleConfidence | null;
    language_code: string | null;
    language_detected: string | null;
    language_confidence: LocaleConfidence | null;
    estimated_category: string | null;
    estimated_type: string | null;
  };
  contact: {
    email: string | null;
    source: string | null;
  };
  freshness: {
    first_seen_at: string;
    last_seen_at: string;
    last_content_refresh_at: string | null;
    last_metrics_refresh_at: string;
    last_enriched_at: string | null;
  };
  score: {
    final_score: number | null;
  };
  videos: Array<{
    video_id: string;
    title: string;
    description: string;
    views: number;
    likes: number;
    comments: number;
    published_at: string | null;
    email_found: boolean;
    email_source: string | null;
    scanned_at: string;
  }>;
};

type CatalogChannelRow = {
  channelId: string;
  channelName: string;
  channelUrl: string;
  channelDescription?: string | null;
  subscriberCount: number;
  minViewsLastN: number;
  avgViewsLastN: number;
  engagementRateLastN: number;
  daysSinceLastUpload: number;
  countryInferred: string | null;
  countryConfidence: string | null;
  languageCode: string | null;
  languageDetected: string | null;
  languageConfidence: string | null;
  estimatedCategory: string | null;
  estimatedType: string | null;
  contactEmail: string | null;
  contactEmailSource: string | null;
  contentFingerprint?: string | null;
  scoreFinal: number | null;
  scoreBreakdown: string | null;
  lastRunId?: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  lastContentRefreshAt: string | null;
  lastMetricsRefreshAt: string;
  lastEnrichedAt: string | null;
};

type CatalogChannelMaintenanceRow = CatalogChannelRow & {
  channelDescription: string | null;
};

type ChannelDiscoveryEventRow = {
  id: string;
  runId: string | null;
  discoveredAt: string;
  seedRegion: string | null;
  seedLanguage: string | null;
  seedKeywords: string | null;
  source: string;
};

type SavedSegmentRow = {
  id: string;
  name: string;
  filtersJson: string;
  createdAt: string;
  updatedAt: string | null;
  lastUsedAt: string | null;
};

type CatalogCoverageRow = {
  value: string | null;
  channelCount: number | string;
  emailCount: number | string;
  staleMetricsCount: number | string;
  staleEnrichmentCount: number | string;
  highConfidenceCount?: number | string;
  mediumConfidenceCount?: number | string;
  lowConfidenceCount?: number | string;
  unknownConfidenceCount?: number | string;
};

type CatalogStaleChannelRow = {
  channelId: string;
  channelName: string;
  channelUrl: string;
  subscriberCount: number;
  daysSinceLastUpload: number;
  countryInferred: string | null;
  countryConfidence: string | null;
  languageCode: string | null;
  languageConfidence: string | null;
  estimatedCategory: string | null;
  estimatedType: string | null;
  lastMetricsRefreshAt: string;
  lastEnrichedAt: string | null;
};

type CountRow = {
  count: number | string;
};

let ensureCatalogTablesPromise: Promise<void> | null = null;
let backfillCatalogPromise: Promise<void> | null = null;

function normalizeEmailCandidate(value: string): string {
  return value
    .trim()
    .replace(/^[<(\["']+/, "")
    .replace(/[>),\]"';:.!?]+$/, "")
    .toLowerCase();
}

function extractEmailFromText(value: string): string | null {
  const matches = String(value ?? "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  for (const match of matches) {
    const normalized = normalizeEmailCandidate(match);
    if (/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalized)) {
      return normalized;
    }
  }

  return null;
}

function getBackfillContact(raw: unknown): { email: string | null; source: string | null } {
  if (!raw || typeof raw !== "object") {
    return { email: null, source: null };
  }

  const youtubeContext = (raw as { youtubeContext?: unknown }).youtubeContext;
  if (!youtubeContext || typeof youtubeContext !== "object") {
    return { email: null, source: null };
  }

  const context = youtubeContext as {
    description?: unknown;
    descriptions?: unknown;
  };

  const bioEmail = extractEmailFromText(
    typeof context.description === "string" ? context.description : ""
  );
  if (bioEmail) {
    return { email: bioEmail, source: "bio" };
  }

  const descriptions = Array.isArray(context.descriptions)
    ? context.descriptions.filter((value): value is string => typeof value === "string")
    : [];
  for (const description of descriptions) {
    const email = extractEmailFromText(description);
    if (email) {
      return { email, source: "video_description" };
    }
  }

  return { email: null, source: null };
}

async function ensureMissingColumns(
  tableName: string,
  columns: Array<{ name: string; ddl: string }>
) {
  const tableInfo = await prisma.$queryRawUnsafe<TableInfoRow[]>(
    `PRAGMA table_info("${tableName}")`
  );
  const existing = new Set(tableInfo.map((column) => column.name));

  for (const column of columns) {
    if (!existing.has(column.name)) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "${tableName}" ADD COLUMN ${column.ddl}`
      );
    }
  }
}

export async function ensureCatalogTables(): Promise<void> {
  if (!ensureCatalogTablesPromise) {
    ensureCatalogTablesPromise = prisma
      .$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "ChannelCatalog" (
          "channelId" TEXT PRIMARY KEY,
          "channelName" TEXT NOT NULL,
          "channelUrl" TEXT NOT NULL,
          "channelDescription" TEXT,
          "subscriberCount" INTEGER NOT NULL DEFAULT 0,
          "minViewsLastN" INTEGER NOT NULL DEFAULT 0,
          "avgViewsLastN" INTEGER NOT NULL DEFAULT 0,
          "engagementRateLastN" REAL NOT NULL DEFAULT 0,
          "daysSinceLastUpload" INTEGER NOT NULL DEFAULT 9999,
          "countryInferred" TEXT,
          "countryConfidence" TEXT,
          "languageCode" TEXT,
          "languageDetected" TEXT,
          "languageConfidence" TEXT,
          "estimatedCategory" TEXT,
          "estimatedType" TEXT,
          "contactEmail" TEXT,
          "contactEmailSource" TEXT,
          "contentFingerprint" TEXT,
          "scoreFinal" REAL,
          "scoreBreakdown" TEXT,
          "lastRunId" TEXT,
          "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "lastContentRefreshAt" DATETIME,
          "lastMetricsRefreshAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "lastEnrichedAt" DATETIME
        )
      `)
      .then(async () =>
        prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "ChannelVideoSample" (
            "channelId" TEXT NOT NULL,
            "videoId" TEXT NOT NULL,
            "title" TEXT NOT NULL,
            "description" TEXT NOT NULL,
            "views" INTEGER NOT NULL DEFAULT 0,
            "likes" INTEGER NOT NULL DEFAULT 0,
            "comments" INTEGER NOT NULL DEFAULT 0,
            "publishedAt" DATETIME,
            "emailFound" INTEGER NOT NULL DEFAULT 0,
            "emailSource" TEXT,
            "scannedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY ("channelId", "videoId")
          )
        `)
      )
      .then(async () =>
        prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "ChannelDiscoveryEvent" (
            "id" TEXT PRIMARY KEY,
            "channelId" TEXT NOT NULL,
            "runId" TEXT,
            "discoveredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "seedRegion" TEXT,
            "seedLanguage" TEXT,
            "seedKeywords" TEXT,
            "source" TEXT NOT NULL DEFAULT 'run'
          )
        `)
      )
      .then(async () =>
        prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "SavedSegment" (
            "id" TEXT PRIMARY KEY,
            "name" TEXT NOT NULL,
            "filtersJson" TEXT NOT NULL,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "lastUsedAt" DATETIME
          )
        `)
      )
      .then(async () => {
        await ensureMissingColumns("ChannelCatalog", [
          { name: "channelDescription", ddl: `"channelDescription" TEXT` },
          { name: "countryInferred", ddl: `"countryInferred" TEXT` },
          { name: "countryConfidence", ddl: `"countryConfidence" TEXT` },
          { name: "languageCode", ddl: `"languageCode" TEXT` },
          { name: "languageDetected", ddl: `"languageDetected" TEXT` },
          { name: "languageConfidence", ddl: `"languageConfidence" TEXT` },
          { name: "estimatedCategory", ddl: `"estimatedCategory" TEXT` },
          { name: "estimatedType", ddl: `"estimatedType" TEXT` },
          { name: "contactEmail", ddl: `"contactEmail" TEXT` },
          { name: "contactEmailSource", ddl: `"contactEmailSource" TEXT` },
          { name: "contentFingerprint", ddl: `"contentFingerprint" TEXT` },
          { name: "scoreFinal", ddl: `"scoreFinal" REAL` },
          { name: "scoreBreakdown", ddl: `"scoreBreakdown" TEXT` },
          { name: "lastRunId", ddl: `"lastRunId" TEXT` },
          { name: "firstSeenAt", ddl: `"firstSeenAt" DATETIME` },
          { name: "lastSeenAt", ddl: `"lastSeenAt" DATETIME` },
          { name: "lastContentRefreshAt", ddl: `"lastContentRefreshAt" DATETIME` },
          { name: "lastMetricsRefreshAt", ddl: `"lastMetricsRefreshAt" DATETIME` },
          { name: "lastEnrichedAt", ddl: `"lastEnrichedAt" DATETIME` }
        ]);

        await prisma.$executeRawUnsafe(`
          UPDATE "ChannelCatalog"
          SET "lastContentRefreshAt" = COALESCE("lastContentRefreshAt", "lastMetricsRefreshAt", "firstSeenAt")
          WHERE "lastContentRefreshAt" IS NULL
        `);

        await ensureMissingColumns("SavedSegment", [
          { name: "updatedAt", ddl: `"updatedAt" DATETIME` }
        ]);
      })
      .then(async () =>
        Promise.all([
          prisma.$executeRawUnsafe(
            `CREATE INDEX IF NOT EXISTS "ChannelCatalog_countryInferred_idx" ON "ChannelCatalog"("countryInferred")`
          ),
          prisma.$executeRawUnsafe(
            `CREATE INDEX IF NOT EXISTS "ChannelCatalog_languageCode_idx" ON "ChannelCatalog"("languageCode")`
          ),
          prisma.$executeRawUnsafe(
            `CREATE INDEX IF NOT EXISTS "ChannelCatalog_avgViewsLastN_idx" ON "ChannelCatalog"("avgViewsLastN")`
          ),
          prisma.$executeRawUnsafe(
            `CREATE INDEX IF NOT EXISTS "ChannelCatalog_subscriberCount_idx" ON "ChannelCatalog"("subscriberCount")`
          ),
          prisma.$executeRawUnsafe(
            `CREATE INDEX IF NOT EXISTS "ChannelCatalog_estimatedCategory_idx" ON "ChannelCatalog"("estimatedCategory")`
          ),
          prisma.$executeRawUnsafe(
            `CREATE INDEX IF NOT EXISTS "ChannelCatalog_estimatedType_idx" ON "ChannelCatalog"("estimatedType")`
          ),
          prisma.$executeRawUnsafe(
            `CREATE INDEX IF NOT EXISTS "ChannelCatalog_scoreFinal_idx" ON "ChannelCatalog"("scoreFinal")`
          ),
          prisma.$executeRawUnsafe(
            `CREATE INDEX IF NOT EXISTS "ChannelCatalog_lastMetricsRefreshAt_idx" ON "ChannelCatalog"("lastMetricsRefreshAt")`
          ),
          prisma.$executeRawUnsafe(
            `CREATE INDEX IF NOT EXISTS "ChannelCatalog_lastContentRefreshAt_idx" ON "ChannelCatalog"("lastContentRefreshAt")`
          ),
          prisma.$executeRawUnsafe(
            `CREATE INDEX IF NOT EXISTS "SavedSegment_updatedAt_idx" ON "SavedSegment"("updatedAt")`
          )
        ])
      )
      .then(() => undefined);
  }

  await ensureCatalogTablesPromise;
}

export async function upsertCatalogChannelSnapshot(
  input: CatalogChannelSnapshotInput
): Promise<void> {
  await ensureCatalogTables();

  await upsertCatalogChannelSnapshotRow(input);
}

async function upsertCatalogChannelSnapshotRow(
  input: CatalogChannelSnapshotInput
): Promise<void> {
  const observedAt = input.observedAt ?? new Date().toISOString();
  const scoreBreakdown =
    input.scoreBreakdown === undefined ? null : JSON.stringify(input.scoreBreakdown);
  const contentFingerprint =
    input.contentFingerprint ??
    buildChannelContentFingerprint({
      description: input.channelDescription ?? "",
      maxVideos: 1
    });

  await prisma.$executeRaw`
    INSERT INTO "ChannelCatalog" (
      "channelId",
      "channelName",
      "channelUrl",
      "channelDescription",
      "subscriberCount",
      "minViewsLastN",
      "avgViewsLastN",
      "engagementRateLastN",
      "daysSinceLastUpload",
      "countryInferred",
      "countryConfidence",
      "languageCode",
      "languageConfidence",
      "contactEmail",
      "contactEmailSource",
      "contentFingerprint",
      "scoreFinal",
      "scoreBreakdown",
      "lastRunId",
      "firstSeenAt",
      "lastSeenAt",
      "lastContentRefreshAt",
      "lastMetricsRefreshAt"
    )
    VALUES (
      ${input.channelId},
      ${input.channelName},
      ${input.channelUrl},
      ${input.channelDescription ?? null},
      ${input.subscriberCount},
      ${input.minViewsLastN},
      ${input.avgViewsLastN},
      ${input.engagementRateLastN},
      ${input.daysSinceLastUpload},
      ${normalizeCountryCode(input.countryInferred)},
      ${normalizeLocaleConfidence(input.countryConfidence)},
      ${normalizeLanguageCode(input.languageCode)},
      ${normalizeLocaleConfidence(input.languageConfidence)},
      ${input.contactEmail ?? null},
      ${input.contactEmailSource ?? null},
      ${contentFingerprint},
      ${input.scoreFinal ?? null},
      ${scoreBreakdown},
      ${input.lastRunId ?? null},
      ${observedAt},
      ${observedAt},
      ${observedAt},
      ${observedAt}
    )
    ON CONFLICT("channelId") DO UPDATE SET
      "channelName" = excluded."channelName",
      "channelUrl" = excluded."channelUrl",
      "channelDescription" = COALESCE(excluded."channelDescription", "ChannelCatalog"."channelDescription"),
      "subscriberCount" = excluded."subscriberCount",
      "minViewsLastN" = excluded."minViewsLastN",
      "avgViewsLastN" = excluded."avgViewsLastN",
      "engagementRateLastN" = excluded."engagementRateLastN",
      "daysSinceLastUpload" = excluded."daysSinceLastUpload",
      "countryInferred" = COALESCE(excluded."countryInferred", "ChannelCatalog"."countryInferred"),
      "countryConfidence" = COALESCE(excluded."countryConfidence", "ChannelCatalog"."countryConfidence"),
      "languageCode" = COALESCE(excluded."languageCode", "ChannelCatalog"."languageCode"),
      "languageConfidence" = COALESCE(excluded."languageConfidence", "ChannelCatalog"."languageConfidence"),
      "contactEmail" = COALESCE(excluded."contactEmail", "ChannelCatalog"."contactEmail"),
      "contactEmailSource" = COALESCE(excluded."contactEmailSource", "ChannelCatalog"."contactEmailSource"),
      "contentFingerprint" = COALESCE(excluded."contentFingerprint", "ChannelCatalog"."contentFingerprint"),
      "scoreFinal" = COALESCE(excluded."scoreFinal", "ChannelCatalog"."scoreFinal"),
      "scoreBreakdown" = COALESCE(excluded."scoreBreakdown", "ChannelCatalog"."scoreBreakdown"),
      "lastRunId" = COALESCE(excluded."lastRunId", "ChannelCatalog"."lastRunId"),
      "lastSeenAt" = excluded."lastSeenAt",
      "lastContentRefreshAt" = CASE
        WHEN excluded."contentFingerprint" IS NULL THEN COALESCE("ChannelCatalog"."lastContentRefreshAt", excluded."lastContentRefreshAt")
        WHEN "ChannelCatalog"."contentFingerprint" IS NULL THEN excluded."lastContentRefreshAt"
        WHEN excluded."contentFingerprint" <> "ChannelCatalog"."contentFingerprint" THEN excluded."lastContentRefreshAt"
        ELSE COALESCE("ChannelCatalog"."lastContentRefreshAt", excluded."lastContentRefreshAt")
      END,
      "lastMetricsRefreshAt" = excluded."lastMetricsRefreshAt"
  `;
}

export async function replaceCatalogVideoSamples(
  channelId: string,
  videos: CatalogVideoSampleInput[]
): Promise<void> {
  await ensureCatalogTables();

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      DELETE FROM "ChannelVideoSample"
      WHERE "channelId" = ${channelId}
    `;

    for (const video of videos) {
      await tx.$executeRaw`
        INSERT INTO "ChannelVideoSample" (
          "channelId",
          "videoId",
          "title",
          "description",
          "views",
          "likes",
          "comments",
          "publishedAt",
          "emailFound",
          "emailSource",
          "scannedAt"
        )
        VALUES (
          ${video.channelId},
          ${video.videoId},
          ${video.title},
          ${video.description},
          ${video.views},
          ${video.likes},
          ${video.comments},
          ${video.publishedAt ?? null},
          ${video.emailFound ? 1 : 0},
          ${video.emailSource ?? null},
          ${new Date().toISOString()}
        )
      `;
    }
  });
}

export async function recordCatalogDiscoveryEvent(
  input: CatalogDiscoveryEventInput
): Promise<void> {
  await ensureCatalogTables();

  await prisma.$executeRaw`
    INSERT INTO "ChannelDiscoveryEvent" (
      "id",
      "channelId",
      "runId",
      "discoveredAt",
      "seedRegion",
      "seedLanguage",
      "seedKeywords",
      "source"
    )
    VALUES (
      ${randomUUID()},
      ${input.channelId},
      ${input.runId ?? null},
      ${input.discoveredAt ?? new Date().toISOString()},
      ${input.seedRegion ?? null},
      ${input.seedLanguage ?? null},
      ${input.seedKeywords && input.seedKeywords.length > 0
        ? JSON.stringify(input.seedKeywords)
        : null},
      ${input.source ?? "run"}
    )
  `;
}

export async function applyCatalogChannelEnrichment(
  input: CatalogChannelEnrichmentInput
): Promise<void> {
  await ensureCatalogTables();

  await applyCatalogChannelEnrichmentRow(input);
}

async function applyCatalogChannelEnrichmentRow(
  input: CatalogChannelEnrichmentInput
): Promise<void> {
  const enrichedAt = input.enrichedAt ?? new Date().toISOString();

  await prisma.$executeRaw`
    UPDATE "ChannelCatalog"
    SET
      "estimatedCategory" = COALESCE(${input.estimatedCategory ?? null}, "estimatedCategory"),
      "estimatedType" = COALESCE(${input.estimatedType ?? null}, "estimatedType"),
      "countryInferred" = COALESCE(${normalizeCountryCode(input.countryInferred)}, "countryInferred"),
      "countryConfidence" = COALESCE(${normalizeLocaleConfidence(input.countryConfidence)}, "countryConfidence"),
      "languageCode" = COALESCE(${normalizeLanguageCode(input.languageCode)}, "languageCode"),
      "languageDetected" = COALESCE(${input.languageDetected ?? null}, "languageDetected"),
      "languageConfidence" = COALESCE(${normalizeLocaleConfidence(input.languageConfidence)}, "languageConfidence"),
      "lastEnrichedAt" = ${enrichedAt}
    WHERE "channelId" = ${input.channelId}
  `;
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

function normalizeOptionalString(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : undefined;
}

function getIsoCutoffDaysAgo(value: number): string {
  return new Date(Date.now() - value * 24 * 60 * 60 * 1000).toISOString();
}

function parseScoreBreakdown(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function sanitizeSavedSegmentFilters(
  filters: CatalogSegmentFilters
): CatalogSegmentFilters {
  const entries = Object.entries(filters).filter(([, value]) => {
    if (value === undefined || value === null) return false;
    if (typeof value === "string") return value.trim().length > 0;
    return true;
  });

  return Object.fromEntries(entries) as CatalogSegmentFilters;
}

function mapSavedSegmentRow(row: SavedSegmentRow): SavedSegment {
  let filters: CatalogSegmentFilters = {};
  try {
    const parsed = JSON.parse(row.filtersJson);
    if (parsed && typeof parsed === "object") {
      filters = sanitizeSavedSegmentFilters(parsed as CatalogSegmentFilters);
    }
  } catch {
    filters = {};
  }

  return {
    id: row.id,
    name: row.name,
    filters,
    created_at: row.createdAt,
    updated_at: row.updatedAt ?? row.createdAt,
    last_used_at: row.lastUsedAt
  };
}

function mapCatalogStaleChannelRow(row: CatalogStaleChannelRow): CatalogStaleChannel {
  return {
    channel_id: row.channelId,
    channel_name: row.channelName,
    channel_url: row.channelUrl,
    subscriber_count: Number(row.subscriberCount ?? 0),
    days_since_last_upload: Number(row.daysSinceLastUpload ?? 9999),
    country_inferred: row.countryInferred,
    country_confidence: normalizeLocaleConfidence(row.countryConfidence),
    language_code: row.languageCode,
    language_confidence: normalizeLocaleConfidence(row.languageConfidence),
    estimated_category: row.estimatedCategory,
    estimated_type: row.estimatedType,
    last_metrics_refresh_at: row.lastMetricsRefreshAt,
    last_enriched_at: row.lastEnrichedAt
  };
}

async function listCatalogCoverageBuckets(args: {
  column: "countryInferred" | "languageCode" | "estimatedCategory";
  confidenceColumn?: "countryConfidence" | "languageConfidence";
  limit: number;
  refreshCutoff: string;
  enrichCutoff: string;
}) {
  const staleEnrichmentSql = `
    CASE
      WHEN "estimatedCategory" IS NULL
        OR "estimatedType" IS NULL
        OR COALESCE(TRIM("countryInferred"), '') = ''
        OR COALESCE(TRIM("languageCode"), '') = ''
        OR COALESCE(TRIM("countryConfidence"), '') = ''
        OR COALESCE(TRIM("languageConfidence"), '') = ''
        OR "lastEnrichedAt" IS NULL
        OR COALESCE("lastContentRefreshAt", '') > COALESCE("lastEnrichedAt", '')
        OR "lastEnrichedAt" <= ?
      THEN 1
      ELSE 0
    END
  `;
  const confidenceSelect = args.confidenceColumn
    ? `,
        SUM(CASE WHEN COALESCE("${args.confidenceColumn}", '') = 'high' THEN 1 ELSE 0 END) AS highConfidenceCount,
        SUM(CASE WHEN COALESCE("${args.confidenceColumn}", '') = 'medium' THEN 1 ELSE 0 END) AS mediumConfidenceCount,
        SUM(CASE WHEN COALESCE("${args.confidenceColumn}", '') = 'low' THEN 1 ELSE 0 END) AS lowConfidenceCount,
        SUM(CASE WHEN COALESCE("${args.confidenceColumn}", '') NOT IN ('high', 'medium', 'low') THEN 1 ELSE 0 END) AS unknownConfidenceCount`
    : "";
  const rows = await prisma.$queryRawUnsafe<CatalogCoverageRow[]>(
    `
      SELECT
        NULLIF(TRIM(COALESCE("${args.column}", '')), '') AS value,
        COUNT(*) AS channelCount,
        SUM(CASE WHEN COALESCE(TRIM("contactEmail"), '') <> '' THEN 1 ELSE 0 END) AS emailCount,
        SUM(CASE WHEN COALESCE("lastMetricsRefreshAt", '') <= ? THEN 1 ELSE 0 END) AS staleMetricsCount,
        SUM(${staleEnrichmentSql}) AS staleEnrichmentCount
        ${confidenceSelect}
      FROM "ChannelCatalog"
      GROUP BY NULLIF(TRIM(COALESCE("${args.column}", '')), '')
      ORDER BY COUNT(*) DESC, value ASC
      LIMIT ?
    `,
    args.refreshCutoff,
    args.enrichCutoff,
    args.limit
  );

  return rows.map((row) => ({
    key: row.value,
    label: row.value ?? "Unknown",
    channel_count: Number(row.channelCount ?? 0),
    email_count: Number(row.emailCount ?? 0),
    stale_metrics_count: Number(row.staleMetricsCount ?? 0),
    stale_enrichment_count: Number(row.staleEnrichmentCount ?? 0),
    confidence_breakdown: args.confidenceColumn
      ? {
          high: Number(row.highConfidenceCount ?? 0),
          medium: Number(row.mediumConfidenceCount ?? 0),
          low: Number(row.lowConfidenceCount ?? 0),
          unknown: Number(row.unknownConfidenceCount ?? 0)
        }
      : null
  }));
}

async function listCatalogStaleChannels(args: {
  kind: "refresh" | "enrich";
  staleAfterDays: number;
  limit: number;
}) {
  const cutoff = new Date(
    Date.now() - args.staleAfterDays * 24 * 60 * 60 * 1000
  ).toISOString();
  const whereSql =
    args.kind === "refresh"
      ? `WHERE COALESCE("lastMetricsRefreshAt", '') <= ?`
      : `WHERE "estimatedCategory" IS NULL
          OR "estimatedType" IS NULL
          OR COALESCE(TRIM("countryInferred"), '') = ''
          OR COALESCE(TRIM("languageCode"), '') = ''
          OR COALESCE(TRIM("countryConfidence"), '') = ''
          OR COALESCE(TRIM("languageConfidence"), '') = ''
          OR "lastEnrichedAt" IS NULL
          OR COALESCE("lastContentRefreshAt", '') > COALESCE("lastEnrichedAt", '')
          OR "lastEnrichedAt" <= ?`;

  const rows = await prisma.$queryRawUnsafe<CatalogStaleChannelRow[]>(
    `
      SELECT
        "channelId",
        "channelName",
        "channelUrl",
        "subscriberCount",
        "daysSinceLastUpload",
        "countryInferred",
        "countryConfidence",
        "languageCode",
        "languageConfidence",
        "estimatedCategory",
        "estimatedType",
        "lastMetricsRefreshAt",
        "lastEnrichedAt"
      FROM "ChannelCatalog"
      ${whereSql}
      ORDER BY "subscriberCount" DESC, "channelName" ASC
      LIMIT ?
    `,
    cutoff,
    args.limit
  );

  return rows.map(mapCatalogStaleChannelRow);
}

function mapCatalogRow(row: CatalogChannelRow) {
  return {
    channel_id: row.channelId,
    channel_name: row.channelName,
    channel_url: row.channelUrl,
    metrics: {
      subscriber_count: Number(row.subscriberCount ?? 0),
      min_views_last_n: Number(row.minViewsLastN ?? 0),
      avg_views_last_n: Number(row.avgViewsLastN ?? 0),
      engagement_rate_last_n: Number(row.engagementRateLastN ?? 0),
      days_since_last_upload: Number(row.daysSinceLastUpload ?? 9999)
    },
    enrichment: {
      country_inferred: row.countryInferred,
      country_confidence: normalizeLocaleConfidence(row.countryConfidence),
      language_code: row.languageCode,
      language_detected: row.languageDetected,
      language_confidence: normalizeLocaleConfidence(row.languageConfidence),
      estimated_category: row.estimatedCategory,
      estimated_type: row.estimatedType
    },
    contact: {
      email: row.contactEmail,
      source: row.contactEmailSource
    },
    freshness: {
      first_seen_at: row.firstSeenAt,
      last_seen_at: row.lastSeenAt,
      last_content_refresh_at: row.lastContentRefreshAt,
      last_metrics_refresh_at: row.lastMetricsRefreshAt,
      last_enriched_at: row.lastEnrichedAt
    },
    score: {
      final_score:
        row.scoreFinal === null || row.scoreFinal === undefined
          ? null
          : Number(row.scoreFinal)
    }
  };
}

async function getCatalogVideoRows(channelId: string) {
  return prisma.$queryRawUnsafe<
    Array<{
      videoId: string;
      title: string;
      description: string;
      views: number;
      likes: number;
      comments: number;
      publishedAt: string | null;
      emailFound: number;
      emailSource: string | null;
      scannedAt: string;
    }>
  >(
    `
      SELECT
        "videoId",
        "title",
        "description",
        "views",
        "likes",
        "comments",
        "publishedAt",
        "emailFound",
        "emailSource",
        "scannedAt"
      FROM "ChannelVideoSample"
      WHERE "channelId" = ?
      ORDER BY COALESCE("publishedAt", "scannedAt") DESC
    `,
    channelId
  );
}

function mapCatalogVideos(
  videos: Array<{
    videoId: string;
    title: string;
    description: string;
    views: number;
    likes: number;
    comments: number;
    publishedAt: string | null;
    emailFound: number;
    emailSource: string | null;
    scannedAt: string;
  }>
) {
  return videos.map((video) => ({
    video_id: video.videoId,
    title: video.title,
    description: video.description,
    views: Number(video.views ?? 0),
    likes: Number(video.likes ?? 0),
    comments: Number(video.comments ?? 0),
    published_at: video.publishedAt,
    email_found: Number(video.emailFound ?? 0) > 0,
    email_source: video.emailSource,
    scanned_at: video.scannedAt
  }));
}

async function backfillCatalogFromRunsIfEmpty() {
  if (!backfillCatalogPromise) {
    backfillCatalogPromise = (async () => {
      await ensureCatalogTables();

      const countRows = await prisma.$queryRawUnsafe<CountRow[]>(
        `SELECT COUNT(*) AS count FROM "ChannelCatalog"`
      );
      if (Number(countRows[0]?.count ?? 0) > 0) return;

      const runs = await prisma.run.findMany({
        orderBy: { createdAt: "asc" },
        include: { results: true }
      });
      if (runs.length === 0) return;

      const enrichments = await prisma.runResultEnrichment.findMany();
      const enrichmentByKey = new Map(
        enrichments.map((row) => [`${row.runId}:${row.channelId}`, row] as const)
      );

      for (const run of runs) {
        for (const result of run.results) {
          const enrichment = enrichmentByKey.get(`${run.id}:${result.channelId}`);
          const raw =
            enrichment?.raw && typeof enrichment.raw === "object" ? enrichment.raw : null;
          const contact = getBackfillContact(raw);
          const youtubeContext =
            raw &&
            typeof (raw as { youtubeContext?: unknown }).youtubeContext === "object" &&
            (raw as { youtubeContext?: unknown }).youtubeContext !== null
              ? ((raw as {
                  youtubeContext?: {
                    description?: unknown;
                    titles?: unknown;
                    descriptions?: unknown;
                  };
                }).youtubeContext ?? null)
              : null;
          const recentViews = Array.isArray(result.recentViews)
            ? result.recentViews
                .map((value) => Number(value))
                .filter((value) => Number.isFinite(value))
            : [];

          await upsertCatalogChannelSnapshotRow({
            channelId: result.channelId,
            channelName: result.channelName,
            channelUrl: result.channelUrl,
            channelDescription:
              raw &&
              typeof (raw as { youtubeContext?: { description?: unknown } }).youtubeContext
                ?.description === "string"
                ? String(
                    (raw as { youtubeContext?: { description?: unknown } }).youtubeContext
                      ?.description
                  )
                : null,
            subscriberCount: result.subscriberCount,
            minViewsLastN: recentViews.length > 0 ? Math.min(...recentViews) : 0,
            avgViewsLastN: result.avgViewsLastN,
            engagementRateLastN: 0,
            daysSinceLastUpload: result.daysSinceLastUpload,
            countryInferred: run.region,
            countryConfidence: "low",
            languageCode: run.language,
            languageConfidence: "low",
            contactEmail: contact.email,
            contactEmailSource: contact.source,
            contentFingerprint: buildChannelContentFingerprint({
              description:
                youtubeContext && typeof youtubeContext.description === "string"
                  ? youtubeContext.description
                  : null,
              titles:
                youtubeContext && Array.isArray(youtubeContext.titles)
                  ? youtubeContext.titles.map((value) => String(value))
                  : [],
              descriptions:
                youtubeContext && Array.isArray(youtubeContext.descriptions)
                  ? youtubeContext.descriptions.map((value) => String(value))
                  : []
            }),
            scoreFinal: result.finalScore,
            scoreBreakdown: {
              base: result.scores,
              final: result.finalScore
            },
            lastRunId: run.id,
            observedAt: new Date(run.createdAt).toISOString()
          });

          if (enrichment) {
            const rawEnrichment =
              enrichment.raw && typeof enrichment.raw === "object" ? enrichment.raw : null;

            await applyCatalogChannelEnrichmentRow({
              channelId: result.channelId,
              estimatedCategory:
                rawEnrichment &&
                typeof (rawEnrichment as { estimated_category?: unknown }).estimated_category ===
                  "string"
                  ? String(
                      (rawEnrichment as { estimated_category?: unknown }).estimated_category
                    )
                  : null,
              estimatedType:
                rawEnrichment &&
                typeof (rawEnrichment as { estimated_type?: unknown }).estimated_type ===
                  "string"
                  ? String((rawEnrichment as { estimated_type?: unknown }).estimated_type)
                  : null,
              countryInferred:
                rawEnrichment &&
                typeof (rawEnrichment as { country_inferred?: unknown }).country_inferred ===
                  "string"
                  ? String((rawEnrichment as { country_inferred?: unknown }).country_inferred)
                  : null,
              countryConfidence:
                rawEnrichment &&
                typeof (rawEnrichment as { country_confidence?: unknown }).country_confidence ===
                  "string"
                  ? normalizeLocaleConfidence(
                      (rawEnrichment as { country_confidence?: unknown }).country_confidence
                    )
                  : null,
              languageCode:
                rawEnrichment &&
                typeof (rawEnrichment as { language_code?: unknown }).language_code === "string"
                  ? String((rawEnrichment as { language_code?: unknown }).language_code)
                  : null,
              languageDetected:
                typeof enrichment.languageDetected === "string"
                  ? enrichment.languageDetected
                  : rawEnrichment &&
                      typeof (rawEnrichment as { language_detected?: unknown }).language_detected ===
                        "string"
                    ? String(
                        (rawEnrichment as { language_detected?: unknown }).language_detected
                      )
                    : null,
              languageConfidence:
                rawEnrichment &&
                typeof (rawEnrichment as { language_confidence?: unknown }).language_confidence ===
                  "string"
                  ? normalizeLocaleConfidence(
                      (rawEnrichment as { language_confidence?: unknown }).language_confidence
                    )
                  : null,
              enrichedAt: new Date(enrichment.createdAt).toISOString()
            });
          }
        }
      }
    })();
  }

  await backfillCatalogPromise;
}

export async function listCatalogChannels(filters: CatalogListFilters) {
  await ensureCatalogTables();
  await backfillCatalogFromRunsIfEmpty();

  const page = Math.max(1, Math.trunc(normalizeOptionalNumber(filters.page) ?? 1));
  const perPage = Math.max(
    1,
    Math.min(100, Math.trunc(normalizeOptionalNumber(filters.perPage) ?? 50))
  );
  const offset = (page - 1) * perPage;

  const whereClauses: string[] = [];
  const params: Array<string | number> = [];

  const country = normalizeOptionalString(filters.country)?.toUpperCase();
  if (country) {
    whereClauses.push(`"countryInferred" = ?`);
    params.push(country);
  }

  const language = normalizeOptionalString(filters.language)?.toLowerCase();
  if (language) {
    whereClauses.push(`LOWER(COALESCE("languageCode", '')) = ?`);
    params.push(language);
  }

  const minSubscribers = normalizeOptionalNumber(filters.minSubscribers);
  if (minSubscribers !== undefined) {
    whereClauses.push(`"subscriberCount" >= ?`);
    params.push(minSubscribers);
  }

  const minAvgViews = normalizeOptionalNumber(filters.minAvgViews);
  if (minAvgViews !== undefined) {
    whereClauses.push(`"avgViewsLastN" >= ?`);
    params.push(minAvgViews);
  }

  const minEngagementRate = normalizeOptionalNumber(filters.minEngagementRate);
  if (minEngagementRate !== undefined) {
    whereClauses.push(`"engagementRateLastN" >= ?`);
    params.push(minEngagementRate);
  }

  const maxDaysSinceUpload = normalizeOptionalNumber(filters.maxDaysSinceUpload);
  if (maxDaysSinceUpload !== undefined) {
    whereClauses.push(`"daysSinceLastUpload" <= ?`);
    params.push(maxDaysSinceUpload);
  }

  const maxMetricsRefreshAgeDays = normalizeOptionalNumber(
    filters.maxMetricsRefreshAgeDays
  );
  if (maxMetricsRefreshAgeDays !== undefined) {
    whereClauses.push(`COALESCE("lastMetricsRefreshAt", '') >= ?`);
    params.push(getIsoCutoffDaysAgo(maxMetricsRefreshAgeDays));
  }

  const maxContentRefreshAgeDays = normalizeOptionalNumber(
    filters.maxContentRefreshAgeDays
  );
  if (maxContentRefreshAgeDays !== undefined) {
    whereClauses.push(`COALESCE("lastContentRefreshAt", "lastMetricsRefreshAt", '') >= ?`);
    params.push(getIsoCutoffDaysAgo(maxContentRefreshAgeDays));
  }

  const maxEnrichmentAgeDays = normalizeOptionalNumber(filters.maxEnrichmentAgeDays);
  if (maxEnrichmentAgeDays !== undefined) {
    whereClauses.push(`"lastEnrichedAt" IS NOT NULL`);
    whereClauses.push(`COALESCE("lastEnrichedAt", '') >= ?`);
    params.push(getIsoCutoffDaysAgo(maxEnrichmentAgeDays));
  }

  const estimatedCategory = normalizeOptionalString(filters.estimatedCategory);
  if (estimatedCategory) {
    whereClauses.push(`"estimatedCategory" = ?`);
    params.push(estimatedCategory);
  }

  const estimatedType = normalizeOptionalString(filters.estimatedType);
  if (estimatedType) {
    whereClauses.push(`"estimatedType" = ?`);
    params.push(estimatedType);
  }

  if (filters.emailFound === true) {
    whereClauses.push(`COALESCE(TRIM("contactEmail"), '') <> ''`);
  } else if (filters.emailFound === false) {
    whereClauses.push(`COALESCE(TRIM("contactEmail"), '') = ''`);
  }

  const minCountryConfidence = normalizeLocaleConfidence(filters.minCountryConfidence);
  if (minCountryConfidence) {
    whereClauses.push(`
      CASE COALESCE("countryConfidence", '')
        WHEN 'high' THEN 3
        WHEN 'medium' THEN 2
        WHEN 'low' THEN 1
        ELSE 0
      END >= ?
    `);
    params.push(
      minCountryConfidence === "high" ? 3 : minCountryConfidence === "medium" ? 2 : 1
    );
  }

  const minLanguageConfidence = normalizeLocaleConfidence(filters.minLanguageConfidence);
  if (minLanguageConfidence) {
    whereClauses.push(`
      CASE COALESCE("languageConfidence", '')
        WHEN 'high' THEN 3
        WHEN 'medium' THEN 2
        WHEN 'low' THEN 1
        ELSE 0
      END >= ?
    `);
    params.push(
      minLanguageConfidence === "high"
        ? 3
        : minLanguageConfidence === "medium"
          ? 2
          : 1
    );
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const sortColumnMap: Record<string, string> = {
    score_final: `"scoreFinal"`,
    subscribers: `"subscriberCount"`,
    avg_views: `"avgViewsLastN"`,
    engagement_rate: `"engagementRateLastN"`,
    days_since_last_upload: `"daysSinceLastUpload"`,
    last_refreshed: `"lastMetricsRefreshAt"`
  };
  const sortColumn = sortColumnMap[filters.sort ?? "score_final"] ?? `"scoreFinal"`;
  const sortDir = String(filters.sortDir ?? "desc").toLowerCase() === "asc" ? "ASC" : "DESC";

  const totalSql = `
    SELECT COUNT(*) AS count
    FROM "ChannelCatalog"
    ${whereSql}
  `;
  const rowsSql = `
    SELECT
      "channelId",
      "channelName",
      "channelUrl",
      "subscriberCount",
      "minViewsLastN",
      "avgViewsLastN",
      "engagementRateLastN",
      "daysSinceLastUpload",
      "countryInferred",
      "countryConfidence",
      "languageCode",
      "languageDetected",
      "languageConfidence",
      "estimatedCategory",
      "estimatedType",
      "contactEmail",
      "contactEmailSource",
      "scoreFinal",
      "scoreBreakdown",
      "firstSeenAt",
      "lastSeenAt",
      "lastContentRefreshAt",
      "lastMetricsRefreshAt",
      "lastEnrichedAt"
    FROM "ChannelCatalog"
    ${whereSql}
    ORDER BY ${sortColumn} ${sortDir}, "channelName" ASC
    LIMIT ? OFFSET ?
  `;

  const totalRows = await prisma.$queryRawUnsafe<CountRow[]>(totalSql, ...params);
  const rows = await prisma.$queryRawUnsafe<CatalogChannelRow[]>(
    rowsSql,
    ...params,
    perPage,
    offset
  );

  return {
    page,
    per_page: perPage,
    total: Number(totalRows[0]?.count ?? 0),
    results: rows.map(mapCatalogRow)
  };
}

export async function getCatalogChannelById(channelId: string) {
  await ensureCatalogTables();
  await backfillCatalogFromRunsIfEmpty();

  const rows = await prisma.$queryRawUnsafe<CatalogChannelMaintenanceRow[]>(
    `
      SELECT
        "channelId",
        "channelName",
        "channelUrl",
        "channelDescription",
        "subscriberCount",
        "minViewsLastN",
        "avgViewsLastN",
        "engagementRateLastN",
        "daysSinceLastUpload",
        "countryInferred",
        "countryConfidence",
        "languageCode",
        "languageDetected",
        "languageConfidence",
        "estimatedCategory",
        "estimatedType",
        "contactEmail",
        "contactEmailSource",
        "scoreFinal",
        "scoreBreakdown",
        "lastRunId",
        "firstSeenAt",
        "lastSeenAt",
        "lastContentRefreshAt",
        "lastMetricsRefreshAt",
        "lastEnrichedAt"
      FROM "ChannelCatalog"
      WHERE "channelId" = ?
      LIMIT 1
    `,
    channelId
  );

  const row = rows[0];
  if (!row) return null;

  const [videos, discoveryEvents] = await Promise.all([
    getCatalogVideoRows(channelId),
    prisma.$queryRawUnsafe<ChannelDiscoveryEventRow[]>(
      `
        SELECT
          "id",
          "runId",
          "discoveredAt",
          "seedRegion",
          "seedLanguage",
          "seedKeywords",
          "source"
        FROM "ChannelDiscoveryEvent"
        WHERE "channelId" = ?
        ORDER BY "discoveredAt" DESC
        LIMIT 25
      `,
      channelId
    )
  ]);

  return {
    ...mapCatalogRow(row),
    channel_description: row.channelDescription,
    score: {
      final_score:
        row.scoreFinal === null || row.scoreFinal === undefined
          ? null
          : Number(row.scoreFinal),
      breakdown: parseScoreBreakdown(row.scoreBreakdown)
    },
    provenance: {
      last_run_id: row.lastRunId ?? null,
      discovery_events: discoveryEvents.map((event) => ({
        id: event.id,
        run_id: event.runId,
        discovered_at: event.discoveredAt,
        seed_region: event.seedRegion,
        seed_language: event.seedLanguage,
        seed_keywords: event.seedKeywords
          ? (() => {
              try {
                const parsed = JSON.parse(event.seedKeywords);
                return Array.isArray(parsed)
                  ? parsed.filter((value): value is string => typeof value === "string")
                  : [];
              } catch {
                return [];
              }
            })()
          : [],
        source: event.source
      }))
    },
    videos: mapCatalogVideos(videos)
  };
}

export async function listSavedSegments() {
  await ensureCatalogTables();

  const rows = await prisma.$queryRawUnsafe<SavedSegmentRow[]>(
    `
      SELECT
        "id",
        "name",
        "filtersJson",
        "createdAt",
        "updatedAt",
        "lastUsedAt"
      FROM "SavedSegment"
      ORDER BY COALESCE("lastUsedAt", "updatedAt", "createdAt") DESC, "name" ASC
    `
  );

  return rows.map(mapSavedSegmentRow);
}

export async function createSavedSegment(args: {
  name: string;
  filters: CatalogSegmentFilters;
}) {
  await ensureCatalogTables();

  const now = new Date().toISOString();
  const id = randomUUID();
  const filtersJson = JSON.stringify(sanitizeSavedSegmentFilters(args.filters));

  await prisma.$executeRaw`
    INSERT INTO "SavedSegment" (
      "id",
      "name",
      "filtersJson",
      "createdAt",
      "updatedAt",
      "lastUsedAt"
    )
    VALUES (
      ${id},
      ${args.name.trim()},
      ${filtersJson},
      ${now},
      ${now},
      NULL
    )
  `;

  const rows = await prisma.$queryRawUnsafe<SavedSegmentRow[]>(
    `
      SELECT
        "id",
        "name",
        "filtersJson",
        "createdAt",
        "updatedAt",
        "lastUsedAt"
      FROM "SavedSegment"
      WHERE "id" = ?
      LIMIT 1
    `,
    id
  );

  return mapSavedSegmentRow(rows[0]);
}

export async function updateSavedSegment(args: {
  id: string;
  name?: string;
  filters?: CatalogSegmentFilters;
}) {
  await ensureCatalogTables();

  const rows = await prisma.$queryRawUnsafe<SavedSegmentRow[]>(
    `
      SELECT
        "id",
        "name",
        "filtersJson",
        "createdAt",
        "updatedAt",
        "lastUsedAt"
      FROM "SavedSegment"
      WHERE "id" = ?
      LIMIT 1
    `,
    args.id
  );
  const existing = rows[0];
  if (!existing) return null;

  const now = new Date().toISOString();
  const nextName =
    typeof args.name === "string" && args.name.trim().length > 0
      ? args.name.trim()
      : existing.name;
  const nextFilters =
    args.filters === undefined
      ? existing.filtersJson
      : JSON.stringify(sanitizeSavedSegmentFilters(args.filters));

  await prisma.$executeRaw`
    UPDATE "SavedSegment"
    SET
      "name" = ${nextName},
      "filtersJson" = ${nextFilters},
      "updatedAt" = ${now}
    WHERE "id" = ${args.id}
  `;

  const updatedRows = await prisma.$queryRawUnsafe<SavedSegmentRow[]>(
    `
      SELECT
        "id",
        "name",
        "filtersJson",
        "createdAt",
        "updatedAt",
        "lastUsedAt"
      FROM "SavedSegment"
      WHERE "id" = ?
      LIMIT 1
    `,
    args.id
  );

  return mapSavedSegmentRow(updatedRows[0]);
}

export async function markSavedSegmentUsed(id: string) {
  await ensureCatalogTables();

  const now = new Date().toISOString();
  await prisma.$executeRaw`
    UPDATE "SavedSegment"
    SET
      "lastUsedAt" = ${now},
      "updatedAt" = ${now}
    WHERE "id" = ${id}
  `;

  const rows = await prisma.$queryRawUnsafe<SavedSegmentRow[]>(
    `
      SELECT
        "id",
        "name",
        "filtersJson",
        "createdAt",
        "updatedAt",
        "lastUsedAt"
      FROM "SavedSegment"
      WHERE "id" = ?
      LIMIT 1
    `,
    id
  );

  if (!rows[0]) return null;
  return mapSavedSegmentRow(rows[0]);
}

export async function deleteSavedSegment(id: string) {
  await ensureCatalogTables();

  const result = await prisma.$executeRaw`
    DELETE FROM "SavedSegment"
    WHERE "id" = ${id}
  `;

  return Number(result ?? 0) > 0;
}

export async function getCatalogCoverageSummary(args?: {
  limit?: number;
  refreshStaleAfterDays?: number;
  enrichStaleAfterDays?: number;
}) {
  await ensureCatalogTables();
  await backfillCatalogFromRunsIfEmpty();

  const limit = Math.max(1, Math.min(50, Math.trunc(Number(args?.limit ?? 10))));
  const refreshStaleAfterDays = Math.max(
    0,
    Math.trunc(Number(args?.refreshStaleAfterDays ?? 7))
  );
  const enrichStaleAfterDays = Math.max(
    0,
    Math.trunc(Number(args?.enrichStaleAfterDays ?? 14))
  );
  const refreshCutoff = new Date(
    Date.now() - refreshStaleAfterDays * 24 * 60 * 60 * 1000
  ).toISOString();
  const enrichCutoff = new Date(
    Date.now() - enrichStaleAfterDays * 24 * 60 * 60 * 1000
  ).toISOString();

  const [byCountry, byLanguage, byCategory] = await Promise.all([
    listCatalogCoverageBuckets({
      column: "countryInferred",
      confidenceColumn: "countryConfidence",
      limit,
      refreshCutoff,
      enrichCutoff
    }),
    listCatalogCoverageBuckets({
      column: "languageCode",
      confidenceColumn: "languageConfidence",
      limit,
      refreshCutoff,
      enrichCutoff
    }),
    listCatalogCoverageBuckets({
      column: "estimatedCategory",
      limit,
      refreshCutoff,
      enrichCutoff
    })
  ]);

  return {
    by_country: byCountry,
    by_language: byLanguage,
    by_category: byCategory
  };
}

export async function getCatalogStaleSummary(args?: {
  refreshStaleAfterDays?: number;
  enrichStaleAfterDays?: number;
  limit?: number;
}) {
  await ensureCatalogTables();
  await backfillCatalogFromRunsIfEmpty();

  const limit = Math.max(1, Math.min(100, Math.trunc(Number(args?.limit ?? 20))));
  const refreshStaleAfterDays = Math.max(
    0,
    Math.trunc(Number(args?.refreshStaleAfterDays ?? 7))
  );
  const enrichStaleAfterDays = Math.max(
    0,
    Math.trunc(Number(args?.enrichStaleAfterDays ?? 14))
  );

  const [refresh, enrich] = await Promise.all([
    listCatalogStaleChannels({
      kind: "refresh",
      staleAfterDays: refreshStaleAfterDays,
      limit
    }),
    listCatalogStaleChannels({
      kind: "enrich",
      staleAfterDays: enrichStaleAfterDays,
      limit
    })
  ]);

  return {
    refresh,
    enrich
  };
}

export async function getCatalogChannelMaintenanceContext(
  channelId: string
): Promise<CatalogMaintenanceChannel | null> {
  await ensureCatalogTables();
  await backfillCatalogFromRunsIfEmpty();

  const rows = await prisma.$queryRawUnsafe<CatalogChannelMaintenanceRow[]>(
    `
      SELECT
        "channelId",
        "channelName",
        "channelUrl",
        "channelDescription",
        "subscriberCount",
        "minViewsLastN",
        "avgViewsLastN",
        "engagementRateLastN",
        "daysSinceLastUpload",
        "countryInferred",
        "countryConfidence",
        "languageCode",
        "languageDetected",
        "languageConfidence",
        "estimatedCategory",
        "estimatedType",
        "contactEmail",
        "contactEmailSource",
        "scoreFinal",
        "scoreBreakdown",
        "firstSeenAt",
        "lastSeenAt",
        "lastContentRefreshAt",
        "lastMetricsRefreshAt",
        "lastEnrichedAt"
      FROM "ChannelCatalog"
      WHERE "channelId" = ?
      LIMIT 1
    `,
    channelId
  );

  const row = rows[0];
  if (!row) return null;

  const videos = await getCatalogVideoRows(channelId);

  return {
    ...mapCatalogRow(row),
    channel_description: row.channelDescription,
    videos: mapCatalogVideos(videos)
  };
}

async function listCatalogMaintenanceCandidates(args: {
  whereSql: string;
  params: Array<string | number>;
  limit: number;
}) {
  await ensureCatalogTables();
  await backfillCatalogFromRunsIfEmpty();

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      channelId: string;
      channelName: string;
      channelUrl: string;
      lastMetricsRefreshAt: string;
      lastEnrichedAt: string | null;
      subscriberCount: number;
    }>
  >(
    `
      SELECT
        "channelId",
        "channelName",
        "channelUrl",
        "lastMetricsRefreshAt",
        "lastEnrichedAt",
        "subscriberCount"
      FROM "ChannelCatalog"
      ${args.whereSql}
      ORDER BY "subscriberCount" DESC, "channelName" ASC
      LIMIT ?
    `,
    ...args.params,
    args.limit
  );

  return rows.map((row) => ({
    channel_id: row.channelId,
    channel_name: row.channelName,
    channel_url: row.channelUrl,
    last_metrics_refresh_at: row.lastMetricsRefreshAt,
    last_enriched_at: row.lastEnrichedAt,
    subscriber_count: Number(row.subscriberCount ?? 0)
  }));
}

export async function listCatalogChannelsNeedingRefresh(args?: {
  staleAfterDays?: number;
  limit?: number;
}) {
  const staleAfterDays = Math.max(0, Math.trunc(Number(args?.staleAfterDays ?? 7)));
  const limit = Math.max(1, Math.min(200, Math.trunc(Number(args?.limit ?? 50))));
  const cutoff = new Date(Date.now() - staleAfterDays * 24 * 60 * 60 * 1000).toISOString();

  return listCatalogMaintenanceCandidates({
    whereSql: `WHERE COALESCE("lastMetricsRefreshAt", '') <= ?`,
    params: [cutoff],
    limit
  });
}

export async function listCatalogChannelsNeedingEnrichment(args?: {
  staleAfterDays?: number;
  limit?: number;
  missingOnly?: boolean;
}) {
  const staleAfterDays = Math.max(0, Math.trunc(Number(args?.staleAfterDays ?? 14)));
  const limit = Math.max(1, Math.min(200, Math.trunc(Number(args?.limit ?? 50))));
  const cutoff = new Date(Date.now() - staleAfterDays * 24 * 60 * 60 * 1000).toISOString();

  const whereSql = args?.missingOnly
    ? `WHERE "estimatedCategory" IS NULL
        OR "estimatedType" IS NULL
        OR COALESCE(TRIM("countryInferred"), '') = ''
        OR COALESCE(TRIM("languageCode"), '') = ''
        OR COALESCE(TRIM("countryConfidence"), '') = ''
        OR COALESCE(TRIM("languageConfidence"), '') = ''
        OR "lastEnrichedAt" IS NULL`
    : `WHERE "estimatedCategory" IS NULL
        OR "estimatedType" IS NULL
        OR COALESCE(TRIM("countryInferred"), '') = ''
        OR COALESCE(TRIM("languageCode"), '') = ''
        OR COALESCE(TRIM("countryConfidence"), '') = ''
        OR COALESCE(TRIM("languageConfidence"), '') = ''
        OR "lastEnrichedAt" IS NULL
        OR COALESCE("lastContentRefreshAt", '') > COALESCE("lastEnrichedAt", '')
        OR "lastEnrichedAt" <= ?`;
  const params = args?.missingOnly ? [] : [cutoff];

  return listCatalogMaintenanceCandidates({
    whereSql,
    params,
    limit
  });
}
