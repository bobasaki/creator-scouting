"use client";

import { type RunSummary } from "@/lib/api";
import styles from "./RunSummaryRow.module.css";

const compactNumberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatCompact(value: number | null | undefined) {
  if (value === null || value === undefined || value <= 0) return null;
  return compactNumberFormatter.format(value);
}

export function RunSummaryRow({ run }: { run: RunSummary }) {
  const input = run.input;
  const keywordLabel = input.keywords?.join(", ") || "any keyword";
  const excludeKeywordLabel =
    input.exclude_keywords && input.exclude_keywords.length > 0
      ? `exclude ${input.exclude_keywords.join(", ")}`
      : null;
  const maxChannelsLabel =
    input.max_channels !== null ? `${input.max_channels}ch` : "ch?";
  const videosLabel =
    input.videos_to_analyze !== null ? `${input.videos_to_analyze}vid` : "vid?";
  const filters = [
    input.min_views ? `>=${formatCompact(input.min_views)} min views` : null,
    input.max_days_since_upload
      ? `<=${input.max_days_since_upload}d last post`
      : null,
    input.min_avg_views ? `>=${formatCompact(input.min_avg_views)} avg` : null,
    input.min_engagement_rate
      ? `>=${input.min_engagement_rate}% engagement`
      : null,
  ]
    .filter(Boolean)
    .join(" - ");

  return (
    <a href={`/runs/${run.run_id}`} className={styles.row}>
      <div className={styles.title}>{run.run_id}</div>
      <div className={styles.meta}>
        {input.region}/{input.language} - {keywordLabel} - {maxChannelsLabel} -{" "}
        {videosLabel}
        {excludeKeywordLabel ? ` - ${excludeKeywordLabel}` : ""}
        {filters ? ` - ${filters}` : ""}
      </div>
    </a>
  );
}
