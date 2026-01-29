import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { runsRoutes } from "./routes/runs";

export function buildServer() {
  // Step 10.9: identify which process handled a request
  const serverId = (process.env.SERVER_ID ?? randomUUID()).slice(0, 8);

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      base: { serverId }
    }
  });

  app.get("/api/health", async () => {
    return { status: "ok", serverId };
  });

  app.register(runsRoutes);

  return app;
}