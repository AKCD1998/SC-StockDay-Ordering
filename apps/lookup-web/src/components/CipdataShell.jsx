import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

const navItems = [
  { to: "/lookup", label: "ค้นหาข้อมูล" },
  { to: "/summary", label: "สรุปข้อมูล" },
  { to: "/followups", label: "ติดตามอาการ" },
  { to: "/reports", label: "รายงาน" },
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

function getInitialTheme() {
  if (typeof window === "undefined") return "light";
  const saved = window.localStorage.getItem("cipdata.theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeToggleButton({ theme, onToggle }) {
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={onToggle}
      aria-label={theme === "dark" ? "สลับเป็นโหมดสว่าง" : "สลับเป็นโหมดมืด"}
      title={theme === "dark" ? "สลับเป็นโหมดสว่าง" : "สลับเป็นโหมดมืด"}
    >
      {theme === "dark" ? "โหมดสว่าง" : "โหมดมืด"}
    </button>
  );
}

export default function CipdataShell({ children }) {
  const location = useLocation();
  const showHero = location.pathname !== "/lookup";
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("cipdata.theme", theme);
  }, [theme]);

  return (
    <div className="app-shell">
      {showHero ? (
        <header className="hero-card">
          <div className="hero-card__actions">
            <ThemeToggleButton theme={theme} onToggle={() => setTheme((current) => (current === "dark" ? "light" : "dark"))} />
          </div>

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
