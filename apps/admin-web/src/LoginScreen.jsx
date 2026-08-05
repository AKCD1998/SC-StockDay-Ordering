import { useState } from "react";

function AuthLogoMark() {
  return (
    <svg className="auth-logo-mark" width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
      <polygon points="17,1 32,9.5 32,24.5 17,33 2,24.5 2,9.5" fill="url(#authLogoGrad)" />
      <polygon points="17,6 26,11 26,22 17,27 8,22 8,11" fill="rgba(255,255,255,0.16)" />
      <defs>
        <linearGradient id="authLogoGrad" x1="2" y1="1" x2="32" y2="33" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#5b8dff" />
          <stop offset="1" stopColor="#1c2b8f" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function AuthUserIcon() {
  return (
    <svg className="auth-field-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 20c0-3.9 3.6-7 8-7s8 3.1 8 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function AuthLockIcon() {
  return (
    <svg className="auth-field-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="10.5" width="14" height="10" rx="2.4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function AuthEyeIcon({ open }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 3l18 18M9.9 5.1A9.9 9.9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a15.5 15.5 0 0 1-3.4 4.1M6.7 6.7C4 8.4 2.5 12 2.5 12S6 18.5 12 18.5a9.3 9.3 0 0 0 3.2-.6M14.1 14.1a3 3 0 0 1-4.2-4.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function LoginScreen({ authError, busy, username, password, onUsernameChange, onPasswordChange, onSubmit }) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  return (
    <div className="auth-page">
      <section className="auth-shell">
        <div className="auth-hero">
          <div className="auth-logo-lockup">
            <AuthLogoMark />
            <span className="auth-logo-text">SC StockDay</span>
          </div>
          <span className="auth-headline-accent" aria-hidden="true" />
          <h1>ศูนย์ควบคุม Stock Day</h1>
          <p className="auth-hero-body">
            เข้าสู่ระบบด้วยบัญชีผู้ดูแลเพื่อดูสถานะการจัดทำ KPI สต็อก
            และคำแนะนำสินค้า จากสาขา ผ่าน backend กลาง
          </p>
        </div>

        <form className="auth-card" onSubmit={onSubmit}>
          <div className="auth-card-icon" aria-hidden="true">
            <AuthLockIcon />
          </div>

          <div className="auth-card-header">
            <h2>เข้าสู่ระบบผู้ดูแล</h2>
            <p>ใช้ session cookie จาก Render backend</p>
          </div>

          <label className="auth-field-label">
            ชื่อผู้ใช้
            <div className="auth-field">
              <AuthUserIcon />
              <input
                value={username}
                onChange={onUsernameChange}
                autoComplete="username"
                placeholder="กรอกชื่อผู้ใช้"
              />
            </div>
          </label>

          <label className="auth-field-label">
            รหัสผ่าน
            <div className="auth-field">
              <AuthLockIcon />
              <input
                type={passwordVisible ? "text" : "password"}
                value={password}
                onChange={onPasswordChange}
                autoComplete="current-password"
                placeholder="กรอกรหัสผ่าน"
              />
              <button
                type="button"
                className="auth-field-toggle"
                onClick={() => setPasswordVisible((current) => !current)}
                aria-label={passwordVisible ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
              >
                <AuthEyeIcon open={passwordVisible} />
              </button>
            </div>
          </label>

          <label className="auth-remember">
            <input
              type="checkbox"
              className="auth-checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
            />
            จดจำการเข้าสู่ระบบ
          </label>

          {authError && <div className="notice error compact">{authError}</div>}

          <button type="submit" className="primary-button auth-submit" disabled={busy}>
            {busy ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>

          <div className="auth-footer">
            <span className="auth-divider" aria-hidden="true" />
            <span className="auth-copyright">© SC StockDay 2024</span>
          </div>
        </form>
      </section>
    </div>
  );
}
