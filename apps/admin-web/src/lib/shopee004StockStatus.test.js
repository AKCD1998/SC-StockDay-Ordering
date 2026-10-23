import { describe, it, expect } from "vitest";
import { shopee004StockStatusMessage } from "./shopee004StockStatus.js";
describe("Shopee source diagnostics",()=>{
  it.each([
    [{status:"available"},"หักยอดจอง Shopee แล้ว"],
    [{status:"shopee-orders-need-review",reviewOrders:2},"2 ออเดอร์"],
    [{status:"shopee-orders-processing",pendingOrders:1},"กำลังประมวลผล 1 ออเดอร์"],
    [{status:"projection-timeout"},"ไม่ทันเวลา"],
    [{status:"projection-unavailable"},"ติดต่อข้อมูล Shopee ไม่สำเร็จ"],
    [{status:"reservation-paused-holds-retained"},"พักอยู่"],
    [{status:"partial"},"บางรายการ"],
    [{status:"unknown-new-code"},"ข้อมูล Shopee ยังไม่พร้อม"],
  ])("explains each source state without claiming POS failed",(input,text)=>{
    expect(shopee004StockStatusMessage(input)).toContain(text);
  });
  it("does not render invalid counts or undefined",()=>{
    expect(shopee004StockStatusMessage({status:"shopee-orders-need-review",reviewOrders:-1})).not.toMatch(/-1|undefined/);
  });
});
