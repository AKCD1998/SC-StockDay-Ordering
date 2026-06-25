import { useEffect, useMemo, useState } from "react";
import { CipdataNav } from "../components/CipdataShell.jsx";
import EncounterDetailModal from "../components/EncounterDetailModal.jsx";
import KpiCards from "../components/KpiCards.jsx";
import { api } from "../lib/api.js";
import { formatPhone, formatThaiDateTime, normalizeDrugItems, stripHtml, toDateInputValue } from "../lib/format.js";

const defaultFilters = {
  search: "",
  branchCode: "",
  dateFrom: "",
  dateTo: "",
  patientPid: "",
  symptom: "",
  drug: "",
  sort: "encounter_at",
  dir: "DESC",
};

const defaultAccumSettings = {
  mode: "monthStart",
  start: "",
  end: "",
};

function loadNumberPreference(key, fallback) {
  if (typeof window === "undefined") return fallback;
  const value = Number(window.localStorage.getItem(key) || fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function loadAccumPreference() {
  if (typeof window === "undefined") return defaultAccumSettings;
  try {
    const raw = window.localStorage.getItem("cipdata.lookup.accum-settings");
    return raw ? { ...defaultAccumSettings, ...JSON.parse(raw) } : defaultAccumSettings;
  } catch {
    return defaultAccumSettings;
  }
}

export default function LookupPage() {
  const [branches, setBranches] = useState([]);
  const [draftFilters, setDraftFilters] = useState(defaultFilters);
  const [filters, setFilters] = useState(defaultFilters);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [activeRow, setActiveRow] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [kpiLoading, setKpiLoading] = useState(false);
  const [kpiError, setKpiError] = useState("");
  const [kpiData, setKpiData] = useState(null);
  const [monthlyTarget, setMonthlyTarget] = useState(() => loadNumberPreference("cipdata.lookup.monthly-target", 300));
  const [accumSettings, setAccumSettings] = useState(() => loadAccumPreference());

  const maxPage = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    let cancelled = false;
    api
      .getBranches()
      .then((payload) => {
        if (!cancelled) {
          setBranches(payload.branches || []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBranches([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("cipdata.lookup.monthly-target", String(monthlyTarget));
    }
  }, [monthlyTarget]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("cipdata.lookup.accum-settings", JSON.stringify(accumSettings));
    }
  }, [accumSettings]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    api
      .getEncounters({
        ...filters,
        page,
        pageSize,
      })
      .then((payload) => {
        if (!cancelled) {
          setRows(payload.records || []);
          setTotal(payload.total || 0);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setRows([]);
          setTotal(0);
          setError(loadError.message || "โหลด encounter ไม่สำเร็จ");
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
  }, [filters, page, pageSize]);

  useEffect(() => {
    let cancelled = false;
    setKpiLoading(true);
    setKpiError("");

    api
      .getKpis({
        branchCode: filters.branchCode,
        accumMode: accumSettings.mode,
        accumStart: accumSettings.start,
        accumEnd: accumSettings.end,
        monthlyTarget,
      })
      .then((payload) => {
        if (!cancelled) {
          setKpiData(payload);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setKpiData(null);
          setKpiError(loadError.message || "โหลด KPI ไม่สำเร็จ");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setKpiLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [filters.branchCode, accumSettings, monthlyTarget]);

  const branchOptions = useMemo(() => branches.map((branch) => branch.branchCode), [branches]);

  function updateDraft(key, value) {
    setDraftFilters((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    setPage(1);
    setFilters(draftFilters);
  }

  function handleResetFilters() {
    setDraftFilters(defaultFilters);
    setFilters(defaultFilters);
    setPage(1);
  }

  function visibleRangeLabel() {
    if (!total) return "ไม่พบข้อมูล";
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, total);
    return `แสดง ${start}-${end} จาก ${total} รายการ`;
  }

  const todayText = toDateInputValue(new Date());

  return (
    <div className="page-stack">
      <section className="lookup-top-grid">
        <header className="hero-card lookup-hero-card">
          <div className="hero-copy">
            <span className="eyebrow">CiPData Migration</span>
            <h1>สำหรับกรอกข้อมูล</h1>
          </div>

          <CipdataNav />
        </header>

        <section className="panel hero-kpi-panel">
          <div className="panel-header stacked hero-kpi-header">
            <div>
              <h2>KPI ภาพรวม</h2>
            </div>
            <div className="toolbar kpi-controls">
              <label>
                โหมดสะสม
                <select
                  value={accumSettings.mode}
                  onChange={(event) =>
                    setAccumSettings((current) => ({
                      ...current,
                      mode: event.target.value,
                    }))
                  }
                >
                  <option value="monthStart">ตั้งแต่ต้นเดือนถึงวันนี้</option>
                  <option value="custom">กำหนดช่วงเอง</option>
                </select>
              </label>
              {accumSettings.mode === "custom" ? (
                <>
                  <label>
                    เริ่ม
                    <input
                      type="date"
                      value={accumSettings.start}
                      onChange={(event) =>
                        setAccumSettings((current) => ({
                          ...current,
                          start: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    สิ้นสุด
                    <input
                      type="date"
                      value={accumSettings.end}
                      onChange={(event) =>
                        setAccumSettings((current) => ({
                          ...current,
                          end: event.target.value,
                        }))
                      }
                    />
                  </label>
                </>
              ) : null}
              <label>
                เป้าหมายต่อเดือน
                <input type="number" min="1" value={monthlyTarget} onChange={(event) => setMonthlyTarget(Math.max(1, Number(event.target.value) || 1))} />
              </label>
            </div>
          </div>

          {kpiError ? <div className="notice error">{kpiError}</div> : null}
          <KpiCards data={kpiData} />
        </section>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>ค้นหา encounter</h2>
          </div>
        </div>

        <form className="filter-form" onSubmit={handleSubmit}>
          <div className="filter-grid">
            <label>
              ค้นหา
              <input
                value={draftFilters.search}
                onChange={(event) => updateDraft("search", event.target.value)}
                placeholder="PID, ชื่อ, โทรศัพท์, อาการ"
              />
            </label>

            <label>
              สาขา
              <select value={draftFilters.branchCode} onChange={(event) => updateDraft("branchCode", event.target.value)}>
                <option value="">ทุกสาขา</option>
                {branchOptions.map((branchCode) => (
                  <option key={branchCode} value={branchCode}>
                    {branchCode}
                  </option>
                ))}
              </select>
            </label>

            <label>
              เริ่มวันที่
              <input type="date" value={draftFilters.dateFrom} onChange={(event) => updateDraft("dateFrom", event.target.value)} />
            </label>

            <label>
              สิ้นสุดวันที่
              <input type="date" value={draftFilters.dateTo} onChange={(event) => updateDraft("dateTo", event.target.value)} />
            </label>

            <label>
              เลขประจำตัวประชาชน
              <input
                value={draftFilters.patientPid}
                onChange={(event) => updateDraft("patientPid", event.target.value)}
                placeholder="เช่น 1101..."
              />
            </label>

            <label>
              กลุ่มอาการ
              <input value={draftFilters.symptom} onChange={(event) => updateDraft("symptom", event.target.value)} placeholder="รหัสหรือชื่อ" />
            </label>

            <label>
              ยาที่จ่าย
              <input value={draftFilters.drug} onChange={(event) => updateDraft("drug", event.target.value)} placeholder="ชื่อยา" />
            </label>

            <label>
              เรียงตาม
              <select value={draftFilters.sort} onChange={(event) => updateDraft("sort", event.target.value)}>
                <option value="encounter_at">วันที่รับบริการ</option>
                <option value="patient_pid">เลขประจำตัวประชาชน</option>
                <option value="symptom_no">กลุ่มอาการ</option>
                <option value="followup_call">วันติดตามอาการ</option>
              </select>
            </label>

            <label>
              ทิศทาง
              <select value={draftFilters.dir} onChange={(event) => updateDraft("dir", event.target.value)}>
                <option value="DESC">ใหม่ → เก่า</option>
                <option value="ASC">เก่า → ใหม่</option>
              </select>
            </label>
          </div>

          <div className="form-actions">
            <button type="submit">ค้นหา</button>
            <button type="button" className="ghost" onClick={handleResetFilters}>
              ล้างตัวกรอง
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                const updated = { ...draftFilters, dateFrom: todayText, dateTo: todayText };
                setDraftFilters(updated);
                setFilters(updated);
                setPage(1);
              }}
            >
              วันนี้
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>รายการ encounter</h2>
            <p>{visibleRangeLabel()}</p>
          </div>
          <div className="toolbar">
            <button type="button" className="ghost" onClick={() => setPage((current) => Math.max(1, current - 1))}>
              ก่อนหน้า
            </button>
            <span className="page-chip">
              หน้า {page} / {maxPage}
            </span>
            <button type="button" onClick={() => setPage((current) => Math.min(maxPage, current + 1))}>
              ถัดไป
            </button>
          </div>
        </div>

        {loading ? <div className="notice">กำลังโหลดข้อมูล CiPData...</div> : null}
        {error ? <div className="notice error">{error}</div> : null}

        {!loading ? (
          <div className="table-shell">
            <table className="lookup-table lookup-table--legacy">
              <colgroup>
                <col style={{ width: "108px" }} />
                <col style={{ width: "56px" }} />
                <col style={{ width: "140px" }} />
                <col style={{ width: "130px" }} />
                <col style={{ width: "150px" }} />
                <col style={{ width: "120px" }} />
                <col style={{ width: "56px" }} />
                <col style={{ width: "160px" }} />
                <col style={{ width: "320px" }} />
                <col style={{ width: "260px" }} />
                <col style={{ width: "260px" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>ดู</th>
                  <th>สาขา</th>
                  <th>วันที่รับบริการ</th>
                  <th>เลขประจำตัวประชาชน</th>
                  <th>ชื่อ-สกุล</th>
                  <th>เบอร์โทรศัพท์ติดต่อ</th>
                  <th>รหัสอาการ</th>
                  <th>กลุ่มอาการ</th>
                  <th>คำอธิบายอาการ</th>
                  <th>รายการยาที่เภสัชกรจ่าย</th>
                  <th>หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {rows.length ? (
                  rows.map((row) => (
                    <tr key={row.encounterId}>
                      <td className="action-column">
                        <button type="button" className="row-action-button" onClick={() => setActiveRow(row)}>
                          รายละเอียด
                        </button>
                      </td>
                      <td>{row.branchNo || "-"}</td>
                      <td>{formatThaiDateTime(row.encounterAt)}</td>
                      <td>{row.patientPid || "-"}</td>
                      <td>{row.patientName || "-"}</td>
                      <td>{formatPhone(row.patientPhone)}</td>
                      <td>{row.symptomNo || "-"}</td>
                      <td>
                        {row.symptomName || "-"}
                      </td>
                      <td className="text-cell">{stripHtml(row.answersText) || "-"}</td>
                      <td>
                        <div className="drug-stack">
                          {normalizeDrugItems(row.medsJson || row.medsAmedTh).length ? (
                            normalizeDrugItems(row.medsJson || row.medsAmedTh).map((item) => (
                              <span key={item.id} className="qty-pill positive">
                                {item.name} x {item.qty}
                                {item.uom ? ` ${item.uom}` : ""}
                              </span>
                            ))
                          ) : (
                            <span className="subtle">-</span>
                          )}
                        </div>
                      </td>
                      <td>{row.warningNote ? <span className="warning-badge">{row.warningNote}</span> : "-"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="11" className="table-empty-state">
                      ไม่พบข้อมูลตามเงื่อนไขที่เลือก
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <EncounterDetailModal row={activeRow} rows={rows} onSelectRow={setActiveRow} onClose={() => setActiveRow(null)} />
    </div>
  );
}
