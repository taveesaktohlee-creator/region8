import { useState, useEffect } from 'react';
import {
  Monitor,
  BookOpen,
  Users,
  ShieldCheck,
  Lock
} from 'lucide-react';

import Header from './Header';
import LeftSide from './LeftSide';
import Footer from './Footer';
import { API_BASE } from './lib/apiConfig';
import { closeSession, stopHeartbeat } from './lib/activityTracker';

// การ์ดเมนูหน้า Index พร้อม menu_key สำหรับเช็คสิทธิ์
const INDEX_CARDS = [
  {
    key: 'report_monitor',
    href: '/program-monitoring',
    label: 'รายงานการกำกับติดตามฯ',
    icon: Monitor,
    color: 'blue',
    iconBg: 'from-blue-500 to-blue-600',
    iconShadow: 'rgba(37,99,235,0.4)',
    hoverBg: 'group-hover:from-blue-600 group-hover:to-blue-700',
  },
  {
    key: 'report_course',
    href: '/training-courses',
    label: 'หลักสูตรการอบรม',
    icon: BookOpen,
    color: 'emerald',
    iconBg: 'from-emerald-500 to-emerald-600',
    iconShadow: 'rgba(5,150,105,0.4)',
    hoverBg: 'group-hover:from-emerald-600 group-hover:to-emerald-700',
  },
  {
    key: 'report_usage',
    href: '/system-usage-report',
    label: 'รายงานการใช้งานระบบ',
    icon: Users,
    color: 'orange',
    iconBg: 'from-orange-500 to-orange-600',
    iconShadow: 'rgba(234,88,12,0.4)',
    hoverBg: 'group-hover:from-orange-600 group-hover:to-orange-700',
  },
  {
    key: 'report_security',
    href: '/office-security-report',
    label: 'รายงานความปลอดภัย',
    icon: ShieldCheck,
    color: 'purple',
    iconBg: 'from-purple-500 to-purple-600',
    iconShadow: 'rgba(147,51,234,0.4)',
    hoverBg: 'group-hover:from-purple-600 group-hover:to-purple-700',
  },
];

export default function Index() {
  const [userData, setUserData] = useState<any>(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [allowedKeys, setAllowedKeys] = useState<string[] | null>(null);
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
    fetch(`${API_BASE}/api/users/${userData.user_id}/menu-permissions`)
      .then(r => r.json())
      .then(data => {
        setAllowedKeys(data.allowed ?? null);
        setPermLoaded(true);
      })
      .catch(() => { setAllowedKeys(null); setPermLoaded(true); });
  }, [userData]);

  // filter cards ตามสิทธิ์ (null = แสดงทุกรายการ)
  const visibleCards = allowedKeys === null
    ? INDEX_CARDS
    : INDEX_CARDS.filter(card => allowedKeys.includes(card.key));

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
            {visibleCards.map((card) => {
              const Icon = card.icon;
              return (
                <a 
                  key={card.key} 
                  href={card.href} 
                  className="group flex flex-col items-center gap-6 transition-all duration-300"
                >
                  <div className="relative">
                    {/* Shadow Layer for depth */}
                    <div 
                      className="absolute inset-4 blur-2xl opacity-20 group-hover:opacity-40 transition-opacity duration-300" 
                      style={{ backgroundColor: card.iconShadow.split(',').slice(0,3).join(',') + ')' }}
                    ></div>
                    
                    {/* Squircle Icon Container */}
                    <div className={`relative z-10 w-24 h-24 sm:w-32 sm:h-32 lg:w-36 lg:h-36 bg-gradient-to-br ${card.iconBg} rounded-[2rem] lg:rounded-[2.5rem] flex items-center justify-center shadow-lg group-hover:scale-105 group-hover:-translate-y-2 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${card.hoverBg} overflow-hidden`}>
                      {/* Suble Reflection */}
                      <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 to-white/10 pointer-events-none"></div>
                      <Icon className="w-10 h-10 sm:w-14 sm:h-14 lg:w-16 lg:h-16 text-white drop-shadow-md" strokeWidth={2} />
                    </div>
                  </div>

                  <p className="text-center text-sm md:text-base font-bold text-slate-700 group-hover:text-slate-950 transition-colors max-w-[160px] leading-tight px-2">
                    {card.label}
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
