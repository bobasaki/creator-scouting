"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  createRun,
  getApiBaseUrl,
  getApiHealth,
  listRuns,
  type ApiError,
  type RunRequest,
  type RunSummary,
} from "@/lib/api";
import { InlineStatus } from "@/components/feedback/InlineStatus";
import { RunForm } from "@/components/runs/RunForm";
import { RecentRuns } from "@/components/runs/RecentRuns";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { useToast } from "@/components/ui/Toast";
import { RUNS_UI_ENABLED } from "@/lib/features";
import styles from "./RunsPage.module.css";

export default function RunsPage() {
  const router = useRouter();
  const [keywords, setKeywords] = useState<string[]>([]);
  const [excludeKeywords, setExcludeKeywords] = useState<string[]>([]);
  const [region, setRegion] = useState("");
  const [language, setLanguage] = useState("");
  const [maxChannels, setMaxChannels] = useState("");
  const [videosToAnalyze, setVideosToAnalyze] = useState("");
  const [minViews, setMinViews] = useState("");
  const [maxDaysSinceUpload, setMaxDaysSinceUpload] = useState("");
  const [minAvgViews, setMinAvgViews] = useState("");
  const [minEngagementRate, setMinEngagementRate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [recentRunId, setRecentRunId] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [apiHealthStatus, setApiHealthStatus] = useState<string | null>(null);
  const [apiHealthLoading, setApiHealthLoading] = useState(false);
  const { toast } = useToast();

  const apiBaseUrl = getApiBaseUrl();

  function normalizeRegion(value: string) {
    return value.trim().toUpperCase().slice(0, 2);
  }

  function normalizeLanguage(value: string) {
    return value.trim().replace(/_/g, "-").toLowerCase().slice(0, 5);
  }

  function parseOptionalInteger(value: string) {
    const trimmed = value.trim();
    if (trimmed.length === 0) return undefined;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return undefined;
    return Math.trunc(parsed);
  }

  function parseOptionalNumber(value: string) {
    const trimmed = value.trim();
    if (trimmed.length === 0) return undefined;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return undefined;
    return parsed;
  }

  function formatRunsError(err: unknown): string {
    if (err && typeof err === "object") {
      const info = err as Partial<ApiError>;
      if (typeof info.status === "number") {
        const message =
          typeof info.message === "string"
            ? info.message
            : typeof info.error === "string"
              ? info.error
              : "Request failed";
        return `${info.status}: ${message}`;
      }
    }
    return err instanceof Error ? err.message : "Failed to load runs";
  }

  async function loadRuns() {
    setRunsLoading(true);
    setRunsError(null);
    try {
      const data = await listRuns(20);
      setRuns(data);
    } catch (err) {
      setRunsError(formatRunsError(err));
    } finally {
      setRunsLoading(false);
    }
  }

  useEffect(() => {
    if (!RUNS_UI_ENABLED) return;
    loadRuns();
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setCreateError(null);

    const input: RunRequest = {
      keywords,
      exclude_keywords: excludeKeywords,
      region: normalizeRegion(region),
      language: normalizeLanguage(language),
      max_channels: parseOptionalInteger(maxChannels),
      videos_to_analyze: parseOptionalInteger(videosToAnalyze),
      min_views: parseOptionalInteger(minViews),
      max_days_since_upload: parseOptionalInteger(maxDaysSinceUpload),
      min_avg_views: parseOptionalInteger(minAvgViews),
      min_engagement_rate: parseOptionalNumber(minEngagementRate),
    };

    try {
      const data = await createRun(input);
      const runId = data?.run_id;
      if (runId) {
        setRecentRunId(runId);
        loadRuns();
        toast({
          title: "Run created",
          description: `Run ${runId} created successfully.`,
          variant: "success",
        });
        router.push(`/runs/${runId}`);
      } else {
        throw new Error("Run created but no run_id returned.");
      }
    } catch (err) {
      const message = formatRunsError(err);
      setCreateError(message);
      toast({
        title: "Create run failed",
        description: message,
        variant: "error",
      });
      loadRuns();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTestApi() {
    setApiHealthLoading(true);
    setApiHealthStatus(null);
    try {
      const data = await getApiHealth();
      const ok = data?.ok === true;
      const serverId =
        typeof data?.serverId === "string" ? data.serverId : null;
      if (ok) {
        setApiHealthStatus(serverId ? `ok (serverId: ${serverId})` : "ok");
      } else {
        setApiHealthStatus(
          serverId
            ? `unexpected response (serverId: ${serverId})`
            : "unexpected response"
        );
      }
    } catch (err) {
      const info = err && typeof err === "object" ? (err as Partial<ApiError>) : null;
      if (info && typeof info.status === "number") {
        const code = typeof info.code === "string" ? ` (${info.code})` : "";
        const message =
          typeof info.message === "string"
            ? info.message
            : typeof info.error === "string"
              ? info.error
              : "API health check failed";
        setApiHealthStatus(`${info.status}: ${message}${code}`);
      } else {
        setApiHealthStatus(
          err instanceof Error ? err.message : "API health check failed"
        );
      }
    } finally {
      setApiHealthLoading(false);
    }
  }

  if (!RUNS_UI_ENABLED) {
    return (
      <Container className={styles.page}>
        <div className={styles.header}>
          <h1 className={styles.title}>Internal runs</h1>
          <p className={styles.subtitle}>
            The run-first UI is now restricted to internal debugging and admin workflows.
          </p>
        </div>
        <Card>
          <CardHeader>Catalog-first workflow</CardHeader>
          <CardContent>
            Use the channel catalog at <Link href="/channels">/channels</Link> for normal
            scouting. Re-enable the runs UI only for internal use with
            `NEXT_PUBLIC_ENABLE_RUNS_UI=true`.
          </CardContent>
        </Card>
      </Container>
    );
  }

  return (
    <Container className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Runs</h1>
        <p className={styles.subtitle}>
          Create a new scouting run or revisit recent results.
        </p>
      </div>
      <Card>
        <CardHeader>Create run</CardHeader>
        <CardContent>
          <RunForm
            keywords={keywords}
            excludeKeywords={excludeKeywords}
            region={region}
            language={language}
            maxChannels={maxChannels}
            videosToAnalyze={videosToAnalyze}
            minViews={minViews}
            maxDaysSinceUpload={maxDaysSinceUpload}
            minAvgViews={minAvgViews}
            minEngagementRate={minEngagementRate}
            submitting={submitting}
            error={createError}
            onKeywordsChange={setKeywords}
            onExcludeKeywordsChange={setExcludeKeywords}
            onRegionChange={(value) => setRegion(normalizeRegion(value))}
            onLanguageChange={(value) => setLanguage(normalizeLanguage(value))}
            onMaxChannelsChange={setMaxChannels}
            onVideosToAnalyzeChange={setVideosToAnalyze}
            onMinViewsChange={setMinViews}
            onMaxDaysSinceUploadChange={setMaxDaysSinceUpload}
            onMinAvgViewsChange={setMinAvgViews}
            onMinEngagementRateChange={setMinEngagementRate}
            onSubmit={handleSubmit}
          />
          {submitting ? <InlineStatus label="Creating run..." /> : null}
        </CardContent>
      </Card>
      {recentRunId ? (
        <div className={styles.recentNote}>
          Recent run:{" "}
          <Link className={styles.inlineLink} href={`/runs/${recentRunId}`}>
            {recentRunId}
          </Link>
        </div>
      ) : null}
      <Card className={styles.statusCard}>
        <CardContent>
          <div className={styles.statusRow}>
            <div>
              API proxy: <span className={styles.statusValue}>{apiBaseUrl}</span>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleTestApi}
              disabled={apiHealthLoading}
            >
              {apiHealthLoading ? "Testing..." : "Test API"}
            </Button>
            {apiHealthStatus ? (
              <div className={styles.statusValue}>{apiHealthStatus}</div>
            ) : null}
          </div>
        </CardContent>
      </Card>
      <RecentRuns
        runs={runs}
        loading={runsLoading}
        error={runsError}
        onRefresh={loadRuns}
      />
    </Container>
  );
}
