"use client";

import { type ScoreBreakdown } from "@/lib/api";
import styles from "./ScoreBreakdownPanel.module.css";

export type ScoreBreakdownPanelProps = {
  breakdown?: ScoreBreakdown;
  scoringVersion?: string;
};

function renderComponents(components: Record<string, number | undefined> | undefined) {
  if (!components) return null;
  const entries = Object.entries(components);
  if (entries.length === 0) return null;
  return (
    <div className={styles.components}>
      {entries.map(([key, value]) => (
        <div key={key}>
          {key}: {typeof value === "number" ? value.toFixed(2) : String(value)}
        </div>
      ))}
    </div>
  );
}

export function ScoreBreakdownPanel({
  breakdown,
  scoringVersion,
}: ScoreBreakdownPanelProps) {
  if (!breakdown) return null;

  return (
    <div className={styles.panel}>
      <div className={styles.title}>Score breakdown</div>
      {scoringVersion ? (
        <div className={styles.subtitle}>Scoring version: {scoringVersion}</div>
      ) : null}
      <div className={styles.section}>
        <div>Base total: {breakdown.base.total.toFixed(2)}</div>
        {renderComponents(breakdown.base.components)}
      </div>
      <div className={styles.section}>
        <div>Enrichment total: {breakdown.enrichment.total.toFixed(2)}</div>
        {renderComponents(breakdown.enrichment.components)}
      </div>
      <div className={styles.section}>
        Final total: {breakdown.final.toFixed(2)}
      </div>
    </div>
  );
}
