export default function CartBadge({ count }) {
  return <span className={`cart-badge${count ? "" : " empty"}`}>{count}</span>;
}
