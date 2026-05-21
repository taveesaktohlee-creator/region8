import { useState, useEffect, useCallback, useMemo } from 'react';
import { Users, UserCheck, Shield, Briefcase, Search, Eye, X, Clock, Monitor, ChevronLeft, ChevronRight, RefreshCcw, Loader2, Calendar, Filter, MapPin } from 'lucide-react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Header from '../Header';
import LeftSide from '../LeftSide';
import Footer from '../Footer';
import { API_BASE } from '../lib/apiConfig';
import { closeSession, createSession, getSessionId, sendHeartbeat, startHeartbeat, stopHeartbeat } from '../lib/activityTracker';

interface Summary { totalRegistered: number; totalLogins: number; totalGovOfficers: number; totalGovEmployees: number; }
interface UserRow { user_id: number; Name_Surname: string; username: string; position: string; type: string; Division_Province: string; is_online: number; last_seen_at: string | null; last_login: string | null; total_logins: number; total_active_seconds: number; registration_date: string | null; }
interface HistoryRow { date: string; menu_key: string; menu_name: string; total_seconds: number; visit_count: number; first_visit: string; last_visit: string; }


function fmtTime(sec: number) {
  const s = Number(sec) || 0;
  if (s <= 0) return '0 นาที';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h > 0 && m > 0) return `${h} ชม. ${m} นาที`;
  if (h > 0) return `${h} ชม.`;
  return m > 0 ? `${m} นาที` : `${s} วินาที`;
}

function parseLocalDateTime(value: string) {
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(String(value).trim())) {
    return new Date(value);
  }

  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return new Date(value);
  const [, year, month, day, hour = '0', minute = '0', second = '0'] = match;
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
}

function fmtDateTimeTH(d: string | null) {
  if (!d) return '-';
  try {
    const date = parseLocalDateTime(d);
    if (Number.isNaN(date.getTime())) return d;
    return date.toLocaleString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return d;
  }
}





function getMonthDateRange(monthStr: string): [string, string] {
  const [y, m] = monthStr.split('-');
  const from = `${y}-${m}-01`;
  const lastDay = new Date(Number(y), Number(m), 0).getDate();
  const to = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
  return [from, to];
}



export default function SystemUsageReport() {
  const [userData, setUserData] = useState<any>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [summary, setSummary] = useState<Summary>({ totalRegistered: 0, totalLogins: 0, totalGovOfficers: 0, totalGovEmployees: 0 });
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState('');
  const [selectedDivision, setSelectedDivision] = useState('all');
  const [page, setPage] = useState(1);
  const perPage = 10;
  const [modalUser, setModalUser] = useState<UserRow | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [histLoading, setHistLoading] = useState(false);

  // Modal history filter states
  const [histFilterType, setHistFilterType] = useState<'month' | 'range'>('month');
  const [histSelectedMonth, setHistSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [histDateFrom, setHistDateFrom] = useState('');
  const [histDateTo, setHistDateTo] = useState('');
  const [filterType, setFilterType] = useState<'month' | 'range'>('month');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');


  useEffect(() => {
    const saved = localStorage.getItem('user');
    if (saved && saved !== 'undefined') { try { setUserData(JSON.parse(saved)); } catch { localStorage.removeItem('user'); } }
    const hr = () => setIsSidebarOpen(window.innerWidth >= 1024);
    hr(); window.addEventListener('resize', hr);
    return () => window.removeEventListener('resize', hr);
  }, []);

  const loadData = useCallback(async (from?: string, to?: string) => {
    const qp = from && to ? `?from=${from}&to=${to}` : '';
    try {
      const [sRes, uRes] = await Promise.all([fetch(`${API_BASE}/api/usage/summary${qp}`), fetch(`${API_BASE}/api/usage/users-table${qp}`)]);
      if (sRes.ok) setSummary(await sRes.json());
      if (uRes.ok) setUsers(await uRes.json());
    } catch { toast.error('ไม่สามารถโหลดข้อมูลได้'); }
    setPageLoading(false);
  }, []);

  useEffect(() => {
    const now = new Date();
    const ms = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [from, to] = getMonthDateRange(ms);
    const initUsageReport = async () => {
      const saved = localStorage.getItem('user');
      let sessionReady = false;
      if (saved && saved !== 'undefined') {
        try {
          const user = JSON.parse(saved);
          let sid = getSessionId();
          if (!sid && user?.user_id) sid = await createSession(user.user_id);
          if (sid) {
            startHeartbeat();
            sessionReady = await sendHeartbeat();
          }
        } catch { /* ignore */ }
      }
      await fetch(`${API_BASE}/api/admin/setup-usage-tables`, { method: 'POST' }).catch(() => {});
      if (!sessionReady) await new Promise(resolve => setTimeout(resolve, 300));
      await loadData(from, to);
    };
    initUsageReport();
  }, [loadData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    if (filterType === 'month' && selectedMonth) {
      const [f, t] = getMonthDateRange(selectedMonth);
      await loadData(f, t);
    } else if (filterType === 'range' && dateFrom && dateTo) {
      await loadData(dateFrom, dateTo);
    } else {
      await loadData();
    }
    toast.success('รีเฟรชข้อมูลเรียบร้อย');
    setIsRefreshing(false);
  };
  const handleLogout = async () => { stopHeartbeat(); await closeSession(); localStorage.removeItem('user'); window.location.href = '/'; };

  const loadHistory = async (userId: number, from?: string, to?: string) => {
    setHistLoading(true); setHistory([]);
    try {
      const qp = from && to ? `?from=${from}&to=${to}` : '';
      const r = await fetch(`${API_BASE}/api/usage/user-history/${userId}${qp}`);
      if (r.ok) { const data = await r.json(); setHistory(data); }
    } catch { toast.error('ไม่สามารถโหลดประวัติได้'); }
    setHistLoading(false);
  };

  const openDetail = async (u: UserRow) => {
    setModalUser(u);
    setHistFilterType('month');
    const now = new Date();
    const ms = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    setHistSelectedMonth(ms);
    setHistDateFrom('');
    setHistDateTo('');
    const [from, to] = getMonthDateRange(ms);
    loadHistory(u.user_id, from, to);
  };

  const divisionOptions = useMemo(() => {
    return Array.from(new Set(users.map(u => u.Division_Province).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'th'));
  }, [users]);

  useEffect(() => {
    if (selectedDivision !== 'all' && !divisionOptions.includes(selectedDivision)) {
      setSelectedDivision('all');
    }
  }, [divisionOptions, selectedDivision]);

  const divisionFilteredUsers = useMemo(() => {
    if (selectedDivision === 'all') return users;
    return users.filter(u => u.Division_Province === selectedDivision);
  }, [users, selectedDivision]);

  const filteredSummary = useMemo<Summary>(() => ({
    totalRegistered: divisionFilteredUsers.length,
    totalLogins: divisionFilteredUsers.filter(u => Number(u.total_logins) > 0).length,
    totalGovOfficers: divisionFilteredUsers.filter(u => u.type === 'ข้าราชการ').length,
    totalGovEmployees: divisionFilteredUsers.filter(u => u.type === 'พนักงานราชการ').length,
  }), [divisionFilteredUsers]);

  const reportSummary = selectedDivision === 'all' ? summary : filteredSummary;
  const filtered = divisionFilteredUsers.filter(u => (u.Name_Surname || '').includes(search) || (u.username || '').includes(search) || (u.Division_Province || '').includes(search) || (u.position || '').includes(search));
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged = filtered.slice((page - 1) * perPage, page * perPage);



  // Compute per-menu summary across entire selected period
  const menuSummary = useMemo(() => {
    const acc: Record<string, { menu_name: string; total_seconds: number; visit_count: number }> = {};
    history.forEach(r => {
      if (!acc[r.menu_key]) acc[r.menu_key] = { menu_name: r.menu_name, total_seconds: 0, visit_count: 0 };
      acc[r.menu_key].total_seconds += Number(r.total_seconds) || 0;
      acc[r.menu_key].visit_count += Number(r.visit_count) || 0;
    });
    return Object.values(acc).sort((a, b) => b.total_seconds - a.total_seconds);
  }, [history]);

  // Compute summary stats from filtered history data
  const filteredTotalSeconds = useMemo(() => history.reduce((s, r) => s + (Number(r.total_seconds) || 0), 0), [history]);
  const filteredTotalVisits = useMemo(() => history.reduce((s, r) => s + (Number(r.visit_count) || 0), 0), [history]);

  const cards = [
    {
      label: 'ผู้ลงทะเบียนทั้งหมด',
      value: reportSummary.totalRegistered,
      icon: Users,
      hint: 'บัญชีผู้ใช้ในระบบ',
      badge: 'Users',
      card: 'from-blue-50 via-white to-white border-blue-100/80',
      accent: 'bg-blue-500',
      iconBox: 'bg-blue-600 text-white shadow-blue-500/25',
      valueText: 'text-blue-950',
      badgeStyle: 'bg-blue-100 text-blue-700',
      line: 'from-blue-500 to-cyan-400',
    },
    {
      label: 'ผู้เข้าใช้งานระบบ',
      value: reportSummary.totalLogins,
      icon: UserCheck,
      hint: 'มีประวัติเข้าระบบ',
      badge: 'Active',
      card: 'from-emerald-50 via-white to-white border-emerald-100/80',
      accent: 'bg-emerald-500',
      iconBox: 'bg-emerald-600 text-white shadow-emerald-500/25',
      valueText: 'text-emerald-950',
      badgeStyle: 'bg-emerald-100 text-emerald-700',
      line: 'from-emerald-500 to-teal-400',
    },
    {
      label: 'ข้าราชการ',
      value: reportSummary.totalGovOfficers,
      icon: Shield,
      hint: 'กลุ่มข้าราชการ',
      badge: 'Gov',
      card: 'from-orange-50 via-white to-white border-orange-100/80',
      accent: 'bg-orange-500',
      iconBox: 'bg-orange-500 text-white shadow-orange-500/25',
      valueText: 'text-orange-950',
      badgeStyle: 'bg-orange-100 text-orange-700',
      line: 'from-orange-500 to-amber-400',
    },
    {
      label: 'พนักงานราชการ',
      value: reportSummary.totalGovEmployees,
      icon: Briefcase,
      hint: 'กลุ่มพนักงานราชการ',
      badge: 'Staff',
      card: 'from-violet-50 via-white to-white border-violet-100/80',
      accent: 'bg-violet-500',
      iconBox: 'bg-violet-600 text-white shadow-violet-500/25',
      valueText: 'text-violet-950',
      badgeStyle: 'bg-violet-100 text-violet-700',
      line: 'from-violet-500 to-fuchsia-400',
    },
  ];

  if (pageLoading) return (
    <div className="flex h-screen items-center justify-center bg-[#f8fafc]">
      <div className="flex flex-col items-center gap-4"><div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" /><p className="text-slate-500 font-medium">กำลังโหลดข้อมูลรายงาน...</p></div>
    </div>
  );

  return (
    <div className="flex h-screen bg-[#f8fafc] font-sans text-slate-800 overflow-hidden relative">
      <ToastContainer position="top-right" autoClose={2500} />
      <div className="absolute inset-0 overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-5%] w-[40vw] h-[40vw] bg-blue-400/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[35vw] h-[35vw] bg-purple-400/10 rounded-full blur-[120px]" />
      </div>
      <LeftSide userData={userData} isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} handleLogout={handleLogout} />
      <main className="flex-1 flex flex-col h-full overflow-y-auto z-10 scroll-smooth transition-all duration-300">
        <Header setIsSidebarOpen={setIsSidebarOpen} handleRefresh={handleRefresh} isRefreshing={isRefreshing} handleLogout={handleLogout} />
        <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 flex flex-col gap-6 max-w-[1400px] mx-auto w-full animate-[fadeIn_0.4s_ease]">
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
            <div><h2 className="text-xl lg:text-2xl font-bold text-slate-800">รายงานการใช้งานระบบ</h2><p className="text-slate-500 text-sm mt-1">สรุปข้อมูลและสถิติการใช้งานระบบสารสนเทศ</p></div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 xl:ml-auto">
              <label className="flex items-center gap-2 px-3 py-2.5 bg-white/80 border border-slate-200 rounded-xl shadow-sm min-w-0 sm:min-w-[320px]">
                <MapPin size={16} className="text-blue-500 shrink-0" />
                <span className="text-xs font-bold text-slate-500 whitespace-nowrap">หน่วยงาน/จังหวัด</span>
                <select
                  value={selectedDivision}
                  onChange={e => { setSelectedDivision(e.target.value); setPage(1); }}
                  className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-700 outline-none cursor-pointer"
                >
                  <option value="all">ทั้งหมด</option>
                  {divisionOptions.map(division => (
                    <option key={division} value={division}>{division}</option>
                  ))}
                </select>
              </label>
              <button onClick={handleRefresh} className="self-start sm:self-auto flex items-center gap-2 px-4 py-2.5 bg-white/80 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-white hover:shadow-md transition-all">
                <RefreshCcw size={16} className={isRefreshing ? 'animate-spin' : ''} /> รีเฟรช
              </button>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-5">
            {cards.map((c, i) => { const Icon = c.icon; return (
              <div key={i} className={`relative overflow-hidden rounded-2xl p-4 lg:p-5 border bg-gradient-to-br ${c.card} shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group`}>
                <div className={`absolute left-0 top-0 h-full w-1 ${c.accent}`} />
                <div className="flex items-start justify-between gap-3">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg ${c.iconBox}`}>
                    <Icon size={22} strokeWidth={2.4} />
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-black tracking-wide ${c.badgeStyle}`}>
                    {c.badge}
                  </span>
                </div>
                <div className="mt-5">
                  <p className={`text-3xl lg:text-4xl font-black leading-none ${c.valueText}`}>{c.value.toLocaleString()}</p>
                  <p className="text-sm font-black text-slate-700 mt-2">{c.label}</p>
                  <p className="text-xs font-semibold text-slate-400 mt-1">{c.hint}</p>
                </div>
                <div className="mt-4 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className={`h-full w-2/3 rounded-full bg-gradient-to-r ${c.line} group-hover:w-full transition-all duration-500`} />
                </div>
              </div>
            ); })}
          </div>

          {/* Users Table */}
          <div className="bg-white/80 rounded-2xl border border-white/60 shadow-sm overflow-hidden">
            <div className="p-4 lg:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3">
              <h3 className="text-base lg:text-lg font-bold text-slate-800 flex items-center gap-2 flex-shrink-0">
                <Monitor size={20} className="text-blue-500" /> ข้อมูลการใช้งานระบบ
                <span className="text-xs font-normal text-slate-400">({filtered.length})</span>
              </h3>
              <div className="flex items-center gap-3 sm:ml-auto flex-wrap">
                {/* Filter Type Toggle */}
                <div className="flex bg-slate-100 rounded-lg p-0.5">
                  <button onClick={() => { setFilterType('month'); if (selectedMonth) { const [f, t] = getMonthDateRange(selectedMonth); loadData(f, t); } }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${filterType === 'month' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                    <Calendar size={12} />รายเดือน
                  </button>
                  <button onClick={() => setFilterType('range')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${filterType === 'range' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                    <Filter size={12} />ช่วงวันที่
                  </button>
                </div>

                {/* Month Selector or Date Range Inputs */}
                {filterType === 'month' ? (
                  <input type="month" value={selectedMonth}
                    onChange={e => { setSelectedMonth(e.target.value); const [f, t] = getMonthDateRange(e.target.value); loadData(f, t); }}
                    className="px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all cursor-pointer" />
                ) : (
                  <div className="flex items-center gap-2">
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                      className="px-2.5 py-1.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all" />
                    <span className="text-slate-400 text-xs font-medium">ถึง</span>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                      className="px-2.5 py-1.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all" />
                    <button onClick={() => { if (dateFrom && dateTo) loadData(dateFrom, dateTo); }}
                      className="px-3 py-1.5 text-xs font-medium bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all shadow-sm">
                      ค้นหา
                    </button>
                  </div>
                )}

                {/* Search */}
                <div className="relative w-full sm:w-52">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="ค้นหา..."
                    className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white transition-all" />
                </div>
              </div>
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-slate-50/80 text-slate-500 text-xs uppercase tracking-wider">
                  <th className="px-4 py-3 text-left font-semibold">#</th>
                  <th className="px-4 py-3 text-left font-semibold">ชื่อ-นามสกุล</th>
                  <th className="px-4 py-3 text-left font-semibold">ตำแหน่ง</th>
                  <th className="px-4 py-3 text-left font-semibold">ประเภท</th>
                  <th className="px-4 py-3 text-center font-semibold">สถานะ</th>
                  <th className="px-4 py-3 text-center font-semibold">เข้าใช้งาน</th>
                  <th className="px-4 py-3 text-center font-semibold">เวลาใช้งาน</th>
                  <th className="px-4 py-3 text-center font-semibold">เข้าล่าสุด</th>
                  <th className="px-4 py-3 text-center font-semibold">ดู</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {paged.map((u, i) => (
                    <tr key={u.user_id} className="hover:bg-blue-50/30 transition-colors">
                      <td className="px-4 py-3 text-slate-400">{(page-1)*perPage+i+1}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{u.Name_Surname||'-'}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{u.position||'-'}</td>
                      <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${u.type==='ข้าราชการ'?'bg-orange-100 text-orange-700':'bg-purple-100 text-purple-700'}`}>{u.type||'-'}</span></td>
                      <td className="px-4 py-3 text-center"><span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${u.is_online?'bg-emerald-100 text-emerald-700':'bg-slate-100 text-slate-500'}`}><span className={`w-2 h-2 rounded-full ${u.is_online?'bg-emerald-500 animate-pulse':'bg-slate-400'}`}/>{u.is_online?'ออนไลน์':'ออฟไลน์'}</span></td>
                      <td className="px-4 py-3 text-center font-medium">{u.total_logins} ครั้ง</td>
                      <td className="px-4 py-3 text-center"><span className="inline-flex items-center gap-1 text-xs"><Clock size={12}/> {fmtTime(Number(u.total_active_seconds))}</span></td>
                      <td className="px-4 py-3 text-center text-xs text-slate-500">{fmtDateTimeTH(u.last_login)}</td>
                      <td className="px-4 py-3 text-center"><button onClick={()=>openDetail(u)} className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-all"><Eye size={16}/></button></td>
                    </tr>
                  ))}
                  {paged.length===0&&<tr><td colSpan={9} className="px-4 py-12 text-center text-slate-400">ไม่พบข้อมูล</td></tr>}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {paged.map(u=>(
                <div key={u.user_id} className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0"><p className="font-semibold text-slate-800 text-sm truncate">{u.Name_Surname||'-'}</p><p className="text-xs text-slate-500">{u.position||'-'}</p></div>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${u.is_online?'bg-emerald-100 text-emerald-700':'bg-slate-100 text-slate-500'}`}><span className={`w-1.5 h-1.5 rounded-full ${u.is_online?'bg-emerald-500 animate-pulse':'bg-slate-400'}`}/>{u.is_online?'ออนไลน์':'ออฟไลน์'}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs text-slate-500 mt-2">
                    <div><span className="block text-slate-400">ประเภท</span>{u.type||'-'}</div>
                    <div><span className="block text-slate-400">เข้าใช้งาน</span>{u.total_logins} ครั้ง</div>
                    <div><span className="block text-slate-400">เวลา</span>{fmtTime(Number(u.total_active_seconds))}</div>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-slate-400">ล่าสุด: {fmtDateTimeTH(u.last_login)}</span>
                    <button onClick={()=>openDetail(u)} className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium hover:bg-blue-100 flex items-center gap-1"><Eye size={14}/> ดู</button>
                  </div>
                </div>
              ))}
              {paged.length===0&&<div className="p-8 text-center text-slate-400 text-sm">ไม่พบข้อมูล</div>}
            </div>

            {totalPages>1&&(
              <div className="p-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-400">หน้า {page}/{totalPages}</span>
                <div className="flex items-center gap-2">
                  <button disabled={page<=1} onClick={()=>setPage(p=>p-1)} className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30"><ChevronLeft size={16}/></button>
                  <button disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)} className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30"><ChevronRight size={16}/></button>
                </div>
              </div>
            )}
          </div>
        </div>
        <Footer />
      </main>

      {/* Detail Modal - no backdrop-blur for speed */}
      {modalUser&&(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={()=>setModalUser(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-[slideUp_0.2s_ease]" onClick={e=>e.stopPropagation()}>
            <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div><h3 className="text-lg font-bold text-slate-800">{modalUser.Name_Surname}</h3><p className="text-sm text-slate-500">{modalUser.position} · {modalUser.Division_Province}</p></div>
              <button onClick={()=>setModalUser(null)} className="p-2 hover:bg-slate-100 rounded-xl"><X size={20}/></button>
            </div>
            <div className="p-4 grid grid-cols-3 gap-3 border-b border-slate-100 shrink-0">
              <div className="bg-blue-50 rounded-xl p-3 text-center">
                <p className="text-lg font-bold text-blue-700">{histLoading ? '…' : filteredTotalVisits}</p>
                <p className="text-xs text-blue-500">เข้าใช้งาน (ครั้ง)</p>
              </div>
              <div className="bg-emerald-50 rounded-xl p-3 text-center">
                <p className="text-lg font-bold text-emerald-700">{histLoading ? '…' : fmtTime(filteredTotalSeconds)}</p>
                <p className="text-xs text-emerald-500">เวลาใช้งานรวม</p>
              </div>
              <div className="bg-orange-50 rounded-xl p-3 text-center">
                <p className="text-lg font-bold text-orange-700">{modalUser.is_online?'ออนไลน์':'ออฟไลน์'}</p>
                <p className="text-xs text-orange-500">สถานะปัจจุบัน</p>
              </div>
            </div>

            {/* History: date filter only (no mode tabs) */}
            <div className="flex flex-col gap-2 px-5 pt-4 pb-2 shrink-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2 mr-2"><Calendar size={16}/> ประวัติการใช้งาน</h4>
                {/* Filter type toggle */}
                <div className="flex bg-slate-100 rounded-lg p-0.5">
                  <button
                    onClick={() => { setHistFilterType('month'); const [f,t] = getMonthDateRange(histSelectedMonth); if(modalUser) loadHistory(modalUser.user_id, f, t); }}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${histFilterType==='month'?'bg-white text-blue-600 shadow-sm':'text-slate-500 hover:text-slate-700'}`}>
                    <Calendar size={11}/>รายเดือน
                  </button>
                  <button
                    onClick={() => setHistFilterType('range')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${histFilterType==='range'?'bg-white text-blue-600 shadow-sm':'text-slate-500 hover:text-slate-700'}`}>
                    <Filter size={11}/>ช่วงวันที่
                  </button>
                </div>

                {histFilterType === 'month' ? (
                  <input type="month" value={histSelectedMonth}
                    onChange={e => {
                      setHistSelectedMonth(e.target.value);
                      const [f,t] = getMonthDateRange(e.target.value);
                      if(modalUser) loadHistory(modalUser.user_id, f, t);
                    }}
                    className="px-2.5 py-1 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all cursor-pointer" />
                ) : (
                  <div className="flex items-center gap-1.5">
                    <input type="date" value={histDateFrom} onChange={e => setHistDateFrom(e.target.value)}
                      className="px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all" />
                    <span className="text-slate-400 text-xs">ถึง</span>
                    <input type="date" value={histDateTo} onChange={e => setHistDateTo(e.target.value)}
                      className="px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all" />
                    <button
                      onClick={() => { if(histDateFrom && histDateTo && modalUser) loadHistory(modalUser.user_id, histDateFrom, histDateTo); }}
                      className="px-2.5 py-1 text-xs font-medium bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all">
                      ค้นหา
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-5">
              {histLoading ? (
                <div className="flex items-center justify-center py-12"><Loader2 size={24} className="animate-spin text-blue-500"/></div>
              ) : menuSummary.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm">ยังไม่มีประวัติการใช้งาน</div>
              ) : (
                <div className="mt-2 border border-slate-100 rounded-xl overflow-hidden">
                  {/* Header row */}
                  <div className="bg-slate-50 px-4 py-2.5 grid grid-cols-[1fr_auto_auto] gap-4 border-b border-slate-100">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">เมนู</span>
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-center w-20">จำนวนครั้ง</span>
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right w-28">เวลาใช้งาน</span>
                  </div>
                  {/* Menu rows */}
                  <div className="divide-y divide-slate-50">
                    {menuSummary.map((item, idx) => {
                      const pct = filteredTotalSeconds > 0 ? Math.round((item.total_seconds / filteredTotalSeconds) * 100) : 0;
                      return (
                        <div key={idx} className="px-4 py-3 hover:bg-slate-50/60 transition-colors">
                          <div className="grid grid-cols-[1fr_auto_auto] gap-4 items-center mb-1.5">
                            <p className="font-medium text-slate-700 text-sm truncate">{item.menu_name}</p>
                            <span className="text-xs text-slate-500 text-center w-20">{item.visit_count} ครั้ง</span>
                            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg text-right w-28 text-center">{fmtTime(item.total_seconds)}</span>
                          </div>
                          {/* Progress bar */}
                          <div className="w-full bg-slate-100 rounded-full h-1.5">
                            <div className="bg-blue-400 h-1.5 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Footer total */}
                  <div className="bg-slate-50 px-4 py-2.5 border-t border-slate-100 grid grid-cols-[1fr_auto_auto] gap-4">
                    <span className="text-xs font-bold text-slate-600">รวมทั้งหมด</span>
                    <span className="text-xs font-bold text-slate-600 text-center w-20">{filteredTotalVisits} ครั้ง</span>
                    <span className="text-xs font-bold text-slate-600 text-right w-28 text-center">{fmtTime(filteredTotalSeconds)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html:`
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes slideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
      `}}/>
    </div>
  );
}
