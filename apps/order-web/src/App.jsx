import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell";
import { useAuth } from "./context/AuthContext";
import BranchStockPage from "./pages/BranchStockPage";
import CartPage from "./pages/CartPage";
import IncomingRequestDetailPage from "./pages/IncomingRequestDetailPage";
import IncomingRequestsPage from "./pages/IncomingRequestsPage";
import LoginPage from "./pages/LoginPage";
import MyRequestsPage from "./pages/MyRequestsPage";
import PackingDocumentPage from "./pages/PackingDocumentPage";
import RecommendationsPage from "./pages/RecommendationsPage";
import ReviewPage from "./pages/ReviewPage";

const stockRequestsEnabled =
  String(import.meta.env.VITE_FEATURE_STOCK_REQUESTS ?? "true").toLowerCase() !== "false";

function LoadingScreen() {
  return (
    <div className="page">
      <div className="notice">กำลังตรวจสอบ session ของสาขา...</div>
    </div>
  );
}

export default function App() {
  const { status, isAuthenticated } = useAuth();

  if (!stockRequestsEnabled) {
    return (
      <div className="page">
        <section className="panel">
          <h2>ระบบคำขอสินค้าระหว่างสาขายังไม่เปิดใช้งาน</h2>
          <p className="subtle">ผู้ดูแลระบบสามารถเปิดใช้งานหลังจากตรวจ migration และ pilot checklist แล้ว</p>
        </section>
      </div>
    );
  }

  if (status === "loading") {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/stock" replace />} />
        <Route path="/stock" element={<BranchStockPage />} />
        <Route path="/recommendations" element={<RecommendationsPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/cart/review" element={<ReviewPage />} />
        <Route path="/requests" element={<MyRequestsPage />} />
        <Route path="/incoming" element={<IncomingRequestsPage />} />
        <Route path="/incoming/:publicId" element={<IncomingRequestDetailPage />} />
        <Route path="/incoming/:publicId/document" element={<PackingDocumentPage />} />
        <Route path="*" element={<Navigate to="/stock" replace />} />
      </Routes>
    </AppShell>
  );
}
