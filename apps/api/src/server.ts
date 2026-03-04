import Fastify from "fastify";
import cors from "@fastify/cors";
import { randomUUID } from "node:crypto";
import { adminRoutes } from "./routes/admin";
import { channelsRoutes } from "./routes/channels";
import { runsRoutes } from "./routes/runs";
import { segmentsRoutes } from "./routes/segments";

const corsAllowedOrigins = new Set(
  (
    process.env.CORS_ALLOWED_ORIGINS ??
    "http://localhost:3001,http://127.0.0.1:3001"
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

export function buildServer() {
  const serverId = (process.env.SERVER_ID ?? randomUUID()).slice(0, 8);

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      base: { serverId }
    }
  });

  // Browser access to the API is optional; the default UI path uses the Next.js proxy.
  app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // allow curl / non-browser

      if (corsAllowedOrigins.has(origin)) {
        return cb(null, true);
      }

      return cb(null, false);
    },
    methods: ["GET", "POST", "OPTIONS", "HEAD"],
    allowedHeaders: ["Content-Type"]
  });

  app.get("/api/health", async () => {
    return { ok: true, status: "ok", serverId };
  });

  app.register(channelsRoutes);
  app.register(runsRoutes);
  app.register(segmentsRoutes);
  app.register(adminRoutes);

  return app;
}
