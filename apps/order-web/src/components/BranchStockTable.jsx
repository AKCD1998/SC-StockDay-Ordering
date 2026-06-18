function formatNumber(value) {
  return Number(value || 0).toLocaleString("th-TH");
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("th-TH");
}

function getBranchQty(row, branchCode) {
  return Number(row?.[`qtyBranch${branchCode}`] || 0);
}

function canRequestFromOtherBranch(row, currentBranchCode, branchOptions) {
  return branchOptions.some(
    (branch) => branch.branchCode !== currentBranchCode && getBranchQty(row, branch.branchCode) > 0,
  );
}

export default function BranchStockTable({
  rows,
  currentBranchCode,
  branchOptions,
  requestMode,
  onPickProduct,
}) {
  if (!rows.length) {
    return <p className="empty-state table-empty-state">ยังไม่มีข้อมูลสต็อกสำหรับเงื่อนไขที่เลือก</p>;
  }

  return (
    <div className="table-shell">
      <table className="branch-stock-table">
        <thead>
          <tr>
            {requestMode ? <th className="action-column">#</th> : null}
            <th>รหัสสินค้า</th>
            <th>ชื่อสินค้า</th>
            <th>Barcode</th>
            <th>หน่วย</th>
            {branchOptions.map((branch) => (
              <th
                key={branch.branchCode}
                className={branch.branchCode === currentBranchCode ? "current-branch-column" : ""}
              >
                {branch.branchCode}
              </th>
            ))}
            <th>รวมทุกสาขา</th>
            <th>sync ล่าสุด</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const requestable = canRequestFromOtherBranch(row, currentBranchCode, branchOptions);

            return (
              <tr key={`${row.productCode}-${row.unit || "unit"}`}>
                {requestMode ? (
                  <td className="action-column">
                    <button
                      type="button"
                      className="request-plus-button"
                      disabled={!requestable}
                      onClick={() => onPickProduct(row)}
                      aria-label={`ขอสินค้า ${row.productCode}`}
                    >
                      +
                    </button>
                  </td>
                ) : null}
                <td>
                  <strong>{row.productCode}</strong>
                </td>
                <td>
                  <div className="product-name-cell">
                    <strong>{row.productNameThai || row.productNameEng || "-"}</strong>
                    {row.productNameEng ? <span>{row.productNameEng}</span> : null}
                  </div>
                </td>
                <td>{row.barcode || "-"}</td>
                <td>{row.unit || "-"}</td>
                {branchOptions.map((branch) => {
                  const qty = getBranchQty(row, branch.branchCode);
                  return (
                    <td
                      key={`${row.productCode}-${branch.branchCode}`}
                      className={branch.branchCode === currentBranchCode ? "current-branch-column" : ""}
                    >
                      <span className={qty > 0 ? "qty-pill positive" : "qty-pill"}>{formatNumber(qty)}</span>
                    </td>
                  );
                })}
                <td>{formatNumber(row.qtyTotalAllBranches)}</td>
                <td>{formatDateTime(row.syncedAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
