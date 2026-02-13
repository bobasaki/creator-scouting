"use client";

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
import styles from "./RunsPage.module.css";

export default function RunsPage() {
  const router = useRouter();
  const [keywords, setKeywords] = useState("");
  const [region, setRegion] = useState("DE");
  const [language, setLanguage] = useState("de");
  const [maxChannels, setMaxChannels] = useState(10);
  const [videosToAnalyze, setVideosToAnalyze] = useState(3);
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
    loadRuns();
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setCreateError(null);

    const input: RunRequest = {
      keywords: keywords
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      region,
      language,
      max_channels: Number(maxChannels),
      videos_to_analyze: Number(videosToAnalyze),
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
            region={region}
            language={language}
            maxChannels={maxChannels}
            videosToAnalyze={videosToAnalyze}
            submitting={submitting}
            error={createError}
            onKeywordsChange={setKeywords}
            onRegionChange={setRegion}
            onLanguageChange={setLanguage}
            onMaxChannelsChange={setMaxChannels}
            onVideosToAnalyzeChange={setVideosToAnalyze}
            onSubmit={handleSubmit}
          />
          {submitting ? <InlineStatus label="Creating run..." /> : null}
        </CardContent>
      </Card>
      {recentRunId ? (
        <div className={styles.recentNote}>
          Recent run:{" "}
          <a className={styles.inlineLink} href={`/runs/${recentRunId}`}>
            {recentRunId}
          </a>
        </div>
      ) : null}
      <Card className={styles.statusCard}>
        <CardContent>
          <div className={styles.statusRow}>
            <div>
              API status: <span className={styles.statusValue}>{apiBaseUrl}</span>
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
