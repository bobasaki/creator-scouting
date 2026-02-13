"use client";

import { type EnrichJobStatusCounts } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import styles from "./RunJobStatus.module.css";

export type RunJobStatusProps = {
  status?: string | null;
  counts?: EnrichJobStatusCounts | null;
  showBadge?: boolean;
  showCounts?: boolean;
};

function getStatusBadge(status: string | null) {
  switch (status) {
    case "running":
      return { label: "Enriching", variant: "warning" as const };
    case "done":
      return { label: "Enriched", variant: "success" as const };
    case "failed":
    case "error":
      return { label: "Failed", variant: "danger" as const };
    case "starting":
      return { label: "Starting", variant: "neutral" as const };
    default:
      return { label: "Not enriched", variant: "neutral" as const };
  }
}

export function RunJobStatus({
  status = null,
  counts = null,
  showBadge = true,
  showCounts = true,
}: RunJobStatusProps) {
  const badge = getStatusBadge(status);

  return (
    <div>
      <div className={styles.wrapper}>
        {showBadge ? <Badge variant={badge.variant}>{badge.label}</Badge> : null}
      </div>
      {showCounts && counts ? (
        <div className={styles.counts}>
          {(["total", "success", "failed", "pending"] as const).map((key) => (
            <div key={key}>
              {key}: {counts?.[key] ?? 0}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
