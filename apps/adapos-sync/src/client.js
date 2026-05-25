import { syncConfig } from "./config.js";

export async function postJson(url, payload) {
  const headers = { "Content-Type": "application/json" };
  if (syncConfig.syncSharedToken && /\/api\/branch-stock\/sync$/i.test(url)) {
    headers.Authorization = `Bearer ${syncConfig.syncSharedToken}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} — ${text.slice(0, 300)}`);
  }
  return JSON.parse(text);
}
