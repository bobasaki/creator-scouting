"use client";

import type { HTMLAttributes } from "react";
import styles from "./Card.module.css";

export type CardProps = HTMLAttributes<HTMLDivElement>;
export type CardHeaderProps = HTMLAttributes<HTMLDivElement>;
export type CardContentProps = HTMLAttributes<HTMLDivElement>;

function clsx(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function Card({ className, ...props }: CardProps) {
  return (
    <div className={clsx(styles.card, className)} {...props} />
  );
}

export function CardHeader({ className, ...props }: CardHeaderProps) {
  return (
    <div className={clsx(styles.header, className)} {...props} />
  );
}

export function CardContent({ className, ...props }: CardContentProps) {
  return (
    <div className={clsx(styles.content, className)} {...props} />
  );
}
