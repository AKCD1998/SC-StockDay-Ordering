import { useEffect, useState } from "react";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
const syncEventLogEnabled = String(import.meta.env.VITE_ENABLE_SYNC_EVENT_LOG || "").toLowerCase() === "true";

function formatNumber(value, digits = 0) {
  if (value === null || value === undefined || value === "") return "-";
  return Number(value).toLocaleString("th-TH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

async function apiFetch(path, options = {}) {
  return fetch(`${apiBaseUrl}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.headers || {}),
    },
  });
}

const BRANCH_LABELS = {
  "000": "สาขา 000 (HQ)",
  "001": "สาขา 001",
  "003": "สาขา 003",
  "004": "สาขา 004",
  "005": "สาขา 005",
};

function syncLogStatusIcon(status) {
  if (status === "success") return { icon: "✅", label: "สำเร็จ",              cls: "sl-success" };
  if (status === "failed")  return { icon: "❌", label: "ล้มเหลว",             cls: "sl-failed"  };
  if (status === "running") return { icon: "⏳", label: "กำลังรัน",            cls: "sl-running" };
  if (status === "stale")   return { icon: "⚠️", label: "ค้าง (ไม่จบใน 1 ชม.)", cls: "sl-stale"   };
  if (status === "pending") return { icon: "🌙", label: "รอคืนนี้",            cls: "sl-pending" };
  if (status === "waiting") return { icon: "🕐", label: "รอ sync ชั่วโมงนี้",  cls: "sl-pending" };
  if (status === "offline") return { icon: "💤", label: "ปิดเครื่อง",          cls: "sl-offline" };
  return { icon: "—",  label: "ไม่มีข้อมูล", cls: "sl-unknown" };
}

function formatShortDate(isoDate) {
  const d = new Date(isoDate + "T00:00:00");
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function formatSyncMetaValue(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatSyncLogStamp(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("th-TH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SyncEventLog({ mode, days, hours, refreshKey }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!syncEventLogEnabled) {
      setEvents([]);
      setLoading(false);
      setError("");
      setUnavailable(false);
      return undefined;
    }

    let active = true;
    const params = new URLSearchParams({ limit: "60" });
    if (mode === "nightly") {
      params.set("days", String(days));
    } else {
      params.set("hours", String(hours));
    }

    setLoading(true);
    setError("");
    setUnavailable(false);
    apiFetch(`/api/sync/recent-events?${params.toString()}`)
      .then((res) => {
        if ([401, 403, 404, 405, 501].includes(res.status)) {
          throw new Error("SYNC_EVENT_LOG_UNAVAILABLE");
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => { if (active) setEvents(Array.isArray(json) ? json : []); })
      .catch((err) => {
        if (!active) return;
        if (err.message === "SYNC_EVENT_LOG_UNAVAILABLE") {
          setUnavailable(true);
          setEvents([]);
          return;
        }
        setError(err.message);
      })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [mode, days, hours, refreshKey]);

  if (!syncEventLogEnabled) {
    return null;
  }

  return (
    <section className="sync-event-log">
      <div className="sync-event-log-header">
        <h3>Log เวลาที่ส่งเข้า</h3>
        <span>
          {mode === "nightly"
            ? `แสดงรายการย้อนหลัง ${days} วัน`
            : `แสดงรายการย้อนหลัง ${hours} ชั่วโมง`}
        </span>
      </div>

      {unavailable ? (
        <p className="empty-state">backend ปัจจุบันยังไม่เปิด recent event log ส่วนนี้</p>
      ) : null}
      {error ? <p className="notice error compact">❌ โหลด log ไม่ได้: {error}</p> : null}
      {loading ? <p className="empty-state">⏳ กำลังโหลด log...</p> : null}
      {!loading && !error && !unavailable && events.length === 0 ? (
        <p className="empty-state">ยังไม่มี log การส่งในช่วงเวลานี้</p>
      ) : null}

      {!loading && !error && !unavailable && events.length > 0 ? (
        <div className="sync-event-log-list">
          {events.map((event) => {
            const status = event.status ?? "offline";
            const { icon, label, cls } = syncLogStatusIcon(status);
            return (
              <article key={event.syncRunId} className={`sync-event-log-item ${cls}`}>
                <div className="sync-event-log-main">
                  <strong>{BRANCH_LABELS[event.branchCode] ?? `สาขา ${event.branchCode}`}</strong>
                  <span>{icon} {label}</span>
                  <span>เริ่มส่ง {formatSyncLogStamp(event.startedAt)}</span>
                  <span>เสร็จ {formatSyncLogStamp(event.finishedAt)}</span>
                </div>
                <div className="sync-event-log-sub">
                  <span>ประเภท {event.syncType || "-"}</span>
                  <span>อ่าน {formatNumber(event.recordsRead ?? 0)} รายการ</span>
                  <span>ส่ง {formatNumber(event.recordsSent ?? 0)} รายการ</span>
                </div>
                <div className="sync-event-log-message">{event.message?.trim() || "-"}</div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function SyncLogMetaCard({ selection, mode }) {
  if (!selection) {
    return (
      <div className="sync-log-meta-card">
        <div className="sync-log-meta-empty">กดที่ช่องในตารางเพื่อดู metadata ของการ sync ล่าสุด</div>
      </div>
    );
  }

  const { branch, slotLabel, slotValue, cell } = selection;
  const status = cell?.status ?? "offline";
  const { icon, label } = syncLogStatusIcon(status);
  const items = [
    { label: mode === "nightly" ? "วันที่" : "ช่วงเวลา", value: slotLabel },
    { label: "สาขา", value: BRANCH_LABELS[branch] ?? `สาขา ${branch}` },
    { label: "สถานะช่อง", value: `${icon} ${label}` },
    { label: "sync ล่าสุดเริ่ม", value: formatSyncMetaValue(cell?.latestStartedAt) },
    { label: "sync ล่าสุดเสร็จ", value: formatSyncMetaValue(cell?.latestFinishedAt) },
    { label: "sync type", value: cell?.syncType || "-" },
    { label: "run status ล่าสุด", value: cell?.latestRunStatus || "-" },
    { label: "จำนวนครั้งที่รัน", value: formatNumber(cell?.totalRuns ?? 0) },
    { label: "ส่งรวมในช่องนี้", value: formatNumber(cell?.totalSent ?? 0) },
    { label: "records read ล่าสุด", value: formatNumber(cell?.recordsRead ?? 0) },
    { label: "records sent ล่าสุด", value: formatNumber(cell?.recordsSent ?? 0) },
  ];

  if (mode === "nightly") {
    items.push(
      { label: "heartbeat ล่าสุด", value: formatSyncMetaValue(cell?.latestHeartbeatAt) },
      { label: "จำนวน heartbeat", value: formatNumber(cell?.heartbeatCount ?? 0) },
    );
  }

  return (
    <div className="sync-log-meta-card">
      <div className="sync-log-meta-header">
        <strong>{BRANCH_LABELS[branch] ?? `สาขา ${branch}`}</strong>
        <span>{slotValue}</span>
      </div>
      <div className="sync-log-meta-grid">
        {items.map((item) => (
          <div key={item.label} className="sync-log-meta-item">
            <span className="sync-log-meta-label">{item.label}</span>
            <strong className="sync-log-meta-value">{item.value}</strong>
          </div>
        ))}
      </div>
      <div className="sync-log-meta-message">
        <span className="sync-log-meta-label">message ล่าสุด</span>
        <div className="sync-log-meta-message-body">{cell?.message?.trim() || "-"}</div>
      </div>
      {Array.isArray(cell?.datasets) && cell.datasets.length > 0 ? (
        <div className="sync-log-meta-datasets">
          <span className="sync-log-meta-label">แยกตามส่วนที่ส่ง (run ล่าสุด)</span>
          <div className="sync-log-meta-dataset-list">
            {cell.datasets.map((ds, i) => (
              <div key={`${ds.dataset}-${i}`} className={`sync-log-meta-dataset-row ${ds.status === "success" ? "ok" : "fail"}`}>
                <span className="sync-log-meta-dataset-icon">{ds.status === "success" ? "✅" : "❌"}</span>
                <span className="sync-log-meta-dataset-name">{ds.dataset}</span>
                {ds.status === "success" ? (
                  <span className="sync-log-meta-dataset-detail">{formatNumber(ds.recordsSent ?? 0)} รายการ</span>
                ) : (
                  <span className="sync-log-meta-dataset-detail error">{ds.error || "ล้มเหลว"}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Nightly sub-tab ───────────────────────────────────────────────────────
function NightlySyncGrid({ days, refreshKey, onUnauthorized }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [selection, setSelection] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    apiFetch(`/api/sync/nightly-log?days=${days}`)
      .then((res) => {
        if (res.status === 401) {
          onUnauthorized?.();
          throw new Error("SESSION_EXPIRED");
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => { if (active) setData(json); })
      .catch((err) => {
        if (!active) return;
        if (err.message === "SESSION_EXPIRED") {
          setError("เซสชันหมดอายุแล้ว กรุณาเข้าสู่ระบบใหม่");
          return;
        }
        setError(err.message);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [days, refreshKey]);

  useEffect(() => {
    setSelection(null);
  }, [days, refreshKey]);

  const dates    = data?.dates    ?? [];
  const branches = data?.branches ?? ["000", "001", "003", "004", "005"];
  const rows     = data?.rows     ?? {};

  if (error)   return <p className="notice error compact">❌ โหลดไม่ได้: {error}</p>;
  if (loading) return <p className="empty-state">⏳ กำลังโหลด...</p>;
  if (dates.length === 0)
    return <p className="empty-state">ยังไม่มีข้อมูล sync — รอให้ laptop สาขารันครั้งแรกก่อน</p>;

  return (
    <>
      <div className="table-wrap sync-log-table-wrap">
        <table className="sync-log-table">
          <thead>
            <tr>
              <th className="sync-log-branch-col">สาขา</th>
              {dates.map((d) => (
                <th key={d} className="sync-log-date-col" title={d}>
                  {formatShortDate(d)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {branches.map((branch) => (
              <tr key={branch}>
                <td className="sync-log-branch-label">{BRANCH_LABELS[branch] ?? `สาขา ${branch}`}</td>
                {dates.map((d) => {
                  const cell = rows[branch]?.[d] ?? { status: "offline" };
                  const status = typeof cell === "string" ? cell : cell.status;
                  const { icon, label, cls } = syncLogStatusIcon(status);
                  const isActive = selection?.branch === branch && selection?.slotValue === d;
                  return (
                    <td
                      key={d}
                      className={`sync-log-cell ${cls}${isActive ? " active" : ""}`}
                      title={`${BRANCH_LABELS[branch] ?? branch} · ${d} · ${label}`}
                      onClick={() => setSelection({
                        branch,
                        slotLabel: formatShortDate(d),
                        slotValue: d,
                        cell: typeof cell === "string" ? { status: cell } : cell,
                      })}
                    >
                      <span aria-label={label}>{icon}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sync-log-legend">
        {[
          { icon: "✅", label: "สำเร็จ" },
          { icon: "❌", label: "ล้มเหลว (laptop เปิด แต่ sync error)" },
          { icon: "⚠️", label: "ค้าง (เริ่มมากกว่า 1 ชม. ที่แล้ว ไม่จบ — น่าจะถูกขัดจังหวะ)" },
          { icon: "💤", label: "ปิดเครื่อง (ไม่มี heartbeat)" },
          { icon: "🌙", label: "วันนี้ — รอ sync คืนนี้" },
        ].map(({ icon, label }) => (
          <span key={label} className="sync-log-legend-item">{icon} {label}</span>
        ))}
      </div>
      <SyncLogMetaCard selection={selection} mode="nightly" />
    </>
  );
}

// ── Hourly sub-tab ─────────────────────────────────────────────────────────
function formatHourLabel(hourKey) {
  // hourKey = "2026-05-28 14:00"  →  two-line: "14:00" / "28/5"
  if (!hourKey) return "";
  const [datePart, timePart] = hourKey.split(" ");
  if (!datePart || !timePart) return hourKey;
  const [, mm, dd] = datePart.split("-");
  return `${timePart}\n${Number(dd)}/${Number(mm)}`;
}

function HourlySyncGrid({ hours, refreshKey, onUnauthorized }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [selection, setSelection] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    apiFetch(`/api/sync/hourly-log?hours=${hours}`)
      .then((res) => {
        if (res.status === 401) {
          onUnauthorized?.();
          throw new Error("SESSION_EXPIRED");
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => { if (active) setData(json); })
      .catch((err) => {
        if (!active) return;
        if (err.message === "SESSION_EXPIRED") {
          setError("เซสชันหมดอายุแล้ว กรุณาเข้าสู่ระบบใหม่");
          return;
        }
        setError(err.message);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [hours, refreshKey]);

  useEffect(() => {
    setSelection(null);
  }, [hours, refreshKey]);

  const hourKeys = data?.hours    ?? [];
  const branches = data?.branches ?? ["000", "001", "003", "004", "005"];
  const rows     = data?.rows     ?? {};

  // Show most-recent hours on the LEFT → reverse for display
  const displayHours = [...hourKeys].reverse();

  if (error)   return <p className="notice error compact">❌ โหลดไม่ได้: {error}</p>;
  if (loading) return <p className="empty-state">⏳ กำลังโหลด...</p>;
  if (hourKeys.length === 0)
    return <p className="empty-state">ยังไม่มีข้อมูล sync — รอให้รันครั้งแรกก่อน</p>;

  return (
    <>
      <div className="table-wrap sync-log-table-wrap">
        <table className="sync-log-table">
          <thead>
            <tr>
              <th className="sync-log-branch-col">สาขา</th>
              {displayHours.map((h) => {
                const lines = formatHourLabel(h).split("\n");
                return (
                  <th key={h} className="sync-log-hour-col" title={h}>
                    <span style={{ display: "block" }}>{lines[0]}</span>
                    <span style={{ display: "block", opacity: 0.65 }}>{lines[1]}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {branches.map((branch) => (
              <tr key={branch}>
                <td className="sync-log-branch-label">{BRANCH_LABELS[branch] ?? `สาขา ${branch}`}</td>
                {displayHours.map((h) => {
                  const cell   = rows[branch]?.[h];
                  const rawStatus = cell?.status ?? "offline";
                  // Remap to hourly-specific icons
                  const status = rawStatus === "pending" ? "waiting"
                               : rawStatus === "offline" ? "unknown"
                               : rawStatus;
                  const sent   = cell?.totalSent ?? 0;
                  const { icon, label, cls } = syncLogStatusIcon(status);
                  const isActive = selection?.branch === branch && selection?.slotValue === h;
                  return (
                    <td
                      key={h}
                      className={`sync-log-cell-hour ${cls}${isActive ? " active" : ""}`}
                      title={`${BRANCH_LABELS[branch] ?? branch} · ${h} · ${label}${sent > 0 ? ` · ${sent} รายการ` : ""}`}
                      onClick={() => setSelection({
                        branch,
                        slotLabel: h,
                        slotValue: h,
                        cell,
                      })}
                    >
                      <span aria-label={label}>{icon}</span>
                      {status === "success" && sent > 0 && (
                        <span className="sync-log-total-sent">{sent}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sync-log-legend">
        {[
          { icon: "✅", label: "ส่งข้อมูลสำเร็จ" },
          { icon: "❌", label: "ส่งไม่สำเร็จ (มี error)" },
          { icon: "—",  label: "ไม่มีการส่ง (ชั่วโมงนั้น)" },
          { icon: "🕐", label: "ชั่วโมงปัจจุบัน — รอ sync" },
        ].map(({ icon, label }) => (
          <span key={label} className="sync-log-legend-item">{icon} {label}</span>
        ))}
      </div>
      <SyncLogMetaCard selection={selection} mode="hourly" />
    </>
  );
}

// ── SyncLogPanel — outer shell with sub-tabs ───────────────────────────────
export default function SyncLogPanel({ onUnauthorized }) {
  const [subTab, setSubTab]       = useState("nightly");
  const [nightlyDays, setNightlyDays] = useState(14);
  const [hourlyHours, setHourlyHours] = useState(24);
  const [refreshKey, setRefreshKey]   = useState(0);

  const isNightly = subTab === "nightly";

  return (
    <section className="panel sync-log-panel">
      <div className="panel-header">
        <div>
          <h2>ประวัติ Sync</h2>
          <div className="sync-log-subtabs" style={{ marginTop: "8px" }}>
            <button
              type="button"
              className={`sync-log-subtab${isNightly ? " active" : ""}`}
              onClick={() => setSubTab("nightly")}
            >
              🌙 รายคืน
            </button>
            <button
              type="button"
              className={`sync-log-subtab${!isNightly ? " active" : ""}`}
              onClick={() => setSubTab("hourly")}
            >
              ⏱ รายชั่วโมง
            </button>
          </div>
          <p style={{ marginTop: "6px" }}>
            {isNightly
              ? "สถานะการซิงก์ข้อมูลจาก Mother PC แต่ละสาขา — ✅ สำเร็จ · ❌ ล้มเหลว · 💤 ปิดเครื่อง · 🌙 รอคืนนี้"
              : "สถานะการส่งข้อมูลรายชั่วโมงจาก Mother PC (Task Scheduler) — ✅ ส่งสำเร็จ · ❌ error · — ไม่มีการส่ง · 🕐 กำลังรอ"}
          </p>
        </div>
        <div className="toolbar">
          {isNightly ? (
            <label className="date-label">
              ย้อนหลัง
              <select
                value={nightlyDays}
                onChange={(e) => setNightlyDays(Number(e.target.value))}
                className="date-input-inline"
                style={{ marginLeft: "6px" }}
              >
                <option value={7}>7 วัน</option>
                <option value={14}>14 วัน</option>
                <option value={30}>30 วัน</option>
              </select>
            </label>
          ) : (
            <label className="date-label">
              ย้อนหลัง
              <select
                value={hourlyHours}
                onChange={(e) => setHourlyHours(Number(e.target.value))}
                className="date-input-inline"
                style={{ marginLeft: "6px" }}
              >
                <option value={12}>12 ชั่วโมง</option>
                <option value={24}>24 ชั่วโมง</option>
                <option value={48}>48 ชั่วโมง</option>
              </select>
            </label>
          )}
          <button
            type="button"
            className="ghost-button"
            onClick={() => setRefreshKey((k) => k + 1)}
          >
            🔄 รีเฟรช
          </button>
        </div>
      </div>

      {isNightly
        ? <NightlySyncGrid days={nightlyDays} refreshKey={refreshKey} onUnauthorized={onUnauthorized} />
        : <HourlySyncGrid  hours={hourlyHours} refreshKey={refreshKey} onUnauthorized={onUnauthorized} />}

      <SyncEventLog
        mode={subTab}
        days={nightlyDays}
        hours={hourlyHours}
        refreshKey={refreshKey}
        onUnauthorized={onUnauthorized}
      />
    </section>
  );
}
