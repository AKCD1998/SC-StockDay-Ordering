import { syncConfig } from "./config.js";

// A stalled backend response (Render cold start, network stall, etc.) must
// never hang forever — the scheduled task's MultipleInstancesPolicy is
// "IgnoreNew", so a hung run silently blocks every later run (including the
// next day's) until someone manually kills the process. Aborting after a
// bounded timeout guarantees the run always finishes and reports its actual
// success/failure to the run-log.
const REQUEST_TIMEOUT_MS = Number(process.env.ADAPOS_SYNC_REQUEST_TIMEOUT_MS) || 60_000;

function authHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (syncConfig.syncSharedToken) {
    headers.Authorization = `Bearer ${syncConfig.syncSharedToken}`;
    headers["x-api-key"] = syncConfig.syncSharedToken;
  }
  return headers;
}

// Guards the whole request lifecycle — connecting, waiting on headers, AND
// reading the response body — under one bounded timeout. A signal passed to
// fetch() also aborts an in-progress body read (per the Fetch spec), so
// keeping the timer alive until text() resolves is what actually makes a
// slow-to-stream response abort instead of hanging forever.
async function requestWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    return { response, text };
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function postJson(url, payload) {
  const { response, text } = await requestWithTimeout(url, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} — ${text.slice(0, 300)}`);
  }
  return JSON.parse(text);
}

export async function getJson(url) {
  const { response, text } = await requestWithTimeout(url, { method: "GET", headers: authHeaders() });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} — ${text.slice(0, 300)}`);
  }
  return JSON.parse(text);
}
