import { buildServer } from "./server";

const app = buildServer();

const port = Math.max(1, Math.min(Number(process.env.PORT ?? 3000), 65535));
const host = process.env.HOST ?? "127.0.0.1";
console.log("BOOT", { PORT: process.env.PORT, SERVER_ID: process.env.SERVER_ID, HOST: process.env.HOST });

app
  .listen({ port, host })
  .then(() => {
    app.log.info({ port, host }, "API running");
  })
  .catch((err) => {
    app.log.error({ err }, "Failed to start server");
    process.exit(1);
  });