import { useEffect, useState } from "react";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

export default function App() {
  const [branches, setBranches] = useState([]);
  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("");
  const [draftItems, setDraftItems] = useState([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`${apiBaseUrl}/api/branches`)
      .then((res) => res.json())
      .then((data) => {
        setBranches(data);
        if (data[0]) setSelectedBranch(data[0].branchCode);
      });
  }, []);

  async function searchProducts(nextQuery = query) {
    const response = await fetch(`${apiBaseUrl}/api/products/search?q=${encodeURIComponent(nextQuery)}`);
    const data = await response.json();
    setProducts(data);
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
    if (!selectedBranch || draftItems.length === 0) {
      setMessage("Select a branch and add at least one product.");
      return;
    }

    setBusy(true);
    setMessage("");
    const response = await fetch(`${apiBaseUrl}/api/order-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        branchCode: selectedBranch,
        requestedBy: "Placeholder Staff",
        note: "Submitted from scaffold order page.",
        items: draftItems,
      }),
    });
    const data = await response.json();
    setBusy(false);

    if (!response.ok) {
      setMessage(data.message || "Failed to submit order request.");
      return;
    }

    setDraftItems([]);
    setMessage(`Order request submitted: ${data.id}`);
  }

  return (
    <div className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">SC-StockDay-Ordering</p>
          <h1>Branch Order Request</h1>
          <p className="subtle">
            Staff submit branch requests here. Orders are stored in our own app and do not write directly to adaPOS.
          </p>
        </div>
        <div className="hero-card">
          <label>
            Branch
            <select value={selectedBranch} onChange={(event) => setSelectedBranch(event.target.value)}>
              {branches.map((branch) => (
                <option key={branch.branchCode} value={branch.branchCode}>
                  {branch.branchCode} - {branch.branchName}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Search Products</h2>
          <div className="search-row">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by code, barcode, or name"
            />
            <button onClick={() => searchProducts()}>Search</button>
          </div>
        </div>
        <div className="product-list">
          {products.map((product) => (
            <article className="product-card" key={product.productCode}>
              <div>
                <strong>{product.productName}</strong>
                <p>{product.productCode}</p>
                <p>Barcode: {product.barcode || "-"}</p>
              </div>
              <button onClick={() => addProduct(product)}>Add</button>
            </article>
          ))}
          {!products.length && <p className="empty-state">Search to load products.</p>}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Request Basket</h2>
          <p className="subtle">Keep the page simple for branch operators.</p>
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
                  onChange={(event) => updateItem(item.productCode, "requestedQty", Number(event.target.value))}
                />
                <input
                  value={item.requestedUnit}
                  onChange={(event) => updateItem(item.productCode, "requestedUnit", event.target.value)}
                  placeholder="Unit"
                />
                <input
                  value={item.lineNote}
                  onChange={(event) => updateItem(item.productCode, "lineNote", event.target.value)}
                  placeholder="Optional note"
                />
                <button type="button" className="ghost" onClick={() => removeItem(item.productCode)}>
                  Remove
                </button>
              </div>
            ))}
            {!draftItems.length && <p className="empty-state">No products added yet.</p>}
          </div>

          <div className="form-actions">
            <button type="submit" disabled={busy}>
              {busy ? "Submitting..." : "Submit Order Request"}
            </button>
            {message && <p className="message">{message}</p>}
          </div>
        </form>
      </section>
    </div>
  );
}
