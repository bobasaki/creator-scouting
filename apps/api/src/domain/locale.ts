export const LOCALE_CONFIDENCE_VALUES = ["low", "medium", "high"] as const;

export type LocaleConfidence = (typeof LOCALE_CONFIDENCE_VALUES)[number];

export function normalizeLocaleConfidence(value: unknown): LocaleConfidence | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "low" || normalized === "medium" || normalized === "high") {
    return normalized;
  }
  return null;
}

export function normalizeCountryCode(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  if (normalized.length === 0) return null;
  if (["unknown", "n/a", "na", "none", "null"].includes(normalized.toLowerCase())) {
    return null;
  }
  return /^[a-z]{2}$/i.test(normalized) ? normalized.toUpperCase() : null;
}

export function normalizeLanguageCode(value: unknown): string | null {
  const normalized = String(value ?? "")
    .trim()
    .replace(/_/g, "-");
  if (normalized.length === 0) return null;
  if (["unknown", "n/a", "na", "none", "null"].includes(normalized.toLowerCase())) {
    return null;
  }

  const parts = normalized.split("-").filter(Boolean);
  if (parts.length === 0 || parts.length > 2) return null;
  const [language, region] = parts;
  if (!/^[a-z]{2,3}$/i.test(language)) return null;
  if (region !== undefined && !/^[a-z]{2}$/i.test(region)) return null;

  return region
    ? `${language.toLowerCase()}-${region.toUpperCase()}`
    : language.toLowerCase();
}
