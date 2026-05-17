import React, { useState, useEffect, useMemo, useRef } from 'react';
import { LogOut } from 'lucide-react';
import { API_BASE } from './lib/apiConfig';
import {
  clearMenuAccessCache,
  fetchAllowedMenus,
  getMenuColor,
  getMenuHref,
  getMenuIcon,
  readCachedMenus,
  writeCachedMenus,
  type UserMenuItem,
} from './lib/menuAccess';

interface LeftSideProps {
  userData: any;
  isSidebarOpen: boolean;
  setIsSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleLogout: () => void;
}

const LeftSide: React.FC<LeftSideProps> = ({ userData, isSidebarOpen, setIsSidebarOpen, handleLogout }) => {
  const [menuItems, setMenuItems] = useState<UserMenuItem[] | undefined>(undefined);
  const [permLoaded, setPermLoaded] = useState(false);
  const [profileAvatar, setProfileAvatar] = useState<string | null>(userData?.avatar_data_url || null);

  // เก็บ path ไว้ใน ref ป้องกัน re-render
  const currentPath = useRef(window.location.pathname);

  useEffect(() => {
    if (!userData?.user_id) return;

    const cached = readCachedMenus(userData.user_id);
    if (cached !== undefined) {
      setMenuItems(cached);
      setPermLoaded(true);
    } else {
      setMenuItems(undefined);
      setPermLoaded(false);
    }

    let cancelled = false;
    fetchAllowedMenus(userData.user_id)
      .then(menus => {
        if (cancelled) return;
        setMenuItems(menus);
        setPermLoaded(true);
        writeCachedMenus(userData.user_id, menus);
      })
      .catch(() => {
        if (cancelled) return;
        setMenuItems(cached ?? []);
        setPermLoaded(true);
      });

    return () => { cancelled = true; };
  }, [userData]);

  useEffect(() => {
    if (!userData?.user_id) {
      setProfileAvatar(null);
      return;
    }

    setProfileAvatar(userData.avatar_data_url || null);
    let cancelled = false;

    fetch(`${API_BASE}/api/users/profile/${userData.user_id}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch profile avatar');
        return res.json();
      })
      .then((profile) => {
        if (cancelled) return;
        setProfileAvatar(profile.avatar_data_url || null);
      })
      .catch(() => {
        if (cancelled) return;
        setProfileAvatar(userData.avatar_data_url || null);
      });

    return () => { cancelled = true; };
  }, [userData?.user_id, userData?.avatar_data_url]);

  const visibleItems = useMemo(() => {
    return (menuItems ?? []).filter(item => item.menu_type === 'sidebar');
  }, [menuItems]);

  const itemsToRender = permLoaded ? visibleItems : [];

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
                <div className="relative w-16 h-16 overflow-hidden rounded-full flex items-center justify-center bg-[#006FEE] text-white font-bold text-xl shadow-xl border-2 border-white/80 transition-transform duration-300 group-hover:scale-105">
                  {profileAvatar ? (
                    <img
                      src={profileAvatar}
                      onError={() => setProfileAvatar(null)}
                      className="h-full w-full object-cover"
                      alt="รูปประจำตัว"
                    />
                  ) : (
                    'CAD'
                  )}
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
              {itemsToRender.map((item, index) => {
                const href = getMenuHref(item);
                const isActive = currentPath.current === href;
                const Icon = getMenuIcon(item.menu_icon);
                return (
                  <a
                    key={item.menu_id}
                    href={href}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 group ${isActive
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/25'
                      : 'hover:bg-black/5'
                      }`}
                  >
                    <div className={`w-[28px] h-[28px] rounded-[7px] flex items-center justify-center shadow-sm ${getMenuColor(index)} text-white shrink-0`}>
                      <Icon size={16} strokeWidth={2.5} />
                    </div>
                    <span className={`text-[14px] ${isActive ? 'font-semibold text-white' : 'text-[#1C1C1E]'} truncate`}>
                      {item.menu_name}
                    </span>
                  </a>
                );
              })}
            </nav>
          </div>

          {/* Bottom Navigation */}
          <div className="p-4">
            <button
              onClick={() => { clearMenuAccessCache(); handleLogout(); }}
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
