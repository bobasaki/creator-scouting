export type RunRequest = {
  keywords: string[];
  exclude_keywords?: string[];
  region: string;
  language: string;
  max_channels?: number;
  videos_to_analyze?: number;
  min_views?: number;
  min_avg_views?: number;
  max_days_since_upload?: number;
  min_engagement_rate?: number;
  [key: string]: unknown;
};

export type RunSummary = {
  run_id: string;
  created_at: string;
  input: {
    keywords: string[];
    region: string;
    language: string;
    max_channels: number | null;
    videos_to_analyze: number | null;
    exclude_keywords?: string[] | null;
    min_views?: number | null;
    min_avg_views?: number | null;
    max_days_since_upload?: number | null;
    min_engagement_rate?: number | null;
  };
};

export type RunInput = {
  keywords: string[];
  region: string;
  language: string;
  max_channels?: number;
  videos_to_analyze?: number;
  exclude_keywords?: string[];
  min_views?: number;
  min_avg_views?: number;
  max_days_since_upload?: number;
  min_engagement_rate?: number;
  min_subscribers?: number;
};

export type RunEnrichmentPayload = {
  estimatedCategory: string | null;
  estimatedType: string | null;
  countryInferred?: string | null;
  countryConfidence?: "low" | "medium" | "high" | null;
  languageCode?: string | null;
  nicheLabels: string[] | null;
  languageDetected: string | null;
  languageConfidence?: "low" | "medium" | "high" | null;
  fitSummary: string | null;
  brandSafetyNotes: string | null;
  redFlags: string[] | null;
  sponsorship:
    | {
        ratio?: number | null;
        sponsoredCount?: number | null;
        confidence?: string | null;
        evidence?:
          | Array<
              | string
              | {
                  videoId?: string | null;
                  where?: string | null;
                  match?: string | null;
                }
            >
          | null;
      }
    | null;
  hasBrandAdsLastN: boolean | null;
  brandAdsConfidence: string | null;
  raw: unknown | null;
};

export type RunEnrichment = {
  status: string;
  model: string | null;
  payload: RunEnrichmentPayload | null;
};

export type ScoreBreakdown = {
  base: {
    total: number;
    components: Record<string, number>;
  };
  enrichment: {
    total: number;
    components: {
      sponsorship?: number;
      brandSafety?: number;
      [key: string]: number | undefined;
    };
  };
  final: number;
};

export type RunScanContext = {
  contact_email:
    | {
        email: string;
        source: "bio" | "video_description";
        video_id: string | null;
        video_title: string | null;
      }
    | null;
  videos_scanned: Array<{
    video_id: string | null;
    title: string | null;
    email_found: boolean;
  }>;
};

export type RunResult = {
  metrics: {
    channelId: string;
    channelName: string;
    channelUrl: string;
    subscriberCount: number;
    avgViewsLastN: number;
    daysSinceLastUpload: number;
    recentViews: number[];
  };
  scores: Record<string, unknown>;
  finalScoreBase?: number;
  finalScoreDelta?: number;
  finalScoreFinal?: number;
  finalScore?: number;
  why: string[] | string | null;
  enrichment?: RunEnrichment;
  score_breakdown?: ScoreBreakdown;
  scoring_version?: string;
  final_score_base?: number;
  final_score_delta?: number;
  final_score_final?: number;
  sponsorship_ratio?: number | null;
  scan_context?: RunScanContext | null;
};

export type RunDetail = {
  run_id: string;
  created_at: string;
  input: RunInput;
  results: RunResult[];
};

export type CatalogChannel = {
  channel_id: string;
  channel_name: string;
  channel_url: string;
  metrics: {
    subscriber_count: number;
    min_views_last_n: number;
    avg_views_last_n: number;
    engagement_rate_last_n: number;
    days_since_last_upload: number;
  };
  enrichment: {
    country_inferred: string | null;
    country_confidence: "low" | "medium" | "high" | null;
    language_code: string | null;
    language_detected: string | null;
    language_confidence: "low" | "medium" | "high" | null;
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
};

export type CatalogChannelVideo = {
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
};

export type CatalogChannelDiscoveryEvent = {
  id: string;
  run_id: string | null;
  discovered_at: string;
  seed_region: string | null;
  seed_language: string | null;
  seed_keywords: string[];
  source: string;
};

export type CatalogChannelDetail = CatalogChannel & {
  channel_description: string | null;
  score: {
    final_score: number | null;
    breakdown: Record<string, unknown> | null;
  };
  provenance: {
    last_run_id: string | null;
    discovery_events: CatalogChannelDiscoveryEvent[];
  };
  videos: CatalogChannelVideo[];
};

export type CatalogChannelsResponse = {
  page: number;
  per_page: number;
  total: number;
  results: CatalogChannel[];
};

export type CatalogChannelFilters = {
  country?: string;
  language?: string;
  min_subscribers?: number;
  min_avg_views?: number;
  min_engagement_rate?: number;
  max_days_since_upload?: number;
  max_metrics_refresh_age_days?: number;
  max_content_refresh_age_days?: number;
  max_enrichment_age_days?: number;
  estimated_category?: string;
  estimated_type?: string;
  min_country_confidence?: "low" | "medium" | "high";
  min_language_confidence?: "low" | "medium" | "high";
  email_found?: boolean;
  sort?:
    | "score_final"
    | "subscribers"
    | "avg_views"
    | "engagement_rate"
    | "days_since_last_upload"
    | "last_refreshed";
  sort_dir?: "asc" | "desc";
  page?: number;
  per_page?: number;
};

export type CatalogSegmentFilters = Omit<CatalogChannelFilters, "page" | "per_page">;

export type SavedSegment = {
  id: string;
  name: string;
  filters: CatalogSegmentFilters;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
};

export type AdminJobType =
  | "discover"
  | "refresh_metrics"
  | "enrich"
  | "force_refresh"
  | "force_enrich";

export type AdminJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "dead_letter";

export type DiscoverySeedRequest = RunRequest & {
  name?: string;
  active?: boolean;
  priority?: number;
  max_attempts?: number;
};

export type AdminDiscoverySeed = {
  id: string;
  name: string | null;
  keywords: string[];
  exclude_keywords: string[];
  region: string;
  language: string;
  min_views: number | null;
  min_avg_views: number | null;
  min_engagement_rate: number | null;
  max_days_since_upload: number | null;
  min_subscribers: number | null;
  videos_to_analyze: number | null;
  max_channels: number | null;
  active: boolean;
  priority: number;
  estimated_quota_units: number;
  max_attempts: number;
  last_planned_at: string | null;
  last_dispatched_at: string | null;
  last_succeeded_at: string | null;
  last_run_id: string | null;
  last_yield_channels: number | null;
  last_new_channels: number | null;
  last_error: string | null;
  lifetime_jobs_planned: number;
  lifetime_jobs_succeeded: number;
  lifetime_channels_found: number;
  lifetime_new_channels_found: number;
  created_at: string;
  updated_at: string;
};

export type AdminQuota = {
  day: string;
  budget_units: number;
  reserve_units: number;
  reserved_units: number;
  used_units: number;
  available_units: number;
  reservable_units: number;
  used_breakdown: Record<string, number>;
  updated_at: string;
};

export type AdminJob = {
  id: string;
  type: AdminJobType;
  status: AdminJobStatus;
  priority: number;
  seed_id: string | null;
  dedupe_key: string | null;
  quota_day: string;
  estimated_quota_units: number;
  reserved_quota_units: number;
  attempts: number;
  max_attempts: number;
  payload: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  next_run_at: string;
  locked_by: string | null;
  locked_at: string | null;
  lock_expires_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  last_error: string | null;
  dead_lettered_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminBootstrapResponse = {
  day: string;
  type?: AdminJobType;
  created_count: number;
  skipped_count: number;
  duplicate_count: number;
  created: AdminJob[];
  skipped: Array<Record<string, unknown>>;
  duplicates: Array<Record<string, unknown>>;
  quota: AdminQuota;
};

export type AdminCoverageBucket = {
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

export type AdminCoverageSummary = {
  by_country: AdminCoverageBucket[];
  by_language: AdminCoverageBucket[];
  by_category: AdminCoverageBucket[];
};

export type AdminStaleChannel = {
  channel_id: string;
  channel_name: string;
  channel_url: string;
  subscriber_count: number;
  days_since_last_upload: number;
  country_inferred: string | null;
  country_confidence: "low" | "medium" | "high" | null;
  language_code: string | null;
  language_confidence: "low" | "medium" | "high" | null;
  estimated_category: string | null;
  estimated_type: string | null;
  last_metrics_refresh_at: string;
  last_enriched_at: string | null;
};

export type AdminStaleSummary = {
  refresh: AdminStaleChannel[];
  enrich: AdminStaleChannel[];
};

export type AdminWorkerHealth = {
  queue: {
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
      AdminJobType,
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
      type: AdminJobType;
      attempts: number;
      max_attempts: number;
      locked_by: string | null;
      locked_at: string | null;
      lock_expires_at: string | null;
      started_at: string | null;
      last_error: string | null;
      payload: Record<string, unknown> | null;
    }>;
  };
  automation: {
    auto_dispatch_enabled: boolean;
    auto_dispatch_interval_ms: number;
    auto_discovery_enabled: boolean;
    auto_discovery_interval_ms: number;
    auto_refresh_enabled: boolean;
    auto_refresh_interval_ms: number;
    auto_enrich_enabled: boolean;
    auto_enrich_interval_ms: number;
  };
};

export type AdminDispatchResponse = {
  worker_id: string;
  claimed_count: number;
  dispatched_count: number;
  requeued_count: number;
  failed_count: number;
  stopped: boolean;
  dispatched: AdminJob[];
  requeued: AdminJob[];
  failed: AdminJob[];
};

export type AdminStartDiscoveryResponse = {
  bootstrap: AdminBootstrapResponse;
  dispatch: AdminDispatchResponse;
  quota: AdminQuota;
};

export type AdminMaintenanceBootstrapRequest = {
  day?: string;
  stale_after_days?: number;
  limit?: number;
  ignore_quota?: boolean;
  channel_ids?: string[];
  videos_to_analyze?: number;
  missing_only?: boolean;
};

export type EnrichJobStatusCounts = {
  total: number;
  success: number;
  failed: number;
  pending: number;
  other: number;
  missing: number;
};

export type EnrichJobState = {
  status?: "idle" | "queued" | "running" | "done" | "failed" | "error";
  lastError?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  forced?: boolean;
  concurrency?: number;
  total?: number;
  enriched?: number;
  skipped?: number;
  failed?: number;
};

export type EnrichJobResponse = {
  status?: EnrichJobStatusCounts;
  job?: EnrichJobState;
};

export type EnrichRunResponse = {
  accepted?: boolean;
  reason?: string;
  job?: EnrichJobState;
};

export type ApiError = {
  status: number;
  code?: string;
  error?: string;
  message?: string;
};

export function isQuotaExceeded(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const info = err as Partial<ApiError>;
  return (
    info.status === 429 ||
    info.code === "YOUTUBE_QUOTA_EXCEEDED" ||
    info.error === "YOUTUBE_QUOTA_EXCEEDED"
  );
}

const IS_DEV = process.env.NODE_ENV !== "production";
const API_PROXY_BASE = "/backend";

function joinUrl(base: string, path: string) {
  if (!base) {
    return `/${path.replace(/^\//, "")}`;
  }
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

export function getApiBase(): string {
  return API_PROXY_BASE;
}

export function getApiBaseUrl(): string {
  return getApiBase();
}

async function apiFetch<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const hasBody = init?.body !== undefined && init?.body !== null;
  const headers = new Headers(init?.headers ?? {});

  if (method === "POST" || method === "PUT" || method === "PATCH") {
    if (hasBody && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
  }

  const url = joinUrl(getApiBase(), path);
  if (IS_DEV) {
    console.debug("[apiFetch] request", { url, method });
  }

  const res = await fetch(url, {
    ...init,
    headers,
  });
  if (IS_DEV) {
    console.debug("[apiFetch] response", { url, method, status: res.status });
  }

  const text = await res.text();
  const contentType = res.headers.get("content-type") ?? "";
  let data: unknown = null;

  if (text) {
    if (contentType.includes("application/json")) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    } else {
      data = text;
    }
  }

  if (!res.ok) {
    const payload =
      typeof data === "object" && data !== null
        ? (data as Record<string, unknown>)
        : null;
    const error = typeof payload?.error === "string" ? payload.error : undefined;
    const code = typeof payload?.code === "string" ? payload.code : undefined;
    const message =
      typeof payload?.message === "string"
        ? payload.message
        : typeof error === "string"
          ? error
          : typeof data === "string"
            ? data
            : undefined;
    const err = new Error(message || error || `Request failed (${res.status})`);
    (err as unknown as ApiError).status = res.status;
    (err as unknown as ApiError).code = code;
    (err as unknown as ApiError).error = error;
    (err as unknown as ApiError).message = err.message;
    throw err;
  }

  return data as T;
}

export async function createRun(input: RunRequest): Promise<RunSummary> {
  return apiFetch<RunSummary>("/runs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getRun(
  runId: string,
  params?: Record<string, string>
): Promise<RunDetail> {
  const qs = params ? new URLSearchParams(params).toString() : "";
  const suffix = qs ? `?${qs}` : "";
  return apiFetch<RunDetail>(`/runs/${runId}${suffix}`);
}

export async function listRuns(limit = 20): Promise<RunSummary[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  return apiFetch<RunSummary[]>(`/runs?${params.toString()}`);
}

export async function listChannels(
  filters: CatalogChannelFilters = {}
): Promise<CatalogChannelsResponse> {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }

  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<CatalogChannelsResponse>(`/channels${suffix}`);
}

export async function getChannel(channelId: string) {
  return apiFetch<CatalogChannelDetail>(`/channels/${channelId}`);
}

export async function listSegments() {
  return apiFetch<SavedSegment[]>("/segments");
}

export async function createSegment(input: {
  name: string;
  filters: CatalogSegmentFilters;
}) {
  return apiFetch<SavedSegment>("/segments", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function updateSegment(
  segmentId: string,
  input: {
    name?: string;
    filters?: CatalogSegmentFilters;
  }
) {
  return apiFetch<SavedSegment>(`/segments/${segmentId}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export async function useSegment(segmentId: string) {
  return apiFetch<SavedSegment>(`/segments/${segmentId}/use`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export async function deleteSegment(segmentId: string) {
  await apiFetch(`/segments/${segmentId}`, {
    method: "DELETE"
  });
}

export async function listAdminSeeds(active?: boolean) {
  const suffix =
    typeof active === "boolean" ? `?active=${String(active)}` : "";
  const response = await apiFetch<{ results: AdminDiscoverySeed[] }>(
    `/admin/discovery/seeds${suffix}`
  );
  return response.results;
}

export async function createAdminSeed(input: DiscoverySeedRequest) {
  return apiFetch<AdminDiscoverySeed>("/admin/discovery/seeds", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateAdminSeed(
  seedId: string,
  patch: Partial<DiscoverySeedRequest>
) {
  return apiFetch<AdminDiscoverySeed>(`/admin/discovery/seeds/${seedId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function getAdminQuota(day?: string) {
  const suffix = day ? `?day=${encodeURIComponent(day)}` : "";
  return apiFetch<AdminQuota>(`/admin/quota${suffix}`);
}

export async function getAdminCoverage(filters?: {
  limit?: number;
  refresh_stale_after_days?: number;
  enrich_stale_after_days?: number;
}) {
  const params = new URLSearchParams();
  if (filters?.limit) params.set("limit", String(filters.limit));
  if (filters?.refresh_stale_after_days !== undefined) {
    params.set("refresh_stale_after_days", String(filters.refresh_stale_after_days));
  }
  if (filters?.enrich_stale_after_days !== undefined) {
    params.set("enrich_stale_after_days", String(filters.enrich_stale_after_days));
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<AdminCoverageSummary>(`/admin/catalog/coverage${suffix}`);
}

export async function getAdminStale(filters?: {
  limit?: number;
  refresh_stale_after_days?: number;
  enrich_stale_after_days?: number;
}) {
  const params = new URLSearchParams();
  if (filters?.limit) params.set("limit", String(filters.limit));
  if (filters?.refresh_stale_after_days !== undefined) {
    params.set("refresh_stale_after_days", String(filters.refresh_stale_after_days));
  }
  if (filters?.enrich_stale_after_days !== undefined) {
    params.set("enrich_stale_after_days", String(filters.enrich_stale_after_days));
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<AdminStaleSummary>(`/admin/catalog/stale${suffix}`);
}

export async function getAdminWorkerHealth(filters?: {
  stuck_after_minutes?: number;
  stuck_limit?: number;
}) {
  const params = new URLSearchParams();
  if (filters?.stuck_after_minutes !== undefined) {
    params.set("stuck_after_minutes", String(filters.stuck_after_minutes));
  }
  if (filters?.stuck_limit !== undefined) {
    params.set("stuck_limit", String(filters.stuck_limit));
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<AdminWorkerHealth>(`/admin/workers/health${suffix}`);
}

export async function listAdminJobs(filters?: {
  status?: AdminJobStatus;
  type?: AdminJobType;
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.type) params.set("type", filters.type);
  if (filters?.limit) params.set("limit", String(filters.limit));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await apiFetch<{ results: AdminJob[] }>(`/admin/jobs${suffix}`);
  return response.results;
}

export async function bootstrapAdminRefresh(
  input: AdminMaintenanceBootstrapRequest
) {
  return apiFetch<AdminBootstrapResponse>("/admin/refresh/bootstrap", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function bootstrapAdminEnrich(
  input: AdminMaintenanceBootstrapRequest
) {
  return apiFetch<AdminBootstrapResponse>("/admin/enrich/bootstrap", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function forceAdminRefresh(input: AdminMaintenanceBootstrapRequest) {
  return apiFetch<AdminBootstrapResponse>("/admin/force-refresh", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function forceAdminEnrich(input: AdminMaintenanceBootstrapRequest) {
  return apiFetch<AdminBootstrapResponse>("/admin/force-enrich", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function dispatchAdminJobs(input?: {
  limit?: number;
  type?: AdminJobType;
  worker_id?: string;
  lock_ttl_ms?: number;
  stop_on_error?: boolean;
}) {
  return apiFetch<AdminDispatchResponse>("/admin/jobs/dispatch", {
    method: "POST",
    body: JSON.stringify(input ?? {}),
  });
}

export async function startAdminDiscovery(input?: {
  day?: string;
  seed_ids?: string[];
  limit?: number;
  ignore_quota?: boolean;
  dispatch_limit?: number;
  worker_id?: string;
  lock_ttl_ms?: number;
  stop_on_error?: boolean;
}) {
  return apiFetch<AdminStartDiscoveryResponse>("/admin/discovery/start", {
    method: "POST",
    body: JSON.stringify(input ?? {}),
  });
}

export type ApiHealthResponse = {
  ok?: boolean;
  serverId?: string;
};

export async function getApiHealth(): Promise<ApiHealthResponse> {
  return apiFetch<ApiHealthResponse>("/api/health");
}

export async function enrichRun(
  runId: string,
  opts?: { force?: boolean }
): Promise<EnrichRunResponse> {
  const qs = opts?.force !== undefined ? `force=${String(opts.force)}` : "";
  const suffix = qs ? `?${qs}` : "";
  const path = `/runs/${runId}/enrich${suffix}`;
  const url = joinUrl(getApiBase(), path);
  const method = "POST";

  if (IS_DEV) {
    console.debug("[enrichRun] request", { url, method });
  }

  const res = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  if (IS_DEV) {
    console.debug("[enrichRun] response", {
      url,
      method,
      status: res.status,
    });
  }

  const text = await res.text();
  const contentType = res.headers.get("content-type") ?? "";
  let data: unknown = null;

  if (text) {
    if (contentType.includes("application/json")) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    } else {
      data = text;
    }
  }

  if (!res.ok) {
    const payload =
      typeof data === "object" && data !== null
        ? (data as Record<string, unknown>)
        : null;
    const error = typeof payload?.error === "string" ? payload.error : undefined;
    const code = typeof payload?.code === "string" ? payload.code : undefined;
    const message =
      typeof payload?.message === "string"
        ? payload.message
        : typeof error === "string"
          ? error
          : typeof data === "string"
            ? data
            : undefined;

    const err = new Error(message || error || `Request failed (${res.status})`);
    (err as unknown as ApiError).status = res.status;
    (err as unknown as ApiError).code = code;
    (err as unknown as ApiError).error = error;
    (err as unknown as ApiError).message = err.message;
    throw err;
  }

  return (data ?? {}) as EnrichRunResponse;
}

export async function getEnrichJob(
  runId: string,
  params?: Record<string, string>
): Promise<EnrichJobResponse> {
  const qs = params ? new URLSearchParams(params).toString() : "";
  const suffix = qs ? `?${qs}` : "";
  return apiFetch<EnrichJobResponse>(`/runs/${runId}/enrich/job${suffix}`);
}

export function exportCsvUrl(
  runId: string,
  includeEnrichmentOrOptions: boolean | { include?: string } = true
) {
  const params = new URLSearchParams({ format: "csv" });
  const include =
    typeof includeEnrichmentOrOptions === "boolean"
      ? includeEnrichmentOrOptions
        ? "enrichment"
        : undefined
      : includeEnrichmentOrOptions.include;
  if (include) {
    params.set("include", include);
  }
  return `${getApiBase()}/runs/${runId}/export?${params.toString()}`;
}
