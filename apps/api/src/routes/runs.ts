import { FastifyInstance } from "fastify";
import { RunRequestSchema } from "../schemas/run.schema";
import { scoreChannel } from "../domain/score";
import { passesFilters } from "../domain/filter";
import { ChannelMetrics } from "../domain/types";

export async function runsRoutes(app: FastifyInstance) {
  app.post("/api/runs", async (request, reply) => {
    const parseResult = RunRequestSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Invalid request",
        details: parseResult.error.format()
      });
    }

    const validatedInput = parseResult.data;

    // Placeholder: logic will be added later
    return {
      run_id: "mock-run-id",
      status: "completed",
      input: validatedInput
    };
  });

  app.get("/api/runs/:runId", async () => {
    const mockChannel: ChannelMetrics = {
      channelId: "UCxxxx",
      channelName: "Example Channel",
      channelUrl: "https://youtube.com/channel/UCxxxx",
      subscriberCount: 120000,
      avgViewsLastN: 15400,
      daysSinceLastUpload: 4,
      recentViews: [16000, 15000, 14500, 15800, 15500]
    };

    const filters = {
      minAvgViews: 8000,
      maxDaysSinceUpload: 30
    };

    if (!passesFilters(mockChannel, filters)) {
      return {
        run_id: "mock-run-id",
        created_at: new Date().toISOString(),
        results: []
      };
    }

    const scored = scoreChannel(mockChannel);

    return {
      run_id: "mock-run-id",
      created_at: new Date().toISOString(),
      results: [scored]
    };
  });

  app.get("/api/runs/:runId/export", async (request, reply) => {
    const { format } = request.query as { format?: string };

    if (format === "csv") {
      reply.header("Content-Type", "text/csv");
      reply.send("channel_name,final_score\nExample Channel,83");
      return;
    }

    return {
      message: "Export format not implemented yet",
      available_formats: ["csv", "json"]
    };
  });
}