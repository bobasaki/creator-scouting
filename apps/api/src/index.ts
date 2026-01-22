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