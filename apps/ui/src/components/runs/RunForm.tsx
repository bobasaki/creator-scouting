"use client";

import { ClientOnly } from "@/components/ClientOnly";
import { Button } from "@/components/ui/Button";
import styles from "./RunForm.module.css";

export type RunFormProps = {
  keywords: string;
  region: string;
  language: string;
  maxChannels: number;
  videosToAnalyze: number;
  submitting: boolean;
  error?: string | null;
  onKeywordsChange: (value: string) => void;
  onRegionChange: (value: string) => void;
  onLanguageChange: (value: string) => void;
  onMaxChannelsChange: (value: number) => void;
  onVideosToAnalyzeChange: (value: number) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

export function RunForm({
  keywords,
  region,
  language,
  maxChannels,
  videosToAnalyze,
  submitting,
  error,
  onKeywordsChange,
  onRegionChange,
  onLanguageChange,
  onMaxChannelsChange,
  onVideosToAnalyzeChange,
  onSubmit,
}: RunFormProps) {
  const keywordList = keywords
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const regionOk = region.trim().length >= 2;
  const languageOk = language.trim().length >= 2;
  const isValid = keywordList.length > 0 && regionOk && languageOk;

  return (
    <ClientOnly>
      <form onSubmit={onSubmit} className={styles.form} suppressHydrationWarning>
        {error ? <div className={styles.error}>{error}</div> : null}
        <label className={styles.field}>
          <span className={styles.label}>Keywords (comma-separated)</span>
          <span className={styles.hint}>
            Example: gaming, fashion, travel
          </span>
          <input
            value={keywords}
            onChange={(e) => onKeywordsChange(e.target.value)}
            placeholder="gaming, fashion, travel"
            className={styles.input}
          />
        </label>
        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>Region</span>
            <span className={styles.hint}>Two-letter country code (e.g. DE)</span>
            <input
              value={region}
              onChange={(e) => onRegionChange(e.target.value)}
              placeholder="DE"
              className={styles.input}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Language</span>
            <span className={styles.hint}>Two-letter language code (e.g. de)</span>
            <input
              value={language}
              onChange={(e) => onLanguageChange(e.target.value)}
              placeholder="de"
              className={styles.input}
            />
          </label>
        </div>
        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>Max channels</span>
            <span className={styles.hint}>How many channels to include</span>
            <input
              type="number"
              min={1}
              value={maxChannels}
              onChange={(e) => onMaxChannelsChange(Number(e.target.value))}
              className={styles.input}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Videos to analyze</span>
            <span className={styles.hint}>Recent videos per channel</span>
            <input
              type="number"
              min={1}
              value={videosToAnalyze}
              onChange={(e) => onVideosToAnalyzeChange(Number(e.target.value))}
              className={styles.input}
            />
          </label>
        </div>
        <div className={styles.actions}>
          <Button type="submit" disabled={submitting || !isValid}>
            {submitting ? "Creating..." : "Create Run"}
          </Button>
          {!isValid ? (
            <span className={styles.helper}>
              Add at least one keyword and 2-letter region/language codes.
            </span>
          ) : null}
        </div>
      </form>
    </ClientOnly>
  );
}
