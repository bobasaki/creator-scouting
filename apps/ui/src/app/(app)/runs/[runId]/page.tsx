"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  enrichRun,
  exportCsvUrl,
  getApiBase,
  getEnrichJob,
  getRun,
  type ApiError,
  type EnrichJobStatusCounts,
  type EnrichJobResponse,
  type RunDetail,
  type RunResult,
} from "@/lib/api";
import { ApiErrorBanner } from "@/components/feedback/ApiErrorBanner";
import { InlineStatus } from "@/components/feedback/InlineStatus";
import { RunActions } from "@/components/runs/RunActions";
import { RunJobStatus } from "@/components/runs/RunJobStatus";
import {
  RunResultsTable,
  type RunResultsSortDir,
  type RunResultsSortKey,
} from "@/components/runs/RunResultsTable";
import {
  RunResultsFilters,
  type RunResultsFiltersState,
} from "@/components/runs/RunResultsFilters";
import { RunResultsSkeleton } from "@/components/runs/RunResultsSkeleton";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { RUNS_UI_ENABLED } from "@/lib/features";
import styles from "./RunDetailsPage.module.css";

const formatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function normalizeCounts(
  counts?: EnrichJobStatusCounts | null
): EnrichJobStatusCounts | null {
  if (!counts) return null;
  return {
    total: Number(counts.total) || 0,
    success: Number(counts.success) || 0,
    failed: Number(counts.failed) || 0,
    pending: Number(counts.pending) || 0,
    other: Number(counts.other) || 0,
    missing: Number(counts.missing) || 0,
  };
}

export default function RunDetailsPage() {
  const params = useParams<{ runId: string }>();
  const runId = useMemo(() => {
    const raw = params?.runId;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params]);

  const [run, setRun] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<unknown>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [jobCounts, setJobCounts] = useState<EnrichJobStatusCounts | null>(null);
  const [jobError, setJobError] = useState<unknown>(null);
  const [jobMeta, setJobMeta] = useState<EnrichJobResponse["job"] | null>(null);
  const [polling, setPolling] = useState(false);
  const pollRef = useRef<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [forceEnrich, setForceEnrich] = useState(true);
  const [enrichActionError, setEnrichActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const [filters, setFilters] = useState<RunResultsFiltersState>({
    hasBrandAds: "all",
    minConfidence: "any",
    minSponsorRatio: 0,
  });
  const [sortKey, setSortKey] = useState<RunResultsSortKey>("final");
  const [sortDir, setSortDir] = useState<RunResultsSortDir>("desc");
  const apiBase = getApiBase();

  async function loadRun(currentRunId: string) {
    setLoading(true);
    setPageError(null);
    try {
      const data = await getRun(currentRunId, { include: "enrichment" });
      setRun(data);
    } catch (err) {
      setPageError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!RUNS_UI_ENABLED || !runId) return;
    loadRun(runId);
  }, [runId]);

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
      }
    };
  }, []);

  function stopPolling() {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setPolling(false);
  }

  async function pollEnrichStatus(currentRunId: string) {
    try {
      const data: EnrichJobResponse = await getEnrichJob(currentRunId, {
        include: "status",
      });
      const counts = normalizeCounts(data.status);
      const rawStatus = data.job?.status;
      const status = typeof rawStatus === "string" ? rawStatus : "unknown";
      setJobStatus(status);
      setJobCounts(counts);
      setJobMeta(data.job ?? null);

      if (status === "done") {
        stopPolling();
        await loadRun(currentRunId);
      } else if (status === "failed" || status === "error") {
        stopPolling();
        if (data.job?.lastError) {
          setJobError(new Error(data.job.lastError));
        } else {
          setJobError(new Error("Enrichment failed"));
        }
      } else if (status !== "running") {
        stopPolling();
      }
    } catch (err) {
      setJobError(err);
      stopPolling();
    }
  }

  function startPolling(currentRunId: string) {
    stopPolling();
    setPolling(true);
    pollEnrichStatus(currentRunId);
    pollRef.current = window.setInterval(() => {
      pollEnrichStatus(currentRunId);
    }, 1500);
  }

  function isAlreadyRunningError(err: unknown): boolean {
    if (!err || typeof err !== "object") return false;
    const info = err as Partial<ApiError>;
    return (
      info.code === "ENRICH_ALREADY_RUNNING" ||
      info.error === "already_running" ||
      (typeof info.message === "string" &&
        info.message.toLowerCase().includes("already running"))
    );
  }

  function getWhyText(value: RunResult["why"]) {
    if (!value) return "";
    return Array.isArray(value) ? value.join(" - ") : String(value);
  }

  function getSponsorRatio(row: RunResult): number | null {
    if (typeof row.sponsorship_ratio === "number") return row.sponsorship_ratio;
    const ratio = row.enrichment?.payload?.sponsorship?.ratio;
    return typeof ratio === "number" ? ratio : null;
  }

  function getBrandAdsFlag(row: RunResult): boolean | null {
    const flag = row.enrichment?.payload?.hasBrandAdsLastN;
    return typeof flag === "boolean" ? flag : null;
  }

  function getConfidenceRank(value: string | null | undefined) {
    switch (value) {
      case "low":
        return 1;
      case "medium":
        return 2;
      case "high":
        return 3;
      default:
        return 0;
    }
  }

  function getScoreValue(value: number | null | undefined) {
    if (value === null || value === undefined || Number.isNaN(value)) return null;
    return value;
  }

  function getBaseScore(row: RunResult) {
    return (
      getScoreValue(row.final_score_base) ??
      getScoreValue(row.finalScoreBase) ??
      getScoreValue(row.score_breakdown?.base.total)
    );
  }

  function getDeltaScore(row: RunResult) {
    return (
      getScoreValue(row.final_score_delta) ??
      getScoreValue(row.finalScoreDelta) ??
      getScoreValue(row.score_breakdown?.enrichment.total)
    );
  }

  function getFinalScore(row: RunResult) {
    return (
      getScoreValue(row.final_score_final) ??
      getScoreValue(row.finalScoreFinal) ??
      getScoreValue(row.finalScore)
    );
  }

  function handleSortChange(nextKey: RunResultsSortKey) {
    if (nextKey === sortKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    const numericKeys: RunResultsSortKey[] = [
      "subs",
      "avgViews",
      "days",
      "base",
      "delta",
      "final",
      "sponsorRatio",
    ];
    setSortKey(nextKey);
    setSortDir(numericKeys.includes(nextKey) ? "desc" : "asc");
  }

  async function handleExport() {
    if (!runId) return;
    if (exporting) return;
    setExporting(true);
    try {
      window.open(
        exportCsvUrl(runId, { include: "enrichment" }),
        "_blank",
        "noopener,noreferrer"
      );
      toast({
        title: "Export started",
        description: "CSV export opened in a new tab.",
        variant: "info",
      });
    } catch (err) {
      toast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Unable to export.",
        variant: "error",
      });
    } finally {
      window.setTimeout(() => setExporting(false), 800);
    }
  }

  async function handleEnrich() {
    if (!runId) {
      setEnrichActionError("Run ID is missing.");
      return;
    }
    setEnrichActionError(null);
    setJobError(null);
    setJobStatus("starting");
    setJobCounts(null);
    stopPolling();

    try {
      const response = await enrichRun(runId, { force: forceEnrich });
      setJobMeta(response.job ?? null);
      const alreadyRunning =
        response.reason === "already_running" ||
        response.accepted === false ||
        response.job?.status === "running";

      if (alreadyRunning) {
        toast({
          title: "Enrichment already running",
          description: "Polling existing job status.",
          variant: "info",
        });
      } else {
        toast({
          title: "Enrichment started",
          description: forceEnrich ? "Forced re-run started." : "Job started.",
          variant: "info",
        });
      }

      startPolling(runId);
    } catch (err) {
      if (isAlreadyRunningError(err)) {
        toast({
          title: "Enrichment already running",
          description: "Polling existing job status.",
          variant: "info",
        });
        startPolling(runId);
      } else {
        const message =
          err instanceof Error ? err.message : "Failed to start enrich.";
        setEnrichActionError(message);
        setJobError(err);
        setJobStatus(null);
        toast({
          title: "Enrichment failed",
          description: message,
          variant: "error",
        });
      }
    }
  }

  async function handleCopyRunId() {
    if (!runId) return;
    try {
      await navigator.clipboard.writeText(runId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  function formatDate(value?: string | null) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return formatter.format(date);
  }

  function metaBadge(label: string, value?: string | number | null) {
    if (value === null || value === undefined || value === "") return null;
    return (
      <Badge variant="neutral" className={styles.metaBadge}>
        {label}: {value}
      </Badge>
    );
  }

  const results = run?.results ?? [];
  const filteredResults = useMemo(() => {
    return results.filter((row) => {
      if (filters.hasBrandAds !== "all") {
        const flag = getBrandAdsFlag(row);
        if (filters.hasBrandAds === "true" && flag !== true) return false;
        if (filters.hasBrandAds === "false" && flag !== false) return false;
      }

      if (filters.minConfidence !== "any") {
        const confidence = row.enrichment?.payload?.brandAdsConfidence ?? null;
        const rank = getConfidenceRank(confidence);
        const minRank = getConfidenceRank(filters.minConfidence);
        if (rank < minRank) return false;
      }

      if (filters.minSponsorRatio > 0) {
        const ratio = getSponsorRatio(row);
        if (ratio === null || ratio < filters.minSponsorRatio) return false;
      }

      return true;
    });
  }, [results, filters]);

  const sortedResults = useMemo(() => {
    const decorated = filteredResults.map((row, index) => ({ row, index }));
    decorated.sort((a, b) => {
      const aRow = a.row;
      const bRow = b.row;
      let aVal: string | number | boolean | null = null;
      let bVal: string | number | boolean | null = null;

      switch (sortKey) {
        case "channel":
          aVal = aRow.metrics.channelName ?? "";
          bVal = bRow.metrics.channelName ?? "";
          break;
        case "subs":
          aVal = aRow.metrics.subscriberCount ?? null;
          bVal = bRow.metrics.subscriberCount ?? null;
          break;
        case "avgViews":
          aVal = aRow.metrics.avgViewsLastN ?? null;
          bVal = bRow.metrics.avgViewsLastN ?? null;
          break;
        case "days":
          aVal = aRow.metrics.daysSinceLastUpload ?? null;
          bVal = bRow.metrics.daysSinceLastUpload ?? null;
          break;
        case "base":
          aVal = getBaseScore(aRow);
          bVal = getBaseScore(bRow);
          break;
        case "delta":
          aVal = getDeltaScore(aRow);
          bVal = getDeltaScore(bRow);
          break;
        case "final":
          aVal = getFinalScore(aRow);
          bVal = getFinalScore(bRow);
          break;
        case "brandAds":
          aVal = getBrandAdsFlag(aRow);
          bVal = getBrandAdsFlag(bRow);
          break;
        case "sponsorRatio":
          aVal = getSponsorRatio(aRow);
          bVal = getSponsorRatio(bRow);
          break;
        case "why":
          aVal = getWhyText(aRow.why);
          bVal = getWhyText(bRow.why);
          break;
        default:
          aVal = getFinalScore(aRow);
          bVal = getFinalScore(bRow);
      }

      if (aVal === null || aVal === undefined) {
        if (bVal === null || bVal === undefined) return a.index - b.index;
        return 1;
      }
      if (bVal === null || bVal === undefined) return -1;

      if (typeof aVal === "string" || typeof bVal === "string") {
        const aStr = String(aVal);
        const bStr = String(bVal);
        if (aStr === bStr) return a.index - b.index;
        return sortDir === "asc"
          ? aStr.localeCompare(bStr)
          : bStr.localeCompare(aStr);
      }

      if (aVal === bVal) return a.index - b.index;
      return sortDir === "asc"
        ? Number(aVal) - Number(bVal)
        : Number(bVal) - Number(aVal);
    });
    return decorated.map((entry) => entry.row);
  }, [filteredResults, sortKey, sortDir]);
  const enrichState =
    jobStatus === "done"
      ? "done"
      : polling || jobStatus === "running" || jobStatus === "starting"
        ? "running"
        : "idle";
  const canEnrich = enrichState === "idle";

  const createdAt = formatDate(run?.created_at ?? null);
  const resultsCount = run?.results?.length ?? 0;

  const totalItems = jobMeta?.total ?? jobCounts?.total ?? null;
  const completedItems =
    jobMeta?.enriched ??
    (jobCounts ? jobCounts.success + jobCounts.failed : null);
  const progressRatio =
    totalItems && completedItems !== null && totalItems > 0
      ? Math.min(1, completedItems / totalItems)
      : null;

  if (!RUNS_UI_ENABLED) {
    return (
      <Container className={styles.page}>
        <div className={styles.header}>
          <h1>Internal runs</h1>
          <p>
            Run detail pages are restricted to internal debugging and ingestion workflows.
          </p>
        </div>
        <Card>
          <CardHeader>Catalog-first workflow</CardHeader>
          <CardContent>
            Use <Link href="/channels">/channels</Link> for normal scouting. Re-enable the
            runs UI only for internal use with `NEXT_PUBLIC_ENABLE_RUNS_UI=true`.
          </CardContent>
        </Card>
      </Container>
    );
  }

  return (
    <Container className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.runIdRow}>
            <h1 className={styles.runTitle}>Run</h1>
            <code className={styles.runCode}>{runId}</code>
            <Button type="button" variant="ghost" size="sm" onClick={handleCopyRunId}>
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <div className={styles.createdAt}>Created: {createdAt}</div>
          <div className={styles.metaRow}>
            {metaBadge("Region", run?.input?.region)}
            {metaBadge("Language", run?.input?.language)}
            {metaBadge(
              "Keyword",
              run?.input?.keywords && run.input.keywords.length > 0
                ? run.input.keywords.join(", ")
                : "Any"
            )}
            {metaBadge(
              "Exclude",
              run?.input?.exclude_keywords && run.input.exclude_keywords.length > 0
                ? run.input.exclude_keywords.join(", ")
                : null
            )}
            {metaBadge("Results", resultsCount)}
            {metaBadge("Min views", run?.input?.min_views)}
            {metaBadge("Max days", run?.input?.max_days_since_upload)}
            {metaBadge("Min avg views", run?.input?.min_avg_views)}
            {metaBadge(
              "Min engagement",
              run?.input?.min_engagement_rate != null
                ? `${run?.input?.min_engagement_rate}%`
                : null
            )}
          </div>
        </div>
        <div className={styles.actions}>
          <RunActions
            onExport={handleExport}
            onEnrich={handleEnrich}
            enrichState={enrichState}
            canEnrich={canEnrich}
            enrichErrorMessage={enrichActionError}
            exporting={exporting}
            statusSlot={<RunJobStatus status={jobStatus} showCounts={false} />}
          />
          <div style={{ fontSize: "0.75rem", color: "#475569" }}>
            Connected to {apiBase}
          </div>
          <label className={styles.forceToggle}>
            <input
              type="checkbox"
              checked={forceEnrich}
              onChange={(e) => setForceEnrich(e.target.checked)}
              className={styles.checkbox}
            />
            Force enrich (re-run)
          </label>
        </div>
      </div>
      {pageError ? (
        <ApiErrorBanner error={pageError} onClear={() => setPageError(null)} />
      ) : null}
      <Card>
        <CardHeader>Enrichment status</CardHeader>
        <CardContent>
          <div className={styles.jobStatusRow}>
            <RunJobStatus status={jobStatus} showCounts={false} />
            <span className={styles.jobMeta}>
              Started: {formatDate(jobMeta?.startedAt)}
            </span>
          </div>
          {progressRatio !== null ? (
            <div className={styles.progress}>
              <div className={styles.jobMeta}>
                Progress: {completedItems ?? 0}/{totalItems}
              </div>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${progressRatio * 100}%` }}
                />
              </div>
            </div>
          ) : null}
          {jobCounts ? (
            <div className={styles.jobCounts}>
              {(["total", "success", "failed", "pending"] as const).map((key) => (
                <div key={key}>
                  {key}: {jobCounts[key] ?? 0}
                </div>
              ))}
            </div>
          ) : null}
          {jobMeta?.lastError ? (
            <div className={styles.jobError}>{jobMeta.lastError}</div>
          ) : null}
        </CardContent>
      </Card>
      {polling ? <InlineStatus label="Enrichment running..." /> : null}
      {jobError ? (
        <ApiErrorBanner error={jobError} onClear={() => setJobError(null)} />
      ) : null}
      {loading ? <InlineStatus label="Loading run..." /> : null}
      {loading ? (
        <Card>
          <CardHeader>Results</CardHeader>
          <CardContent>
            <RunResultsSkeleton />
          </CardContent>
        </Card>
      ) : null}
      {!loading && !pageError ? (
        <Card>
          <CardHeader>Results</CardHeader>
          <CardContent>
            <RunResultsFilters value={filters} onChange={setFilters} />
            <RunResultsTable
              results={sortedResults}
              sortKey={sortKey}
              sortDir={sortDir}
              onSortChange={handleSortChange}
            />
          </CardContent>
        </Card>
      ) : null}
    </Container>
  );
}
