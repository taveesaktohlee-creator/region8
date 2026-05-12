import React, { useState, useEffect } from 'react';
import { Lock, KeyRound, ShieldCheck, ChevronRight, ArrowLeft, Save, Eye, EyeOff } from 'lucide-react';
import Header from '../Header';
import LeftSide from '../LeftSide';
import Footer from '../Footer';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { API_BASE } from '../lib/apiConfig';

export default function ChangePassword() {
  const [userData, setUserData] = useState<any>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [formData, setFormData] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser && savedUser !== 'undefined') {
      try {
        setUserData(JSON.parse(savedUser));
      } catch (e) {
        window.location.href = '/';
      }
    } else {
      window.location.href = '/';
    }

    const handleResize = () => {
      setIsSidebarOpen(window.innerWidth >= 1024);
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
      toast.success('อัปเดตสถานะการเชื่อมต่อแล้ว');
    }, 800);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.oldPassword || !formData.newPassword || !formData.confirmPassword) {
      toast.warning('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }

    if (formData.newPassword !== formData.confirmPassword) {
      toast.error('รหัสผ่านใหม่และยืนยันรหัสผ่านใหม่ไม่ตรงกัน');
      return;
    }

    if (formData.newPassword.length < 6) {
      toast.info('รหัสผ่านใหม่ควรมีความยาวอย่างน้อย 6 ตัวอักษร');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/users/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userData.user_id,
          oldPassword: formData.oldPassword,
          newPassword: formData.newPassword
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน');
      } else {
        toast.success('เปลี่ยนรหัสผ่านสำเร็จแล้ว!');
        setFormData({
          oldPassword: '',
          newPassword: '',
          confirmPassword: ''
        });
      }
    } catch (err) {
      console.error(err);
      toast.error('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-[#f8fafc] overflow-hidden">
      <ToastContainer position="top-right" autoClose={3000} />

      <LeftSide userData={userData} isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} handleLogout={handleLogout} />

      <main className="flex-1 flex flex-col h-full overflow-y-auto z-10 scroll-smooth">
        <Header setIsSidebarOpen={setIsSidebarOpen} handleRefresh={handleRefresh} isRefreshing={isRefreshing} handleLogout={handleLogout} />

        <div className="px-4 py-6 sm:px-8 sm:py-10 max-w-2xl mx-auto w-full flex flex-col gap-8">

          {/* Breadcrumb + Title */}
          <div className="animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex items-center gap-2 text-blue-600 text-sm font-semibold mb-1">
              <a href="/index" className="flex items-center gap-1 hover:underline transition-all active:scale-95"><ArrowLeft size={14} /> หน้าหลัก</a>
              <ChevronRight size={14} className="text-slate-400" />
              <span className="text-slate-600">เปลี่ยนรหัสผ่าน</span>
            </div>
            <h2 className="text-1xl font-black text-slate-800 tracking-tight">เปลี่ยนรหัสผ่าน</h2>
            <p className="text-slate-500 text-sm mt-1">เพื่อความปลอดภัย กรุณาใช้รหัสผ่านที่คาดเดาได้ยาก</p>
          </div>

          {/* Form Card */}
          <div className="bg-white/80 backdrop-blur-xl rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.05)] border border-white p-8 sm:p-10 animate-in zoom-in-95 duration-500">
            <form onSubmit={handleSubmit} className="space-y-6">

              <div className="space-y-4">
                <div className="group">
                  <label className="text-sm font-bold text-slate-700 ml-1 mb-2 block transition-colors group-focus-within:text-blue-600">
                    รหัสผ่านเดิม
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-500 transition-colors">
                      <Lock size={18} />
                    </div>
                    <input
                      type={showOldPassword ? "text" : "password"}
                      value={formData.oldPassword}
                      onChange={(e) => setFormData({ ...formData, oldPassword: e.target.value })}
                      className="block w-full pl-11 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400"
                      placeholder="กรอกรหัสผ่านเดิม"
                    />
                    <button
                      type="button"
                      onClick={() => setShowOldPassword(!showOldPassword)}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-blue-600 transition-colors"
                    >
                      {showOldPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div className="h-px bg-slate-100 my-2" />

                <div className="group">
                  <label className="text-sm font-bold text-slate-700 ml-1 mb-2 block transition-colors group-focus-within:text-blue-600">
                    รหัสผ่านใหม่
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-500 transition-colors">
                      <KeyRound size={18} />
                    </div>
                    <input
                      type={showNewPassword ? "text" : "password"}
                      value={formData.newPassword}
                      onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
                      className="block w-full pl-11 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400"
                      placeholder="กรอกรหัสผ่านใหม่"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-blue-600 transition-colors"
                    >
                      {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div className="group">
                  <label className="text-sm font-bold text-slate-700 ml-1 mb-2 block transition-colors group-focus-within:text-blue-600">
                    ยืนยันรหัสผ่านใหม่
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-500 transition-colors">
                      <ShieldCheck size={18} />
                    </div>
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      value={formData.confirmPassword}
                      onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                      className="block w-full pl-11 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400"
                      placeholder="กรอกรหัสผ่านใหม่อีกครั้ง"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-blue-600 transition-colors"
                    >
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex flex-col sm:flex-row gap-4">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-500/30 hover:shadow-blue-500/40 hover:-translate-y-1 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:pointer-events-none"
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Save size={18} />
                  )}
                  <span>บันทึกรหัสผ่านใหม่</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.location.href = '/index'}
                  className="px-8 py-4 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition-all active:scale-95"
                >
                  ยกเลิก
                </button>
              </div>
            </form>
          </div>

          {/* Security Tips */}
          <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-6 animate-in slide-in-from-bottom-4 duration-700">
            <h4 className="text-sm font-bold text-blue-800 mb-3 flex items-center gap-2">
              <ShieldCheck size={16} /> ข้อแนะนำในการตั้งรหัสผ่าน
            </h4>
            <ul className="text-xs text-blue-700 space-y-2 opacity-80">
              <li>• ควรมีความยาวอย่างน้อย 8 ตัวอักษร</li>
              <li>• ควรประกอบด้วยตัวอักษรพิมพ์ใหญ่ พิมพ์เล็ก และตัวเลข</li>
              <li>• หลีกเลี่ยงการใช้ข้อมูลส่วนตัว เช่น วันเกิด หรือเบอร์โทรศัพท์</li>
              <li>• ไม่ควรใช้รหัสผ่านซ้ำกับระบบอื่นๆ</li>
            </ul>
          </div>
        </div>

        <Footer />
      </main>
    </div>
  );
}
