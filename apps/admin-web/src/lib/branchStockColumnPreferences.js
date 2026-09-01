const STORAGE_PREFIX = "sc-stockday-branch-stock-column-order:v1";

function getDefaultColumnKeys(columns) {
  return columns.map((column) => column.key);
}

export function normalizeBranchStockColumnOrder(savedOrder, columns) {
  const defaultKeys = getDefaultColumnKeys(columns);
  if (!Array.isArray(savedOrder)) return defaultKeys;

  const validKeys = new Set(defaultKeys);
  const normalized = [];
  const seen = new Set();

  savedOrder.forEach((key) => {
    if (typeof key !== "string" || !validKeys.has(key) || seen.has(key)) return;
    normalized.push(key);
    seen.add(key);
  });

  defaultKeys.forEach((key) => {
    if (!seen.has(key)) normalized.push(key);
  });

  return normalized;
}

export function reorderBranchStockColumn(order, sourceKey, targetKey) {
  const sourceIndex = order.indexOf(sourceKey);
  const targetIndex = order.indexOf(targetKey);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return [...order];

  const nextOrder = [...order];
  const [movedKey] = nextOrder.splice(sourceIndex, 1);
  nextOrder.splice(targetIndex, 0, movedKey);
  return nextOrder;
}

export function moveBranchStockColumn(order, key, direction) {
  const sourceIndex = order.indexOf(key);
  const targetIndex = sourceIndex + direction;
  if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= order.length) return [...order];

  const nextOrder = [...order];
  [nextOrder[sourceIndex], nextOrder[targetIndex]] = [nextOrder[targetIndex], nextOrder[sourceIndex]];
  return nextOrder;
}

export function getBranchStockColumnStorageKey(userId) {
  const normalizedUserId = String(userId || "").trim().toLowerCase();
  return normalizedUserId ? `${STORAGE_PREFIX}:${encodeURIComponent(normalizedUserId)}` : "";
}

export function loadBranchStockColumnOrder(storage, userId, columns) {
  const defaultKeys = getDefaultColumnKeys(columns);
  const storageKey = getBranchStockColumnStorageKey(userId);
  if (!storage || !storageKey) return defaultKeys;

  try {
    return normalizeBranchStockColumnOrder(JSON.parse(storage.getItem(storageKey)), columns);
  } catch {
    return defaultKeys;
  }
}

export function saveBranchStockColumnOrder(storage, userId, order, columns) {
  const storageKey = getBranchStockColumnStorageKey(userId);
  if (!storage || !storageKey) return false;

  try {
    const normalized = normalizeBranchStockColumnOrder(order, columns);
    storage.setItem(storageKey, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

export function clearBranchStockColumnOrder(storage, userId) {
  const storageKey = getBranchStockColumnStorageKey(userId);
  if (!storage || !storageKey) return false;

  try {
    storage.removeItem(storageKey);
    return true;
  } catch {
    return false;
  }
}
