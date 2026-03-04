"use client";

import { Fragment, useMemo, useState } from "react";
import { ScoreBreakdownPanel } from "@/components/runs/ScoreBreakdownPanel";
import { type RunResult } from "@/lib/api";
import styles from "./RunResultsTable.module.css";

export type RunResultsSortKey =
  | "channel"
  | "subs"
  | "avgViews"
  | "days"
  | "base"
  | "delta"
  | "final"
  | "brandAds"
  | "sponsorRatio"
  | "why";

export type RunResultsSortDir = "asc" | "desc";

export type RunResultsTableProps = {
  results: RunResult[];
  sortKey: RunResultsSortKey;
  sortDir: RunResultsSortDir;
  onSortChange: (key: RunResultsSortKey) => void;
};

function formatNumber(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return Number(value).toFixed(digits);
}

function getWhyText(value: RunResult["why"]) {
  if (!value) return "";
  if (Array.isArray(value)) return value.join(" - ");
  return String(value);
}

function truncate(value: string, max = 80) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}...`;
}

function formatEvidenceLine(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";

  const obj = value as {
    videoId?: unknown;
    where?: unknown;
    match?: unknown;
  };

  const videoId = typeof obj.videoId === "string" ? obj.videoId : "";
  const where = typeof obj.where === "string" ? obj.where : "";
  const match = typeof obj.match === "string" ? obj.match : "";
  const formatted = [videoId, where, match].filter((part) => part.length > 0).join(":");
  if (formatted.length > 0) return formatted;

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getSponsorRatio(row: RunResult): number | null {
  if (typeof row.sponsorship_ratio === "number") return row.sponsorship_ratio;
  const enrichment = row.enrichment?.payload;
  const ratio = enrichment?.sponsorship?.ratio;
  return typeof ratio === "number" ? ratio : null;
}

function getScoreValue(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return value;
}

function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function getContactEmail(row: RunResult) {
  const contact = row.scan_context?.contact_email;
  if (!contact || typeof contact.email !== "string") return null;

  const email = contact.email.trim();
  if (email.length === 0) return null;

  return {
    email,
    source: contact.source,
    videoId: contact.video_id ?? null,
    videoTitle: contact.video_title ?? null,
  };
}

function getVideosScanned(row: RunResult) {
  const videos = row.scan_context?.videos_scanned;
  if (!Array.isArray(videos)) return [];

  return videos
    .map((video) => {
      const videoId =
        typeof video?.video_id === "string" ? video.video_id.trim() : "";
      const title = typeof video?.title === "string" ? video.title.trim() : "";
      const emailFound = video?.email_found === true;

      if (videoId.length === 0 && title.length === 0) return null;

      return {
        videoId: videoId || null,
        title: title || null,
        emailFound,
      };
    })
    .filter(
      (
        video
      ): video is { videoId: string | null; title: string | null; emailFound: boolean } =>
        Boolean(video)
    );
}

function formatEmailSource(source: "bio" | "video_description") {
  return source === "bio" ? "Bio" : "Video description";
}

export function RunResultsTable({
  results,
  sortKey,
  sortDir,
  onSortChange,
}: RunResultsTableProps) {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  function toggleRow(id: string) {
    setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function sortIndicator(key: RunResultsSortKey) {
    if (key !== sortKey) return "";
    return sortDir === "asc" ? " ^" : " v";
  }

  const showWhy = useMemo(
    () => results.some((row) => getWhyText(row.why).trim().length > 0),
    [results]
  );

  const showEvidence = useMemo(
    () =>
      results.some((row) => {
        const evidence = row.enrichment?.payload?.sponsorship?.evidence;
        return Array.isArray(evidence) && evidence.length > 0;
      }),
    [results]
  );

  const columns: Array<{
    key: string;
    label: string;
    sortKey?: RunResultsSortKey;
    numeric?: boolean;
  }> = [
    { key: "channel", label: "Channel", sortKey: "channel" },
    { key: "subs", label: "Subs", sortKey: "subs", numeric: true },
    { key: "avgViews", label: "Avg views", sortKey: "avgViews", numeric: true },
    { key: "days", label: "Days", sortKey: "days", numeric: true },
    { key: "base", label: "Base score", sortKey: "base", numeric: true },
    { key: "delta", label: "Delta", sortKey: "delta", numeric: true },
    { key: "final", label: "Final", sortKey: "final", numeric: true },
    { key: "brandAds", label: "Brand Ads", sortKey: "brandAds" },
    {
      key: "sponsorRatio",
      label: "Sponsor Ratio",
      sortKey: "sponsorRatio",
      numeric: true,
    },
  ];

  if (showWhy) {
    columns.push({ key: "why", label: "Why", sortKey: "why" });
  }

  if (showEvidence) {
    columns.push({ key: "evidence", label: "Evidence" });
  }

  columns.push({ key: "actions", label: "Actions" });

  const columnCount = columns.length;

  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <thead>
          <tr className={styles.headerRow}>
            {columns.map((col) => (
              <th
                key={col.key}
                className={[
                  styles.th,
                  col.numeric ? styles.numeric : undefined,
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {col.sortKey ? (
                  <button
                    type="button"
                    onClick={() => onSortChange(col.sortKey as RunResultsSortKey)}
                    className={styles.sortButton}
                  >
                    {col.label}
                    {sortIndicator(col.sortKey)}
                  </button>
                ) : (
                  col.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {results.length === 0 ? (
            <tr>
              <td colSpan={columnCount} className={styles.td}>
                No results yet.
              </td>
            </tr>
          ) : (
            results.map((row, idx) => {
              const enrichment = row.enrichment?.payload ?? null;
              const enrichmentStatus = row.enrichment?.status ?? "missing";
              const enrichmentModel = row.enrichment?.model ?? null;
              const enrichmentLanguage =
                typeof enrichment?.languageDetected === "string"
                  ? enrichment.languageDetected.trim()
                  : "";
              const enrichmentCategory =
                typeof enrichment?.estimatedCategory === "string"
                  ? enrichment.estimatedCategory.trim()
                  : "";
              const enrichmentType =
                typeof enrichment?.estimatedType === "string"
                  ? enrichment.estimatedType.trim()
                  : "";
              const enrichmentNiches = getStringArray(enrichment?.nicheLabels);
              const enrichmentRedFlags = getStringArray(enrichment?.redFlags);
              const enrichmentFitSummary =
                typeof enrichment?.fitSummary === "string"
                  ? enrichment.fitSummary.trim()
                  : "";
              const enrichmentBrandSafety =
                typeof enrichment?.brandSafetyNotes === "string"
                  ? enrichment.brandSafetyNotes.trim()
                  : "";
              const rowId = row.metrics.channelId || String(idx);
              const whyText = getWhyText(row.why);
              const truncatedWhy = truncate(whyText, 80);
              const isExpanded = Boolean(expandedRows[rowId]);
              const baseScore =
                getScoreValue(row.final_score_base) ??
                getScoreValue(row.finalScoreBase) ??
                getScoreValue(row.score_breakdown?.base.total);
              const deltaScore =
                getScoreValue(row.final_score_delta) ??
                getScoreValue(row.finalScoreDelta) ??
                getScoreValue(row.score_breakdown?.enrichment.total);
              const finalScore =
                getScoreValue(row.final_score_final) ??
                getScoreValue(row.finalScoreFinal) ??
                getScoreValue(row.finalScore);
              const sponsorRatio = getSponsorRatio(row);
              const sponsorEvidenceRaw = enrichment?.sponsorship?.evidence ?? null;
              const sponsorEvidence = Array.isArray(sponsorEvidenceRaw)
                ? sponsorEvidenceRaw
                    .map((line) => formatEvidenceLine(line))
                    .filter((line) => line.trim().length > 0)
                : [];
              const contactEmail = getContactEmail(row);
              const videosScanned = getVideosScanned(row);
              const hasEnrichmentDetails =
                Boolean(row.enrichment) &&
                (enrichmentStatus !== "missing" ||
                  Boolean(enrichmentModel) ||
                  Boolean(enrichmentCategory) ||
                  Boolean(enrichmentType) ||
                  Boolean(enrichmentLanguage) ||
                  enrichmentNiches.length > 0 ||
                  Boolean(enrichmentFitSummary) ||
                  Boolean(enrichmentBrandSafety) ||
                  enrichmentRedFlags.length > 0);
              const hasScanDetails =
                Boolean(contactEmail) || videosScanned.length > 0;
              const hasDetails =
                Boolean(row.score_breakdown) ||
                sponsorEvidence.length > 0 ||
                whyText.length > 0 ||
                hasEnrichmentDetails ||
                hasScanDetails;
              const canToggle = hasDetails;

              return (
                <Fragment key={rowId}>
                  <tr className={idx % 2 === 0 ? styles.rowOdd : styles.rowEven}>
                    {columns.map((col) => {
                      switch (col.key) {
                        case "channel":
                          return (
                            <td key={col.key} className={styles.td}>
                              <div className={styles.channelCell}>
                                {row.metrics.channelUrl ? (
                                  <a
                                    href={row.metrics.channelUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={styles.link}
                                  >
                                    {row.metrics.channelName}
                                  </a>
                                ) : (
                                  row.metrics.channelName
                                )}
                                {contactEmail ? (
                                  <div className={styles.channelMeta}>
                                    <a
                                      href={`mailto:${contactEmail.email}`}
                                      className={styles.emailLink}
                                    >
                                      {contactEmail.email}
                                    </a>
                                    {" · "}
                                    {formatEmailSource(contactEmail.source)}
                                  </div>
                                ) : null}
                              </div>
                            </td>
                          );
                        case "subs":
                          return (
                            <td
                              key={col.key}
                              className={[styles.td, styles.numeric].join(" ")}
                            >
                              {row.metrics.subscriberCount}
                            </td>
                          );
                        case "avgViews":
                          return (
                            <td
                              key={col.key}
                              className={[styles.td, styles.numeric].join(" ")}
                            >
                              {row.metrics.avgViewsLastN}
                            </td>
                          );
                        case "days":
                          return (
                            <td
                              key={col.key}
                              className={[styles.td, styles.numeric].join(" ")}
                            >
                              {row.metrics.daysSinceLastUpload}
                            </td>
                          );
                        case "base":
                          return (
                            <td
                              key={col.key}
                              className={[styles.td, styles.numeric, styles.emphasis]
                                .filter(Boolean)
                                .join(" ")}
                            >
                              {formatNumber(baseScore)}
                            </td>
                          );
                        case "delta":
                          return (
                            <td
                              key={col.key}
                              className={[styles.td, styles.numeric, styles.emphasis]
                                .filter(Boolean)
                                .join(" ")}
                            >
                              {formatNumber(deltaScore)}
                            </td>
                          );
                        case "final":
                          return (
                            <td
                              key={col.key}
                              className={[styles.td, styles.numeric, styles.emphasis]
                                .filter(Boolean)
                                .join(" ")}
                            >
                              {formatNumber(finalScore)}
                            </td>
                          );
                        case "brandAds": {
                          const hasBrandAds = enrichment?.hasBrandAdsLastN ?? null;
                          const confidence = enrichment?.brandAdsConfidence ?? null;
                          if (hasBrandAds === true) {
                            return (
                              <td key={col.key} className={styles.td}>
                                <span className={styles.badgePositive}>
                                  Yes{confidence ? ` (${confidence})` : ""}
                                </span>
                              </td>
                            );
                          }
                          if (hasBrandAds === false) {
                            return (
                              <td key={col.key} className={styles.td}>
                                <span className={styles.badgeNeutral}>
                                  No{confidence ? ` (${confidence})` : ""}
                                </span>
                              </td>
                            );
                          }
                          return (
                            <td key={col.key} className={styles.td}>
                              <span className={styles.badgeNeutral}>-</span>
                            </td>
                          );
                        }
                        case "sponsorRatio":
                          return (
                            <td
                              key={col.key}
                              className={[styles.td, styles.numeric].join(" ")}
                            >
                              {sponsorRatio === null ? (
                                "-"
                              ) : (
                                <span className={styles.badgeWarning}>
                                  {Number(sponsorRatio).toFixed(2)}
                                </span>
                              )}
                            </td>
                          );
                        case "why":
                          return (
                            <td key={col.key} className={styles.td}>
                              <div className={styles.why}>
                                <span className={styles.whyText}>
                                  {whyText ? truncatedWhy : "-"}
                                </span>
                              </div>
                            </td>
                          );
                        case "evidence": {
                          const evidenceCount = sponsorEvidence.length;
                          return (
                            <td key={col.key} className={styles.td}>
                              {evidenceCount > 0
                                ? `${evidenceCount} lines`
                                : "-"}
                            </td>
                          );
                        }
                        case "actions":
                        default:
                          return (
                            <td key={col.key} className={styles.td}>
                              <div className={styles.actions}>
                                {row.metrics.channelUrl ? (
                                  <a
                                    href={row.metrics.channelUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={styles.link}
                                  >
                                    Open
                                  </a>
                                ) : (
                                  "-"
                                )}
                                {canToggle ? (
                                  <button
                                    type="button"
                                    className={styles.detailsButton}
                                    onClick={() => toggleRow(rowId)}
                                  >
                                    {isExpanded ? "Hide details" : "Details"}
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          );
                      }
                    })}
                  </tr>
                  {isExpanded ? (
                    <tr className={styles.detailsRow}>
                      <td colSpan={columnCount} className={styles.detailsCell}>
                        <div className={styles.detailsGrid}>
                          {whyText ? (
                            <div className={styles.detailsSection}>
                              <div className={styles.detailsTitle}>Why</div>
                              <div className={styles.detailsBody}>{whyText}</div>
                            </div>
                          ) : null}
                          <ScoreBreakdownPanel
                            breakdown={row.score_breakdown}
                            scoringVersion={row.scoring_version}
                          />
                          {hasEnrichmentDetails ? (
                            <div className={styles.detailsSection}>
                              <div className={styles.detailsTitle}>Enrichment</div>
                              <div className={styles.detailsBody}>
                                <div>
                                  Status: {enrichmentStatus}
                                  {enrichmentModel ? ` (${enrichmentModel})` : ""}
                                </div>
                                {enrichmentCategory ? (
                                  <div>Category: {enrichmentCategory}</div>
                                ) : null}
                                {enrichmentType ? (
                                  <div>Type: {enrichmentType}</div>
                                ) : null}
                                {enrichmentLanguage ? (
                                  <div>Language: {enrichmentLanguage}</div>
                                ) : null}
                                {enrichmentNiches.length > 0 ? (
                                  <div>Niches: {enrichmentNiches.join(", ")}</div>
                                ) : null}
                                {enrichmentFitSummary ? (
                                  <div>Fit summary: {enrichmentFitSummary}</div>
                                ) : null}
                                {enrichmentBrandSafety ? (
                                  <div>Brand safety: {enrichmentBrandSafety}</div>
                                ) : null}
                                {enrichmentRedFlags.length > 0 ? (
                                  <div>Red flags: {enrichmentRedFlags.join(" | ")}</div>
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                          {hasScanDetails ? (
                            <div className={styles.detailsSection}>
                              <div className={styles.detailsTitle}>Scan context</div>
                              <div className={styles.detailsBody}>
                                <div>
                                  Email:{" "}
                                  {contactEmail ? (
                                    <a
                                      href={`mailto:${contactEmail.email}`}
                                      className={styles.emailLink}
                                    >
                                      {contactEmail.email}
                                    </a>
                                  ) : (
                                    "-"
                                  )}
                                </div>
                                {contactEmail ? (
                                  <div>
                                    Found in: {formatEmailSource(contactEmail.source)}
                                    {contactEmail.source === "video_description" &&
                                    (contactEmail.videoTitle || contactEmail.videoId)
                                      ? ` (${
                                          contactEmail.videoTitle ??
                                          contactEmail.videoId
                                        })`
                                      : ""}
                                  </div>
                                ) : null}
                                {videosScanned.length > 0 ? (
                                  <div>Videos scanned: {videosScanned.length}</div>
                                ) : null}
                                {videosScanned.length > 0 ? (
                                  <div className={styles.scanList}>
                                    {videosScanned.map((video, videoIndex) => (
                                      <div
                                        key={`${rowId}-video-${video.videoId ?? videoIndex}`}
                                        className={styles.scanItem}
                                      >
                                        <span>
                                          {video.title ?? video.videoId ?? "Untitled video"}
                                        </span>
                                        {video.emailFound ? (
                                          <span className={styles.badgePositive}>Email</span>
                                        ) : null}
                                      </div>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                          {sponsorEvidence.length > 0 ? (
                            <div className={styles.detailsSection}>
                              <div className={styles.detailsTitle}>Sponsor evidence</div>
                              <div className={styles.detailsBody}>
                                {sponsorEvidence.map((line, i) => (
                                  <div key={`${rowId}-evidence-${i}`}>{line}</div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
