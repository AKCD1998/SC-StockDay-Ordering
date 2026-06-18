import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, api } from "../lib/api";
import { formatBranchLabel } from "../lib/requestCart";
import { formatDateTime, statusLabel } from "../lib/requestStatus";

export default function PackingDocumentPage() {
  const { publicId } = useParams();
  const [state, setState] = useState({ status: "loading", doc: null, error: "" });
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState("");

  const loadDocument = useCallback(async () => {
    setState({ status: "loading", doc: null, error: "" });
    try {
      const payload = await api.getStockRequestDocument(publicId);
      setState({ status: "ready", doc: payload, error: "" });
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setState({ status: "empty", doc: null, error: "" });
        return;
      }
      const message =
        error instanceof ApiError
          ? error.status === 403
            ? "คุณไม่มีสิทธิ์เข้าถึงเอกสารนี้"
            : error.message
          : "โหลดเอกสารไม่สำเร็จ";
      setState({ status: "error", doc: null, error: message });
    }
  }, [publicId]);

  useEffect(() => {
    loadDocument();
  }, [loadDocument]);

  async function handleGenerate() {
    setWorking(true);
    setActionError("");
    try {
      await api.generateStockRequestDocument(publicId);
      await loadDocument();
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.status === 403
            ? "เฉพาะสาขาต้นทางเท่านั้นที่ออกเอกสารได้"
            : error.status === 409
              ? "ต้องตอบกลับคำขอก่อนจึงจะออกเอกสารได้"
              : error.message
          : "ออกเอกสารไม่สำเร็จ";
      setActionError(message);
    } finally {
      setWorking(false);
    }
  }

  const doc = state.doc?.document || null;

  return (
    <section className="panel packing-page">
      <div className="panel-header no-print">
        <div>
          <h2>เอกสารแพ็กสินค้า</h2>
          <p>{publicId}</p>
        </div>
        <div className="packing-actions">
          <Link to={`/incoming/${encodeURIComponent(publicId)}`} className="ghost">
            กลับไปคำขอ
          </Link>
          <button type="button" className="ghost" onClick={handleGenerate} disabled={working}>
            {working ? "กำลังออกเอกสาร..." : doc ? "ออกเอกสารใหม่ (พิมพ์ซ้ำ)" : "ออกเอกสาร"}
          </button>
          {doc ? (
            <button type="button" className="primary" onClick={() => window.print()}>
              พิมพ์
            </button>
          ) : null}
        </div>
      </div>

      {actionError ? <p className="message error-text no-print">{actionError}</p> : null}

      {state.status === "loading" ? (
        <div className="notice compact-notice no-print">กำลังโหลด...</div>
      ) : state.status === "error" ? (
        <div className="notice warning compact-notice no-print">{state.error}</div>
      ) : state.status === "empty" ? (
        <div className="empty-cart-card no-print">
          <p className="empty-state">ยังไม่มีการออกเอกสารสำหรับคำขอนี้</p>
          <p className="subtle">สาขาต้นทางสามารถกด "ออกเอกสาร" เพื่อสร้างเอกสารแพ็กสินค้า</p>
        </div>
      ) : doc ? (
        <article className="packing-doc">
          <header className="packing-doc-header">
            <h1>ใบส่งสินค้าระหว่างสาขา</h1>
            <div className="packing-doc-meta">
              <span>
                เลขที่: <strong>{doc.requestPublicId}</strong>
              </span>
              <span>
                ฉบับที่ {state.doc.version}
                {state.doc.reprint ? " (พิมพ์ซ้ำ)" : ""}
              </span>
            </div>
          </header>

          <div className="packing-doc-parties">
            <div>
              <span className="subtle">จากสาขา (ต้นทาง)</span>
              <strong>{formatBranchLabel(doc.sourceBranchCode)}</strong>
            </div>
            <div>
              <span className="subtle">ถึงสาขา (ปลายทาง)</span>
              <strong>{formatBranchLabel(doc.requestingBranchCode)}</strong>
            </div>
          </div>

          <div className="packing-doc-dates">
            <span>วันที่ขอ: {formatDateTime(doc.requestedAt)}</span>
            <span>วันที่ตอบกลับ: {formatDateTime(doc.respondedAt)}</span>
            <span>วันที่พิมพ์: {formatDateTime(doc.generatedAt)}</span>
          </div>

          <table className="packing-doc-table">
            <thead>
              <tr>
                <th>#</th>
                <th>รหัส</th>
                <th>ชื่อสินค้า</th>
                <th>บาร์โค้ด</th>
                <th>หน่วย</th>
                <th>ขอ</th>
                <th>ส่ง</th>
                <th>สถานะ</th>
                <th>หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {doc.lines.map((line, index) => (
                <tr key={line.productCode + index}>
                  <td>{index + 1}</td>
                  <td>{line.productCode}</td>
                  <td>{line.productNameThai || line.productNameEng || "-"}</td>
                  <td>{line.barcode || "-"}</td>
                  <td>{line.unit || "-"}</td>
                  <td className="num">{Number(line.requestedQty).toLocaleString("th-TH")}</td>
                  <td className="num">{Number(line.approvedQty).toLocaleString("th-TH")}</td>
                  <td>{statusLabel(line.responseStatus)}</td>
                  <td>{line.reason || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="packing-doc-signatures">
            <div className="signature-box">
              <span className="signature-line" />
              <span className="subtle">ผู้จัด/ผู้ส่ง</span>
            </div>
            <div className="signature-box">
              <span className="signature-line" />
              <span className="subtle">ผู้ตรวจ/ผู้รับ</span>
            </div>
          </div>
        </article>
      ) : null}
    </section>
  );
}
