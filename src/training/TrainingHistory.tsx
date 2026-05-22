import { useCallback, useEffect, useMemo, useState } from 'react';
import { Award, BookOpen, Calendar, CheckCircle2, Clock, Search, Star, XCircle } from 'lucide-react';
import Header from '../Header';
import LeftSide from '../LeftSide';
import Footer from '../Footer';
import { API_BASE } from '../lib/apiConfig';
import { getTrainingImageUrl } from './driveMedia';

type HistoryItem = {
  enrollment_id: number;
  course_id: number;
  title: string;
  category: string;
  course_type: 'online' | 'zoom' | 'onsite';
  thumbnail_url?: string;
  instructor?: string;
  status: 'registered' | 'in_progress' | 'completed';
  pre_score?: number | null;
  post_score?: number | null;
  pass_score?: number | null;
  attended_seconds: number;
  evaluated: number;
  attendance_confirmed: number;
  certificate_code?: string;
  registered_at: string;
  completed_at?: string | null;
};

function formatSeconds(seconds?: number) {
  const value = Math.max(0, Number(seconds || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  return `${hours} ชม. ${minutes} นาที`;
}

function statusMeta(status: HistoryItem['status']) {
  if (status === 'completed') return { label: 'สำเร็จการอบรม', icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
  if (status === 'in_progress') return { label: 'กำลังอบรม', icon: Clock, color: 'bg-blue-50 text-blue-700 border-blue-100' };
  return { label: 'ลงทะเบียนแล้ว', icon: Calendar, color: 'bg-slate-50 text-slate-600 border-slate-100' };
}

function passResult(postScore?: number | null, passScore?: number | null) {
  if (postScore === null || postScore === undefined) return '-';
  return Number(postScore) >= Number(passScore || 70) ? 'ผ่าน' : 'ไม่ผ่าน';
}

export default function TrainingHistory() {
  const [userData, setUserData] = useState<any>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const loadHistory = useCallback(async (userId?: number) => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/training/users/${userId}/history`);
      if (!res.ok) throw new Error('Cannot load training history');
      setItems(await res.json());
    } catch (error) {
      console.error(error);
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    let parsedUser: any = null;
    if (savedUser && savedUser !== 'undefined') {
      try {
        parsedUser = JSON.parse(savedUser);
        setUserData(parsedUser);
      } catch {
        localStorage.removeItem('user');
      }
    }

    const handleResize = () => setIsSidebarOpen(window.innerWidth >= 1024);
    handleResize();
    window.addEventListener('resize', handleResize);
    void loadHistory(parsedUser?.user_id);
    return () => window.removeEventListener('resize', handleResize);
  }, [loadHistory]);

  const filteredItems = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => `${item.title} ${item.category} ${item.instructor}`.toLowerCase().includes(needle));
  }, [items, search]);

  const handleLogout = () => {
    localStorage.removeItem('user');
    window.location.href = '/';
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadHistory(userData?.user_id).finally(() => setIsRefreshing(false));
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8fafc] text-slate-900">
      <LeftSide userData={userData} isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} handleLogout={handleLogout} />

      <main className="z-10 flex h-full flex-1 flex-col overflow-y-auto">
        <Header setIsSidebarOpen={setIsSidebarOpen} handleRefresh={handleRefresh} isRefreshing={isRefreshing} handleLogout={handleLogout} />

        <div className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                <BookOpen size={14} /> ประวัติการอบรม
              </p>
              <h1 className="text-2xl font-black text-slate-900 sm:text-3xl">หลักสูตรที่ลงทะเบียน</h1>
              <p className="mt-2 text-sm font-medium text-slate-500">ติดตามคะแนน เวลาเข้าอบรม และใบรับรองของคุณ</p>
            </div>
            <div className="flex min-w-full items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm lg:min-w-[380px]">
              <Search size={19} className="text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="ค้นหาหลักสูตร..."
                className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400"
              />
            </div>
          </div>

          <div className="grid gap-4">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-44 animate-pulse rounded-3xl bg-white" />)
            ) : filteredItems.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center">
                <BookOpen className="mx-auto mb-3 text-slate-300" size={44} />
                <p className="font-bold text-slate-600">ยังไม่มีประวัติการลงทะเบียนอบรม</p>
                <a href="/training-courses" className="mt-4 inline-flex rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white">เลือกหลักสูตรอบรม</a>
              </div>
            ) : filteredItems.map((item) => {
              const meta = statusMeta(item.status);
              const StatusIcon = meta.icon;
              return (
                <a key={item.enrollment_id} href={`/training-courses/${item.course_id}`} className="grid gap-4 rounded-3xl border border-slate-100 bg-white p-4 shadow-[0_16px_45px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_60px_rgba(37,99,235,0.14)] md:grid-cols-[180px_1fr]">
                  <div className="aspect-video overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 md:aspect-auto md:h-full">
                    {item.thumbnail_url ? (
                      <img src={getTrainingImageUrl(item.thumbnail_url)} alt={item.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-white"><BookOpen size={40} /></div>
                    )}
                  </div>
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="mb-2 flex flex-wrap gap-2">
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{item.category || 'หลักสูตร'}</span>
                          <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-black ${meta.color}`}>
                            <StatusIcon size={14} /> {meta.label}
                          </span>
                        </div>
                        <h2 className="text-lg font-black leading-snug text-slate-900">{item.title}</h2>
                        <p className="mt-1 text-sm font-semibold text-slate-500">วิทยากร: {item.instructor || '-'}</p>
                      </div>
                      {item.certificate_code && (
                        <span className="inline-flex items-center gap-2 rounded-2xl bg-amber-50 px-4 py-2 text-xs font-black text-amber-700">
                          <Award size={15} /> {item.certificate_code}
                        </span>
                      )}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-4">
                      <Metric icon={<Clock size={16} />} label="เวลาเข้าอบรม" value={formatSeconds(item.attended_seconds)} />
                      <Metric icon={<Star size={16} />} label="ก่อนเรียน" value={item.pre_score != null ? `${item.pre_score}%` : '-'} />
                      <Metric icon={<CheckCircle2 size={16} />} label="หลังเรียน" value={item.post_score != null ? `${item.post_score}%` : '-'} />
                      <Metric icon={item.post_score != null && passResult(item.post_score, item.pass_score) === 'ผ่าน' ? <CheckCircle2 size={16} /> : <XCircle size={16} />} label="ผลการอบรม" value={passResult(item.post_score, item.pass_score)} />
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        </div>

        <Footer />
      </main>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <div className="mb-1 text-blue-600">{icon}</div>
      <p className="text-sm font-black text-slate-900">{value}</p>
      <p className="text-[11px] font-bold text-slate-400">{label}</p>
    </div>
  );
}
