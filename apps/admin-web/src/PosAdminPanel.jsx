import { useEffect, useRef, useState } from "react";
import { apiFetch } from "./lib/apiClient.js";
import scLogoUrl from "./assets/sc-pos-logo.svg";
import "./PosAdminPanel.css";

const labels = { approved: "อนุญาต", pending: "รอตรวจยืนยัน", denied: "ไม่อนุญาต" };
const tones = { approved: "good", pending: "warning", denied: "danger" };

function WindowsIcon() {
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m2 4 9-1.3v8.6H2V4Zm10.5-1.5L22 1v10.3h-9.5V2.5ZM2 12.8h9v8.5L2 20v-7.2Zm10.5 0H22V23l-9.5-1.5v-8.7Z" /></svg>;
}

function DownloadIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4" /></svg>;
}

export default function PosAdminPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const inventoryRef = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    async function load() {
      try {
        const response = await apiFetch("/api/admin/pos-devices", { signal: controller.signal, cache: "no-store" });
        if (response.status === 403) throw new Error("หน้านี้สำหรับบัญชีแอดมินเท่านั้น");
        if (!response.ok) throw new Error("ยังโหลดข้อมูลสิทธิ์เครื่องไม่ได้ กรุณาลองใหม่");
        const value = await response.json();
        if (!Array.isArray(value.devices) || !value.installer) throw new Error("ข้อมูลสิทธิ์เครื่องยังไม่พร้อม");
        if (!controller.signal.aborted) setData(value);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure.message);
      }
    }
    void load();
    return () => controller.abort();
  }, [refresh]);

  return <section className="pos-admin" aria-labelledby="pos-admin-title">
    <div className="pos-admin-header">
      <div><h2 id="pos-admin-title">แอดมิน</h2><p>โปรแกรม SCCRM และสิทธิ์เครื่องหน้าร้าน</p></div>
      <button type="button" className="ghost-button" onClick={() => setRefresh(value => value + 1)}>โหลดข้อมูลใหม่</button>
    </div>
    {error ? <div className="notice error" role="alert">{error}</div> : !data ? <p role="status">กำลังโหลดสิทธิ์เครื่อง…</p> : <>
      <div className="pos-download-hero">
        <span className="pos-download-edition">SC DRUGSTORE · SOFTWARE DOWNLOAD</span>
        <div className="pos-download-brand">
          <img className="pos-download-logo" src={scLogoUrl} alt="โลโก้ SC" width="128" height="128" />
          <div className="pos-download-wordmark"><strong>SCCRM</strong><span>POS COMPANION</span></div>
        </div>
        <h3 className="pos-download-title">ระบบสมาชิก <span>สำหรับหน้าร้านของเรา</span></h3>
        <p className="pos-download-description">จัดการสมาชิกและสะสมแต้ม พร้อมเชื่อมต่อ AdaSoftware ของบริษัท</p>
        <div className="pos-download-actions">
          {data.installer.downloadUrl ? <a href={data.installer.downloadUrl} className="pos-download-button" rel="noopener noreferrer">
            <WindowsIcon /><span><strong>ดาวน์โหลดสำหรับ Windows</strong><small>เวอร์ชัน {data.installer.version} · ตัวติดตั้ง .exe</small></span><DownloadIcon />
          </a> : <button type="button" className="pos-download-button" disabled aria-describedby="pos-download-note">
            <WindowsIcon /><span><strong>ดาวน์โหลดสำหรับ Windows</strong><small>เวอร์ชัน {data.installer.version} · กำลังเตรียมเผยแพร่</small></span><DownloadIcon />
          </button>}
          <button type="button" className="pos-download-devices" onClick={() => inventoryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>ดูเครื่องที่อนุญาต <span aria-hidden="true">↓</span></button>
        </div>
        <div className="pos-download-requirements"><span>สำหรับเครื่องบริษัท</span><span>เชื่อมต่อ Tailscale</span><span>มี AdaSoftware</span></div>
        {!data.installer.downloadUrl && <p className="pos-download-note" id="pos-download-note">รุ่นใหม่กำลังเตรียมเผยแพร่ · รุ่น 1.2.0 เดิมยังไม่มีระบบจำกัดเครื่อง</p>}
      </div>
      <section className="panel pos-device-inventory" aria-labelledby="pos-device-title" ref={inventoryRef}>
      <div className="panel-header"><div><h3 id="pos-device-title">เครื่องที่อนุญาตให้ใช้งาน</h3><p>ตรวจสอบสิทธิ์และหลักฐาน AdaSoftware ของแต่ละเครื่อง</p></div></div>
      <div className="kpis">
        {Object.entries(labels).map(([status, label]) => <article className="kpi" key={status}><span>{label}</span><strong>{data.devices.filter(device => device.status === status).length}</strong></article>)}
      </div>
      <p className="meta-line">ผลตรวจเมื่อ {new Date(data.auditedAt).toLocaleString("th-TH")} · รายการนี้เป็นผลตรวจล่าสุดที่บันทึกไว้ ไม่ใช่สถานะออนไลน์ขณะนี้</p>
      <div className="table-wrap"><table><thead><tr><th>เครื่อง</th><th>Tailscale IP</th><th>สิทธิ์</th><th>หลักฐาน / เหตุผล</th></tr></thead>
        <tbody>{data.devices.map(device => <tr key={device.nodeId}><td><strong>{device.hostname}</strong><p className="meta-line">{device.nodeId}</p></td><td>{device.ipv4}</td><td><span className={`status ${tones[device.status] || "muted"}`}>{labels[device.status] || "รอตรวจยืนยัน"}</span></td><td>{device.reason}{device.adaVersion ? <p className="meta-line">AdaSoftware {device.adaVersion}</p> : null}</td></tr>)}</tbody>
      </table></div>
      </section>
    </>}
  </section>;
}
