import { Navigate, Route, Routes } from "react-router-dom";
import CipdataShell from "./components/CipdataShell.jsx";
import FollowupsPage from "./pages/FollowupsPage.jsx";
import LookupPage from "./pages/LookupPage.jsx";
import ReportPreviewPage from "./pages/ReportPreviewPage.jsx";
import ReportsPage from "./pages/ReportsPage.jsx";
import SummaryPage from "./pages/SummaryPage.jsx";

export default function App() {
  return (
    <CipdataShell>
      <Routes>
        <Route path="/" element={<Navigate to="/lookup" replace />} />
        <Route path="/lookup" element={<LookupPage />} />
        <Route path="/summary" element={<SummaryPage />} />
        <Route path="/followups" element={<FollowupsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/reports/preview" element={<ReportPreviewPage />} />
        <Route path="*" element={<Navigate to="/lookup" replace />} />
      </Routes>
    </CipdataShell>
  );
}
