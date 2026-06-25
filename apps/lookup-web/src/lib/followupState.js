const STORAGE_KEY = "cipdata.followup-statuses.v1";

function readMap() {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeMap(value) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function readFollowupStatuses() {
  return readMap();
}

export function saveFollowupStatus(key, value) {
  const current = readMap();
  current[key] = {
    ...value,
    updatedAt: new Date().toISOString(),
  };
  writeMap(current);
  return current;
}

export function clearFollowupStatus(key) {
  const current = readMap();
  delete current[key];
  writeMap(current);
  return current;
}

export function exportFollowupStatuses() {
  return JSON.stringify(readMap(), null, 2);
}

export function buildFollowupStatusKey(record) {
  return `${record.encounterId}::${record.followupCall || record.encounterAt || ""}`;
}
