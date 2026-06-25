import { NavLink, useLocation } from "react-router-dom";

const navItems = [
  { to: "/lookup", label: "Lookup" },
  { to: "/summary", label: "Summary" },
  { to: "/followups", label: "Follow-up" },
  { to: "/reports", label: "Reports" },
];

export function CipdataNav() {
  return (
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
  );
}

export default function CipdataShell({ children }) {
  const location = useLocation();
  const showHero = location.pathname !== "/lookup";

  return (
    <div className="app-shell">
      {showHero ? (
        <header className="hero-card">
          <div className="hero-copy">
            <span className="eyebrow">CiPData Migration</span>
            <h1>สำหรับกรอกข้อมูล</h1>
          </div>

          <CipdataNav />
        </header>
      ) : null}

      <main className="page-content">{children}</main>
    </div>
  );
}
