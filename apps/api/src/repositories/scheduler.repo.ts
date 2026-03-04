import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "../db/prisma";
import { ensureCatalogTables } from "./catalog.repo";
import type { RunRequest } from "../schemas/run.schema";

export type CatalogJobType =
  | "discover"
  | "refresh_metrics"
  | "enrich"
  | "force_refresh"
  | "force_enrich";

export type CatalogJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "dead_letter";

type TableInfoRow = {
  name: string;
};

type DiscoverySeedRow = {
  id: string;
  name: string | null;
  keywordsJson: string;
  excludeKeywordsJson: string | null;
  region: string;
  language: string;
  minViews: number | null;
  minAvgViews: number | null;
  minEngagementRate: number | null;
  maxDaysSinceUpload: number | null;
  minSubscribers: number | null;
  videosToAnalyze: number | null;
  maxChannels: number | null;
  active: number;
  priority: number;
  estimatedQuotaUnits: number;
  maxAttempts: number;
  lastPlannedAt: string | null;
  lastDispatchedAt: string | null;
  lastSucceededAt: string | null;
  lastRunId: string | null;
  lastYieldChannels: number | null;
  lastNewChannels: number | null;
  lastError: string | null;
  lifetimeJobsPlanned: number;
  lifetimeJobsSucceeded: number;
  lifetimeChannelsFound: number;
  lifetimeNewChannelsFound: number;
  createdAt: string;
  updatedAt: string;
};

type CatalogJobRow = {
  id: string;
  type: string;
  status: string;
  priority: number;
  payloadJson: string;
  seedId: string | null;
  dedupeKey: string | null;
  quotaDay: string;
  estimatedQuotaUnits: number;
  reservedQuotaUnits: number;
  attempts: number;
  maxAttempts: number;
  nextRunAt: string;
  lockedBy: string | null;
  lockedAt: string | null;
  lockExpiresAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
  resultJson: string | null;
  deadLetteredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type QuotaLedgerRow = {
  day: string;
  budgetUnits: number;
  reserveUnits: number;
  reservedUnits: number;
  usedUnits: number;
  usedDiscoverUnits: number;
  usedRefreshUnits: number;
  usedEnrichUnits: number;
  usedForceRefreshUnits: number;
  usedForceEnrichUnits: number;
  updatedAt: string;
};

type CatalogJobAggregateRow = {
  type: string;
  status: string;
  count: number | string;
};

export type DiscoverySeedInput = RunRequest & {
  name?: string | null;
  active?: boolean;
  priority?: number;
  max_attempts?: number;
};

export type DiscoverySeedPatch = Partial<DiscoverySeedInput>;

export type CatalogJobInput = {
  type: CatalogJobType;
  payload: unknown;
  priority?: number;
  seedId?: string | null;
  dedupeKey?: string | null;
  quotaDay?: string;
  estimatedQuotaUnits?: number;
  reservedQuotaUnits?: number;
  maxAttempts?: number;
  nextRunAt?: string;
};

export type CatalogJobDispatchResult = {
  run_id?: string;
  result_count?: number;
  new_channels?: number;
  status_code?: number;
  response?: unknown;
};

export type CatalogWorkerHealth = {
  totals: {
    total_jobs: number;
    queued: number;
    running: number;
    succeeded: number;
    failed: number;
    dead_letter: number;
    stuck_running: number;
  };
  by_type: Record<
    CatalogJobType,
    {
      total: number;
      queued: number;
      running: number;
      succeeded: number;
      failed: number;
      dead_letter: number;
    }
  >;
  timing: {
    oldest_queued_at: string | null;
    oldest_running_at: string | null;
    next_run_at: string | null;
  };
  stuck_jobs: Array<{
    id: string;
    type: CatalogJobType;
    attempts: number;
    max_attempts: number;
    locked_by: string | null;
    locked_at: string | null;
    lock_expires_at: string | null;
    started_at: string | null;
    last_error: string | null;
    payload: unknown;
  }>;
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

let ensureSchedulerTablesPromise: Promise<void> | null = null;

function parseJsonObject<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeOptionalNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function getDailyQuotaBudget(): number {
  const configured = Number(process.env.SCHEDULER_DAILY_QUOTA_BUDGET ?? 10000);
  return Number.isFinite(configured) ? Math.max(0, Math.trunc(configured)) : 10000;
}

function getDailyQuotaReserve(budgetUnits: number): number {
  const configured = Number(process.env.SCHEDULER_DAILY_QUOTA_RESERVE ?? 1500);
  const reserve = Number.isFinite(configured) ? Math.max(0, Math.trunc(configured)) : 1500;
  return Math.min(budgetUnits, reserve);
}

function getSearchFallbackPassCount(): number {
  const configured = Number(process.env.DISCOVERY_SEARCH_FALLBACK_PASSES ?? 4);
  return Number.isFinite(configured) ? clampInt(configured, 1, 4) : 4;
}

function getSearchRequestUnits(): number {
  const configured = Number(process.env.YOUTUBE_SEARCH_REQUEST_QUOTA_UNITS ?? 100);
  return Number.isFinite(configured) ? Math.max(1, Math.trunc(configured)) : 100;
}

function getChannelDetailsUnits(): number {
  const configured = Number(process.env.YOUTUBE_CHANNEL_DETAILS_QUOTA_UNITS ?? 1);
  return Number.isFinite(configured) ? Math.max(1, Math.trunc(configured)) : 1;
}

function getRecentVideosUnitsPerChannel(): number {
  const configured = Number(process.env.YOUTUBE_RECENT_VIDEO_QUOTA_UNITS_PER_CHANNEL ?? 2);
  return Number.isFinite(configured) ? Math.max(1, Math.trunc(configured)) : 2;
}

function quotaUsageColumn(jobType: CatalogJobType): string {
  switch (jobType) {
    case "discover":
      return "usedDiscoverUnits";
    case "refresh_metrics":
      return "usedRefreshUnits";
    case "enrich":
      return "usedEnrichUnits";
    case "force_refresh":
      return "usedForceRefreshUnits";
    case "force_enrich":
      return "usedForceEnrichUnits";
  }
}

function isoNow(): string {
  return new Date().toISOString();
}

export function toQuotaDay(input?: string | Date): string {
  if (input instanceof Date) {
    return input.toISOString().slice(0, 10);
  }

  const normalized = String(input ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized;
  }

  return new Date().toISOString().slice(0, 10);
}

function mapDiscoverySeedRow(row: DiscoverySeedRow) {
  return {
    id: row.id,
    name: row.name,
    keywords: parseJsonObject<string[]>(row.keywordsJson, []),
    exclude_keywords: parseJsonObject<string[]>(row.excludeKeywordsJson, []),
    region: row.region,
    language: row.language,
    min_views: row.minViews,
    min_avg_views: row.minAvgViews,
    min_engagement_rate: row.minEngagementRate,
    max_days_since_upload: row.maxDaysSinceUpload,
    min_subscribers: row.minSubscribers,
    videos_to_analyze: row.videosToAnalyze,
    max_channels: row.maxChannels,
    active: Number(row.active ?? 0) > 0,
    priority: Number(row.priority ?? 0),
    estimated_quota_units: Number(row.estimatedQuotaUnits ?? 0),
    max_attempts: Number(row.maxAttempts ?? 3),
    last_planned_at: row.lastPlannedAt,
    last_dispatched_at: row.lastDispatchedAt,
    last_succeeded_at: row.lastSucceededAt,
    last_run_id: row.lastRunId,
    last_yield_channels: row.lastYieldChannels === null ? null : Number(row.lastYieldChannels),
    last_new_channels: row.lastNewChannels === null ? null : Number(row.lastNewChannels),
    last_error: row.lastError,
    lifetime_jobs_planned: Number(row.lifetimeJobsPlanned ?? 0),
    lifetime_jobs_succeeded: Number(row.lifetimeJobsSucceeded ?? 0),
    lifetime_channels_found: Number(row.lifetimeChannelsFound ?? 0),
    lifetime_new_channels_found: Number(row.lifetimeNewChannelsFound ?? 0),
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

function mapCatalogJobRow(row: CatalogJobRow) {
  return {
    id: row.id,
    type: row.type as CatalogJobType,
    status: row.status as CatalogJobStatus,
    priority: Number(row.priority ?? 0),
    seed_id: row.seedId,
    dedupe_key: row.dedupeKey,
    quota_day: row.quotaDay,
    estimated_quota_units: Number(row.estimatedQuotaUnits ?? 0),
    reserved_quota_units: Number(row.reservedQuotaUnits ?? 0),
    attempts: Number(row.attempts ?? 0),
    max_attempts: Number(row.maxAttempts ?? 3),
    payload: parseJsonObject<unknown>(row.payloadJson, null),
    result: parseJsonObject<unknown>(row.resultJson, null),
    next_run_at: row.nextRunAt,
    locked_by: row.lockedBy,
    locked_at: row.lockedAt,
    lock_expires_at: row.lockExpiresAt,
    started_at: row.startedAt,
    finished_at: row.finishedAt,
    last_error: row.lastError,
    dead_lettered_at: row.deadLetteredAt,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

function mapQuotaLedgerRow(row: QuotaLedgerRow) {
  const budget = Number(row.budgetUnits ?? 0);
  const reserve = Number(row.reserveUnits ?? 0);
  const reserved = Number(row.reservedUnits ?? 0);
  const used = Number(row.usedUnits ?? 0);
  const available = Math.max(0, budget - used - reserved);
  const reservable = Math.max(0, available - reserve);

  return {
    day: row.day,
    budget_units: budget,
    reserve_units: reserve,
    reserved_units: reserved,
    used_units: used,
    available_units: available,
    reservable_units: reservable,
    used_breakdown: {
      discover: Number(row.usedDiscoverUnits ?? 0),
      refresh_metrics: Number(row.usedRefreshUnits ?? 0),
      enrich: Number(row.usedEnrichUnits ?? 0),
      force_refresh: Number(row.usedForceRefreshUnits ?? 0),
      force_enrich: Number(row.usedForceEnrichUnits ?? 0)
    },
    updated_at: row.updatedAt
  };
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

export async function ensureSchedulerTables(): Promise<void> {
  if (!ensureSchedulerTablesPromise) {
    ensureSchedulerTablesPromise = prisma
      .$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "CatalogJob" (
          "id" TEXT PRIMARY KEY,
          "type" TEXT NOT NULL,
          "status" TEXT NOT NULL,
          "priority" INTEGER NOT NULL DEFAULT 0,
          "payloadJson" TEXT NOT NULL,
          "seedId" TEXT,
          "dedupeKey" TEXT,
          "quotaDay" TEXT NOT NULL,
          "estimatedQuotaUnits" INTEGER NOT NULL DEFAULT 0,
          "reservedQuotaUnits" INTEGER NOT NULL DEFAULT 0,
          "attempts" INTEGER NOT NULL DEFAULT 0,
          "maxAttempts" INTEGER NOT NULL DEFAULT 3,
          "nextRunAt" DATETIME NOT NULL,
          "lockedBy" TEXT,
          "lockedAt" DATETIME,
          "lockExpiresAt" DATETIME,
          "startedAt" DATETIME,
          "finishedAt" DATETIME,
          "lastError" TEXT,
          "resultJson" TEXT,
          "deadLetteredAt" DATETIME,
          "createdAt" DATETIME NOT NULL,
          "updatedAt" DATETIME NOT NULL
        )
      `)
      .then(async () =>
        prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "DiscoverySeed" (
            "id" TEXT PRIMARY KEY,
            "name" TEXT,
            "keywordsJson" TEXT NOT NULL,
            "excludeKeywordsJson" TEXT,
            "region" TEXT NOT NULL,
            "language" TEXT NOT NULL,
            "minViews" INTEGER,
            "minAvgViews" INTEGER,
            "minEngagementRate" REAL,
            "maxDaysSinceUpload" INTEGER,
            "minSubscribers" INTEGER,
            "videosToAnalyze" INTEGER,
            "maxChannels" INTEGER,
            "active" INTEGER NOT NULL DEFAULT 1,
            "priority" INTEGER NOT NULL DEFAULT 0,
            "estimatedQuotaUnits" INTEGER NOT NULL DEFAULT 0,
            "maxAttempts" INTEGER NOT NULL DEFAULT 3,
            "lastPlannedAt" DATETIME,
            "lastDispatchedAt" DATETIME,
            "lastSucceededAt" DATETIME,
            "lastRunId" TEXT,
            "lastYieldChannels" INTEGER,
            "lastNewChannels" INTEGER,
            "lastError" TEXT,
            "lifetimeJobsPlanned" INTEGER NOT NULL DEFAULT 0,
            "lifetimeJobsSucceeded" INTEGER NOT NULL DEFAULT 0,
            "lifetimeChannelsFound" INTEGER NOT NULL DEFAULT 0,
            "lifetimeNewChannelsFound" INTEGER NOT NULL DEFAULT 0,
            "createdAt" DATETIME NOT NULL,
            "updatedAt" DATETIME NOT NULL
          )
        `)
      )
      .then(async () =>
        prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "QuotaLedger" (
            "day" TEXT PRIMARY KEY,
            "budgetUnits" INTEGER NOT NULL,
            "reserveUnits" INTEGER NOT NULL,
            "reservedUnits" INTEGER NOT NULL DEFAULT 0,
            "usedUnits" INTEGER NOT NULL DEFAULT 0,
            "usedDiscoverUnits" INTEGER NOT NULL DEFAULT 0,
            "usedRefreshUnits" INTEGER NOT NULL DEFAULT 0,
            "usedEnrichUnits" INTEGER NOT NULL DEFAULT 0,
            "usedForceRefreshUnits" INTEGER NOT NULL DEFAULT 0,
            "usedForceEnrichUnits" INTEGER NOT NULL DEFAULT 0,
            "updatedAt" DATETIME NOT NULL
          )
        `)
      )
      .then(async () => {
        await ensureMissingColumns("CatalogJob", [
          { name: "seedId", ddl: `"seedId" TEXT` },
          { name: "dedupeKey", ddl: `"dedupeKey" TEXT` },
          { name: "quotaDay", ddl: `"quotaDay" TEXT NOT NULL DEFAULT ''` },
          {
            name: "estimatedQuotaUnits",
            ddl: `"estimatedQuotaUnits" INTEGER NOT NULL DEFAULT 0`
          },
          {
            name: "reservedQuotaUnits",
            ddl: `"reservedQuotaUnits" INTEGER NOT NULL DEFAULT 0`
          },
          { name: "attempts", ddl: `"attempts" INTEGER NOT NULL DEFAULT 0` },
          { name: "maxAttempts", ddl: `"maxAttempts" INTEGER NOT NULL DEFAULT 3` },
          { name: "nextRunAt", ddl: `"nextRunAt" DATETIME` },
          { name: "lockedBy", ddl: `"lockedBy" TEXT` },
          { name: "lockedAt", ddl: `"lockedAt" DATETIME` },
          { name: "lockExpiresAt", ddl: `"lockExpiresAt" DATETIME` },
          { name: "startedAt", ddl: `"startedAt" DATETIME` },
          { name: "finishedAt", ddl: `"finishedAt" DATETIME` },
          { name: "lastError", ddl: `"lastError" TEXT` },
          { name: "resultJson", ddl: `"resultJson" TEXT` },
          { name: "deadLetteredAt", ddl: `"deadLetteredAt" DATETIME` },
          { name: "createdAt", ddl: `"createdAt" DATETIME` },
          { name: "updatedAt", ddl: `"updatedAt" DATETIME` }
        ]);

        await ensureMissingColumns("DiscoverySeed", [
          { name: "name", ddl: `"name" TEXT` },
          { name: "excludeKeywordsJson", ddl: `"excludeKeywordsJson" TEXT` },
          { name: "estimatedQuotaUnits", ddl: `"estimatedQuotaUnits" INTEGER NOT NULL DEFAULT 0` },
          { name: "maxAttempts", ddl: `"maxAttempts" INTEGER NOT NULL DEFAULT 3` },
          { name: "lastPlannedAt", ddl: `"lastPlannedAt" DATETIME` },
          { name: "lastDispatchedAt", ddl: `"lastDispatchedAt" DATETIME` },
          { name: "lastSucceededAt", ddl: `"lastSucceededAt" DATETIME` },
          { name: "lastRunId", ddl: `"lastRunId" TEXT` },
          { name: "lastYieldChannels", ddl: `"lastYieldChannels" INTEGER` },
          { name: "lastNewChannels", ddl: `"lastNewChannels" INTEGER` },
          { name: "lastError", ddl: `"lastError" TEXT` },
          {
            name: "lifetimeJobsPlanned",
            ddl: `"lifetimeJobsPlanned" INTEGER NOT NULL DEFAULT 0`
          },
          {
            name: "lifetimeJobsSucceeded",
            ddl: `"lifetimeJobsSucceeded" INTEGER NOT NULL DEFAULT 0`
          },
          {
            name: "lifetimeChannelsFound",
            ddl: `"lifetimeChannelsFound" INTEGER NOT NULL DEFAULT 0`
          },
          {
            name: "lifetimeNewChannelsFound",
            ddl: `"lifetimeNewChannelsFound" INTEGER NOT NULL DEFAULT 0`
          },
          { name: "createdAt", ddl: `"createdAt" DATETIME` },
          { name: "updatedAt", ddl: `"updatedAt" DATETIME` }
        ]);

        await ensureMissingColumns("QuotaLedger", [
          { name: "reserveUnits", ddl: `"reserveUnits" INTEGER NOT NULL DEFAULT 0` },
          { name: "reservedUnits", ddl: `"reservedUnits" INTEGER NOT NULL DEFAULT 0` },
          { name: "usedDiscoverUnits", ddl: `"usedDiscoverUnits" INTEGER NOT NULL DEFAULT 0` },
          { name: "usedRefreshUnits", ddl: `"usedRefreshUnits" INTEGER NOT NULL DEFAULT 0` },
          { name: "usedEnrichUnits", ddl: `"usedEnrichUnits" INTEGER NOT NULL DEFAULT 0` },
          {
            name: "usedForceRefreshUnits",
            ddl: `"usedForceRefreshUnits" INTEGER NOT NULL DEFAULT 0`
          },
          {
            name: "usedForceEnrichUnits",
            ddl: `"usedForceEnrichUnits" INTEGER NOT NULL DEFAULT 0`
          },
          { name: "updatedAt", ddl: `"updatedAt" DATETIME` }
        ]);
      })
      .then(async () =>
        Promise.all([
          prisma.$executeRawUnsafe(
            `CREATE INDEX IF NOT EXISTS "CatalogJob_status_nextRunAt_idx" ON "CatalogJob"("status", "nextRunAt")`
          ),
          prisma.$executeRawUnsafe(
            `CREATE INDEX IF NOT EXISTS "CatalogJob_seedId_idx" ON "CatalogJob"("seedId")`
          ),
          prisma.$executeRawUnsafe(
            `CREATE UNIQUE INDEX IF NOT EXISTS "CatalogJob_dedupeKey_idx" ON "CatalogJob"("dedupeKey")`
          ),
          prisma.$executeRawUnsafe(
            `CREATE INDEX IF NOT EXISTS "DiscoverySeed_active_priority_idx" ON "DiscoverySeed"("active", "priority")`
          )
        ])
      )
      .then(() => undefined);
  }

  await ensureSchedulerTablesPromise;
}

export function estimateDiscoverQuotaUnits(input: Pick<RunRequest, "keywords" | "max_channels">) {
  const keywordCount =
    Array.isArray(input.keywords) && input.keywords.length > 0
      ? input.keywords.length
      : GENERAL_DISCOVERY_KEYWORDS.length;
  const safeMaxChannels = Math.max(1, Math.min(Number(input.max_channels) || 25, 50));
  const searchUnits = keywordCount * getSearchFallbackPassCount() * getSearchRequestUnits();
  const detailUnits = Math.ceil(safeMaxChannels / 50) * getChannelDetailsUnits();
  const recentVideoUnits = safeMaxChannels * getRecentVideosUnitsPerChannel();

  return searchUnits + detailUnits + recentVideoUnits;
}

export function estimateRefreshQuotaUnits() {
  return getChannelDetailsUnits() + getRecentVideosUnitsPerChannel();
}

export function estimateEnrichQuotaUnits() {
  return estimateRefreshQuotaUnits();
}

async function ensureQuotaLedger(day: string): Promise<void> {
  await ensureSchedulerTables();

  const budgetUnits = getDailyQuotaBudget();
  const reserveUnits = getDailyQuotaReserve(budgetUnits);
  const now = isoNow();

  await prisma.$executeRaw`
    INSERT INTO "QuotaLedger" (
      "day",
      "budgetUnits",
      "reserveUnits",
      "reservedUnits",
      "usedUnits",
      "usedDiscoverUnits",
      "usedRefreshUnits",
      "usedEnrichUnits",
      "usedForceRefreshUnits",
      "usedForceEnrichUnits",
      "updatedAt"
    )
    VALUES (
      ${day},
      ${budgetUnits},
      ${reserveUnits},
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      ${now}
    )
    ON CONFLICT("day") DO UPDATE SET
      "budgetUnits" = COALESCE("QuotaLedger"."budgetUnits", excluded."budgetUnits"),
      "reserveUnits" = COALESCE("QuotaLedger"."reserveUnits", excluded."reserveUnits"),
      "updatedAt" = ${now}
  `;
}

export async function getQuotaLedger(dayInput?: string) {
  const day = toQuotaDay(dayInput);
  await ensureQuotaLedger(day);

  const rows = await prisma.$queryRawUnsafe<QuotaLedgerRow[]>(
    `SELECT * FROM "QuotaLedger" WHERE "day" = ? LIMIT 1`,
    day
  );

  return mapQuotaLedgerRow(rows[0]);
}

export async function reserveQuotaUnits(args: {
  day?: string;
  units: number;
  ignoreReserve?: boolean;
}) {
  const day = toQuotaDay(args.day);
  const units = Math.max(0, Math.trunc(args.units));
  const ignoreReserve = args.ignoreReserve === true;

  if (units === 0) {
    return {
      ok: true,
      quota: await getQuotaLedger(day)
    };
  }

  await ensureQuotaLedger(day);

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe<QuotaLedgerRow[]>(
      `SELECT * FROM "QuotaLedger" WHERE "day" = ? LIMIT 1`,
      day
    );
    const row = rows[0];
    const budget = Number(row?.budgetUnits ?? 0);
    const reserve = Number(row?.reserveUnits ?? 0);
    const reserved = Number(row?.reservedUnits ?? 0);
    const used = Number(row?.usedUnits ?? 0);
    const availableAfterReservation = budget - used - reserved - units;

    if (!ignoreReserve && availableAfterReservation < reserve) {
      return {
        ok: false,
        reason: "quota_reserve",
        quota: mapQuotaLedgerRow(row)
      };
    }

    const updatedAt = isoNow();
    await tx.$executeRaw`
      UPDATE "QuotaLedger"
      SET
        "reservedUnits" = "reservedUnits" + ${units},
        "updatedAt" = ${updatedAt}
      WHERE "day" = ${day}
    `;

    const updatedRows = await tx.$queryRawUnsafe<QuotaLedgerRow[]>(
      `SELECT * FROM "QuotaLedger" WHERE "day" = ? LIMIT 1`,
      day
    );

    return {
      ok: true,
      quota: mapQuotaLedgerRow(updatedRows[0])
    };
  });
}

export async function releaseReservedQuotaUnits(args: { day?: string; units: number }) {
  const day = toQuotaDay(args.day);
  const units = Math.max(0, Math.trunc(args.units));
  await ensureQuotaLedger(day);

  if (units === 0) {
    return getQuotaLedger(day);
  }

  await prisma.$executeRaw`
    UPDATE "QuotaLedger"
    SET
      "reservedUnits" = MAX(0, "reservedUnits" - ${units}),
      "updatedAt" = ${isoNow()}
    WHERE "day" = ${day}
  `;

  return getQuotaLedger(day);
}

export async function consumeReservedQuotaUnits(args: {
  day?: string;
  type: CatalogJobType;
  reservedUnits: number;
  usedUnits?: number;
}) {
  const day = toQuotaDay(args.day);
  const reservedUnits = Math.max(0, Math.trunc(args.reservedUnits));
  const usedUnits = Math.max(0, Math.trunc(args.usedUnits ?? reservedUnits));
  const usageColumn = quotaUsageColumn(args.type);
  await ensureQuotaLedger(day);

  await prisma.$executeRawUnsafe(
    `
      UPDATE "QuotaLedger"
      SET
        "reservedUnits" = MAX(0, "reservedUnits" - ?),
        "usedUnits" = "usedUnits" + ?,
        "${usageColumn}" = "${usageColumn}" + ?,
        "updatedAt" = ?
      WHERE "day" = ?
    `,
    reservedUnits,
    usedUnits,
    usedUnits,
    isoNow(),
    day
  );

  return getQuotaLedger(day);
}

function buildDiscoverySeedRecord(input: DiscoverySeedInput) {
  const keywords = Array.isArray(input.keywords) ? input.keywords : [];
  const excludeKeywords = Array.isArray(input.exclude_keywords) ? input.exclude_keywords : [];
  const estimatedQuotaUnits = estimateDiscoverQuotaUnits({
    keywords,
    max_channels: input.max_channels
  });

  return {
    name: normalizeOptionalString(input.name),
    keywordsJson: JSON.stringify(keywords),
    excludeKeywordsJson: excludeKeywords.length > 0 ? JSON.stringify(excludeKeywords) : null,
    region: String(input.region),
    language: String(input.language),
    minViews: normalizeOptionalNumber(input.min_views),
    minAvgViews: normalizeOptionalNumber(input.min_avg_views),
    minEngagementRate: normalizeOptionalNumber(input.min_engagement_rate),
    maxDaysSinceUpload: normalizeOptionalNumber(input.max_days_since_upload),
    minSubscribers: normalizeOptionalNumber(input.min_subscribers),
    videosToAnalyze: normalizeOptionalNumber(input.videos_to_analyze),
    maxChannels: normalizeOptionalNumber(input.max_channels),
    active: input.active === false ? 0 : 1,
    priority: clampInt(Number(input.priority ?? 0), -100, 100),
    estimatedQuotaUnits,
    maxAttempts: clampInt(Number(input.max_attempts ?? 3), 1, 10)
  };
}

export async function createDiscoverySeed(input: DiscoverySeedInput) {
  await ensureSchedulerTables();

  const record = buildDiscoverySeedRecord(input);
  const now = isoNow();
  const id = randomUUID();

  await prisma.$executeRaw`
    INSERT INTO "DiscoverySeed" (
      "id",
      "name",
      "keywordsJson",
      "excludeKeywordsJson",
      "region",
      "language",
      "minViews",
      "minAvgViews",
      "minEngagementRate",
      "maxDaysSinceUpload",
      "minSubscribers",
      "videosToAnalyze",
      "maxChannels",
      "active",
      "priority",
      "estimatedQuotaUnits",
      "maxAttempts",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${id},
      ${record.name},
      ${record.keywordsJson},
      ${record.excludeKeywordsJson},
      ${record.region},
      ${record.language},
      ${record.minViews},
      ${record.minAvgViews},
      ${record.minEngagementRate},
      ${record.maxDaysSinceUpload},
      ${record.minSubscribers},
      ${record.videosToAnalyze},
      ${record.maxChannels},
      ${record.active},
      ${record.priority},
      ${record.estimatedQuotaUnits},
      ${record.maxAttempts},
      ${now},
      ${now}
    )
  `;

  return getDiscoverySeedById(id);
}

export async function getDiscoverySeedById(seedId: string) {
  await ensureSchedulerTables();

  const rows = await prisma.$queryRawUnsafe<DiscoverySeedRow[]>(
    `SELECT * FROM "DiscoverySeed" WHERE "id" = ? LIMIT 1`,
    seedId
  );

  return rows[0] ? mapDiscoverySeedRow(rows[0]) : null;
}

export async function updateDiscoverySeed(seedId: string, patch: DiscoverySeedPatch) {
  await ensureSchedulerTables();

  const currentRows = await prisma.$queryRawUnsafe<DiscoverySeedRow[]>(
    `SELECT * FROM "DiscoverySeed" WHERE "id" = ? LIMIT 1`,
    seedId
  );
  const current = currentRows[0];
  if (!current) return null;

  const merged: DiscoverySeedInput = {
    name: patch.name ?? current.name,
    keywords:
      patch.keywords ??
      parseJsonObject<string[]>(current.keywordsJson, []),
    exclude_keywords:
      patch.exclude_keywords ??
      parseJsonObject<string[]>(current.excludeKeywordsJson, []),
    region: patch.region ?? current.region,
    language: patch.language ?? current.language,
    min_views:
      patch.min_views !== undefined ? patch.min_views : current.minViews ?? undefined,
    min_avg_views:
      patch.min_avg_views !== undefined ? patch.min_avg_views : current.minAvgViews ?? undefined,
    min_engagement_rate:
      patch.min_engagement_rate !== undefined
        ? patch.min_engagement_rate
        : current.minEngagementRate ?? undefined,
    max_days_since_upload:
      patch.max_days_since_upload !== undefined
        ? patch.max_days_since_upload
        : current.maxDaysSinceUpload ?? undefined,
    min_subscribers:
      patch.min_subscribers !== undefined
        ? patch.min_subscribers
        : current.minSubscribers ?? undefined,
    videos_to_analyze:
      patch.videos_to_analyze !== undefined
        ? patch.videos_to_analyze
        : current.videosToAnalyze ?? undefined,
    max_channels:
      patch.max_channels !== undefined ? patch.max_channels : current.maxChannels ?? undefined,
    active:
      patch.active !== undefined ? patch.active : Number(current.active ?? 0) > 0,
    priority:
      patch.priority !== undefined ? patch.priority : Number(current.priority ?? 0),
    max_attempts:
      patch.max_attempts !== undefined ? patch.max_attempts : Number(current.maxAttempts ?? 3)
  };
  const record = buildDiscoverySeedRecord(merged);

  await prisma.$executeRaw`
    UPDATE "DiscoverySeed"
    SET
      "name" = ${record.name},
      "keywordsJson" = ${record.keywordsJson},
      "excludeKeywordsJson" = ${record.excludeKeywordsJson},
      "region" = ${record.region},
      "language" = ${record.language},
      "minViews" = ${record.minViews},
      "minAvgViews" = ${record.minAvgViews},
      "minEngagementRate" = ${record.minEngagementRate},
      "maxDaysSinceUpload" = ${record.maxDaysSinceUpload},
      "minSubscribers" = ${record.minSubscribers},
      "videosToAnalyze" = ${record.videosToAnalyze},
      "maxChannels" = ${record.maxChannels},
      "active" = ${record.active},
      "priority" = ${record.priority},
      "estimatedQuotaUnits" = ${record.estimatedQuotaUnits},
      "maxAttempts" = ${record.maxAttempts},
      "updatedAt" = ${isoNow()}
    WHERE "id" = ${seedId}
  `;

  return getDiscoverySeedById(seedId);
}

export async function listDiscoverySeeds(filters?: { active?: boolean }) {
  await ensureSchedulerTables();

  const params: Array<number> = [];
  const whereClauses: string[] = [];

  if (filters?.active === true) {
    whereClauses.push(`"active" = ?`);
    params.push(1);
  } else if (filters?.active === false) {
    whereClauses.push(`"active" = ?`);
    params.push(0);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
  const rows = await prisma.$queryRawUnsafe<DiscoverySeedRow[]>(
    `
      SELECT *
      FROM "DiscoverySeed"
      ${whereSql}
      ORDER BY "priority" DESC, COALESCE("lastSucceededAt", "lastPlannedAt", "createdAt") ASC
    `,
    ...params
  );

  return rows.map(mapDiscoverySeedRow);
}

export async function noteDiscoverySeedPlanned(seedId: string, plannedAt?: string) {
  await ensureSchedulerTables();

  await prisma.$executeRaw`
    UPDATE "DiscoverySeed"
    SET
      "lastPlannedAt" = ${plannedAt ?? isoNow()},
      "lifetimeJobsPlanned" = "lifetimeJobsPlanned" + 1,
      "updatedAt" = ${isoNow()}
    WHERE "id" = ${seedId}
  `;
}

export async function recordDiscoverySeedDispatch(seedId: string, dispatchedAt?: string) {
  await ensureSchedulerTables();

  await prisma.$executeRaw`
    UPDATE "DiscoverySeed"
    SET
      "lastDispatchedAt" = ${dispatchedAt ?? isoNow()},
      "updatedAt" = ${isoNow()}
    WHERE "id" = ${seedId}
  `;
}

export async function recordDiscoverySeedSuccess(args: {
  seedId: string;
  runId: string;
  yieldChannels: number;
  newChannels: number;
  succeededAt?: string;
}) {
  await ensureSchedulerTables();

  await prisma.$executeRaw`
    UPDATE "DiscoverySeed"
    SET
      "lastSucceededAt" = ${args.succeededAt ?? isoNow()},
      "lastRunId" = ${args.runId},
      "lastYieldChannels" = ${args.yieldChannels},
      "lastNewChannels" = ${args.newChannels},
      "lastError" = NULL,
      "lifetimeJobsSucceeded" = "lifetimeJobsSucceeded" + 1,
      "lifetimeChannelsFound" = "lifetimeChannelsFound" + ${args.yieldChannels},
      "lifetimeNewChannelsFound" = "lifetimeNewChannelsFound" + ${args.newChannels},
      "updatedAt" = ${isoNow()}
    WHERE "id" = ${args.seedId}
  `;
}

export async function recordDiscoverySeedFailure(args: {
  seedId: string;
  error: string;
  failedAt?: string;
}) {
  await ensureSchedulerTables();

  await prisma.$executeRaw`
    UPDATE "DiscoverySeed"
    SET
      "lastError" = ${args.error},
      "lastDispatchedAt" = COALESCE("lastDispatchedAt", ${args.failedAt ?? isoNow()}),
      "updatedAt" = ${isoNow()}
    WHERE "id" = ${args.seedId}
  `;
}

export async function createCatalogJob(input: CatalogJobInput) {
  await ensureSchedulerTables();

  const id = randomUUID();
  const createdAt = isoNow();
  const jobType = input.type;

  await prisma.$executeRaw`
    INSERT INTO "CatalogJob" (
      "id",
      "type",
      "status",
      "priority",
      "payloadJson",
      "seedId",
      "dedupeKey",
      "quotaDay",
      "estimatedQuotaUnits",
      "reservedQuotaUnits",
      "attempts",
      "maxAttempts",
      "nextRunAt",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${id},
      ${jobType},
      ${"queued"},
      ${clampInt(Number(input.priority ?? 0), -100, 100)},
      ${JSON.stringify(input.payload ?? null)},
      ${input.seedId ?? null},
      ${normalizeOptionalString(input.dedupeKey)},
      ${toQuotaDay(input.quotaDay)},
      ${Math.max(0, Math.trunc(input.estimatedQuotaUnits ?? 0))},
      ${Math.max(0, Math.trunc(input.reservedQuotaUnits ?? 0))},
      0,
      ${clampInt(Number(input.maxAttempts ?? 3), 1, 10)},
      ${input.nextRunAt ?? createdAt},
      ${createdAt},
      ${createdAt}
    )
  `;

  return getCatalogJobById(id);
}

export async function getCatalogJobById(jobId: string) {
  await ensureSchedulerTables();

  const rows = await prisma.$queryRawUnsafe<CatalogJobRow[]>(
    `SELECT * FROM "CatalogJob" WHERE "id" = ? LIMIT 1`,
    jobId
  );

  return rows[0] ? mapCatalogJobRow(rows[0]) : null;
}

export async function getCatalogJobByDedupeKey(dedupeKey: string) {
  await ensureSchedulerTables();

  const rows = await prisma.$queryRawUnsafe<CatalogJobRow[]>(
    `SELECT * FROM "CatalogJob" WHERE "dedupeKey" = ? LIMIT 1`,
    dedupeKey
  );

  return rows[0] ? mapCatalogJobRow(rows[0]) : null;
}

export async function listCatalogJobs(filters?: {
  status?: CatalogJobStatus;
  type?: CatalogJobType;
  limit?: number;
}) {
  await ensureSchedulerTables();

  const params: Array<string | number> = [];
  const whereClauses: string[] = [];

  if (filters?.status) {
    whereClauses.push(`"status" = ?`);
    params.push(filters.status);
  }

  if (filters?.type) {
    whereClauses.push(`"type" = ?`);
    params.push(filters.type);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
  const limit = clampInt(Number(filters?.limit ?? 50), 1, 200);

  const rows = await prisma.$queryRawUnsafe<CatalogJobRow[]>(
    `
      SELECT *
      FROM "CatalogJob"
      ${whereSql}
      ORDER BY
        CASE "status"
          WHEN 'running' THEN 0
          WHEN 'queued' THEN 1
          WHEN 'failed' THEN 2
          WHEN 'dead_letter' THEN 3
          ELSE 4
        END,
        "priority" DESC,
        "createdAt" DESC
      LIMIT ?
    `,
    ...params,
    limit
  );

  return rows.map(mapCatalogJobRow);
}

export async function getCatalogWorkerHealth(args?: {
  stuckAfterMinutes?: number;
  stuckLimit?: number;
}): Promise<CatalogWorkerHealth> {
  await ensureSchedulerTables();

  const stuckAfterMinutes = clampInt(Number(args?.stuckAfterMinutes ?? 30), 1, 24 * 60);
  const stuckLimit = clampInt(Number(args?.stuckLimit ?? 10), 1, 100);
  const now = isoNow();
  const staleStartedAt = new Date(
    Date.now() - stuckAfterMinutes * 60 * 1000
  ).toISOString();

  const [aggregateRows, timingRows, stuckRows] = await Promise.all([
    prisma.$queryRawUnsafe<CatalogJobAggregateRow[]>(
      `
        SELECT
          "type",
          "status",
          COUNT(*) AS count
        FROM "CatalogJob"
        GROUP BY "type", "status"
      `
    ),
    prisma.$queryRawUnsafe<
      Array<{
        oldestQueuedAt: string | null;
        oldestRunningAt: string | null;
        nextRunAt: string | null;
      }>
    >(
      `
        SELECT
          MIN(CASE WHEN "status" = 'queued' THEN "createdAt" END) AS oldestQueuedAt,
          MIN(CASE WHEN "status" = 'running' THEN "startedAt" END) AS oldestRunningAt,
          MIN(CASE WHEN "status" = 'queued' THEN "nextRunAt" END) AS nextRunAt
        FROM "CatalogJob"
      `
    ),
    prisma.$queryRawUnsafe<CatalogJobRow[]>(
      `
        SELECT *
        FROM "CatalogJob"
        WHERE "status" = 'running'
          AND (
            ("lockExpiresAt" IS NOT NULL AND "lockExpiresAt" <= ?)
            OR ("startedAt" IS NOT NULL AND "startedAt" <= ?)
          )
        ORDER BY COALESCE("lockExpiresAt", "startedAt", "createdAt") ASC
        LIMIT ?
      `,
      now,
      staleStartedAt,
      stuckLimit
    )
  ]);

  const byType: CatalogWorkerHealth["by_type"] = {
    discover: {
      total: 0,
      queued: 0,
      running: 0,
      succeeded: 0,
      failed: 0,
      dead_letter: 0
    },
    refresh_metrics: {
      total: 0,
      queued: 0,
      running: 0,
      succeeded: 0,
      failed: 0,
      dead_letter: 0
    },
    enrich: {
      total: 0,
      queued: 0,
      running: 0,
      succeeded: 0,
      failed: 0,
      dead_letter: 0
    },
    force_refresh: {
      total: 0,
      queued: 0,
      running: 0,
      succeeded: 0,
      failed: 0,
      dead_letter: 0
    },
    force_enrich: {
      total: 0,
      queued: 0,
      running: 0,
      succeeded: 0,
      failed: 0,
      dead_letter: 0
    }
  };

  const totals: CatalogWorkerHealth["totals"] = {
    total_jobs: 0,
    queued: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    dead_letter: 0,
    stuck_running: stuckRows.length
  };

  for (const row of aggregateRows) {
    const type = row.type as CatalogJobType;
    const status = row.status as CatalogJobStatus;
    if (!Object.prototype.hasOwnProperty.call(byType, type)) continue;
    const count = Number(row.count ?? 0);
    byType[type].total += count;
    totals.total_jobs += count;
    switch (status) {
      case "queued":
        byType[type].queued += count;
        totals.queued += count;
        break;
      case "running":
        byType[type].running += count;
        totals.running += count;
        break;
      case "succeeded":
        byType[type].succeeded += count;
        totals.succeeded += count;
        break;
      case "failed":
        byType[type].failed += count;
        totals.failed += count;
        break;
      case "dead_letter":
        byType[type].dead_letter += count;
        totals.dead_letter += count;
        break;
    }
  }

  const timing = timingRows[0] ?? {
    oldestQueuedAt: null,
    oldestRunningAt: null,
    nextRunAt: null
  };

  return {
    totals,
    by_type: byType,
    timing: {
      oldest_queued_at: timing.oldestQueuedAt,
      oldest_running_at: timing.oldestRunningAt,
      next_run_at: timing.nextRunAt
    },
    stuck_jobs: stuckRows.map((row) => ({
      id: row.id,
      type: row.type as CatalogJobType,
      attempts: Number(row.attempts ?? 0),
      max_attempts: Number(row.maxAttempts ?? 0),
      locked_by: row.lockedBy,
      locked_at: row.lockedAt,
      lock_expires_at: row.lockExpiresAt,
      started_at: row.startedAt,
      last_error: row.lastError,
      payload: parseJsonObject(row.payloadJson, null)
    }))
  };
}

export async function claimCatalogJobs(args: {
  workerId: string;
  limit?: number;
  type?: CatalogJobType;
  lockTtlMs?: number;
}) {
  await ensureSchedulerTables();

  const limit = clampInt(Number(args.limit ?? 1), 1, 100);
  const lockTtlMs = clampInt(Number(args.lockTtlMs ?? 15 * 60 * 1000), 1000, 24 * 60 * 60 * 1000);
  const now = isoNow();
  const lockExpiresAt = new Date(Date.now() + lockTtlMs).toISOString();
  const params: Array<string | number> = [now, now];
  const whereTypeSql = args.type ? `AND "type" = ?` : "";
  if (args.type) params.push(args.type);
  params.push(limit * 5);

  const candidates = await prisma.$queryRawUnsafe<CatalogJobRow[]>(
    `
      SELECT *
      FROM "CatalogJob"
      WHERE (
          ("status" = 'queued' AND "nextRunAt" <= ?)
          OR ("status" = 'running' AND "lockExpiresAt" IS NOT NULL AND "lockExpiresAt" <= ?)
        )
        ${whereTypeSql}
      ORDER BY
        CASE WHEN "status" = 'running' THEN 0 ELSE 1 END,
        "priority" DESC,
        "createdAt" ASC
      LIMIT ?
    `,
    ...params
  );

  const claimed: ReturnType<typeof mapCatalogJobRow>[] = [];

  for (const candidate of candidates) {
    if (claimed.length >= limit) break;

    const updated = await prisma.$executeRawUnsafe(
      `
        UPDATE "CatalogJob"
        SET
          "status" = 'running',
          "attempts" = "attempts" + 1,
          "lockedBy" = ?,
          "lockedAt" = ?,
          "lockExpiresAt" = ?,
          "startedAt" = COALESCE("startedAt", ?),
          "updatedAt" = ?
        WHERE "id" = ?
          AND (
            ("status" = 'queued' AND "nextRunAt" <= ?)
            OR ("status" = 'running' AND "lockExpiresAt" IS NOT NULL AND "lockExpiresAt" <= ?)
          )
      `,
      args.workerId,
      now,
      lockExpiresAt,
      now,
      now,
      candidate.id,
      now,
      now
    );

    if (Number(updated) <= 0) continue;

    const claimedRow = await prisma.$queryRawUnsafe<CatalogJobRow[]>(
      `SELECT * FROM "CatalogJob" WHERE "id" = ? LIMIT 1`,
      candidate.id
    );

    if (claimedRow[0]) {
      claimed.push(mapCatalogJobRow(claimedRow[0]));
    }
  }

  return claimed;
}

export async function markCatalogJobSucceeded(args: {
  jobId: string;
  result?: CatalogJobDispatchResult;
}) {
  await ensureSchedulerTables();

  await prisma.$executeRaw`
    UPDATE "CatalogJob"
    SET
      "status" = ${"succeeded"},
      "finishedAt" = ${isoNow()},
      "lockedBy" = NULL,
      "lockedAt" = NULL,
      "lockExpiresAt" = NULL,
      "lastError" = NULL,
      "resultJson" = ${JSON.stringify(args.result ?? null)},
      "updatedAt" = ${isoNow()}
    WHERE "id" = ${args.jobId}
  `;

  return getCatalogJobById(args.jobId);
}

export async function requeueCatalogJob(args: {
  jobId: string;
  error: string;
  nextRunAt: string;
  result?: CatalogJobDispatchResult;
}) {
  await ensureSchedulerTables();

  await prisma.$executeRaw`
    UPDATE "CatalogJob"
    SET
      "status" = ${"queued"},
      "lockedBy" = NULL,
      "lockedAt" = NULL,
      "lockExpiresAt" = NULL,
      "finishedAt" = NULL,
      "lastError" = ${args.error},
      "resultJson" = ${JSON.stringify(args.result ?? null)},
      "nextRunAt" = ${args.nextRunAt},
      "updatedAt" = ${isoNow()}
    WHERE "id" = ${args.jobId}
  `;

  return getCatalogJobById(args.jobId);
}

export async function markCatalogJobFailed(args: {
  jobId: string;
  error: string;
  deadLetter?: boolean;
  result?: CatalogJobDispatchResult;
}) {
  await ensureSchedulerTables();

  const status = args.deadLetter ? "dead_letter" : "failed";
  const deadLetteredAt = args.deadLetter ? isoNow() : null;

  await prisma.$executeRaw`
    UPDATE "CatalogJob"
    SET
      "status" = ${status},
      "finishedAt" = ${isoNow()},
      "lockedBy" = NULL,
      "lockedAt" = NULL,
      "lockExpiresAt" = NULL,
      "lastError" = ${args.error},
      "resultJson" = ${JSON.stringify(args.result ?? null)},
      "deadLetteredAt" = ${deadLetteredAt},
      "updatedAt" = ${isoNow()}
    WHERE "id" = ${args.jobId}
  `;

  return getCatalogJobById(args.jobId);
}

export function buildDiscoveryRunPayload(seed: ReturnType<typeof mapDiscoverySeedRow>): RunRequest {
  return {
    keywords: Array.isArray(seed.keywords) ? seed.keywords : [],
    exclude_keywords: Array.isArray(seed.exclude_keywords) ? seed.exclude_keywords : [],
    region: seed.region,
    language: seed.language,
    min_views: seed.min_views ?? undefined,
    min_avg_views: seed.min_avg_views ?? undefined,
    min_engagement_rate: seed.min_engagement_rate ?? undefined,
    max_days_since_upload: seed.max_days_since_upload ?? undefined,
    min_subscribers: seed.min_subscribers ?? undefined,
    videos_to_analyze: seed.videos_to_analyze ?? undefined,
    max_channels: seed.max_channels ?? undefined
  };
}

export async function countCatalogChannelsFirstSeenSince(args: {
  channelIds: string[];
  since: string;
}) {
  if (args.channelIds.length === 0) return 0;

  await ensureSchedulerTables();
  await ensureCatalogTables();

  const rows = await prisma.$queryRaw<[{ count: number }]>(Prisma.sql`
    SELECT COUNT(*) AS count
    FROM "ChannelCatalog"
    WHERE "channelId" IN (${Prisma.join(args.channelIds)})
      AND "firstSeenAt" >= ${args.since}
  `);

  return Number(rows[0]?.count ?? 0);
}
