import type { config as MssqlConfig } from "mssql";

/**
 * Parses Prisma's documented SQL Server connection string format —
 * `sqlserver://HOST:PORT;database=DB;user=USER;password=PASS;encrypt=true;trustServerCertificate=true`
 * (see prisma.config.ts / .env.example) — into the `mssql` package's config
 * object shape needed by `@prisma/adapter-mssql` at runtime (lib/prisma.ts).
 *
 * Why parse instead of keeping two separate env vars: Prisma's CLI (schema
 * migrations, `prisma generate`) reads `DATABASE_URL` as a single connection
 * string via prisma.config.ts, while the driver adapter wants a structured
 * object. Parsing keeps ONE value as the source of truth instead of two
 * that could silently drift out of sync.
 */
export function parseSqlServerUrl(rawUrl: string): MssqlConfig {
  // Defensive against the most common copy-paste mistake: pasting a value
  // straight out of a .env file (`KEY="value"`) INCLUDING the quotes into a
  // plain-value field (e.g. an Azure App Service Application Setting) — the
  // literal quote character then becomes part of the "host", which fails
  // with a confusing getaddrinfo ENOTFOUND error far from this file.
  const url = rawUrl.trim().replace(/^["']|["']$/g, "");

  const withoutScheme = url.replace(/^sqlserver:\/\//i, "");
  const [hostPort, ...params] = withoutScheme.split(";").filter(Boolean);

  if (!hostPort) {
    throw new Error(`Invalid SQL Server connection string: missing host in "${url}"`);
  }

  const [server, portRaw] = hostPort.split(":");

  const options: Record<string, string> = {};
  for (const param of params) {
    const eq = param.indexOf("=");
    if (eq === -1) continue;
    const key = param.slice(0, eq).trim().toLowerCase();
    const value = param.slice(eq + 1).trim();
    options[key] = value;
  }

  if (!server) {
    throw new Error(`Invalid SQL Server connection string: missing host in "${url}"`);
  }
  if (!options.database) {
    throw new Error(`Invalid SQL Server connection string: missing "database" in "${url}"`);
  }
  if (!options.user) {
    throw new Error(`Invalid SQL Server connection string: missing "user" in "${url}"`);
  }
  if (!options.password) {
    throw new Error(`Invalid SQL Server connection string: missing "password" in "${url}"`);
  }

  return {
    server,
    port: portRaw ? Number(portRaw) : 1433,
    database: options.database,
    user: options.user,
    password: options.password,
    options: {
      encrypt: options.encrypt !== "false", // Azure requires this — default to on
      trustServerCertificate: options.trustservercertificate === "true",
    },
  };
}
