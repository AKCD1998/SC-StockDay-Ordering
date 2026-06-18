// Shared status vocabulary + formatting for stock-request UIs (WP-06/07+).

export const STATUS_LABELS = {
  DRAFT: "ฉบับร่าง",
  SUBMITTED: "รอตอบกลับ",
  PARTIALLY_RESPONDED: "ตอบกลับบางส่วน",
  RESPONDED: "ตอบกลับแล้ว",
  ACKNOWLEDGED: "รับทราบแล้ว",
  COMPLETED: "เสร็จสิ้น",
  CANCELLED: "ยกเลิก",
  READY_TO_DISPATCH: "พร้อมจัดส่ง",
  DISPATCHED: "จัดส่งแล้ว",
  RECEIVED: "รับสินค้าแล้ว",
  // line + response statuses
  PENDING: "รอตอบกลับ",
  APPROVED_FULL: "อนุมัติเต็มจำนวน",
  APPROVED_PARTIAL: "อนุมัติบางส่วน",
  REJECTED: "ปฏิเสธ",
};

export function statusLabel(status) {
  return STATUS_LABELS[status] || status || "-";
}

export function formatDateTime(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("th-TH");
  } catch (_error) {
    return String(value);
  }
}
