"use client";

import { isQuotaExceeded, type ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import styles from "./ApiErrorBanner.module.css";

export type ApiErrorBannerProps = {
  error: unknown;
  onClear?: () => void;
};

function extractDetails(error: unknown): {
  status?: number;
  code?: string;
  error?: string;
  message?: string;
} {
  if (!error) return {};
  if (typeof error === "string") return { message: error };
  if (error instanceof Error) {
    const info = error as Partial<ApiError>;
    return {
      status: typeof info.status === "number" ? info.status : undefined,
      code: typeof info.code === "string" ? info.code : undefined,
      error: typeof info.error === "string" ? info.error : undefined,
      message: typeof info.message === "string" ? info.message : error.message,
    };
  }
  if (typeof error === "object") {
    const info = error as Partial<ApiError> & { message?: unknown };
    return {
      status: typeof info.status === "number" ? info.status : undefined,
      code: typeof info.code === "string" ? info.code : undefined,
      error: typeof info.error === "string" ? info.error : undefined,
      message:
        typeof info.message === "string"
          ? info.message
          : typeof info.error === "string"
            ? info.error
            : undefined,
    };
  }
  return {};
}

export function ApiErrorBanner({ error, onClear }: ApiErrorBannerProps) {
  if (!error) return null;

  const details = extractDetails(error);
  const quota = isQuotaExceeded(error);
  const message =
    details.message || details.error || "Something went wrong. Please try again.";

  return (
    <div role="alert" className={styles.banner}>
      <div className={styles.content}>
        <div className={styles.text}>
          <div className={styles.title}>Request failed</div>
          {quota ? (
            <div className={styles.detail}>
              YouTube API quota exceeded. Wait a bit, use cached runs, or reduce
              request volume.
            </div>
          ) : (
            <div className={styles.detail}>
              {typeof details.status === "number" ? (
                <div>Status: {details.status}</div>
              ) : null}
              {details.code ? <div>Code: {details.code}</div> : null}
              <div>Message: {message}</div>
            </div>
          )}
        </div>
        {onClear ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={styles.dismiss}
            onClick={onClear}
          >
            Dismiss
          </Button>
        ) : null}
      </div>
    </div>
  );
}
