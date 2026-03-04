"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { RUNS_UI_ENABLED } from "@/lib/features";
import styles from "./Sidebar.module.css";

export type SidebarProps = {
  open?: boolean;
  onClose?: () => void;
};

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const isChannelsActive =
    pathname === "/channels" || (pathname?.startsWith("/channels") ?? false);
  const isAdminActive =
    pathname === "/admin" || (pathname?.startsWith("/admin") ?? false);
  const isRunsActive =
    pathname === "/runs" || (pathname?.startsWith("/runs") ?? false);

  return (
    <>
      <aside
        className={[styles.sidebar, open ? styles.sidebarOpen : undefined]
          .filter(Boolean)
          .join(" ")}
      >
        <div className={styles.brand}>
          <div className={styles.logo}>CS</div>
          <div className={styles.brandText}>
            <div className={styles.brandTitle}>Creator Scouting</div>
            <div className={styles.brandSubtitle}>Always-on catalog engine</div>
          </div>
        </div>
        <nav className={styles.nav}>
          <Link
            href="/channels"
            className={[styles.link, isChannelsActive ? styles.linkActive : undefined]
              .filter(Boolean)
              .join(" ")}
            onClick={onClose}
          >
            Channels
          </Link>
          <Link
            href="/admin"
            className={[styles.link, isAdminActive ? styles.linkActive : undefined]
              .filter(Boolean)
              .join(" ")}
            onClick={onClose}
          >
            Admin
          </Link>
          {RUNS_UI_ENABLED ? (
            <Link
              href="/runs"
              className={[styles.link, isRunsActive ? styles.linkActive : undefined]
                .filter(Boolean)
                .join(" ")}
              onClick={onClose}
            >
              Internal runs
            </Link>
          ) : null}
        </nav>
        <div className={styles.callout}>
          <div className={styles.calloutLabel}>System mode</div>
          <div className={styles.calloutTitle}>Catalog first</div>
          <p className={styles.calloutBody}>
            Discovery keeps running in the background. The UI is for slicing,
            validating, and acting on what is already scanned.
          </p>
        </div>
      </aside>
      {open ? (
        <button
          type="button"
          onClick={onClose}
          className={styles.overlay}
          aria-label="Close sidebar"
        />
      ) : null}
    </>
  );
}
