const RETRYABLE_SQL_CONNECTION_CODES = new Set([
  "ETIMEOUT",
  "ESOCKET",
  "ECONNCLOSED",
]);

const sleep = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));

function errorCodes(error) {
  const codes = [];
  const seen = new Set();
  let current = error;

  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    if (current.code) codes.push(String(current.code).toUpperCase());
    current = current.originalError ?? current.cause;
  }

  return codes;
}

export function isRetryableSqlConnectionError(error) {
  return errorCodes(error).some((code) => RETRYABLE_SQL_CONNECTION_CODES.has(code));
}

export async function connectSqlWithRetry({
  connect,
  config,
  maxAttempts = 3,
  retryBaseDelayMs = 5_000,
  retryMaxDelayMs = 15_000,
  wait = sleep,
  logger = console,
}) {
  if (typeof connect !== "function") throw new TypeError("connect must be a function");
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError("maxAttempts must be a positive integer");
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await connect(config);
    } catch (error) {
      const retryable = isRetryableSqlConnectionError(error);
      if (!retryable || attempt === maxAttempts) throw error;

      const delayMs = Math.min(
        retryMaxDelayMs,
        retryBaseDelayMs * (2 ** (attempt - 1)),
      );
      const code = errorCodes(error)[0] ?? "UNKNOWN";
      logger.warn(
        `WARN: SQL Server connection attempt ${attempt}/${maxAttempts} failed (${code}); retrying in ${delayMs}ms.`,
      );
      await wait(delayMs);
    }
  }

  throw new Error("SQL connection retry loop ended unexpectedly.");
}
