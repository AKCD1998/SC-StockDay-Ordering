export default function AdminNavigation({
  navigationGroups,
  view,
  openNavGroup,
  navigationMenuRef,
  stockRequestBadgeCount,
  syncFailureBadgeCount,
  preorderBadgeCount,
  handleNavigate,
  closeNavGroup,
  setOpenNavGroup,
  handleNavTriggerKeyDown,
  handleNavItemKeyDown,
}) {
  return (
    <nav className="view-nav hero-nav" aria-label="เมนูหลัก" ref={navigationMenuRef}>
      {navigationGroups.map((group) => {
        const activeItem = group.items.find((item) => item.view === view);
        const isOpen = openNavGroup === group.id;
        const hasDropdown = group.items.length > 1 || group.items.some((item) => item.disabled);
        const groupBadgeCount = group.items.some((item) => item.view === "stock-requests")
          ? stockRequestBadgeCount
          : group.items.some((item) => item.view === "sync-log")
            ? syncFailureBadgeCount
            : group.items.some((item) => item.view === "preorder")
              ? preorderBadgeCount
              : 0;
        const groupHasNotif = groupBadgeCount > 0;
        const triggerClassName = [
          "view-nav-btn",
          "hero-nav-trigger",
          activeItem ? "active" : "",
          isOpen ? "open" : "",
        ].filter(Boolean).join(" ");

        if (!hasDropdown) {
          const item = group.items[0];
          return (
            <button
              key={group.id}
              type="button"
              className={[
                triggerClassName,
                item.disabled ? "view-nav-btn-disabled" : "",
              ].filter(Boolean).join(" ")}
              disabled={item.disabled}
              aria-disabled={item.disabled}
              onClick={() => handleNavigate(item)}
            >
              <span className="hero-nav-mark" aria-hidden="true">{group.shortLabel}</span>
              <span className="hero-nav-label">{group.label}</span>
              {item.disabled ? <span className="view-nav-badge">เร็วๆนี้</span> : null}
              {item.view === "preorder" && preorderBadgeCount > 0 ? <span className="nav-notif-badge nav-trigger-badge">{preorderBadgeCount > 99 ? "99+" : preorderBadgeCount}</span> : null}
            </button>
          );
        }

        return (
          <div
            key={group.id}
            className={isOpen ? "hero-nav-group open" : "hero-nav-group"}
            data-nav-group={group.id}
          >
            <button
              type="button"
              className={triggerClassName}
              aria-haspopup="menu"
              aria-expanded={isOpen}
              data-nav-trigger={group.id}
              onClick={() => {
                if (isOpen) {
                  closeNavGroup(group.id, { restoreFocus: true });
                } else {
                  setOpenNavGroup(group.id);
                }
              }}
              onKeyDown={(event) => handleNavTriggerKeyDown(event, group)}
            >
              <span className="hero-nav-mark" aria-hidden="true">{group.shortLabel}</span>
              <span className="hero-nav-label">{group.label}</span>
              <span className="hero-nav-chevron" aria-hidden="true">▾</span>
              {groupHasNotif ? (
                <span className="nav-notif-badge nav-trigger-badge">{groupBadgeCount > 99 ? "99+" : groupBadgeCount}</span>
              ) : null}
            </button>
            <div
              className="hero-nav-menu"
              role="menu"
              aria-label={group.label}
              aria-hidden={!isOpen}
              hidden={!isOpen}
            >
              {group.items.map((item) => {
                const isActive = item.view === view;
                return (
                  <button
                    key={item.view || item.label}
                    type="button"
                    className={[
                      "hero-nav-item",
                      isActive ? "active" : "",
                      item.disabled ? "disabled" : "",
                    ].filter(Boolean).join(" ")}
                    role="menuitem"
                    disabled={item.disabled}
                    data-nav-item
                    onClick={() => handleNavigate(item)}
                    onKeyDown={(event) => handleNavItemKeyDown(event, group.id)}
                  >
                    <span className="hero-nav-item-main">
                      <span>{item.label}</span>
                      {item.disabled ? <span className="view-nav-badge">เร็วๆนี้</span> : null}
                      {item.view === "stock-requests" && stockRequestBadgeCount > 0 ? (
                        <span className="nav-notif-badge">{stockRequestBadgeCount > 99 ? "99+" : stockRequestBadgeCount}</span>
                      ) : null}
                      {item.view === "sync-log" && syncFailureBadgeCount > 0 ? (
                        <span className="nav-notif-badge">{syncFailureBadgeCount > 99 ? "99+" : syncFailureBadgeCount}</span>
                      ) : null}
                      {item.view === "preorder" && preorderBadgeCount > 0 ? (
                        <span className="nav-notif-badge">{preorderBadgeCount > 99 ? "99+" : preorderBadgeCount}</span>
                      ) : null}
                    </span>
                    <span className="hero-nav-item-desc">{item.description}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
