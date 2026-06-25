import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api.js";
import { formatThaiDateTime, stripHtml } from "../lib/format.js";

export default function ReportPreviewPage() {
  const [searchParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    api
      .getReportPreview(Object.fromEntries(searchParams.entries()))
      .then((payload) => {
        if (!cancelled) {
          setData(payload);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setData(null);
          setError(loadError.message || "โหลดตัวอย่างรายงานไม่สำเร็จ");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  return (
    <div className="page-stack">
      <section className="panel print-panel">
        <div className="panel-header">
          <div>
            <h2>{data?.meta?.title || "Report preview"}</h2>
            <p>{data?.meta?.subtitle || "ตรวจรูปแบบก่อนสร้าง PDF หรือส่งอีเมลจาก shared backend"}</p>
          </div>
          <div className="toolbar">
            <Link className="ghost button-link" to="/reports">
              กลับไปตั้งค่า
            </Link>
            <button type="button" onClick={() => window.print()}>
              พิมพ์ / Save PDF
            </button>
          </div>
        </div>

        {loading ? <div className="notice">กำลังโหลดตัวอย่างรายงาน...</div> : null}
        {error ? <div className="notice error">{error}</div> : null}

        {!loading && data ? (
          <div className="table-shell">
            <table className="lookup-table">
              <thead>
                <tr>
                  <th>Encounter</th>
                  <th>สาขา</th>
                  <th>วันที่รับบริการ</th>
                  <th>PID</th>
                  <th>ผู้ป่วย</th>
                  <th>อาการ</th>
                  <th>คำอธิบาย</th>
                  <th>ยา</th>
                </tr>
              </thead>
              <tbody>
                {data.records?.length ? (
                  data.records.map((row) => (
                    <tr key={row.encounterId}>
                      <td>{row.encounterId}</td>
                      <td>{row.branchNo || "-"}</td>
                      <td>{formatThaiDateTime(row.encounterAt)}</td>
                      <td>{row.patientPid || "-"}</td>
                      <td>{row.patientName || "-"}</td>
                      <td>{row.symptomName || "-"}</td>
                      <td className="text-cell">{stripHtml(row.answersText) || "-"}</td>
                      <td>{row.medications || "-"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="8" className="table-empty-state">
                      ไม่มีข้อมูลในรายงานชุดนี้
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
