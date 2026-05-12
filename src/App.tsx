import React, { useState } from 'react';
import { Button, Link } from '@heroui/react';
import { User, Lock, ArrowRight, Landmark } from 'lucide-react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { API_BASE } from './lib/apiConfig';
import { startHeartbeat } from './lib/activityTracker';

export default function App() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoginSuccess, setIsLoginSuccess] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username) {
      toast.error('กรุณากรอกชื่อผู้ใช้งาน');
      return;
    }
    if (!password) {
      toast.error('กรุณากรอกรหัสผ่าน');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'เข้าสู่ระบบไม่สำเร็จ');
      } else {
        localStorage.setItem('user', JSON.stringify(data.user));
        // บันทึก session_id ที่ server สร้างให้
        if (data.session_id) {
          localStorage.setItem('usage_session_id', String(data.session_id));
        }
        startHeartbeat();
        setIsLoginSuccess(true);
        setTimeout(() => {
          window.location.href = '/index';
        }, 1500);
      }
    } catch (error) {
      toast.error('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-sky-50 p-4">
      <ToastContainer position="top-right" autoClose={3000} />

      {/* Login Success Transition Screen */}
      {isLoginSuccess && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/80 backdrop-blur-xl animate-in fade-in duration-500">
          <div className="relative flex flex-col items-center gap-6">
            <div className="relative w-24 h-24">
              <div className="absolute inset-0 border-4 border-sky-100 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-sky-500 rounded-full border-t-transparent animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <Landmark size={32} className="text-sky-500" />
              </div>
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight">กำลังเข้าสู่ระบบ</h2>
              <p className="text-slate-500 mt-2 font-medium">กรุณารอสักครู่ ระบบกำลังจัดเตรียมข้อมูลของคุณ...</p>
            </div>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="max-w-4xl w-full flex flex-col md:flex-row bg-white rounded-[2rem] shadow-2xl overflow-hidden min-h-[550px]">

        {/* Left Side (Branding Panel) */}
        <div className="md:w-5/12 bg-gradient-to-br from-sky-400 to-blue-500 p-8 md:p-10 flex flex-col justify-between relative overflow-hidden text-white">
          {/* Abstract Decorations */}
          <div className="absolute top-[-15%] right-[-15%] w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-[-10%] left-[-10%] w-48 h-48 bg-white/10 rounded-full blur-2xl"></div>
          <div className="absolute top-1/2 left-1/4 w-32 h-32 bg-sky-300/20 rounded-full blur-xl"></div>

          <div className="relative z-10 flex flex-col items-center md:items-start text-center md:text-left mt-2 md:mt-8">
            <div className="p-4 bg-white/20 backdrop-blur-md rounded-2xl inline-flex w-fit mb-6 shadow-lg border border-white/20">
              <Landmark size={48} className="text-white" />
            </div>
            <h1 className="text-3xl font-bold mb-3 tracking-wide drop-shadow-md">
              ระบบสารสนเทศ
            </h1>
            <p className="text-white/90 leading-relaxed text-lg font-medium drop-shadow-sm">
              สำนักงานตรวจบัญชีสหกรณ์ที่ 8
            </p>
          </div>

        </div>

        {/* Right Side (Login Form) */}
        <div className="md:w-7/12 p-8 md:p-14 md:pb-8 flex flex-col justify-between bg-white relative">
          <div className="max-w-md w-full mx-auto my-auto">

            <div className="mb-10">
              <h2 className="text-2xl font-bold text-gray-800 mb-2">
                สำนักงานตรวจบัญชีสหกรณ์ที่ 8
              </h2>
              <p className="text-gray-500 font-medium">
                กรุณาล็อกอินเข้าสู่ระบบ
              </p>
            </div>

            <form onSubmit={handleLogin} className="flex flex-col gap-6" noValidate>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-gray-700">ชื่อผู้ใช้งาน</label>
                <div className="relative">
                  <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="admin"
                    className="w-full pl-10 pr-4 py-3 bg-sky-50/50 hover:bg-sky-100/50 focus:bg-white focus:ring-2 focus:ring-sky-400 rounded-xl outline-none shadow-sm transition-all text-base"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-gray-700">รหัสผ่าน</label>
                <div className="relative">
                  <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-3 bg-sky-50/50 hover:bg-sky-100/50 focus:bg-white focus:ring-2 focus:ring-sky-400 rounded-xl outline-none shadow-sm transition-all text-base"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between mt-1">

                <Link href="#" className="text-sm font-semibold text-sky-500 hover:text-sky-600 transition-colors">
                  ลืมรหัสผ่าน?
                </Link>
              </div>

              <div className="flex flex-col gap-3 mt-4">
                <Button
                  type="submit"
                  isDisabled={isLoading}
                  className="w-full bg-gradient-to-r from-sky-400 to-blue-500 hover:from-sky-500 hover:to-blue-600 text-white font-semibold py-6 rounded-xl shadow-lg shadow-sky-500/30 transition-all flex items-center justify-center gap-2 text-base disabled:opacity-50"
                >
                  เข้าสู่ระบบ <ArrowRight size={18} />
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onPress={() => window.location.href = '/register'}
                  className="w-full border-2 border-sky-100 text-sky-600 hover:bg-sky-50 hover:border-sky-200 font-semibold py-6 rounded-xl transition-all text-base"
                >
                  ลงทะเบียนใช้งาน
                </Button>
              </div>
            </form>

          </div>

          <div className="mt-8 flex flex-col md:flex-row items-center justify-center md:justify-start gap-4 text-sm font-medium text-gray-400 w-full">
            <div className="flex items-center gap-3">
              <span>เวอร์ชัน 1.0</span>
              <div className="flex gap-1.5">
                <span className="w-2 h-2 bg-sky-400 rounded-full shadow-sm"></span>
                <span className="w-2 h-2 bg-sky-200 rounded-full"></span>
                <span className="w-2 h-2 bg-sky-200 rounded-full"></span>
              </div>
            </div>
            <span className="text-xs text-gray-400 md:ml-auto">copyright@region8 {new Date().getFullYear() + 543}</span>
          </div>
        </div>

      </div>
    </div>
  );
}
