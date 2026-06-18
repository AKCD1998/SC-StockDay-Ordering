import { useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const { login, error: sessionError, setError } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setFormError("");
    setError("");

    try {
      await login({ username, password });
      setPassword("");
    } catch (loginError) {
      setFormError(loginError.message || "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <section className="hero login-hero">
        <div>
          <p className="eyebrow">SC-StockDay-Ordering</p>
          <h1>เข้าสู่ระบบสาขา</h1>
          <p className="subtle">
            order-web จะอ่าน `branch_code` จาก session ฝั่งเซิร์ฟเวอร์เท่านั้น เพื่อไม่ให้หน้าเว็บระบุสาขาเอง
          </p>
        </div>

        <form className="hero-card login-card" onSubmit={handleSubmit}>
          <label>
            Username
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="ชื่อผู้ใช้ของสาขา"
            />
          </label>

          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="รหัสผ่าน"
            />
          </label>

          <button type="submit" disabled={submitting}>
            {submitting ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>

          {formError || sessionError ? (
            <p className="message error-text">{formError || sessionError}</p>
          ) : null}
        </form>
      </section>
    </div>
  );
}
