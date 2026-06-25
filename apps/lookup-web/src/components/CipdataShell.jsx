import { NavLink } from "react-router-dom";

const navItems = [
  { to: "/lookup", label: "Lookup" },
  { to: "/summary", label: "Summary" },
  { to: "/followups", label: "Follow-up" },
  { to: "/reports", label: "Reports" },
];

export default function CipdataShell({ children }) {
  return (
    <div className="app-shell">
      <header className="hero-card">
        <div className="hero-copy">
          <span className="eyebrow">CiPData Migration</span>
          <h1>สำหรับกรอกข้อมูล</h1>
          <p>
            React SPA ที่คง workflow เดิมของ GAS ไว้ แต่แยกเป็นหน้าชัดเจนและเตรียมต่อกับ shared backend ผ่าน
            สัญญา `/api/cipdata/*`
          </p>
        </div>

        <nav className="top-nav" aria-label="CiPData navigation">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-pill${isActive ? " nav-pill--active" : ""}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="page-content">{children}</main>
    </div>
  );
}
