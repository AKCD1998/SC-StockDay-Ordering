export function shopee004StockStatusMessage(summary) {
  const count = value => Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString("th-TH") : null;
  switch (summary?.status) {
    case "available": return "หักยอดจอง Shopee แล้ว";
    case "shopee-orders-need-review": return `Shopee รอตรวจ${count(summary.reviewOrders) ? ` ${count(summary.reviewOrders)} ออเดอร์` : "ออเดอร์"} — ยอด POS ยังแสดงแยกไว้`;
    case "shopee-orders-processing": return `Shopee กำลังประมวลผล${count(summary.pendingOrders) ? ` ${count(summary.pendingOrders)} ออเดอร์` : "ออเดอร์"}`;
    case "projection-timeout": return "อ่านข้อมูล Shopee ไม่ทันเวลา — ยอด POS ยังแสดงแยกไว้";
    case "reservation-paused-holds-retained": return "ระบบจอง Shopee พักอยู่ — ยังไม่แสดงยอดพร้อมใช้";
    case "projection-unavailable": return "ติดต่อข้อมูล Shopee ไม่สำเร็จ — ยอด POS ยังแสดงแยกไว้";
    case "reference": return "แสดงยอดอ้างอิงล่าสุดพร้อมเวลา — ยังยืนยันยอดพร้อมใช้ปัจจุบันไม่ได้";
    case "partial": return "ยอดพร้อมใช้บางรายการยังยืนยันไม่ได้ — ดูรายการที่รอตรวจ";
    case "partial-known-commitments": return `ยอดชั่วคราว — ยังไม่รวม ${count(summary.unallocatedOrders) ?? "บาง"} ออเดอร์ที่รอจับคู่สินค้า`;
    default: return "ข้อมูล Shopee ยังไม่พร้อม — ดูยอด POS แยกใต้แต่ละรายการ";
  }
}

export function shopee004StockStatusShortMessage(summary) {
  const pending = Number.isSafeInteger(summary?.unallocatedOrders) && summary.unallocatedOrders > 0
    ? ` · ${summary.unallocatedOrders.toLocaleString("th-TH")} ออเดอร์` : "";
  switch (summary?.status) {
    case "available": return "Shopee หักจองแล้ว";
    case "partial-known-commitments": return `Shopee ยังไม่ครบ${pending}`;
    case "partial": return "Shopee รอตรวจบางรายการ";
    case "shopee-orders-need-review": return "Shopee มีออเดอร์รอตรวจ";
    case "shopee-orders-processing": return "Shopee รอประมวลผล";
    case "reference": return "Shopee ยอดอ้างอิง";
    case "reservation-paused-holds-retained": return "Shopee พักอยู่";
    default: return "Shopee ยังไม่พร้อม";
  }
}
