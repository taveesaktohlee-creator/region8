import { useState, useEffect } from 'react';
import { Construction } from 'lucide-react';
import Header from '../Header';
import LeftSide from '../LeftSide';
import Footer from '../Footer';

export default function TrainingHistory() {
  const [userData, setUserData] = useState<any>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

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

    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setIsSidebarOpen(false);
      } else {
        setIsSidebarOpen(true);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('user');
    window.location.href = '/';
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
    }, 1000);
  };

  return (
    <div className="flex h-screen bg-[#f8fafc] font-sans text-slate-800 overflow-hidden relative selection:bg-blue-500/30">
      {/* Decorative Background Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-5%] w-[40vw] h-[40vw] bg-blue-400/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[35vw] h-[35vw] bg-purple-400/10 rounded-full blur-[120px]" />
      </div>

      <LeftSide
        userData={userData}
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        handleLogout={handleLogout}
      />

      <main className="flex-1 flex flex-col h-full overflow-y-auto z-10 scroll-smooth transition-all duration-300">
        <Header
          setIsSidebarOpen={setIsSidebarOpen}
          handleRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          handleLogout={handleLogout}
        />

        <div className="px-8 py-10 flex-1 flex flex-col items-center justify-center max-w-[1400px] mx-auto w-full">
          <div className="text-center animate-in fade-in zoom-in duration-700">
            <div className="bg-white/70 backdrop-blur-xl p-12 rounded-[3rem] shadow-[inset_0_2px_15px_rgba(255,255,255,1),0_20px_40px_rgba(0,0,0,0.05)] border border-white/80 flex flex-col items-center gap-6 max-w-lg mx-auto">
              <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center text-blue-500 shadow-inner">
                <Construction size={48} strokeWidth={1.5} className="animate-pulse" />
              </div>
              <div>
                <h2 className="text-3xl font-extrabold text-slate-800 mb-3">ประวัติการอบรม</h2>
                <p className="text-slate-500 text-lg font-medium">อยู่ระหว่างการพัฒนา</p>
              </div>
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 w-1/3 animate-[loading_2s_ease-in-out_infinite]"></div>
              </div>
              <p className="text-sm text-slate-400">ขออภัยในความไม่สะดวก ระบบจะเปิดใช้งานเร็วๆ นี้</p>
            </div>
          </div>
        </div>

        <Footer />
      </main>

      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes loading {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      `}} />
    </div>
  );
}
