"use client";

import { Button } from "@/components/ui/Button";
import styles from "./RunActions.module.css";

export type RunActionsProps = {
  onExport: () => void;
  onEnrich: () => void;
  enrichState: "idle" | "running" | "done";
  canEnrich: boolean;
  enrichErrorMessage?: string | null;
  statusSlot?: React.ReactNode;
  exporting?: boolean;
};

export function RunActions({
  onExport,
  onEnrich,
  enrichState,
  canEnrich,
  enrichErrorMessage = null,
  statusSlot,
  exporting = false,
}: RunActionsProps) {
  return (
    <div className={styles.actions}>
      <Button variant="secondary" onClick={onExport} disabled={exporting}>
        {exporting ? "Exporting..." : "Export CSV"}
      </Button>
      <Button onClick={onEnrich} disabled={!canEnrich}>
        {enrichState === "running"
          ? "Enriching..."
          : enrichState === "done"
            ? "Enriched"
            : "Enrich (async)"}
      </Button>
      {enrichErrorMessage ? (
        <span className={styles.errorText}>{enrichErrorMessage}</span>
      ) : null}
      {statusSlot ?? null}
    </div>
  );
}
