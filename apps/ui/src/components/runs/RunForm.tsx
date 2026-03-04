"use client";

import { useState } from "react";
import { ClientOnly } from "@/components/ClientOnly";
import { Button } from "@/components/ui/Button";
import {
  COUNTRY_OPTIONS,
  KEYWORD_OPTIONS,
  LANGUAGE_OPTIONS,
} from "@/lib/runFormOptions";
import styles from "./RunForm.module.css";

export type RunFormProps = {
  keywords: string[];
  excludeKeywords: string[];
  region: string;
  language: string;
  maxChannels: string;
  videosToAnalyze: string;
  minViews: string;
  maxDaysSinceUpload: string;
  minAvgViews: string;
  minEngagementRate: string;
  submitting: boolean;
  error?: string | null;
  onKeywordsChange: (value: string[]) => void;
  onExcludeKeywordsChange: (value: string[]) => void;
  onRegionChange: (value: string) => void;
  onLanguageChange: (value: string) => void;
  onMaxChannelsChange: (value: string) => void;
  onVideosToAnalyzeChange: (value: string) => void;
  onMinViewsChange: (value: string) => void;
  onMaxDaysSinceUploadChange: (value: string) => void;
  onMinAvgViewsChange: (value: string) => void;
  onMinEngagementRateChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

function optionLabel(value: string) {
  return KEYWORD_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export function RunForm({
  keywords,
  excludeKeywords,
  region,
  language,
  maxChannels,
  videosToAnalyze,
  minViews,
  maxDaysSinceUpload,
  minAvgViews,
  minEngagementRate,
  submitting,
  error,
  onKeywordsChange,
  onExcludeKeywordsChange,
  onRegionChange,
  onLanguageChange,
  onMaxChannelsChange,
  onVideosToAnalyzeChange,
  onMinViewsChange,
  onMaxDaysSinceUploadChange,
  onMinAvgViewsChange,
  onMinEngagementRateChange,
  onSubmit,
}: RunFormProps) {
  const [keywordDraft, setKeywordDraft] = useState("");
  const [excludeKeywordDraft, setExcludeKeywordDraft] = useState("");
  const regionOk = /^[A-Z]{2}$/.test(region.trim());
  const languageOk = /^[a-z]{2,3}(-[a-z]{2})?$/.test(language.trim());
  const isValid = regionOk && languageOk;

  const availableKeywordOptions = KEYWORD_OPTIONS.filter(
    (option) =>
      !keywords.includes(option.value) && !excludeKeywords.includes(option.value)
  );
  const availableExcludeKeywordOptions = KEYWORD_OPTIONS.filter(
    (option) =>
      !excludeKeywords.includes(option.value) && !keywords.includes(option.value)
  );

  function addKeyword() {
    if (!keywordDraft) return;
    onKeywordsChange([...keywords, keywordDraft]);
    setKeywordDraft("");
  }

  function removeKeyword(value: string) {
    onKeywordsChange(keywords.filter((keyword) => keyword !== value));
  }

  function addExcludeKeyword() {
    if (!excludeKeywordDraft) return;
    onExcludeKeywordsChange([...excludeKeywords, excludeKeywordDraft]);
    setExcludeKeywordDraft("");
  }

  function removeExcludeKeyword(value: string) {
    onExcludeKeywordsChange(
      excludeKeywords.filter((keyword) => keyword !== value)
    );
  }

  return (
    <ClientOnly>
      <form onSubmit={onSubmit} className={styles.form} suppressHydrationWarning>
        {error ? <div className={styles.error}>{error}</div> : null}
        <label className={styles.field}>
          <span className={styles.label}>Keywords</span>
          <span className={styles.hint}>Optional. Leave empty for a broader search.</span>
          <div className={styles.multiInput}>
            <select
              value={keywordDraft}
              onChange={(e) => setKeywordDraft(e.target.value)}
              className={styles.input}
            >
              <option value="">Add keyword</option>
              {availableKeywordOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={addKeyword}
              disabled={!keywordDraft}
            >
              Add
            </Button>
          </div>
          {keywords.length > 0 ? (
            <div className={styles.tags}>
              {keywords.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => removeKeyword(value)}
                  className={styles.tag}
                >
                  {optionLabel(value)}
                  <span className={styles.tagRemove}>x</span>
                </button>
              ))}
            </div>
          ) : (
            <span className={styles.helperNote}>
              No keywords selected. Broad search will use general discovery topics.
            </span>
          )}
        </label>
        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>Region</span>
            <span className={styles.hint}>Choose a country</span>
            <select
              value={region}
              onChange={(e) => onRegionChange(e.target.value)}
              className={styles.input}
            >
              <option value="">Select country</option>
              {COUNTRY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Language</span>
            <span className={styles.hint}>Choose a language</span>
            <select
              value={language}
              onChange={(e) => onLanguageChange(e.target.value)}
              className={styles.input}
            >
              <option value="">Select language</option>
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className={styles.field}>
          <span className={styles.label}>Exclude keywords</span>
          <span className={styles.hint}>Optional. Skip channels matching these topics.</span>
          <div className={styles.multiInput}>
            <select
              value={excludeKeywordDraft}
              onChange={(e) => setExcludeKeywordDraft(e.target.value)}
              className={styles.input}
            >
              <option value="">Add excluded keyword</option>
              {availableExcludeKeywordOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={addExcludeKeyword}
              disabled={!excludeKeywordDraft}
            >
              Add
            </Button>
          </div>
          {excludeKeywords.length > 0 ? (
            <div className={styles.tags}>
              {excludeKeywords.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => removeExcludeKeyword(value)}
                  className={styles.tag}
                >
                  {optionLabel(value)}
                  <span className={styles.tagRemove}>x</span>
                </button>
              ))}
            </div>
          ) : (
            <span className={styles.helperNote}>
              No excluded keywords selected.
            </span>
          )}
        </label>
        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>Max channels</span>
            <span className={styles.hint}>How many channels to include</span>
            <input
              type="number"
              min={1}
              value={maxChannels}
              onChange={(e) => onMaxChannelsChange(e.target.value)}
              placeholder="Leave blank for default"
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
              onChange={(e) => onVideosToAnalyzeChange(e.target.value)}
              placeholder="Leave blank for default"
              className={styles.input}
            />
          </label>
        </div>
        <div className={styles.sectionTitle}>Thresholds</div>
        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>Min video views</span>
            <span className={styles.hint}>Lowest recent video view count required</span>
            <input
              type="number"
              min={0}
              value={minViews}
              onChange={(e) => onMinViewsChange(e.target.value)}
              placeholder="Leave blank to disable"
              className={styles.input}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Max days since last post</span>
            <span className={styles.hint}>Leave blank to disable this filter</span>
            <input
              type="number"
              min={0}
              value={maxDaysSinceUpload}
              onChange={(e) => onMaxDaysSinceUploadChange(e.target.value)}
              placeholder="Leave blank to disable"
              className={styles.input}
            />
          </label>
        </div>
        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>Min avg views</span>
            <span className={styles.hint}>Average across the analyzed recent videos</span>
            <input
              type="number"
              min={0}
              value={minAvgViews}
              onChange={(e) => onMinAvgViewsChange(e.target.value)}
              placeholder="Leave blank to disable"
              className={styles.input}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Min engagement rate (%)</span>
            <span className={styles.hint}>Calculated from likes + comments over views</span>
            <input
              type="number"
              min={0}
              step={0.1}
              value={minEngagementRate}
              onChange={(e) => onMinEngagementRateChange(e.target.value)}
              placeholder="Leave blank to disable"
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
              Select a country and a language to run the search.
            </span>
          ) : null}
        </div>
      </form>
    </ClientOnly>
  );
}
