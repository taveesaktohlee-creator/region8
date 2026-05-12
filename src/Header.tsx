import React from 'react';
import { PanelLeft, RefreshCcw, Bell, LogOut } from 'lucide-react';

interface HeaderProps {
  setIsSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleRefresh: () => void;
  isRefreshing: boolean;
  handleLogout: () => void;
}

const Header: React.FC<HeaderProps> = ({ setIsSidebarOpen, handleRefresh, isRefreshing, handleLogout }) => {
  return (
    <header className="flex items-center justify-between px-8 py-5 sticky top-0 z-30 bg-white/40 backdrop-blur-xl border-b border-white/40 shadow-[0_4px_30px_rgba(0,0,0,0.01)] transition-all">
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
        <button onClick={handleRefresh} className="p-2.5 bg-white/70 backdrop-blur-md text-slate-600 rounded-full shadow-sm border border-white/60 hover:bg-white hover:shadow-md transition-all group">
          <RefreshCcw size={18} className={`${isRefreshing ? 'animate-spin text-blue-600' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
        </button>
        <button className="p-2.5 bg-white/70 backdrop-blur-md text-slate-600 rounded-full shadow-sm border border-white/60 hover:bg-white hover:shadow-md transition-all relative">
          <Bell size={18} />
          <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
        </button>
        <button onClick={handleLogout} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white font-semibold rounded-full px-5 py-2.5 shadow-lg shadow-slate-900/20 transition-all cursor-pointer active:scale-95 border border-slate-700 group">
          <LogOut size={16} className="group-hover:-translate-x-1 transition-transform" />
          <span></span>
        </button>
        <div className="w-px h-6 bg-slate-300/50 mx-1"></div>
      </div>
    </header>
  );
};

export default Header;
