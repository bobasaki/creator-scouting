import Fastify from "fastify";
import { runsRoutes } from "./routes/runs";

export function buildServer() {
  const app = Fastify({ logger: true });

  app.get("/api/health", async () => {
    return { status: "ok" };
  });

  app.register(runsRoutes);

  return app;
}