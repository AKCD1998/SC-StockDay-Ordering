import { useEffect, useState } from "react";
import { api } from "../lib/api";

function variance(line) {
  if (line.receiveVariance !== 0) return line.receiveVariance;
  if (line.dispatchVariance !== 0) return line.dispatchVariance;
  return null;
}

// Difference report across approved / dispatched / received quantities (WP-13).
// Loads its own data so it can drop into either party's detail view. `refreshKey`
// lets the parent force a reload after a dispatch/receive action.
export default function FulfillmentReport({ publicId, refreshKey = 0 }) {
  const [state, setState] = useState({ status: "loading", data: null });

  useEffect(() => {
    let active = true;
    setState({ status: "loading", data: null });
    api
      .getStockRequestFulfillment(publicId)
      .then((payload) => {
        if (active) setState({ status: "ready", data: payload?.fulfillment || null });
      })
      .catch(() => {
        if (active) setState({ status: "error", data: null });
      });
    return () => {
      active = false;
    };
  }, [publicId, refreshKey]);

  if (state.status === "loading") {
    return <div className="notice compact-notice">กำลังโหลดสรุปการจัดส่ง...</div>;
  }
  if (state.status === "error" || !state.data) {
    return null;
  }

  const fulfillment = state.data;

  return (
    <div className="fulfillment-report">
      <h4>สรุปการจัดส่ง / รับสินค้า</h4>
      <table className="packing-doc-table fulfillment-table">
        <thead>
          <tr>
            <th>สินค้า</th>
            <th>อนุมัติ</th>
            <th>ส่ง</th>
            <th>รับ</th>
            <th>ส่วนต่าง</th>
          </tr>
        </thead>
        <tbody>
          {fulfillment.lines.map((line) => {
            const diff = variance(line);
            return (
              <tr key={line.lineId} className={line.hasDifference ? "has-difference" : ""}>
                <td>{line.productNameThai || line.productNameEng || line.productCode}</td>
                <td className="num">{line.approvedQty.toLocaleString("th-TH")}</td>
                <td className="num">{line.dispatchedQty.toLocaleString("th-TH")}</td>
                <td className="num">{line.receivedQty.toLocaleString("th-TH")}</td>
                <td className="num">{diff == null ? "-" : diff.toLocaleString("th-TH")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
