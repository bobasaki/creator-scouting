"use client";

import styles from "./InlineStatus.module.css";

export type InlineStatusProps = {
  label: string;
};

export function InlineStatus({ label }: InlineStatusProps) {
  return <div className={styles.status}>{label}</div>;
}
