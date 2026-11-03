import { useEffect, useRef, useState } from "react";
import { apiFetch } from "./lib/apiClient.js";
import {
  SPECIAL_VIGILANT_BRANCH,
  SPECIAL_VIGILANT_INTERVAL_MS,
  SPECIAL_VIGILANT_PRODUCTS,
} from "./data/specialVigilantProducts.js";
import {
  VIGILANT_RETRY_MS,
  isVigilantPopupDue,
  loadVigilantSnapshot,
  readVigilantSchedule,
  vigilantStorageKey,
  writeVigilantSchedule,
} from "./lib/specialVigilantProducts.js";
import "./SpecialVigilantProducts.css";

const STATUS_LABELS = {
  negative: "ติดลบ • ตรวจนับ",
  "out-of-stock": "สต๊อกหมด",
  "below-target": "ต่ำกว่าเป้าหมาย",
  "unknown-stock": "ยังอ่านสต๊อกไม่ได้",
  "unknown-target": "เป้าหมายยังไม่พร้อม",
  sufficient: "เพียงพอ",
};

function quantity(value) {
  return value == null ? "—" : value.toLocaleString("th-TH", { maximumFractionDigits: 4 });
}

function ProductTable({ rows }) {
  return (
    <div className="sv-table-wrap">
      <table className="sv-table">
        <thead><tr>
          <th>สินค้า</th><th>คงเหลือ 005</th><th>ควรมีตามเว็บ</th><th>ขาดจากเป้าหมาย</th><th>สถานะ</th>
        </tr></thead>
        <tbody>{rows.map(row => (
          <tr key={row.productCode}>
            <td><strong>{row.name}</strong><small>{row.productCode} · {row.unit || "หน่วย"}</small></td>
            <td>{quantity(row.currentStock)}</td>
            <td>{quantity(row.targetQty)}</td>
            <td>{quantity(row.shortageQty)}</td>
            <td>{STATUS_LABELS[row.status]}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export default function SpecialVigilantProducts({ branchCode, userId, onNavigate }) {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const dialogRef = useRef(null);
  const checkRef = useRef(null);

  useEffect(() => {
    setSnapshot(null);
    setError("");
    setOpen(false);
    setLoading(false);
    if (branchCode !== SPECIAL_VIGILANT_BRANCH || !userId) return undefined;

    let active = true;
    let pending = false;
    let controller;
    let timeout;
    let latest = null;
    let storage;
    try { storage = window.localStorage; } catch { storage = null; }
    const key = vigilantStorageKey(userId);
    let schedule = readVigilantSchedule(storage, key, Date.now());

    function currentSchedule() {
      const now = Date.now();
      const saved = readVigilantSchedule(storage, key, now);
      schedule = {
        lastShownAt: Math.max(saved.lastShownAt, schedule.lastShownAt <= now ? schedule.lastShownAt : 0),
        nextCheckAt: Math.max(saved.nextCheckAt,
          schedule.nextCheckAt <= now + SPECIAL_VIGILANT_INTERVAL_MS ? schedule.nextCheckAt : 0),
      };
      return schedule;
    }

    function saveSchedule(changes) {
      schedule = { ...currentSchedule(), ...changes };
      writeVigilantSchedule(storage, key, schedule);
    }

    async function showIfDue(manual = false) {
      if (!active || !latest || document.visibilityState === "hidden") return;
      function show() {
        if (!active) return;
        const now = Date.now();
        if (!manual && (!latest.alerts.length || !isVigilantPopupDue(currentSchedule().lastShownAt, now))) return;
        saveSchedule({ lastShownAt: now });
        setOpen(true);
      }
      if (navigator.locks?.request) {
        await navigator.locks.request(key, { ifAvailable: true }, lock => { if (lock) show(); });
      } else {
        show();
      }
    }

    async function check(manual = false) {
      if (!active || pending || document.visibilityState === "hidden") return;
      if (!manual && Date.now() < currentSchedule().nextCheckAt) {
        if (latest && Date.now() - latest.checkedAt < SPECIAL_VIGILANT_INTERVAL_MS) await showIfDue();
        return;
      }
      pending = true;
      controller = new AbortController();
      timeout = window.setTimeout(() => controller.abort(), 45_000);
      setLoading(true);
      setError("");
      try {
        const result = await loadVigilantSnapshot({ request: apiFetch, signal: controller.signal });
        if (!active) return;
        latest = result;
        setSnapshot(result);
        saveSchedule({ nextCheckAt: Date.now() + SPECIAL_VIGILANT_INTERVAL_MS });
        await showIfDue(manual);
        const shownAt = currentSchedule().lastShownAt;
        if (result.alerts.length && shownAt) {
          saveSchedule({ nextCheckAt: shownAt + SPECIAL_VIGILANT_INTERVAL_MS });
        }
      } catch {
        if (!active) return;
        saveSchedule({ nextCheckAt: Date.now() + VIGILANT_RETRY_MS });
        setError("อ่านข้อมูลเฝ้าระวังไม่สำเร็จ ระบบจะลองใหม่ใน 5 นาที");
      } finally {
        window.clearTimeout(timeout);
        pending = false;
        if (active) setLoading(false);
      }
    }

    checkRef.current = check;
    const wake = () => { void check(); };
    const timer = window.setInterval(wake, 60_000);
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("storage", wake);
    void check();

    return () => {
      active = false;
      checkRef.current = null;
      controller?.abort();
      window.clearTimeout(timeout);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener("storage", wake);
    };
  }, [branchCode, userId]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    if (!open && dialog?.open) dialog.close();
    return () => { if (dialog?.open) dialog.close(); };
  }, [open]);

  if (branchCode !== SPECIAL_VIGILANT_BRANCH || !userId) return null;
  const alerts = snapshot?.alerts || [];
  return (
    <div className="sv-control">
      <button
        type="button"
        className={`ghost-button sv-trigger${alerts.length ? " sv-trigger-alert" : ""}`}
        onClick={() => { void checkRef.current?.(true); }}
        disabled={loading}
        aria-haspopup="dialog"
        title={error || "ตรวจสินค้าเฝ้าระวังพิเศษสาขา 005"}
      >
        {loading ? "กำลังตรวจสินค้าเฝ้าระวัง…" : `เฝ้าระวัง 005${snapshot ? ` · ${alerts.length}` : ""}`}
        {error ? " • อ่านข้อมูลไม่ได้" : ""}
      </button>
      <dialog
        ref={dialogRef}
        className="sv-dialog"
        aria-labelledby="sv-title"
        aria-describedby="sv-description"
        onCancel={() => setOpen(false)}
        onClose={() => setOpen(false)}
      >
        <div className="sv-header">
          <div><p className="sv-eyebrow">SPECIAL VIGILANT PRODUCT · สาขา 005</p>
            <h2 id="sv-title">สินค้าเฝ้าระวังพิเศษ {alerts.length} รายการ</h2>
          </div>
          <button type="button" className="ghost-button" autoFocus onClick={() => setOpen(false)}
            aria-label="ปิดแจ้งเตือนสินค้าเฝ้าระวัง">ปิด</button>
        </div>
        <p id="sv-description">
          ตรวจ {SPECIAL_VIGILANT_PRODUCTS.length} รหัส เมื่อสต๊อกเป็นศูนย์ ติดลบ หรือต่ำกว่าเป้าหมายที่เว็บคำนวณ
          · แจ้งเตือนซ้ำทุก 2 ชั่วโมงขณะเปิดเว็บ
        </p>
        {snapshot ? <p className="sv-checked">ตรวจล่าสุด {new Date(snapshot.checkedAt).toLocaleString("th-TH")}</p> : null}
        {error ? <p className="sv-notice" role="status">{error}</p> : null}
        {snapshot?.unavailableCount ? <p className="sv-notice" role="status">
          ยังอ่านสต๊อกหรือเป้าหมายได้ไม่ครบ {snapshot.unavailableCount} รายการ กดดูรายการทั้งหมดเพื่อตรวจสอบ
        </p> : null}
        {alerts.length ? <ProductTable rows={alerts} /> : snapshot ? <p>รายการที่อ่านข้อมูลครบมีสต๊อกเพียงพอ</p> : null}
        <details className="sv-all">
          <summary>รายการเฝ้าระวังทั้งหมด {SPECIAL_VIGILANT_PRODUCTS.length} รหัส</summary>
          {snapshot ? <ProductTable rows={snapshot.rows} /> : null}
        </details>
        <div className="sv-actions">
          <button type="button" className="ghost-button" disabled={loading}
            onClick={() => { void checkRef.current?.(true); }}>{loading ? "กำลังตรวจ…" : "ตรวจข้อมูลใหม่"}</button>
          <button type="button" className="primary-button" onClick={() => {
            setOpen(false); onNavigate?.("branch-stock");
          }}>เปิดสต๊อกสาขา 005</button>
        </div>
      </dialog>
    </div>
  );
}
