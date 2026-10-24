import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function StockQuantityPopover({ open, onOpenChange, className = "", label, quantity, quantityLabel, badge,
  heading = "สต็อกสาขา 004", dialogLabel = "รายละเอียดสต็อกสาขา 004", children }) {
  const id = useId();
  const trigger = useRef(null), bubble = useRef(null), closeTimer = useRef(null), pinned = useRef(false);
  const change = useRef(onOpenChange), skipFocus = useRef(false);
  change.current = onOpenChange;
  const [position, setPosition] = useState(null);
  const show = () => { clearTimeout(closeTimer.current); change.current(true); };
  const hide = () => { clearTimeout(closeTimer.current); pinned.current = false; change.current(false); };
  const leave = () => { if (!pinned.current) closeTimer.current = setTimeout(() => change.current(false), 160); };
  const dismiss = () => {
    if (bubble.current?.contains(document.activeElement)) {
      skipFocus.current = true;
      trigger.current?.focus({ preventScroll: true });
    }
    hide();
  };

  useEffect(() => () => { clearTimeout(closeTimer.current); change.current(false); }, []);
  useEffect(() => { if (!open) { pinned.current = false; setPosition(null); } }, [open]);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!trigger.current || !bubble.current) return;
      const anchor = trigger.current.getBoundingClientRect(), box = bubble.current.getBoundingClientRect();
      if (anchor.bottom < 0 || anchor.top > window.innerHeight || anchor.right < 0 || anchor.left > window.innerWidth) { change.current(false); return; }
      const margin = 12, gap = 13;
      const above = anchor.top >= box.height + gap + margin;
      const left = Math.max(margin, Math.min(anchor.left + anchor.width / 2 - box.width / 2, window.innerWidth - box.width - margin));
      const top = Math.max(margin, Math.min(above ? anchor.top - box.height - gap : anchor.bottom + gap, window.innerHeight - box.height - margin));
      setPosition({ left, top, side: above ? "above" : "below", arrow: Math.max(20, Math.min(anchor.left + anchor.width / 2 - left, box.width - 20)) });
    };
    const outside = event => { if (!trigger.current?.contains(event.target) && !bubble.current?.contains(event.target)) hide(); };
    const escape = event => { if (event.key === "Escape") { event.preventDefault(); dismiss(); } };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return <span className={`branch-stock-004-quantity stock-004-disclosure ${className}`}>
    <strong className="stock-004-primary">{quantityLabel ? <>
      <span aria-hidden="true">{quantity}</span>
      <span className="stock-004-visually-hidden">{quantityLabel}</span>
    </> : quantity}</strong>
    {badge ? <small className="stock-004-reference-label">{badge}</small> : null}
    <button ref={trigger} type="button" className="stock-004-info-button" aria-label={label}
      aria-expanded={open} aria-controls={open ? id : undefined} aria-haspopup="dialog"
      onMouseEnter={show} onMouseLeave={leave}
      onFocus={() => { if (skipFocus.current) { skipFocus.current = false; return; } show(); }}
      onBlur={event => { if (!bubble.current?.contains(event.relatedTarget) && (event.relatedTarget || !pinned.current)) hide(); }}
      onClick={() => { if (pinned.current) hide(); else { pinned.current = true; show(); } }}>
      <span aria-hidden="true">ⓘ</span>
    </button>
    {open ? createPortal(<div ref={bubble} id={id} role="dialog" aria-label={dialogLabel}
      className={`stock-004-popover ${position?.side || "below"}`}
      style={position ? { left: position.left, top: position.top, "--stock-bubble-arrow": `${position.arrow}px` } : { visibility: "hidden" }}
      onMouseEnter={() => clearTimeout(closeTimer.current)} onMouseLeave={leave}
      onBlur={event => { if (!bubble.current?.contains(event.relatedTarget) && event.relatedTarget !== trigger.current) hide(); }}>
      <div className="stock-004-popover-heading"><strong>{heading}</strong><button type="button" aria-label="ปิดรายละเอียดสต็อก" onClick={dismiss}>×</button></div>
      <div className="stock-004-expanded-details">{children}</div>
    </div>, document.body) : null}
  </span>;
}
