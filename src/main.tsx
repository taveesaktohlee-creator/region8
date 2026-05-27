import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import Register from './user/Register'
import ResetPassword from './user/ResetPassword'
import Index from './index'
import Profile from './user/Profile'
import ChangePassword from './user/ChangePassword'
import UserSettings from './user/UserSettings'
import TrainingHistory from './training/TrainingHistory'
import TrainingCourses from './training/TrainingCourses'
import TrainingCourseDetail from './training/TrainingCourseDetail'
import TrainingAdmin from './training/TrainingAdmin'
import KnowledgeList from './knowledge/KnowledgeList'
import KnowledgeDetail from './knowledge/KnowledgeDetail'
import KnowledgeAdmin from './knowledge/KnowledgeAdmin'
import ActivityCalendar from './activity/ActivityCalendar'
import ProgramMonitoring from './monitor/ProgramMonitoring'
import MonitorData from './user/monitor_data'
import SystemUsageReport from './user/SystemUsageReport'
import OfficeSecurityReport from './security_report/OfficeSecurityReport'
import MeetingReportList from './meeting_reports/MeetingReportList'
import MeetingReportDetail from './meeting_reports/MeetingReportDetail'
import MeetingReportAdmin from './meeting_reports/MeetingReportAdmin'
import PermissionGuard from './lib/PermissionGuard'
import { createSession, startHeartbeat, startPageTracking, getSessionId } from './lib/activityTracker'
import './index.css'

import { HeroUIProvider } from '@heroui/system'

const path = window.location.pathname;
const PUBLIC_ROUTES = ['/', '/register', '/reset-password'];

// เริ่ม heartbeat + page tracking สำหรับ logged-in users
const userStr = localStorage.getItem('user');
if (userStr && userStr !== 'undefined' && !PUBLIC_ROUTES.includes(path)) {
  void (async () => {
    let sid = getSessionId();
    if (!sid) {
      try {
        const user = JSON.parse(userStr);
        if (user?.user_id) sid = await createSession(user.user_id);
      } catch { /* ignore */ }
    }
    if (sid) {
      startHeartbeat();
      startPageTracking();
    }
  })();
}

// Mapping ระหว่าง path กับ menu_key สำหรับตรวจสอบสิทธิ์
// เฉพาะ path ที่ต้องมีสิทธิ์เข้าถึงเท่านั้น
const PROTECTED_ROUTES: Record<string, { component: React.ReactNode; menuKey: string }> = {
  '/profile':              { component: <Profile />,              menuKey: 'profile' },
  '/change-password':      { component: <ChangePassword />,      menuKey: 'change_password' },
  '/user-settings':        { component: <UserSettings />,         menuKey: 'user_settings' },
  '/monitor-data':         { component: <MonitorData />,          menuKey: 'monitor_data' },
  '/training-admin':       { component: <TrainingAdmin />,        menuKey: 'training_admin' },
  '/knowledge-admin':      { component: <KnowledgeAdmin />,       menuKey: 'knowledge_admin' },
  '/meeting-reports-admin': { component: <MeetingReportAdmin />,   menuKey: 'meeting_reports_admin' },
  '/training-history':     { component: <TrainingHistory />,      menuKey: 'training' },
  '/training-courses':     { component: <TrainingCourses />,      menuKey: 'report_course' },
  '/knowledge':            { component: <KnowledgeList />,        menuKey: 'knowledge' },
  '/activity-calendar':    { component: <ActivityCalendar />,     menuKey: 'activity_calendar' },
  '/program-monitoring':   { component: <ProgramMonitoring />,    menuKey: 'report_monitor' },
  '/system-usage-report':  { component: <SystemUsageReport />,    menuKey: 'report_usage' },
  '/office-security-report': { component: <OfficeSecurityReport />, menuKey: 'report_security' },
  '/meeting-reports/office': { component: <MeetingReportList section="office" />, menuKey: 'meeting_reports_office' },
  '/meeting-reports/area': { component: <MeetingReportList section="area" />, menuKey: 'meeting_reports_area' },
};

function AppRouter() {
  // หน้าที่ไม่ต้องตรวจสอบสิทธิ์
  if (path === '/register') return <Register />;
  if (path === '/reset-password') return <ResetPassword />;
  if (path === '/index') return <Index />;

  if (path.startsWith('/training-courses/')) {
    const courseId = Number(path.split('/').filter(Boolean)[1]);
    return (
      <PermissionGuard menuKey="report_course">
        <TrainingCourseDetail courseId={courseId} />
      </PermissionGuard>
    );
  }

  if (path.startsWith('/knowledge/')) {
    const itemId = Number(path.split('/').filter(Boolean)[1]);
    return (
      <PermissionGuard menuKey="knowledge">
        <KnowledgeDetail itemId={itemId} />
      </PermissionGuard>
    );
  }

  if (path.startsWith('/meeting-reports/')) {
    const segment = path.split('/').filter(Boolean)[1];
    const reportId = Number(segment);
    if (Number.isFinite(reportId) && reportId > 0) {
      return <MeetingReportDetail reportId={reportId} />;
    }
  }

  // หน้าที่ต้องตรวจสอบสิทธิ์
  const protectedRoute = PROTECTED_ROUTES[path];
  if (protectedRoute) {
    return (
      <PermissionGuard menuKey={protectedRoute.menuKey}>
        {protectedRoute.component}
      </PermissionGuard>
    );
  }

  // หน้า login (default)
  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HeroUIProvider>
      <AppRouter />
    </HeroUIProvider>
  </React.StrictMode>,
)
