import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { formatBranchLabel } from "../lib/requestCart";

export default function CartPage() {
  const navigate = useNavigate();
  const { groupedLines, lineCount, totalUnits, patchLine, removeLine, clearCart } = useCart();

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>ตะกร้าคำขอ</h2>
          <p>รวมรายการตามสาขาต้นทาง พร้อมกติกา merge แบบ product + source + unit</p>
        </div>

        {lineCount ? (
          <button type="button" className="ghost" onClick={clearCart}>
            ล้างตะกร้า
          </button>
        ) : null}
      </div>

      <div className="summary-grid cart-summary-grid">
        <article className="summary-card">
          <span>จำนวนบรรทัด</span>
          <strong>{lineCount}</strong>
        </article>
        <article className="summary-card">
          <span>จำนวนหน่วยรวม</span>
          <strong>{totalUnits}</strong>
        </article>
      </div>

      {!lineCount ? (
        <div className="empty-cart-card">
          <p className="empty-state">ยังไม่มีรายการในตะกร้า</p>
          <Link to="/stock" className="text-link">
            กลับไปเลือกสินค้าจากหน้าสต็อกสาขา
          </Link>
        </div>
      ) : (
        <div className="cart-groups">
          {groupedLines.map((group) => (
            <section key={group.sourceBranchCode} className="cart-group-card">
              <header className="cart-group-header">
                <div>
                  <h3>{formatBranchLabel(group.sourceBranchCode, group.sourceBranchName)}</h3>
                  <p className="subtle">รวม {group.totalUnits.toLocaleString("th-TH")} หน่วย</p>
                </div>
              </header>

              <div className="basket">
                {group.lines.map((line) => (
                  <article className="basket-row request-basket-row" key={line.lineKey}>
                    <div className="basket-main">
                      <strong>{line.productNameThai || line.productNameEng || line.productCode}</strong>
                      <span>
                        {line.productCode} · snapshot {Number(line.snapshotQty || 0).toLocaleString("th-TH")} {line.unit || ""}
                      </span>
                    </div>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={line.requestedQty}
                      onChange={(event) => patchLine(line.lineKey, { requestedQty: event.target.value })}
                    />
                    <input value={line.unit} readOnly />
                    <input
                      value={line.lineNote || ""}
                      onChange={(event) => patchLine(line.lineKey, { lineNote: event.target.value })}
                      placeholder="หมายเหตุรายบรรทัด"
                    />
                    <button type="button" className="ghost" onClick={() => removeLine(line.lineKey)}>
                      ลบ
                    </button>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {lineCount ? (
        <div className="modal-actions">
          <button
            type="button"
            className="primary review-submit-button"
            onClick={() => navigate("/cart/review")}
          >
            สร้างคำขอสินค้า
          </button>
        </div>
      ) : null}
    </section>
  );
}
