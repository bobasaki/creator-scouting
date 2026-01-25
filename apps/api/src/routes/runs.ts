import { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";

import { RunRequestSchema } from "../schemas/run.schema";

import { scoreChannel } from "../domain/score";
import { passesFilters } from "../domain/filter";

import {
  markPending,
  saveSuccess,
  saveFailure,
  getEnrichmentsForRun
} from "../repositories/enrichment.repo";

import {
  searchChannelsByKeyword,
  getChannelDetails,
  getRecentVideos,
  getChannelText
} from "../integrations/youtube/client";
import { mapYoutubeToChannelMetrics } from "../integrations/youtube/mapper";

import { enrichChannel } from "../integrations/llm/openai";

import { createRunWithResults, getRunById } from "../repositories/runs.repo";

export async function runsRoutes(app: FastifyInstance) {
  // POST /runs (real execution + persistence)
  app.post("/runs", async (request, reply) => {
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
      const safeVideosToAnalyze = Math.max(
        1,
        Math.min(Number(videos_to_analyze) || 5, 10)
      );

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

      // 8) Return response
      return {
        run_id: runId,
        created_at: createdAt,
        results
      };
    } catch (err: any) {
      request.log.error({ err }, "POST /runs failed");
      return reply.status(500).send({
        error: "Internal error",
        code: "RUN_EXECUTION_FAILED"
      });
    }
  });

  // GET /runs/:runId (DB-backed retrieval)
  app.get("/runs/:runId", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const { include } = request.query as { include?: string };
    const includeEnrichment = include === "enrichment";

    const found = await getRunById(runId);
    if (!found) {
      return reply.status(404).send({ error: "Run not found" });
    }

    const enrichmentByChannelId = new Map<string, any>();
    if (includeEnrichment) {
      const enrichments = await getEnrichmentsForRun(runId);
      for (const e of enrichments as any[]) {
        if ((e as any).channelId) enrichmentByChannelId.set((e as any).channelId, e);
      }
    }

    const results = found.results.map((r: any) => {
      const e = includeEnrichment ? enrichmentByChannelId.get(r.channelId) : undefined;

      return {
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
        finalScore: r.finalScore,
        enrichment: includeEnrichment
          ? e
            ? {
                status: e.status,
                model: e.model ?? null,
                payload: {
                  nicheLabels: e.nicheLabels ?? null,
                  languageDetected: e.languageDetected ?? null,
                  fitSummary: e.fitSummary ?? null,
                  brandSafetyNotes: e.brandSafetyNotes ?? null,
                  redFlags: e.redFlags ?? null,
                  raw: e.raw ?? null
                }
              }
            : { status: "missing", model: null, payload: null }
          : undefined
      };
    });

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
        max_days_since_upload: found.run.maxDaysSinceLastUpload ?? undefined,
        min_subscribers: found.run.minSubscribers ?? undefined
      },

      results
    };
  });

  // GET /runs/:runId/export (DB-backed)
  app.get("/runs/:runId/export", async (request, reply) => {
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

  // POST /runs/:runId/enrich
  app.post("/runs/:runId/enrich", async (request, reply) => {
    const { runId } = request.params as { runId: string };

    const found = await getRunById(runId);
    if (!found) {
      return reply.status(404).send({ error: "Run not found" });
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return reply.status(500).send({ error: "Missing OPENAI_API_KEY" });
    }

    const model = "gpt-5-nano";

    let successCount = 0;
    let failureCount = 0;

    for (const r of found.results) {
      const channelId = r.channelId;

      try {
        // 1) Mark pending
        await markPending({ runId, channelId });

        // 2) Fetch YouTube text
        const { description, recentTitles } = await getChannelText(channelId, 5);

        // 3) Build prompt input (compact, deterministic)
        const inputText = `
Channel name: ${r.channelName}
Subscribers: ${r.subscriberCount}
Average views (last N): ${r.avgViewsLastN}
Days since last upload: ${r.daysSinceLastUpload}

Channel description:
${description || "(no description)"}

Recent video titles:
${
  recentTitles.length
    ? recentTitles.map((t) => `- ${t}`).join("\n")
    : "(no recent titles)"
}

Task:
Classify this channel for influencer scouting.
      `.trim();

        // 4) Call LLM (structured output)
        const enrichment = await enrichChannel({
          apiKey,
          model,
          inputText
        });

        // 5) Persist success
        await saveSuccess({
          runId,
          channelId,
          payload: {
            model,
            status: "success",
            nicheLabels: enrichment.niche_labels,
            languageDetected: enrichment.language_detected,
            fitSummary: enrichment.fit_summary,
            brandSafetyNotes: enrichment.brand_safety_notes,
            redFlags: enrichment.red_flags,
            raw: enrichment
          }
        });

        successCount++;
      } catch (err: any) {
        await saveFailure({
          runId,
          channelId,
          model,
          error: {
            message: err?.message ?? "Unknown enrichment error"
          }
        });

        failureCount++;
      }
    }

    return {
      run_id: runId,
      enriched: successCount,
      failed: failureCount,
      total: found.results.length
    };
  });
}