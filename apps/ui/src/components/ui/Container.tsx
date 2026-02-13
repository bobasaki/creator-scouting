"use client";

import type { HTMLAttributes } from "react";
import styles from "./Container.module.css";

export type ContainerProps = HTMLAttributes<HTMLDivElement>;

export function Container({ className, ...props }: ContainerProps) {
  return (
    <div
      className={[styles.container, className].filter(Boolean).join(" ")}
      {...props}
    />
  );
}
