import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaMssql } from "@prisma/adapter-mssql";
import { parseSqlServerUrl } from "./db/connectionString";
import { retryOnTransientSqlError } from "./db/azureSqlRetry";

// Azure SQL Database serverless (free tier) auto-pauses after inactivity and
// auto-resumes on the next request — see lib/db/azureSqlRetry.ts and
// README.md "Perché Azure SQL Database" for why the retry wrapper below
// exists.
const adapter = new PrismaMssql(parseSqlServerUrl(process.env.DATABASE_URL ?? ""));

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Avoid exhausting the connection pool with a new client per hot-reload in
// dev. $extends() below is cheap (no new connection), so it's fine to apply
// on every import — only the underlying PrismaClient+adapter is cached.
const basePrisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = basePrisma;
}

export const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      $allOperations({ query, args }) {
        return retryOnTransientSqlError(() => query(args));
      },
    },
  },
});
