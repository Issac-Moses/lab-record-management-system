import { Navigate, Route, Routes } from "react-router-dom";
import Overview from "@/pages/Admin/Overview.jsx";
import DepartmentDashboard from "@/pages/Admin/DepartmentDashboard.jsx";
import AdminStudents from "@/pages/Admin/AdminStudents";
import StudentManagement from "@/pages/Admin/StudentManagement.jsx";
import Experiments from "@/pages/Admin/Experiments.jsx";
import Leaderboard from "@/pages/Admin/Leaderboard.jsx";
import SubjectsManagement from "@/pages/Admin/SubjectsManagement.jsx";
import AdminSettings from "@/pages/Admin/AdminSettings";
import NotificationsPage from "@/pages/Admin/Notifications";
import AdminSubmissions from "@/pages/Admin/AdminSubmissions";
import AdminInternalMarks from "@/pages/Admin/AdminInternalMarks";
import AdminExecutionTest from "@/pages/Admin/AdminExecutionTest";
export default function AdminRoutes() {
  return (
    <Routes>
      <Route index element={<Overview />} />
      <Route path="departments" element={<Navigate to="/admin" replace />} />
      <Route path="students" element={<StudentManagement />} />
      <Route path="student-management" element={<Navigate to="/admin/students" replace />} />
      <Route path="students-analytics" element={<AdminStudents />} />
      <Route path="students-legacy" element={<Navigate to="/admin/students" replace />} />
      <Route path="add-user" element={<Navigate to="/admin/students?tab=add" replace />} />
      <Route path="users" element={<Navigate to="/admin/students?tab=add" replace />} />
      <Route path="roles" element={<Navigate to="/admin/settings" replace />} />
      <Route path="experiments" element={<Experiments />} />
      <Route path="ai-monitor" element={<Experiments />} />
      <Route path="leaderboard" element={<Leaderboard />} />
      <Route path="subjects" element={<SubjectsManagement />} />
      <Route path="bulk-upload" element={<Navigate to="/admin/students?tab=import" replace />} />
      <Route path="notifications" element={<NotificationsPage />} />
      <Route path="submissions" element={<AdminSubmissions />} />
      <Route path="internal-marks" element={<AdminInternalMarks />} />
      <Route path="settings" element={<AdminSettings />} />
      <Route path="execution-test" element={<AdminExecutionTest />} />
      <Route path="proctor" element={<Navigate to="/admin/submissions?tab=proctor" replace />} />
      <Route path="gamification" element={<Navigate to="/admin/leaderboard?tab=gamification" replace />} />
      <Route path="department/:department" element={<Navigate to="./dashboard" replace />} />
      <Route path="department/:department/dashboard" element={<DepartmentDashboard />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
