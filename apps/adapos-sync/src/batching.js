function defaultSleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export function isRetryableRequestError(error) {
  if (error?.code === "REQUEST_TIMEOUT") return true;
  const status = Number(error?.status);
  return status === 429 || (status >= 500 && status <= 599);
}

function retryDelayMs(attempt, baseDelayMs, maxDelayMs, random) {
  const exponential = baseDelayMs * 2 ** (attempt - 1);
  const jitter = Math.floor(random() * Math.min(baseDelayMs, 250));
  return Math.min(maxDelayMs, exponential + jitter);
}

export async function postBatchesWithRetry({
  url,
  records,
  post,
  batchSize = 500,
  extraBody = {},
  operationName = "batch",
  maxAttempts = 1,
  retryBaseDelayMs = 1_000,
  retryMaxDelayMs = 5_000,
  shouldRetry = isRetryableRequestError,
  sleep = defaultSleep,
  random = Math.random,
  logger = console,
}) {
  if (typeof post !== "function") throw new TypeError("post must be a function");
  if (!Number.isInteger(batchSize) || batchSize <= 0) throw new RangeError("batchSize must be a positive integer");
  if (!Number.isInteger(maxAttempts) || maxAttempts <= 0) throw new RangeError("maxAttempts must be a positive integer");

  let sent = 0;
  const batchCount = Math.ceil(records.length / batchSize);

  for (let offset = 0, batchNumber = 1; offset < records.length; offset += batchSize, batchNumber += 1) {
    const batchRecords = records.slice(offset, offset + batchSize);

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await post(url, { ...extraBody, records: batchRecords });
        sent += batchRecords.length;
        break;
      } catch (error) {
        const canRetry = attempt < maxAttempts && shouldRetry(error);
        if (!canRetry) throw error;

        const delayMs = retryDelayMs(attempt, retryBaseDelayMs, retryMaxDelayMs, random);
        logger.warn(
          `WARN: ${operationName} batch ${batchNumber}/${batchCount} attempt ${attempt}/${maxAttempts} failed (${error.message}); retrying in ${delayMs}ms.`,
        );
        await sleep(delayMs);
      }
    }
  }

  return sent;
}
