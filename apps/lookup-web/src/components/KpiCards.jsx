import { formatInteger, formatThaiDate } from "../lib/format.js";

const cardConfig = [
  {
    key: "todayCount",
    label: "จำนวนเคสวันนี้",
    helper: (data) => formatThaiDate(data?.todayDate),
  },
  {
    key: "accumCount",
    label: "จำนวนเคสสะสม",
    helper: (data) => data?.accumLabel || "-",
  },
  {
    key: "target",
    label: "เป้าหมายต่อเดือน",
    helper: () => "ปรับจาก local preference ได้",
  },
  {
    key: "remaining",
    label: "เหลืออีก",
    helper: () => "เคสที่ยังต้องทำให้ถึงเป้า",
  },
  {
    key: "perDay",
    label: "ต้องทำต่อวัน",
    helper: () => "เฉลี่ยจากวันคงเหลือในเดือน",
  },
  {
    key: "remainingDays",
    label: "วันคงเหลือ",
    helper: () => "นับตั้งแต่วันถัดไปจนถึงสิ้นเดือน",
  },
];

export default function KpiCards({ data }) {
  return (
    <div className="summary-grid kpi-grid">
      {cardConfig.map((card) => (
        <article key={card.key} className="summary-card">
          <span>{card.label}</span>
          <strong>{formatInteger(data?.[card.key] || 0)}</strong>
          <small>{card.helper(data)}</small>
        </article>
      ))}
    </div>
  );
}
