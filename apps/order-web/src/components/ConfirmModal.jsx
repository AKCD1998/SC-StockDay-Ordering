import { useEffect, useRef } from "react";

// Accessible confirm dialog: ESC to cancel, focus moves to the confirm button on
// open and is restored on close, backdrop click cancels. Disabled while `busy`.
export default function ConfirmModal({
  open,
  title,
  children,
  confirmLabel = "ยืนยัน",
  cancelLabel = "ยกเลิก",
  confirmClassName = "primary",
  busy = false,
  onConfirm,
  onCancel,
}) {
  const confirmRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    previousFocusRef.current = document.activeElement;
    confirmRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape" && !busy) {
        onCancel();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus();
      }
    };
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <section
        className="modal-card confirm-modal-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="confirm-modal-title">{title}</h2>
        </div>

        <div className="confirm-modal-body">{children}</div>

        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            ref={confirmRef}
            className={confirmClassName}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "กำลังดำเนินการ..." : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
