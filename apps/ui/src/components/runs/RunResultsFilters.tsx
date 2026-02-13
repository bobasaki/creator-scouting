"use client";

import styles from "./RunResultsFilters.module.css";

export type RunResultsFiltersState = {
  hasBrandAds: "all" | "true" | "false";
  minConfidence: "any" | "low" | "medium" | "high";
  minSponsorRatio: number;
};

export type RunResultsFiltersProps = {
  value: RunResultsFiltersState;
  onChange: (next: RunResultsFiltersState) => void;
};

function clampRatio(value: number) {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function RunResultsFilters({ value, onChange }: RunResultsFiltersProps) {
  return (
    <div className={styles.filters}>
      <label className={styles.field}>
        <span className={styles.label}>Brand Ads</span>
        <select
          value={value.hasBrandAds}
          onChange={(e) =>
            onChange({
              ...value,
              hasBrandAds: e.target.value as RunResultsFiltersState["hasBrandAds"],
            })
          }
          className={styles.input}
        >
          <option value="all">All</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Min confidence</span>
        <select
          value={value.minConfidence}
          onChange={(e) =>
            onChange({
              ...value,
              minConfidence: e.target
                .value as RunResultsFiltersState["minConfidence"],
            })
          }
          className={styles.input}
        >
          <option value="any">Any</option>
          <option value="low">Low+</option>
          <option value="medium">Medium+</option>
          <option value="high">High</option>
        </select>
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Min sponsor ratio</span>
        <input
          type="number"
          min={0}
          max={1}
          step={0.01}
          value={value.minSponsorRatio}
          onChange={(e) =>
            onChange({
              ...value,
              minSponsorRatio: clampRatio(Number(e.target.value)),
            })
          }
          className={[styles.input, styles.ratioInput].join(" ")}
        />
      </label>
    </div>
  );
}
