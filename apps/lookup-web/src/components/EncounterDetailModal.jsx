import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { formatPhone, formatThaiDateTime, normalizeDrugItems, stripHtml, toDateInputValue } from "../lib/format.js";

function DetailRow({ label, value }) {
  return (
    <div className="legacy-detail-row">
      <div className="legacy-detail-label">{label}</div>
      <div className="legacy-detail-value">{value || "-"}</div>
    </div>
  );
}

export default function EncounterDetailModal({ row, rows, onSelectRow, onClose }) {
  const [detail, setDetail] = useState(null);
  const [medications, setMedications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copyNotice, setCopyNotice] = useState("");
  const noticeTimerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!row?.encounterId) {
        setDetail(null);
        setMedications([]);
        setError("");
        return;
      }

      setLoading(true);
      setError("");

      try {
        const [detailPayload, medicationsPayload] = await Promise.all([
          api.getEncounterDetail(row.encounterId),
          api.getEncounterMedications(row.encounterId),
        ]);

        if (!cancelled) {
          setDetail(detailPayload);
          setMedications(medicationsPayload.records || []);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "โหลดรายละเอียด encounter ไม่สำเร็จ");
          setDetail(null);
          setMedications([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
      if (noticeTimerRef.current) {
        window.clearTimeout(noticeTimerRef.current);
      }
    };
  }, [row?.encounterId]);

  if (!row) {
    return null;
  }

  const activeIndex = rows.findIndex((candidate) => candidate.encounterId === row.encounterId);
  const previousRow = activeIndex > 0 ? rows[activeIndex - 1] : null;
  const nextRow = activeIndex >= 0 && activeIndex < rows.length - 1 ? rows[activeIndex + 1] : null;
  const drugItems = normalizeDrugItems(detail?.medsJson || detail?.medsAmedTh || row?.medsJson || row?.medsAmedTh);
  const displayDate = detail?.encounterAt || row.encounterAt;
  const formattedDate = formatThaiDateTime(displayDate);
  const prescriptionSummary =
    [...new Set(medications.map((item) => item.aggregateDirections || item.directionsText || "").map((value) => value.trim()).filter(Boolean))].join(" , ") ||
    detail?.symptomName ||
    row?.symptomName ||
    "-";
  const medicationRows = (medications.length ? medications : drugItems).map((item, index) => {
    const fallbackDrug = drugItems[index] || {};
    return {
      id: `${item.skuId || fallbackDrug.id || index}`,
      displayName: item.amedShortName || item.amedFullName || fallbackDrug.name || "-",
      quantityText: [item.quantity || fallbackDrug.qty || 1, fallbackDrug.uom || ""].filter(Boolean).join(" "),
      amedCopyText: item.amedShortName || item.amedFullName || fallbackDrug.name || "-",
      directionsText: item.aggregateDirections || item.directionsText || "-",
    };
  });

  async function copyText(value) {
    const text = String(value || "").trim();
    if (!text || text === "-") return;

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }

    setCopyNotice("คัดลอกแล้ว");
    if (noticeTimerRef.current) {
      window.clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = window.setTimeout(() => setCopyNotice(""), 1200);
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <header className="legacy-modal-head">
          <div>
            <h2>ใบสรุปรายเคส • {formattedDate}</h2>
            <p>{detail?.encounterId || row.encounterId}</p>
          </div>
          <div className="toolbar">
            <button type="button" className="ghost" onClick={() => previousRow && onSelectRow(previousRow)} disabled={!previousRow}>
              ก่อนหน้า
            </button>
            <button type="button" className="ghost" onClick={() => nextRow && onSelectRow(nextRow)} disabled={!nextRow}>
              ถัดไป
            </button>
            <button type="button" onClick={onClose}>
              ปิด
            </button>
          </div>
        </header>

        <div className="legacy-modal-body">
          {loading ? <div className="notice">กำลังโหลดข้อมูลเคส...</div> : null}
          {error ? <div className="notice error">{error}</div> : null}

          <section className="legacy-date-card">
            <label>วันที่</label>
            <input type="date" value={toDateInputValue(displayDate)} readOnly />
          </section>

          <div className="legacy-detail-table">
            <DetailRow label="สาขา" value={detail?.branchNo || row.branchNo} />
            <DetailRow label="ชื่อ-สกุล" value={detail?.patientName || row.patientName} />
            <DetailRow label="เลขประจำตัวประชาชน" value={detail?.patientPid || row.patientPid} />
            <DetailRow label="เบอร์โทร" value={formatPhone(detail?.patientPhone || row.patientPhone)} />
            <DetailRow label="วันที่รับบริการ" value={formattedDate} />
            <DetailRow label="กลุ่มอาการ" value={`${detail?.symptomNo || row.symptomNo || "-"} : ${detail?.symptomName || row.symptomName || "-"}`} />
          </div>

          <section className="legacy-section">
            <div className="legacy-section-title legacy-section-title--problem">อาการที่เป็นปัญหาของผู้รับบริการ</div>
            <div className="legacy-copy-wrap">
              <button type="button" className="legacy-copy-icon" onClick={() => copyText(stripHtml(detail?.answersText || row.answersText) || "-")}>
                คัดลอก
              </button>
              <div className="legacy-info-box">
                <p className="detail-text">{stripHtml(detail?.answersText || row.answersText) || "-"}</p>
              </div>
            </div>
          </section>

          <section className="legacy-section">
            <div className="legacy-section-title legacy-section-title--prescription">ข้อมูลใบสั่งยา</div>
            <div className="legacy-copy-wrap">
              <button type="button" className="legacy-copy-icon" onClick={() => copyText(prescriptionSummary)}>
                คัดลอก
              </button>
              <div className="legacy-info-box">
                <p className="detail-text">{prescriptionSummary}</p>
              </div>
            </div>
          </section>

          <div className="table-shell legacy-rx-table-shell">
            <table className="legacy-rx-table">
              <thead>
                <tr>
                  <th style={{ width: "38%" }}>รายการที่จ่าย</th>
                  <th style={{ width: "14%" }}>จำนวน</th>
                  <th style={{ width: "24%" }}>คัดลอกไป A-med care</th>
                  <th style={{ width: "24%" }}>วิธีรับประทาน</th>
                </tr>
              </thead>
              <tbody>
                {medicationRows.length ? (
                  medicationRows.map((item) => (
                    <tr key={item.id}>
                      <td>{item.displayName}</td>
                      <td className="legacy-qty-cell">{item.quantityText}</td>
                      <td>
                        <div className="legacy-inline-copy">
                          <span>{item.amedCopyText}</span>
                          <button type="button" className="legacy-mini-button" onClick={() => copyText(item.amedCopyText)}>
                            คัดลอก
                          </button>
                        </div>
                      </td>
                      <td>
                        <div className="legacy-inline-copy">
                          <span>{item.directionsText}</span>
                          <button type="button" className="legacy-mini-button" onClick={() => copyText(item.directionsText)}>
                            คัดลอก
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4" className="table-empty-state">
                      ไม่พบรายการยารายบรรทัด
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {copyNotice ? <div className="legacy-copy-toast">{copyNotice}</div> : null}
      </section>
    </div>
  );
}
