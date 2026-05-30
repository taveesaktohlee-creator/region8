import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Settings, Users, Menu, ChevronRight, ArrowLeft, BellRing } from 'lucide-react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Header from '../Header';
import LeftSide from '../LeftSide';
import Footer from '../Footer';
import { GroupsTab, type Group, type MenuItem } from './components/GroupsTab';
import { MenusTab } from './components/MenusTab';
import { UsersTab } from './components/UsersTab';
import { LineNotificationsTab } from './components/LineNotificationsTab';
import { API_BASE } from '../lib/apiConfig';
import { clearMenuAccessCache } from '../lib/menuAccess';

const API = `${API_BASE}/api/admin`;

type TabKey = 'groups' | 'menus' | 'users' | 'line_notifications';
interface UserRow { user_id: number; Name_Surname: string; username: string; email: string; position: string; Division_Province: string; user_status: number|null; group_name: string|null; avatar_data_url?: string | null; }

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'groups', label: 'กลุ่มผู้ใช้งาน', icon: <Settings size={16}/> },
  { key: 'menus',  label: 'รายการเมนู',     icon: <Menu size={16}/> },
  { key: 'users',  label: 'จัดการผู้ใช้',   icon: <Users size={16}/> },
  { key: 'line_notifications', label: 'แจ้งเตือน LINE', icon: <BellRing size={16}/> },
];

export default function UserSettings() {
  const [userData, setUserData]       = useState<any>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRefreshing, setIsRefreshing]   = useState(false);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [activeTab, setActiveTab]         = useState<TabKey>('groups');
  const [groups, setGroups] = useState<Group[]>([]);
  const [menus,  setMenus]  = useState<MenuItem[]>([]);
  const [users,  setUsers]  = useState<UserRow[]>([]);

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (!savedUser || savedUser === 'undefined') { window.location.href = '/'; return; }
    try { setUserData(JSON.parse(savedUser)); } catch { window.location.href = '/'; }
    const onResize = () => setIsSidebarOpen(window.innerWidth >= 1024);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const loadGroups = useCallback(async () => {
    const r = await fetch(`${API}/groups`);
    if (r.ok) setGroups(await r.json());
  }, []);

  const loadMenus = useCallback(async () => {
    const r = await fetch(`${API}/menus`);
    if (r.ok) setMenus(await r.json());
  }, []);

  const loadUsers = useCallback(async () => {
    const r = await fetch(`${API}/users`);
    if (r.ok) setUsers(await r.json());
  }, []);

  const initSetup = useCallback(async () => {
    try {
      await fetch(`${API}/setup-tables`, { method: 'POST' });
      await Promise.all([loadGroups(), loadMenus(), loadUsers()]);
    } finally {
      setIsPageLoading(false);
    }
  }, [loadGroups, loadMenus, loadUsers]);

  useEffect(() => { if (userData) initSetup(); }, [userData, initSetup]);

  const handleLogout = () => { localStorage.removeItem('user'); window.location.href = '/'; };
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    clearMenuAccessCache();
    Promise.all([loadGroups(), loadMenus(), loadUsers()]).then(() => {
      setIsRefreshing(false);
      toast.success('โหลดข้อมูลใหม่แล้ว');
    });
  }, [loadGroups, loadMenus, loadUsers]);

  // Memoize tab content เพื่อไม่ให้ re-render ทุก tab ทุกครั้ง
  const tabContent = useMemo(() => {
    switch (activeTab) {
      case 'groups': return <GroupsTab groups={groups} onRefresh={loadGroups}/>;
      case 'menus':  return <MenusTab  menus={menus}   onRefresh={loadMenus}/>;
      case 'users':  return <UsersTab  groups={groups} users={users} onRefresh={loadUsers}/>;
      case 'line_notifications': return <LineNotificationsTab userId={userData?.user_id}/>;
    }
  }, [activeTab, groups, menus, users, loadGroups, loadMenus, loadUsers, userData?.user_id]);

  if (isPageLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"/>
          <p className="text-slate-500 font-medium">กำลังโหลดระบบ...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#f8fafc] overflow-hidden">
      <ToastContainer position="top-right" autoClose={3000}/>
      <LeftSide userData={userData} isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} handleLogout={handleLogout}/>

      <main className="flex-1 flex flex-col h-full overflow-y-auto z-10 scroll-smooth">
        <Header setIsSidebarOpen={setIsSidebarOpen} handleRefresh={handleRefresh} isRefreshing={isRefreshing} handleLogout={handleLogout}/>

        <div className="px-4 py-6 sm:px-8 sm:py-10 max-w-6xl mx-auto w-full flex flex-col gap-6">

          {/* Breadcrumb */}
          <div>
            <div className="flex items-center gap-2 text-blue-600 text-sm font-semibold mb-1">
              <a href="/index" className="flex items-center gap-1 hover:underline"><ArrowLeft size={14}/> หน้าหลัก</a>
              <ChevronRight size={14} className="text-slate-400"/>
              <span className="text-slate-600">ตั้งค่าผู้ใช้งาน</span>
            </div>
            <h2 className="text-1xl font-black text-slate-800 flex items-center gap-2">
              <Settings size={20} className="text-blue-600"/> ตั้งค่าผู้ใช้งาน
            </h2>
            <p className="text-slate-500 text-sm mt-1">จัดการกลุ่ม สิทธิ์เมนู ผู้ใช้งาน และแจ้งเตือน LINE</p>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
            {TABS.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 whitespace-nowrap transition-all ${activeTab === tab.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div>
            {tabContent}
          </div>
        </div>

        <Footer/>
      </main>
    </div>
  );
}
