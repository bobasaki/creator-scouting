import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";

type RunInput = {
  keywords: string[];
  exclude_keywords?: string[];
  region: string;
  language: string;
  max_channels?: number;
  videos_to_analyze?: number;
  min_views?: number;
  min_avg_views?: number;
  min_engagement_rate?: number;
  max_days_since_upload?: number;
  min_subscribers?: number;
};

type RunResultItem = {
  metrics: {
    channelId: string;
    channelName: string;
    channelUrl: string;
    subscriberCount: number;
    avgViewsLastN: number;
    daysSinceLastUpload: number;
    recentViews: number[];
  };
  scores: any;
  finalScore: number;
};

type RunFilterConfigRow = {
  runId: string;
  minViews: number | null;
  minEngagementRate: number | null;
  excludeKeywords: string | null;
};

type TableInfoRow = {
  name: string;
};

let ensureRunFilterConfigTablePromise: Promise<void> | null = null;

async function ensureRunFilterConfigTable(): Promise<void> {
  if (!ensureRunFilterConfigTablePromise) {
    ensureRunFilterConfigTablePromise = prisma
      .$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "RunFilterConfig" (
          "runId" TEXT PRIMARY KEY,
          "minViews" INTEGER,
          "minEngagementRate" REAL,
          "excludeKeywords" TEXT
        )
      `)
      .then(async () => {
        const columns = await prisma.$queryRawUnsafe<TableInfoRow[]>(
          `PRAGMA table_info("RunFilterConfig")`
        );
        const names = new Set(columns.map((column) => column.name));

        if (!names.has("excludeKeywords")) {
          await prisma.$executeRawUnsafe(
            `ALTER TABLE "RunFilterConfig" ADD COLUMN "excludeKeywords" TEXT`
          );
        }
      })
      .then(() => undefined);
  }

  await ensureRunFilterConfigTablePromise;
}

async function upsertRunFilterConfig(input: {
  runId: string;
  min_views?: number;
  min_engagement_rate?: number;
  exclude_keywords?: string[];
}): Promise<void> {
  await ensureRunFilterConfigTable();

  await prisma.$executeRaw`
    INSERT INTO "RunFilterConfig" ("runId", "minViews", "minEngagementRate", "excludeKeywords")
    VALUES (
      ${input.runId},
      ${input.min_views ?? null},
      ${input.min_engagement_rate ?? null},
      ${input.exclude_keywords && input.exclude_keywords.length > 0
        ? JSON.stringify(input.exclude_keywords)
        : null}
    )
    ON CONFLICT("runId") DO UPDATE SET
      "minViews" = excluded."minViews",
      "minEngagementRate" = excluded."minEngagementRate",
      "excludeKeywords" = excluded."excludeKeywords"
  `;
}

async function getRunFilterConfigMap(runIds: string[]): Promise<Map<string, RunFilterConfigRow>> {
  if (runIds.length === 0) return new Map();

  await ensureRunFilterConfigTable();

  const rows = await prisma.$queryRaw<RunFilterConfigRow[]>(Prisma.sql`
    SELECT "runId", "minViews", "minEngagementRate", "excludeKeywords"
    FROM "RunFilterConfig"
    WHERE "runId" IN (${Prisma.join(runIds)})
  `);

  return new Map(rows.map((row) => [row.runId, row]));
}

function parseStringArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export async function createRunWithResults(params: {
  runId: string;
  input: RunInput;
  results: RunResultItem[];
}): Promise<void> {
  const { runId, input, results } = params;

  await prisma.run.create({
    data: {
      id: runId,
      region: input.region,
      language: input.language,
      keywords: input.keywords,

      maxChannels: input.max_channels ?? null,
      videosToAnalyze: input.videos_to_analyze ?? null,

      minAvgViews: input.min_avg_views ?? null,
      maxDaysSinceUpload: input.max_days_since_upload ?? null,
      minSubscribers: input.min_subscribers ?? null,

      results: {
        create: results.map((r) => ({
          channelId: r.metrics.channelId,
          channelName: r.metrics.channelName,
          channelUrl: r.metrics.channelUrl,
          subscriberCount: r.metrics.subscriberCount,
          avgViewsLastN: r.metrics.avgViewsLastN,
          daysSinceLastUpload: r.metrics.daysSinceLastUpload,
          recentViews: r.metrics.recentViews,
          scores: r.scores,
          finalScore: r.finalScore
        }))
      }
    }
  });

  await upsertRunFilterConfig({
    runId,
    min_views: input.min_views,
    min_engagement_rate: input.min_engagement_rate,
    exclude_keywords: input.exclude_keywords
  });
}

export async function getRunById(runId: string): Promise<null | { run: any; results: any[] }> {
  const filterMap = await getRunFilterConfigMap([runId]);
  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: {
      results: {
        orderBy: { finalScore: "desc" }
      }
    }
  });

  if (!run) return null;
  const filterConfig = filterMap.get(run.id);

  return {
    run: {
      ...run,
      minViews: filterConfig?.minViews ?? null,
      minEngagementRate: filterConfig?.minEngagementRate ?? null,
      excludeKeywords: parseStringArray(filterConfig?.excludeKeywords)
    },
    results: run.results
  };
}

export async function listRecentRuns(limit = 20): Promise<any[]> {
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const runs = await prisma.run.findMany({
    orderBy: { createdAt: "desc" },
    take: safeLimit,
    select: {
      id: true,
      createdAt: true,
      keywords: true,
      region: true,
      language: true,
      maxChannels: true,
      videosToAnalyze: true,
      minAvgViews: true,
      maxDaysSinceUpload: true,
      minSubscribers: true
    }
  });

  const filterMap = await getRunFilterConfigMap(runs.map((run) => run.id));

  return runs.map((run) => {
    const filterConfig = filterMap.get(run.id);
    return {
      ...run,
      minViews: filterConfig?.minViews ?? null,
      minEngagementRate: filterConfig?.minEngagementRate ?? null,
      excludeKeywords: parseStringArray(filterConfig?.excludeKeywords)
    };
  });
}
