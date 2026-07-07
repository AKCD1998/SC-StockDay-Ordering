import { syncConfig } from "./config.js";

function authHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (syncConfig.syncSharedToken) {
    headers.Authorization = `Bearer ${syncConfig.syncSharedToken}`;
    headers["x-api-key"] = syncConfig.syncSharedToken;
  }
  return headers;
}

export async function postJson(url, payload) {
  const response = await fetch(url, {
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
  const response = await fetch(url, { method: "GET", headers: authHeaders() });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} — ${text.slice(0, 300)}`);
  }
  return JSON.parse(text);
}
