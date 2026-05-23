import React, { useMemo, useState } from 'react';
import { Button } from '@heroui/react';
import { ArrowLeft, Eye, EyeOff, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { API_BASE } from '../lib/apiConfig';

export default function ResetPassword() {
  const token = useMemo(() => new URLSearchParams(window.location.search).get('token') || '', []);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const readApiResponse = async (res: Response) => {
    const text = await res.text();
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return {
        error: res.status === 404
          ? 'ไม่พบ API นี้บนเซิร์ฟเวอร์ กรุณาอัปเดต backend เป็นเวอร์ชันล่าสุด'
          : text || 'เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง'
      };
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) {
      toast.error('ไม่พบโทเคนสำหรับรีเซ็ตรหัสผ่าน');
      return;
    }
    if (!newPassword || !confirmPassword) {
      toast.warning('กรุณากรอกรหัสผ่านใหม่ให้ครบถ้วน');
      return;
    }
    if (newPassword.length < 6) {
      toast.info('รหัสผ่านใหม่ควรมีความยาวอย่างน้อย 6 ตัวอักษร');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('รหัสผ่านใหม่และยืนยันรหัสผ่านใหม่ไม่ตรงกัน');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/users/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await readApiResponse(res);

      if (!res.ok) {
        toast.error(data.error || 'ไม่สามารถตั้งรหัสผ่านใหม่ได้');
        return;
      }

      setIsSuccess(true);
      toast.success('ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว');
      setTimeout(() => {
        window.location.href = '/';
      }, 1800);
    } catch (error) {
      toast.error('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-sky-50 p-4">
      <ToastContainer position="top-right" autoClose={3000} />

      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-5xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-[2rem] bg-white shadow-2xl md:grid-cols-[0.85fr_1.15fr]">
          <div className="relative hidden min-h-[560px] overflow-hidden text-white md:block">
            <img
              src="/banner.jpg"
              alt="Banner"
              className="absolute inset-0 h-full w-full object-cover object-center"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.parentElement!.style.background = 'linear-gradient(135deg, #38bdf8 0%, #2563eb 100%)';
              }}
            />
            <div className="absolute inset-0 bg-black/15"></div>
            <div className="relative z-10 flex h-full flex-col items-center justify-center p-10 text-center">
              <div className="rounded-2xl border border-white/30 bg-white/10 px-6 py-4 shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-md">
                <ShieldCheck size={34} className="mx-auto mb-3" />
                <h1 className="text-3xl font-bold">รีเซ็ตรหัสผ่าน</h1>
              </div>
            </div>
          </div>

          <main className="flex min-h-[560px] flex-col justify-center p-8 sm:p-12">
            <a href="/" className="mb-8 inline-flex w-fit items-center gap-2 text-sm font-semibold text-sky-600 transition hover:text-sky-700">
              <ArrowLeft size={16} />
              กลับหน้าเข้าสู่ระบบ
            </a>

            <div className="mb-8">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-600">
                <KeyRound size={24} />
              </div>
              <h2 className="text-2xl font-extrabold text-slate-800">ตั้งรหัสผ่านใหม่</h2>
              <p className="mt-2 text-sm font-medium text-slate-500">
                กรุณากำหนดรหัสผ่านใหม่อย่างน้อย 6 ตัวอักษร
              </p>
            </div>

            {!token && (
              <div className="mb-6 rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-600">
                ลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้อง กรุณาขอลิงก์ใหม่อีกครั้ง
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6" noValidate>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-gray-700">รหัสผ่านใหม่</label>
                <div className="relative">
                  <Lock size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="กรอกรหัสผ่านใหม่"
                    className="w-full rounded-xl bg-sky-50/60 py-3 pl-10 pr-12 text-base shadow-sm outline-none transition-all hover:bg-sky-100/60 focus:bg-white focus:ring-2 focus:ring-sky-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((value) => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition hover:text-sky-600"
                    aria-label={showNewPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                  >
                    {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-gray-700">ยืนยันรหัสผ่านใหม่</label>
                <div className="relative">
                  <Lock size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="กรอกรหัสผ่านใหม่อีกครั้ง"
                    className="w-full rounded-xl bg-sky-50/60 py-3 pl-10 pr-12 text-base shadow-sm outline-none transition-all hover:bg-sky-100/60 focus:bg-white focus:ring-2 focus:ring-sky-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((value) => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition hover:text-sky-600"
                    aria-label={showConfirmPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                isDisabled={isLoading || isSuccess || !token}
                className="w-full rounded-xl bg-gradient-to-r from-sky-400 to-blue-500 py-6 text-base font-semibold text-white shadow-lg shadow-sky-500/30 transition-all hover:from-sky-500 hover:to-blue-600 disabled:opacity-50"
              >
                {isSuccess ? 'กำลังกลับหน้าเข้าสู่ระบบ...' : isLoading ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่านใหม่'}
              </Button>
            </form>
          </main>
        </div>
      </div>
    </div>
  );
}
