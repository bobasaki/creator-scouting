"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ClientOnly } from "@/components/ClientOnly";
import { ApiErrorBanner } from "@/components/feedback/ApiErrorBanner";
import { InlineStatus } from "@/components/feedback/InlineStatus";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { COUNTRY_OPTIONS, LANGUAGE_OPTIONS } from "@/lib/runFormOptions";
import { CATEGORY_OPTIONS, TYPE_OPTIONS } from "@/lib/catalogOptions";
import {
  createSegment,
  deleteSegment,
  listChannels,
  listSegments,
  useSegment as markSegmentUsed,
  updateSegment,
  type CatalogChannel,
  type CatalogChannelFilters,
  type CatalogSegmentFilters,
  type SavedSegment
} from "@/lib/api";
import styles from "./ChannelsPage.module.css";

const freshnessFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC"
});

type EmailFilterValue = "all" | "yes" | "no";
type ConfidenceFilterValue = "" | "low" | "medium" | "high";

const CONFIDENCE_FILTER_OPTIONS: Array<{
  value: ConfidenceFilterValue;
  label: string;
}> = [
  { value: "", label: "Any confidence" },
  { value: "low", label: "Low+" },
  { value: "medium", label: "Medium+" },
  { value: "high", label: "High only" }
];

type FilterInputState = {
  country: string;
  language: string;
  minCountryConfidence: ConfidenceFilterValue;
  minLanguageConfidence: ConfidenceFilterValue;
  minSubscribers: string;
  minAvgViews: string;
  minEngagementRate: string;
  maxDaysSinceUpload: string;
  maxMetricsRefreshAgeDays: string;
  maxContentRefreshAgeDays: string;
  maxEnrichmentAgeDays: string;
  estimatedCategory: string;
  estimatedType: string;
  emailFound: EmailFilterValue;
  sort: CatalogChannelFilters["sort"];
  sortDir: CatalogChannelFilters["sort_dir"];
};

const DEFAULT_FILTERS: FilterInputState = {
  country: "",
  language: "",
  minCountryConfidence: "",
  minLanguageConfidence: "",
  minSubscribers: "",
  minAvgViews: "",
  minEngagementRate: "",
  maxDaysSinceUpload: "",
  maxMetricsRefreshAgeDays: "",
  maxContentRefreshAgeDays: "",
  maxEnrichmentAgeDays: "",
  estimatedCategory: "",
  estimatedType: "",
  emailFound: "all",
  sort: "score_final",
  sortDir: "desc"
};

function formatFreshness(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return freshnessFormatter.format(date);
}

function formatConfidence(value?: "low" | "medium" | "high" | null) {
  return value ? value : "unknown";
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

function normalizeCountry(value: string) {
  return value.trim().toUpperCase().slice(0, 2);
}

function normalizeLanguage(value: string) {
  return value.trim().replace(/_/g, "-").toLowerCase().slice(0, 5);
}

function buildSegmentFilters(input: FilterInputState): CatalogSegmentFilters {
  const filters: CatalogSegmentFilters = {
    country: normalizeCountry(input.country) || undefined,
    language: normalizeLanguage(input.language) || undefined,
    min_country_confidence: input.minCountryConfidence || undefined,
    min_language_confidence: input.minLanguageConfidence || undefined,
    min_subscribers: parseOptionalInteger(input.minSubscribers),
    min_avg_views: parseOptionalInteger(input.minAvgViews),
    min_engagement_rate: parseOptionalNumber(input.minEngagementRate),
    max_days_since_upload: parseOptionalInteger(input.maxDaysSinceUpload),
    max_metrics_refresh_age_days: parseOptionalInteger(input.maxMetricsRefreshAgeDays),
    max_content_refresh_age_days: parseOptionalInteger(input.maxContentRefreshAgeDays),
    max_enrichment_age_days: parseOptionalInteger(input.maxEnrichmentAgeDays),
    estimated_category: input.estimatedCategory || undefined,
    estimated_type: input.estimatedType || undefined,
    email_found:
      input.emailFound === "all" ? undefined : input.emailFound === "yes",
    sort: input.sort,
    sort_dir: input.sortDir
  };

  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined)
  ) as CatalogSegmentFilters;
}

function buildCatalogFilters(
  input: FilterInputState,
  page: number
): CatalogChannelFilters {
  return {
    ...buildSegmentFilters(input),
    page,
    per_page: 50
  };
}

function filterNumberToString(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function segmentToInputState(filters: CatalogSegmentFilters): FilterInputState {
  return {
    country: filters.country ?? "",
    language: filters.language ?? "",
    minCountryConfidence: filters.min_country_confidence ?? "",
    minLanguageConfidence: filters.min_language_confidence ?? "",
    minSubscribers: filterNumberToString(filters.min_subscribers),
    minAvgViews: filterNumberToString(filters.min_avg_views),
    minEngagementRate: filterNumberToString(filters.min_engagement_rate),
    maxDaysSinceUpload: filterNumberToString(filters.max_days_since_upload),
    maxMetricsRefreshAgeDays: filterNumberToString(
      filters.max_metrics_refresh_age_days
    ),
    maxContentRefreshAgeDays: filterNumberToString(
      filters.max_content_refresh_age_days
    ),
    maxEnrichmentAgeDays: filterNumberToString(filters.max_enrichment_age_days),
    estimatedCategory: filters.estimated_category ?? "",
    estimatedType: filters.estimated_type ?? "",
    emailFound:
      filters.email_found === undefined
        ? "all"
        : filters.email_found
          ? "yes"
          : "no",
    sort: filters.sort ?? DEFAULT_FILTERS.sort,
    sortDir: filters.sort_dir ?? DEFAULT_FILTERS.sortDir
  };
}

function summarizeSegment(segment: SavedSegment) {
  const summary: string[] = [];
  if (segment.filters.country) summary.push(segment.filters.country);
  if (segment.filters.language) summary.push(segment.filters.language);
  if (segment.filters.min_country_confidence) {
    summary.push(`country ${segment.filters.min_country_confidence}+`);
  }
  if (segment.filters.min_language_confidence) {
    summary.push(`language ${segment.filters.min_language_confidence}+`);
  }
  if (segment.filters.estimated_category) {
    summary.push(segment.filters.estimated_category);
  }
  if (typeof segment.filters.min_avg_views === "number") {
    summary.push(`avg >= ${segment.filters.min_avg_views}`);
  }
  if (typeof segment.filters.min_subscribers === "number") {
    summary.push(`subs >= ${segment.filters.min_subscribers}`);
  }
  if (typeof segment.filters.max_metrics_refresh_age_days === "number") {
    summary.push(`metrics <= ${segment.filters.max_metrics_refresh_age_days}d`);
  }
  if (typeof segment.filters.max_content_refresh_age_days === "number") {
    summary.push(`content <= ${segment.filters.max_content_refresh_age_days}d`);
  }
  if (typeof segment.filters.max_enrichment_age_days === "number") {
    summary.push(`enrich <= ${segment.filters.max_enrichment_age_days}d`);
  }
  if (segment.filters.email_found === true) summary.push("email");
  return summary.length > 0 ? summary.join(" · ") : "No filters yet";
}

export default function ChannelsPage() {
  const [filters, setFilters] = useState<FilterInputState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [channels, setChannels] = useState<CatalogChannel[]>([]);
  const [total, setTotal] = useState(0);
  const [perPage, setPerPage] = useState(50);
  const [segments, setSegments] = useState<SavedSegment[]>([]);
  const [segmentsLoading, setSegmentsLoading] = useState(true);
  const [segmentName, setSegmentName] = useState("");
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [segmentSaving, setSegmentSaving] = useState(false);
  const [segmentDeletingId, setSegmentDeletingId] = useState<string | null>(null);

  async function loadCatalog(nextFilters: FilterInputState, nextPage: number) {
    setLoading(true);
    setError(null);

    try {
      const response = await listChannels(buildCatalogFilters(nextFilters, nextPage));
      setChannels(response.results);
      setTotal(response.total);
      setPerPage(response.per_page);
      setPage(response.page);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  async function refreshSegments(nextSelectedId?: string | null) {
    setSegmentsLoading(true);
    try {
      const response = await listSegments();
      setSegments(response);
      setActionError(null);

      if (nextSelectedId && response.some((segment) => segment.id === nextSelectedId)) {
        setSelectedSegmentId(nextSelectedId);
        return;
      }

      if (selectedSegmentId && response.some((segment) => segment.id === selectedSegmentId)) {
        return;
      }

      setSelectedSegmentId(null);
    } catch (err) {
      setActionError(err);
    } finally {
      setSegmentsLoading(false);
    }
  }

  useEffect(() => {
    async function loadInitial() {
      await Promise.all([loadCatalog(DEFAULT_FILTERS, 1), refreshSegments(null)]);
    }

    loadInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleApply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    loadCatalog(filters, 1);
  }

  function handleReset() {
    setFilters(DEFAULT_FILTERS);
    setPage(1);
    setSelectedSegmentId(null);
    setSegmentName("");
    loadCatalog(DEFAULT_FILTERS, 1);
  }

  async function handleCreateSegment() {
    const name = segmentName.trim();
    if (!name) return;

    setSegmentSaving(true);
    setActionError(null);
    try {
      const created = await createSegment({
        name,
        filters: buildSegmentFilters(filters)
      });
      setSegmentName("");
      await refreshSegments(created.id);
    } catch (err) {
      setActionError(err);
    } finally {
      setSegmentSaving(false);
    }
  }

  async function handleUpdateSegment() {
    if (!selectedSegmentId) return;

    setSegmentSaving(true);
    setActionError(null);
    try {
      const updated = await updateSegment(selectedSegmentId, {
        name: segmentName.trim() || undefined,
        filters: buildSegmentFilters(filters)
      });
      setSegmentName(updated.name);
      await refreshSegments(updated.id);
    } catch (err) {
      setActionError(err);
    } finally {
      setSegmentSaving(false);
    }
  }

  async function handleApplySegment(segment: SavedSegment) {
    const nextFilters = segmentToInputState(segment.filters);
    setFilters(nextFilters);
    setSegmentName(segment.name);
    setSelectedSegmentId(segment.id);
    setActionError(null);

    try {
      await markSegmentUsed(segment.id);
      await refreshSegments(segment.id);
    } catch (err) {
      setActionError(err);
    }

    await loadCatalog(nextFilters, 1);
  }

  async function handleDeleteSegment(segmentId: string) {
    setSegmentDeletingId(segmentId);
    setActionError(null);
    try {
      await deleteSegment(segmentId);
      if (selectedSegmentId === segmentId) {
        setSelectedSegmentId(null);
        setSegmentName("");
      }
      await refreshSegments(selectedSegmentId === segmentId ? null : selectedSegmentId);
    } catch (err) {
      setActionError(err);
    } finally {
      setSegmentDeletingId(null);
    }
  }

  const start = total === 0 ? 0 : (page - 1) * perPage + 1;
  const end = total === 0 ? 0 : Math.min(total, start + channels.length - 1);
  const hasPrevious = page > 1;
  const hasNext = page * perPage < total;
  const currentSegmentFilters = buildSegmentFilters(filters);
  const activeFilterCount = Object.keys(currentSegmentFilters).filter(
    (key) => key !== "sort" && key !== "sort_dir"
  ).length;

  return (
    <Container className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLead}>
          <span className={styles.eyebrow}>Continuous creator catalog</span>
          <h1 className={styles.title}>Channels</h1>
          <p className={styles.subtitle}>
            Filter the stored creator catalog. Results come from previously scanned
            channels, not a live YouTube search on each request.
          </p>
        </div>
        <div className={styles.headerPanel}>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Stored creators</span>
            <strong className={styles.statValue}>{total}</strong>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Saved segments</span>
            <strong className={styles.statValue}>{segments.length}</strong>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Active filters</span>
            <strong className={styles.statValue}>{activeFilterCount}</strong>
          </div>
        </div>
      </div>

      <div className={styles.controlDeck}>
      <Card className={styles.segmentsCard}>
        <CardHeader>
          <div className={styles.resultsHeader}>
            <span>Saved segments</span>
            <span className={styles.resultsMeta}>
              {segmentsLoading ? "Loading..." : `${segments.length} saved`}
            </span>
          </div>
        </CardHeader>
        <ClientOnly>
          <CardContent className={styles.segmentCard} suppressHydrationWarning>
            <div className={styles.segmentComposer}>
              <label className={styles.field}>
                <span className={styles.label}>Segment name</span>
                <input
                  className={styles.input}
                  placeholder="Italian travel creators"
                  value={segmentName}
                  onChange={(event) => setSegmentName(event.target.value)}
                />
              </label>

              <div className={styles.actions}>
                <Button
                  type="button"
                  onClick={handleCreateSegment}
                  disabled={segmentSaving || segmentName.trim().length === 0}
                >
                  {segmentSaving ? "Saving..." : "Save current filters"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleUpdateSegment}
                  disabled={
                    segmentSaving ||
                    !selectedSegmentId ||
                    (segmentName.trim().length === 0 &&
                      Object.keys(currentSegmentFilters).length === 0)
                  }
                >
                  Update selected
                </Button>
              </div>
            </div>

            {segments.length === 0 && !segmentsLoading ? (
              <div className={styles.empty}>No saved segments yet.</div>
            ) : (
              <div className={styles.segmentList}>
                {segments.map((segment) => {
                  const active = segment.id === selectedSegmentId;
                  return (
                    <div
                      key={segment.id}
                      className={[
                        styles.segmentItem,
                        active ? styles.segmentItemActive : undefined
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <div className={styles.segmentBody}>
                        <div className={styles.segmentTitleRow}>
                          <strong>{segment.name}</strong>
                          {active ? <span className={styles.pill}>Selected</span> : null}
                        </div>
                        <span className={styles.subtle}>{summarizeSegment(segment)}</span>
                        <span className={styles.subtle}>
                          Last used {formatFreshness(segment.last_used_at)}
                        </span>
                      </div>
                      <div className={styles.segmentActions}>
                        <Button
                          type="button"
                          variant={active ? "secondary" : "ghost"}
                          size="sm"
                          onClick={() => handleApplySegment(segment)}
                        >
                          Apply
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={segmentDeletingId === segment.id}
                          onClick={() => handleDeleteSegment(segment.id)}
                        >
                          {segmentDeletingId === segment.id ? "Deleting..." : "Delete"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </ClientOnly>
      </Card>

      <Card className={styles.filtersCard}>
        <CardHeader>Catalog filters</CardHeader>
        <ClientOnly>
          <CardContent suppressHydrationWarning>
            <form
              className={styles.filtersForm}
              onSubmit={handleApply}
              suppressHydrationWarning
            >
            <div className={styles.filtersGrid}>
              <label className={styles.field}>
                <span className={styles.label}>Country</span>
                <select
                  className={styles.select}
                  value={filters.country}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, country: event.target.value }))
                  }
                >
                  <option value="">Any country</option>
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
                  value={filters.language}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, language: event.target.value }))
                  }
                >
                  <option value="">Any language</option>
                  {LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Min country confidence</span>
                <select
                  className={styles.select}
                  value={filters.minCountryConfidence}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      minCountryConfidence: event.target.value as ConfidenceFilterValue
                    }))
                  }
                >
                  {CONFIDENCE_FILTER_OPTIONS.map((option) => (
                    <option key={`country-${option.value || "any"}`} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Min language confidence</span>
                <select
                  className={styles.select}
                  value={filters.minLanguageConfidence}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      minLanguageConfidence: event.target.value as ConfidenceFilterValue
                    }))
                  }
                >
                  {CONFIDENCE_FILTER_OPTIONS.map((option) => (
                    <option key={`language-${option.value || "any"}`} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Email found</span>
                <select
                  className={styles.select}
                  value={filters.emailFound}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      emailFound: event.target.value as EmailFilterValue
                    }))
                  }
                >
                  <option value="all">All</option>
                  <option value="yes">Has email</option>
                  <option value="no">No email</option>
                </select>
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Min subscribers</span>
                <input
                  className={styles.input}
                  inputMode="numeric"
                  placeholder="Any"
                  value={filters.minSubscribers}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      minSubscribers: event.target.value
                    }))
                  }
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Min avg views</span>
                <input
                  className={styles.input}
                  inputMode="numeric"
                  placeholder="Any"
                  value={filters.minAvgViews}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, minAvgViews: event.target.value }))
                  }
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Min engagement rate (%)</span>
                <input
                  className={styles.input}
                  inputMode="decimal"
                  placeholder="Any"
                  value={filters.minEngagementRate}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      minEngagementRate: event.target.value
                    }))
                  }
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Max days since upload</span>
                <input
                  className={styles.input}
                  inputMode="numeric"
                  placeholder="Any"
                  value={filters.maxDaysSinceUpload}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      maxDaysSinceUpload: event.target.value
                    }))
                  }
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Max days since metrics refresh</span>
                <input
                  className={styles.input}
                  inputMode="numeric"
                  placeholder="Any"
                  value={filters.maxMetricsRefreshAgeDays}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      maxMetricsRefreshAgeDays: event.target.value
                    }))
                  }
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Max days since content refresh</span>
                <input
                  className={styles.input}
                  inputMode="numeric"
                  placeholder="Any"
                  value={filters.maxContentRefreshAgeDays}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      maxContentRefreshAgeDays: event.target.value
                    }))
                  }
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Max days since enrichment</span>
                <input
                  className={styles.input}
                  inputMode="numeric"
                  placeholder="Any"
                  value={filters.maxEnrichmentAgeDays}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      maxEnrichmentAgeDays: event.target.value
                    }))
                  }
                />
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Category</span>
                <select
                  className={styles.select}
                  value={filters.estimatedCategory}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      estimatedCategory: event.target.value
                    }))
                  }
                >
                  <option value="">Any category</option>
                  {CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Type</span>
                <select
                  className={styles.select}
                  value={filters.estimatedType}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, estimatedType: event.target.value }))
                  }
                >
                  <option value="">Any type</option>
                  {TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Sort</span>
                <select
                  className={styles.select}
                  value={filters.sort}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      sort: event.target.value as CatalogChannelFilters["sort"]
                    }))
                  }
                >
                  <option value="score_final">Final score</option>
                  <option value="avg_views">Avg views</option>
                  <option value="subscribers">Subscribers</option>
                  <option value="engagement_rate">Engagement rate</option>
                  <option value="days_since_last_upload">Days since upload</option>
                  <option value="last_refreshed">Last refreshed</option>
                </select>
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Direction</span>
                <select
                  className={styles.select}
                  value={filters.sortDir}
                  onChange={(event) =>
                    setFilters((prev) => ({
                      ...prev,
                      sortDir: event.target.value as CatalogChannelFilters["sort_dir"]
                    }))
                  }
                >
                  <option value="desc">Descending</option>
                  <option value="asc">Ascending</option>
                </select>
              </label>
            </div>

            <div className={styles.actions}>
              <Button type="submit" disabled={loading}>
                {loading ? "Loading..." : "Apply filters"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={handleReset}
                disabled={loading}
              >
                Reset
              </Button>
              <div className={styles.meta}>Catalog results: {total}</div>
            </div>
            </form>
          </CardContent>
        </ClientOnly>
      </Card>
      </div>

      {error ? <ApiErrorBanner error={error} onClear={() => setError(null)} /> : null}
      {actionError ? (
        <ApiErrorBanner error={actionError} onClear={() => setActionError(null)} />
      ) : null}
      {loading ? <InlineStatus label="Loading catalog..." /> : null}

      <Card className={styles.resultsCard}>
        <CardHeader>
          <div className={styles.resultsHeader}>
            <span>Catalog results</span>
            <span className={styles.resultsMeta}>
              Showing {start}-{end} of {total}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {channels.length === 0 && !loading ? (
            <div className={styles.empty}>
              No channels match the current filters yet.
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Channel</th>
                    <th>Country</th>
                    <th>Language</th>
                    <th className={styles.numeric}>Subs</th>
                    <th className={styles.numeric}>Avg views</th>
                    <th className={styles.numeric}>Engagement</th>
                    <th className={styles.numeric}>Days</th>
                    <th>Category</th>
                    <th>Type</th>
                    <th>Email</th>
                    <th className={styles.numeric}>Score</th>
                    <th>Freshness</th>
                  </tr>
                </thead>
                <tbody>
                  {channels.map((channel) => (
                    <tr key={channel.channel_id}>
                      <td>
                        <div className={styles.channelCell}>
                          <Link
                            href={`/channels/${channel.channel_id}`}
                            className={styles.link}
                          >
                            {channel.channel_name}
                          </Link>
                          <a
                            href={channel.channel_url}
                            target="_blank"
                            rel="noreferrer"
                            className={styles.subLink}
                          >
                            Open YouTube channel
                          </a>
                          <span className={styles.subtle}>{channel.channel_id}</span>
                        </div>
                      </td>
                      <td>
                        <div className={styles.channelCell}>
                          <span>{channel.enrichment.country_inferred ?? "-"}</span>
                          <span className={styles.subtle}>
                            {formatConfidence(channel.enrichment.country_confidence)}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className={styles.channelCell}>
                          <span>
                            {channel.enrichment.language_code ??
                              channel.enrichment.language_detected ??
                              "-"}
                          </span>
                          <span className={styles.subtle}>
                            {formatConfidence(channel.enrichment.language_confidence)}
                          </span>
                        </div>
                      </td>
                      <td className={styles.numeric}>
                        {channel.metrics.subscriber_count}
                      </td>
                      <td className={styles.numeric}>
                        {channel.metrics.avg_views_last_n}
                      </td>
                      <td className={styles.numeric}>
                        {channel.metrics.engagement_rate_last_n.toFixed(2)}%
                      </td>
                      <td className={styles.numeric}>
                        {channel.metrics.days_since_last_upload}
                      </td>
                      <td>{channel.enrichment.estimated_category ?? "-"}</td>
                      <td>{channel.enrichment.estimated_type ?? "-"}</td>
                      <td>
                        {channel.contact.email ? (
                          <div className={styles.channelCell}>
                            <a
                              href={`mailto:${channel.contact.email}`}
                              className={styles.link}
                            >
                              {channel.contact.email}
                            </a>
                            <span className={styles.subtle}>
                              {channel.contact.source ?? ""}
                            </span>
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className={styles.numeric}>
                        {channel.score.final_score === null
                          ? "-"
                          : channel.score.final_score}
                      </td>
                      <td>
                        <div className={styles.channelCell}>
                          <span className={styles.pill}>Metrics</span>
                          <span className={styles.subtle}>
                            {formatFreshness(
                              channel.freshness.last_metrics_refresh_at
                            )}
                          </span>
                          <span className={styles.subtle}>
                            Content{" "}
                            {formatFreshness(
                              channel.freshness.last_content_refresh_at
                            )}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className={styles.pagination}>
            <Button
              type="button"
              variant="secondary"
              disabled={!hasPrevious || loading}
              onClick={() => loadCatalog(filters, page - 1)}
            >
              Previous
            </Button>
            <div className={styles.meta}>
              Page {page} · {total} total channels
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={!hasNext || loading}
              onClick={() => loadCatalog(filters, page + 1)}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </Container>
  );
}
