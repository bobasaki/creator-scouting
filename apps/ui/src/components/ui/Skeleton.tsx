"use client";

import styles from "./Skeleton.module.css";

export type SkeletonProps = {
  className?: string;
  width?: number | string;
  height?: number | string;
};

export function Skeleton({ className, width, height }: SkeletonProps) {
  return (
    <div
      className={[styles.skeleton, className].filter(Boolean).join(" ")}
      style={{ width, height }}
    />
  );
}
