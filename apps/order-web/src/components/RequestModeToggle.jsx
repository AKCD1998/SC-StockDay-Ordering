export default function RequestModeToggle({ active, onToggle }) {
  return (
    <button
      type="button"
      className={`request-mode-toggle${active ? " active" : ""}`}
      onClick={onToggle}
    >
      {active ? "ปิดโหมดขอสินค้า" : "ขอสินค้า"}
    </button>
  );
}
