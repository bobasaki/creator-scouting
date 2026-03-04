import { FastifyInstance } from "fastify";
import {
  type CatalogListFilters,
  getCatalogChannelById,
  listCatalogChannels
} from "../repositories/catalog.repo";
import { normalizeLocaleConfidence } from "../domain/locale";

function parseOptionalNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return undefined;
}

export async function channelsRoutes(app: FastifyInstance) {
  app.get("/channels", async (request) => {
    const query = request.query as Record<string, unknown>;
    const filters: CatalogListFilters = {
      country: typeof query.country === "string" ? query.country : undefined,
      language: typeof query.language === "string" ? query.language : undefined,
      minSubscribers: parseOptionalNumber(query.min_subscribers),
      minAvgViews: parseOptionalNumber(query.min_avg_views),
      minEngagementRate: parseOptionalNumber(query.min_engagement_rate),
      maxDaysSinceUpload: parseOptionalNumber(query.max_days_since_upload),
      maxMetricsRefreshAgeDays: parseOptionalNumber(query.max_metrics_refresh_age_days),
      maxContentRefreshAgeDays: parseOptionalNumber(query.max_content_refresh_age_days),
      maxEnrichmentAgeDays: parseOptionalNumber(query.max_enrichment_age_days),
      estimatedCategory:
        typeof query.estimated_category === "string"
          ? query.estimated_category
          : undefined,
      estimatedType:
        typeof query.estimated_type === "string" ? query.estimated_type : undefined,
      minCountryConfidence:
        typeof query.min_country_confidence === "string"
          ? normalizeLocaleConfidence(query.min_country_confidence)
          : undefined,
      minLanguageConfidence:
        typeof query.min_language_confidence === "string"
          ? normalizeLocaleConfidence(query.min_language_confidence)
          : undefined,
      emailFound: parseOptionalBoolean(query.email_found),
      sort: typeof query.sort === "string" ? query.sort : undefined,
      sortDir: typeof query.sort_dir === "string" ? query.sort_dir : undefined,
      page: parseOptionalNumber(query.page),
      perPage: parseOptionalNumber(query.per_page)
    };

    return listCatalogChannels(filters);
  });

  app.get("/channels/:channelId", async (request, reply) => {
    const { channelId } = request.params as { channelId: string };
    const channel = await getCatalogChannelById(channelId);

    if (!channel) {
      return reply.status(404).send({ error: "Channel not found" });
    }

    return channel;
  });
}
