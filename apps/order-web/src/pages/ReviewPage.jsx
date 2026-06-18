import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ConfirmModal from "../components/ConfirmModal";
import { useCart } from "../context/CartContext";
import { ApiError, api } from "../lib/api";
import { formatBranchLabel } from "../lib/requestCart";
import {
  buildSubmitPayload,
  countSubmitGroups,
  generateIdempotencyKey,
  validateSubmitPayload,
} from "../lib/requestSubmission";

function BranchReviewCard({ group }) {
  const [expanded, setExpanded] = useState(false);
  const visibleLines = expanded ? group.lines : group.lines.slice(0, 3);
  const hasMore = group.lines.length > 3;

  return (
    <section className="cart-group-card review-group-card">
      <header className="cart-group-header">
        <div>
          <h3>{formatBranchLabel(group.sourceBranchCode, group.sourceBranchName)}</h3>
          <p className="subtle">
            {group.lines.length.toLocaleString("th-TH")} บรรทัด · รวม{" "}
            {group.totalUnits.toLocaleString("th-TH")} หน่วย
          </p>
        </div>
      </header>

      <ul className="review-line-list">
        {visibleLines.map((line) => (
          <li key={line.lineKey} className="review-line-row">
            <span className="review-line-name">
              {line.productNameThai || line.productNameEng || line.productCode}
            </span>
            <span className="subtle">{line.productCode}</span>
            <strong>
              {line.requestedQty.toLocaleString("th-TH")} {line.unit || ""}
            </strong>
          </li>
        ))}
      </ul>

      {hasMore ? (
        <button type="button" className="ghost" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "แสดงน้อยลง" : `แสดงเพิ่มเติม (${group.lines.length - 3})`}
        </button>
      ) : null}
    </section>
  );
}

export default function ReviewPage() {
  const navigate = useNavigate();
  const { groupedLines, lineCount, totalUnits, clearCart } = useCart();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  // One idempotency key per mounted review session; reused on retry so a
  // network timeout after a server-side success replays idempotently.
  const idempotencyKeyRef = useRef(generateIdempotencyKey());

  const payload = useMemo(
    () => buildSubmitPayload(groupedLines, { idempotencyKey: idempotencyKeyRef.current }),
    [groupedLines],
  );

  const groupCount = countSubmitGroups(payload);

  async function handleConfirm() {
    setError("");
    const validationErrors = validateSubmitPayload(payload);
    if (validationErrors.length) {
      setError(validationErrors.join(" · "));
      setConfirmOpen(false);
      return;
    }

    setSubmitting(true);
    try {
      const response = await api.submitStockRequest(payload);
      setResult(response);
      setConfirmOpen(false);
      clearCart();
    } catch (submitError) {
      const message =
        submitError instanceof ApiError
          ? submitError.message
          : "ส่งคำขอไม่สำเร็จ กรุณาลองอีกครั้ง";
      setError(message);
      setConfirmOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>สร้างคำขอสินค้าสำเร็จ</h2>
            <p>เอกสารคำขอถูกสร้างและแจ้งเตือนสาขาต้นทางแล้ว</p>
          </div>
        </div>

        <div className="notice success">
          <p>
            เลขที่เอกสารคำขอ: <strong>{result.batchPublicId}</strong>
            {result.duplicate ? " (คำขอนี้ถูกส่งไปแล้วก่อนหน้านี้)" : ""}
          </p>
          <ul className="review-result-list">
            {(result.requests || []).map((request) => (
              <li key={request.publicId}>
                {request.publicId} → สาขา {request.sourceBranchCode}
              </li>
            ))}
          </ul>
        </div>

        <div className="modal-actions">
          <Link to="/stock" className="ghost">
            กลับไปหน้าสต็อกสาขา
          </Link>
          <Link to="/requests" className="primary">
            ดูสถานะคำขอของฉัน
          </Link>
        </div>
      </section>
    );
  }

  if (!lineCount) {
    return (
      <section className="panel">
        <div className="panel-header">
          <h2>ตรวจสอบคำขอ</h2>
        </div>
        <div className="empty-cart-card">
          <p className="empty-state">ยังไม่มีรายการสำหรับสร้างคำขอ</p>
          <Link to="/stock" className="text-link">
            กลับไปเลือกสินค้าจากหน้าสต็อกสาขา
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      {submitting ? (
        <div className="blocking-overlay" role="status" aria-live="polite">
          <div className="blocking-overlay-card">กำลังสร้างเอกสารคำขอสินค้า...</div>
        </div>
      ) : null}

      <div className="panel-header">
        <div>
          <h2>ตรวจสอบและยืนยันคำขอ</h2>
          <p>
            คำขอจะถูกแยกเป็น {groupCount.toLocaleString("th-TH")} เอกสารตามสาขาต้นทาง
          </p>
        </div>
        <Link to="/cart" className="ghost">
          กลับไปแก้ไขตะกร้า
        </Link>
      </div>

      <div className="summary-grid cart-summary-grid">
        <article className="summary-card">
          <span>สาขาต้นทาง</span>
          <strong>{groupCount}</strong>
        </article>
        <article className="summary-card">
          <span>จำนวนบรรทัด</span>
          <strong>{lineCount}</strong>
        </article>
        <article className="summary-card">
          <span>จำนวนหน่วยรวม</span>
          <strong>{totalUnits}</strong>
        </article>
      </div>

      <div className="cart-groups">
        {groupedLines.map((group) => (
          <BranchReviewCard key={group.sourceBranchCode} group={group} />
        ))}
      </div>

      {error ? <p className="message error-text">{error}</p> : null}

      <div className="modal-actions">
        <button
          type="button"
          className="primary review-submit-button"
          onClick={() => setConfirmOpen(true)}
          disabled={submitting}
        >
          ยืนยันการสร้างเอกสารคำขอสินค้า
        </button>
      </div>

      <ConfirmModal
        open={confirmOpen}
        title="ยืนยันการสร้างเอกสารคำขอสินค้า"
        confirmLabel="ยืนยันและส่งคำขอ"
        confirmClassName="primary review-submit-button"
        busy={submitting}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
      >
        <p>
          ระบบจะสร้างคำขอแยกเป็น <strong>{groupCount}</strong> เอกสาร (สาขาละ 1 ฉบับ)
          และแจ้งเตือนแต่ละสาขาต้นทางให้ตอบกลับ
        </p>
        <p className="subtle">เมื่อยืนยันแล้ว ตะกร้าจะถูกล้างและคำขอจะถูกบันทึก</p>
      </ConfirmModal>
    </section>
  );
}
