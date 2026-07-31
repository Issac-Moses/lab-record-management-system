import { Navigate } from "react-router-dom";

/** @deprecated Use Reports → Proctor tab. */
export default function AdminProctorDashboard() {
  return <Navigate to="/admin/submissions?tab=proctor" replace />;
}
