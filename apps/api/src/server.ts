import Fastify from "fastify";
import cors from "@fastify/cors";
import { randomUUID } from "node:crypto";
import { runsRoutes } from "./routes/runs";

export function buildServer() {
  const serverId = (process.env.SERVER_ID ?? randomUUID()).slice(0, 8);

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      base: { serverId }
    }
  });

  const allowedOrigins = [
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}:3001$/,
    /^http:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}:3001$/,
    /^http:\/\/172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}:3001$/
  ];

  // ✅ CORS — REQUIRED for browser UI
  app.register(cors, {
    origin: allowedOrigins
  });

  app.get("/api/health", async () => {
    return { ok: true, status: "ok", serverId };
  });

  app.register(runsRoutes);

  return app;
}
