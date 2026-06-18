import { useEffect, useMemo, useState } from "react";
import { formatBranchLabel, normalizeRequestedQty } from "../lib/requestCart";

function getBranchQty(row, branchCode) {
  return Number(row?.[`qtyBranch${branchCode}`] || 0);
}

function isSnapshotStale(syncedAt) {
  if (!syncedAt) return false;
  const ageMs = Date.now() - new Date(syncedAt).getTime();
  return ageMs > 24 * 60 * 60 * 1000;
}

export default function ProductRequestModal({
  open,
  product,
  branches,
  currentBranchCode,
  onClose,
  onAddToCart,
}) {
  const [quantities, setQuantities] = useState({});
  const [error, setError] = useState("");

  const availableBranches = useMemo(() => {
    if (!product) return [];
    return branches
      .map((branch) => ({
        ...branch,
        qty: getBranchQty(product, branch.branchCode),
      }))
      .filter((branch) => branch.branchCode !== currentBranchCode && branch.qty > 0);
  }, [branches, currentBranchCode, product]);

  useEffect(() => {
    if (!open) return undefined;

    const nextQuantities = Object.fromEntries(
      availableBranches.map((branch) => [branch.branchCode, ""]),
    );
    setQuantities(nextQuantities);
    setError("");

    function handleEscape(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [availableBranches, onClose, open]);

  if (!open || !product) return null;

  function updateQty(branchCode, value) {
    setQuantities((current) => ({
      ...current,
      [branchCode]: value,
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();

    const selectedLines = [];

    for (const branch of availableBranches) {
      const rawValue = quantities[branch.branchCode];
      if (rawValue === "" || rawValue == null) continue;

      const qty = normalizeRequestedQty(rawValue);
      if (qty > branch.qty) {
        setError(`จำนวนที่ขอจาก ${branch.branchCode} มากกว่าสต็อกที่มีอยู่`);
        return;
      }

      selectedLines.push({
        productCode: product.productCode,
        productNameThai: product.productNameThai || "",
        productNameEng: product.productNameEng || "",
        barcode: product.barcode || "",
        unit: product.unit || "",
        sourceBranchCode: branch.branchCode,
        sourceBranchName: branch.branchName || "",
        requestedQty: qty,
        snapshotQty: branch.qty,
        snapshotSyncedAt: product.syncedAt || null,
      });
    }

    if (!selectedLines.length) {
      setError("กรุณาระบุจำนวนอย่างน้อย 1 สาขา");
      return;
    }

    onAddToCart(selectedLines);
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-request-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">เพิ่มลงตะกร้าคำขอ</p>
            <h2 id="product-request-modal-title">{product.productNameThai || product.productNameEng || product.productCode}</h2>
            <p className="subtle">
              {product.productCode} · {product.barcode || "ไม่มี barcode"} · {product.unit || "-"}
            </p>
          </div>
          <button type="button" className="ghost" onClick={onClose}>
            ปิด
          </button>
        </div>

        {isSnapshotStale(product.syncedAt) ? (
          <div className="notice warning compact-notice">
            snapshot นี้เก่ากว่า 24 ชั่วโมง กรุณาตรวจสอบก่อนส่งคำขอจริงในขั้นตอนถัดไป
          </div>
        ) : null}

        {!availableBranches.length ? (
          <div className="notice warning compact-notice">
            รายการนี้ไม่มีสต็อกจากสาขาอื่นให้เลือก
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="modal-form">
            <div className="branch-choice-list">
              {availableBranches.map((branch) => (
                <label key={branch.branchCode} className="branch-choice-card">
                  <div>
                    <strong>{formatBranchLabel(branch.branchCode, branch.branchName)}</strong>
                    <p className="subtle">
                      สต็อก snapshot: {branch.qty.toLocaleString("th-TH")} {product.unit || ""}
                    </p>
                  </div>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    value={quantities[branch.branchCode] ?? ""}
                    onChange={(event) => updateQty(branch.branchCode, event.target.value)}
                    placeholder="จำนวนที่ต้องการ"
                  />
                </label>
              ))}
            </div>

            {error ? <p className="message error-text">{error}</p> : null}

            <div className="modal-actions">
              <button type="button" className="ghost" onClick={onClose}>
                ยกเลิก
              </button>
              <button type="submit">เพิ่มลงตะกร้าคำขอ</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
