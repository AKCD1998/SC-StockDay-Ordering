// WP-08 client-side response helpers. Mirrors the backend rules in
// services/stockRequests.js (normalizeLineResponseInput) so the UI can validate
// before POST /api/stock-requests/incoming/:id/submit-response.

export const RESPONSE_STATUSES = ["APPROVED_FULL", "APPROVED_PARTIAL", "REJECTED"];

// Build the initial editable draft state for a request's lines.
export function initResponseDraft(lines = []) {
  const draft = {};
  for (const line of lines) {
    draft[line.lineId] = {
      responseStatus: "APPROVED_FULL",
      approvedQty: line.requestedQty,
      reasonCode: "",
      note: "",
    };
  }
  return draft;
}

// Validate a single line's draft against its requested qty. Returns an error
// string (Thai) or null when valid.
export function validateLineDraft(draftLine, line) {
  if (!draftLine || !RESPONSE_STATUSES.includes(draftLine.responseStatus)) {
    return "กรุณาเลือกผลการตอบกลับ";
  }

  if (draftLine.responseStatus === "APPROVED_PARTIAL") {
    const qty = Number(draftLine.approvedQty);
    if (!Number.isFinite(qty) || qty <= 0 || qty >= Number(line.requestedQty)) {
      return "จำนวนอนุมัติบางส่วนต้องมากกว่า 0 และน้อยกว่าจำนวนที่ขอ";
    }
    if (!String(draftLine.reasonCode || "").trim() && !String(draftLine.note || "").trim()) {
      return "การอนุมัติบางส่วนต้องระบุเหตุผล";
    }
  }

  if (draftLine.responseStatus === "REJECTED") {
    if (!String(draftLine.reasonCode || "").trim() && !String(draftLine.note || "").trim()) {
      return "การปฏิเสธต้องระบุเหตุผล";
    }
  }

  return null;
}

// Validate the full draft; returns a map of lineId -> error for invalid lines.
export function validateResponseDraft(draft, lines = []) {
  const errors = {};
  for (const line of lines) {
    const error = validateLineDraft(draft[line.lineId], line);
    if (error) {
      errors[line.lineId] = error;
    }
  }
  return errors;
}

// Build the submit-response request body from the editable draft.
export function buildResponseSubmitBody(draft, lines = [], version) {
  return {
    version,
    responses: lines.map((line) => {
      const draftLine = draft[line.lineId] || {};
      const responseStatus = draftLine.responseStatus;
      const body = {
        lineId: line.lineId,
        responseStatus,
        reasonCode: String(draftLine.reasonCode || "").trim() || undefined,
        note: String(draftLine.note || "").trim() || undefined,
      };
      if (responseStatus === "APPROVED_PARTIAL") {
        body.approvedQty = Number(draftLine.approvedQty);
      }
      return body;
    }),
  };
}
