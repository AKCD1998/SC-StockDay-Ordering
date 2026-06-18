import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { formatDateTime } from "../lib/requestStatus";

const POLL_INTERVAL_MS = 45_000;

export default function NotificationBell() {
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);

  const refreshCount = useCallback(async () => {
    try {
      const payload = await api.getUnreadNotificationCount();
      setUnreadCount(payload?.unreadCount || 0);
    } catch (_error) {
      // notifications are a convenience layer; ignore transient errors
    }
  }, []);

  // Poll the unread count on an interval (DB-backed, no realtime infra yet).
  useEffect(() => {
    refreshCount();
    const timer = setInterval(refreshCount, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refreshCount]);

  // Close the dropdown when clicking outside it.
  useEffect(() => {
    if (!open) return undefined;
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function openList() {
    const next = !open;
    setOpen(next);
    if (!next) return;

    setLoading(true);
    try {
      const payload = await api.getNotifications();
      setItems(payload?.records || []);
    } catch (_error) {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleItemClick(item) {
    setOpen(false);
    if (!item.readAt) {
      try {
        await api.markNotificationRead(item.notificationId);
        setUnreadCount((count) => Math.max(0, count - 1));
      } catch (_error) {
        // ignore; navigation still proceeds
      }
    }
    if (item.linkTarget) {
      navigate(item.linkTarget);
    }
  }

  return (
    <div className="notification-bell" ref={containerRef}>
      <button
        type="button"
        className="ghost notification-bell-button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`การแจ้งเตือน${unreadCount ? ` (${unreadCount} รายการใหม่)` : ""}`}
        onClick={openList}
      >
        🔔
        {unreadCount ? <span className="notification-bell-badge">{unreadCount}</span> : null}
      </button>

      {open ? (
        <div className="notification-dropdown" role="menu">
          <div className="notification-dropdown-header">การแจ้งเตือน</div>
          {loading ? (
            <p className="notification-empty">กำลังโหลด...</p>
          ) : !items.length ? (
            <p className="notification-empty">ยังไม่มีการแจ้งเตือน</p>
          ) : (
            <ul className="notification-list">
              {items.map((item) => (
                <li key={item.notificationId}>
                  <button
                    type="button"
                    className={`notification-item${item.readAt ? "" : " unread"}`}
                    onClick={() => handleItemClick(item)}
                  >
                    <span className="notification-message">{item.message || item.type}</span>
                    <span className="subtle">{formatDateTime(item.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
