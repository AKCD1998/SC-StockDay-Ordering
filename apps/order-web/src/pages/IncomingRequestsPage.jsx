import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import RequestStatusPill from "../components/RequestStatusPill";
import { useAuth } from "../context/AuthContext";
import { ApiError, api } from "../lib/api";
import { formatBranchLabel } from "../lib/requestCart";
import { formatDateTime } from "../lib/requestStatus";

export default function IncomingRequestsPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [search, setSearch] = useState("");
  const [state, setState] = useState({ status: "loading", records: [], error: "" });

  const loadRequests = useCallback(async (searchTerm) => {
    setState((current) => ({ ...current, status: "loading", error: "" }));
    try {
      const payload = await api.getIncomingStockRequests({ search: searchTerm });
      setState({ status: "ready", records: payload?.records || [], error: "" });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "โหลดคำขอเข้าไม่สำเร็จ";
      setState({ status: "error", records: [], error: message });
    }
  }, []);

  useEffect(() => {
    loadRequests("");
  }, [loadRequests]);

  function handleSearchSubmit(event) {
    event.preventDefault();
    loadRequests(search);
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>รับคำขอ</h2>
          <p>
            คำขอจากสาขาอื่นมายังสาขา{" "}
            {formatBranchLabel(session?.branchCode, session?.branchName)}
          </p>
        </div>
      </div>

      <form className="request-search-form" onSubmit={handleSearchSubmit}>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="ค้นหาเลขที่เอกสารหรือสาขาผู้ขอ"
          aria-label="ค้นหาคำขอเข้า"
        />
        <button type="submit">ค้นหา</button>
      </form>

      {state.status === "loading" ? (
        <div className="notice compact-notice">กำลังโหลด...</div>
      ) : state.status === "error" ? (
        <div className="notice warning compact-notice">{state.error}</div>
      ) : !state.records.length ? (
        <p className="empty-state">ยังไม่มีคำขอจากสาขาอื่น</p>
      ) : (
        <div className="request-list">
          {state.records.map((record) => {
            const isNew = record.status === "SUBMITTED";
            return (
              <article key={record.requestPublicId} className="request-list-card">
                <button
                  type="button"
                  className="request-list-row"
                  onClick={() =>
                    navigate(`/incoming/${encodeURIComponent(record.requestPublicId)}`)
                  }
                >
                  <div>
                    <strong>
                      {record.requestPublicId}
                      {isNew ? <span className="new-indicator">ใหม่</span> : null}
                    </strong>
                    <p className="subtle">
                      จากสาขา {formatBranchLabel(record.requestingBranchCode)} ·{" "}
                      {record.lineCount} บรรทัด ·{" "}
                      {formatDateTime(record.submittedAt || record.createdAt)}
                    </p>
                  </div>
                  <RequestStatusPill status={record.status} />
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
