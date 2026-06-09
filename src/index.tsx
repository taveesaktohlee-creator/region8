import { useState, useEffect } from 'react';
import { Lock } from 'lucide-react';

import Header from './Header';
import LeftSide from './LeftSide';
import Footer from './Footer';
import { closeSession, stopHeartbeat } from './lib/activityTracker';
import {
  fetchAllowedMenus,
  getContentMenuStyle,
  getMenuHref,
  getMenuIcon,
  readCachedMenus,
  writeCachedMenus,
  type UserMenuItem,
} from './lib/menuAccess';

export default function Index() {
  const [userData, setUserData] = useState<any>(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [menuItems, setMenuItems] = useState<UserMenuItem[] | undefined>(undefined);
  const [permLoaded, setPermLoaded] = useState(false);

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser && savedUser !== 'undefined') {
      try {
        setUserData(JSON.parse(savedUser));
      } catch (e) {
        console.error("Failed to parse user data from localStorage", e);
        localStorage.removeItem('user');
      }
    }

    // Responsive sidebar toggle
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setIsSidebarOpen(false);
      } else {
        setIsSidebarOpen(true);
      }
    };

    handleResize(); // Check initial size
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ดึงสิทธิ์เมนูของผู้ใช้
  useEffect(() => {
    if (!userData?.user_id) { setPermLoaded(true); return; }

    const cached = readCachedMenus(userData.user_id);
    if (cached !== undefined) {
      setMenuItems(cached);
      setPermLoaded(true);
    } else {
      setMenuItems(undefined);
      setPermLoaded(false);
    }

    fetchAllowedMenus(userData.user_id)
      .then(menus => {
        setMenuItems(menus);
        setPermLoaded(true);
        writeCachedMenus(userData.user_id, menus);
      })
      .catch(() => { setMenuItems(cached ?? []); setPermLoaded(true); });
  }, [userData]);

  const visibleCards = (menuItems ?? []).filter(menu => menu.menu_type === 'content' && menu.menu_key !== 'vba_reports');

  const handleLogout = async () => {
    stopHeartbeat();
    await closeSession();
    localStorage.removeItem('user');
    window.location.href = '/';
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    // จำลองการโหลดข้อมูลใหม่
    setTimeout(() => {
      setIsRefreshing(false);
    }, 1000);
  };

  return (
    <div className="flex h-screen bg-white font-sans text-slate-900 overflow-hidden relative selection:bg-blue-500/30">
      <LeftSide 
        userData={userData} 
        isSidebarOpen={isSidebarOpen} 
        setIsSidebarOpen={setIsSidebarOpen} 
        handleLogout={handleLogout} 
      />

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-y-auto z-10 scroll-smooth transition-all duration-300">
        <Header 
          setIsSidebarOpen={setIsSidebarOpen} 
          handleRefresh={handleRefresh} 
          isRefreshing={isRefreshing} 
          handleLogout={handleLogout} 
        />

        {/* Content Body */}
        <div className="px-8 py-12 flex flex-col gap-10 max-w-[1400px] mx-auto w-full">

          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">บริการของเรา</h2>
            <p className="text-slate-500 text-sm font-medium">ยินดีต้อนรับเข้าสู่ระบบสารสนเทศ สตท.8</p>
          </div>

          {/* Services Grid - Premium Squircle Design */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12 lg:gap-16 mt-2">
            {visibleCards.map((card, index) => {
              const Icon = getMenuIcon(card.menu_icon);
              const style = getContentMenuStyle(index);
              return (
                <a
                  key={card.menu_id}
                  href={getMenuHref(card)}
                  className="group flex flex-col items-center gap-6 transition-all duration-300"
                >
                  <div className="relative">
                    {/* Shadow Layer for depth */}
                    <div 
                      className="absolute inset-4 blur-2xl opacity-20 group-hover:opacity-40 transition-opacity duration-300" 
                      style={{ backgroundColor: style.iconShadow }}
                    ></div>
                    
                    {/* Squircle Icon Container */}
                    <div className={`relative z-10 w-24 h-24 sm:w-32 sm:h-32 lg:w-36 lg:h-36 bg-gradient-to-br ${style.iconBg} rounded-[2rem] lg:rounded-[2.5rem] flex items-center justify-center shadow-lg group-hover:scale-105 group-hover:-translate-y-2 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${style.hoverBg} overflow-hidden`}>
                      {/* Suble Reflection */}
                      <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/10 pointer-events-none"></div>
                      <Icon className="w-10 h-10 sm:w-14 sm:h-14 lg:w-16 lg:h-16 text-white drop-shadow-md" strokeWidth={2} />
                    </div>
                  </div>

                  <p className="text-center text-sm md:text-base font-bold text-slate-700 group-hover:text-slate-950 transition-colors max-w-[160px] leading-tight px-2">
                    {card.menu_name}
                  </p>
                </a>
              );
            })}

            {/* แสดงข้อความเมื่อไม่มีเมนูให้เข้าถึง */}
            {permLoaded && visibleCards.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center py-16 text-slate-400">
                <Lock size={48} className="mb-4 text-slate-300" />
                <p className="font-semibold text-lg text-slate-500">ไม่มีเมนูที่คุณสามารถเข้าถึงได้</p>
                <p className="text-sm mt-1">กรุณาติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์การเข้าถึง</p>
              </div>
            )}
          </div>

        </div>

        <Footer />
      </main>
    </div>
  );
}
