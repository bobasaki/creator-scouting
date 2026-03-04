import { z } from "zod";

export const LocaleConfidenceSchema = z.enum(["low", "medium", "high"]);

export const CatalogSortSchema = z.enum([
  "score_final",
  "subscribers",
  "avg_views",
  "engagement_rate",
  "days_since_last_upload",
  "last_refreshed"
]);

export const CatalogSortDirSchema = z.enum(["asc", "desc"]);

export const CatalogSegmentFiltersSchema = z
  .object({
    country: z.string().trim().length(2).optional(),
    language: z.string().trim().min(2).max(5).optional(),
    min_subscribers: z.number().int().nonnegative().optional(),
    min_avg_views: z.number().int().nonnegative().optional(),
    min_engagement_rate: z.number().nonnegative().optional(),
    max_days_since_upload: z.number().int().nonnegative().optional(),
    max_metrics_refresh_age_days: z.number().int().nonnegative().optional(),
    max_content_refresh_age_days: z.number().int().nonnegative().optional(),
    max_enrichment_age_days: z.number().int().nonnegative().optional(),
    estimated_category: z.string().trim().min(1).max(120).optional(),
    estimated_type: z.string().trim().min(1).max(120).optional(),
    min_country_confidence: LocaleConfidenceSchema.optional(),
    min_language_confidence: LocaleConfidenceSchema.optional(),
    email_found: z.boolean().optional(),
    sort: CatalogSortSchema.optional(),
    sort_dir: CatalogSortDirSchema.optional()
  })
  .strict();

export const SavedSegmentCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  filters: CatalogSegmentFiltersSchema
});

export const SavedSegmentUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    filters: CatalogSegmentFiltersSchema.optional()
  })
  .strict()
  .refine((value) => value.name !== undefined || value.filters !== undefined, {
    message: "At least one field must be provided"
  });

export type CatalogSegmentFilters = z.infer<typeof CatalogSegmentFiltersSchema>;
