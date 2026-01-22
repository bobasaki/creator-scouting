import { FastifyInstance } from "fastify";

export async function runsRoutes(app: FastifyInstance) {
  // POST /api/runs
  app.post("/api/runs", async (request, reply) => {
    return {
      run_id: "mock-run-id",
      status: "completed"
    };
  });

  // GET /api/runs/:runId
  app.get("/api/runs/:runId", async (request, reply) => {
    return {
      run_id: "mock-run-id",
      created_at: new Date().toISOString(),
      parameters: {
        keywords: ["true crime", "mystery"],
        region: "DE",
        language: "de"
      },
      results: [
        {
          channel_id: "UCxxxx",
          channel_name: "Example Channel",
          channel_url: "https://youtube.com/channel/UCxxxx",
          metrics: {
            subscriber_count: 120000,
            avg_views_last_n: 15400,
            days_since_last_upload: 4
          },
          scores: {
            activity_score: 25,
            performance_score: 22,
            consistency_score: 18,
            audience_size_score: 10,
            niche_relevance_score: 8
          },
          final_score: 83
        }
      ]
    };
  });

  // GET /api/runs/:runId/export
  app.get("/api/runs/:runId/export", async (request, reply) => {
    const { format } = request.query as { format?: string };

    if (format === "csv") {
      reply.header("Content-Type", "text/csv");
      reply.send(
        "channel_name,final_score\nExample Channel,83"
      );
      return;
    }

    return {
      message: "Export format not implemented yet",
      available_formats: ["csv", "json"]
    };
  });
}