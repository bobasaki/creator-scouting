import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import Database from "better-sqlite3";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function makeClient() {
  const url = process.env.DATABASE_URL || "file:./dev.db";

  // Create Prisma adapter with required params
  const adapter = new PrismaBetterSqlite3({
    url,
    // You can add additional options here if needed
  });

  return new PrismaClient({ adapter });
}

export const prisma = global.__prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}