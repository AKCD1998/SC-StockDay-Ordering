import { useEffect, useState } from "react";

const ACTION_LABELS = {
  NO_ACTION: "สต็อกเพียงพอ ยังไม่ต้องขอเพิ่ม",
  NO_PURCHASE_SLOW_MOVING: "ยังไม่ควรสั่งเพิ่ม",
  TRANSFER_IN: "แนะนำขอจากสาขาอื่น",
  PURCHASE: "แนะนำแจ้งจัดซื้อ",
  TRANSFER_AND_PURCHASE: "แนะนำขอจากสาขาอื่นและแจ้งจัดซื้อ",
};

const FLAG_LABELS = {
  HAS_INCOMING_PO: "มีของจากใบสั่งซื้อกำลังเข้า",
  MISSING_COST: "ยังไม่มีข้อมูลต้นทุน",
  NEGATIVE_STOCK: "ยอดสต็อกติดลบ ควรตรวจสอบ",
  OVERSTOCK: "สต็อกสูงกว่าเป้าหมาย",
  SLOW_MOVING: "ไม่มียอดขายใน 90 วัน",
};

function formatQuantity(value, digits = 2) {
  if (value === null || value === undefined || value === "") return "-";
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return number.toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function recommendationHeadline(recommendation) {
  const label = ACTION_LABELS[recommendation.action] || "คำแนะนำจากข้อมูลสต็อกและยอดขาย";
  if (recommendation.action === "TRANSFER_IN") {
    return `${label} ${formatQuantity(recommendation.transferPlanQty)} ${recommendation.unit || "หน่วย"}`;
  }
  if (recommendation.action === "PURCHASE") {
    return `${label} ${formatQuantity(recommendation.purchaseQty)} ${recommendation.unit || "หน่วย"}`;
  }
  if (recommendation.action === "TRANSFER_AND_PURCHASE") {
    return `${label}: ขอ ${formatQuantity(recommendation.transferPlanQty)} และซื้อ ${formatQuantity(recommendation.purchaseQty)} ${recommendation.unit || "หน่วย"}`;
  }
  return label;
}

export default function BranchStockRecommendationSuggestion({ branchCode, productCode, request }) {
  const [view, setView] = useState({ status: "loading", recommendation: null, payload: null });

  useEffect(() => {
    if (!branchCode || !productCode || typeof request !== "function") {
      setView({ status: "hidden", recommendation: null, payload: null });
      return undefined;
    }

    const controller = new AbortController();
    let active = true;
    setView({ status: "loading", recommendation: null, payload: null });

    async function loadRecommendation() {
      try {
        const endpoint = `/api/admin/stock-recommendations/${encodeURIComponent(branchCode)}/${encodeURIComponent(productCode)}`;
        const response = await request(endpoint, { signal: controller.signal });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || `HTTP ${response.status}`);
        }
        if (!active) return;
        if (payload?.meta?.reader?.servedReader !== "normalized") {
          setView({ status: "hidden", recommendation: null, payload: null });
          return;
        }
        setView({
          status: payload.recommendation ? "ready" : "empty",
          recommendation: payload.recommendation || null,
          payload,
        });
      } catch (error) {
        if (!active || error?.name === "AbortError") return;
        setView({ status: "error", recommendation: null, payload: null });
      }
    }

    loadRecommendation();
    return () => {
      active = false;
      controller.abort();
    };
  }, [branchCode, productCode, request]);

  if (view.status === "loading" || view.status === "hidden") return null;

  if (view.status === "error") {
    return (
      <p className="rq-recommendation-note" role="status">
        คำแนะนำยังไม่พร้อม แต่ยังขอสินค้าได้ตามปกติ
      </p>
    );
  }

  if (view.status === "empty") {
    return (
      <section className="rq-recommendation-card" aria-label="คำแนะนำการเติมสินค้า">
        <div className="rq-recommendation-title">คำแนะนำ</div>
        <p className="rq-recommendation-reason">ยังไม่มีคำแนะนำสำหรับสินค้านี้</p>
        <p className="rq-recommendation-advisory">ใช้ประกอบการตัดสินใจเท่านั้น ระบบจะไม่ใส่จำนวนให้เอง</p>
      </section>
    );
  }

  const recommendation = view.recommendation;
  const targetDays = recommendation.targetDays ?? view.payload?.targetDays;
  const flagLabels = (recommendation.flags || []).map((flag) => FLAG_LABELS[flag]).filter(Boolean);

  return (
    <section className="rq-recommendation-card" aria-label="คำแนะนำการเติมสินค้า">
      <div className="rq-recommendation-heading">
        <span className="rq-recommendation-title">คำแนะนำ</span>
        <strong>{recommendationHeadline(recommendation)}</strong>
      </div>
      {recommendation.reason ? <p className="rq-recommendation-reason">{recommendation.reason}</p> : null}

      <div className="rq-recommendation-metrics">
        <span><small>สต็อกตอนนี้</small><strong>{formatQuantity(recommendation.currentStock)}</strong></span>
        <span><small>ขายเฉลี่ยที่ใช้คำนวณ/วัน</small><strong>{formatQuantity(recommendation.adjustedAdu, 3)}</strong></span>
        <span><small>เป้าหมาย {formatQuantity(targetDays, 0)} วัน</small><strong>{formatQuantity(recommendation.targetQty)}</strong></span>
        <span><small>ขาดจากเป้าหมาย</small><strong>{formatQuantity(recommendation.shortageQty)}</strong></span>
      </div>

      {(recommendation.donors || []).length > 0 ? (
        <div className="rq-recommendation-donors">
          <span>สาขาที่ช่วยเติมได้</span>
          <ul>
            {recommendation.donors.map((donor) => (
              <li key={donor.branchCode}>
                สาขา {donor.branchCode}: {formatQuantity(donor.qty)} {recommendation.unit || "หน่วย"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <details className="rq-recommendation-details">
        <summary>ดูรายละเอียดที่ใช้คำนวณ</summary>
        <dl>
          <div><dt>ขายย้อนหลัง 30 วัน</dt><dd>{formatQuantity(recommendation.soldQty30d)}</dd></div>
          <div><dt>เฉลี่ย 30 วัน/วัน</dt><dd>{formatQuantity(recommendation.adu30, 3)}</dd></div>
          <div><dt>ขายย้อนหลัง 90 วัน</dt><dd>{formatQuantity(recommendation.soldQty90d)}</dd></div>
          <div><dt>เฉลี่ย 90 วัน/วัน</dt><dd>{formatQuantity(recommendation.adu90, 3)}</dd></div>
          <div><dt>ของเข้าที่แบ่งให้สาขานี้</dt><dd>{formatQuantity(recommendation.incomingPoAllocationQty)}</dd></div>
          <div><dt>สต็อกเมื่อรวมของเข้า</dt><dd>{formatQuantity(recommendation.effectiveStock)}</dd></div>
          <div><dt>พอขายประมาณ</dt><dd>{recommendation.effectiveDaysCover == null ? "-" : `${formatQuantity(recommendation.effectiveDaysCover, 1)} วัน`}</dd></div>
          <div><dt>แนะนำขอจากสาขาอื่น</dt><dd>{formatQuantity(recommendation.transferPlanQty)}</dd></div>
          <div><dt>แนะนำจัดซื้อ</dt><dd>{formatQuantity(recommendation.purchaseQty)}</dd></div>
        </dl>
        {flagLabels.length > 0 ? (
          <ul className="rq-recommendation-flags">
            {flagLabels.map((label) => <li key={label}>{label}</li>)}
          </ul>
        ) : null}
      </details>

      <p className="rq-recommendation-advisory">ใช้ประกอบการตัดสินใจเท่านั้น ระบบจะไม่ใส่จำนวนให้เอง</p>
    </section>
  );
}
