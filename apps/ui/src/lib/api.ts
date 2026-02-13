export type RunRequest = {
  keywords: string[];
  region: string;
  language: string;
  max_channels: number;
  videos_to_analyze: number;
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
  };
};

export type RunInput = {
  keywords: string[];
  region: string;
  language: string;
  max_channels?: number;
  videos_to_analyze?: number;
};

export type RunEnrichmentPayload = {
  nicheLabels: string[] | null;
  languageDetected: string | null;
  fitSummary: string | null;
  brandSafetyNotes: string | null;
  redFlags: string[] | null;
  sponsorship:
    | {
        ratio?: number | null;
        sponsoredCount?: number | null;
        confidence?: string | null;
        evidence?: string[] | null;
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
};

export type RunDetail = {
  run_id: string;
  created_at: string;
  input: RunInput;
  results: RunResult[];
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

function joinUrl(base: string, path: string) {
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

export function getApiBase(): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!base) {
    throw new Error(
      "Missing NEXT_PUBLIC_API_BASE_URL. Set it in apps/ui/.env.local (e.g. http://192.168.1.150:3000)."
    );
  }
  return base;
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
    mode: "cors",
    credentials: "omit",
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
