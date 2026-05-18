import { useEffect, useState } from "react";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

function statusClass(status) {
  if (status === "Reorder soon") return "danger";
  if (status === "Overstock / slow moving") return "warning";
  if (status === "No sales") return "muted";
  return "good";
}

export default function App() {
  const [stockDay, setStockDay] = useState([]);
  const [orderRequests, setOrderRequests] = useState([]);
  const [syncStatus, setSyncStatus] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch(`${apiBaseUrl}/api/admin/stock-day`).then((res) => res.json()),
      fetch(`${apiBaseUrl}/api/admin/order-requests`).then((res) => res.json()),
      fetch(`${apiBaseUrl}/api/admin/sync-status`).then((res) => res.json()),
    ]).then(([stockData, orderData, syncData]) => {
      setStockDay(stockData);
      setOrderRequests(orderData);
      setSyncStatus(syncData);
    });
  }, []);

  const reorderCount = stockDay.filter((item) => item.status === "Reorder soon").length;
  const normalCount = stockDay.filter((item) => item.status === "Normal").length;
  const overstockCount = stockDay.filter((item) => item.status === "Overstock / slow moving").length;

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Internal Dashboard</p>
          <h1>Stock Day Inspection</h1>
          <p>
            Management view for branch requests, global stock-day, and latest adaPOS sync status.
          </p>
        </div>
        <div className="sync-card">
          <h2>Sync Status</h2>
          <p>Mode: {syncStatus?.mode || "-"}</p>
          <p>Latest run: {syncStatus?.latestRun?.status || "-"}</p>
          <p>Records sent: {syncStatus?.latestRun?.recordsSent ?? "-"}</p>
        </div>
      </header>

      <section className="kpis">
        <article className="kpi">
          <span>Reorder soon</span>
          <strong>{reorderCount}</strong>
        </article>
        <article className="kpi">
          <span>Normal</span>
          <strong>{normalCount}</strong>
        </article>
        <article className="kpi">
          <span>Overstock / slow moving</span>
          <strong>{overstockCount}</strong>
        </article>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Latest Branch Order Requests</h2>
          <p>Manual Excel ordering replacement starts here.</p>
        </div>
        <div className="request-list">
          {orderRequests.map((request) => (
            <article className="request-card" key={request.id}>
              <div>
                <strong>{request.branchName}</strong>
                <p>{request.id}</p>
                <p>{new Date(request.requestedAt).toLocaleString()}</p>
              </div>
              <div>
                <p>{request.items.length} item(s)</p>
                <p>{request.note || "-"}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Stock Day Table</h2>
          <p>Global stock first for V1. No branch-level stock reconstruction yet.</p>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Current Stock</th>
                <th>Sold Qty</th>
                <th>Avg Daily</th>
                <th>Stock Day</th>
                <th>Purchased</th>
                <th>Min</th>
                <th>Max</th>
                <th>Lead Time</th>
                <th>Supplier</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {stockDay.map((row) => (
                <tr key={row.productCode}>
                  <td>
                    <strong>{row.productName}</strong>
                    <div className="meta">{row.productCode}</div>
                  </td>
                  <td>{row.currentStock}</td>
                  <td>{row.soldQtyPeriod}</td>
                  <td>{row.averageDailyUsage}</td>
                  <td>{row.stockDay ?? "-"}</td>
                  <td>{row.purchasedQtyPeriod}</td>
                  <td>{row.minStock}</td>
                  <td>{row.maxStock}</td>
                  <td>{row.leadTimeDays}</td>
                  <td>{row.supplier}</td>
                  <td>
                    <span className={`status ${statusClass(row.status)}`}>{row.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
