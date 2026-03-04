import { buildServer } from "./server";
import "dotenv/config";
import { startAutoScheduler } from "./jobs/auto-scheduler";

const app = buildServer();

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

async function start() {
  try {
    await app.listen({ host, port });
    startAutoScheduler(app);
    app.log.info({ host, port }, "API running");
  } catch (err) {
    app.log.error({ err }, "Failed to start server");
    process.exit(1);
  }
}

start();
