import { buildServer } from "./server";
import "dotenv/config";

const app = buildServer();

const port = Math.max(1, Math.min(Number(process.env.PORT ?? 3000), 65535));
const host = process.env.HOST ?? "0.0.0.0";

app
  .listen({ port, host })
  .then(() => {
    app.log.info({ port, host }, "API running");
  })
  .catch((err) => {
    app.log.error({ err }, "Failed to start server");
    process.exit(1);
  });
