import { z } from "zod";
import { AppConfig } from "../config";

export const RunRequestSchema = z.object({
  keywords: z
    .array(z.string().min(1))
    .min(1, "At least one keyword is required")
    .max(AppConfig.limits.maxKeywords),

  region: z.string().length(2),
  language: z.string().min(2).max(5),

  min_avg_views: z.number().nonnegative().optional(),
  max_days_since_upload: z.number().positive().optional(),
  min_subscribers: z.number().nonnegative().optional(),

  videos_to_analyze: z
    .number()
    .int()
    .min(1)
    .max(AppConfig.limits.maxVideosToAnalyze)
    .optional(),

  max_channels: z
    .number()
    .int()
    .min(1)
    .max(AppConfig.limits.maxChannelsPerRun)
    .optional()
});

export type RunRequest = z.infer<typeof RunRequestSchema>;