import { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { buildChannelContentFingerprint } from "../domain/content-fingerprint";
import { scoreChannel } from "../domain/score";
import { mapYoutubeToChannelMetrics } from "../integrations/youtube/mapper";
import { getChannelDetails, getRecentVideos } from "../integrations/youtube/client";
import { enrichChannel } from "../integrations/llm/openai";
import {
  applyCatalogChannelEnrichment,
  getCatalogCoverageSummary,
  getCatalogChannelMaintenanceContext,
  getCatalogStaleSummary,
  listCatalogChannelsNeedingEnrichment,
  listCatalogChannelsNeedingRefresh,
  replaceCatalogVideoSamples,
  upsertCatalogChannelSnapshot,
  type CatalogMaintenanceCandidate,
  type CatalogMaintenanceChannel
} from "../repositories/catalog.repo";
import { RunRequestSchema } from "../schemas/run.schema";
import {
  buildDiscoveryRunPayload,
  claimCatalogJobs,
  consumeReservedQuotaUnits,
  countCatalogChannelsFirstSeenSince,
  createCatalogJob,
  createDiscoverySeed,
  estimateDiscoverQuotaUnits,
  estimateEnrichQuotaUnits,
  estimateRefreshQuotaUnits,
  getCatalogJobByDedupeKey,
  getCatalogWorkerHealth,
  getQuotaLedger,
  listCatalogJobs,
  listDiscoverySeeds,
  markCatalogJobFailed,
  markCatalogJobSucceeded,
  noteDiscoverySeedPlanned,
  recordDiscoverySeedDispatch,
  recordDiscoverySeedFailure,
  recordDiscoverySeedSuccess,
  requeueCatalogJob,
  releaseReservedQuotaUnits,
  reserveQuotaUnits,
  toQuotaDay,
  updateDiscoverySeed,
  type CatalogJobType
} from "../repositories/scheduler.repo";
import { executeRunRequest } from "../services/run-execution";

const JobTypeSchema = z.enum([
  "discover",
  "refresh_metrics",
  "enrich",
  "force_refresh",
  "force_enrich"
]);

const JobStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "dead_letter"
]);

const DiscoverySeedCreateSchema = RunRequestSchema.extend({
  name: z.string().trim().min(1).max(120).optional(),
  active: z.boolean().optional(),
  priority: z.number().int().min(-100).max(100).optional(),
  max_attempts: z.number().int().min(1).max(10).optional()
});

const DiscoverySeedPatchSchema = DiscoverySeedCreateSchema.partial();

const BootstrapSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  seed_ids: z.array(z.string().min(1)).max(200).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  ignore_quota: z.boolean().optional()
});

const MaintenanceBootstrapSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  stale_after_days: z.number().int().min(0).max(3650).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  ignore_quota: z.boolean().optional(),
  channel_ids: z.array(z.string().min(1)).max(200).optional(),
  videos_to_analyze: z.number().int().min(1).max(10).optional(),
  missing_only: z.boolean().optional()
});

const ChannelJobPayloadSchema = z.object({
  channel_id: z.string().trim().min(1),
  videos_to_analyze: z.number().int().min(1).max(10).optional()
});

const DispatchSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  type: JobTypeSchema.optional(),
  worker_id: z.string().trim().min(1).max(120).optional(),
  lock_ttl_ms: z.number().int().min(1000).max(24 * 60 * 60 * 1000).optional(),
  stop_on_error: z.boolean().optional()
});

const StartDiscoverySchema = BootstrapSchema.extend({
  dispatch_limit: z.number().int().min(1).max(100).optional(),
  worker_id: z.string().trim().min(1).max(120).optional(),
  lock_ttl_ms: z.number().int().min(1000).max(24 * 60 * 60 * 1000).optional(),
  stop_on_error: z.boolean().optional()
});

const CoverageQuerySchema = z.object({
  limit: z.number().int().min(1).max(50).optional(),
  refresh_stale_after_days: z.number().int().min(0).max(3650).optional(),
  enrich_stale_after_days: z.number().int().min(0).max(3650).optional()
});

const WorkerHealthQuerySchema = z.object({
  stuck_after_minutes: z.number().int().min(1).max(24 * 60).optional(),
  stuck_limit: z.number().int().min(1).max(100).optional()
});

export type DiscoveryBootstrapInput = z.infer<typeof BootstrapSchema>;
export type MaintenanceBootstrapInput = z.infer<typeof MaintenanceBootstrapSchema>;
export type DispatchJobsInput = z.infer<typeof DispatchSchema>;

type DiscoverJobSuccessOutcome = {
  ok: true;
  executed: boolean;
  retriable: false;
  result: {
    run_id?: string;
    result_count: number;
    new_channels: number;
    status_code: number;
    response: unknown;
    channel_id?: string;
    score_final?: number;
    estimated_category?: string;
    estimated_type?: string;
    country_inferred?: string | null;
    country_confidence?: string | null;
    language_code?: string | null;
    language_detected?: string;
    language_confidence?: string | null;
    used_stored_context?: boolean;
  };
};

type DiscoverJobFailureOutcome = {
  ok: false;
  executed: boolean;
  retriable: boolean;
  error: string;
  result: {
    status_code?: number;
    response: unknown;
    channel_id?: string;
    score_final?: number;
    estimated_category?: string;
    estimated_type?: string;
    country_inferred?: string | null;
    country_confidence?: string | null;
    language_code?: string | null;
    language_detected?: string;
    language_confidence?: string | null;
    used_stored_context?: boolean;
  };
};

type DiscoverJobOutcome = DiscoverJobSuccessOutcome | DiscoverJobFailureOutcome;

type YouTubeChannelDetail = Awaited<ReturnType<typeof getChannelDetails>>[number];

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes"].includes(normalized)) return true;
  if (["0", "false", "no"].includes(normalized)) return false;
  return undefined;
}

function parseOptionalNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseBooleanEnv(name: string, fallback: boolean) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parsePositiveIntEnv(name: string, fallback: number, min: number, max: number) {
  const parsed = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function normalizeErrorMessage(input: unknown): string {
  if (input instanceof Error) return input.message;
  if (typeof input === "string") return input;
  try {
    return JSON.stringify(input);
  } catch {
    return "Unknown error";
  }
}

function computeRetryDelayMs(attempts: number): number {
  const baseMs = Math.max(5_000, Number(process.env.SCHEDULER_RETRY_BASE_MS ?? 60_000));
  const cappedAttempts = Math.max(0, Math.min(attempts, 6));
  return Math.min(6 * 60 * 60 * 1000, baseMs * 2 ** cappedAttempts);
}

function extractDiscoverChannelIds(body: unknown): string[] {
  const results =
    body && typeof body === "object" && Array.isArray((body as { results?: unknown[] }).results)
      ? (body as { results: unknown[] }).results
      : [];

  return results
    .map((result) => {
      if (!result || typeof result !== "object") return null;
      const metrics = (result as { metrics?: { channelId?: unknown } }).metrics;
      return typeof metrics?.channelId === "string" ? metrics.channelId : null;
    })
    .filter((value): value is string => Boolean(value));
}

function normalizeRecentVideoLimit(value: unknown) {
  return Math.max(1, Math.min(Number(value) || 5, 10));
}

function normalizeEmailCandidate(value: string): string {
  return value
    .trim()
    .replace(/^[<(\["']+/, "")
    .replace(/[>),\]"';:.!?]+$/, "")
    .toLowerCase();
}

function extractEmailFromText(value: string): string | null {
  if (value.trim().length === 0) return null;

  const matches = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  for (const match of matches) {
    const normalized = normalizeEmailCandidate(match);
    if (/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalized)) {
      return normalized;
    }
  }

  return null;
}

function findContactEmail(input: {
  description: string;
  videoIds: string[];
  titles: string[];
  descriptions: string[];
}) {
  const bioEmail = extractEmailFromText(input.description);
  if (bioEmail) {
    return {
      email: bioEmail,
      source: "bio" as const,
      videoId: null,
      videoTitle: null
    };
  }

  const n = Math.max(
    input.videoIds.length,
    input.titles.length,
    input.descriptions.length
  );
  for (let i = 0; i < n; i++) {
    const videoEmail = extractEmailFromText(input.descriptions[i] ?? "");
    if (!videoEmail) continue;

    return {
      email: videoEmail,
      source: "video_description" as const,
      videoId: input.videoIds[i] ?? null,
      videoTitle: input.titles[i] ?? null
    };
  }

  return null;
}

function isRetryableExecutionError(error: unknown) {
  const message = normalizeErrorMessage(error).toLowerCase();
  return (
    message.includes("quota") ||
    message.includes("429") ||
    message.includes("rate limit") ||
    message.includes("http 5") ||
    message.includes("timeout") ||
    message.includes("temporarily") ||
    message.includes("network")
  );
}

async function listMaintenanceCandidates(args: {
  type: "refresh_metrics" | "enrich" | "force_refresh" | "force_enrich";
  stale_after_days?: number;
  limit?: number;
  channel_ids?: string[];
  missing_only?: boolean;
}) {
  if (args.channel_ids && args.channel_ids.length > 0) {
    const contexts = await Promise.all(
      args.channel_ids.map((channelId) => getCatalogChannelMaintenanceContext(channelId))
    );

    return contexts
      .filter((context): context is CatalogMaintenanceChannel => Boolean(context))
      .map(
        (context): CatalogMaintenanceCandidate => ({
          channel_id: context.channel_id,
          channel_name: context.channel_name,
          channel_url: context.channel_url,
          last_metrics_refresh_at: context.freshness.last_metrics_refresh_at,
          last_enriched_at: context.freshness.last_enriched_at,
          subscriber_count: context.metrics.subscriber_count
        })
      );
  }

  if (args.type === "refresh_metrics" || args.type === "force_refresh") {
    return listCatalogChannelsNeedingRefresh({
      staleAfterDays: args.stale_after_days,
      limit: args.limit
    });
  }

  return listCatalogChannelsNeedingEnrichment({
    staleAfterDays: args.stale_after_days,
    limit: args.limit,
    missingOnly: args.missing_only
  });
}

export async function bootstrapMaintenanceJobs(args: {
  type: "refresh_metrics" | "enrich" | "force_refresh" | "force_enrich";
  input: MaintenanceBootstrapInput;
}) {
  const quotaDay = toQuotaDay(args.input.day);
  const candidates = await listMaintenanceCandidates({
    type: args.type,
    stale_after_days: args.input.stale_after_days,
    limit: args.input.limit,
    channel_ids: args.input.channel_ids,
    missing_only: args.input.missing_only
  });
  const created: any[] = [];
  const skipped: Array<{ channel_id: string; reason: string }> = [];
  const duplicates: Array<{ channel_id: string; job_id: string }> = [];
  const estimatedUnits =
    args.type === "refresh_metrics" || args.type === "force_refresh"
      ? estimateRefreshQuotaUnits()
      : estimateEnrichQuotaUnits();

  for (const candidate of candidates) {
    const dedupeKey = `${args.type}:${candidate.channel_id}:${quotaDay}`;
    const existingJob = await getCatalogJobByDedupeKey(dedupeKey);
    if (existingJob) {
      duplicates.push({ channel_id: candidate.channel_id, job_id: existingJob.id });
      continue;
    }

    const reserved = await reserveQuotaUnits({
      day: quotaDay,
      units: estimatedUnits,
      ignoreReserve: args.input.ignore_quota === true
    });

    if (!reserved.ok) {
      skipped.push({
        channel_id: candidate.channel_id,
        reason: "reason" in reserved ? reserved.reason ?? "quota_reserve" : "quota_reserve"
      });
      continue;
    }

    try {
      const job = await createCatalogJob({
        type: args.type,
        payload: {
          channel_id: candidate.channel_id,
          videos_to_analyze: args.input.videos_to_analyze
        },
        priority: candidate.subscriber_count > 0
          ? Math.max(0, Math.min(100, Math.trunc(Math.log10(candidate.subscriber_count) * 10)))
          : 0,
        dedupeKey,
        quotaDay,
        estimatedQuotaUnits: estimatedUnits,
        reservedQuotaUnits: estimatedUnits
      });

      created.push(job);
    } catch (error) {
      await releaseReservedQuotaUnits({ day: quotaDay, units: estimatedUnits });
      const duplicateJob = await getCatalogJobByDedupeKey(dedupeKey);
      if (duplicateJob) {
        duplicates.push({ channel_id: candidate.channel_id, job_id: duplicateJob.id });
        continue;
      }
      throw error;
    }
  }

  return {
    day: quotaDay,
    type: args.type,
    created_count: created.length,
    skipped_count: skipped.length,
    duplicate_count: duplicates.length,
    created,
    skipped,
    duplicates,
    quota: await getQuotaLedger(quotaDay)
  };
}

async function executeRefreshJob(
  job: any,
  preloadedChannel?: YouTubeChannelDetail
): Promise<DiscoverJobOutcome> {
  const payloadResult = ChannelJobPayloadSchema.safeParse(job.payload);
  if (!payloadResult.success) {
    return {
      ok: false,
      executed: false,
      retriable: false,
      error: "Stored refresh job payload is invalid",
      result: { response: payloadResult.error.format() }
    };
  }

  if (!process.env.YOUTUBE_API_KEY) {
    return {
      ok: false,
      executed: false,
      retriable: false,
      error: "Missing YOUTUBE_API_KEY",
      result: { response: { error: "Missing YOUTUBE_API_KEY" } }
    };
  }

  const channelId = payloadResult.data.channel_id;
  const existing = await getCatalogChannelMaintenanceContext(channelId);
  if (!existing) {
    return {
      ok: false,
      executed: false,
      retriable: false,
      error: "Catalog channel not found",
      result: { channel_id: channelId, response: { error: "Channel not found" } }
    };
  }

  try {
    const channel = preloadedChannel ?? (await getChannelDetails([channelId]))[0];
    if (!channel) {
      return {
        ok: false,
        executed: true,
        retriable: false,
        error: "YouTube channel not found",
        result: { channel_id: channelId, response: { error: "YouTube channel not found" } }
      };
    }

    const safeVideosToAnalyze = normalizeRecentVideoLimit(
      payloadResult.data.videos_to_analyze ?? existing.videos.length
    );
    const recent = await getRecentVideos(
      channelId,
      safeVideosToAnalyze,
      channel.uploadsPlaylistId ?? undefined
    );

    const metrics = mapYoutubeToChannelMetrics({
      channelId,
      channelName: channel.channelName ?? existing.channel_name,
      channelUrl: channel.channelUrl ?? existing.channel_url,
      subscriberCount: Number(channel.subscriberCount ?? existing.metrics.subscriber_count ?? 0),
      recentViews: recent.views ?? [],
      recentLikes: recent.likes ?? [],
      recentComments: recent.comments ?? [],
      daysSinceLastUpload: Number(recent.daysSinceLastUpload ?? 9999)
    });
    const scored = scoreChannel(metrics);
    const contact = findContactEmail({
      description: channel.description ?? "",
      videoIds: recent.videoIds ?? [],
      titles: recent.titles ?? [],
      descriptions: recent.descriptions ?? []
    });
    const contentFingerprint = buildChannelContentFingerprint({
      description: channel.description ?? existing.channel_description ?? "",
      titles: recent.titles ?? [],
      descriptions: recent.descriptions ?? [],
      publishedAts: recent.publishedAts ?? []
    });

    await upsertCatalogChannelSnapshot({
      channelId,
      channelName: metrics.channelName,
      channelUrl: metrics.channelUrl,
      channelDescription: channel.description ?? existing.channel_description,
      subscriberCount: metrics.subscriberCount,
      minViewsLastN: metrics.minViewsLastN,
      avgViewsLastN: metrics.avgViewsLastN,
      engagementRateLastN: metrics.engagementRateLastN,
      daysSinceLastUpload: metrics.daysSinceLastUpload,
      countryInferred: existing.enrichment.country_inferred,
      countryConfidence: existing.enrichment.country_confidence,
      languageCode: existing.enrichment.language_code,
      languageConfidence: existing.enrichment.language_confidence,
      contactEmail: contact?.email ?? null,
      contactEmailSource: contact?.source ?? null,
      contentFingerprint,
      scoreFinal: scored.finalScore,
      scoreBreakdown: {
        base: scored.scores,
        final: scored.finalScore
      }
    });

    await replaceCatalogVideoSamples(
      channelId,
      (recent.videoIds ?? []).map((videoId, index) => ({
        channelId,
        videoId,
        title: recent.titles[index] ?? "",
        description: recent.descriptions[index] ?? "",
        views: Number(recent.views[index] ?? 0),
        likes: Number(recent.likes[index] ?? 0),
        comments: Number(recent.comments[index] ?? 0),
        publishedAt: recent.publishedAts[index] ?? null,
        emailFound: contact?.source === "video_description" && contact.videoId === videoId,
        emailSource:
          contact?.source === "video_description" && contact.videoId === videoId
            ? "video_description"
            : null
      }))
    );

    return {
      ok: true,
      executed: true,
      retriable: false,
      result: {
        channel_id: channelId,
        score_final: scored.finalScore,
        result_count: 1,
        new_channels: 0,
        status_code: 200,
        response: { channel_id: channelId, score_final: scored.finalScore }
      }
    };
  } catch (error) {
    return {
      ok: false,
      executed: true,
      retriable: isRetryableExecutionError(error),
      error: normalizeErrorMessage(error),
      result: { channel_id: channelId, response: { error: normalizeErrorMessage(error) } }
    };
  }
}

function buildChannelEnrichmentPrompt(context: CatalogMaintenanceChannel) {
  const promptDescription =
    context.channel_description && context.channel_description.trim().length > 0
      ? context.channel_description
      : "(no description)";
  const promptTitles = context.videos
    .slice(0, 5)
    .map((video) => video.title.trim())
    .filter((title) => title.length > 0);

  return `
Channel name: ${context.channel_name}
Subscribers: ${context.metrics.subscriber_count}
Average views (last N): ${context.metrics.avg_views_last_n}
Days since last upload: ${context.metrics.days_since_last_upload}

Channel description:
${promptDescription}

Recent video titles:
${promptTitles.length > 0 ? promptTitles.map((title) => `- ${title}`).join("\n") : "(no recent titles)"}

Current locale hints:
- Country hint: ${context.enrichment.country_inferred ?? "unknown"} (${context.enrichment.country_confidence ?? "unknown"} confidence)
- Language hint: ${context.enrichment.language_code ?? "unknown"} / ${context.enrichment.language_detected ?? "unknown"} (${context.enrichment.language_confidence ?? "unknown"} confidence)

Task:
Classify this channel for influencer scouting. Use locale hints only when the content is ambiguous.
  `.trim();
}

async function executeEnrichJob(job: any): Promise<DiscoverJobOutcome> {
  const payloadResult = ChannelJobPayloadSchema.safeParse(job.payload);
  if (!payloadResult.success) {
    return {
      ok: false,
      executed: false,
      retriable: false,
      error: "Stored enrich job payload is invalid",
      result: { response: payloadResult.error.format() }
    };
  }

  const channelId = payloadResult.data.channel_id;
  let context = await getCatalogChannelMaintenanceContext(channelId);
  if (!context) {
    return {
      ok: false,
      executed: false,
      retriable: false,
      error: "Catalog channel not found",
      result: { channel_id: channelId, response: { error: "Channel not found" } }
    };
  }

  let usedStoredContext = true;
  const hasEnoughStoredContext =
    (context.channel_description?.trim().length ?? 0) > 0 || context.videos.length > 0;

  if (!hasEnoughStoredContext) {
    const refreshOutcome = await executeRefreshJob({
      payload: {
        channel_id: channelId,
        videos_to_analyze: payloadResult.data.videos_to_analyze
      }
    });

    if (!refreshOutcome.ok) {
      return {
        ok: false,
        executed: refreshOutcome.executed,
        retriable: refreshOutcome.retriable,
        error: refreshOutcome.error,
        result: {
          ...refreshOutcome.result,
          channel_id: channelId
        }
      };
    }

    context = await getCatalogChannelMaintenanceContext(channelId);
    if (!context) {
      return {
        ok: false,
        executed: true,
        retriable: false,
        error: "Catalog channel context missing after refresh",
        result: { channel_id: channelId, response: { error: "Context missing after refresh" } }
      };
    }

    usedStoredContext = false;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      executed: false,
      retriable: false,
      error: "Missing OPENAI_API_KEY",
      result: { channel_id: channelId, response: { error: "Missing OPENAI_API_KEY" } }
    };
  }

  try {
    const enrichment = await enrichChannel({
      apiKey,
      model: process.env.OPENAI_MODEL ?? "gpt-5-nano",
      inputText: buildChannelEnrichmentPrompt(context)
    });

    await applyCatalogChannelEnrichment({
      channelId,
      estimatedCategory: enrichment.estimated_category,
      estimatedType: enrichment.estimated_type,
      countryInferred: enrichment.country_inferred,
      countryConfidence: enrichment.country_confidence,
      languageCode: enrichment.language_code,
      languageDetected: enrichment.language_detected,
      languageConfidence: enrichment.language_confidence
    });

    return {
      ok: true,
      executed: true,
      retriable: false,
      result: {
        channel_id: channelId,
        estimated_category: enrichment.estimated_category,
        estimated_type: enrichment.estimated_type,
        country_inferred: enrichment.country_inferred,
        country_confidence: enrichment.country_confidence,
        language_code: enrichment.language_code,
        language_detected: enrichment.language_detected,
        language_confidence: enrichment.language_confidence,
        used_stored_context: usedStoredContext,
        result_count: 1,
        new_channels: 0,
        status_code: 200,
        response: {
          channel_id: channelId,
          estimated_category: enrichment.estimated_category,
          estimated_type: enrichment.estimated_type
        }
      }
    };
  } catch (error) {
    return {
      ok: false,
      executed: true,
      retriable: isRetryableExecutionError(error),
      error: normalizeErrorMessage(error),
      result: { channel_id: channelId, response: { error: normalizeErrorMessage(error) } }
    };
  }
}

export async function bootstrapDiscoveryJobs(input: DiscoveryBootstrapInput) {
  const quotaDay = toQuotaDay(input.day);
  const limit = Math.max(1, Math.min(Number(input.limit ?? 50), 200));
  const requestedSeedIds = new Set(input.seed_ids ?? []);
  const allSeeds =
    requestedSeedIds.size > 0
      ? await listDiscoverySeeds()
      : await listDiscoverySeeds({ active: true });
  const candidateSeeds =
    requestedSeedIds.size > 0
      ? allSeeds.filter((seed) => requestedSeedIds.has(seed.id))
      : allSeeds;

  const created: any[] = [];
  const skipped: Array<{ seed_id: string; reason: string }> = [];
  const duplicates: Array<{ seed_id: string; job_id: string }> = [];

  for (const seed of candidateSeeds) {
    if (created.length >= limit) break;

    const dedupeKey = `discover:${seed.id}:${quotaDay}`;
    const existingJob = await getCatalogJobByDedupeKey(dedupeKey);
    if (existingJob) {
      duplicates.push({ seed_id: seed.id, job_id: existingJob.id });
      continue;
    }

    const runPayload = buildDiscoveryRunPayload(seed);
    const reservedUnits =
      Number(seed.estimated_quota_units ?? 0) || estimateDiscoverQuotaUnits(runPayload);
    const reserved = await reserveQuotaUnits({
      day: quotaDay,
      units: reservedUnits,
      ignoreReserve: input.ignore_quota === true
    });

    if (!reserved.ok) {
      skipped.push({
        seed_id: seed.id,
        reason: "reason" in reserved ? reserved.reason ?? "quota_reserve" : "quota_reserve"
      });
      continue;
    }

    try {
      const job = await createCatalogJob({
        type: "discover",
        payload: runPayload,
        priority: seed.priority,
        seedId: seed.id,
        dedupeKey,
        quotaDay,
        estimatedQuotaUnits: reservedUnits,
        reservedQuotaUnits: reservedUnits,
        maxAttempts: seed.max_attempts
      });

      await noteDiscoverySeedPlanned(seed.id);
      created.push(job);
    } catch (error) {
      await releaseReservedQuotaUnits({ day: quotaDay, units: reservedUnits });
      const duplicateJob = await getCatalogJobByDedupeKey(dedupeKey);
      if (duplicateJob) {
        duplicates.push({ seed_id: seed.id, job_id: duplicateJob.id });
        continue;
      }
      throw error;
    }
  }

  return {
    day: quotaDay,
    created_count: created.length,
    skipped_count: skipped.length,
    duplicate_count: duplicates.length,
    created,
    skipped,
    duplicates,
    quota: await getQuotaLedger(quotaDay)
  };
}

async function executeDiscoverJob(app: FastifyInstance, job: any): Promise<DiscoverJobOutcome> {
  const payloadResult = RunRequestSchema.safeParse(job.payload);
  if (!payloadResult.success) {
    return {
      ok: false,
      executed: false,
      retriable: false,
      error: "Stored discover job payload is invalid",
      result: { response: payloadResult.error.format() }
    };
  }

  if (!process.env.YOUTUBE_API_KEY) {
    return {
      ok: false,
      executed: false,
      retriable: false,
      error: "Missing YOUTUBE_API_KEY",
      result: { response: { error: "Missing YOUTUBE_API_KEY" } }
    };
  }

  if (job.seed_id) {
    await recordDiscoverySeedDispatch(job.seed_id);
  }

  try {
    const response = await executeRunRequest(payloadResult.data, app.log);
    const channelIds = extractDiscoverChannelIds(response);
    const newChannels = await countCatalogChannelsFirstSeenSince({
      channelIds,
      since: String(job.started_at ?? job.created_at ?? new Date().toISOString())
    });

    return {
      ok: true,
      executed: true,
      retriable: false,
      result: {
        run_id: response.run_id,
        result_count: channelIds.length,
        new_channels: newChannels,
        status_code: 200,
        response
      }
    };
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      const code = String((error as { code?: unknown }).code ?? "");
      if (code === "YOUTUBE_QUOTA_EXCEEDED") {
        return {
          ok: false,
          executed: true,
          retriable: true,
          error: error.message,
          result: {
            status_code: 429,
            response: { error: code, message: error.message }
          }
        };
      }
      if (code === "YOUTUBE_API_ERROR") {
        return {
          ok: false,
          executed: true,
          retriable: true,
          error: error.message,
          result: {
            status_code: 502,
            response: { error: code, message: error.message }
          }
        };
      }
    }

    return {
      ok: false,
      executed: true,
      retriable: true,
      error: normalizeErrorMessage(error),
      result: { response: { error: normalizeErrorMessage(error) } }
    };
  }
}

export async function dispatchJobs(app: FastifyInstance, input: DispatchJobsInput) {
  const workerId = input.worker_id ?? `manual-${randomUUID().slice(0, 8)}`;
  const claimedJobs = await claimCatalogJobs({
    workerId,
    limit: input.limit ?? 10,
    type: input.type,
    lockTtlMs: input.lock_ttl_ms
  });
  const dispatched: any[] = [];
  const requeued: any[] = [];
  const failed: any[] = [];
  let stopped = false;
  const refreshPayloads: Array<{ jobId: string; channelId: string }> = [];
  const refreshPayloadByJobId = new Map<string, string>();
  for (const job of claimedJobs) {
    if (job.type !== "refresh_metrics" && job.type !== "force_refresh") continue;
    const parsed = ChannelJobPayloadSchema.safeParse(job.payload);
    if (!parsed.success) continue;
    refreshPayloads.push({ jobId: job.id, channelId: parsed.data.channel_id });
    refreshPayloadByJobId.set(job.id, parsed.data.channel_id);
  }
  const refreshChannelIds = Array.from(
    new Set(refreshPayloads.map((entry) => entry.channelId))
  );
  const refreshChannelMap = new Map<string, YouTubeChannelDetail>();

  if (refreshChannelIds.length > 1 && process.env.YOUTUBE_API_KEY) {
    try {
      const refreshChannels = await getChannelDetails(refreshChannelIds);
      for (const channel of refreshChannels) {
        refreshChannelMap.set(channel.channelId, channel);
      }
    } catch (error) {
      app.log.warn(
        { err: error, channel_count: refreshChannelIds.length },
        "Failed to batch prefetch channel details for refresh jobs"
      );
    }
  }

  for (const job of claimedJobs) {
    let outcome: DiscoverJobOutcome | null = null;
    switch (job.type as CatalogJobType) {
      case "discover":
        outcome = await executeDiscoverJob(app, job);
        break;
      case "refresh_metrics":
      case "force_refresh":
        outcome = await executeRefreshJob(
          job,
          refreshChannelMap.get(refreshPayloadByJobId.get(job.id) ?? "")
        );
        break;
      case "enrich":
      case "force_enrich":
        outcome = await executeEnrichJob(job);
        break;
      default: {
        await releaseReservedQuotaUnits({
          day: job.quota_day,
          units: job.reserved_quota_units
        });
        const updatedJob = await markCatalogJobFailed({
          jobId: job.id,
          error: `Unsupported job type ${job.type}`,
          deadLetter: true
        });
        failed.push(updatedJob);
        if (input.stop_on_error) {
          stopped = true;
          break;
        }
        continue;
      }
    }

    if (!outcome) {
      continue;
    }

    if (outcome.ok) {
      await consumeReservedQuotaUnits({
        day: job.quota_day,
        type: job.type as CatalogJobType,
        reservedUnits: job.reserved_quota_units
      });
      const updatedJob = await markCatalogJobSucceeded({
        jobId: job.id,
        result: outcome.result
      });

      if (job.type === "discover" && job.seed_id && outcome.result.run_id) {
        await recordDiscoverySeedSuccess({
          seedId: job.seed_id,
          runId: outcome.result.run_id,
          yieldChannels: Number(outcome.result.result_count ?? 0),
          newChannels: Number(outcome.result.new_channels ?? 0)
        });
      }

      dispatched.push(updatedJob);
      continue;
    }

    const failureOutcome = outcome;

    if (job.type === "discover" && job.seed_id) {
      await recordDiscoverySeedFailure({
        seedId: job.seed_id,
        error: failureOutcome.error
      });
    }

    if (failureOutcome.executed) {
      await consumeReservedQuotaUnits({
        day: job.quota_day,
        type: job.type as CatalogJobType,
        reservedUnits: job.reserved_quota_units
      });
    } else {
      await releaseReservedQuotaUnits({
        day: job.quota_day,
        units: job.reserved_quota_units
      });
    }

    const canRetry =
      failureOutcome.retriable &&
      Number(job.attempts ?? 0) < Number(job.max_attempts ?? 1);

    if (canRetry) {
      const reservedAgain = await reserveQuotaUnits({
        day: job.quota_day,
        units: job.reserved_quota_units
      });

      if (reservedAgain.ok) {
        const nextRunAt = new Date(
          Date.now() + computeRetryDelayMs(Number(job.attempts ?? 0))
        ).toISOString();
        const requeuedJob = await requeueCatalogJob({
          jobId: job.id,
          nextRunAt,
          error: failureOutcome.error,
          result: failureOutcome.result
        });
        requeued.push(requeuedJob);
      } else {
        const updatedJob = await markCatalogJobFailed({
          jobId: job.id,
          error: `${failureOutcome.error} (retry quota reservation denied)`,
          result: failureOutcome.result
        });
        failed.push(updatedJob);
      }
    } else {
      const updatedJob = await markCatalogJobFailed({
        jobId: job.id,
        error: failureOutcome.error,
        deadLetter: Number(job.attempts ?? 0) >= Number(job.max_attempts ?? 1),
        result: failureOutcome.result
      });
      failed.push(updatedJob);
    }

    if (input.stop_on_error) {
      stopped = true;
      break;
    }
  }

  return {
    worker_id: workerId,
    claimed_count: claimedJobs.length,
    dispatched_count: dispatched.length,
    requeued_count: requeued.length,
    failed_count: failed.length,
    stopped,
    dispatched,
    requeued,
    failed
  };
}

export async function adminRoutes(app: FastifyInstance) {
  app.get("/admin/discovery/seeds", async (request) => {
    const query = request.query as Record<string, unknown>;

    return {
      results: await listDiscoverySeeds({
        active: parseOptionalBoolean(query.active)
      })
    };
  });

  app.post("/admin/discovery/seeds", async (request, reply) => {
    const parsed = DiscoverySeedCreateSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid request",
        details: parsed.error.format()
      });
    }

    const seed = await createDiscoverySeed(parsed.data);
    return reply.status(201).send(seed);
  });

  app.patch("/admin/discovery/seeds/:seedId", async (request, reply) => {
    const { seedId } = request.params as { seedId: string };
    const parsed = DiscoverySeedPatchSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid request",
        details: parsed.error.format()
      });
    }

    const seed = await updateDiscoverySeed(seedId, parsed.data);
    if (!seed) {
      return reply.status(404).send({ error: "Discovery seed not found" });
    }

    return seed;
  });

  app.get("/admin/catalog/coverage", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const parsed = CoverageQuerySchema.safeParse({
      limit: parseOptionalNumber(query.limit),
      refresh_stale_after_days: parseOptionalNumber(query.refresh_stale_after_days),
      enrich_stale_after_days: parseOptionalNumber(query.enrich_stale_after_days)
    });

    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid request",
        details: parsed.error.format()
      });
    }

    return getCatalogCoverageSummary({
      limit: parsed.data.limit,
      refreshStaleAfterDays: parsed.data.refresh_stale_after_days,
      enrichStaleAfterDays: parsed.data.enrich_stale_after_days
    });
  });

  app.get("/admin/catalog/stale", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const parsed = CoverageQuerySchema.safeParse({
      limit: parseOptionalNumber(query.limit),
      refresh_stale_after_days: parseOptionalNumber(query.refresh_stale_after_days),
      enrich_stale_after_days: parseOptionalNumber(query.enrich_stale_after_days)
    });

    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid request",
        details: parsed.error.format()
      });
    }

    return getCatalogStaleSummary({
      limit: parsed.data.limit,
      refreshStaleAfterDays: parsed.data.refresh_stale_after_days,
      enrichStaleAfterDays: parsed.data.enrich_stale_after_days
    });
  });

  app.get("/admin/workers/health", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const parsed = WorkerHealthQuerySchema.safeParse({
      stuck_after_minutes: parseOptionalNumber(query.stuck_after_minutes),
      stuck_limit: parseOptionalNumber(query.stuck_limit)
    });

    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid request",
        details: parsed.error.format()
      });
    }

    return {
      queue: await getCatalogWorkerHealth({
        stuckAfterMinutes: parsed.data.stuck_after_minutes,
        stuckLimit: parsed.data.stuck_limit
      }),
      automation: {
        auto_dispatch_enabled: parseBooleanEnv(
          "SCHEDULER_AUTO_DISPATCH_ENABLED",
          process.env.NODE_ENV !== "test"
        ),
        auto_dispatch_interval_ms: parsePositiveIntEnv(
          "SCHEDULER_AUTO_DISPATCH_INTERVAL_MS",
          60_000,
          5_000,
          24 * 60 * 60 * 1000
        ),
        auto_discovery_enabled: parseBooleanEnv(
          "SCHEDULER_AUTO_DISCOVERY_ENABLED",
          false
        ),
        auto_discovery_interval_ms: parsePositiveIntEnv(
          "SCHEDULER_AUTO_DISCOVERY_INTERVAL_MS",
          6 * 60 * 60 * 1000,
          60_000,
          24 * 60 * 60 * 1000
        ),
        auto_refresh_enabled: parseBooleanEnv("SCHEDULER_AUTO_REFRESH_ENABLED", false),
        auto_refresh_interval_ms: parsePositiveIntEnv(
          "SCHEDULER_AUTO_REFRESH_INTERVAL_MS",
          60 * 60 * 1000,
          60_000,
          24 * 60 * 60 * 1000
        ),
        auto_enrich_enabled: parseBooleanEnv("SCHEDULER_AUTO_ENRICH_ENABLED", false),
        auto_enrich_interval_ms: parsePositiveIntEnv(
          "SCHEDULER_AUTO_ENRICH_INTERVAL_MS",
          60 * 60 * 1000,
          60_000,
          24 * 60 * 60 * 1000
        )
      }
    };
  });

  app.get("/admin/quota", async (request) => {
    const query = request.query as Record<string, unknown>;
    return getQuotaLedger(typeof query.day === "string" ? query.day : undefined);
  });

  app.get("/admin/jobs", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const status =
      typeof query.status === "string" ? JobStatusSchema.safeParse(query.status) : null;
    const type = typeof query.type === "string" ? JobTypeSchema.safeParse(query.type) : null;

    if (status && !status.success) {
      return reply.status(400).send({ error: "Invalid status filter" });
    }

    if (type && !type.success) {
      return reply.status(400).send({ error: "Invalid job type filter" });
    }

    return {
      results: await listCatalogJobs({
        status: status?.success ? status.data : undefined,
        type: type?.success ? type.data : undefined,
        limit: parseOptionalNumber(query.limit)
      })
    };
  });

  app.post("/admin/discovery/bootstrap", async (request, reply) => {
    const parsed = BootstrapSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid request",
        details: parsed.error.format()
      });
    }

    return bootstrapDiscoveryJobs(parsed.data);
  });

  app.post("/admin/refresh/bootstrap", async (request, reply) => {
    const parsed = MaintenanceBootstrapSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid request",
        details: parsed.error.format()
      });
    }

    return bootstrapMaintenanceJobs({
      type: "refresh_metrics",
      input: parsed.data
    });
  });

  app.post("/admin/enrich/bootstrap", async (request, reply) => {
    const parsed = MaintenanceBootstrapSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid request",
        details: parsed.error.format()
      });
    }

    return bootstrapMaintenanceJobs({
      type: "enrich",
      input: parsed.data
    });
  });

  app.post("/admin/force-refresh", async (request, reply) => {
    const parsed = MaintenanceBootstrapSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid request",
        details: parsed.error.format()
      });
    }

    if (!parsed.data.channel_ids || parsed.data.channel_ids.length === 0) {
      return reply.status(400).send({
        error: "channel_ids is required for force refresh"
      });
    }

    return bootstrapMaintenanceJobs({
      type: "force_refresh",
      input: parsed.data
    });
  });

  app.post("/admin/force-enrich", async (request, reply) => {
    const parsed = MaintenanceBootstrapSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid request",
        details: parsed.error.format()
      });
    }

    if (!parsed.data.channel_ids || parsed.data.channel_ids.length === 0) {
      return reply.status(400).send({
        error: "channel_ids is required for force enrich"
      });
    }

    return bootstrapMaintenanceJobs({
      type: "force_enrich",
      input: parsed.data
    });
  });

  app.post("/admin/jobs/dispatch", async (request, reply) => {
    const parsed = DispatchSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid request",
        details: parsed.error.format()
      });
    }

    return dispatchJobs(app, parsed.data);
  });

  app.post("/admin/discovery/start", async (request, reply) => {
    const parsed = StartDiscoverySchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid request",
        details: parsed.error.format()
      });
    }

    const bootstrap = await bootstrapDiscoveryJobs(parsed.data);
    const dispatch = await dispatchJobs(app, {
      limit: parsed.data.dispatch_limit ?? bootstrap.created_count,
      worker_id: parsed.data.worker_id,
      lock_ttl_ms: parsed.data.lock_ttl_ms,
      stop_on_error: parsed.data.stop_on_error,
      type: "discover"
    });

    return {
      bootstrap,
      dispatch,
      quota: await getQuotaLedger(bootstrap.day)
    };
  });
}
