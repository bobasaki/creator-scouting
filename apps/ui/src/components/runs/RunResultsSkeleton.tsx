"use client";

import { Skeleton } from "@/components/ui/Skeleton";
import styles from "./RunResultsSkeleton.module.css";

export function RunResultsSkeleton() {
  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        {Array.from({ length: 11 }).map((_, idx) => (
          <Skeleton key={`header-skel-${idx}`} height={10} />
        ))}
      </div>
      <div>
        {Array.from({ length: 8 }).map((_, rowIdx) => (
          <div key={`row-skel-${rowIdx}`} className={styles.row}>
            {Array.from({ length: 11 }).map((__, colIdx) => (
              <Skeleton key={`cell-${rowIdx}-${colIdx}`} height={10} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
