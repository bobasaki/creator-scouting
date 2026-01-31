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

// Step 11 (addon): sponsorship detection (heuristic, token-free)
type SponsorshipEvidence = {
  videoId: string;
  where: "title" | "description";
  match: string;
};

type SponsorshipScan = {
  nVideos: number;
  sponsoredCount: number;
  ratio: number;
  confidence: "low" | "medium" | "high";
  evidence: SponsorshipEvidence[];
};

const SPONSORSHIP_PATTERNS: RegExp[] = [
  // EN
  /\b(sponsored|sponsor|paid partnership)\b/i,
  /#(ad|sponsored)\b/i,
  /\b(affiliate|promo code|discount code)\b/i,

  // DE
  /\b(werbung|anzeige|gesponsert|bezahlte partnerschaft)\b/i,
  /\b(rabattcode|gutschein)\b/i,
  /\b(link in der beschreibung)\b/i,

  // NL
  /\b(advertentie|gesponsord|betaalde samenwerking)\b/i,

  // Generic
  /\b(use code|code[:\s]+[A-Z0-9_-]{3,})\b/i,
  /\b\d{1,2}%\s*(off|rabatt)\b/i
];

function detectSponsorships(input: {
  videoIds: string[];
  titles: string[];
  descriptions: string[];
  maxEvidence?: number;
}): SponsorshipScan {
  const { videoIds, titles, descriptions } = input;
  const maxEvidence = input.maxEvidence ?? 25;

  const n = Math.min(videoIds.length, titles.length, descriptions.length);
  let sponsoredCount = 0;
  const evidence: SponsorshipEvidence[] = [];

  for (let i = 0; i < n; i++) {
    const videoId = videoIds[i];
    const t = titles[i] ?? "";
    const d = descriptions[i] ?? "";

    let hit: SponsorshipEvidence | null = null;

    for (const rx of SPONSORSHIP_PATTERNS) {
      const mt = t.match(rx);
      if (mt?.[0]) {
        hit = { videoId, where: "title", match: mt[0] };
        break;
      }
      const md = d.match(rx);
      if (md?.[0]) {
        hit = { videoId, where: "description", match: md[0] };
        break;
      }
    }

    if (hit) {
      sponsoredCount++;
      if (evidence.length < maxEvidence) evidence.push(hit);
    }
  }

  const ratio = n === 0 ? 0 : sponsoredCount / n;
  const confidence: SponsorshipScan["confidence"] =
    ratio >= 0.4 ? "high" : ratio >= 0.15 ? "medium" : sponsoredCount > 0 ? "low" : "low";

  return { nVideos: n, sponsoredCount, ratio, confidence, evidence };
}

// Step 10.4: job registry + runner helper
type EnrichJobState = {
  status: "idle" | "running" | "done" | "failed";
  startedAt?: string;
  finishedAt?: string;
  forced?: boolean;
  concurrency?: number;
  lastError?: string | null;

  // Step 10.6: job summary (in-memory)
  total?: number;
  toProcess?: number;
  enriched?: number;
  skipped?: number;
  failed?: number;
};

const enrichJobs = new Map<string, EnrichJobState>();
const enrichJobTimers = new Map<string, NodeJS.Timeout>();

// Step 10.8: cleanup timers to prevent memory growth
const enrichJobCleanupTimers = new Map<string, NodeJS.Timeout>();

function clearJobTimers(runId: string) {
  const t = enrichJobTimers.get(runId);
  if (t) clearTimeout(t);
  enrichJobTimers.delete(runId);

  const c = enrichJobCleanupTimers.get(runId);
  if (c) clearTimeout(c);
  enrichJobCleanupTimers.delete(runId);
}

function scheduleJobCleanup(runId: string, log?: any) {
  // Default: 10 minutes; cap between 10s and 24h
  const ttlMs = Math.max(
    10_000,
    Math.min(Number(process.env.ENRICH_JOB_TTL_MS ?? 600_000), 24 * 60 * 60 * 1000)
  );

  const existing = enrichJobCleanupTimers.get(runId);
  if (existing) clearTimeout(existing);

  const handle = setTimeout(() => {
    enrichJobs.delete(runId);
    enrichJobCleanupTimers.delete(runId);
    log?.info?.({ runId, ttlMs }, "ENRICH v10.8 cleaned up job state");
  }, ttlMs);

  enrichJobCleanupTimers.set(runId, handle);
}

async function runEnrichmentJob(args: {
  runId: string;
  forceEnrich: boolean;
  apiKey: string;
  model: string;
  concurrency: number;
  log: any;
}): Promise<{ enriched: number; skipped: number; failed: number; total: number }> {
  const { runId, forceEnrich, apiKey, model, concurrency, log } = args;

  const found = await getRunById(runId);
  if (!found) throw new Error("Run not found");

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

  log.info(
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
    "ENRICH v10.7 claim precheck"
  );

  const outcomes = await runPool(toProcess, concurrency, async (r) => {
    // Step 10.5: stop quickly if job has been marked failed/done (e.g., timeout)
    const jobState = enrichJobs.get(runId);
    if (jobState?.status !== "running") {
      return "failed" as const;
    }

    const channelId = r.channelId;

    try {
      // 1) Claim pending (Step 10.7: prevent duplicate spend)
      const claim = await markPending({ runId, channelId });
      if (!claim.claimed) {
        return "skipped" as const;
      }

      // 2) Fetch YouTube text
      const { description, recentTitles } = await getChannelText(channelId, 5);

      // 2b) Fetch recent videos (title/description) for sponsorship detection
      const scanN = Math.max(
        1,
        Math.min(Number(process.env.SPONSORSHIP_SCAN_N ?? 10), 25)
      );
      const recent = await getRecentVideos(channelId, scanN);
      const sponsorship = detectSponsorships({
        videoIds: recent.videoIds ?? [],
        titles: recent.titles ?? [],
        descriptions: recent.descriptions ?? []
      });

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
          sponsorship,
          raw: { ...enrichment, sponsorship }
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

  const successCount = outcomes.filter((o) => o === "success").length;
  const failureCount = outcomes.filter((o) => o === "failed").length;
  const claimedSkipCount = outcomes.filter((o) => o === "skipped").length;

  return {
    enriched: successCount,
    skipped: skippedCount + claimedSkipCount,
    failed: failureCount,
    total: found.results.length
  };
}

// ------------------------------
// Option A: shared view builder
// ------------------------------
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function confRank(c: any) {
  const v = String(c ?? "").toLowerCase();
  if (v === "high") return 3;
  if (v === "medium") return 2;
  if (v === "low") return 1;
  return 0;
}

function enrichmentDelta(payload: any): {
  delta: number;
  why: string[];
  components: { sponsorship: number; brandSafety: number };
} {
  let sponsorshipDelta = 0;
  let brandSafetyDelta = 0;
  const why: string[] = [];

  const ratio = Number(payload?.sponsorship?.ratio ?? 0);
  const conf = confRank(payload?.brandAdsConfidence);

  // Sponsorship component
  if (conf >= 2) {
    if (ratio >= 0.5) {
      sponsorshipDelta += 8;
      why.push(
        `Sponsorship-heavy channel (ratio=${ratio.toFixed(2)}, confidence=${payload?.brandAdsConfidence})`
      );
    } else if (ratio >= 0.2) {
      sponsorshipDelta += 5;
      why.push(
        `Some sponsorship presence (ratio=${ratio.toFixed(2)}, confidence=${payload?.brandAdsConfidence})`
      );
    } else if (ratio > 0) {
      sponsorshipDelta += 2;
      why.push(
        `Light sponsorship presence (ratio=${ratio.toFixed(2)}, confidence=${payload?.brandAdsConfidence})`
      );
    }
  } else if (ratio > 0) {
    sponsorshipDelta += 1;
    why.push(`Sponsorship signals detected but low confidence (ratio=${ratio.toFixed(2)})`);
  }

  // Brand-safety component
  const redFlags: string[] = Array.isArray(payload?.redFlags) ? payload.redFlags : [];
  const redText = redFlags.join(" | ").toLowerCase();

  if (redText.includes("graphic") || redText.includes("gore") || redText.includes("disturb")) {
    brandSafetyDelta -= 4;
    why.push("Brand-safety penalty: graphic/disturbing content risk");
  }
  if (redText.includes("copyright") || redText.includes("licensing") || redText.includes("rights")) {
    brandSafetyDelta -= 3;
    why.push("Brand-safety penalty: licensing/copyright risk");
  }
  if (redText.includes("defamation") || redText.includes("misinformation")) {
    brandSafetyDelta -= 2;
    why.push("Brand-safety penalty: defamation/misinformation risk");
  }

  const delta = clamp(sponsorshipDelta + brandSafetyDelta, -10, 10);

  return {
    delta,
    why,
    components: {
      sponsorship: sponsorshipDelta,
      brandSafety: brandSafetyDelta
    }
  };
}

function buildRunResultView(args: {
  runResult: any;
  enrichmentRow?: any;
  includeEnrichment: boolean;
}) {
  const { runResult: r, enrichmentRow: e, includeEnrichment } = args;

  const baseScore = Number(r.finalScore ?? 0);
  let delta = 0;
  let why: string[] = [];
  let deltaComponents: { sponsorship: number; brandSafety: number } | undefined = undefined;
  let enrichmentOut: any = undefined;

  if (includeEnrichment) {
    if (e?.status === "success") {
      const s = e.sponsorship ?? e.raw?.sponsorship ?? null;

      const payload = {
        nicheLabels: e.nicheLabels ?? null,
        languageDetected: e.languageDetected ?? null,
        fitSummary: e.fitSummary ?? null,
        brandSafetyNotes: e.brandSafetyNotes ?? null,
        redFlags: e.redFlags ?? null,
        sponsorship: s,
        hasBrandAdsLastN: s ? Number(s.sponsoredCount ?? 0) > 0 : null,
        brandAdsConfidence: s?.confidence ?? null,
        raw: e.raw ?? null
      };

      const out = enrichmentDelta(payload);
      delta = out.delta;
      why = out.why;
      deltaComponents = out.components;

      enrichmentOut = { status: e.status, model: e.model ?? null, payload };
    } else if (e) {
      enrichmentOut = { status: e.status, model: e.model ?? null, payload: null };
    } else {
      enrichmentOut = { status: "missing", model: null, payload: null };
    }
  }

  // --- Step 11.8: Unified score_breakdown ---
  const baseComponents = r.scores ?? {};
  const scoreBreakdown = {
    base: {
      total: baseScore,
      components: baseComponents
    },
    enrichment: {
      total: delta,
      components: deltaComponents ?? { sponsorship: 0, brandSafety: 0 }
    },
    final: baseScore + delta
  };
  // ------------------------------------------

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
    finalScoreBase: baseScore,
    finalScoreDelta: delta,
    finalScoreFinal: baseScore + delta,
    finalScore: baseScore + delta,
    why,
    deltaComponents,
    enrichment: enrichmentOut,
    score_breakdown: scoreBreakdown,
    score_version: "11.8"
  };
}

export async function runsRoutes(app: FastifyInstance) {
  // DEBUG: confirms which runs.ts is currently running
  app.get("/debug/version", async () => {
    return { runs_ts: "10.8-cleanup", ts: new Date().toISOString() };
  });

  // GET /runs/:runId/enrich/job
  // Step 10.6: in-memory job state + optional DB-backed progress
  app.get("/runs/:runId/enrich/job", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const { include } = request.query as { include?: string };

    const job = enrichJobs.get(runId) ?? { status: "idle" };

    // Optional: include DB-backed progress (cheap-ish, but deterministic)
    if (include === "status") {
      const found = await getRunById(runId);
      if (!found) {
        return reply.status(404).send({ error: "Run not found" });
      }

      const total = found.results.length;
      const enrichments = await getEnrichmentsForRun(runId);

      let success = 0;
      let failed = 0;
      let pending = 0;
      let other = 0;

      for (const e of enrichments as any[]) {
        const s = String((e as any).status ?? "").toLowerCase();
        if (s === "success") success++;
        else if (s === "failed") failed++;
        else if (s === "pending") pending++;
        else other++;
      }

      const missing = Math.max(0, total - (success + failed + pending + other));

      return {
        version: "10.8-cleanup",
        run_id: runId,
        job,
        status: { total, success, failed, pending, other, missing }
      };
    }

    return { version: "10.8-cleanup", run_id: runId, job };
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
          recentViews: videoData.views ?? [],
          daysSinceLastUpload: Number(videoData.daysSinceLastUpload ?? 9999)
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
    const {
      include,
      hasBrandAds,
      minBrandAdsRatio,
      minBrandAdsConfidence,
      nicheIncludes,
      languageDetected
    } = request.query as {
      include?: string;

      // 11.3 filters (optional; require include=enrichment)
      hasBrandAds?: string; // "true" | "false"
      minBrandAdsRatio?: string; // "0.25"
      minBrandAdsConfidence?: string; // "low" | "medium" | "high"
      nicheIncludes?: string; // free-text
      languageDetected?: string; // e.g. "German"
    };

    const includeEnrichment = include === "enrichment";

    const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

    const confRank = (c: any) => {
      const v = String(c ?? "").toLowerCase();
      if (v === "high") return 3;
      if (v === "medium") return 2;
      if (v === "low") return 1;
      return 0;
    };

    // Bounded enrichment scoring: total adjustment is clamped to [-10, +10]
    function enrichmentDelta(payload: any): { delta: number; why: string[] } {
      let delta = 0;
      const why: string[] = [];

      // 1) Sponsored history boost (signals monetization readiness)
      const ratio = Number(payload?.sponsorship?.ratio ?? 0);
      const conf = confRank(payload?.brandAdsConfidence);

      if (conf >= 2) {
        if (ratio >= 0.5) {
          delta += 8;
          why.push(
            `Sponsorship-heavy channel (ratio=${ratio.toFixed(2)}, confidence=${String(
              payload?.brandAdsConfidence
            )})`
          );
        } else if (ratio >= 0.2) {
          delta += 5;
          why.push(
            `Some sponsorship presence (ratio=${ratio.toFixed(2)}, confidence=${String(
              payload?.brandAdsConfidence
            )})`
          );
        } else if (ratio > 0) {
          delta += 2;
          why.push(
            `Light sponsorship presence (ratio=${ratio.toFixed(2)}, confidence=${String(
              payload?.brandAdsConfidence
            )})`
          );
        }
      } else if (ratio > 0) {
        delta += 1;
        why.push(`Sponsorship signals detected but low confidence (ratio=${ratio.toFixed(2)})`);
      }

      // 2) Brand-safety penalty (simple heuristic on redFlags)
      const redFlags: string[] = Array.isArray(payload?.redFlags) ? payload.redFlags : [];
      const redText = redFlags.join(" | ").toLowerCase();

      if (redText.includes("graphic") || redText.includes("gore") || redText.includes("disturb")) {
        delta -= 4;
        why.push("Brand-safety penalty: graphic/disturbing content risk");
      }
      if (redText.includes("copyright") || redText.includes("licensing") || redText.includes("rights")) {
        delta -= 3;
        why.push("Brand-safety penalty: licensing/copyright risk");
      }
      if (redText.includes("defamation") || redText.includes("misinformation")) {
        delta -= 2;
        why.push("Brand-safety penalty: defamation/misinformation risk");
      }

      // Clamp total adjustment
      delta = clamp(delta, -10, 10);

      return { delta, why };
    }

    // If any enrichment filter is present, require include=enrichment
    const wantsEnrichmentFiltering =
      hasBrandAds !== undefined ||
      minBrandAdsRatio !== undefined ||
      minBrandAdsConfidence !== undefined ||
      nicheIncludes !== undefined ||
      languageDetected !== undefined;

    if (wantsEnrichmentFiltering && !includeEnrichment) {
      return reply.status(400).send({
        error: "Enrichment filters require include=enrichment",
        hint: "Use /runs/:runId?include=enrichment&hasBrandAds=true (etc.)"
      });
    }

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
      return buildRunResultView({ runResult: r, enrichmentRow: e, includeEnrichment });
    });

    // -------------------------
    // 11.3 Apply enrichment filters (if requested)
    // -------------------------
    let filteredResults = results;

    if (wantsEnrichmentFiltering) {
      const minRatio = minBrandAdsRatio !== undefined ? Number(minBrandAdsRatio) : undefined;
      const minConf =
        minBrandAdsConfidence !== undefined ? confRank(minBrandAdsConfidence) : undefined;

      filteredResults = results.filter((r: any) => {
        const e = r.enrichment; // { status, model, payload } | {status:"missing"...} | undefined
        const p = e?.payload;

        // If enrichment isn't present yet, it can't pass enrichment filters
        if (!p) return false;

        // hasBrandAds filter
        if (hasBrandAds !== undefined) {
          const want = hasBrandAds === "true" || hasBrandAds === "1";
          const actual = Boolean(p.hasBrandAdsLastN);
          if (actual !== want) return false;
        }

        // minBrandAdsRatio filter
        if (minRatio !== undefined && Number.isFinite(minRatio)) {
          const ratio = Number(p?.sponsorship?.ratio ?? 0);
          if (ratio < minRatio) return false;
        }

        // minBrandAdsConfidence filter
        if (minConf !== undefined) {
          const actual = confRank(p.brandAdsConfidence);
          if (actual < minConf) return false;
        }

        // nicheIncludes filter (case-insensitive substring match against niche labels)
        if (nicheIncludes !== undefined && nicheIncludes.trim().length > 0) {
          const needle = nicheIncludes.trim().toLowerCase();
          const labels: string[] = Array.isArray(p.nicheLabels) ? p.nicheLabels : [];
          const ok = labels.some((x) => String(x).toLowerCase().includes(needle));
          if (!ok) return false;
        }

        // languageDetected filter (case-insensitive exact match)
        if (languageDetected !== undefined && languageDetected.trim().length > 0) {
          const wantLang = languageDetected.trim().toLowerCase();
          const actualLang = String(p.languageDetected ?? "").trim().toLowerCase();
          if (!actualLang || actualLang !== wantLang) return false;
        }

        return true;
      });
    }

    let resultsFinal = filteredResults;

    if (includeEnrichment) {
      resultsFinal = filteredResults
        .slice()
        .sort((a: any, b: any) => Number(b.finalScore ?? 0) - Number(a.finalScore ?? 0));
    }

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

      results: resultsFinal
    };
  });

  // GET /runs/:runId/export (DB-backed)
  app.get("/runs/:runId/export", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const { format, include } = request.query as { format?: string; include?: string };
    const includeEnrichment = include === "enrichment";

    const found = await getRunById(runId);
    if (!found) return reply.status(404).send({ error: "Run not found" });

    const results = found.results;

    if (format === "json") {
      // reuse the same output logic as GET /runs/:runId
      // easiest/cleanest: call the same repo + mapping path here

      const enrichmentByChannelId = new Map<string, any>();
      if (includeEnrichment) {
        const enrichments = await getEnrichmentsForRun(runId);
        for (const e of enrichments as any[]) {
          if ((e as any).channelId) enrichmentByChannelId.set((e as any).channelId, e);
        }
      }

      const resultsJson = found.results.map((r: any) => {
        const e = includeEnrichment ? enrichmentByChannelId.get(r.channelId) : undefined;
        return buildRunResultView({ runResult: r, enrichmentRow: e, includeEnrichment });
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
        results: resultsJson
      };
    }

    if (format === "csv") {
      reply.header("Content-Type", "text/csv");

      // 11.6: join enrichment rows for CSV when requested
      const enrichmentByChannelId = new Map<string, any>();
      if (includeEnrichment) {
        const enrichments = await getEnrichmentsForRun(runId);
        for (const e of enrichments as any[]) {
          if ((e as any).channelId) enrichmentByChannelId.set((e as any).channelId, e);
        }
      }

      const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

      const confRank = (c: any) => {
        const v = String(c ?? "").toLowerCase();
        if (v === "high") return 3;
        if (v === "medium") return 2;
        if (v === "low") return 1;
        return 0;
      };

      // Same logic as GET /runs/:runId
      function enrichmentDelta(payload: any): { delta: number; why: string[] } {
        let delta = 0;
        const why: string[] = [];

        const ratio = Number(payload?.sponsorship?.ratio ?? 0);
        const conf = confRank(payload?.brandAdsConfidence);

        if (conf >= 2) {
          if (ratio >= 0.5) {
            delta += 8;
            why.push(
              `Sponsorship-heavy channel (ratio=${ratio.toFixed(2)}, confidence=${String(
                payload?.brandAdsConfidence
              )})`
            );
          } else if (ratio >= 0.2) {
            delta += 5;
            why.push(
              `Some sponsorship presence (ratio=${ratio.toFixed(2)}, confidence=${String(
                payload?.brandAdsConfidence
              )})`
            );
          } else if (ratio > 0) {
            delta += 2;
            why.push(
              `Light sponsorship presence (ratio=${ratio.toFixed(2)}, confidence=${String(
                payload?.brandAdsConfidence
              )})`
            );
          }
        } else if (ratio > 0) {
          delta += 1;
          why.push(`Sponsorship signals detected but low confidence (ratio=${ratio.toFixed(2)})`);
        }

        const redFlags: string[] = Array.isArray(payload?.redFlags) ? payload.redFlags : [];
        const redText = redFlags.join(" | ").toLowerCase();

        if (redText.includes("graphic") || redText.includes("gore") || redText.includes("disturb")) {
          delta -= 4;
          why.push("Brand-safety penalty: graphic/disturbing content risk");
        }
        if (
          redText.includes("copyright") ||
          redText.includes("licensing") ||
          redText.includes("rights")
        ) {
          delta -= 3;
          why.push("Brand-safety penalty: licensing/copyright risk");
        }
        if (redText.includes("defamation") || redText.includes("misinformation")) {
          delta -= 2;
          why.push("Brand-safety penalty: defamation/misinformation risk");
        }

        delta = clamp(delta, -10, 10);
        return { delta, why };
      }

      const headerBase =
        "channel_id,channel_name,channel_url,subscriber_count,avg_views_last_n,days_since_last_upload,final_score,score_version\n";

      const headerExtended =
        "channel_id,channel_name,channel_url,subscriber_count,avg_views_last_n,days_since_last_upload,final_score,final_score_base,final_score_delta,final_score_final,has_brand_ads_last_n,brand_ads_confidence,sponsorship_ratio,why,sponsor_evidence,score_version\n";

      const header = includeEnrichment ? headerExtended : headerBase;

      // minimal CSV escaping for commas/quotes
      const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;

      const rows = results
        .map((r: any) => {
          if (!includeEnrichment) {
            return [
              esc(r.channelId),
              esc(r.channelName),
              esc(r.channelUrl),
              r.subscriberCount ?? 0,
              r.avgViewsLastN ?? 0,
              r.daysSinceLastUpload ?? 0,
              r.finalScore ?? 0,
              esc("11.8")
            ].join(",");
          }

          // Use shared view builder for consistent logic
          const e = enrichmentByChannelId.get(r.channelId);
          const view = buildRunResultView({ runResult: r, enrichmentRow: e, includeEnrichment });

          // sponsor evidence
          let sponsorEvidence = "";
          if (
            view.enrichment &&
            view.enrichment.payload &&
            view.enrichment.payload.sponsorship &&
            Array.isArray(view.enrichment.payload.sponsorship.evidence)
          ) {
            sponsorEvidence = view.enrichment.payload.sponsorship.evidence
              .slice(0, 5)
              .map((ev: any) => `${ev.videoId}:${ev.where}:${ev.match}`)
              .join(" | ");
          }

          return [
            esc(view.metrics.channelId),
            esc(view.metrics.channelName),
            esc(view.metrics.channelUrl),
            view.metrics.subscriberCount ?? 0,
            view.metrics.avgViewsLastN ?? 0,
            view.metrics.daysSinceLastUpload ?? 0,
            view.finalScore ?? 0,

            view.finalScoreBase,
            view.finalScoreDelta,
            view.finalScoreFinal,

            esc(
              view.enrichment?.payload?.hasBrandAdsLastN === null
                ? ""
                : String(Boolean(view.enrichment?.payload?.hasBrandAdsLastN))
            ),
            esc(view.enrichment?.payload?.brandAdsConfidence ?? ""),
            esc(
              view.enrichment?.payload?.sponsorship?.ratio === undefined ||
                view.enrichment?.payload?.sponsorship?.ratio === null
                ? ""
                : Number(view.enrichment?.payload?.sponsorship?.ratio).toFixed(4)
            ),
            esc(Array.isArray(view.why) ? view.why.join("; ") : ""),
            esc(sponsorEvidence),
            esc("11.8")
          ].join(",");
        })
        .join("\n");

      reply.send(header + rows + "\n");
      return;
    }

    return {
      message: "Export format not implemented yet",
      available_formats: ["csv", "json"]
    };
  });

    // GET /runs/:runId/enrich/status
  // Step 10.3: Cheap progress endpoint (DB-only)
  app.get("/runs/:runId/enrich/status", async (request, reply) => {
    const { runId } = request.params as { runId: string };

    const found = await getRunById(runId);
    if (!found) {
      return reply.status(404).send({ error: "Run not found" });
    }

    const total = found.results.length;

    const enrichments = await getEnrichmentsForRun(runId);

    let success = 0;
    let failed = 0;
    let pending = 0;
    let other = 0;

    for (const e of enrichments as any[]) {
      const s = String((e as any).status ?? "").toLowerCase();
      if (s === "success") success++;
      else if (s === "failed") failed++;
      else if (s === "pending") pending++;
      else other++;
    }

    const missing = Math.max(0, total - (success + failed + pending + other));

    return {
      version: "10.3-status",
      run_id: runId,
      total,
      success,
      failed,
      pending,
      other,
      missing
    };
  });
  // POST /runs/:runId/enrich
  // Step 10.6: Non-blocking async job (in-process), expose summary fields and stable snapshot
  app.post("/runs/:runId/enrich", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const { force } = request.query as { force?: string };
    const forceEnrich = force === "true" || force === "1";

    // Validate run exists (cheap)
    const found = await getRunById(runId);
    if (!found) {
      return reply.status(404).send({ error: "Run not found" });
    }

    const total = found.results.length;

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

    // Step 10.5: hard timeout guard (ms)
    const jobTimeoutMs = Math.max(
      10_000,
      Math.min(Number(process.env.ENRICH_JOB_TIMEOUT_MS ?? 180_000), 30 * 60 * 1000)
    );

    const existingJob = enrichJobs.get(runId);
    if (existingJob?.status === "running") {
      // Already running — return 202 with current job state
      return reply.status(202).send({
        version: "10.8-cleanup",
        run_id: runId,
        accepted: false,
        reason: "already_running",
        job: existingJob
      });
    }

    const startedAt = new Date().toISOString();
    const jobState: EnrichJobState = {
      status: "running",
      startedAt,
      forced: forceEnrich,
      concurrency,
      lastError: null,
      total
    };
    enrichJobs.set(runId, jobState);

    // Step 10.5/10.8: clear any previous timers (timeout + cleanup) for this run
    clearJobTimers(runId);

    const log = request.log.child({ runId, forceEnrich, concurrency, job: "enrich" });

    const timeoutHandle = setTimeout(() => {
      const current = enrichJobs.get(runId);
      if (current?.status === "running") {
        enrichJobs.set(runId, {
          status: "failed",
          startedAt,
          finishedAt: new Date().toISOString(),
          forced: forceEnrich,
          concurrency,
          lastError: `timeout after ${jobTimeoutMs}ms`,
          total
        });

        // Step 10.8: cleanup failed job state after TTL
        scheduleJobCleanup(runId, log);
      }
    }, jobTimeoutMs);

    enrichJobTimers.set(runId, timeoutHandle);

    // Fire-and-forget execution (do not await)
    setImmediate(() => {
      runEnrichmentJob({
        runId,
        forceEnrich,
        apiKey,
        model,
        concurrency,
        log
      })
        .then((summary) => {
          clearJobTimers(runId);

          enrichJobs.set(runId, {
            status: "done",
            startedAt,
            finishedAt: new Date().toISOString(),
            forced: forceEnrich,
            concurrency,
            lastError: null,
            total,
            enriched: summary.enriched,
            skipped: summary.skipped,
            failed: summary.failed
          });

          scheduleJobCleanup(runId, log);

          log.info({ summary }, "ENRICH v10.8 cleanup job done");
        })
        .catch((err: any) => {
          clearJobTimers(runId);

          enrichJobs.set(runId, {
            status: "failed",
            startedAt,
            finishedAt: new Date().toISOString(),
            forced: forceEnrich,
            concurrency,
            lastError: err?.message ?? "Unknown error",
            total
          });

          scheduleJobCleanup(runId, log);

          log.error({ err }, "ENRICH v10.8 cleanup job failed");
        });
    });

    return reply.status(202).send({
      version: "10.8-cleanup",
      run_id: runId,
      accepted: true,
      job: { ...jobState },
      next: {
        status: `/runs/${runId}/enrich/status`,
        job: `/runs/${runId}/enrich/job?include=status`
      }
    });
  });
}
