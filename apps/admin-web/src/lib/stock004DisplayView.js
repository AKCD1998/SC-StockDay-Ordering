const validTime = value => typeof value === "string" && Number.isFinite(Date.parse(value));

// A reference has its own field. It must never become qtyBranch004 or a total.
export function stock004DisplayView(row) {
  const stock = row?.stock004;
  const reference = stock?.lastConfirmed;
  const lastConfirmed = reference && typeof reference.quantity === "number" && Number.isFinite(reference.quantity)
    && validTime(reference.observedAt) && validTime(reference.fetchedAt) && reference.stale === true
    ? reference : null;
  const status = stock?.viewStatus;
  if (status === "reference") return { status: lastConfirmed ? "reference" : "unverified", quantity: null, lastConfirmed };
  if (status === "unverified" || stock?.basis === "shopee-availability-unknown") return { status: "unverified", quantity: null, lastConfirmed };
  const quantity = typeof row?.qtyBranch004 === "number" && Number.isFinite(row.qtyBranch004) ? row.qtyBranch004 : null;
  if (quantity === null) return { status: "unverified", quantity: null, lastConfirmed };
  if (stock?.basis === "hourly-and-shopee-known-only") return { status: "known-only", quantity, lastConfirmed: null };
  return { status: "confirmed", quantity, lastConfirmed: null };
}
