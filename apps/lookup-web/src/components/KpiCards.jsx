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
];

export default function KpiCards({ data }) {
  if (!data) {
    return (
      <div className="summary-grid kpi-grid">
        {cardConfig.map((card) => (
          <article key={card.key} className="summary-card summary-card--loading" aria-hidden="true">
            <span>{card.label}</span>
            <strong className="skeleton-block skeleton-block--value" />
            <small className="skeleton-block skeleton-block--meta" />
          </article>
        ))}
      </div>
    );
  }

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
