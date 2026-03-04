"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ApiErrorBanner } from "@/components/feedback/ApiErrorBanner";
import { InlineStatus } from "@/components/feedback/InlineStatus";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import {
  bootstrapAdminEnrich,
  bootstrapAdminRefresh,
  getChannel,
  type CatalogChannelDetail
} from "@/lib/api";
import styles from "./ChannelDetailPage.module.css";

const formatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC"
});

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return formatter.format(date);
}

function formatConfidence(value?: "low" | "medium" | "high" | null) {
  return value ?? "unknown";
}

function formatBootstrapMessage(
  kind: "refresh" | "enrich",
  response: Awaited<ReturnType<typeof bootstrapAdminRefresh>>
) {
  if (response.created_count > 0) {
    return `${kind === "refresh" ? "Refresh" : "Enrich"} job queued.`;
  }
  if (response.duplicate_count > 0) {
    return `${kind === "refresh" ? "Refresh" : "Enrich"} job already queued for today.`;
  }
  const skipped = response.skipped[0];
  if (skipped && typeof skipped.reason === "string") {
    return `${kind === "refresh" ? "Refresh" : "Enrich"} not queued: ${skipped.reason}.`;
  }
  return `${kind === "refresh" ? "Refresh" : "Enrich"} job was not queued.`;
}

export default function ChannelDetailPage() {
  const params = useParams<{ channelId: string }>();
  const channelId = useMemo(() => {
    const raw = params?.channelId;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params]);

  const [channel, setChannel] = useState<CatalogChannelDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [enriching, setEnriching] = useState(false);

  async function loadChannel(currentChannelId: string) {
    setLoading(true);
    setError(null);

    try {
      const response = await getChannel(currentChannelId);
      setChannel(response);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!channelId) return;
    loadChannel(channelId);
  }, [channelId]);

  async function handleQueueRefresh() {
    if (!channelId) return;

    setRefreshing(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const response = await bootstrapAdminRefresh({
        channel_ids: [channelId],
        limit: 1
      });
      setActionMessage(formatBootstrapMessage("refresh", response));
    } catch (err) {
      setActionError(err);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleQueueEnrich() {
    if (!channelId) return;

    setEnriching(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const response = await bootstrapAdminEnrich({
        channel_ids: [channelId],
        limit: 1
      });
      setActionMessage(formatBootstrapMessage("enrich", response));
    } catch (err) {
      setActionError(err);
    } finally {
      setEnriching(false);
    }
  }

  return (
    <Container className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <span className={styles.eyebrow}>Catalog profile</span>
          <Link href="/channels" className={styles.backLink}>
            Back to catalog
          </Link>
          <h1 className={styles.title}>{channel?.channel_name ?? "Channel detail"}</h1>
          <p className={styles.subtitle}>
            Full catalog snapshot, discovery provenance, scanned videos, and
            maintenance actions for this creator.
          </p>
        </div>

        <div className={styles.headerActions}>
          {channel ? (
            <div className={styles.headerPanel}>
              <span className={styles.panelLabel}>Final score</span>
              <strong className={styles.panelValue}>
                {channel.score.final_score === null ? "-" : channel.score.final_score}
              </strong>
              <span className={styles.panelMeta}>
                {channel.enrichment.estimated_category ?? "Uncategorized"} ·{" "}
                {channel.enrichment.estimated_type ?? "Type pending"}
              </span>
            </div>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            onClick={handleQueueRefresh}
            disabled={refreshing || !channelId}
          >
            {refreshing ? "Queueing..." : "Queue refresh"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={handleQueueEnrich}
            disabled={enriching || !channelId}
          >
            {enriching ? "Queueing..." : "Queue enrich"}
          </Button>
          {channel ? (
            <a
              href={channel.channel_url}
              target="_blank"
              rel="noreferrer"
              className={styles.externalLink}
            >
              Open YouTube channel
            </a>
          ) : null}
        </div>
      </div>

      {actionMessage ? (
        <Card>
          <CardContent>{actionMessage}</CardContent>
        </Card>
      ) : null}
      {actionError ? (
        <ApiErrorBanner error={actionError} onClear={() => setActionError(null)} />
      ) : null}
      {error ? <ApiErrorBanner error={error} onClear={() => setError(null)} /> : null}
      {loading ? <InlineStatus label="Loading channel..." /> : null}

      {channel ? (
        <>
          <div className={styles.storyGrid}>
          <Card>
            <CardHeader>Overview</CardHeader>
            <CardContent className={styles.overviewGrid}>
              <div className={styles.summaryCard}>
                <div className={styles.summaryRow}>
                  <span className={styles.label}>Channel ID</span>
                  <span className={styles.value}>{channel.channel_id}</span>
                </div>
                <div className={styles.summaryRow}>
                  <span className={styles.label}>Country</span>
                  <span className={styles.value}>
                    {channel.enrichment.country_inferred ?? "-"} (
                    {formatConfidence(channel.enrichment.country_confidence)})
                  </span>
                </div>
                <div className={styles.summaryRow}>
                  <span className={styles.label}>Language</span>
                  <span className={styles.value}>
                    {channel.enrichment.language_code ??
                      channel.enrichment.language_detected ??
                      "-"}{" "}
                    ({formatConfidence(channel.enrichment.language_confidence)})
                  </span>
                </div>
                <div className={styles.summaryRow}>
                  <span className={styles.label}>Category</span>
                  <span className={styles.value}>
                    {channel.enrichment.estimated_category ?? "-"}
                  </span>
                </div>
                <div className={styles.summaryRow}>
                  <span className={styles.label}>Type</span>
                  <span className={styles.value}>
                    {channel.enrichment.estimated_type ?? "-"}
                  </span>
                </div>
                <div className={styles.summaryRow}>
                  <span className={styles.label}>Contact email</span>
                  <span className={styles.value}>
                    {channel.contact.email ? (
                      <a href={`mailto:${channel.contact.email}`} className={styles.inlineLink}>
                        {channel.contact.email}
                      </a>
                    ) : (
                      "-"
                    )}
                    {channel.contact.source ? ` (${channel.contact.source})` : ""}
                  </span>
                </div>
              </div>

              <div className={styles.metricsGrid}>
                <div className={styles.metric}>
                  <span className={styles.metricLabel}>Subscribers</span>
                  <strong>{channel.metrics.subscriber_count}</strong>
                </div>
                <div className={styles.metric}>
                  <span className={styles.metricLabel}>Avg views</span>
                  <strong>{channel.metrics.avg_views_last_n}</strong>
                </div>
                <div className={styles.metric}>
                  <span className={styles.metricLabel}>Min views</span>
                  <strong>{channel.metrics.min_views_last_n}</strong>
                </div>
                <div className={styles.metric}>
                  <span className={styles.metricLabel}>Engagement</span>
                  <strong>{channel.metrics.engagement_rate_last_n.toFixed(2)}%</strong>
                </div>
                <div className={styles.metric}>
                  <span className={styles.metricLabel}>Days since upload</span>
                  <strong>{channel.metrics.days_since_last_upload}</strong>
                </div>
                <div className={styles.metric}>
                  <span className={styles.metricLabel}>Final score</span>
                  <strong>
                    {channel.score.final_score === null ? "-" : channel.score.final_score}
                  </strong>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className={styles.sideStack}>
            <Card>
              <CardHeader>Freshness</CardHeader>
              <CardContent className={styles.summaryCard}>
                <div className={styles.summaryRow}>
                  <span className={styles.label}>First seen</span>
                  <span className={styles.value}>
                    {formatDate(channel.freshness.first_seen_at)}
                  </span>
                </div>
                <div className={styles.summaryRow}>
                  <span className={styles.label}>Last seen</span>
                  <span className={styles.value}>
                    {formatDate(channel.freshness.last_seen_at)}
                  </span>
                </div>
                <div className={styles.summaryRow}>
                  <span className={styles.label}>Metrics refreshed</span>
                  <span className={styles.value}>
                    {formatDate(channel.freshness.last_metrics_refresh_at)}
                  </span>
                </div>
                <div className={styles.summaryRow}>
                  <span className={styles.label}>Content refreshed</span>
                  <span className={styles.value}>
                    {formatDate(channel.freshness.last_content_refresh_at)}
                  </span>
                </div>
                <div className={styles.summaryRow}>
                  <span className={styles.label}>Enriched</span>
                  <span className={styles.value}>
                    {formatDate(channel.freshness.last_enriched_at)}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>Score breakdown</CardHeader>
              <CardContent>
                <pre className={styles.codeBlock}>
                  {JSON.stringify(channel.score.breakdown ?? {}, null, 2)}
                </pre>
              </CardContent>
            </Card>
          </div>
          </div>

          <Card>
            <CardHeader>Description</CardHeader>
            <CardContent>
              <div className={styles.description}>
                {channel.channel_description?.trim() || "No stored channel description."}
              </div>
            </CardContent>
          </Card>

          <div className={styles.sectionGrid}>
          <Card>
            <CardHeader>
              <div className={styles.sectionHeader}>
                <span>Discovery provenance</span>
                <span className={styles.subtle}>
                  Last run {channel.provenance.last_run_id ?? "-"}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              {channel.provenance.discovery_events.length === 0 ? (
                <div className={styles.empty}>No discovery history stored yet.</div>
              ) : (
                <div className={styles.list}>
                  {channel.provenance.discovery_events.map((event) => (
                    <div key={event.id} className={styles.listItem}>
                      <div className={styles.summaryRow}>
                        <span className={styles.label}>{event.source}</span>
                        <span className={styles.value}>{formatDate(event.discovered_at)}</span>
                      </div>
                      <div className={styles.subtle}>
                        Region {event.seed_region ?? "-"} · Language {event.seed_language ?? "-"}
                      </div>
                      <div className={styles.subtle}>
                        Keywords{" "}
                        {event.seed_keywords.length > 0
                          ? event.seed_keywords.join(", ")
                          : "-"}
                      </div>
                      <div className={styles.subtle}>Run {event.run_id ?? "-"}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className={styles.sectionHeader}>
                <span>Scanned videos</span>
                <span className={styles.subtle}>{channel.videos.length} stored</span>
              </div>
            </CardHeader>
            <CardContent>
              {channel.videos.length === 0 ? (
                <div className={styles.empty}>No scanned video samples stored yet.</div>
              ) : (
                <div className={styles.list}>
                  {channel.videos.map((video) => (
                    <div key={video.video_id} className={styles.listItem}>
                      <div className={styles.summaryRow}>
                        <strong>{video.title || video.video_id}</strong>
                        <span className={styles.value}>
                          {formatDate(video.published_at)}
                        </span>
                      </div>
                      <div className={styles.subtle}>
                        Views {video.views} · Likes {video.likes} · Comments {video.comments}
                      </div>
                      <div className={styles.subtle}>
                        Email found {video.email_found ? "yes" : "no"}
                        {video.email_source ? ` (${video.email_source})` : ""}
                      </div>
                      <div className={styles.videoDescription}>
                        {video.description.trim() || "No stored video description."}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          </div>
        </>
      ) : null}
    </Container>
  );
}
