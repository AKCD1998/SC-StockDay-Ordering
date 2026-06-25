import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { formatCurrency, formatPhone, formatThaiDateTime, normalizeDrugItems, stripHtml } from "../lib/format.js";

function DetailRow({ label, value }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong>{value || "-"}</strong>
    </div>
  );
}

export default function EncounterDetailModal({ row, rows, onSelectRow, onClose }) {
  const [detail, setDetail] = useState(null);
  const [medications, setMedications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
    };
  }, [row?.encounterId]);

  if (!row) {
    return null;
  }

  const activeIndex = rows.findIndex((candidate) => candidate.encounterId === row.encounterId);
  const previousRow = activeIndex > 0 ? rows[activeIndex - 1] : null;
  const nextRow = activeIndex >= 0 && activeIndex < rows.length - 1 ? rows[activeIndex + 1] : null;
  const drugItems = normalizeDrugItems(detail?.medsJson || detail?.medsAmedTh || row?.medsJson || row?.medsAmedTh);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <header className="panel-header">
          <div>
            <h2>รายละเอียด encounter</h2>
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

        {loading ? <div className="notice">กำลังโหลดข้อมูลเคส...</div> : null}
        {error ? <div className="notice error">{error}</div> : null}

        <div className="detail-grid">
          <DetailRow label="สาขา" value={detail?.branchNo || row.branchNo} />
          <DetailRow label="วันที่รับบริการ" value={formatThaiDateTime(detail?.encounterAt || row.encounterAt)} />
          <DetailRow label="เลขประจำตัวประชาชน" value={detail?.patientPid || row.patientPid} />
          <DetailRow label="ชื่อ-สกุล" value={detail?.patientName || row.patientName} />
          <DetailRow label="โทรศัพท์" value={formatPhone(detail?.patientPhone || row.patientPhone)} />
          <DetailRow label="ติดตามอาการ" value={formatThaiDateTime(detail?.followupCall || row.followupCall)} />
          <DetailRow label="รหัสอาการ" value={String(detail?.symptomNo || row.symptomNo || "-")} />
          <DetailRow label="กลุ่มอาการ" value={detail?.symptomName || row.symptomName} />
        </div>

        <section className="embedded-panel">
          <h3>คำอธิบายอาการ</h3>
          <p className="detail-text">{stripHtml(detail?.answersText || row.answersText) || "-"}</p>
        </section>

        <section className="embedded-panel">
          <h3>รายการยาสรุป</h3>
          <div className="drug-stack">
            {drugItems.length ? (
              drugItems.map((item) => (
                <span key={item.id} className="qty-pill positive">
                  {item.name} x {item.qty}
                  {item.uom ? ` ${item.uom}` : ""}
                </span>
              ))
            ) : (
              <span className="subtle">ไม่พบรายการยา</span>
            )}
          </div>
        </section>

        <section className="embedded-panel">
          <h3>Medication detail</h3>
          <div className="table-shell">
            <table className="lookup-table compact-table">
              <thead>
                <tr>
                  <th>ชื่อยา</th>
                  <th>จำนวน</th>
                  <th>วิธีใช้</th>
                  <th>ราคา/หน่วย</th>
                  <th>รวม</th>
                  <th>ผู้ตรวจ</th>
                </tr>
              </thead>
              <tbody>
                {medications.length ? (
                  medications.map((item) => (
                    <tr key={`${item.skuId}-${item.barcode}-${item.amedFullName}`}>
                      <td>{item.amedFullName || item.amedShortName || "-"}</td>
                      <td>{item.quantity}</td>
                      <td className="text-cell">{item.aggregateDirections || item.directionsText || "-"}</td>
                      <td>{formatCurrency(item.unitPrice)}</td>
                      <td>{formatCurrency(item.lineTotal)}</td>
                      <td>{item.verifiedBy || "-"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="table-empty-state">
                      ไม่พบรายการยารายบรรทัด
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </div>
  );
}
