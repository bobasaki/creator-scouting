"use client";

import { type RunSummary } from "@/lib/api";
import styles from "./RunSummaryRow.module.css";

export function RunSummaryRow({ run }: { run: RunSummary }) {
  const input = run.input;
  const keywordLabel = input.keywords?.join(", ") || "no keywords";
  const maxChannelsLabel =
    input.max_channels !== null ? `${input.max_channels}ch` : "ch?";
  const videosLabel =
    input.videos_to_analyze !== null ? `${input.videos_to_analyze}vid` : "vid?";

  return (
    <a href={`/runs/${run.run_id}`} className={styles.row}>
      <div className={styles.title}>{run.run_id}</div>
      <div className={styles.meta}>
        {input.region}/{input.language} - {keywordLabel} - {maxChannelsLabel} -{" "}
        {videosLabel}
      </div>
    </a>
  );
}
