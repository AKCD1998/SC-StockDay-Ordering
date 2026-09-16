export function formatBranchContextLabel(branchCode, branchName = "") {
  if (!branchCode) return branchName || "ยังไม่ได้เลือกสาขา";
  return branchName ? `${branchCode} - ${branchName}` : `สาขา ${branchCode}`;
}

export default function AdminAccountActions({
  session,
  branchCode,
  activeBranchName,
  canSelectBranchContext,
  branchOptions,
  selectedBranchContext,
  setSelectedBranchContext,
  branchContextBusy,
  handleApplyBranchContext,
  theme,
  setTheme,
  accountMenuRef,
  accountMenuOpen,
  setAccountMenuOpen,
  handleLogout,
}) {
  return (
    <div className="account-actions">
      {(!branchCode && session?.user?.role !== "admin") ? <div className="branch-context-card">
        <span className="branch-context-label">สาขาที่ใช้งาน</span>
        {canSelectBranchContext ? (
          <div className="branch-context-controls">
            <select
              value={selectedBranchContext}
              onChange={(event) => {
                setSelectedBranchContext(event.target.value);
                if (event.target.value) {
                  handleApplyBranchContext(event.target.value);
                }
              }}
              disabled={branchContextBusy}
              aria-label="เลือกสาขาที่ใช้งาน"
            >
              <option value="">เลือกสาขา</option>
              {branchOptions
                .filter((branch) => {
                  const allowed = session?.permissions?.allowed_branch_codes;
                  return !allowed || allowed.includes(branch.branchCode);
                })
                .map((branch) => (
                  <option key={branch.branchCode} value={branch.branchCode}>
                    {formatBranchContextLabel(branch.branchCode, branch.branchName)}
                  </option>
                ))}
            </select>
            <button
              type="button"
              className="ghost-button branch-context-apply-button"
              onClick={() => handleApplyBranchContext(selectedBranchContext)}
              disabled={branchContextBusy || selectedBranchContext === (branchCode || "")}
            >
              {branchContextBusy ? "กำลังบันทึก..." : "ใช้สาขานี้"}
            </button>
          </div>
        ) : (
          <strong>{formatBranchContextLabel(branchCode, activeBranchName)}</strong>
        )}
        {branchCode ? (
          <span className="branch-context-current">
            ใช้งานอยู่: {formatBranchContextLabel(branchCode, activeBranchName)}
          </span>
        ) : (
          <span className="branch-context-current warning">ยังไม่ได้ตั้ง branch context</span>
        )}
      </div> : null}
      <button
        type="button"
        className="ghost-button theme-toggle"
        onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
        aria-label={theme === "dark" ? "สลับเป็นโหมดสว่าง" : "สลับเป็นโหมดมืด"}
      >
        <span aria-hidden="true">{theme === "dark" ? "☀️" : "🌙"}</span>
        <span>{theme === "dark" ? "โหมดสว่าง" : "โหมดมืด"}</span>
      </button>
      <div className="account-menu" ref={accountMenuRef}>
        <button
          type="button"
          className={accountMenuOpen ? "account-chip account-chip-open" : "account-chip"}
          onClick={() => setAccountMenuOpen((current) => !current)}
          aria-haspopup="menu"
          aria-expanded={accountMenuOpen}
          aria-label="เปิดเมนูบัญชีผู้ใช้"
        >
          <span className="account-avatar" aria-hidden="true">
            {String(session.user.id || "SC").slice(0, 2).toUpperCase()}
          </span>
          <span className="account-copy">
            <strong>{session.user.id}</strong>
            <span>{session.user.role}</span>
          </span>
          <span className="account-chevron" aria-hidden="true">
            ▾
          </span>
        </button>
        {accountMenuOpen ? (
          <div className="account-menu-panel" role="menu" aria-label="เมนูบัญชีผู้ใช้">
            <button
              type="button"
              className="primary-button logout-button"
              onClick={handleLogout}
              role="menuitem"
            >
              ออกจากระบบ
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
