import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ConfirmModal from "../components/ConfirmModal";
import FulfillmentForm from "../components/FulfillmentForm";
import FulfillmentReport from "../components/FulfillmentReport";
import RequestStatusPill from "../components/RequestStatusPill";
import { ApiError, api } from "../lib/api";
import { formatBranchLabel } from "../lib/requestCart";
import { statusLabel } from "../lib/requestStatus";
import {
  buildResponseSubmitBody,
  initResponseDraft,
  validateResponseDraft,
} from "../lib/responseDraft";

function isSnapshotStale(syncedAt) {
  if (!syncedAt) return false;
  return Date.now() - new Date(syncedAt).getTime() > 24 * 60 * 60 * 1000;
}

const STATUS_OPTIONS = [
  { value: "APPROVED_FULL", label: "อนุมัติเต็มจำนวน" },
  { value: "APPROVED_PARTIAL", label: "อนุมัติบางส่วน" },
  { value: "REJECTED", label: "ปฏิเสธ" },
];

function LineResponseEditor({ line, draftLine, error, onChange }) {
  return (
    <article className="basket-row response-line-row">
      <div className="basket-main">
        <strong>{line.productNameThai || line.productNameEng || line.productCode}</strong>
        <span>
          {line.productCode} · ขอ {line.requestedQty.toLocaleString("th-TH")} {line.unit || ""}
        </span>
        <span className="subtle">
          snapshot: {line.snapshotQty == null ? "-" : line.snapshotQty.toLocaleString("th-TH")}{" "}
          {line.unit || ""}
          {isSnapshotStale(line.snapshotSyncedAt) ? " (เก่ากว่า 24 ชม.)" : ""}
        </span>
      </div>

      <div className="response-controls">
        <select
          value={draftLine.responseStatus}
          aria-label={`ผลการตอบกลับสำหรับ ${line.productCode}`}
          onChange={(event) => onChange(line.lineId, { responseStatus: event.target.value })}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {draftLine.responseStatus === "APPROVED_PARTIAL" ? (
          <input
            type="number"
            min="1"
            max={line.requestedQty - 1}
            step="1"
            value={draftLine.approvedQty}
            aria-label={`จำนวนอนุมัติสำหรับ ${line.productCode}`}
            onChange={(event) => onChange(line.lineId, { approvedQty: event.target.value })}
            placeholder="จำนวนอนุมัติ"
          />
        ) : null}

        {draftLine.responseStatus !== "APPROVED_FULL" ? (
          <input
            value={draftLine.note}
            aria-label={`เหตุผลสำหรับ ${line.productCode}`}
            onChange={(event) => onChange(line.lineId, { note: event.target.value })}
            placeholder="เหตุผล (จำเป็น)"
          />
        ) : null}
      </div>

      {error ? <p className="message error-text response-line-error">{error}</p> : null}
    </article>
  );
}

function ReadOnlyLine({ line }) {
  return (
    <article className="basket-row request-basket-row" key={line.lineId}>
      <div className="basket-main">
        <strong>{line.productNameThai || line.productNameEng || line.productCode}</strong>
        <span>
          {line.productCode} · ขอ {line.requestedQty.toLocaleString("th-TH")} {line.unit || ""}
        </span>
      </div>
      <span className="line-response-state">
        {line.response
          ? `${statusLabel(line.response.status)} · ${Number(
              line.response.approvedQty || 0,
            ).toLocaleString("th-TH")} ${line.unit || ""}${
              line.response.note ? ` · ${line.response.note}` : ""
            }`
          : statusLabel(line.status)}
      </span>
    </article>
  );
}

export default function IncomingRequestDetailPage() {
  const { publicId } = useParams();
  const [state, setState] = useState({ status: "loading", request: null, error: "" });
  const [draft, setDraft] = useState({});
  const [draftErrors, setDraftErrors] = useState({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  async function loadDetail() {
    setState({ status: "loading", request: null, error: "" });
    try {
      const payload = await api.getIncomingStockRequestDetail(publicId);
      const request = payload?.request || null;
      setState({ status: "ready", request, error: "" });
      if (request) {
        setDraft(initResponseDraft(request.lines));
      }
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.status === 403
            ? "คำขอนี้ไม่ได้ส่งมายังสาขาของคุณ"
            : error.message
          : "โหลดรายละเอียดคำขอไม่สำเร็จ";
      setState({ status: "error", request: null, error: message });
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      if (active) await loadDetail();
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicId]);

  const request = state.request;
  const canRespond = request?.status === "SUBMITTED";

  function handleLineChange(lineId, patch) {
    setDraft((current) => ({ ...current, [lineId]: { ...current[lineId], ...patch } }));
  }

  function openConfirm() {
    const errors = validateResponseDraft(draft, request.lines);
    setDraftErrors(errors);
    if (Object.keys(errors).length) {
      setSubmitError("กรุณาแก้ไขรายการที่ไม่ถูกต้องก่อนส่ง");
      return;
    }
    setSubmitError("");
    setConfirmOpen(true);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError("");
    try {
      const body = buildResponseSubmitBody(draft, request.lines, request.version);
      await api.submitStockRequestResponse(publicId, body);
      setConfirmOpen(false);
      await loadDetail();
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.status === 409
            ? "คำขอนี้ถูกตอบกลับหรือแก้ไขไปแล้ว กรุณาโหลดใหม่"
            : error.message
          : "ส่งการตอบกลับไม่สำเร็จ";
      setSubmitError(message);
      setConfirmOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  const [dispatching, setDispatching] = useState(false);
  const [dispatchError, setDispatchError] = useState("");

  async function handleDispatch(payloadLines) {
    setDispatching(true);
    setDispatchError("");
    try {
      await api.dispatchStockRequest(publicId, { version: request.version, lines: payloadLines });
      await loadDetail();
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.status === 409
            ? "สถานะคำขอเปลี่ยนไปแล้ว กรุณาโหลดใหม่"
            : error.message
          : "บันทึกการจัดส่งไม่สำเร็จ";
      setDispatchError(message);
    } finally {
      setDispatching(false);
    }
  }

  const dispatchLines = useMemo(
    () =>
      (request?.lines || []).map((line) => ({
        ...line,
        approvedQty: line.response?.approvedQty ?? line.requestedQty,
      })),
    [request],
  );

  const summary = useMemo(() => {
    if (!request) return null;
    return {
      lineCount: request.lines.length,
    };
  }, [request]);

  return (
    <section className="panel">
      {submitting ? (
        <div className="blocking-overlay" role="status" aria-live="polite">
          <div className="blocking-overlay-card">กำลังส่งการตอบกลับ...</div>
        </div>
      ) : null}

      <div className="panel-header">
        <div>
          <h2>รายละเอียดคำขอเข้า</h2>
          <p>{publicId}</p>
        </div>
        <div className="packing-actions">
          {request && request.status !== "SUBMITTED" ? (
            <Link to={`/incoming/${encodeURIComponent(publicId)}/document`} className="ghost">
              เอกสารแพ็กสินค้า
            </Link>
          ) : null}
          <Link to="/incoming" className="ghost">
            กลับไปรายการคำขอ
          </Link>
        </div>
      </div>

      {state.status === "loading" ? (
        <div className="notice compact-notice">กำลังโหลด...</div>
      ) : state.status === "error" ? (
        <div className="notice warning compact-notice">{state.error}</div>
      ) : !request ? (
        <div className="notice warning compact-notice">ไม่พบคำขอนี้</div>
      ) : (
        <>
          <div className="summary-grid cart-summary-grid">
            <article className="summary-card">
              <span>สาขาผู้ขอ</span>
              <strong>{formatBranchLabel(request.requestingBranchCode)}</strong>
            </article>
            <article className="summary-card">
              <span>จำนวนบรรทัด</span>
              <strong>{summary.lineCount}</strong>
            </article>
            <article className="summary-card">
              <span>สถานะ</span>
              <RequestStatusPill status={request.status} />
            </article>
          </div>

          {canRespond ? (
            <>
              <div className="basket incoming-line-list">
                {request.lines.map((line) => (
                  <LineResponseEditor
                    key={line.lineId}
                    line={line}
                    draftLine={draft[line.lineId] || { responseStatus: "APPROVED_FULL" }}
                    error={draftErrors[line.lineId]}
                    onChange={handleLineChange}
                  />
                ))}
              </div>

              {submitError ? <p className="message error-text">{submitError}</p> : null}

              <div className="modal-actions">
                <button type="button" className="primary" onClick={openConfirm} disabled={submitting}>
                  ส่งการตอบกลับ
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="basket incoming-line-list">
                {request.lines.map((line) => (
                  <ReadOnlyLine key={line.lineId} line={line} />
                ))}
              </div>

              {request.status === "ACKNOWLEDGED" ? (
                <section className="fulfillment-section">
                  <h3>จัดส่งสินค้า</h3>
                  <p className="subtle">ระบุจำนวนที่จัดส่งจริงต่อรายการ แล้วบันทึกการจัดส่ง</p>
                  {dispatchError ? <p className="message error-text">{dispatchError}</p> : null}
                  <FulfillmentForm
                    lines={dispatchLines}
                    qtyField="dispatchedQty"
                    defaultQtyKey="approvedQty"
                    submitLabel="บันทึกการจัดส่ง"
                    busy={dispatching}
                    onSubmit={handleDispatch}
                  />
                </section>
              ) : null}

              {["DISPATCHED", "RECEIVED", "COMPLETED"].includes(request.status) ? (
                <FulfillmentReport publicId={publicId} />
              ) : null}
            </>
          )}
        </>
      )}

      <ConfirmModal
        open={confirmOpen}
        title="ยืนยันการตอบกลับคำขอ"
        confirmLabel="ยืนยันและส่ง"
        confirmClassName="primary"
        busy={submitting}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleSubmit}
      >
        <p>เมื่อส่งแล้ว การตอบกลับรายบรรทัดจะถูกบันทึกถาวรและแจ้งเตือนสาขาผู้ขอ</p>
        <p className="subtle">หากต้องการแก้ไขภายหลังต้องทำผ่านขั้นตอนแก้ไขเพิ่มเติม</p>
      </ConfirmModal>
    </section>
  );
}
