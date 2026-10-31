// Preview reference policy. No production reader imports this module.
export const POLICY = Object.freeze({ human: 4 * 3600000, hourly: 90 * 60000, full: 24 * 3600000 });
export function resolveStock({ human, hourly, full, now = Date.now() }) {
  const skipped = [];
  for (const [source, row] of [['human', human], ['hourly', hourly], ['full', full]]) {
    let reason = null;
    const at = Date.parse(row?.observedAt);
    if (!row) reason = 'missing';
    else if (typeof row.quantity !== 'number' || !Number.isFinite(row.quantity)) reason = 'invalid';
    else if (!Number.isFinite(at) || at > now) reason = 'invalid-time';
    else if (now - at > POLICY[source]) reason = 'stale';
    else if (row.eligible !== true) reason = 'unverified';
    else if (source === 'human' && (row.status !== 'synced' || !row.complete)) reason = 'incomplete-or-pending';
    // Without complete post-count movements, a newer machine observation makes
    // the older count historical. Do not keep a 4-hour-old count above fresh hourly.
    else if (source === 'human' && [hourly, full].some(r => r?.eligible === true && Number.isFinite(Date.parse(r.observedAt)) && Date.parse(r.observedAt) <= now && Date.parse(r.observedAt) > at)) reason = 'newer-observation';
    if (reason) { skipped.push({ source, reason }); continue; }
    return { source, quantity: row.quantity, observedAt: row.observedAt, skipped };
  }
  return { source: 'unknown', quantity: null, observedAt: null, skipped };
}

export function validateCount({ lots, complete, observedAt }, now = Date.now()) {
  const errors = [];
  if (!Array.isArray(lots) || !lots.length) return ['เพิ่มอย่างน้อย 1 ล็อต หรือเลือกยืนยันยอดศูนย์'];
  const seen = new Set();
  const captured = Date.parse(observedAt);
  if (!Number.isFinite(captured) || captured > now + 60000) errors.push('เวลานับไม่ถูกต้อง');
  for (const [i, lot] of lots.entries()) {
    const label = `ล็อต ${i + 1}`;
    if (!lot.code?.trim()) errors.push(`${label}: ระบุเลขที่ผลิต หรือเลือกไม่ทราบ`);
    if (typeof lot.quantity !== 'number' || !Number.isFinite(lot.quantity) || lot.quantity < 0 || lot.quantity > 1e9) errors.push(`${label}: จำนวนต้องเป็น 0 ขึ้นไปและไม่เกิน 1,000,000,000`);
    for (const key of ['mfg', 'exp']) {
      const value = lot[key];
      if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) errors.push(`${label}: วันที่ไม่ถูกต้อง`);
    }
    if (lot.mfg && lot.exp && lot.mfg > lot.exp) errors.push(`${label}: วันหมดอายุต้องไม่ก่อนวันผลิต`);
    if (lot.mfg && lot.mfg > new Date(now + 7 * 3600000).toISOString().slice(0, 10)) errors.push(`${label}: วันผลิตอยู่ในอนาคต`);
    const key = `${lot.code.trim()}|${lot.mfg || ''}|${lot.exp || ''}`;
    if (seen.has(key)) errors.push(`${label}: ล็อตซ้ำ กรุณารวมจำนวนในแถวเดียว`);
    seen.add(key);
  }
  if (typeof complete !== 'boolean') errors.push('ระบุขอบเขตการนับ');
  return errors;
}

// The receipt represents one absolute count, never an additive stock movement.
// Retries reuse the same event ID; optimistic revision prevents last-writer-wins.
export function syncOutbox(events, revisions) {
  const nextRevisions = { ...revisions };
  const ordered = [...events].sort((a,b) => a.observedAt.localeCompare(b.observedAt));
  const outcomes = new Map();
  for (const event of ordered) {
    if (event.status !== 'pending') continue;
    const current = nextRevisions[event.productCode] || 0;
    if (current !== event.baseRevision) outcomes.set(event.id, 'conflict');
    else { nextRevisions[event.productCode] = current + 1; outcomes.set(event.id, 'synced'); }
  }
  return { events: events.map(e => outcomes.has(e.id) ? { ...e, status: outcomes.get(e.id) } : e), revisions: nextRevisions };
}
