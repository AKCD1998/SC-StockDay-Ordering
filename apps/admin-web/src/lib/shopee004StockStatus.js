export function shopee004StockStatusMessage(summary) {
  const count = value => Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString("th-TH") : null;
  switch (summary?.status) {
    case "available": return "หักยอดจอง Shopee แล้ว";
    case "shopee-orders-need-review": return `Shopee รอตรวจ${count(summary.reviewOrders) ? ` ${count(summary.reviewOrders)} ออเดอร์` : "ออเดอร์"} — ยอด POS ยังแสดงแยกไว้`;
    case "shopee-orders-processing": return `Shopee กำลังประมวลผล${count(summary.pendingOrders) ? ` ${count(summary.pendingOrders)} ออเดอร์` : "ออเดอร์"}`;
    case "projection-timeout": return "อ่านข้อมูล Shopee ไม่ทันเวลา — ยอด POS ยังแสดงแยกไว้";
    case "reservation-paused-holds-retained": return "ระบบจอง Shopee พักอยู่ — ยังไม่แสดงยอดพร้อมใช้";
    case "projection-unavailable": return "ติดต่อข้อมูล Shopee ไม่สำเร็จ — ยอด POS ยังแสดงแยกไว้";
    case "partial": return "ยอดพร้อมใช้บางรายการยังยืนยันไม่ได้ — ดูรายการที่รอตรวจ";
    default: return "ข้อมูล Shopee ยังไม่พร้อม — ดูยอด POS แยกใต้แต่ละรายการ";
  }
}
