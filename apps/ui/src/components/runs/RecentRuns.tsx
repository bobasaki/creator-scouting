"use client";

import { type RunSummary } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { RecentRunsSkeleton } from "@/components/runs/RecentRunsSkeleton";
import { RunSummaryRow } from "./RunSummaryRow";
import styles from "./RecentRuns.module.css";

export type RecentRunsProps = {
  runs: RunSummary[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
};

export function RecentRuns({ runs, loading, error, onRefresh }: RecentRunsProps) {
  const isRefreshing = loading && runs.length > 0;
  const showSkeleton = loading && runs.length === 0;
  const showEmpty = runs.length === 0 && !loading && !error;
  const showError = Boolean(error) && !loading;

  return (
    <Card className={styles.card}>
      <CardHeader className={styles.header}>
        <div className={styles.headerTitle}>
          <span>Recent runs</span>
          {isRefreshing ? (
            <span className={styles.refreshing}>Refreshing...</span>
          ) : null}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </Button>
      </CardHeader>
      <CardContent>
        {showError ? <div className={styles.error}>{error}</div> : null}
        {showSkeleton ? (
          <div className={styles.list}>
            <RecentRunsSkeleton />
          </div>
        ) : null}
        {showEmpty ? (
          <div className={styles.empty}>
            No runs yet. Create your first run to see results here.
          </div>
        ) : null}
        {!showSkeleton && !showEmpty ? (
          <div className={styles.list}>
            {runs.map((run) => (
              <RunSummaryRow key={run.run_id} run={run} />
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
