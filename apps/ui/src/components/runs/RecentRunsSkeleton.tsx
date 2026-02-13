"use client";

import { Skeleton } from "@/components/ui/Skeleton";
import styles from "./RecentRunsSkeleton.module.css";

export function RecentRunsSkeleton() {
  return (
    <div className={styles.wrapper}>
      {Array.from({ length: 4 }).map((_, idx) => (
        <div key={`recent-skel-${idx}`} className={styles.item}>
          <Skeleton height={14} width="40%" />
          <Skeleton height={12} width="70%" />
        </div>
      ))}
    </div>
  );
}
