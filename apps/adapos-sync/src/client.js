export async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} — ${text.slice(0, 300)}`);
  }
  return JSON.parse(text);
}
