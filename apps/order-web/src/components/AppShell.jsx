import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import CartBadge from "./CartBadge";
import NotificationBell from "./NotificationBell";

function navClassName({ isActive }) {
  return isActive ? "app-nav-link active" : "app-nav-link";
}

export default function AppShell({ children }) {
  const { session, logout } = useAuth();
  const { lineCount } = useCart();

  return (
    <div className="page app-shell">
      <header className="hero app-hero">
        <div>
          <p className="eyebrow">SC-StockDay-Ordering</p>
          <h1>คำขอสินค้าระหว่างสาขา</h1>
          <p className="subtle">
            ตรวจสต็อกของสาขาอื่น สร้างตะกร้าคำขอ และเตรียมต่อยอดไปยัง workflow ตอบกลับในงานถัดไป
          </p>
        </div>

        <div className="hero-card session-card">
          <div>
            <span className="session-label">สาขาที่ใช้งาน</span>
            <strong>{session?.branchCode || "-"}</strong>
            <p className="session-meta">
              {(session?.branchName || "").trim() || "ผูกจาก session ฝั่งเซิร์ฟเวอร์"}
            </p>
          </div>
          <div>
            <span className="session-label">ผู้ใช้</span>
            <strong>{session?.user?.displayName || session?.user?.username || session?.user?.id || "-"}</strong>
            <p className="session-meta">role: {session?.role || "-"}</p>
          </div>
          <button type="button" className="ghost strong-ghost" onClick={logout}>
            ออกจากระบบ
          </button>
        </div>
      </header>

      <nav className="panel app-nav">
        <NavLink to="/stock" className={navClassName}>
          สต็อกสาขา
        </NavLink>
        <NavLink to="/recommendations" className={navClassName}>
          คำแนะนำสต๊อก
        </NavLink>
        <NavLink to="/cart" className={navClassName}>
          ตะกร้า
          <CartBadge count={lineCount} />
        </NavLink>
        <NavLink to="/requests" className={navClassName}>
          สถานะคำขอของฉัน
        </NavLink>
        <NavLink to="/incoming" className={navClassName}>
          รับคำขอ
        </NavLink>
        <div className="app-nav-spacer" />
        <NotificationBell />
      </nav>

      <main>{children}</main>
    </div>
  );
}
