"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Sidebar.module.css";

export type SidebarProps = {
  open?: boolean;
  onClose?: () => void;
};

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const pathname = usePathname();
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
            <div className={styles.brandSubtitle}>Run manager</div>
          </div>
        </div>
        <nav className={styles.nav}>
          <Link
            href="/runs"
            className={[styles.link, isRunsActive ? styles.linkActive : undefined]
              .filter(Boolean)
              .join(" ")}
            onClick={onClose}
          >
            New Run
          </Link>
        </nav>
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
