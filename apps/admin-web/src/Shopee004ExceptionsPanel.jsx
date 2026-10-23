import { useCallback, useEffect, useRef, useState } from "react";
import {
  approveStockMapping, createOperationId, isApprovalEvidence, makeMappingRequest, readStockExceptions,
  readStockReconciliation, revokeStockRule, stockExceptionReasonLabel,
} from "./lib/shopee004ExceptionsClient.js";
import "./Shopee004ExceptionsPanel.css";

const displayTime = value => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : "ยังไม่ยืนยันเวลา";
const number = value => Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString("th-TH") : "—";
const issueLabels = { identity: "จับคู่สินค้า", unit: "หน่วยหรือแพ็ก", lifecycle: "การส่ง / ยกเลิก / คืน", temporary: "ระบบชั่วคราว" };
const auditLabels = { approved: "บันทึกกฎจับคู่", mapping_approved: "บันทึกกฎจับคู่", revoked: "ยกเลิกกฎ", rule_revoked: "ยกเลิกกฎ" };
const revokeReasons = { unit_evidence_changed: "หลักฐานหน่วยหรือแพ็กเปลี่ยน", mapping_incorrect: "คู่สินค้าเดิมไม่ถูกต้อง", listing_changed: "รายการหรือตัวเลือกต้นทางเปลี่ยน" };

function ExceptionCard({ record, csrfToken, readOnly, onChanged, onUncertainChange }) {
  const [selected, setSelected] = useState({});
  const [selectedEvidence, setSelectedEvidence] = useState([]);
  const [attested, setAttested] = useState(false);
  const [revokeReason, setRevokeReason] = useState("");
  const [revokeConfirmed, setRevokeConfirmed] = useState(false);
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const operationBusy = useRef(false);
  const previousRevision = useRef(record.revision);
  useEffect(() => {
    if (previousRevision.current === record.revision) return;
    previousRevision.current = record.revision;
    setAttested(false); setRevokeConfirmed(false);
    setError("ข้อมูลรายการเปลี่ยนแล้ว คงแบบร่างไว้ให้ตรวจ แต่ต้องยืนยันหลักฐานหน่วยอีกครั้ง");
  }, [record.revision]);

  const mappingAllowed = record.canApproveMapping && ["identity", "unit"].includes(record.issueClass)
    && record.itemContext !== "reference-only" && record.itemIssueConfirmed !== false
    && record.listingId && record.variationId && record.proposedMatches.length > 0;
  const matches = record.proposedMatches.filter(match => selected[match.productCode] !== undefined)
    .map(match => ({ ...match, quantityPerSale: selected[match.productCode] }));
  let ready = false;
  try { makeMappingRequest(record, matches, selectedEvidence, attested, "validation-only"); ready = true; } catch { /* Keep the action disabled until explicit evidence is complete. */ }
  const blocked = readOnly || busy || outcomeUnknown || !csrfToken;

  async function perform(operation) {
    if (operationBusy.current) return;
    operationBusy.current = true;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = operation.kind === "mapping"
        ? await approveStockMapping(record.exceptionId, operation.body, csrfToken)
        : await revokeStockRule(record.ruleId, operation.body, csrfToken);
      setPending(null); setOutcomeUnknown(false);
      setMessage(operation.kind === "mapping"
        ? result.requeuePending ? "บันทึกกฎแล้ว · รอ worker รับรายการที่เกี่ยวข้องกลับคิวเดิม" : `บันทึกกฎแล้ว · ให้คิวเดิมตรวจต่อ ${number(result.requeuedOrders)} ออเดอร์`
        : "ยกเลิกกฎแล้ว · เก็บประวัติและยอดถือเดิมไว้ตรวจต่อ");
      onUncertainChange(null);
      onChanged();
    } catch (failure) {
      setError(failure.message);
      const uncertain = failure.outcomeUnknown === true;
      setOutcomeUnknown(uncertain);
      onUncertainChange(uncertain ? record.exceptionId : null);
      if (!uncertain) setPending(null);
      if (["REVISION_CONFLICT", "RULE_VERSION_CONFLICT"].includes(failure.code)) onChanged();
    } finally { operationBusy.current = false; setBusy(false); }
  }

  function approve(event) {
    event.preventDefault();
    if (blocked || !ready) return;
    try {
      const operation = { kind: "mapping", body: makeMappingRequest(record, matches, selectedEvidence, attested, createOperationId()) };
      setPending(operation); perform(operation);
    } catch (failure) { setError(failure.message); }
  }

  function revoke(event) {
    event.preventDefault();
    if (blocked || !record.ruleId || !Object.hasOwn(revokeReasons, revokeReason) || !revokeConfirmed) return;
    try {
      const operation = { kind: "revoke", body: { operationId: createOperationId(), expectedVersion: record.ruleVersion, reason: revokeReason } };
      setPending(operation); perform(operation);
    } catch (failure) { setError(failure.message); }
  }

  return <article className="stock-exception-card" aria-label={`${record.productName || "ยังระบุสินค้าไม่ได้"} · ${record.variantName || "ไม่ระบุตัวเลือก"}`}>
    <header>
      <div><h3>{record.productName || "ยังระบุสินค้าไม่ได้"}</h3><p>{record.variantName || "ไม่ระบุตัวเลือก"}</p></div>
      <span className={`stock-exception-issue issue-${record.issueClass}`}>{issueLabels[record.issueClass]}</span>
    </header>
    {record.itemContext ? <p className={record.itemContext === "reference-only" ? "stock-exception-warning" : "stock-exception-asof"}>
      {record.itemContext === "reference-only" ? "สินค้าอ้างอิง · ยังไม่ยืนยันว่าเป็นสินค้าที่ทำให้เกิดปัญหา จึงยังอนุมัติจับคู่จากรายการนี้ไม่ได้"
        : record.itemContext === "original-issue" ? "รายการเดิมที่พบปัญหา" : "รายการปัจจุบันที่พบปัญหา"}
    </p> : null}
    <p className="stock-exception-reason">{stockExceptionReasonLabel(record.reasonCode)}</p>
    <dl className="stock-exception-facts">
      <div><dt>ออเดอร์ที่เกี่ยวข้อง</dt><dd>{number(record.affectedOrders)}</dd></div>
      <div><dt>หน่วยที่พบ</dt><dd>{record.observedUnit || "ยังไม่ยืนยัน"}</dd></div>
      <div><dt>รุ่นกฎ</dt><dd>{record.ruleVersion ?? "ยังไม่มีกฎ"}</dd></div>
    </dl>
    {record.unresolvedItemCount != null || record.itemReasonCodes?.length ? <details>
      <summary>ขอบเขตรายการที่ต้องตรวจ</summary>
      {record.unresolvedItemCount != null ? <p>ยังมีปัญหา {number(record.unresolvedItemCount)} รายการสินค้าในออเดอร์นี้</p> : null}
      {record.itemReasonCodes?.length ? <ul>{record.itemReasonCodes.map((code, index) => <li key={`${code}-${index}`}>{stockExceptionReasonLabel(code)}</li>)}</ul> : null}
    </details> : null}
    {record.recovery ? <p className="stock-exception-recovery">
      {record.recovery.state === "retry_wait" ? `รอลองใหม่ตามคิวเดิม · ล้มเหลวแล้ว ${number(record.recovery.attempts)} ครั้ง · ครั้งถัดไป ${displayTime(record.recovery.nextRetryAt)}`
        : record.recovery.state === "blocked" ? `หยุดลองซ้ำ · ต้องตรวจหลักฐานหรือแก้ต้นเหตุ · ล้มเหลวแล้ว ${number(record.recovery.attempts)} ครั้ง`
          : record.recovery.state === "ready" ? "คิวเดิมพร้อมตรวจต่อเมื่อ worker ว่าง" : "ยังไม่มีการลองซ้ำที่ยืนยันได้"}
    </p> : null}
    {record.requiresLifecycleReview ? <p className="stock-exception-warning">มีเรื่องการส่ง ยกเลิก หรือคืนที่ต้องตรวจแยก การจับคู่สินค้าจะไม่อนุมัติปลดจองหรือคืนยอด</p> : null}
    <details className="stock-exception-evidence" open={mappingAllowed}>
      <summary>หลักฐานและคู่สินค้าที่เสนอ</summary>
      <ul className="stock-exception-evidence-list">
        {record.evidence.map(evidence => <li key={evidence.reference}>
          {mappingAllowed ? <label><input type="checkbox" disabled={blocked || !isApprovalEvidence(evidence)}
            checked={selectedEvidence.includes(evidence.reference)}
            onChange={event => setSelectedEvidence(current => event.target.checked ? [...current, evidence.reference] : current.filter(ref => ref !== evidence.reference))} />
            {evidence.label}</label> : <span>{evidence.label}</span>}
          <small>{isApprovalEvidence(evidence) ? `ตรวจเมื่อ ${displayTime(evidence.verifiedAt)}` : "ข้อมูลประกอบนี้ใช้อนุมัติหน่วยไม่ได้"}</small>
        </li>)}
        {!record.evidence.length ? <li>ยังไม่มีหลักฐานที่ใช้ยืนยันได้</li> : null}
      </ul>
      {record.proposedMatches.length ? <form onSubmit={approve}>
        <p>ต่อการขาย Shopee 1 หน่วย ต้องยืนยันส่วนประกอบครบตามหลักฐานด้านล่าง คู่ที่เสนอไม่ถือเป็นการอนุมัติ</p>
        <p>ถ้าตัวคูณไม่ตรง ต้องเพิ่มหลักฐานหน่วยที่ถูกต้องก่อน ระบบจะไม่ใช้การแก้ตัวเลขแทนหลักฐาน</p>
        <fieldset disabled={blocked || !mappingAllowed}>
          <legend>สินค้าและตัวคูณหน่วย</legend>
          {record.proposedMatches.map((match, index) => <div className="stock-exception-match" key={`${match.productCode}-${index}`}>
            <label><input type="checkbox" checked={selected[match.productCode] !== undefined} onChange={event => setSelected(current => {
              const next = { ...current }; if (event.target.checked) next[match.productCode] = match.quantityPerSale; else delete next[match.productCode]; return next;
            })} />{match.productName || "ยังไม่พบชื่อสินค้าจาก POS"} <small>{match.productCode}</small></label>
            <label>จำนวน POS ต่อการขาย 1 หน่วย
              <input type="number" min="1" max="10000" step="1" value={selected[match.productCode] ?? match.quantityPerSale}
                readOnly
                disabled={selected[match.productCode] === undefined || blocked || !mappingAllowed}
                />
              <span>{match.unit}</span>
            </label>
          </div>)}
          <label className="stock-exception-attestation"><input type="checkbox" checked={attested} onChange={event => setAttested(event.target.checked)} />
            ตรวจหลักฐานแล้วว่าแพ็ก หน่วย และตัวคูณของทุกชิ้นในชุดถูกต้อง ไม่ใช้ความคล้ายของชื่อเพียงอย่างเดียว</label>
        </fieldset>
        {mappingAllowed ? <button type="submit" disabled={blocked || !ready}>บันทึกกฎจับคู่เท่านั้น</button> : null}
      </form> : <p>ยังไม่มีคู่ที่มีหลักฐานชัดเจน ต้องเพิ่มหลักฐานก่อนยืนยัน</p>}
    </details>
    {record.ruleId && record.ruleVersion != null ? <details className="stock-exception-history">
      <summary>ประวัติและยกเลิกกฎ</summary>
      <ul>{Array.isArray(record.auditHistory) && record.auditHistory.length ? record.auditHistory.slice(0, 50).map((entry, index) => <li key={index}>
        {auditLabels[entry.action] || "ปรับปรุงกฎ"} · รุ่น {entry.ruleVersion ?? "—"} · {displayTime(entry.at)}
        {entry.reason ? <p>{revokeReasons[entry.reason] || entry.reason}</p> : null}
      </li>) : <li>ยังไม่มีประวัติที่ส่งมาในรายการนี้</li>}</ul>
      <form onSubmit={revoke}>
        <label>เหตุผลที่ยกเลิกกฎ<select value={revokeReason} disabled={blocked} onChange={event => setRevokeReason(event.target.value)}>
          <option value="">เลือกเหตุผล</option>{Object.entries(revokeReasons).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
        </select></label>
        <label className="stock-exception-attestation"><input type="checkbox" checked={revokeConfirmed} disabled={blocked} onChange={event => setRevokeConfirmed(event.target.checked)} />
          ยกเลิกเฉพาะกฎ เก็บประวัติและยอดถือเดิมไว้ตรวจต่อ ไม่คืนยอดหรือเปลี่ยนยอดตั้งต้น</label>
        <button type="submit" disabled={blocked || !Object.hasOwn(revokeReasons, revokeReason) || !revokeConfirmed}>ยกเลิกกฎนี้</button>
      </form>
    </details> : null}
    {message ? <p role="status">{message}</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {outcomeUnknown && pending ? <button type="button" disabled={busy || readOnly || !csrfToken} onClick={() => perform(pending)}>ส่งคำขอเดิมซ้ำเพื่อยืนยันผล</button> : null}
  </article>;
}

export default function Shopee004ExceptionsPanel({ isAdminUser, csrfToken }) {
  const [data, setData] = useState(null);
  const [reconciliation, setReconciliation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reconciliationError, setReconciliationError] = useState(false);
  const [reference, setReference] = useState(false);
  const [uncertainChange, setUncertainChange] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [history, setHistory] = useState([]);
  const generation = useRef(0);
  const controller = useRef(null);

  const load = useCallback(async () => {
    if (!isAdminUser) return;
    const currentGeneration = ++generation.current;
    controller.current?.abort(); controller.current = new AbortController();
    setBusy(true); setError("");
    const results = await Promise.allSettled([
      readStockExceptions({ cursor, signal: controller.current.signal }),
      readStockReconciliation({ signal: controller.current.signal }),
    ]);
    if (currentGeneration !== generation.current) return;
    if (results[0].status === "fulfilled") { setData(results[0].value); setReference(false); }
    else if (results[0].reason.name !== "AbortError") { setError(results[0].reason.message); setReference(true); }
    if (results[1].status === "fulfilled") { setReconciliation(results[1].value); setReconciliationError(false); }
    else setReconciliationError(true);
    setBusy(false);
  }, [isAdminUser, cursor]);

  useEffect(() => { load(); return () => { generation.current += 1; controller.current?.abort(); }; }, [load]);
  if (!isAdminUser) return <section className="panel"><h2>ข้อยกเว้น Shopee 004</h2><p role="alert">หน้านี้สำหรับผู้ดูแลเท่านั้น</p></section>;
  const readOnly = busy || reference || !data || data.status !== "available";
  return <section className="panel shopee004-exceptions-panel">
    <header className="panel-header"><div><h2>ข้อยกเว้น Shopee · สาขา 004</h2><p>ตรวจเฉพาะรายการที่ติดปัญหา ยอดที่ยืนยันแล้วไม่หายไปพร้อมรายการนี้</p></div>
      <button type="button" disabled={busy || uncertainChange} onClick={load}>{busy ? "กำลังอ่าน…" : "อ่านใหม่"}</button></header>
    <div className="stock-exception-guide">
      <span><strong>ยอดพร้อมใช้</strong> ยืนยันสินค้าและหน่วยแล้ว</span>
      <span><strong>ยอดอ้างอิงล่าสุด</strong> ผลเดิมพร้อมเวลา ใช้แทนยอดพร้อมขายปัจจุบันไม่ได้</span>
      <span><strong>ยังยืนยันไม่ได้</strong> แสดงแยก ไม่แทนด้วยศูนย์</span>
    </div>
    <p className="stock-exception-warning">หน้านี้อนุมัติเฉพาะกฎจับคู่สินค้า การส่ง การยกเลิก และการรับคืนต้องยืนยันแยกกัน</p>
    {error ? <p role="alert">{error}{data ? ` · คงรายการอ้างอิงที่อ่านสำเร็จเมื่อ ${displayTime(data.asOf)} ไว้ โดยปิดการยืนยัน` : ""}</p> : null}
    {data?.status === "unavailable" ? <p role="alert">ระบบข้อยกเว้นยังไม่พร้อม ข้อมูลนี้ยังใช้ยืนยันการเปลี่ยนกฎไม่ได้</p> : null}
    {data?.unreadableRecords > 0 ? <p className="stock-exception-warning" role="status">มี {number(data.unreadableRecords)} รายการที่อ่านรายละเอียดไม่ได้ ต้องตรวจต่อ — รายการเหล่านี้ยังไม่ได้รับการอนุมัติ แสดงรายการที่อ่านได้ด้านล่าง</p> : null}
    {data ? <p className="stock-exception-asof">{reference ? "รายการอ้างอิง" : "อ่านข้อมูล"}เมื่อ {displayTime(data.asOf)} (เวลาไทย)</p> : null}
    {!csrfToken ? <p role="alert">สิทธิ์ยืนยันยังไม่พร้อม กรุณาเข้าสู่ระบบใหม่</p> : null}
    <div className="stock-exception-list" aria-busy={busy}>
      {data?.records.map(record => <ExceptionCard key={record.exceptionId} record={record}
        csrfToken={csrfToken} readOnly={readOnly || Boolean(uncertainChange && uncertainChange !== record.exceptionId)} onChanged={load} onUncertainChange={setUncertainChange} />)}
      {data?.status === "available" && !data.records.length ? <p role="status">{data.unreadableRecords > 0 ? "หน้านี้ยังไม่มีรายการที่อ่านรายละเอียดได้" : "ไม่มีข้อยกเว้นในหน้านี้"}</p> : null}
    </div>
    <nav className="stock-exception-pagination" aria-label="หน้ารายการข้อยกเว้น">
      <button type="button" disabled={busy || uncertainChange || !history.length} onClick={() => {
        setCursor(history[history.length - 1]); setHistory(current => current.slice(0, -1));
      }}>หน้าก่อน</button>
      <button type="button" disabled={busy || uncertainChange || reference || !data?.pagination.hasMore || data?.status !== "available"} onClick={() => {
        setHistory(current => [...current, cursor]); setCursor(data.pagination.nextCursor);
      }}>หน้าถัดไป</button>
    </nav>
    <details className="stock-exception-reconciliation">
      <summary>เตรียมสะสางยอดก่อนนับสต็อก</summary>
      {reconciliationError ? <p role="alert">ยังอ่านสถานะสะสางล่าสุดไม่ได้{reconciliation ? " · ค่าด้านล่างเป็นข้อมูลอ้างอิงเดิม" : ""}</p> : null}
      {reconciliation ? <>
        <p>สถานะสะสางเมื่อ {displayTime(reconciliation.asOf)} (เวลาไทย){reconciliationError ? " · ข้อมูลอ้างอิงเดิม" : ""}</p>
        <p>จุดเริ่มถาวร {displayTime(reconciliation.cutoverAt)} · {reconciliation.openingBoundaryPreserved ? "คงจุดเริ่มเดิม" : "ต้องตรวจจุดเริ่มเดิมก่อนดำเนินการ"}</p>
        <dl className="stock-exception-facts">
          <div><dt>กำลังจอง</dt><dd>{number(reconciliation.reservedOrders)} ออเดอร์</dd></div>
          <div><dt>ส่งแล้ว ยังไม่ลง POS</dt><dd>{number(reconciliation.shippedUnpostedOrders)} ออเดอร์</dd></div>
          <div><dt>ต้องตรวจ</dt><dd>{number(reconciliation.reviewOrders)} ออเดอร์</dd></div>
        </dl>
        <p>{reconciliation.physicalStockVerified ? "ยอดตั้งต้นมีหลักฐานนับสต็อก" : "ยอดตั้งต้นยังไม่ใช่ผลนับสต็อกจริง"}</p>
        <ol><li>แยกยอดจองค้างออกจากยอดที่ส่งแล้วแต่ยังไม่ลง POS</li><li>ตรวจว่ารอบนับสต็อกใหม่รวมสินค้าและออเดอร์กลุ่มใดแล้ว เพื่อไม่หักซ้ำ</li><li>ตรวจยอดและอนุมัติจุดเปลี่ยนแยกก่อนใช้ยอดนับใหม่ ระบบจะไม่ rebaseline หรือลง POS ให้อัตโนมัติ</li></ol>
      </> : <p>ยังไม่มีข้อมูลที่ใช้เตรียมสะสางได้</p>}
    </details>
  </section>;
}
