import { Navigate, Route, Routes } from 'react-router-dom';

import AdminLayout from '../components/layout/AdminLayout';
import StudentLayout from '../components/layout/StudentLayout';
import {
  RedirectIfAuthenticated,
  RequireAuth,
  RequireRole,
  RoleHomeRedirect,
} from './guards';

/* --- Auth pages ---------------------------------------------------------- */
import ForgotPasswordPage from '../features/auth/pages/ForgotPasswordPage';
import LoginPage from '../features/auth/pages/LoginPage';
import RegisterPage from '../features/auth/pages/RegisterPage';
import ResetPasswordPage from '../features/auth/pages/ResetPasswordPage';
import VerifyEmailPage from '../features/auth/pages/VerifyEmailPage';

/* --- Student pages ------------------------------------------------------- */
import AnalyticsPage from '../features/analytics/pages/AnalyticsPage';
import AssistantPage from '../features/ai-assistant/pages/AssistantPage';
import BrowseCoursesPage from '../features/courses/pages/BrowseCoursesPage';
import CourseDetailPage from '../features/courses/pages/CourseDetailPage';
import DashboardPage from '../features/student-dashboard/pages/DashboardPage';
import FocusTimerPage from '../features/focus-timer/pages/FocusTimerPage';
import GoalsPage from '../features/goals/pages/GoalsPage';
import MaterialsPage from '../features/materials/pages/MaterialsPage';
import MyCoursesPage from '../features/courses/pages/MyCoursesPage';
import NotificationsPage from '../features/notifications/pages/NotificationsPage';
import ProfileSettingsPage from '../features/settings/pages/ProfileSettingsPage';
import SyllabusPage from '../features/syllabus/pages/SyllabusPage';
import TasksPage from '../features/planner/pages/TasksPage';
import TimetablePage from '../features/planner/pages/TimetablePage';

/* --- Admin pages --------------------------------------------------------- */
import AdminDashboardPage from '../features/admin/pages/AdminDashboardPage';
import AdminSettingsPage from '../features/admin/pages/AdminSettingsPage';
import AnnouncementsPage from '../features/admin/pages/AnnouncementsPage';
import AuditLogsPage from '../features/admin/pages/AuditLogsPage';
import CourseEditorPage from '../features/admin/pages/CourseEditorPage';
import CourseManagementPage from '../features/admin/pages/CourseManagementPage';
import MaterialManagementPage from '../features/admin/pages/MaterialManagementPage';
import ReportsPage from '../features/admin/pages/ReportsPage';
import StudentDetailPage from '../features/admin/pages/StudentDetailPage';
import StudentManagementPage from '../features/admin/pages/StudentManagementPage';
import SubjectManagementPage from '../features/admin/pages/SubjectManagementPage';
import SyllabusManagementPage from '../features/admin/pages/SyllabusManagementPage';

import NotFoundPage from '../features/misc/pages/NotFoundPage';

/**
 * Complete route table.
 *
 * `/app/*` is student-only, `/admin/*` is admin-only, and both role checks
 * read the server-verified role from GET /auth/me. The API re-checks the role
 * on every request, so these guards are navigation, not security.
 */
export default function AppRouter() {
  return (
    <Routes>
      {/* Public auth routes */}
      <Route element={<RedirectIfAuthenticated />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Role-based landing */}
      <Route path="/" element={<RoleHomeRedirect />} />

      {/* Student application — PRD section 5, 11 destinations */}
      <Route element={<RequireAuth />}>
        <Route element={<RequireRole role="student" />}>
          <Route path="/app" element={<StudentLayout />}>
            <Route index element={<Navigate to="/app/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />

            <Route path="courses" element={<MyCoursesPage />} />
            <Route path="courses/browse" element={<BrowseCoursesPage />} />
            <Route path="courses/:courseId" element={<CourseDetailPage />} />

            <Route path="syllabus" element={<SyllabusPage />} />
            <Route path="syllabus/:courseId" element={<SyllabusPage />} />

            <Route path="planner" element={<TimetablePage />} />
            <Route path="planner/tasks" element={<TasksPage />} />

            <Route path="focus" element={<FocusTimerPage />} />
            <Route path="goals" element={<GoalsPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="assistant" element={<AssistantPage />} />
            <Route path="assistant/:conversationId" element={<AssistantPage />} />
            <Route path="materials" element={<MaterialsPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="settings" element={<ProfileSettingsPage />} />
          </Route>
        </Route>

        {/* Administration — exactly the nine PRD 4.1 destinations */}
        <Route element={<RequireRole role="admin" />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboardPage />} />

            <Route path="students" element={<StudentManagementPage />} />
            <Route path="students/:studentId" element={<StudentDetailPage />} />

            <Route path="courses" element={<CourseManagementPage />} />
            <Route path="courses/:courseId" element={<CourseEditorPage />} />

            <Route path="subjects" element={<SubjectManagementPage />} />
            <Route path="syllabus" element={<SyllabusManagementPage />} />
            <Route path="materials" element={<MaterialManagementPage />} />
            <Route path="announcements" element={<AnnouncementsPage />} />
            <Route path="reports" element={<ReportsPage />} />

            <Route path="settings" element={<AdminSettingsPage />} />
            {/* Audit review belongs to PRD 4.10 "Profile & Settings"; it also
                has its own route so the dashboard can link straight to it. */}
            <Route path="audit-logs" element={<AuditLogsPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
