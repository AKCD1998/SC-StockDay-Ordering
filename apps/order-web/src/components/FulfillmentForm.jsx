import { useState } from "react";

// Shared per-line quantity form used for both dispatch (source) and receive
// (requester). Produces an array of { lineId, [qtyField]: number } for the parent.
export default function FulfillmentForm({
  lines,
  qtyField,
  defaultQtyKey,
  submitLabel,
  busy,
  onSubmit,
}) {
  const [draft, setDraft] = useState(() =>
    Object.fromEntries(
      lines.map((line) => [line.lineId, String(line[defaultQtyKey] ?? line.requestedQty ?? "")]),
    ),
  );

  function setQty(lineId, value) {
    setDraft((current) => ({ ...current, [lineId]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    const payloadLines = lines.map((line) => ({
      lineId: line.lineId,
      [qtyField]: Number(draft[line.lineId]) || 0,
    }));
    onSubmit(payloadLines);
  }

  return (
    <form className="fulfillment-form" onSubmit={handleSubmit}>
      {lines.map((line) => (
        <div key={line.lineId} className="fulfillment-row">
          <span className="fulfillment-name">
            {line.productNameThai || line.productNameEng || line.productCode}
          </span>
          <input
            type="number"
            min="0"
            step="1"
            value={draft[line.lineId]}
            aria-label={`จำนวนสำหรับ ${line.productCode}`}
            onChange={(event) => setQty(line.lineId, event.target.value)}
          />
          <span className="subtle">{line.unit || ""}</span>
        </div>
      ))}
      <div className="modal-actions">
        <button type="submit" className="primary" disabled={busy}>
          {busy ? "กำลังบันทึก..." : submitLabel}
        </button>
      </div>
    </form>
  );
}
