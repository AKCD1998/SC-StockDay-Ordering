import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { buildFollowupStatusKey, clearFollowupStatus, exportFollowupStatuses, readFollowupStatuses, saveFollowupStatus } from "../lib/followupState.js";
import { formatPhone, formatThaiDate, stripHtml, toDateInputValue } from "../lib/format.js";

const followupOptions = ["โทรแล้ว", "โทรไม่ติด", "อื่นๆ"];

export default function FollowupsPage() {
  const [branches, setBranches] = useState([]);
  const [filters, setFilters] = useState({
    date: toDateInputValue(new Date()),
    branchCode: "",
  });
  const [rows, setRows] = useState([]);
  const [statusMap, setStatusMap] = useState(() => readFollowupStatuses());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getBranches().then((payload) => setBranches(payload.branches || [])).catch(() => setBranches([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    api
      .getFollowups(filters)
      .then((payload) => {
        if (!cancelled) {
          setRows(payload.records || []);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setRows([]);
          setError(loadError.message || "โหลด follow-up queue ไม่สำเร็จ");
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
  }, [filters]);

  const exportBlob = useMemo(() => exportFollowupStatuses(), [statusMap]);

  function updateStatus(record, status) {
    const key = buildFollowupStatusKey(record);
    const nextMap = saveFollowupStatus(key, {
      encounterId: record.encounterId,
      patientName: record.patientName,
      followupCall: record.followupCall,
      status,
    });
    setStatusMap(nextMap);
  }

  function resetStatus(record) {
    const key = buildFollowupStatusKey(record);
    const nextMap = clearFollowupStatus(key);
    setStatusMap(nextMap);
  }

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Follow-up queue</h2>
            <p>สถานะการโทรยังเป็น local-only เหมือน workflow เดิม แต่แยก state ออกจาก data source ให้ชัดเจน</p>
          </div>
        </div>

        <div className="filter-grid">
          <label>
            วันที่ติดตาม
            <input type="date" value={filters.date} onChange={(event) => setFilters((current) => ({ ...current, date: event.target.value }))} />
          </label>
          <label>
            สาขา
            <select value={filters.branchCode} onChange={(event) => setFilters((current) => ({ ...current, branchCode: event.target.value }))}>
              <option value="">ทุกสาขา</option>
              {branches.map((branch) => (
                <option key={branch.branchCode} value={branch.branchCode}>
                  {branch.branchCode}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="ghost"
            onClick={() => {
              const blob = new Blob([exportBlob], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = `followup-status-${filters.date}.json`;
              anchor.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export JSON
          </button>
        </div>
      </section>

      <section className="panel">
        {loading ? <div className="notice">กำลังโหลด follow-up queue...</div> : null}
        {error ? <div className="notice error">{error}</div> : null}

        {!loading ? (
          <div className="table-shell">
            <table className="lookup-table">
              <thead>
                <tr>
                  <th>สาขา</th>
                  <th>เวลาติดตาม</th>
                  <th>ผู้ป่วย</th>
                  <th>โทรศัพท์</th>
                  <th>อาการ</th>
                  <th>บันทึกล่าสุด</th>
                  <th>อัปเดตสถานะ</th>
                </tr>
              </thead>
              <tbody>
                {rows.length ? (
                  rows.map((row) => {
                    const statusKey = buildFollowupStatusKey(row);
                    const saved = statusMap[statusKey];
                    return (
                      <tr key={row.encounterId}>
                        <td>{row.branchNo || "-"}</td>
                        <td>{formatThaiDate(row.followupCall)}</td>
                        <td>{row.patientName || "-"}</td>
                        <td>{formatPhone(row.patientPhone)}</td>
                        <td className="text-cell">{stripHtml(row.answersText) || row.symptomName || "-"}</td>
                        <td>{saved?.status || "-"}</td>
                        <td>
                          <div className="status-actions">
                            {followupOptions.map((status) => (
                              <button key={status} type="button" className="ghost small" onClick={() => updateStatus(row, status)}>
                                {status}
                              </button>
                            ))}
                            <button type="button" className="ghost small" onClick={() => resetStatus(row)}>
                              Undo
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="7" className="table-empty-state">
                      ไม่มีเคส follow-up ในวันที่เลือก
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
