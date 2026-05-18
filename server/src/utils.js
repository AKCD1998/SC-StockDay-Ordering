import crypto from "node:crypto";

export function normalizeQuery(value = "") {
  return String(value).trim().toLowerCase();
}

export function makeId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function safeDivide(numerator, denominator) {
  if (!denominator) return 0;
  return numerator / denominator;
}

export function round2(value) {
  return Number(value.toFixed(2));
}

export function parsePositiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}
