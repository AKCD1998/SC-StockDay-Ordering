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

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
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
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} — ${text.slice(0, 300)}`);
  }
  return JSON.parse(text);
}

export async function getJson(url) {
  const response = await fetchWithTimeout(url, { method: "GET", headers: authHeaders() });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} — ${text.slice(0, 300)}`);
  }
  return JSON.parse(text);
}
