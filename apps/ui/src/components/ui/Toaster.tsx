"use client";

import { useEffect, useRef, useState } from "react";
import { Toast, type ToastItem, subscribeToToasts } from "./Toast";
import styles from "./Toaster.module.css";

const AUTO_DISMISS_MS = 4000;

export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const unsubscribe = subscribeToToasts((toast) => {
      setToasts((prev) => [...prev, toast]);
      const timeout = window.setTimeout(() => {
        dismiss(toast.id);
      }, AUTO_DISMISS_MS);
      timers.current.set(toast.id, timeout);
    });

    return () => {
      unsubscribe();
      timers.current.forEach((timer) => window.clearTimeout(timer));
      timers.current.clear();
    };
  }, []);

  function dismiss(id: string) {
    setToasts((prev) => prev.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }

  if (toasts.length === 0) return null;

  return (
    <div className={styles.toaster}>
      {toasts.map((item) => (
        <Toast key={item.id} toast={item} onDismiss={dismiss} />
      ))}
    </div>
  );
}
