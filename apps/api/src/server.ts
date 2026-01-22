import Fastify from "fastify";

export function buildServer() {
  const app = Fastify({ logger: true });

  app.get("/api/health", async () => {
    return { status: "ok" };
  });

  return app;
}