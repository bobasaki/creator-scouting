"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { getApiBaseUrl, getApiHealth } from "@/lib/api";
import styles from "./AppShell.module.css";

type ApiHealthState = "unknown" | "ok" | "error";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [health, setHealth] = useState<ApiHealthState>("unknown");
  const [serverId, setServerId] = useState<string | null>(null);
  const pathname = usePathname();

  const apiBaseUrl = getApiBaseUrl();
  const sectionLabel = pathname?.startsWith("/admin")
    ? "Operations deck"
    : pathname?.startsWith("/channels/")
      ? "Channel profile"
      : pathname?.startsWith("/channels")
        ? "Catalog navigator"
        : pathname?.startsWith("/runs")
          ? "Internal runs"
          : "Catalog navigator";
  const sectionCaption = pathname?.startsWith("/admin")
    ? "Control quota, discovery seeds, coverage, and refresh cadence."
    : pathname?.startsWith("/channels/")
      ? "Inspect one creator with provenance, freshness, and maintenance controls."
      : pathname?.startsWith("/channels")
        ? "Filter the always-on creator catalog instead of launching one-off searches."
        : "Continuous scouting, refresh, and enrichment from one system.";

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
            <div className={styles.topBarLead}>
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className={styles.menuButton}
              >
                Menu
              </button>
              <div className={styles.topBarCopy}>
                <div className={styles.topEyebrow}>Always-on scouting system</div>
                <div className={styles.topTitleRow}>
                  <div className={styles.topTitle}>Creator Scouting</div>
                  <span className={styles.sectionBadge}>{sectionLabel}</span>
                </div>
                <p className={styles.topCaption}>{sectionCaption}</p>
              </div>
            </div>
            <div className={styles.connectionCard}>
              <div className={styles.connectionLabel}>API proxy</div>
              <div className={styles.connectionValue}>Connected via {apiBaseUrl}</div>
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
                  {health === "ok" ? "Live" : health === "error" ? "Unreachable" : "Checking"}
                  {health === "ok" && serverId ? ` · ${serverId}` : ""}
                </span>
              </div>
            </div>
          </header>
          <main className={styles.main}>{children}</main>
        </div>
      </div>
    </div>
  );
}
