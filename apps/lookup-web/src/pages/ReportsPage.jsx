import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { toDateInputValue } from "../lib/format.js";

const today = toDateInputValue(new Date());

export default function ReportsPage() {
  const navigate = useNavigate();
  const [branches, setBranches] = useState([]);
  const [form, setForm] = useState({
    reportType: "range",
    dateFrom: today,
    dateTo: today,
    branchCode: "",
    patientPid: "",
    symptom: "",
    drug: "",
  });

  useEffect(() => {
    api.getBranches().then((payload) => setBranches(payload.branches || [])).catch(() => setBranches([]));
  }, []);

  function updateField(key, value) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handlePreview(event) {
    event.preventDefault();
    const params = new URLSearchParams();
    Object.entries(form).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      }
    });
    navigate(`/reports/preview?${params.toString()}`);
  }

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Report builder</h2>
            <p>แทน GAS PDF generation ด้วย preview route ที่ shared backend สามารถใช้สร้าง printable output ได้</p>
          </div>
        </div>

        <form className="filter-form" onSubmit={handlePreview}>
          <div className="filter-grid">
            <label>
              ประเภทรายงาน
              <select value={form.reportType} onChange={(event) => updateField("reportType", event.target.value)}>
                <option value="range">ช่วงวันที่</option>
                <option value="followup_today">ติดตามอาการ</option>
                <option value="yesterday">สรุปเคสเมื่อวาน</option>
                <option value="week">รายสัปดาห์</option>
                <option value="month">รายเดือน</option>
              </select>
            </label>
            <label>
              เริ่มวันที่
              <input type="date" value={form.dateFrom} onChange={(event) => updateField("dateFrom", event.target.value)} />
            </label>
            <label>
              สิ้นสุดวันที่
              <input type="date" value={form.dateTo} onChange={(event) => updateField("dateTo", event.target.value)} />
            </label>
            <label>
              สาขา
              <select value={form.branchCode} onChange={(event) => updateField("branchCode", event.target.value)}>
                <option value="">ทุกสาขา</option>
                {branches.map((branch) => (
                  <option key={branch.branchCode} value={branch.branchCode}>
                    {branch.branchCode}
                  </option>
                ))}
              </select>
            </label>
            <label>
              PID
              <input value={form.patientPid} onChange={(event) => updateField("patientPid", event.target.value)} />
            </label>
            <label>
              กลุ่มอาการ
              <input value={form.symptom} onChange={(event) => updateField("symptom", event.target.value)} />
            </label>
            <label>
              ยาที่จ่าย
              <input value={form.drug} onChange={(event) => updateField("drug", event.target.value)} />
            </label>
          </div>

          <div className="form-actions">
            <button type="submit">เปิดตัวอย่างรายงาน</button>
          </div>
        </form>
      </section>
    </div>
  );
}
