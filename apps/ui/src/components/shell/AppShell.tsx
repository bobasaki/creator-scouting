"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { getApiBaseUrl, getApiHealth } from "@/lib/api";
import styles from "./AppShell.module.css";

type ApiHealthState = "unknown" | "ok" | "error";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [health, setHealth] = useState<ApiHealthState>("unknown");
  const [serverId, setServerId] = useState<string | null>(null);

  const apiBaseUrl = getApiBaseUrl();

  useEffect(() => {
    let mounted = true;
    getApiHealth()
      .then((data) => {
        if (!mounted) return;
        if (data?.ok) {
          setHealth("ok");
          setServerId(typeof data.serverId === "string" ? data.serverId : null);
        } else {
          setHealth("error");
        }
      })
      .catch(() => {
        if (!mounted) return;
        setHealth("error");
      });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className={styles.shell}>
      <div className={styles.shellInner}>
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className={styles.content}>
          <header className={styles.topBar}>
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className={styles.menuButton}
            >
              Menu
            </button>
            <div className={styles.topTitle}>Creator Scouting</div>
            <div className={styles.connection}>
              <span
                className={[
                  styles.healthDot,
                  health === "ok"
                    ? styles.healthOk
                    : health === "error"
                      ? styles.healthError
                      : undefined,
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
              <span>
                Connected to {apiBaseUrl}
                {health === "ok" && serverId ? ` (${serverId})` : ""}
                {health === "error" ? " (unreachable)" : ""}
              </span>
            </div>
          </header>
          <main className={styles.main}>{children}</main>
        </div>
      </div>
    </div>
  );
}
