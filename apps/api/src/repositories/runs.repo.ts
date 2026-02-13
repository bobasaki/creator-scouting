import { prisma } from "../db/prisma";

type RunInput = {
  keywords: string[];
  region: string;
  language: string;
  max_channels?: number;
  videos_to_analyze?: number;
  min_avg_views?: number;
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
}

export async function getRunById(runId: string): Promise<null | { run: any; results: any[] }> {
  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: {
      results: {
        orderBy: { finalScore: "desc" }
      }
    }
  });

  if (!run) return null;

  return {
    run,
    results: run.results
  };
}

export async function listRecentRuns(limit = 20): Promise<any[]> {
  const safeLimit = Math.max(1, Math.min(limit, 100));

  return prisma.run.findMany({
    orderBy: { createdAt: "desc" },
    take: safeLimit,
    select: {
      id: true,
      createdAt: true,
      keywords: true,
      region: true,
      language: true,
      maxChannels: true,
      videosToAnalyze: true
    }
  });
}
