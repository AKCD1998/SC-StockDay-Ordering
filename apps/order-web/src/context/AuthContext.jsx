import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ApiError, api, setCsrfToken } from "../lib/api";

const AuthContext = createContext(null);

function normalizeSessionPayload(data) {
  const user = data?.user || null;
  const branchCode = data?.branch_code || user?.branch_code || user?.branchCode || null;
  const branchName = data?.branch_name || user?.branch_name || user?.branchName || "";

  return {
    user,
    role: user?.role || data?.role || "",
    branchCode,
    branchName,
    csrfToken: data?.csrf_token || data?.csrfToken || "",
    permissions: data?.permissions || null,
  };
}

export function AuthProvider({ children }) {
  const [status, setStatus] = useState("loading");
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      try {
        setStatus("loading");
        setError("");

        const nextSession = normalizeSessionPayload(await api.me());
        if (!active) return;

        if (!nextSession.branchCode) {
          throw new Error("บัญชีนี้ยังไม่มี branch_code ใน session สำหรับ order-web");
        }

        setSession(nextSession);
        setCsrfToken(nextSession.csrfToken);
      } catch (sessionError) {
        if (!active) return;

        if (sessionError instanceof ApiError && sessionError.status === 401) {
          setSession(null);
          setCsrfToken("");
          setStatus("ready");
          return;
        }

        setSession(null);
        setCsrfToken("");
        setError(sessionError.message || "ตรวจสอบเซสชันไม่สำเร็จ");
      } finally {
        if (active) {
          setStatus("ready");
        }
      }
    }

    restoreSession();

    return () => {
      active = false;
    };
  }, []);

  async function login(credentials) {
    setError("");
    const nextSession = normalizeSessionPayload(await api.login(credentials));

    if (!nextSession.branchCode) {
      throw new Error("บัญชีนี้ยังไม่มี branch_code ใน session สำหรับ order-web");
    }

    setSession(nextSession);
    setCsrfToken(nextSession.csrfToken);
    return nextSession;
  }

  async function logout() {
    try {
      await api.logout();
    } finally {
      setSession(null);
      setCsrfToken("");
    }
  }

  const value = useMemo(
    () => ({
      status,
      session,
      error,
      setError,
      login,
      logout,
      isAuthenticated: Boolean(session?.branchCode),
    }),
    [error, session, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
