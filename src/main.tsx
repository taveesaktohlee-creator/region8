import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import Register from './user/Register'
import Index from './index'
import Profile from './user/Profile'
import ChangePassword from './user/ChangePassword'
import UserSettings from './user/UserSettings'
import TrainingHistory from './training/TrainingHistory'
import TrainingCourses from './training/TrainingCourses'
import ProgramMonitoring from './monitor/ProgramMonitoring'
import SystemUsageReport from './user/SystemUsageReport'
import OfficeSecurityReport from './security_report/OfficeSecurityReport'
import PermissionGuard from './lib/PermissionGuard'
import { createSession, startHeartbeat, startPageTracking, getSessionId } from './lib/activityTracker'
import './index.css'

import { HeroUIProvider } from '@heroui/system'

const path = window.location.pathname;

// เริ่ม heartbeat + page tracking สำหรับ logged-in users
const userStr = localStorage.getItem('user');
if (userStr && userStr !== 'undefined' && path !== '/' && path !== '/register') {
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
  '/training-history':     { component: <TrainingHistory />,      menuKey: 'training' },
  '/training-courses':     { component: <TrainingCourses />,      menuKey: 'report_course' },
  '/program-monitoring':   { component: <ProgramMonitoring />,    menuKey: 'report_monitor' },
  '/system-usage-report':  { component: <SystemUsageReport />,    menuKey: 'report_usage' },
  '/office-security-report': { component: <OfficeSecurityReport />, menuKey: 'report_security' },
};

function AppRouter() {
  // หน้าที่ไม่ต้องตรวจสอบสิทธิ์
  if (path === '/register') return <Register />;
  if (path === '/index') return <Index />;

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
