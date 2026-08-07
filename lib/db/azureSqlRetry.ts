/**
 * Azure SQL Database serverless (free tier) auto-pauses after inactivity and
 * auto-resumes on the next request. Microsoft's own docs describe this as
 * producing "predictable transient connectivity errors" on the request that
 * triggers the resume — see README.md "Perché Azure SQL Database" and
 * https://learn.microsoft.com/en-us/azure/azure-sql/database/troubleshoot-common-errors-issues
 *
 * These are the standard "Azure SQL transient error" numbers worth a short
 * retry for, plus the connection-level error codes the mssql/tedious driver
 * surfaces while the database is waking up.
 */
const TRANSIENT_SQL_ERROR_NUMBERS = new Set([
  4060, 40197, 40501, 40613, 49918, 49919, 49920, 4221, 10928, 10929, 617, 233,
]);

const TRANSIENT_CONNECTION_CODES = new Set(["ETIMEDOUT", "ECONNRESET", "ESOCKET", "ECONNCLOSED"]);

export function isTransientSqlError(error: unknown): boolean {
  const err = error as {
    number?: number;
    code?: string;
    originalError?: { info?: { number?: number } };
  };

  const errorNumber = err?.number ?? err?.originalError?.info?.number;
  if (typeof errorNumber === "number" && TRANSIENT_SQL_ERROR_NUMBERS.has(errorNumber)) {
    return true;
  }

  return typeof err?.code === "string" && TRANSIENT_CONNECTION_CODES.has(err.code);
}

export async function retryOnTransientSqlError<T>(
  fn: () => Promise<T>,
  { attempts = 3, baseDelayMs = 300 }: { attempts?: number; baseDelayMs?: number } = {}
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !isTransientSqlError(error)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * attempt));
    }
  }

  // Unreachable (loop always returns or throws), but keeps TypeScript happy.
  throw lastError;
}
