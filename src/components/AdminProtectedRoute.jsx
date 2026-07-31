import ProtectedRoute from "./ProtectedRoute";

export default function AdminProtectedRoute({ children }) {
  return <ProtectedRoute allowedRole="admin">{children}</ProtectedRoute>;
}
