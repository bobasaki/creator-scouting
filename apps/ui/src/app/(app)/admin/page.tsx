"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiErrorBanner } from "@/components/feedback/ApiErrorBanner";
import { InlineStatus } from "@/components/feedback/InlineStatus";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { COUNTRY_OPTIONS, LANGUAGE_OPTIONS } from "@/lib/runFormOptions";
import {
  bootstrapAdminEnrich,
  bootstrapAdminRefresh,
  createAdminSeed,
  dispatchAdminJobs,
  forceAdminEnrich,
  forceAdminRefresh,
  getAdminCoverage,
  getAdminQuota,
  getAdminStale,
  getAdminWorkerHealth,
  listAdminJobs,
  listAdminSeeds,
  startAdminDiscovery,
  updateAdminSeed,
  type AdminCoverageBucket,
  type AdminCoverageSummary,
  type AdminDiscoverySeed,
  type AdminJob,
  type AdminJobType,
  type AdminQuota,
  type AdminStaleChannel,
  type AdminStaleSummary,
  type AdminWorkerHealth
} from "@/lib/api";
import styles from "./AdminPage.module.css";

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function splitCsv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitChannelIds(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\s,]+/g)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function parseOptionalInteger(value: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.trunc(parsed);
}

function formatTimestamp(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(date);
}

function formatPayload(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatIntervalMs(value: number) {
  if (value >= 60 * 60 * 1000) {
    return `${Math.round(value / (60 * 60 * 1000))}h`;
  }
  if (value >= 60 * 1000) {
    return `${Math.round(value / (60 * 1000))}m`;
  }
  return `${value}ms`;
}

function renderCoverageRows(args: {
  rows: AdminCoverageBucket[];
  showConfidence?: boolean;
}) {
  const rows = args.rows;
  if (rows.length === 0) {
    return <div className={styles.empty}>No catalog coverage yet.</div>;
  }

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Bucket</th>
            <th className={styles.numeric}>Channels</th>
            <th className={styles.numeric}>Emails</th>
            <th className={styles.numeric}>Stale metrics</th>
            {args.showConfidence ? <th className={styles.numeric}>H / M / L</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key ?? row.label}>
              <td>{row.label}</td>
              <td className={styles.numeric}>{row.channel_count}</td>
              <td className={styles.numeric}>{row.email_count}</td>
              <td className={styles.numeric}>{row.stale_metrics_count}</td>
              {args.showConfidence ? (
                <td className={styles.numeric}>
                  {row.confidence_breakdown
                    ? `${row.confidence_breakdown.high} / ${row.confidence_breakdown.medium} / ${row.confidence_breakdown.low}`
                    : "-"}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderStaleRows(args: {
  title: string;
  rows: AdminStaleChannel[];
  actionLabel: string;
  action: (channelId: string) => void;
  busy: boolean;
}) {
  return (
    <Card>
      <CardHeader>{args.title}</CardHeader>
      <CardContent>
        {args.rows.length === 0 ? (
          <div className={styles.empty}>No channels in this backlog.</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Channel</th>
                  <th>Locale</th>
                  <th className={styles.numeric}>Subs</th>
                  <th className={styles.numeric}>Days</th>
                  <th>Freshness</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {args.rows.map((row) => (
                  <tr key={row.channel_id}>
                    <td>
                      <div className={styles.cellStack}>
                        <Link
                          href={`/channels/${row.channel_id}`}
                          className={styles.link}
                        >
                          {row.channel_name}
                        </Link>
                        <span className={styles.subtle}>{row.channel_id}</span>
                      </div>
                    </td>
                    <td>
                      {row.country_inferred ?? "-"}/{row.language_code ?? "-"}
                    </td>
                    <td className={styles.numeric}>{row.subscriber_count}</td>
                    <td className={styles.numeric}>{row.days_since_last_upload}</td>
                    <td>
                      <div className={styles.cellStack}>
                        <span>M {formatTimestamp(row.last_metrics_refresh_at)}</span>
                        <span className={styles.subtle}>
                          E {formatTimestamp(row.last_enriched_at)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={args.busy}
                        onClick={() => args.action(row.channel_id)}
                      >
                        {args.actionLabel}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminPage() {
  const [quotaDay, setQuotaDay] = useState(getTodayDate());
  const [discoveryDay, setDiscoveryDay] = useState(getTodayDate());
  const [discoveryDispatchLimit, setDiscoveryDispatchLimit] = useState("10");
  const [dispatchLimit, setDispatchLimit] = useState("10");
  const [dispatchType, setDispatchType] = useState<"" | AdminJobType>("");
  const [refreshStaleDays, setRefreshStaleDays] = useState("7");
  const [refreshLimit, setRefreshLimit] = useState("25");
  const [refreshVideosToAnalyze, setRefreshVideosToAnalyze] = useState("5");
  const [enrichStaleDays, setEnrichStaleDays] = useState("14");
  const [enrichLimit, setEnrichLimit] = useState("25");
  const [enrichVideosToAnalyze, setEnrichVideosToAnalyze] = useState("5");
  const [enrichMissingOnly, setEnrichMissingOnly] = useState(true);
  const [coverageLimit, setCoverageLimit] = useState("10");
  const [staleDashboardLimit] = useState("10");
  const [stuckAfterMinutes, setStuckAfterMinutes] = useState("30");
  const [targetedChannelIds, setTargetedChannelIds] = useState("");
  const [targetedVideosToAnalyze, setTargetedVideosToAnalyze] = useState("5");
  const [seedName, setSeedName] = useState("");
  const [seedKeywords, setSeedKeywords] = useState("");
  const [seedExcludeKeywords, setSeedExcludeKeywords] = useState("");
  const [seedRegion, setSeedRegion] = useState("DE");
  const [seedLanguage, setSeedLanguage] = useState("de");
  const [seedPriority, setSeedPriority] = useState("0");
  const [seedMaxAttempts, setSeedMaxAttempts] = useState("3");
  const [seedMaxChannels, setSeedMaxChannels] = useState("25");
  const [seedVideosToAnalyze, setSeedVideosToAnalyze] = useState("5");
  const [seedMinAvgViews, setSeedMinAvgViews] = useState("");
  const [seedMaxDaysSinceUpload, setSeedMaxDaysSinceUpload] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [quota, setQuota] = useState<AdminQuota | null>(null);
  const [coverage, setCoverage] = useState<AdminCoverageSummary | null>(null);
  const [stale, setStale] = useState<AdminStaleSummary | null>(null);
  const [workerHealth, setWorkerHealth] = useState<AdminWorkerHealth | null>(null);
  const [seeds, setSeeds] = useState<AdminDiscoverySeed[]>([]);
  const [jobs, setJobs] = useState<AdminJob[]>([]);
  const [lastActionLabel, setLastActionLabel] = useState<string | null>(null);
  const [lastActionResult, setLastActionResult] = useState<unknown>(null);

  async function loadDashboard(nextQuotaDay = quotaDay) {
    setLoading(true);
    setError(null);

    try {
      const [quotaResponse, coverageResponse, staleResponse, workerResponse, seedResponse, jobResponse] =
        await Promise.all([
          getAdminQuota(nextQuotaDay),
          getAdminCoverage({
            limit: parseOptionalInteger(coverageLimit),
            refresh_stale_after_days: parseOptionalInteger(refreshStaleDays),
            enrich_stale_after_days: parseOptionalInteger(enrichStaleDays)
          }),
          getAdminStale({
            limit: parseOptionalInteger(staleDashboardLimit),
            refresh_stale_after_days: parseOptionalInteger(refreshStaleDays),
            enrich_stale_after_days: parseOptionalInteger(enrichStaleDays)
          }),
          getAdminWorkerHealth({
            stuck_after_minutes: parseOptionalInteger(stuckAfterMinutes),
            stuck_limit: 10
          }),
          listAdminSeeds(),
          listAdminJobs({ limit: 25 })
        ]);

      setQuota(quotaResponse);
      setCoverage(coverageResponse);
      setStale(staleResponse);
      setWorkerHealth(workerResponse);
      setSeeds(seedResponse);
      setJobs(jobResponse);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  async function runAction(label: string, action: () => Promise<unknown>) {
    setBusyAction(label);
    setError(null);

    try {
      const result = await action();
      setLastActionLabel(label);
      setLastActionResult(result);
      await loadDashboard(quotaDay);
    } catch (err) {
      setError(err);
    } finally {
      setBusyAction(null);
    }
  }

  useEffect(() => {
    loadDashboard(quotaDay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleCreateSeed(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    runAction("Create seed", async () => {
      const seed = await createAdminSeed({
        name: seedName.trim() || undefined,
        keywords: splitCsv(seedKeywords),
        exclude_keywords: splitCsv(seedExcludeKeywords),
        region: seedRegion,
        language: seedLanguage,
        priority: parseOptionalInteger(seedPriority),
        max_attempts: parseOptionalInteger(seedMaxAttempts),
        max_channels: parseOptionalInteger(seedMaxChannels),
        videos_to_analyze: parseOptionalInteger(seedVideosToAnalyze),
        min_avg_views: parseOptionalInteger(seedMinAvgViews),
        max_days_since_upload: parseOptionalInteger(seedMaxDaysSinceUpload)
      });

      setSeedName("");
      setSeedKeywords("");
      setSeedExcludeKeywords("");
      setSeedPriority("0");
      setSeedMaxAttempts("3");
      setSeedMaxChannels("25");
      setSeedVideosToAnalyze("5");
      setSeedMinAvgViews("");
      setSeedMaxDaysSinceUpload("");

      return seed;
    });
  }

  function handleForceAction(kind: "refresh" | "enrich", channelIds: string[]) {
    const input = {
      day: quotaDay,
      channel_ids: channelIds,
      videos_to_analyze: parseOptionalInteger(targetedVideosToAnalyze)
    };

    return runAction(
      kind === "refresh" ? "Force refresh channels" : "Force enrich channels",
      () => (kind === "refresh" ? forceAdminRefresh(input) : forceAdminEnrich(input))
    );
  }

  function handleQueueLocaleBackfill() {
    return runAction("Queue locale confidence backfill", () =>
      bootstrapAdminEnrich({
        day: quotaDay,
        limit: parseOptionalInteger(enrichLimit),
        videos_to_analyze: parseOptionalInteger(enrichVideosToAnalyze),
        missing_only: true
      })
    );
  }

  const quotaUsagePercent = quota
    ? Math.min(100, Math.round((quota.used_units / Math.max(1, quota.budget_units)) * 100))
    : 0;
  const activeSeedCount = seeds.filter((seed) => seed.active).length;
  const lifetimeSeedSuccess = seeds.reduce(
    (sum, seed) => sum + seed.lifetime_jobs_succeeded,
    0
  );
  const lifetimeSeedPlanned = seeds.reduce(
    (sum, seed) => sum + seed.lifetime_jobs_planned,
    0
  );
  const lifetimeChannelsFound = seeds.reduce(
    (sum, seed) => sum + seed.lifetime_channels_found,
    0
  );
  const lifetimeNewChannelsFound = seeds.reduce(
    (sum, seed) => sum + seed.lifetime_new_channels_found,
    0
  );
  const selectedChannelIds = splitChannelIds(targetedChannelIds);

  return (
    <Container className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Admin</h1>
        <p className={styles.subtitle}>
          Operational controls for quota, coverage, stale channels, workers,
          discovery seeds, and targeted maintenance.
        </p>
      </div>

      {error ? <ApiErrorBanner error={error} onClear={() => setError(null)} /> : null}
      {loading ? <InlineStatus label="Loading admin dashboard..." /> : null}
      {busyAction ? <InlineStatus label={`${busyAction}...`} /> : null}

      <div className={styles.summaryGrid}>
        <Card>
          <CardHeader>Quota</CardHeader>
          <CardContent className={styles.cardStack}>
            <label className={styles.field}>
              <span className={styles.label}>Quota day</span>
              <input
                type="date"
                className={styles.input}
                value={quotaDay}
                onChange={(event) => setQuotaDay(event.target.value)}
              />
            </label>
            <Button
              type="button"
              variant="secondary"
              onClick={() => runAction("Refresh dashboard", () => loadDashboard(quotaDay))}
              disabled={Boolean(busyAction)}
            >
              Refresh dashboard
            </Button>
            <div className={styles.statGrid}>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Budget</span>
                <strong>{quota?.budget_units ?? "-"}</strong>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Used</span>
                <strong>{quota?.used_units ?? "-"}</strong>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Reserved</span>
                <strong>{quota?.reserved_units ?? "-"}</strong>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Reservable</span>
                <strong>{quota?.reservable_units ?? "-"}</strong>
              </div>
            </div>
            <div className={styles.progressTrack}>
              <div
                className={styles.progressFill}
                style={{ width: `${quotaUsagePercent}%` }}
              />
            </div>
            <div className={styles.meta}>
              {quota ? `Used ${quotaUsagePercent}% of daily budget` : "No quota data yet"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>Worker health</CardHeader>
          <CardContent className={styles.cardStack}>
            <label className={styles.field}>
              <span className={styles.label}>Stuck after minutes</span>
              <input
                className={styles.input}
                value={stuckAfterMinutes}
                onChange={(event) => setStuckAfterMinutes(event.target.value)}
                inputMode="numeric"
              />
            </label>
            <div className={styles.statGrid}>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Queued</span>
                <strong>{workerHealth?.queue.totals.queued ?? "-"}</strong>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Running</span>
                <strong>{workerHealth?.queue.totals.running ?? "-"}</strong>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Failed</span>
                <strong>{workerHealth?.queue.totals.failed ?? "-"}</strong>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Stuck</span>
                <strong>{workerHealth?.queue.totals.stuck_running ?? "-"}</strong>
              </div>
            </div>
            <div className={styles.meta}>
              Oldest queued {formatTimestamp(workerHealth?.queue.timing.oldest_queued_at)}
            </div>
            <div className={styles.meta}>
              Next run {formatTimestamp(workerHealth?.queue.timing.next_run_at)}
            </div>
            <div className={styles.meta}>
              Auto dispatch{" "}
              {workerHealth
                ? `${workerHealth.automation.auto_dispatch_enabled ? "on" : "off"} (${formatIntervalMs(workerHealth.automation.auto_dispatch_interval_ms)})`
                : "-"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>Seed performance</CardHeader>
          <CardContent className={styles.cardStack}>
            <div className={styles.statGrid}>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Active seeds</span>
                <strong>{activeSeedCount}</strong>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Jobs succeeded</span>
                <strong>{lifetimeSeedSuccess}</strong>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Channels found</span>
                <strong>{lifetimeChannelsFound}</strong>
              </div>
              <div className={styles.stat}>
                <span className={styles.statLabel}>New channels</span>
                <strong>{lifetimeNewChannelsFound}</strong>
              </div>
            </div>
            <div className={styles.meta}>
              Success rate{" "}
              {lifetimeSeedPlanned > 0
                ? `${Math.round((lifetimeSeedSuccess / lifetimeSeedPlanned) * 100)}%`
                : "-"}
            </div>
            <div className={styles.meta}>
              Auto discovery{" "}
              {workerHealth
                ? `${workerHealth.automation.auto_discovery_enabled ? "on" : "off"} (${formatIntervalMs(workerHealth.automation.auto_discovery_interval_ms)})`
                : "-"}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className={styles.summaryGrid}>
        <Card>
          <CardHeader>Daily discovery</CardHeader>
          <CardContent className={styles.cardStack}>
            <label className={styles.field}>
              <span className={styles.label}>Day</span>
              <input
                type="date"
                className={styles.input}
                value={discoveryDay}
                onChange={(event) => setDiscoveryDay(event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Dispatch limit</span>
              <input
                className={styles.input}
                value={discoveryDispatchLimit}
                onChange={(event) => setDiscoveryDispatchLimit(event.target.value)}
                inputMode="numeric"
              />
            </label>
            <Button
              type="button"
              onClick={() =>
                runAction("Start discovery", () =>
                  startAdminDiscovery({
                    day: discoveryDay,
                    dispatch_limit: parseOptionalInteger(discoveryDispatchLimit)
                  })
                )
              }
              disabled={Boolean(busyAction)}
            >
              Start daily discovery
            </Button>
            <div className={styles.meta}>
              Queues today&apos;s discovery jobs and dispatches them immediately.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>Dispatch queue</CardHeader>
          <CardContent className={styles.cardStack}>
            <label className={styles.field}>
              <span className={styles.label}>Job type</span>
              <select
                className={styles.select}
                value={dispatchType}
                onChange={(event) => setDispatchType(event.target.value as "" | AdminJobType)}
              >
                <option value="">All executable jobs</option>
                <option value="discover">Discover</option>
                <option value="refresh_metrics">Refresh metrics</option>
                <option value="enrich">Enrich</option>
                <option value="force_refresh">Force refresh</option>
                <option value="force_enrich">Force enrich</option>
              </select>
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Dispatch limit</span>
              <input
                className={styles.input}
                value={dispatchLimit}
                onChange={(event) => setDispatchLimit(event.target.value)}
                inputMode="numeric"
              />
            </label>
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                runAction("Dispatch jobs", () =>
                  dispatchAdminJobs({
                    limit: parseOptionalInteger(dispatchLimit),
                    type: dispatchType || undefined
                  })
                )
              }
              disabled={Boolean(busyAction)}
            >
              Dispatch queued jobs
            </Button>
            <div className={styles.meta}>
              Manual dispatch remains available even when auto-dispatch is enabled.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>Targeted force maintenance</CardHeader>
          <CardContent className={styles.cardStack}>
            <label className={styles.field}>
              <span className={styles.label}>Channel IDs</span>
              <textarea
                className={styles.textarea}
                value={targetedChannelIds}
                onChange={(event) => setTargetedChannelIds(event.target.value)}
                placeholder="UC123..., UC456..."
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Videos to analyze</span>
              <input
                className={styles.input}
                value={targetedVideosToAnalyze}
                onChange={(event) => setTargetedVideosToAnalyze(event.target.value)}
                inputMode="numeric"
              />
            </label>
            <div className={styles.actions}>
              <Button
                type="button"
                variant="secondary"
                disabled={Boolean(busyAction) || selectedChannelIds.length === 0}
                onClick={() => handleForceAction("refresh", selectedChannelIds)}
              >
                Force refresh
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={Boolean(busyAction) || selectedChannelIds.length === 0}
                onClick={() => handleForceAction("enrich", selectedChannelIds)}
              >
                Force enrich
              </Button>
            </div>
            <div className={styles.meta}>
              Parsed targets: {selectedChannelIds.length}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className={styles.summaryGrid}>
        <Card>
          <CardHeader>Coverage by country</CardHeader>
          <CardContent className={styles.cardStack}>
            <label className={styles.field}>
              <span className={styles.label}>Top buckets</span>
              <input
                className={styles.input}
                value={coverageLimit}
                onChange={(event) => setCoverageLimit(event.target.value)}
                inputMode="numeric"
              />
            </label>
            {renderCoverageRows({
              rows: coverage?.by_country ?? [],
              showConfidence: true
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>Coverage by language</CardHeader>
          <CardContent>
            {renderCoverageRows({
              rows: coverage?.by_language ?? [],
              showConfidence: true
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>Coverage by category</CardHeader>
          <CardContent>
            {renderCoverageRows({ rows: coverage?.by_category ?? [] })}
          </CardContent>
        </Card>
      </div>

      <div className={styles.summaryGrid}>
        {renderStaleRows({
          title: "Stale refresh backlog",
          rows: stale?.refresh ?? [],
          actionLabel: "Force refresh",
          action: (channelId) => handleForceAction("refresh", [channelId]),
          busy: Boolean(busyAction)
        })}
        {renderStaleRows({
          title: "Stale enrich backlog",
          rows: stale?.enrich ?? [],
          actionLabel: "Force enrich",
          action: (channelId) => handleForceAction("enrich", [channelId]),
          busy: Boolean(busyAction)
        })}
      </div>

      <div className={styles.summaryGrid}>
        <Card>
          <CardHeader>Queue refresh jobs</CardHeader>
          <CardContent className={styles.cardStack}>
            <label className={styles.field}>
              <span className={styles.label}>Stale after days</span>
              <input
                className={styles.input}
                value={refreshStaleDays}
                onChange={(event) => setRefreshStaleDays(event.target.value)}
                inputMode="numeric"
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Limit</span>
              <input
                className={styles.input}
                value={refreshLimit}
                onChange={(event) => setRefreshLimit(event.target.value)}
                inputMode="numeric"
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Videos to analyze</span>
              <input
                className={styles.input}
                value={refreshVideosToAnalyze}
                onChange={(event) => setRefreshVideosToAnalyze(event.target.value)}
                inputMode="numeric"
              />
            </label>
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                runAction("Queue refresh jobs", () =>
                  bootstrapAdminRefresh({
                    day: quotaDay,
                    stale_after_days: parseOptionalInteger(refreshStaleDays),
                    limit: parseOptionalInteger(refreshLimit),
                    videos_to_analyze: parseOptionalInteger(refreshVideosToAnalyze)
                  })
                )
              }
              disabled={Boolean(busyAction)}
            >
              Queue refresh backlog
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>Queue enrich jobs</CardHeader>
          <CardContent className={styles.cardStack}>
            <label className={styles.field}>
              <span className={styles.label}>Stale after days</span>
              <input
                className={styles.input}
                value={enrichStaleDays}
                onChange={(event) => setEnrichStaleDays(event.target.value)}
                inputMode="numeric"
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Limit</span>
              <input
                className={styles.input}
                value={enrichLimit}
                onChange={(event) => setEnrichLimit(event.target.value)}
                inputMode="numeric"
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Videos to analyze</span>
              <input
                className={styles.input}
                value={enrichVideosToAnalyze}
                onChange={(event) => setEnrichVideosToAnalyze(event.target.value)}
                inputMode="numeric"
              />
            </label>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={enrichMissingOnly}
                onChange={(event) => setEnrichMissingOnly(event.target.checked)}
              />
              <span>Only channels missing enrichment fields</span>
            </label>
            <div className={styles.actions}>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  runAction("Queue enrich jobs", () =>
                    bootstrapAdminEnrich({
                      day: quotaDay,
                      stale_after_days: parseOptionalInteger(enrichStaleDays),
                      limit: parseOptionalInteger(enrichLimit),
                      videos_to_analyze: parseOptionalInteger(enrichVideosToAnalyze),
                      missing_only: enrichMissingOnly
                    })
                  )
                }
                disabled={Boolean(busyAction)}
              >
                Queue enrich backlog
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={handleQueueLocaleBackfill}
                disabled={Boolean(busyAction)}
              >
                Queue locale backfill
              </Button>
            </div>
            <div className={styles.meta}>
              Missing-only enrich now includes missing country/language codes and confidence.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>Automation flags</CardHeader>
          <CardContent className={styles.cardStack}>
            <div className={styles.meta}>
              Auto refresh{" "}
              {workerHealth
                ? `${workerHealth.automation.auto_refresh_enabled ? "on" : "off"} (${formatIntervalMs(workerHealth.automation.auto_refresh_interval_ms)})`
                : "-"}
            </div>
            <div className={styles.meta}>
              Auto enrich{" "}
              {workerHealth
                ? `${workerHealth.automation.auto_enrich_enabled ? "on" : "off"} (${formatIntervalMs(workerHealth.automation.auto_enrich_interval_ms)})`
                : "-"}
            </div>
            <div className={styles.meta}>
              Recent stuck jobs {workerHealth?.queue.stuck_jobs.length ?? "-"}
            </div>
            <div className={styles.meta}>
              Refresh the dashboard after changing env flags or restarting the API.
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>Create discovery seed</CardHeader>
        <CardContent>
          <form className={styles.seedForm} onSubmit={handleCreateSeed}>
            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span className={styles.label}>Name</span>
                <input
                  className={styles.input}
                  value={seedName}
                  onChange={(event) => setSeedName(event.target.value)}
                  placeholder="Italian travel"
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Country</span>
                <select
                  className={styles.select}
                  value={seedRegion}
                  onChange={(event) => setSeedRegion(event.target.value)}
                >
                  {COUNTRY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Language</span>
                <select
                  className={styles.select}
                  value={seedLanguage}
                  onChange={(event) => setSeedLanguage(event.target.value)}
                >
                  {LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Keywords</span>
                <input
                  className={styles.input}
                  value={seedKeywords}
                  onChange={(event) => setSeedKeywords(event.target.value)}
                  placeholder="travel, vlog"
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Exclude keywords</span>
                <input
                  className={styles.input}
                  value={seedExcludeKeywords}
                  onChange={(event) => setSeedExcludeKeywords(event.target.value)}
                  placeholder="music"
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Priority</span>
                <input
                  className={styles.input}
                  value={seedPriority}
                  onChange={(event) => setSeedPriority(event.target.value)}
                  inputMode="numeric"
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Max attempts</span>
                <input
                  className={styles.input}
                  value={seedMaxAttempts}
                  onChange={(event) => setSeedMaxAttempts(event.target.value)}
                  inputMode="numeric"
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Max channels</span>
                <input
                  className={styles.input}
                  value={seedMaxChannels}
                  onChange={(event) => setSeedMaxChannels(event.target.value)}
                  inputMode="numeric"
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Videos to analyze</span>
                <input
                  className={styles.input}
                  value={seedVideosToAnalyze}
                  onChange={(event) => setSeedVideosToAnalyze(event.target.value)}
                  inputMode="numeric"
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Min avg views</span>
                <input
                  className={styles.input}
                  value={seedMinAvgViews}
                  onChange={(event) => setSeedMinAvgViews(event.target.value)}
                  inputMode="numeric"
                  placeholder="Optional"
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Max days since upload</span>
                <input
                  className={styles.input}
                  value={seedMaxDaysSinceUpload}
                  onChange={(event) => setSeedMaxDaysSinceUpload(event.target.value)}
                  inputMode="numeric"
                  placeholder="Optional"
                />
              </label>
            </div>

            <div className={styles.actions}>
              <Button type="submit" disabled={Boolean(busyAction)}>
                Create seed
              </Button>
              <div className={styles.meta}>
                Leave keywords blank for broad discovery via fallback topics.
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>Discovery seeds</CardHeader>
        <CardContent>
          {seeds.length === 0 ? (
            <div className={styles.empty}>No discovery seeds yet.</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Locale</th>
                    <th>Keywords</th>
                    <th className={styles.numeric}>Priority</th>
                    <th className={styles.numeric}>Quota est.</th>
                    <th>Performance</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {seeds.map((seed) => (
                    <tr key={seed.id}>
                      <td>
                        <div className={styles.cellStack}>
                          <strong>{seed.name ?? "Unnamed seed"}</strong>
                          <span className={styles.subtle}>{seed.id}</span>
                        </div>
                      </td>
                      <td>
                        {seed.region}/{seed.language}
                      </td>
                      <td>
                        <div className={styles.cellStack}>
                          <span>{seed.keywords.join(", ") || "General discovery"}</span>
                          <span className={styles.subtle}>
                            Exclude: {seed.exclude_keywords.join(", ") || "-"}
                          </span>
                        </div>
                      </td>
                      <td className={styles.numeric}>{seed.priority}</td>
                      <td className={styles.numeric}>{seed.estimated_quota_units}</td>
                      <td>
                        <div className={styles.cellStack}>
                          <span>
                            Jobs {seed.lifetime_jobs_succeeded}/{seed.lifetime_jobs_planned}
                          </span>
                          <span className={styles.subtle}>
                            Channels {seed.lifetime_channels_found} / new {seed.lifetime_new_channels_found}
                          </span>
                          <span className={styles.subtle}>
                            {seed.last_error
                              ? `Error: ${seed.last_error}`
                              : `Last success ${formatTimestamp(seed.last_succeeded_at)}`}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className={styles.inlineActions}>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              runAction("Run seed now", () =>
                                startAdminDiscovery({
                                  day: discoveryDay,
                                  seed_ids: [seed.id],
                                  dispatch_limit: parseOptionalInteger(discoveryDispatchLimit) ?? 1
                                })
                              )
                            }
                            disabled={Boolean(busyAction)}
                          >
                            Run today
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={seed.active ? "secondary" : "primary"}
                            onClick={() =>
                              runAction(seed.active ? "Pause seed" : "Activate seed", () =>
                                updateAdminSeed(seed.id, { active: !seed.active })
                              )
                            }
                            disabled={Boolean(busyAction)}
                          >
                            {seed.active ? "Pause" : "Activate"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>Recent jobs</CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <div className={styles.empty}>No jobs queued yet.</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Target</th>
                    <th className={styles.numeric}>Attempts</th>
                    <th className={styles.numeric}>Quota</th>
                    <th>Timing</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={job.id}>
                      <td>
                        <div className={styles.cellStack}>
                          <strong>{job.type}</strong>
                          <span className={styles.subtle}>{job.id}</span>
                        </div>
                      </td>
                      <td>{job.status}</td>
                      <td>
                        <div className={styles.cellStack}>
                          <span>
                            {typeof job.payload?.channel_id === "string"
                              ? job.payload.channel_id
                              : typeof job.seed_id === "string"
                                ? job.seed_id
                                : "-"}
                          </span>
                          <span className={styles.subtle}>{job.dedupe_key ?? "manual"}</span>
                        </div>
                      </td>
                      <td className={styles.numeric}>
                        {job.attempts}/{job.max_attempts}
                      </td>
                      <td className={styles.numeric}>{job.estimated_quota_units}</td>
                      <td>
                        <div className={styles.cellStack}>
                          <span>Next: {formatTimestamp(job.next_run_at)}</span>
                          <span className={styles.subtle}>
                            Started: {formatTimestamp(job.started_at)}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className={styles.cellStack}>
                          <span className={styles.subtle}>{job.last_error ?? "OK"}</span>
                          <span className={styles.subtle}>
                            {job.result ? formatPayload(job.result).slice(0, 120) : "-"}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>Stuck jobs</CardHeader>
        <CardContent>
          {workerHealth?.queue.stuck_jobs.length ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Lock</th>
                    <th>Started</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {workerHealth.queue.stuck_jobs.map((job) => (
                    <tr key={job.id}>
                      <td>
                        <div className={styles.cellStack}>
                          <strong>{job.type}</strong>
                          <span className={styles.subtle}>{job.id}</span>
                        </div>
                      </td>
                      <td>
                        <div className={styles.cellStack}>
                          <span>{job.locked_by ?? "-"}</span>
                          <span className={styles.subtle}>
                            Expires {formatTimestamp(job.lock_expires_at)}
                          </span>
                        </div>
                      </td>
                      <td>{formatTimestamp(job.started_at)}</td>
                      <td>{job.last_error ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.empty}>No stuck jobs detected.</div>
          )}
        </CardContent>
      </Card>

      {lastActionLabel ? (
        <Card>
          <CardHeader>Last action: {lastActionLabel}</CardHeader>
          <CardContent>
            <pre className={styles.pre}>{formatPayload(lastActionResult)}</pre>
          </CardContent>
        </Card>
      ) : null}
    </Container>
  );
}
