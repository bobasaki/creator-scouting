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

/**
 * 10.2 helpers: retry + concurrency pool
 */
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableError(err: any): boolean {
  const msg = String(err?.message ?? "").toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("rate limit") ||
    msg.includes("http 5") ||
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("temporarily") ||
    msg.includes("server error")
  );
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts: { retries: number; baseMs: number; maxMs: number }
): Promise<T> {
  let attempt = 0;
  let lastErr: any;

  while (attempt <= opts.retries) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;

      if (!isRetryableError(err) || attempt === opts.retries) {
        throw err;
      }

      const jitter = Math.floor(Math.random() * 150);
      const backoff = Math.min(opts.maxMs, opts.baseMs * 2 ** attempt) + jitter;
      await sleep(backoff);
      attempt++;
    }
  }

  throw lastErr;
}

/**
 * Runs async tasks with concurrency limit.
 * Preserves completion (not input) ordering; OK for our counting use-case.
 */
async function runPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  let idx = 0;
  const results: R[] = new Array(items.length);

  async function runner() {
    while (true) {
      const currentIndex = idx++;
      if (currentIndex >= items.length) return;
      results[currentIndex] = await worker(items[currentIndex]);
    }
  }

  const n = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: n }, () => runner()));
  return results;
}

export async function runsRoutes(app: FastifyInstance) {
  // DEBUG: confirms which runs.ts is currently running
  app.get("/debug/version", async () => {
    return { runs_ts: "10.2-concurrency", ts: new Date().toISOString() };
  });

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
  // Step 10.2: Concurrency + retries, while keeping 10.1 idempotency (skip success unless forced)
  app.post("/runs/:runId/enrich", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const { force } = request.query as { force?: string };
    const forceEnrich = force === "true" || force === "1";

    const found = await getRunById(runId);
    if (!found) {
      return reply.status(404).send({ error: "Run not found" });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return reply.status(500).send({ error: "Missing OPENAI_API_KEY" });
    }

    const model = "gpt-5-nano";

    // Concurrency config (start low)
    const concurrency = Math.max(
      1,
      Math.min(Number(process.env.ENRICH_CONCURRENCY ?? 3), 10)
    );

    let successCount = 0;
    let failureCount = 0;
    let skippedCount = 0;

    // Prefetch existing enrichments for this run (idempotency)
    const existingRows = await getEnrichmentsForRun(runId);
    const existingByChannelId = new Map<string, any>();
    for (const row of existingRows as any[]) {
      if (row?.channelId) existingByChannelId.set(row.channelId, row);
    }

    // Build queue to process (skip happens here once)
    const toProcess: any[] = [];
    for (const r of found.results) {
      const channelId = r.channelId;
      const existing = existingByChannelId.get(channelId);

      if (!forceEnrich && existing?.status === "success") {
        skippedCount++;
        continue;
      }

      toProcess.push(r);
    }

    request.log.info(
      {
        runId,
        forceEnrich,
        concurrency,
        total: found.results.length,
        toProcess: toProcess.length,
        skippedCount,
        existingRows: (existingRows as any[]).length,
        existingSuccess: (existingRows as any[]).filter((r) => r?.status === "success").length
      },
      "ENRICH v10.2 concurrency precheck"
    );

    const outcomes = await runPool(toProcess, concurrency, async (r) => {
      const channelId = r.channelId;

      try {
        // 1) Mark pending
        await markPending({ runId, channelId });

        // 2) Fetch YouTube text
        const { description, recentTitles } = await getChannelText(channelId, 5);

        // 3) Build prompt input
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

        // 4) Call LLM with retry/backoff (transient failures only)
        const enrichment = await retryWithBackoff(
          () =>
            enrichChannel({
              apiKey,
              model,
              inputText
            }),
          { retries: 2, baseMs: 500, maxMs: 4000 }
        );

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

        return "success" as const;
      } catch (err: any) {
        await saveFailure({
          runId,
          channelId,
          model,
          error: {
            message: err?.message ?? "Unknown enrichment error"
          }
        });

        return "failed" as const;
      }
    });

    successCount = outcomes.filter((o) => o === "success").length;
    failureCount = outcomes.filter((o) => o === "failed").length;

    return {
      version: "10.2-concurrency",
      run_id: runId,
      enriched: successCount,
      skipped: skippedCount,
      failed: failureCount,
      total: found.results.length,
      forced: forceEnrich,
      concurrency
    };
  });
}