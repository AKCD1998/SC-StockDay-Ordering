import { apiFetch } from "./apiClient.js";

const ROOT = "/admin/shopee004";
const ISSUE_CLASSES = new Set(["identity", "unit", "lifecycle", "temporary"]);
const EVIDENCE_KINDS = new Set(["seller_catalog", "seller_description", "pos_unit", "owner_unit", "reviewed_stock_rule", "source_item", "retained_contract"]);
const APPROVAL_EVIDENCE_KINDS = new Set(["seller_catalog", "seller_description", "pos_unit", "owner_unit", "reviewed_stock_rule"]);
const QUANTITY_EVIDENCE_KINDS = new Set(["seller_description", "owner_unit", "reviewed_stock_rule"]);
const ERROR_MESSAGES = {
  REVISION_CONFLICT: "ข้อมูลเปลี่ยนแล้ว กรุณาอ่านใหม่ก่อนยืนยัน",
  RULE_VERSION_CONFLICT: "กฎนี้มีรุ่นใหม่แล้ว กรุณาอ่านใหม่ก่อนยกเลิก",
  INVALID_REQUEST: "ตรวจรายการสินค้า หน่วย และหลักฐานอีกครั้ง",
  UNIT_EVIDENCE_REQUIRED: "ต้องมีหลักฐานหน่วยก่อนยืนยัน",
  LIFECYCLE_REVIEW_REQUIRED: "ต้องตรวจการส่งหรือคืนสินค้าแยกจากการจับคู่",
  BRIDGE_UNAVAILABLE: "ช่องทางจัดการข้อยกเว้นยังไม่พร้อม",
  STOCK_EXCEPTION_ADMIN_DISABLED: "หน้าจัดการข้อยกเว้นยังไม่ได้เปิดใช้งาน",
  FORBIDDEN: "บัญชีนี้ไม่มีสิทธิ์จัดการข้อยกเว้น",
  UNAUTHORIZED: "กรุณาเข้าสู่ระบบใหม่",
  INVALID_RESPONSE: "ข้อมูลตอบกลับไม่ครบ จึงยังยืนยันผลไม่ได้",
  TEMPORARY_UNAVAILABLE: "ติดต่อระบบไม่ได้ชั่วคราว ลองอ่านใหม่ได้",
  OUTCOME_UNKNOWN: "ยังยืนยันผลการบันทึกไม่ได้ อย่าสร้างคำขอใหม่ ให้ตรวจหรือส่งคำขอเดิมซ้ำ",
};

export class StockExceptionError extends Error {
  constructor(code, { outcomeUnknown = false } = {}) {
    super(ERROR_MESSAGES[code] || "ดำเนินการไม่สำเร็จ กรุณาตรวจข้อมูลอีกครั้ง");
    this.code = code;
    this.outcomeUnknown = outcomeUnknown;
  }
}

const text = (value, max = 300) => typeof value === "string" && value.trim().length > 0 && value.length <= max;
const count = value => Number.isSafeInteger(value) && value >= 0;
const stamp = value => typeof value === "string" && Number.isFinite(Date.parse(value));
const opaque = value => text(value, 200);
const ruleVersion = value => text(value, 100) || count(value);
const positive = value => Number.isSafeInteger(value) && value >= 1 && value <= 10000;
const displayText = (value, max = 500) => typeof value === "string" && value.length <= max;

export function isApprovalEvidence(evidence) {
  return APPROVAL_EVIDENCE_KINDS.has(evidence?.kind) && stamp(evidence.verifiedAt);
}

function validEvidence(evidence) {
  return evidence && EVIDENCE_KINDS.has(evidence.kind) && opaque(evidence.reference) && displayText(evidence.label)
    && (evidence.verifiedAt == null || stamp(evidence.verifiedAt));
}

function validMatch(match) {
  return match && text(match.productCode, 100) && displayText(match.productName) && text(match.unit, 80)
    && positive(match.quantityPerSale) && Array.isArray(match.evidenceRefs) && match.evidenceRefs.every(opaque);
}

function validRecord(record) {
  return record && opaque(record.exceptionId) && opaque(record.revision)
    && (record.listingId == null || opaque(record.listingId))
    && (record.variationId == null || opaque(record.variationId))
    && displayText(record.productName) && displayText(record.variantName)
    && text(record.reasonCode, 100) && ISSUE_CLASSES.has(record.issueClass)
    && (record.observedUnit == null || text(record.observedUnit, 100))
    && count(record.affectedOrders) && typeof record.canApproveMapping === "boolean"
    && typeof record.requiresLifecycleReview === "boolean"
    && Array.isArray(record.proposedMatches) && record.proposedMatches.length <= 50 && record.proposedMatches.every(validMatch)
    && Array.isArray(record.evidence) && record.evidence.length <= 50 && record.evidence.every(validEvidence)
    && (record.ruleId == null || opaque(record.ruleId))
    && (record.ruleVersion == null || ruleVersion(record.ruleVersion))
    && (record.auditHistory == null || (Array.isArray(record.auditHistory) && record.auditHistory.length <= 100
      && record.auditHistory.every(entry => entry && text(entry.action, 80) && stamp(entry.at)
        && (entry.ruleVersion == null || ruleVersion(entry.ruleVersion)) && (entry.reason == null || displayText(entry.reason, 200)))))
    && (record.recovery == null || ([null, "ready", "retry_wait", "blocked"].includes(record.recovery.state)
      && count(record.recovery.attempts) && ["nextRetryAt", "firstFailedAt", "lastFailedAt"].every(key => record.recovery[key] == null || stamp(record.recovery[key]))));
}

export function validateExceptionsResponse(value) {
  if (!value || value.schemaVersion !== "shopee004-exceptions-v1" || value.branchCode !== "004"
    || !stamp(value.asOf) || !["available", "unavailable"].includes(value.status)
    || (value.unreadableRecords != null && !count(value.unreadableRecords))
    || !Array.isArray(value.records) || value.records.length > 100 || !value.records.every(validRecord)
    || new Set(value.records.map(row => row.exceptionId)).size !== value.records.length
    || typeof value.pagination?.hasMore !== "boolean"
    || (value.pagination.hasMore && !opaque(value.pagination.nextCursor))) throw new StockExceptionError("INVALID_RESPONSE");
  return value;
}

export function validateReconciliationResponse(value) {
  if (!value || typeof value.openingBoundaryPreserved !== "boolean" || !stamp(value.cutoverAt)
    || !text(value.openingBasisQuality, 100) || typeof value.physicalStockVerified !== "boolean"
    || ![value.reservedOrders, value.shippedUnpostedOrders, value.reviewOrders].every(count)
    || typeof value.requiresCountReconciliation !== "boolean") throw new StockExceptionError("INVALID_RESPONSE");
  return value;
}

function safeHttpError(status, body) {
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 409) return body?.error?.code === "RULE_VERSION_CONFLICT" ? "RULE_VERSION_CONFLICT" : "REVISION_CONFLICT";
  return Object.hasOwn(ERROR_MESSAGES, body?.error?.code) ? body.error.code : status >= 500 ? "TEMPORARY_UNAVAILABLE" : "INVALID_REQUEST";
}

async function request(path, { body, csrfToken, signal, timeoutMs = 8000 } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  let response;
  try {
    response = await apiFetch(`${ROOT}${path}`, {
      method: body ? "POST" : "GET", signal: controller.signal,
      ...(body ? { headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken || "" }, body: JSON.stringify(body) } : {}),
    });
    let payload;
    try { payload = await response.json(); } catch { throw new StockExceptionError(body ? "OUTCOME_UNKNOWN" : "INVALID_RESPONSE", { outcomeUnknown: Boolean(body) }); }
    if (!response.ok) {
      const definitiveNoWrite = payload?.definitiveNoWrite === true && payload?.error?.definitiveNoWrite === true
        && ["BRIDGE_UNAVAILABLE", "STOCK_EXCEPTION_ADMIN_DISABLED"].includes(payload?.error?.code);
      const uncertain = Boolean(body && response.status >= 500 && !definitiveNoWrite);
      throw new StockExceptionError(uncertain ? "OUTCOME_UNKNOWN" : safeHttpError(response.status, payload), { outcomeUnknown: uncertain });
    }
    return payload;
  } catch (error) {
    if (error instanceof StockExceptionError) throw error;
    if (!body && signal?.aborted) throw new DOMException("Aborted", "AbortError");
    throw new StockExceptionError(body ? "OUTCOME_UNKNOWN" : "TEMPORARY_UNAVAILABLE", { outcomeUnknown: Boolean(body) });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export function createOperationId() {
  if (typeof globalThis.crypto?.randomUUID !== "function") throw new StockExceptionError("INVALID_REQUEST");
  return globalThis.crypto.randomUUID();
}

export async function readStockExceptions({ cursor, signal } = {}) {
  const query = new URLSearchParams({ limit: "25" });
  if (cursor) query.set("cursor", cursor);
  return validateExceptionsResponse(await request(`/stock-exceptions?${query}`, { signal }));
}

export async function readStockReconciliation({ signal } = {}) {
  return validateReconciliationResponse(await request("/stock-reconciliation", { signal }));
}

export function makeMappingRequest(record, selectedMatches, evidenceRefs, acknowledgeUnitEvidence, operationId) {
  if (!record.canApproveMapping || !["identity", "unit"].includes(record.issueClass)
    || !opaque(record.listingId) || !opaque(record.variationId) || !opaque(operationId) || !acknowledgeUnitEvidence
    || !selectedMatches.length || selectedMatches.length > 20 || evidenceRefs.length < 2 || evidenceRefs.length > 50
    || selectedMatches.length !== record.proposedMatches.length
    || new Set(selectedMatches.map(row => row.productCode)).size !== selectedMatches.length
    || new Set(evidenceRefs).size !== evidenceRefs.length
    || evidenceRefs.some(ref => !record.evidence.some(e => e.reference === ref && isApprovalEvidence(e)))
    || !record.evidence.some(e => evidenceRefs.includes(e.reference) && e.kind === "seller_catalog" && isApprovalEvidence(e))
    || !record.evidence.some(e => evidenceRefs.includes(e.reference) && QUANTITY_EVIDENCE_KINDS.has(e.kind) && isApprovalEvidence(e))
    || !record.evidence.some(e => evidenceRefs.includes(e.reference) && e.kind === "pos_unit" && isApprovalEvidence(e))
    || selectedMatches.some(row => !positive(Number(row.quantityPerSale)) || !record.proposedMatches.some(candidate => candidate.productCode === row.productCode && candidate.unit === row.unit && candidate.quantityPerSale === Number(row.quantityPerSale)
      && candidate.evidenceRefs.length > 0 && candidate.evidenceRefs.every(ref => evidenceRefs.includes(ref))))) throw new StockExceptionError("UNIT_EVIDENCE_REQUIRED");
  return { operationId, expectedRevision: record.revision, listingId: record.listingId,
    variationId: record.variationId ?? null,
    components: selectedMatches.map(row => ({ productCode: row.productCode, quantityPerSale: Number(row.quantityPerSale), unit: row.unit })),
    evidenceRefs, acknowledgeUnitEvidence: true };
}

export async function approveStockMapping(exceptionId, body, csrfToken) {
  const payload = await request(`/stock-exceptions/${encodeURIComponent(exceptionId)}/mapping`, { body, csrfToken });
  if (typeof payload?.recorded !== "boolean" || typeof payload?.duplicate !== "boolean" || !opaque(payload.ruleId)
    || !ruleVersion(payload.ruleVersion) || !count(payload.requeuedOrders) || (!payload.recorded && !payload.duplicate)
    || (payload.requeuePending != null && typeof payload.requeuePending !== "boolean")) throw new StockExceptionError("OUTCOME_UNKNOWN", { outcomeUnknown: true });
  return payload;
}

export async function revokeStockRule(ruleId, body, csrfToken) {
  const payload = await request(`/stock-rules/${encodeURIComponent(ruleId)}/revoke`, { body, csrfToken });
  if (typeof payload?.recorded !== "boolean" || typeof payload?.duplicate !== "boolean"
    || (!payload.recorded && !payload.duplicate)) throw new StockExceptionError("OUTCOME_UNKNOWN", { outcomeUnknown: true });
  return payload;
}

export function stockExceptionReasonLabel(code) {
  const key = typeof code === "string" ? code.toLowerCase().replaceAll("-", "_") : "";
  return ({ product_mapping_unverified: "ยังไม่มีคู่สินค้าที่ตรวจยืนยัน", pos_product_missing: "ยังไม่พบรหัสในทะเบียน POS",
    unit_conflict: "หน่วยขัดกัน", quantity_unverified: "จำนวนต่อหน่วยยังไม่ชัด", source_changed: "รายการต้นทางเปลี่ยน ต้องตรวจอีกครั้ง",
    cancelled_without_dispatch_evidence: "ยกเลิกแล้ว แต่หลักฐานการส่งยังไม่ครบ", confirmation_missing: "ยังไม่พบหลักฐานยืนยันคำสั่งซื้อ",
    projection_timeout: "ระบบปลายทางตอบไม่ทัน", temporary_unavailable: "ระบบปลายทางไม่พร้อมชั่วคราว",
    processing_pending: "รายการเปลี่ยนแล้ว กำลังรอประมวลผล", processing_timeout: "ประมวลผลไม่ทันเวลา",
    processing_lock_busy: "ระบบกำลังใช้งานข้อมูลชุดนี้", processing_service_unavailable: "บริการประมวลผลไม่พร้อมชั่วคราว",
    processing_review_required: "หยุดประมวลผลเพื่อรอตรวจเพิ่มเติม", pos_unit_contract_invalid: "นิยามหน่วย POS ไม่ผ่านการตรวจ",
    pos_unit_contract_required: "ยังไม่มีนิยามหน่วย POS ที่ยืนยันแล้ว", projection_scope_invalid: "ขอบเขตข้อมูลที่อ่านยังไม่ผ่านการตรวจ" })[key] || "ต้องตรวจหลักฐานเพิ่มเติม";
}
