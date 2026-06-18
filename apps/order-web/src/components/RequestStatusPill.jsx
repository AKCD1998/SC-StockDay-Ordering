import { statusLabel } from "../lib/requestStatus";

export default function RequestStatusPill({ status }) {
  return (
    <span className={`status-pill status-${String(status || "").toLowerCase()}`}>
      {statusLabel(status)}
    </span>
  );
}
