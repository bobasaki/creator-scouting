"use client";

import type { HTMLAttributes } from "react";
import styles from "./Badge.module.css";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: "neutral" | "success" | "warning" | "danger";
};

export function Badge({ variant = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={[styles.badge, styles[variant], className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}
