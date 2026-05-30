import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, BookOpen, CalendarDays, ClipboardList, Home, Loader2, LogOut, PanelLeft, RefreshCcw } from 'lucide-react';
import { API_BASE } from './lib/apiConfig';

interface HeaderProps {
  setIsSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleRefresh: () => void;
  isRefreshing: boolean;
  handleLogout: () => void;
}

type NotificationType = 'knowledge' | 'activity' | 'meeting_report';

interface AppNotification {
  id: string;
  type: NotificationType;
  source_id: number;
  title: string;
  subtitle: string;
  href: string;
  created_at: string;
}

function getStoredUserId() {
  try {
    const savedUser = localStorage.getItem('user');
    if (!savedUser || savedUser === 'undefined') return 0;
    const parsed = JSON.parse(savedUser);
    return Number(parsed?.user_id || 0);
  } catch {
    return 0;
  }
}

function formatNotificationDate(value: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('th-TH', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const Header: React.FC<HeaderProps> = ({ setIsSidebarOpen, handleRefresh, isRefreshing, handleLogout }) => {
  const userId = useMemo(() => getStoredUserId(), []);
  const notificationPanelRef = useRef<HTMLDivElement | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isNotificationLoading, setIsNotificationLoading] = useState(false);

  const loadNotifications = useCallback(async () => {
    if (!userId) return;
    setIsNotificationLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/notifications?user_id=${userId}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'โหลดแจ้งเตือนไม่สำเร็จ');
      setNotifications(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
    } finally {
      setIsNotificationLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return undefined;
    void loadNotifications();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadNotifications();
    }, 60_000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void loadNotifications();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [loadNotifications, userId]);

  useEffect(() => {
    if (!isNotificationOpen) return undefined;
    const handlePointerDown = (event: MouseEvent) => {
      if (!notificationPanelRef.current?.contains(event.target as Node)) setIsNotificationOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isNotificationOpen]);

  const handleNotificationClick = async (notification: AppNotification) => {
    setNotifications((current) => current.filter((item) => item.id !== notification.id));
    setIsNotificationOpen(false);
    try {
      await fetch(`${API_BASE}/api/notifications/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          notification_type: notification.type,
          source_id: notification.source_id,
        }),
        keepalive: true,
      });
    } catch {
      // Navigate anyway; the target page also marks the notification as read.
    }
    window.location.assign(notification.href || '/index');
  };

  const unreadCount = notifications.length;

  return (
    <header className="flex items-center justify-between px-8 py-5 sticky top-0 z-30 bg-[#F6F6F6]/90 backdrop-blur-3xl border-b border-black/5 transition-all">
      <div className="flex items-center gap-4">
        <button type="button" onClick={() => setIsSidebarOpen(prev => !prev)} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-white/60 rounded-xl transition-all shadow-sm lg:hidden border border-white/50">
          <PanelLeft size={22} />
        </button>
        <button type="button" onClick={() => setIsSidebarOpen(prev => !prev)} className="p-2 hidden lg:flex items-center justify-center bg-white/60 rounded-xl border border-white/50 shadow-sm text-slate-500 hover:text-blue-600 hover:shadow-md cursor-pointer transition-all">
          <PanelLeft size={20} />
        </button>
        <h1 className="text-2xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-slate-800 to-slate-500 tracking-tight drop-shadow-sm">
          สตท.8
        </h1>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => window.location.assign('/index')}
          className="p-2.5 bg-white/70 backdrop-blur-md text-slate-600 rounded-full shadow-sm border border-white/60 hover:bg-white hover:shadow-md transition-all group cursor-pointer"
          aria-label="หน้าหลัก"
          title="หน้าหลัก"
        >
          <Home size={18} className="group-hover:-translate-y-0.5 transition-transform" />
        </button>
        <button onClick={handleRefresh} className="p-2.5 bg-white/70 backdrop-blur-md text-slate-600 rounded-full shadow-sm border border-white/60 hover:bg-white hover:shadow-md transition-all group cursor-pointer">
          <RefreshCcw size={18} className={`${isRefreshing ? 'animate-spin text-blue-600' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
        </button>
        <div ref={notificationPanelRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setIsNotificationOpen((value) => !value);
              void loadNotifications();
            }}
            className="p-2.5 bg-white/70 backdrop-blur-md text-slate-600 rounded-full shadow-sm border border-white/60 hover:bg-white hover:shadow-md transition-all relative cursor-pointer"
            aria-label="แจ้งเตือน"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-red-500 px-1 text-[10px] font-black leading-none text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {isNotificationOpen && (
            <div className="fixed left-1/2 top-24 z-50 w-[min(92vw,420px)] -translate-x-1/2 overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl shadow-slate-900/15 sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-3 sm:w-[min(380px,calc(100vw-2rem))] sm:translate-x-0">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div>
                  <p className="text-sm font-black text-slate-900">แจ้งเตือน</p>
                  <p className="text-xs font-bold text-slate-400">คลังความรู้ ตารางกิจกรรม และรายงานประชุมใหม่</p>
                </div>
                {isNotificationLoading && <Loader2 className="animate-spin text-blue-600" size={18} />}
              </div>

              <div className="max-h-[420px] overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-5 py-8 text-center">
                    <Bell className="mx-auto mb-3 text-slate-200" size={34} />
                    <p className="text-sm font-black text-slate-500">ไม่มีแจ้งเตือนใหม่</p>
                  </div>
                ) : notifications.map((notification) => {
                  const isKnowledge = notification.type === 'knowledge';
                  const isMeetingReport = notification.type === 'meeting_report';
                  return (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => void handleNotificationClick(notification)}
                      className="flex w-full cursor-pointer gap-3 border-b border-slate-50 px-4 py-3 text-left transition hover:bg-blue-50/60"
                    >
                      <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${isKnowledge ? 'bg-rose-50 text-rose-600' : isMeetingReport ? 'bg-blue-50 text-blue-600' : 'bg-sky-50 text-sky-600'}`}>
                        {isKnowledge ? <BookOpen size={18} /> : isMeetingReport ? <ClipboardList size={18} /> : <CalendarDays size={18} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-black text-blue-600">{isKnowledge ? 'คลังความรู้ใหม่' : isMeetingReport ? 'รายงานการประชุมใหม่' : 'กิจกรรมใหม่'}</span>
                        <span className="mt-0.5 block truncate text-sm font-black text-slate-900">{notification.title}</span>
                        <span className="mt-1 block truncate text-xs font-bold text-slate-500">{notification.subtitle}</span>
                        {notification.created_at && (
                          <span className="mt-1 block text-[11px] font-bold text-slate-400">{formatNotificationDate(notification.created_at)}</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <button onClick={handleLogout} className="p-2.5 bg-white/70 backdrop-blur-md text-slate-600 rounded-full shadow-sm border border-white/60 hover:bg-white hover:shadow-md transition-all group cursor-pointer">
          <LogOut size={18} className="group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>
    </header>
  );
};

export default Header;
