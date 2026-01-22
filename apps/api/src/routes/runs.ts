import { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";

import { RunRequestSchema } from "../schemas/run.schema";

import { scoreChannel } from "../domain/score";
import { passesFilters } from "../domain/filter";

import {
  searchChannelsByKeyword,
  getChannelDetails,
  getRecentVideos
} from "../integrations/youtube/client";
import { mapYoutubeToChannelMetrics } from "../integrations/youtube/mapper";

import { createRunWithResults, getRunById } from "../repositories/runs.repo";

export async function runsRoutes(app: FastifyInstance) {
  // POST /api/runs (real execution + persistence)
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

      // Safety caps (quota protection)
      const safeMaxChannels = Math.max(1, Math.min(Number(max_channels) || 25, 50));
      const safeVideosToAnalyze = Math.max(1, Math.min(Number(videos_to_analyze) || 5, 10));

      // 1) Discover channels across keywords
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

      // 2) Deduplicate + cap
      const uniqueChannelIds = Array.from(new Set(discovered.map((c) => c.channelId))).slice(
        0,
        safeMaxChannels
      );

      // 3) Fetch channel details
      const details = await getChannelDetails(uniqueChannelIds);

      // 4) Fetch videos per channel, map → filter → score
      const results: any[] = [];
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

      // 5) Sort
      results.sort((a: any, b: any) => b.finalScore - a.finalScore);

      // 6) Persist run + results
      const runId = randomUUID();

      await createRunWithResults({
        runId,
        input: validatedInput as any,
        results
      });

      // 7) Read back the persisted run for DB truth (createdAt)
      const persisted = await getRunById(runId);
      const createdAt = persisted?.run?.createdAt
        ? new Date(persisted.run.createdAt).toISOString()
        : new Date().toISOString(); // fallback should never happen


      // 7) Return response
      return {
        run_id: runId,
        created_at: createdAt,
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

  // GET /api/runs/:runId (DB-backed retrieval)
  app.get("/api/runs/:runId", async (request, reply) => {
    const { runId } = request.params as { runId: string };

    const found = await getRunById(runId);
    if (!found) {
      return reply.status(404).send({ error: "Run not found" });
    }

    const results = found.results.map((r: any) => ({
      metrics: {
        channelId: r.channelId,
        channelName: r.channelName,
        channelUrl: r.channelUrl,
        subscriberCount: r.subscriberCount,
        avgViewsLastN: r.avgViewsLastN,
        daysSinceLastUpload: r.daysSinceLastUpload,
        recentViews: r.recentViews
      },
      scores: r.scores,
      finalScore: r.finalScore
    }));

    return {
      run_id: found.run.id,
      created_at: new Date(found.run.createdAt).toISOString(),
      
      input: {
        keywords: found.run.keywords,
        region: found.run.region,
        language: found.run.language,

        max_channels: found.run.maxChannels ?? undefined,
        videos_to_analyze: found.run.videosToAnalyze ?? undefined,

        min_avg_views: found.run.minAvgViews ?? undefined,
        max_days_since_upload: found.run.maxDaysSinceUpload ?? undefined,
        min_subscribers: found.run.minSubscribers ?? undefined
      },

      results
    };
  });

  // GET /api/runs/:runId/export (DB-backed)
  app.get("/api/runs/:runId/export", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const { format } = request.query as { format?: string };

    const found = await getRunById(runId);
    if (!found) return reply.status(404).send({ error: "Run not found" });

    const results = found.results;

    if (format === "csv") {
      reply.header("Content-Type", "text/csv");

      const header =
        "channel_id,channel_name,channel_url,subscriber_count,avg_views_last_n,days_since_last_upload,final_score\n";

      // minimal CSV escaping for commas/quotes
      const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;

      const rows = results
        .map((r: any) =>
          [
            esc(r.channelId),
            esc(r.channelName),
            esc(r.channelUrl),
            r.subscriberCount ?? 0,
            r.avgViewsLastN ?? 0,
            r.daysSinceLastUpload ?? 0,
            r.finalScore ?? 0
          ].join(",")
        )
        .join("\n");

      reply.send(header + rows + "\n");
      return;
    }

    return {
      message: "Export format not implemented yet",
      available_formats: ["csv", "json"]
    };
  });
}