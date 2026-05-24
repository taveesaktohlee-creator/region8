import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock,
  Edit3,
  Link as LinkIcon,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Header from '../Header';
import LeftSide from '../LeftSide';
import Footer from '../Footer';
import { API_BASE } from '../lib/apiConfig';
import { closeSession, stopHeartbeat } from '../lib/activityTracker';

type ViewMode = 'day' | 'week' | 'month' | 'year';

interface ActivityEvent {
  event_id: number;
  title: string;
  description: string;
  location: string;
  start_at: string;
  end_at: string;
  all_day: number;
  color: string;
  source: 'system' | 'google';
  visibility: 'org' | 'private';
  created_by_user_id: number;
  created_by_name: string;
  google_html_link?: string;
  has_conflict: boolean;
  conflicts: Array<{ event_id: number; title: string; created_by_name: string }>;
  can_edit: boolean;
}

interface GoogleConnection {
  connection_id: number;
  google_email: string;
  sync_enabled: number;
  last_synced_at: string | null;
}

interface EventForm {
  title: string;
  description: string;
  location: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  color: string;
}

const MONTH_NAMES = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];
const DAY_NAMES = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'];
const EVENT_COLORS = ['#3b82f6', '#22c55e', '#f97316', '#a855f7', '#ec4899', '#14b8a6', '#64748b'];

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(date: Date) {
  const start = startOfDay(date);
  start.setDate(start.getDate() - start.getDay());
  return start;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDateTimeForInput(date: Date) {
  return `${formatDateKey(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function parseEventDate(value: string) {
  const text = String(value || '').trim();
  if (!text) return new Date(Number.NaN);
  const localMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (localMatch) {
    const [, year, month, day, hour = '0', minute = '0', second = '0'] = localMatch;
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    );
  }
  return new Date(text);
}

function getEventDisplayEndDate(event: ActivityEvent) {
  const start = parseEventDate(event.start_at);
  const end = parseEventDate(event.end_at);
  if (Number.isNaN(end.getTime())) return start;

  const endIsExclusiveAllDay =
    event.all_day &&
    end.getHours() === 0 &&
    end.getMinutes() === 0 &&
    end.getSeconds() === 0 &&
    formatDateKey(end) !== formatDateKey(start);

  return endIsExclusiveAllDay ? addDays(end, -1) : end;
}

function formatThaiDay(date: Date) {
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear() + 543}`;
}

function formatEventTime(event: ActivityEvent) {
  const start = parseEventDate(event.start_at);
  const end = parseEventDate(event.end_at);
  if (event.all_day) return 'ทั้งวัน';
  const startText = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
  const endText = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
  return `${startText} - ${endText}`;
}

function getInitialForm(date = new Date()): EventForm {
  const start = new Date(date);
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start);
  end.setHours(end.getHours() + 1);
  return {
    title: '',
    description: '',
    location: '',
    start_at: formatDateTimeForInput(start),
    end_at: formatDateTimeForInput(end),
    all_day: false,
    color: EVENT_COLORS[0],
  };
}

function getVisibleRange(date: Date, viewMode: ViewMode) {
  if (viewMode === 'year') {
    return {
      start: new Date(date.getFullYear(), 0, 1),
      end: new Date(date.getFullYear() + 1, 0, 1),
    };
  }
  if (viewMode === 'month') {
    const first = startOfMonth(date);
    const start = startOfWeek(first);
    const end = addDays(start, 42);
    return { start, end };
  }
  if (viewMode === 'week') {
    const start = startOfWeek(date);
    return { start, end: addDays(start, 7) };
  }
  const start = startOfDay(date);
  return { start, end: addDays(start, 1) };
}

function eventToForm(event: ActivityEvent): EventForm {
  return {
    title: event.title || '',
    description: event.description || '',
    location: event.location || '',
    start_at: event.start_at.slice(0, 16),
    end_at: event.end_at.slice(0, 16),
    all_day: Boolean(event.all_day),
    color: event.color || EVENT_COLORS[0],
  };
}

export default function ActivityCalendar() {
  const [userData, setUserData] = useState<any>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [google, setGoogle] = useState<GoogleConnection | null>(null);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<ActivityEvent | null>(null);
  const [form, setForm] = useState<EventForm>(() => getInitialForm());
  const [isSaving, setIsSaving] = useState(false);
  const currentUserId = useMemo(() => Number(userData?.user_id || 0), [userData]);

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser && savedUser !== 'undefined') {
      try { setUserData(JSON.parse(savedUser)); } catch { localStorage.removeItem('user'); }
    }
    const handleResize = () => setIsSidebarOpen(window.innerWidth >= 1024);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const visibleRange = useMemo(() => getVisibleRange(currentDate, viewMode), [currentDate, viewMode]);

  const loadEvents = useCallback(async (
    showToast = false,
    rangeOverride?: { start: Date; end: Date },
  ) => {
    if (!currentUserId) return;
    setIsLoading(true);
    try {
      const needle = search.trim();
      const requestRange = rangeOverride || (needle
        ? {
            start: new Date(currentDate.getFullYear(), 0, 1),
            end: new Date(currentDate.getFullYear() + 1, 0, 1),
          }
        : visibleRange);
      const params = new URLSearchParams({
        user_id: String(currentUserId),
        start: formatDateKey(requestRange.start),
        end: formatDateKey(requestRange.end),
      });
      const response = await fetch(`${API_BASE}/api/activity-calendar/events?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'โหลดตารางกิจกรรมไม่สำเร็จ');
      setEvents(Array.isArray(data.events) ? data.events : []);
      setGoogle(data.google || null);
      if (showToast) toast.success('โหลดตารางกิจกรรมใหม่แล้ว');
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'โหลดตารางกิจกรรมไม่สำเร็จ');
    } finally {
      setIsLoading(false);
    }
  }, [currentDate, currentUserId, search, visibleRange]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('google') === 'connected') toast.success('เชื่อม Google Calendar แล้ว กดซิงก์เพื่อดึงข้อมูลล่าสุด');
    if (params.get('google') === 'error') toast.error('เชื่อม Google Calendar ไม่สำเร็จ');
    if (params.has('google')) window.history.replaceState({}, '', '/activity-calendar');
  }, []);

  const filteredEvents = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return events;
    return events.filter((event) => `${event.title} ${event.description} ${event.location} ${event.created_by_name}`.toLowerCase().includes(needle));
  }, [events, search]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, ActivityEvent[]>();
    filteredEvents.forEach((event) => {
      const start = parseEventDate(event.start_at);
      const lastDate = getEventDisplayEndDate(event);
      if (Number.isNaN(start.getTime()) || Number.isNaN(lastDate.getTime())) return;
      for (let cursor = startOfDay(start); cursor <= startOfDay(lastDate); cursor = addDays(cursor, 1)) {
        const key = formatDateKey(cursor);
        const list = map.get(key) || [];
        list.push(event);
        map.set(key, list);
      }
    });
    map.forEach((list) => list.sort((a, b) => a.start_at.localeCompare(b.start_at)));
    return map;
  }, [filteredEvents]);

  const title = viewMode === 'year'
    ? `${currentDate.getFullYear() + 543}`
    : `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear() + 543}`;

  const handleLogout = async () => {
    stopHeartbeat();
    await closeSession();
    localStorage.removeItem('user');
    window.location.href = '/';
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadEvents(true).finally(() => setIsRefreshing(false));
  };

  const movePeriod = (direction: -1 | 1) => {
    setCurrentDate((value) => {
      const next = new Date(value);
      if (viewMode === 'year') next.setFullYear(next.getFullYear() + direction);
      else if (viewMode === 'month') next.setMonth(next.getMonth() + direction);
      else next.setDate(next.getDate() + (viewMode === 'week' ? 7 : 1) * direction);
      return next;
    });
  };

  const openCreateModal = (date = currentDate) => {
    setSelectedEvent(null);
    setForm(getInitialForm(date));
    setModalOpen(true);
  };

  const openEventModal = (event: ActivityEvent) => {
    setSelectedEvent(event);
    setForm(eventToForm(event));
    setModalOpen(true);
  };

  const saveEvent = async () => {
    if (!currentUserId) return toast.warning('กรุณาเข้าสู่ระบบก่อนเพิ่มกิจกรรม');
    if (!form.title.trim()) return toast.warning('กรุณาระบุชื่อกิจกรรม');
    if (new Date(form.end_at).getTime() <= new Date(form.start_at).getTime()) return toast.warning('เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม');
    setIsSaving(true);
    try {
      const isEdit = Boolean(selectedEvent?.event_id);
      const response = await fetch(`${API_BASE}/api/activity-calendar/events${isEdit ? `/${selectedEvent?.event_id}` : ''}`, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, user_id: currentUserId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'บันทึกกิจกรรมไม่สำเร็จ');
      toast.success(data.message);
      setModalOpen(false);
      const savedDate = parseEventDate(form.start_at);
      if (!Number.isNaN(savedDate.getTime())) {
        setCurrentDate(savedDate);
        await loadEvents(false, getVisibleRange(savedDate, viewMode));
      } else {
        await loadEvents();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'บันทึกกิจกรรมไม่สำเร็จ');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteEvent = async () => {
    if (!selectedEvent?.event_id || !currentUserId) return;
    if (!window.confirm('ยืนยันลบกิจกรรมนี้หรือไม่')) return;
    setIsSaving(true);
    try {
      const response = await fetch(`${API_BASE}/api/activity-calendar/events/${selectedEvent.event_id}?user_id=${currentUserId}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'ลบกิจกรรมไม่สำเร็จ');
      toast.success(data.message);
      setModalOpen(false);
      await loadEvents();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'ลบกิจกรรมไม่สำเร็จ');
    } finally {
      setIsSaving(false);
    }
  };

  const connectGoogle = async () => {
    if (!currentUserId) return toast.warning('กรุณาเข้าสู่ระบบก่อนเชื่อม Google Calendar');
    try {
      const response = await fetch(`${API_BASE}/api/activity-calendar/google/connect-url?user_id=${currentUserId}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'สร้างลิงก์ Google Calendar ไม่สำเร็จ');
      window.location.href = data.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'เชื่อม Google Calendar ไม่สำเร็จ');
    }
  };

  const syncGoogle = async () => {
    if (!currentUserId) return;
    setIsRefreshing(true);
    try {
      const response = await fetch(`${API_BASE}/api/activity-calendar/google/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUserId }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401 || data.reconnect_required) {
          setGoogle(null);
          await loadEvents();
          toast.error(data.error || 'การเชื่อม Google Calendar หมดอายุ กรุณาเชื่อมใหม่อีกครั้ง');
          return;
        }
        throw new Error(data.error || 'ซิงก์ Google Calendar ไม่สำเร็จ');
      }
      toast.success(data.message);
      await loadEvents();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'ซิงก์ Google Calendar ไม่สำเร็จ');
    } finally {
      setIsRefreshing(false);
    }
  };

  const disconnectGoogle = async () => {
    if (!currentUserId || !window.confirm('ยกเลิกการเชื่อม Google Calendar และลบกิจกรรมที่ sync ไว้หรือไม่')) return;
    try {
      const response = await fetch(`${API_BASE}/api/activity-calendar/google/disconnect?user_id=${currentUserId}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'ยกเลิกการเชื่อมไม่สำเร็จ');
      toast.success(data.message);
      await loadEvents();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'ยกเลิกการเชื่อมไม่สำเร็จ');
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8fafc] text-slate-900">
      <LeftSide userData={userData} isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} handleLogout={handleLogout} />
      <main className="z-10 flex h-full flex-1 flex-col overflow-y-auto">
        <Header setIsSidebarOpen={setIsSidebarOpen} handleRefresh={handleRefresh} isRefreshing={isRefreshing} handleLogout={handleLogout} />

        <div className="mx-auto flex w-full max-w-[1640px] flex-1 flex-col gap-6 px-4 py-8 sm:px-8 lg:px-10">
          <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                  <CalendarDays size={15} /> ตารางกิจกรรม สตท.8
                </p>
                <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">{title}</h1>
                <p className="mt-2 text-sm font-bold text-slate-500">เพิ่มกิจกรรมร่วมกันและตรวจเวลาเมื่อกิจกรรมชนกัน</p>
              </div>

              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="flex rounded-2xl bg-slate-100 p-1">
                  {(['day', 'week', 'month', 'year'] as ViewMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setViewMode(mode)}
                      className={`rounded-xl px-4 py-2 text-sm font-black transition ${viewMode === mode ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
                    >
                      {mode === 'day' ? 'วัน' : mode === 'week' ? 'สัปดาห์' : mode === 'month' ? 'เดือน' : 'ปี'}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => movePeriod(-1)} className="rounded-full bg-slate-100 p-3 text-slate-600 hover:bg-slate-200"><ChevronLeft size={18} /></button>
                  <button onClick={() => setCurrentDate(new Date())} className="rounded-full bg-slate-100 px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-200">วันนี้</button>
                  <button onClick={() => movePeriod(1)} className="rounded-full bg-slate-100 p-3 text-slate-600 hover:bg-slate-200"><ChevronRight size={18} /></button>
                  <button onClick={() => openCreateModal()} className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-500/25 hover:bg-blue-700">
                    <Plus size={18} /> เพิ่มกิจกรรม
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-3 xl:grid-cols-[1fr_auto]">
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <Search size={18} className="text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="ค้นหากิจกรรม สถานที่ หรือผู้เพิ่ม..."
                  className="w-full bg-transparent text-sm font-bold outline-none placeholder:text-slate-400"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {google ? (
                  <>
                    <button onClick={syncGoogle} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700 hover:bg-emerald-100">
                      <RefreshCw size={17} /> ซิงก์ Google
                    </button>
                    <button onClick={disconnectGoogle} className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-600 hover:bg-slate-200">
                      {google.google_email || 'Google Calendar'}
                    </button>
                  </>
                ) : (
                  <button onClick={connectGoogle} className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white hover:bg-slate-800">
                    <LinkIcon size={17} /> เชื่อม Google Calendar
                  </button>
                )}
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
            {viewMode === 'month' && (
              <MonthView currentDate={currentDate} eventsByDate={eventsByDate} isLoading={isLoading} onDayClick={openCreateModal} onEventClick={openEventModal} />
            )}
            {viewMode === 'week' && (
              <WeekView startDate={startOfWeek(currentDate)} eventsByDate={eventsByDate} onDayClick={openCreateModal} onEventClick={openEventModal} />
            )}
            {viewMode === 'day' && (
              <DayView date={currentDate} events={eventsByDate.get(formatDateKey(currentDate)) || []} onCreate={openCreateModal} onEventClick={openEventModal} />
            )}
            {viewMode === 'year' && (
              <YearView year={currentDate.getFullYear()} eventsByDate={eventsByDate} onMonthClick={(month) => { setCurrentDate(new Date(currentDate.getFullYear(), month, 1)); setViewMode('month'); }} />
            )}
          </section>
        </div>

        <Footer />
      </main>

      {modalOpen && (
        <EventModal
          event={selectedEvent}
          form={form}
          setForm={setForm}
          isSaving={isSaving}
          onClose={() => setModalOpen(false)}
          onSave={saveEvent}
          onDelete={deleteEvent}
        />
      )}
      <ToastContainer position="top-right" autoClose={2500} />
    </div>
  );
}

function EventPill({ event, compact = false, onClick }: { event: ActivityEvent; compact?: boolean; onClick: (event: ActivityEvent) => void }) {
  const background = event.has_conflict ? '#ef4444' : event.color || '#3b82f6';
  return (
    <button
      onClick={(clickEvent) => { clickEvent.stopPropagation(); onClick(event); }}
      className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs font-black text-white shadow-sm transition hover:brightness-95"
      style={{ backgroundColor: background }}
      title={`${event.title} • ${event.created_by_name || 'ไม่ระบุผู้เพิ่ม'}`}
    >
      {event.has_conflict && <CircleAlert size={12} />}
      <span className="truncate">{compact ? event.title : `${formatEventTime(event)} ${event.title}`}</span>
    </button>
  );
}

function MonthView({
  currentDate,
  eventsByDate,
  isLoading,
  onDayClick,
  onEventClick,
}: {
  currentDate: Date;
  eventsByDate: Map<string, ActivityEvent[]>;
  isLoading: boolean;
  onDayClick: (date: Date) => void;
  onEventClick: (event: ActivityEvent) => void;
}) {
  const first = startOfMonth(currentDate);
  const gridStart = startOfWeek(first);
  const todayKey = formatDateKey(new Date());
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  return (
    <div>
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
        {DAY_NAMES.map((day) => <div key={day} className="px-3 py-3 text-center text-sm font-black text-slate-500">{day}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((date) => {
          const key = formatDateKey(date);
          const dayEvents = eventsByDate.get(key) || [];
          const isOutside = date.getMonth() !== currentDate.getMonth();
          const isToday = key === todayKey;
          return (
            <div
              role="button"
              tabIndex={0}
              key={key}
              onClick={() => onDayClick(date)}
              onKeyDown={(keyEvent) => {
                if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
                  keyEvent.preventDefault();
                  onDayClick(date);
                }
              }}
              className="min-h-[150px] cursor-pointer border-b border-r border-slate-100 p-2 text-left transition hover:bg-blue-50/40"
            >
              <div className={`ml-auto flex h-7 w-7 items-center justify-center rounded-full text-sm font-black ${isToday ? 'bg-red-500 text-white' : isOutside ? 'text-slate-300' : 'text-slate-700'}`}>
                {date.getDate()}
              </div>
              <div className="mt-2 space-y-1">
                {isLoading ? <div className="h-5 animate-pulse rounded bg-slate-100" /> : dayEvents.slice(0, 4).map((event) => (
                  <EventPill key={`${key}-${event.event_id}`} event={event} onClick={onEventClick} />
                ))}
                {dayEvents.length > 4 && <div className="px-2 text-xs font-bold text-slate-400">+{dayEvents.length - 4} รายการ</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({ startDate, eventsByDate, onDayClick, onEventClick }: { startDate: Date; eventsByDate: Map<string, ActivityEvent[]>; onDayClick: (date: Date) => void; onEventClick: (event: ActivityEvent) => void }) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(startDate, index));
  return (
    <div className="grid min-h-[620px] grid-cols-1 md:grid-cols-7">
      {days.map((date) => {
        const key = formatDateKey(date);
        const dayEvents = eventsByDate.get(key) || [];
        return (
          <div
            key={key}
            role="button"
            tabIndex={0}
            onClick={() => onDayClick(date)}
            onKeyDown={(keyEvent) => {
              if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
                keyEvent.preventDefault();
                onDayClick(date);
              }
            }}
            className="cursor-pointer border-b border-r border-slate-100 p-4 text-left hover:bg-blue-50/40"
          >
            <p className="text-xs font-black text-slate-400">{DAY_NAMES[date.getDay()]}</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{date.getDate()}</p>
            <div className="mt-4 space-y-2">
              {dayEvents.length === 0 ? <p className="text-sm font-bold text-slate-300">ไม่มีกิจกรรม</p> : dayEvents.map((event) => (
                <EventPill key={`${key}-${event.event_id}`} event={event} onClick={onEventClick} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DayView({ date, events, onCreate, onEventClick }: { date: Date; events: ActivityEvent[]; onCreate: (date: Date) => void; onEventClick: (event: ActivityEvent) => void }) {
  return (
    <div className="min-h-[620px] p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-black text-blue-600">{DAY_NAMES[date.getDay()]}</p>
          <h2 className="text-3xl font-black text-slate-900">{formatThaiDay(date)}</h2>
        </div>
        <button onClick={() => onCreate(date)} className="rounded-full bg-blue-600 p-3 text-white shadow-lg shadow-blue-500/25"><Plus size={20} /></button>
      </div>
      <div className="mt-6 space-y-3">
        {events.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 p-10 text-center font-bold text-slate-400">ยังไม่มีกิจกรรมในวันนี้</div>
        ) : events.map((event) => (
          <button key={event.event_id} onClick={() => onEventClick(event)} className={`w-full rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 ${event.has_conflict ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-slate-50'}`}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className={`text-lg font-black ${event.has_conflict ? 'text-red-700' : 'text-slate-900'}`}>{event.title}</p>
                <p className="mt-1 text-sm font-bold text-slate-500">{formatEventTime(event)} • {event.created_by_name || 'ไม่ระบุผู้เพิ่ม'}</p>
              </div>
              {event.source === 'google' && <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">Google</span>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function YearView({ year, eventsByDate, onMonthClick }: { year: number; eventsByDate: Map<string, ActivityEvent[]>; onMonthClick: (month: number) => void }) {
  return (
    <div className="grid gap-4 p-6 sm:grid-cols-2 xl:grid-cols-4">
      {MONTH_NAMES.map((month, monthIndex) => {
        const first = new Date(year, monthIndex, 1);
        const start = startOfWeek(first);
        const days = Array.from({ length: 42 }, (_, index) => addDays(start, index));
        return (
          <button key={month} onClick={() => onMonthClick(monthIndex)} className="rounded-3xl border border-slate-100 bg-slate-50 p-4 text-left hover:bg-blue-50">
            <p className="mb-3 text-lg font-black text-slate-900">{month}</p>
            <div className="grid grid-cols-7 gap-1">
              {days.map((date) => {
                const key = formatDateKey(date);
                const hasEvents = (eventsByDate.get(key) || []).length > 0;
                const hasConflict = (eventsByDate.get(key) || []).some((event) => event.has_conflict);
                return (
                  <span key={key} className={`flex h-7 items-center justify-center rounded-full text-xs font-bold ${date.getMonth() !== monthIndex ? 'text-slate-300' : hasConflict ? 'bg-red-500 text-white' : hasEvents ? 'bg-blue-100 text-blue-700' : 'text-slate-500'}`}>
                    {date.getDate()}
                  </span>
                );
              })}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function EventModal({
  event,
  form,
  setForm,
  isSaving,
  onClose,
  onSave,
  onDelete,
}: {
  event: ActivityEvent | null;
  form: EventForm;
  setForm: (form: EventForm) => void;
  isSaving: boolean;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const readonly = Boolean(event && !event.can_edit);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
              {event ? <Edit3 size={14} /> : <Plus size={14} />} {event ? 'รายละเอียดกิจกรรม' : 'เพิ่มกิจกรรม'}
            </p>
            <h2 className="mt-2 text-2xl font-black text-slate-900">{event?.title || 'กิจกรรมใหม่'}</h2>
          </div>
          <button onClick={onClose} className="rounded-full bg-slate-100 p-2 text-slate-500 hover:bg-slate-200"><X size={20} /></button>
        </div>

        {readonly && (
          <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="flex items-center gap-2 text-sm font-black text-slate-700"><UserRound size={16} /> เพิ่มโดย {event?.created_by_name || 'ไม่ระบุ'}</p>
            {event?.source === 'google' && <p className="mt-2 text-xs font-bold text-emerald-600">กิจกรรมจาก Google Calendar ส่วนตัวของคุณ แก้ไขได้จาก Google Calendar</p>}
          </div>
        )}

        {event?.has_conflict && (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
            <p className="flex items-center gap-2 text-sm font-black"><CircleAlert size={17} /> ตารางกิจกรรมชนกัน</p>
            <p className="mt-1 text-sm font-bold">ชนกับ: {event.conflicts.map((item) => item.title).join(', ')}</p>
          </div>
        )}

        <div className="mt-5 grid gap-4">
          <input
            value={form.title}
            disabled={readonly}
            onChange={(changeEvent) => setForm({ ...form, title: changeEvent.target.value })}
            placeholder="ชื่อกิจกรรม"
            className="rounded-2xl border border-slate-200 px-4 py-3 text-lg font-black outline-none focus:border-blue-400 disabled:bg-slate-50"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-black text-slate-500">
              <span className="flex items-center gap-2"><Clock size={15} /> เริ่ม</span>
              <input type="datetime-local" value={form.start_at} disabled={readonly} onChange={(changeEvent) => setForm({ ...form, start_at: changeEvent.target.value })} className="rounded-2xl border border-slate-200 px-4 py-3 font-bold text-slate-900 outline-none focus:border-blue-400 disabled:bg-slate-50" />
            </label>
            <label className="grid gap-2 text-sm font-black text-slate-500">
              <span className="flex items-center gap-2"><CheckCircle2 size={15} /> สิ้นสุด</span>
              <input type="datetime-local" value={form.end_at} disabled={readonly} onChange={(changeEvent) => setForm({ ...form, end_at: changeEvent.target.value })} className="rounded-2xl border border-slate-200 px-4 py-3 font-bold text-slate-900 outline-none focus:border-blue-400 disabled:bg-slate-50" />
            </label>
          </div>
          <label className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-black text-slate-700">
            <input type="checkbox" checked={form.all_day} disabled={readonly} onChange={(changeEvent) => setForm({ ...form, all_day: changeEvent.target.checked })} className="h-5 w-5 accent-blue-600" />
            กิจกรรมทั้งวัน
          </label>
          <input
            value={form.location}
            disabled={readonly}
            onChange={(changeEvent) => setForm({ ...form, location: changeEvent.target.value })}
            placeholder="สถานที่หรือช่องทางประชุม"
            className="rounded-2xl border border-slate-200 px-4 py-3 font-bold outline-none focus:border-blue-400 disabled:bg-slate-50"
          />
          <textarea
            value={form.description}
            disabled={readonly}
            onChange={(changeEvent) => setForm({ ...form, description: changeEvent.target.value })}
            placeholder="รายละเอียด"
            className="min-h-[120px] rounded-2xl border border-slate-200 px-4 py-3 font-bold outline-none focus:border-blue-400 disabled:bg-slate-50"
          />
          {!readonly && (
            <div className="flex flex-wrap gap-2">
              {EVENT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setForm({ ...form, color })}
                  className={`h-9 w-9 rounded-full border-4 ${form.color === color ? 'border-slate-900' : 'border-white'} shadow`}
                  style={{ backgroundColor: color }}
                  aria-label={`เลือกสี ${color}`}
                />
              ))}
            </div>
          )}
          {event?.location && readonly && <p className="flex items-center gap-2 text-sm font-bold text-slate-500"><MapPin size={16} /> {event.location}</p>}
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-between">
          <div>
            {event?.can_edit && (
              <button onClick={onDelete} disabled={isSaving} className="inline-flex items-center gap-2 rounded-2xl bg-red-50 px-5 py-3 text-sm font-black text-red-600 hover:bg-red-100 disabled:opacity-60">
                <Trash2 size={17} /> ลบกิจกรรม
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="rounded-2xl bg-slate-100 px-5 py-3 text-sm font-black text-slate-600 hover:bg-slate-200">ปิด</button>
            {!readonly && (
              <button onClick={onSave} disabled={isSaving} className="rounded-2xl bg-blue-600 px-6 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-60">
                {isSaving ? 'กำลังบันทึก...' : 'บันทึกกิจกรรม'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
