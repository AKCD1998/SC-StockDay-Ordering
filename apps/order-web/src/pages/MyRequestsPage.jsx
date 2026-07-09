import { useCallback, useEffect, useState } from "react";
import FulfillmentForm from "../components/FulfillmentForm";
import FulfillmentReport from "../components/FulfillmentReport";
import RequestStatusPill from "../components/RequestStatusPill";
import { ApiError, api } from "../lib/api";
import { formatBranchLabel } from "../lib/requestCart";
import { formatDateTime, statusLabel } from "../lib/requestStatus";

function receiveLinesFor(request) {
  return request.lines.map((line) => ({
    ...line,
    approvedQty: line.response?.approvedQty ?? line.requestedQty,
  }));
}

function RequestDetail({ publicId }) {
  const [state, setState] = useState({ status: "loading", batch: null, events: [], error: "" });
  const [ackingId, setAckingId] = useState(null);
  const [ackError, setAckError] = useState("");
  const [receivingId, setReceivingId] = useState(null);
  const [receiveError, setReceiveError] = useState("");

  const loadDetail = useCallback(async () => {
    setState({ status: "loading", batch: null, events: [], error: "" });
    try {
      const [detailPayload, eventsPayload] = await Promise.all([
        api.getStockRequestDetail(publicId),
        api.getStockRequestEvents(publicId),
      ]);
      setState({
        status: "ready",
        batch: detailPayload?.batch || null,
        events: eventsPayload?.events || [],
        error: "",
      });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "โหลดรายละเอียดไม่สำเร็จ";
      setState({ status: "error", batch: null, events: [], error: message });
    }
  }, [publicId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  async function handleAcknowledge(request) {
    setAckingId(request.publicId);
    setAckError("");
    try {
      await api.acknowledgeStockRequest(request.publicId, { version: request.version });
      await loadDetail();
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.status === 409
            ? "คำขอนี้ถูกแก้ไขไปแล้ว กรุณาโหลดใหม่"
            : error.message
          : "รับทราบไม่สำเร็จ";
      setAckError(message);
    } finally {
      setAckingId(null);
    }
  }

  async function handleReceive(request, payloadLines) {
    setReceivingId(request.publicId);
    setReceiveError("");
    try {
      await api.receiveStockRequest(request.publicId, { version: request.version, lines: payloadLines });
      await loadDetail();
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.status === 409
            ? "สถานะคำขอเปลี่ยนไปแล้ว กรุณาโหลดใหม่"
            : error.message
          : "บันทึกการรับสินค้าไม่สำเร็จ";
      setReceiveError(message);
    } finally {
      setReceivingId(null);
    }
  }

  if (state.status === "loading") {
    return <div className="notice compact-notice">กำลังโหลดรายละเอียด...</div>;
  }

  if (state.status === "error") {
    return <div className="notice warning compact-notice">{state.error}</div>;
  }

  const batch = state.batch;
  if (!batch) {
    return <div className="notice warning compact-notice">ไม่พบเอกสารคำขอนี้</div>;
  }

  return (
    <div className="request-detail">
      {ackError ? <p className="message error-text">{ackError}</p> : null}
      <div className="request-detail-children">
        {batch.requests.map((request) => (
          <section key={request.publicId} className="cart-group-card">
            <header className="cart-group-header">
              <div>
                <h4>{formatBranchLabel(request.sourceBranchCode)}</h4>
                <p className="subtle">{request.publicId}</p>
              </div>
              <RequestStatusPill status={request.status} />
            </header>
            <ul className="review-line-list">
              {request.lines.map((line) => (
                <li key={line.lineId} className="review-line-row">
                  <span className="review-line-name">
                    {line.productNameThai || line.productNameEng || line.productCode}
                  </span>
                  <strong>
                    {line.requestedQty.toLocaleString("th-TH")} {line.unit || ""}
                  </strong>
                  <span className="subtle">
                    สต๊อกปัจจุบันฝั่งสาขา: {line.currentQty == null ? "-" : line.currentQty.toLocaleString("th-TH")}{" "}
                    {line.unit || ""}
                  </span>
                  <span className="subtle">
                    {line.response
                      ? `ตอบกลับ: ${statusLabel(line.response.status)} (${Number(
                          line.response.approvedQty || 0,
                        ).toLocaleString("th-TH")})`
                      : "รอตอบกลับ"}
                  </span>
                </li>
              ))}
            </ul>
            {request.status === "RESPONDED" ? (
              <div className="child-actions">
                <button
                  type="button"
                  className="primary"
                  disabled={ackingId === request.publicId}
                  onClick={() => handleAcknowledge(request)}
                >
                  {ackingId === request.publicId ? "กำลังรับทราบ..." : "รับทราบการตอบกลับ"}
                </button>
              </div>
            ) : request.status === "DISPATCHED" ? (
              <section className="fulfillment-section">
                <h5>รับสินค้า</h5>
                <p className="subtle">สาขาต้นทางจัดส่งแล้ว ระบุจำนวนที่ได้รับจริงเพื่อบันทึกการรับ</p>
                {receiveError ? <p className="message error-text">{receiveError}</p> : null}
                <FulfillmentForm
                  lines={receiveLinesFor(request)}
                  qtyField="receivedQty"
                  defaultQtyKey="approvedQty"
                  submitLabel="บันทึกการรับสินค้า"
                  busy={receivingId === request.publicId}
                  onSubmit={(payloadLines) => handleReceive(request, payloadLines)}
                />
              </section>
            ) : ["RECEIVED", "COMPLETED"].includes(request.status) ? (
              <FulfillmentReport publicId={request.publicId} />
            ) : request.acknowledgedAt ? (
              <p className="subtle child-ack-note">
                รับทราบเมื่อ {formatDateTime(request.acknowledgedAt)} · รอจัดส่ง
              </p>
            ) : null}
          </section>
        ))}
      </div>

      <section className="request-timeline">
        <h4>ประวัติการดำเนินการ</h4>
        {state.events.length ? (
          <ol className="timeline-list">
            {state.events.map((event) => (
              <li key={event.eventId} className="timeline-item">
                <span className="timeline-type">{event.eventType}</span>
                <span className="subtle">
                  {formatDateTime(event.createdAt)}
                  {event.actorBranch ? ` · สาขา ${event.actorBranch}` : ""}
                </span>
                {event.note ? <p className="timeline-note">{event.note}</p> : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="subtle">ยังไม่มีประวัติ</p>
        )}
      </section>
    </div>
  );
}

export default function MyRequestsPage() {
  const [search, setSearch] = useState("");
  const [state, setState] = useState({ status: "loading", records: [], error: "" });
  const [selectedId, setSelectedId] = useState(null);

  const loadRequests = useCallback(async (searchTerm) => {
    setState((current) => ({ ...current, status: "loading", error: "" }));
    try {
      const payload = await api.getMyStockRequests({ search: searchTerm });
      setState({ status: "ready", records: payload?.records || [], error: "" });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "โหลดรายการคำขอไม่สำเร็จ";
      setState({ status: "error", records: [], error: message });
    }
  }, []);

  useEffect(() => {
    loadRequests("");
  }, [loadRequests]);

  function handleSearchSubmit(event) {
    event.preventDefault();
    setSelectedId(null);
    loadRequests(search);
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>สถานะคำขอของฉัน</h2>
          <p>ติดตามคำขอที่ส่งออก ค้นหาด้วยเลขที่เอกสาร (SRQ)</p>
        </div>
      </div>

      <form className="request-search-form" onSubmit={handleSearchSubmit}>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="ค้นหาเลขที่เอกสาร เช่น SRQ-20260618-001-1"
          aria-label="ค้นหาเลขที่เอกสารคำขอ"
        />
        <button type="submit">ค้นหา</button>
      </form>

      {state.status === "loading" ? (
        <div className="notice compact-notice">กำลังโหลด...</div>
      ) : state.status === "error" ? (
        <div className="notice warning compact-notice">{state.error}</div>
      ) : !state.records.length ? (
        <p className="empty-state">ยังไม่มีคำขอที่ตรงกับเงื่อนไข</p>
      ) : (
        <div className="request-list">
          {state.records.map((record) => {
            const isOpen = selectedId === record.batchPublicId;
            return (
              <article key={record.batchPublicId} className="request-list-card">
                <button
                  type="button"
                  className="request-list-row"
                  aria-expanded={isOpen}
                  onClick={() =>
                    setSelectedId(isOpen ? null : record.batchPublicId)
                  }
                >
                  <div>
                    <strong>{record.batchPublicId}</strong>
                    <p className="subtle">
                      {record.requestCount} สาขา · {record.lineCount} บรรทัด ·{" "}
                      {formatDateTime(record.submittedAt || record.createdAt)}
                    </p>
                    <p className="subtle">
                      ปลายทาง: {record.sourceBranchCodes.join(", ") || "-"}
                    </p>
                  </div>
                  <RequestStatusPill status={record.status} />
                </button>
                {isOpen ? <RequestDetail publicId={record.batchPublicId} /> : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
