import React, { useState, useEffect } from 'react';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { API_BASE } from './apiConfig';

interface PermissionGuardProps {
  /** menu_key ที่ต้องตรวจสอบสิทธิ์ เช่น 'report_monitor', 'user_settings' */
  menuKey: string;
  children: React.ReactNode;
}

/**
 * PermissionGuard — ตรวจสอบสิทธิ์ก่อนแสดงหน้า
 * ถ้าไม่มีสิทธิ์เข้าถึง menu_key นั้น จะแสดงหน้า Access Denied
 */
export default function PermissionGuard({ menuKey, children }: PermissionGuardProps) {
  const [status, setStatus] = useState<'loading' | 'allowed' | 'denied'>('loading');

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (!savedUser || savedUser === 'undefined') {
      // ไม่ได้ login → redirect ไปหน้า login
      window.location.href = '/';
      return;
    }

    let userData: any;
    try { userData = JSON.parse(savedUser); } catch { window.location.href = '/'; return; }

    if (!userData?.user_id) { setStatus('allowed'); return; }

    fetch(`${API_BASE}/api/users/${userData.user_id}/menu-permissions`)
      .then(r => r.json())
      .then(data => {
        if (data.allowed === null || data.allowed === undefined) {
          // null = ไม่จำกัดสิทธิ์ แสดงทุกหน้า
          setStatus('allowed');
        } else if (Array.isArray(data.allowed) && data.allowed.includes(menuKey)) {
          setStatus('allowed');
        } else {
          setStatus('denied');
        }
      })
      .catch(() => {
        // Error fetching → ให้เข้าได้ (fail open)
        setStatus('allowed');
      });
  }, [menuKey]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"/>
          <p className="text-slate-500 font-medium">กำลังตรวจสอบสิทธิ์...</p>
        </div>
      </div>
    );
  }

  if (status === 'denied') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-4">
        <div className="bg-white/70 backdrop-blur-xl p-12 rounded-[3rem] shadow-[inset_0_2px_15px_rgba(255,255,255,1),0_20px_40px_rgba(0,0,0,0.05)] border border-white/80 flex flex-col items-center gap-6 max-w-lg mx-auto text-center" style={{ animation: 'fadeIn 300ms ease-out' }}>
          <div className="w-24 h-24 bg-red-50 rounded-full flex items-center justify-center text-red-500 shadow-inner">
            <ShieldAlert size={48} strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="text-2xl font-extrabold text-slate-800 mb-3">ไม่มีสิทธิ์เข้าถึง</h2>
            <p className="text-slate-500 text-base font-medium">
              คุณไม่มีสิทธิ์ในการเข้าถึงหน้านี้<br/>
              กรุณาติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์การเข้าถึง
            </p>
          </div>
          <a href="/index" className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-2xl shadow-lg shadow-blue-500/25 hover:-translate-y-0.5 active:scale-95 transition-all">
            <ArrowLeft size={16}/> กลับหน้าหลัก
          </a>
        </div>
        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
          }
        `}</style>
      </div>
    );
  }

  return <>{children}</>;
}
