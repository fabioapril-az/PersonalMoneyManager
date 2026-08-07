import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaMssql } from "@prisma/adapter-mssql";
import { parseSqlServerUrl } from "./db/connectionString";
import { retryOnTransientSqlError } from "./db/azureSqlRetry";

function createExtendedClient() {
  // Azure SQL Database serverless (free tier) auto-pauses after inactivity
  // and auto-resumes on the next request — see lib/db/azureSqlRetry.ts and
  // README.md "Perché Azure SQL Database" for why the retry wrapper exists.
  const adapter = new PrismaMssql(parseSqlServerUrl(process.env.DATABASE_URL ?? ""));
  const client = new PrismaClient({ adapter });

  return client.$extends({
    query: {
      $allModels: {
        $allOperations({ query, args }) {
          return retryOnTransientSqlError(() => query(args));
        },
      },
    },
  });
}

type ExtendedPrismaClient = ReturnType<typeof createExtendedClient>;

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedPrismaClient | undefined;
};

function getPrisma(): ExtendedPrismaClient {
  // Constructed lazily, on first actual query — NOT at module import time.
  // Next.js evaluates every route module during `next build`'s "Collecting
  // page data" step regardless of whether the route ends up static or
  // dynamic, so a top-level `new PrismaMssql(...)` here would require a
  // valid DATABASE_URL just to build, even for routes that never touch the
  // database. Also avoids opening a connection pool per hot-reload in dev.
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createExtendedClient();
  }
  return globalForPrisma.prisma;
}

// A Proxy so `import { prisma } from "@/lib/prisma"` keeps working exactly
// like a normal PrismaClient (`prisma.expense.findMany(...)`) while every
// property access transparently triggers the lazy construction above.
export const prisma = new Proxy({} as ExtendedPrismaClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getPrisma(), prop, receiver);
  },
});
