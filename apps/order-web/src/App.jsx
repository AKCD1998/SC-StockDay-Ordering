import { useEffect, useMemo, useState } from "react";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

export default function App() {
  const [branches, setBranches] = useState([]);
  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("");
  const [requestedBy, setRequestedBy] = useState("");
  const [requestNote, setRequestNote] = useState("");
  const [draftItems, setDraftItems] = useState([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [pageError, setPageError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadBranches() {
      try {
        setLoadingBranches(true);
        setPageError("");

        const response = await fetch(`${apiBaseUrl}/api/branches`);
        if (!response.ok) {
          throw new Error("โหลดรายชื่อสาขาไม่สำเร็จ");
        }

        const data = await response.json();
        if (!active) return;

        setBranches(data);
        if (data[0]) {
          setSelectedBranch(data[0].branchCode);
        }
      } catch (loadError) {
        if (!active) return;
        setPageError(loadError.message || "โหลดรายชื่อสาขาไม่สำเร็จ");
      } finally {
        if (active) {
          setLoadingBranches(false);
        }
      }
    }

    loadBranches();

    return () => {
      active = false;
    };
  }, []);

  async function searchProducts(nextQuery = query) {
    const normalizedQuery = nextQuery.trim();
    if (!normalizedQuery) {
      setProducts([]);
      setMessage("กรอกรหัสสินค้า บาร์โค้ด หรือชื่อสินค้าก่อนค้นหา");
      return;
    }

    try {
      setSearching(true);
      setMessage("");

      const response = await fetch(
        `${apiBaseUrl}/api/products/search?q=${encodeURIComponent(normalizedQuery)}`,
      );

      if (!response.ok) {
        throw new Error("ค้นหาสินค้าไม่สำเร็จ");
      }

      const data = await response.json();
      setProducts(data);

      if (data.length === 0) {
        setMessage("ไม่พบสินค้าที่ตรงกับคำค้น");
      }
    } catch (searchError) {
      setMessage(searchError.message || "ค้นหาสินค้าไม่สำเร็จ");
    } finally {
      setSearching(false);
    }
  }

  function addProduct(product) {
    setDraftItems((current) => {
      if (current.some((item) => item.productCode === product.productCode)) return current;

      return [
        ...current,
        {
          productCode: product.productCode,
          productName: product.productName,
          requestedQty: 1,
          requestedUnit: product.unit,
          lineNote: "",
        },
      ];
    });
    setMessage("");
  }

  function updateItem(productCode, field, value) {
    setDraftItems((current) =>
      current.map((item) => (item.productCode === productCode ? { ...item, [field]: value } : item)),
    );
  }

  function removeItem(productCode) {
    setDraftItems((current) => current.filter((item) => item.productCode !== productCode));
  }

  async function submitRequest(event) {
    event.preventDefault();

    if (!selectedBranch) {
      setMessage("กรุณาเลือกสาขาก่อนส่งคำขอ");
      return;
    }

    if (!requestedBy.trim()) {
      setMessage("กรุณากรอกชื่อผู้ขอ");
      return;
    }

    if (draftItems.length === 0) {
      setMessage("กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(`${apiBaseUrl}/api/order-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchCode: selectedBranch,
          requestedBy: requestedBy.trim(),
          note: requestNote.trim(),
          items: draftItems,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "ส่งคำขอสั่งสินค้าไม่สำเร็จ");
      }

      setDraftItems([]);
      setRequestNote("");
      setMessage(`ส่งคำขอเรียบร้อย เลขที่: ${data.id}`);
    } catch (submitError) {
      setMessage(submitError.message || "ส่งคำขอสั่งสินค้าไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const totalLines = draftItems.length;
  const totalUnits = useMemo(
    () => draftItems.reduce((sum, item) => sum + Number(item.requestedQty || 0), 0),
    [draftItems],
  );

  const branchDisabled = loadingBranches || branches.length === 0;

  return (
    <div className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">SC-StockDay-Ordering</p>
          <h1>ฟอร์มขอสั่งสินค้าสาขา</h1>
          <p className="subtle">
            พนักงานสาขาส่งคำขอผ่านหน้านี้ โดยคำขอจะอยู่ใน workflow ภายในของเรา และไม่เขียนลง
            adaPOS โดยตรง
          </p>
        </div>

        <div className="hero-card">
          <label>
            สาขา
            <select
              value={selectedBranch}
              onChange={(event) => setSelectedBranch(event.target.value)}
              disabled={branchDisabled}
            >
              {branches.map((branch) => (
                <option key={branch.branchCode} value={branch.branchCode}>
                  {branch.branchCode} - {branch.branchName}
                </option>
              ))}
            </select>
          </label>

          <label>
            ผู้ขอ
            <input
              value={requestedBy}
              onChange={(event) => setRequestedBy(event.target.value)}
              placeholder="ชื่อพนักงาน"
            />
          </label>
        </div>
      </section>

      {pageError && <div className="notice error">{pageError}</div>}
      {loadingBranches && <div className="notice">กำลังโหลดรายชื่อสาขา...</div>}
      {!loadingBranches && branches.length === 0 && (
        <div className="notice warning">
          ยังไม่มีสาขาในระบบ กรุณา seed ข้อมูลสาขาก่อนใช้งานหน้าขอสั่งสินค้า
        </div>
      )}

      <section className="workspace-grid">
        <section className="panel">
          <div className="panel-header stacked">
            <div>
              <h2>ค้นหาสินค้า</h2>
              <p>ค้นหาด้วยรหัสสินค้า บาร์โค้ด หรือชื่อสินค้า</p>
            </div>
          </div>

          <div className="search-row">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  searchProducts();
                }
              }}
              placeholder="เช่น บาร์โค้ด รหัสสินค้า หรือชื่อยา"
            />
            <button type="button" onClick={() => searchProducts()} disabled={searching}>
              {searching ? "กำลังค้นหา..." : "ค้นหา"}
            </button>
          </div>

          <div className="product-list">
            {products.map((product) => (
              <article className="product-card" key={product.productCode}>
                <div>
                  <strong>{product.productName}</strong>
                  <p className="meta-line">{product.productCode}</p>
                  <p className="meta-line">บาร์โค้ด: {product.barcode || "-"}</p>
                </div>
                <button type="button" onClick={() => addProduct(product)}>
                  เพิ่ม
                </button>
              </article>
            ))}
            {!products.length && <p className="empty-state">ค้นหาสินค้าเพื่อเริ่มเพิ่มรายการ</p>}
          </div>
        </section>

        <section className="panel summary-panel">
          <div className="panel-header stacked">
            <div>
              <h2>สรุปคำขอ</h2>
              <p>ช่วยให้ตรวจสอบจำนวนรายการและจำนวนชิ้นก่อนส่งคำขอ</p>
            </div>
          </div>

          <div className="summary-grid">
            <article className="summary-card">
              <span>จำนวนรายการ</span>
              <strong>{totalLines}</strong>
            </article>
            <article className="summary-card">
              <span>จำนวนหน่วยรวม</span>
              <strong>{totalUnits}</strong>
            </article>
          </div>

          <label className="note-field">
            หมายเหตุถึงคลังหรือเภสัชกร
            <textarea
              value={requestNote}
              onChange={(event) => setRequestNote(event.target.value)}
              placeholder="ถ้ามีรายละเอียดเพิ่มเติมให้ใส่ตรงนี้"
              rows="4"
            />
          </label>
        </section>
      </section>

      <section className="panel">
        <div className="panel-header stacked">
          <div>
            <h2>ตะกร้าคำขอ</h2>
            <p>ตรวจสอบจำนวน หน่วย และหมายเหตุรายบรรทัดก่อนส่งคำขอ</p>
          </div>
        </div>

        <form onSubmit={submitRequest}>
          <div className="basket">
            {draftItems.map((item) => (
              <div className="basket-row" key={item.productCode}>
                <div className="basket-main">
                  <strong>{item.productName}</strong>
                  <span>{item.productCode}</span>
                </div>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={item.requestedQty}
                  onChange={(event) =>
                    updateItem(item.productCode, "requestedQty", Number(event.target.value))
                  }
                />
                <input
                  value={item.requestedUnit}
                  onChange={(event) => updateItem(item.productCode, "requestedUnit", event.target.value)}
                  placeholder="หน่วย"
                />
                <input
                  value={item.lineNote}
                  onChange={(event) => updateItem(item.productCode, "lineNote", event.target.value)}
                  placeholder="หมายเหตุรายบรรทัด"
                />
                <button type="button" className="ghost" onClick={() => removeItem(item.productCode)}>
                  ลบ
                </button>
              </div>
            ))}
            {!draftItems.length && <p className="empty-state">ยังไม่มีสินค้าที่เพิ่มเข้ามา</p>}
          </div>

          <div className="form-actions">
            <button type="submit" disabled={busy || branchDisabled}>
              {busy ? "กำลังส่ง..." : "ส่งคำขอสั่งสินค้า"}
            </button>
            {message && <p className="message">{message}</p>}
          </div>
        </form>
      </section>
    </div>
  );
}
