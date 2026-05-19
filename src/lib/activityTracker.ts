/**
 * Activity Tracker - ติดตามการใช้งานระบบ
 * - สร้าง session เมื่อ login
 * - บันทึกการเข้าเมนูต่างๆ พร้อม active time (เฉพาะเมื่อหน้าจอ visible)
 * - Heartbeat ทุก 30 วินาที เพื่ออัปเดตสถานะออนไลน์
 * - ปิด session เมื่อ logout
 */

import { API_BASE } from './apiConfig';

const SESSION_KEY = 'usage_session_id';
const USAGE_RESET_VERSION = '2026-05-18T09:57:34+07:00';
const USAGE_RESET_VERSION_KEY = 'usage_tracking_reset_version';

// ---- Session Management ----

function ensureUsageResetVersion() {
  const currentVersion = localStorage.getItem(USAGE_RESET_VERSION_KEY);
  if (currentVersion !== USAGE_RESET_VERSION) {
    localStorage.removeItem(SESSION_KEY);
    localStorage.setItem(USAGE_RESET_VERSION_KEY, USAGE_RESET_VERSION);
  }
}

export async function createSession(userId: number): Promise<number | null> {
  ensureUsageResetVersion();
  try {
    const res = await fetch(`${API_BASE}/api/usage/login-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        ip_address: '',
        user_agent: navigator.userAgent
      })
    });
    const data = await res.json();
    if (data.session_id) {
      localStorage.setItem(SESSION_KEY, String(data.session_id));
      return data.session_id;
    }
  } catch (e) { console.error('createSession error', e); }
  return null;
}

export async function closeSession() {
  const sid = localStorage.getItem(SESSION_KEY);
  const user = localStorage.getItem('user');
  const userId = user ? JSON.parse(user)?.user_id : null;
  try {
    await fetch(`${API_BASE}/api/usage/logout-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sid ? Number(sid) : null, user_id: userId })
    });
  } catch { /* ignore */ }
  localStorage.removeItem(SESSION_KEY);
}

export function getSessionId(): number | null {
  ensureUsageResetVersion();
  const v = localStorage.getItem(SESSION_KEY);
  const sessionId = v ? Number(v) : null;
  return sessionId && Number.isFinite(sessionId) && sessionId > 0 ? sessionId : null;
}

// ---- Heartbeat (online status) ----

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

export async function sendHeartbeat() {
  const sid = getSessionId();
  if (!sid) return false;
  try {
    const res = await fetch(`${API_BASE}/api/usage/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sid })
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function startHeartbeat() {
  stopHeartbeat();
  void sendHeartbeat(); // send immediately
  heartbeatTimer = setInterval(() => { void sendHeartbeat(); }, 30_000); // every 30s
}

export function stopHeartbeat() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
}

// ---- Page Activity Tracking ----

// MENU_MAP: path -> { menu_key, menu_name }
const MENU_MAP: Record<string, { menu_key: string; menu_name: string }> = {
  '/index':                  { menu_key: 'home', menu_name: 'หน้าหลัก' },
  '/profile':                { menu_key: 'profile', menu_name: 'ข้อมูลส่วนตัว' },
  '/training-history':       { menu_key: 'training', menu_name: 'ประวัติการอบรม' },
  '/change-password':        { menu_key: 'change_password', menu_name: 'เปลี่ยนรหัสผ่าน' },
  '/user-settings':          { menu_key: 'user_settings', menu_name: 'ตั้งค่าผู้ใช้งาน' },
  '/monitor-data':           { menu_key: 'monitor_data', menu_name: 'บันทึกกำกับติดตามกลุ่มเทคฯ' },
  '/training-admin':         { menu_key: 'training_admin', menu_name: 'จัดการระบบอบรม' },
  '/program-monitoring':     { menu_key: 'report_monitor', menu_name: 'รายงานการกำกับติดตาม' },
  '/training-courses':       { menu_key: 'report_course', menu_name: 'หลักสูตรการอบรม' },
  '/system-usage-report':    { menu_key: 'report_usage', menu_name: 'รายงานการใช้งานระบบ' },
  '/office-security-report': { menu_key: 'report_security', menu_name: 'รายงานความปลอดภัย' },
};

let activeStartTime: number | null = null;
let currentMenuKey: string | null = null;
let currentMenuName: string | null = null;
let flushTimer: ReturnType<typeof setInterval> | null = null;
let trackingCleanup: (() => void) | null = null;

function getUserId(): number | null {
  try {
    const u = localStorage.getItem('user');
    return u ? JSON.parse(u)?.user_id : null;
  } catch { return null; }
}

function sendActiveTime(seconds: number) {
  const userId = getUserId();
  const sid = getSessionId();
  if (!userId || !currentMenuKey || seconds <= 0) return;
  fetch(`${API_BASE}/api/usage/log-activity`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: userId,
      session_id: sid,
      menu_key: currentMenuKey,
      menu_name: currentMenuName,
      active_seconds: seconds,
    })
  }).catch(() => {});
}

function shouldTrackActiveTime() {
  return document.visibilityState === 'visible' && document.hasFocus();
}

function pauseTracking() {
  if (activeStartTime) {
    const elapsed = Math.floor((Date.now() - activeStartTime) / 1000);
    if (elapsed > 0) sendActiveTime(elapsed);
    activeStartTime = null;
  }
}

function resumeTracking() {
  if (!activeStartTime && shouldTrackActiveTime()) {
    activeStartTime = Date.now();
  }
}

function syncTrackingState() {
  if (shouldTrackActiveTime()) {
    resumeTracking();
  } else {
    pauseTracking();
  }
}

/**
 * เริ่มติดตามการใช้งานหน้าปัจจุบัน
 * เรียกครั้งเดียวต่อ page load
 */
export function startPageTracking() {
  if (trackingCleanup) {
    trackingCleanup();
    trackingCleanup = null;
  }

  const path = window.location.pathname;
  const menu = MENU_MAP[path];
  if (!menu) return;

  const userId = getUserId();
  const sid = getSessionId();
  if (!userId) return;

  currentMenuKey = menu.menu_key;
  currentMenuName = menu.menu_name;

  // บันทึกว่าเข้าหน้านี้ (insert new log row)
  fetch(`${API_BASE}/api/usage/log-activity`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: userId,
      session_id: sid,
      menu_key: currentMenuKey,
      menu_name: currentMenuName,
    })
  }).catch(() => {});

  // เริ่มนับเวลาเฉพาะเมื่อหน้าเว็บเป็นหน้าต่างที่ผู้ใช้กำลังดูอยู่จริง
  activeStartTime = shouldTrackActiveTime() ? Date.now() : null;

  // ฟัง visibility change (minimize, switch tab, etc.)
  const handleVisibility = () => syncTrackingState();
  document.addEventListener('visibilitychange', handleVisibility);

  // ฟัง focus/blur (หน้าต่างอื่นบดบัง)
  const handleBlur = () => syncTrackingState();
  const handleFocus = () => syncTrackingState();
  window.addEventListener('blur', handleBlur);
  window.addEventListener('focus', handleFocus);

  // Flush active time ระหว่างใช้งาน เพื่อลดความคลาดเคลื่อนของรายงาน
  flushTimer = setInterval(() => {
    if (shouldTrackActiveTime() && activeStartTime) {
      const elapsed = Math.floor((Date.now() - activeStartTime) / 1000);
      if (elapsed > 0) {
        sendActiveTime(elapsed);
        activeStartTime = Date.now(); // reset
      }
    } else {
      pauseTracking();
    }
  }, 15_000);

  // ก่อนออกจากหน้า flush เวลาที่ค้าง
  const handleBeforeUnload = () => {
    if (activeStartTime) {
      const elapsed = Math.floor((Date.now() - activeStartTime) / 1000);
      if (elapsed > 0) {
        // Use sendBeacon for reliability
        const payload = JSON.stringify({
          user_id: userId,
          session_id: sid,
          menu_key: currentMenuKey,
          menu_name: currentMenuName,
          active_seconds: elapsed,
        });
        navigator.sendBeacon(`${API_BASE}/api/usage/log-activity`, new Blob([payload], { type: 'application/json' }));
      }
      activeStartTime = null;
    }
  };
  window.addEventListener('beforeunload', handleBeforeUnload);
  window.addEventListener('pagehide', handleBeforeUnload);

  trackingCleanup = () => {
    handleBeforeUnload();
    activeStartTime = null;
    document.removeEventListener('visibilitychange', handleVisibility);
    window.removeEventListener('blur', handleBlur);
    window.removeEventListener('focus', handleFocus);
    window.removeEventListener('beforeunload', handleBeforeUnload);
    window.removeEventListener('pagehide', handleBeforeUnload);
    if (flushTimer) clearInterval(flushTimer);
    flushTimer = null;
    trackingCleanup = null;
  };

  return trackingCleanup;
}
