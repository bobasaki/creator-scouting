"use client";

import { useCallback } from "react";
import styles from "./Toast.module.css";

export type ToastVariant = "success" | "error" | "info";

export type ToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
};

export type ToastItem = {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
};

type ToastListener = (toast: ToastItem) => void;

let listeners: ToastListener[] = [];

function emitToast(toast: ToastItem) {
  listeners.forEach((listener) => listener(toast));
}

export function subscribeToToasts(listener: ToastListener) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((item) => item !== listener);
  };
}

export function toast(input: ToastInput) {
  const item: ToastItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: input.title,
    description: input.description,
    variant: input.variant ?? "info",
  };
  emitToast(item);
  return item.id;
}

export function useToast() {
  const push = useCallback((input: ToastInput) => toast(input), []);
  return { toast: push };
}

export type ToastProps = {
  toast: ToastItem;
  onDismiss: (id: string) => void;
};

export function Toast({ toast, onDismiss }: ToastProps) {
  return (
    <div className={[styles.toast, styles[toast.variant]].join(" ")} role="status">
      <div className={styles.header}>
        <div>
          <div className={styles.title}>{toast.title}</div>
          {toast.description ? (
            <div className={styles.description}>{toast.description}</div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          className={styles.dismiss}
          aria-label="Dismiss"
        >
          x
        </button>
      </div>
    </div>
  );
}
