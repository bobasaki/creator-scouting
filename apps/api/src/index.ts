import path from "node:path";
import dotenv from "dotenv";

// index.ts is in apps/api/src, so .env is at apps/api/.env
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { buildServer } from "./server";

const server = buildServer();

const start = async () => {
  try {
    await server.listen({ port: 3000 });
    console.log("API running on http://localhost:3000");
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();