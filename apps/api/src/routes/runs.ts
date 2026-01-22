import { randomUUID } from "node:crypto";
import {
  searchChannelsByKeyword,
  getChannelDetails,
  getRecentVideos
} from "../integrations/youtube/client";
import { mapYoutubeToChannelMetrics } from "../integrations/youtube/mapper";
import { FastifyInstance } from "fastify";
import { RunRequestSchema } from "../schemas/run.schema";
import { scoreChannel } from "../domain/score";
import { passesFilters } from "../domain/filter";
import { ChannelMetrics } from "../domain/types";

export async function runsRoutes(app: FastifyInstance) {
  app.post("/api/runs", async (request, reply) => {
    const parseResult = RunRequestSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Invalid request",
        details: parseResult.error.format()
      });
    }

    const validatedInput = parseResult.data;
    try {
      const {
        keywords,
        region,
        language,
        min_avg_views,
        max_days_since_upload,
        min_subscribers,
        videos_to_analyze = 5,
        max_channels = 25
      } = validatedInput as any;

      // Safety caps (even if caller requests higher values)
      const safeMaxChannels = Math.max(1, Math.min(Number(max_channels) || 25, 50));
      const safeVideosToAnalyze = Math.max(1, Math.min(Number(videos_to_analyze) || 5, 10));

      // 1) Discover channels (accumulate across keywords)
      const discovered: { channelId: string }[] = [];
      for (const keyword of keywords as string[]) {
        const found = await searchChannelsByKeyword(
          keyword,
          safeMaxChannels,
          region,
          language
        );
        discovered.push(...found);
      }

      // 2) Dedupe + cap
      const uniqueChannelIds = Array.from(new Set(discovered.map((c) => c.channelId))).slice(
        0,
        safeMaxChannels
      );

      // 3) Fetch channel details (subscriber counts, name if available)
      const details = await getChannelDetails(uniqueChannelIds);

      // 4) Fetch recent videos per channel, normalize, filter, score
      const results = [];
      for (const ch of details as any[]) {
        const channelId = ch.channelId;

        const videoData = await getRecentVideos(channelId, safeVideosToAnalyze);

        const metrics = mapYoutubeToChannelMetrics({
          channelId,
          channelName: ch.channelName ?? ch.title ?? ch.name ?? channelId,
          channelUrl: ch.channelUrl ?? `https://youtube.com/channel/${channelId}`,
          subscriberCount: Number(ch.subscriberCount ?? 0),
          recentViews: (videoData as any).views ?? [],
          daysSinceLastUpload: Number((videoData as any).daysSinceLastUpload ?? 9999)
        });

        const passes = passesFilters(metrics, {
          minAvgViews: min_avg_views,
          maxDaysSinceUpload: max_days_since_upload,
          minSubscribers: min_subscribers
        });

        if (!passes) continue;

        results.push(scoreChannel(metrics));
      }

      results.sort((a: any, b: any) => b.finalScore - a.finalScore);

      return {
        run_id: randomUUID(),
        created_at: new Date().toISOString(),
        results
      };
    } catch (err: any) {
      request.log.error({ err }, "POST /api/runs failed");
      return reply.status(500).send({
        error: "Internal error",
        code: "RUN_EXECUTION_FAILED"
      });
    }
  });

  app.get("/api/runs/:runId", async () => {
    const mockChannel: ChannelMetrics = {
      channelId: "UCxxxx",
      channelName: "Example Channel",
      channelUrl: "https://youtube.com/channel/UCxxxx",
      subscriberCount: 120000,
      avgViewsLastN: 15400,
      daysSinceLastUpload: 4,
      recentViews: [16000, 15000, 14500, 15800, 15500]
    };

    const filters = {
      minAvgViews: 8000,
      maxDaysSinceUpload: 30
    };

    if (!passesFilters(mockChannel, filters)) {
      return {
        run_id: "mock-run-id",
        created_at: new Date().toISOString(),
        results: []
      };
    }

    const scored = scoreChannel(mockChannel);

    return {
      run_id: "mock-run-id",
      created_at: new Date().toISOString(),
      results: [scored]
    };
  });

  app.get("/api/runs/:runId/export", async (request, reply) => {
    const { format } = request.query as { format?: string };

    if (format === "csv") {
      reply.header("Content-Type", "text/csv");
      reply.send("channel_name,final_score\nExample Channel,83");
      return;
    }

    return {
      message: "Export format not implemented yet",
      available_formats: ["csv", "json"]
    };
  });
}