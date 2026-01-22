import { FastifyInstance } from "fastify";
import { RunRequestSchema } from "../schemas/run.schema";

export async function runsRoutes(app: FastifyInstance) {
  app.post("/api/runs", async (request, reply) => {
    reply.header("X-Validation-Handler", "active");
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
    return {
      run_id: "mock-run-id",
      created_at: new Date().toISOString(),
      parameters: {
        keywords: ["true crime", "mystery"],
        region: "DE",
        language: "de"
      },
      results: []
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