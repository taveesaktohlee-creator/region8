import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardList, Eye, FileText, MapPinned, MessageSquare, Search } from 'lucide-react';
import Header from '../Header';
import LeftSide from '../LeftSide';
import Footer from '../Footer';
import { API_BASE } from '../lib/apiConfig';
import { closeSession, stopHeartbeat } from '../lib/activityTracker';
import {
  formatMeetingReportDate,
  getStoredUser,
  sectionLabels,
  type MeetingReportItem,
  type MeetingReportSection,
} from './meetingReportUtils';

const sectionIcons: Record<MeetingReportSection, typeof ClipboardList> = {
  office: ClipboardList,
  area: MapPinned,
};

export default function MeetingReportList({ section }: { section: MeetingReportSection }) {
  const [userData, setUserData] = useState<any>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [reports, setReports] = useState<MeetingReportItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const Icon = sectionIcons[section];

  const loadReports = useCallback(async (userId: number) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/meeting-reports?section=${section}&user_id=${userId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Cannot load meeting reports');
      setReports(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setReports([]);
    } finally {
      setIsLoading(false);
    }
  }, [section]);

  useEffect(() => {
    const parsedUser = getStoredUser();
    if (parsedUser) {
      setUserData(parsedUser);
      void loadReports(Number(parsedUser.user_id || 0));
    } else {
      setIsLoading(false);
    }
    const handleResize = () => setIsSidebarOpen(window.innerWidth >= 1024);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [loadReports]);

  const filteredReports = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return reports;
    return reports.filter((report) => {
      return `${report.title} ${report.description} ${report.meeting_date || ''}`.toLowerCase().includes(needle);
    });
  }, [reports, search]);

  const handleLogout = async () => {
    stopHeartbeat();
    await closeSession();
    localStorage.removeItem('user');
    window.location.href = '/';
  };

  const handleRefresh = () => {
    if (!userData?.user_id) return;
    setIsRefreshing(true);
    loadReports(userData.user_id).finally(() => setIsRefreshing(false));
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8fafc] text-slate-900">
      <LeftSide userData={userData} isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} handleLogout={handleLogout} />

      <main className="z-10 flex h-full flex-1 flex-col overflow-y-auto">
        <Header setIsSidebarOpen={setIsSidebarOpen} handleRefresh={handleRefresh} isRefreshing={isRefreshing} handleLogout={handleLogout} />

        <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-8 px-4 py-8 sm:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                <Icon size={14} /> แจ้งเวียนรายงานการประชุม
              </p>
              <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">รายงานการประชุม{sectionLabels[section]}</h1>
              <p className="mt-2 text-sm font-medium text-slate-500">อ่านรายงาน แจ้งแก้ไขด้วยคอมเมนต์บน PDF และกดรับทราบจากระบบ</p>
            </div>

            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm lg:min-w-[440px]">
              <Search size={19} className="text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="ค้นหาชื่อรายงานหรือรายละเอียด..."
                className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-56 animate-pulse rounded-3xl border border-slate-100 bg-white shadow-sm" />
              ))
            ) : filteredReports.length === 0 ? (
              <div className="col-span-full rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center">
                <FileText className="mx-auto mb-3 text-slate-300" size={46} />
                <p className="font-bold text-slate-600">ยังไม่มีรายงานการประชุมในส่วนนี้</p>
              </div>
            ) : filteredReports.map((report) => (
              <a
                key={report.report_id}
                href={`/meeting-reports/${report.report_id}`}
                className="group flex min-h-56 flex-col rounded-3xl border border-slate-100 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.07)] transition hover:-translate-y-1 hover:shadow-[0_24px_60px_rgba(37,99,235,0.16)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                    <FileText size={28} />
                  </span>
                  {Number(report.acknowledged || 0) === 1 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                      <CheckCircle2 size={14} /> รับทราบแล้ว
                    </span>
                  )}
                </div>
                <h2 className="mt-5 line-clamp-2 text-xl font-black leading-snug text-slate-900">{report.title}</h2>
                {report.description && <p className="mt-3 line-clamp-2 text-sm font-semibold leading-6 text-slate-500">{report.description}</p>}
                <div className="mt-auto grid gap-3 pt-6 text-sm font-bold text-slate-400 sm:grid-cols-3">
                  <span>{formatMeetingReportDate(report.meeting_date || report.published_at || report.updated_at)}</span>
                  <span className="inline-flex items-center gap-2"><Eye size={16} /> {Number(report.view_count || 0).toLocaleString('th-TH')} ครั้ง</span>
                  <span className="inline-flex items-center gap-2"><MessageSquare size={16} /> {Number(report.comment_count || 0).toLocaleString('th-TH')} คอมเมนต์</span>
                </div>
              </a>
            ))}
          </div>
        </div>

        <Footer />
      </main>
    </div>
  );
}
