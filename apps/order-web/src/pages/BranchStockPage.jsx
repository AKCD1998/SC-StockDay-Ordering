import { useEffect, useMemo, useState } from "react";
import BranchStockTable from "../components/BranchStockTable";
import ProductRequestModal from "../components/ProductRequestModal";
import RequestModeToggle from "../components/RequestModeToggle";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";

const fallbackBranches = [
  { branchCode: "000", branchName: "HQ" },
  { branchCode: "001", branchName: "" },
  { branchCode: "003", branchName: "" },
  { branchCode: "004", branchName: "" },
  { branchCode: "005", branchName: "" },
];

function getBranchQty(row, branchCode) {
  return Number(row?.[`qtyBranch${branchCode}`] || 0);
}

function normalizeBranchStockRecord(row) {
  return {
    productCode: row.productCode || "",
    productNameThai: row.productNameThai || row.productName || "",
    productNameEng: row.productNameEng || "",
    barcode: row.barcode || "",
    unit: row.unit || "",
    qtyBranch000: Number(row.qtyBranch000 || 0),
    qtyBranch001: Number(row.qtyBranch001 || 0),
    qtyBranch002: Number(row.qtyBranch002 || 0),
    qtyBranch003: Number(row.qtyBranch003 || 0),
    qtyBranch004: Number(row.qtyBranch004 || 0),
    qtyBranch005: Number(row.qtyBranch005 || 0),
    qtyTotalAllBranches: Number(row.qtyTotalAllBranches || 0),
    syncedAt: row.syncedAt || null,
  };
}

export default function BranchStockPage() {
  const { session } = useAuth();
  const { addLines } = useCart();
  const [rows, setRows] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [appliedSearchTerm, setAppliedSearchTerm] = useState("");
  const [requestMode, setRequestMode] = useState(false);
  const [activeProduct, setActiveProduct] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [flashMessage, setFlashMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        setLoading(true);
        setError("");

        const [branchData, stockData] = await Promise.all([
          api.getBranches().catch(() => fallbackBranches),
          api.getBranchStock({ search: appliedSearchTerm, limit: 250, offset: 0 }),
        ]);

        if (!active) return;

        const records = Array.isArray(stockData?.records) ? stockData.records : [];
        setBranches(Array.isArray(branchData) && branchData.length ? branchData : fallbackBranches);
        setRows(records.map(normalizeBranchStockRecord));
      } catch (loadError) {
        if (!active) return;
        setError(loadError.message || "โหลดข้อมูลสต็อกสาขาไม่สำเร็จ");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadData();
    return () => {
      active = false;
    };
  }, [appliedSearchTerm, refreshKey]);

  useEffect(() => {
    if (!flashMessage) return undefined;
    const timeoutId = window.setTimeout(() => setFlashMessage(""), 2600);
    return () => window.clearTimeout(timeoutId);
  }, [flashMessage]);

  const visibleBranches = useMemo(() => {
    const source = branches.length ? branches : fallbackBranches;
    return source.filter((branch) => /^00\d$/.test(branch.branchCode) || branch.branchCode === "000");
  }, [branches]);

  const requestableSkuCount = useMemo(
    () =>
      rows.filter((row) =>
        visibleBranches.some(
          (branch) => branch.branchCode !== session?.branchCode && getBranchQty(row, branch.branchCode) > 0,
        ),
      ).length,
    [rows, session?.branchCode, visibleBranches],
  );

  function handleSearchSubmit(event) {
    event.preventDefault();
    setAppliedSearchTerm(searchTerm.trim());
  }

  function handleAddToCart(lines) {
    addLines(lines);
    setActiveProduct(null);
    setFlashMessage(`เพิ่มลงตะกร้าแล้ว ${lines.length} รายการ`);
  }

  return (
    <>
      <section className="panel">
        <div className="panel-header stacked">
          <div>
            <h2>สต็อกแยกตามสาขา</h2>
            <p>
              เลือกสินค้าแล้วเปิดโหมดขอสินค้าเพื่อเพิ่มรายการจากสาขาอื่นเข้าตะกร้า โดยสาขาปัจจุบันคือ{" "}
              <strong>{session?.branchCode || "-"}</strong>
            </p>
          </div>

          <div className="toolbar cluster-toolbar">
            <form className="search-row inline-search" onSubmit={handleSearchSubmit}>
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="ค้นหารหัสสินค้า ชื่อไทย ชื่ออังกฤษ หรือ barcode"
              />
              <button type="submit">ค้นหา</button>
              <button type="button" className="ghost" onClick={() => setRefreshKey((value) => value + 1)}>
                รีเฟรช
              </button>
            </form>
            <RequestModeToggle active={requestMode} onToggle={() => setRequestMode((value) => !value)} />
          </div>
        </div>

        <div className="summary-grid">
          <article className="summary-card">
            <span>จำนวน SKU ที่แสดง</span>
            <strong>{rows.length.toLocaleString("th-TH")}</strong>
          </article>
          <article className="summary-card">
            <span>SKU ที่ขอได้จากสาขาอื่น</span>
            <strong>{requestableSkuCount.toLocaleString("th-TH")}</strong>
          </article>
        </div>

        {flashMessage ? <div className="notice success compact-notice">{flashMessage}</div> : null}
        {error ? <div className="notice error">{error}</div> : null}
        {loading ? <div className="notice">กำลังโหลดข้อมูลสต็อกสาขา...</div> : null}
        {!loading ? (
          <BranchStockTable
            rows={rows}
            currentBranchCode={session?.branchCode || ""}
            branchOptions={visibleBranches}
            requestMode={requestMode}
            onPickProduct={setActiveProduct}
          />
        ) : null}
      </section>

      <ProductRequestModal
        open={Boolean(activeProduct)}
        product={activeProduct}
        branches={visibleBranches}
        currentBranchCode={session?.branchCode || ""}
        onClose={() => setActiveProduct(null)}
        onAddToCart={handleAddToCart}
      />
    </>
  );
}
