import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Home, FileText, ListTodo, Edit, LogOut, Settings } from 'lucide-react';
import { API_BASE } from './lib/apiConfig';

interface LeftSideProps {
  userData: any;
  isSidebarOpen: boolean;
  setIsSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleLogout: () => void;
}

// เมนูทั้งหมดพร้อม menu_key สำหรับเช็คสิทธิ์
const ALL_ITEMS = [
  { key: 'home', name: 'หน้าหลัก', href: '/index', icon: Home, color: 'bg-[#007AFF]' },
  { key: 'profile', name: 'ข้อมูลส่วนตัว', href: '/profile', icon: FileText, color: 'bg-[#5856D6]' },
  { key: 'training', name: 'ประวัติการอบรม', href: '/training-history', icon: ListTodo, color: 'bg-[#FF9500]' },
  { key: 'change_password', name: 'เปลี่ยนรหัสผ่าน', href: '/change-password', icon: Edit, color: 'bg-[#FF3B30]' },
  { key: 'user_settings', name: 'ตั้งค่าผู้ใช้งาน', href: '/user-settings', icon: Settings, color: 'bg-[#8E8E93]' },
];

// Key สำหรับ cache สิทธิ์ใน sessionStorage
const PERM_CACHE_KEY = 'menu_allowed_keys';

/**
 * อ่านสิทธิ์จาก sessionStorage ทันที (synchronous)
 * คืน string[] | null | undefined
 *   - string[]  = มีสิทธิ์เฉพาะ key เหล่านี้
 *   - null      = ไม่จำกัดสิทธิ์ (แสดงทุกเมนู)
 *   - undefined = ยังไม่เคย cache (ครั้งแรกหลัง login)
 */
function readCachedPerms(): string[] | null | undefined {
  try {
    const raw = sessionStorage.getItem(PERM_CACHE_KEY);
    if (raw === null) return undefined; // ยังไม่เคย cache
    const parsed = JSON.parse(raw);
    return parsed; // string[] | null
  } catch {
    return undefined;
  }
}

function writeCachedPerms(allowed: string[] | null) {
  try {
    sessionStorage.setItem(PERM_CACHE_KEY, JSON.stringify(allowed));
  } catch { /* ignore */ }
}

const LeftSide: React.FC<LeftSideProps> = ({ userData, isSidebarOpen, setIsSidebarOpen, handleLogout }) => {
  // อ่าน cache ทันที (synchronous) เพื่อไม่ให้กระพริบ
  const cached = useRef(readCachedPerms());

  // ถ้ามี cache → ใช้เลย + ถือว่า loaded แล้ว
  // ถ้าไม่มี cache → ค่าเริ่มต้นเป็น null (แสดงทุกเมนู) แต่ยังรอ fetch
  const [allowedKeys, setAllowedKeys] = useState<string[] | null>(
    cached.current !== undefined ? cached.current : null
  );
  const [permLoaded, setPermLoaded] = useState(cached.current !== undefined);

  // เก็บ path ไว้ใน ref ป้องกัน re-render
  const currentPath = useRef(window.location.pathname);

  useEffect(() => {
    if (!userData?.user_id) return;

    let cancelled = false;
    fetch(`${API_BASE}/api/users/${userData.user_id}/menu-permissions`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        const allowed = data.allowed ?? null;
        setAllowedKeys(allowed);
        setPermLoaded(true);
        // เขียน cache เพื่อใช้ในหน้าถัดไป
        writeCachedPerms(allowed);
      })
      .catch(() => {
        if (cancelled) return;
        setAllowedKeys(null);
        setPermLoaded(true);
      });

    return () => { cancelled = true; };
  }, [userData]);

  // filter เมนูตามสิทธิ์
  const visibleItems = useMemo(() => {
    if (allowedKeys === null) return ALL_ITEMS;
    return ALL_ITEMS.filter(item => allowedKeys.includes(item.key));
  }, [allowedKeys]);

  // ใช้ visibleItems เสมอ (เพราะถ้ามี cache จะถูกต้องตั้งแต่แรก)
  // ถ้ายังไม่เคย cache (ครั้งแรกหลัง login) → permLoaded=false → แสดง ALL_ITEMS ชั่วคราว
  const itemsToRender = permLoaded ? visibleItems : visibleItems;

  return (
    <>
      {/* Sidebar Overlay for Mobile */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 lg:hidden block transition-opacity duration-300" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`bg-[#F6F6F6]/90 backdrop-blur-3xl border-r border-black/5 flex-shrink-0 h-full z-40 transition-all duration-300 fixed lg:relative ${isSidebarOpen ? 'translate-x-0 w-[280px]' : '-translate-x-full w-[280px] lg:w-0 lg:border-r-0 lg:opacity-0 overflow-hidden'}`}>
        <div className="w-[280px] h-full flex flex-col justify-between overflow-y-auto">
          <div>
            {/* User Profile Section */}
            <div className="flex flex-col items-center text-center gap-4 mb-10 px-2 relative pt-6">
              <div className="relative group cursor-pointer">
                <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full blur opacity-25 group-hover:opacity-50 transition duration-500"></div>
                <div className="relative w-16 h-16 rounded-full flex items-center justify-center bg-[#006FEE] text-white font-bold text-xl shadow-xl border-2 border-white/80 transition-transform duration-300 group-hover:scale-105">
                  CAD
                </div>
              </div>
              <div className="w-full px-4">
                <h3 className="font-bold text-base tracking-tight text-slate-900 break-words whitespace-normal">
                  {userData?.Name_Surname || 'ชื่อ-นามสกุล'}
                </h3>
                <p className="text-sm text-slate-500 font-medium break-words whitespace-normal mt-1">
                  {userData?.position || 'ตำแหน่ง'}
                </p>
                <div className="mt-2 inline-flex items-center px-2.5 py-1 rounded-full bg-white border border-slate-200/50 shadow-sm">
                  <span className="text-[11px] text-slate-600 font-semibold break-words whitespace-normal">
                    {userData?.Division_Province || 'Division_Province'}
                  </span>
                </div>
              </div>
            </div>

            {/* Navigation */}
            <nav className="px-4 space-y-0.5">
              {itemsToRender.map((item) => {
                const isActive = currentPath.current === item.href;
                const Icon = item.icon;
                return (
                  <a
                    key={item.key}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 group ${isActive
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/25'
                      : 'hover:bg-black/5'
                      }`}
                  >
                    <div className={`w-[28px] h-[28px] rounded-[7px] flex items-center justify-center shadow-sm ${item.color} text-white shrink-0`}>
                      <Icon size={16} strokeWidth={2.5} />
                    </div>
                    <span className={`text-[14px] ${isActive ? 'font-semibold text-white' : 'text-[#1C1C1E]'} truncate`}>
                      {item.name}
                    </span>
                  </a>
                );
              })}
            </nav>
          </div>

          {/* Bottom Navigation */}
          <div className="p-4">
            <button
              onClick={() => { sessionStorage.removeItem(PERM_CACHE_KEY); handleLogout(); }}
              className="w-full flex items-center gap-3 px-3 py-2 text-[#FF3B30] hover:bg-red-50 rounded-lg font-medium transition-all group"
            >
              <div className="w-[28px] h-[28px] rounded-[7px] flex items-center justify-center bg-red-500 text-white shrink-0 shadow-sm">
                <LogOut size={16} strokeWidth={2.5} />
              </div>
              <span className="text-[14px]">ออกจากระบบ</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
export default LeftSide;
