import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, CalendarCheck, Clock, Filter, GraduationCap, MapPin, MonitorPlay, Search, Users, Video } from 'lucide-react';
import Header from '../Header';
import LeftSide from '../LeftSide';
import Footer from '../Footer';
import { API_BASE } from '../lib/apiConfig';
import { getTrainingImageUrl } from './driveMedia';

type Course = {
  course_id: number;
  title: string;
  category: string;
  course_type: 'online' | 'zoom' | 'onsite';
  status: 'draft' | 'open' | 'closed';
  thumbnail_url?: string;
  instructor?: string;
  target_group?: string;
  duration_minutes?: number;
  training_start_date?: string | null;
  training_end_date?: string | null;
  enrolled_count?: number;
  lesson_count?: number;
  material_count?: number;
  enrollment_id?: number | null;
  enrollment_status?: string | null;
  post_score?: number | null;
  pass_score?: number | null;
};

const typeLabels: Record<Course['course_type'], string> = {
  online: 'อบรมผ่านสื่ออิเล็กทรอนิกส์ (Online Training)',
  zoom: 'อบรมผ่านระบบ Zoom Meeting',
  onsite: 'อบรม ณ สถานที่จัดอบรม (On-site Training)',
};

const typeIcons = {
  online: MonitorPlay,
  zoom: Video,
  onsite: MapPin,
};

function formatMinutes(totalMinutes?: number) {
  const value = Math.max(0, Number(totalMinutes || 0));
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${hours} ชม. ${minutes} นาที`;
}

const thaiDateFormatter = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
  day: 'numeric',
  month: 'short',
  year: '2-digit',
});

function isScheduledTraining(course: Pick<Course, 'course_type'>) {
  return course.course_type === 'zoom' || course.course_type === 'onsite';
}

function parseDateOnly(value?: string | null) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatThaiTrainingDate(value?: string | null) {
  const parsed = parseDateOnly(value);
  return parsed ? thaiDateFormatter.format(parsed) : '';
}

function formatTrainingDateRange(course: Pick<Course, 'course_type' | 'training_start_date' | 'training_end_date'>) {
  if (!isScheduledTraining(course)) return '';
  const start = formatThaiTrainingDate(course.training_start_date);
  const end = formatThaiTrainingDate(course.training_end_date);
  if (!start && !end) return 'ยังไม่ระบุวันที่อบรม';
  if (start && (!end || start === end)) return start;
  if (!start) return end;
  return `${start} - ${end}`;
}

function enrollmentBadgeLabel(course: Course) {
  if (!course.enrollment_id) return '';
  if (course.enrollment_status === 'completed') {
    if (course.post_score === null || course.post_score === undefined) return 'สำเร็จการอบรม';
    const passed = Number(course.post_score) >= Number(course.pass_score || 70);
    return `สำเร็จการอบรม · ${passed ? 'ผ่าน' : 'ไม่ผ่าน'}`;
  }
  if (course.enrollment_status === 'in_progress') return 'กำลังอบรม';
  return 'ลงทะเบียนแล้ว';
}

function fallbackThumbnail(course: Course) {
  const bg = course.course_type === 'online'
    ? 'from-blue-600 to-cyan-500'
    : course.course_type === 'zoom'
      ? 'from-purple-600 to-indigo-500'
      : 'from-orange-500 to-rose-500';

  return (
    <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${bg} text-white`}>
      <GraduationCap size={54} strokeWidth={1.7} />
    </div>
  );
}

export default function TrainingCourses() {
  const [userData, setUserData] = useState<any>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | Course['course_type']>('all');

  const loadCourses = useCallback(async (userId?: number) => {
    setIsLoading(true);
    try {
      const query = userId ? `?user_id=${userId}` : '';
      const res = await fetch(`${API_BASE}/api/training/courses${query}`);
      if (!res.ok) throw new Error('Cannot load training courses');
      setCourses(await res.json());
    } catch (error) {
      console.error(error);
      setCourses([]);
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
    void loadCourses(parsedUser?.user_id);
    return () => window.removeEventListener('resize', handleResize);
  }, [loadCourses]);

  const filteredCourses = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return courses.filter((course) => {
      const matchesType = typeFilter === 'all' || course.course_type === typeFilter;
      const haystack = `${course.title} ${course.category} ${course.instructor} ${course.target_group}`.toLowerCase();
      return matchesType && (!needle || haystack.includes(needle));
    });
  }, [courses, search, typeFilter]);

  const handleLogout = () => {
    localStorage.removeItem('user');
    window.location.href = '/';
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadCourses(userData?.user_id).finally(() => setIsRefreshing(false));
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8fafc] text-slate-900">
      <LeftSide userData={userData} isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} handleLogout={handleLogout} />

      <main className="z-10 flex h-full flex-1 flex-col overflow-y-auto">
        <Header setIsSidebarOpen={setIsSidebarOpen} handleRefresh={handleRefresh} isRefreshing={isRefreshing} handleLogout={handleLogout} />

        <div className="mx-auto flex w-full max-w-[1500px] flex-1 flex-col gap-8 px-4 py-8 sm:px-8 lg:px-10">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                <BookOpen size={14} /> ระบบอบรม สตท.8
              </p>
              <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">หลักสูตรการอบรมทั้งหมด</h1>
              <p className="mt-2 text-sm font-medium text-slate-500">เลือกหลักสูตร ลงทะเบียน และเข้าเรียนได้จากหน้านี้</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_auto] lg:min-w-[560px]">
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <Search size={19} className="text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="ค้นหาชื่อหลักสูตร วิทยากร หรือกลุ่มเป้าหมาย..."
                  className="w-full bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400"
                />
              </div>
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <Filter size={18} className="text-blue-600" />
                <select
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}
                  className="bg-transparent text-sm font-bold outline-none"
                >
                  <option value="all">ทุกประเภท</option>
                  <option value="onsite">{typeLabels.onsite}</option>
                  <option value="zoom">{typeLabels.zoom}</option>
                  <option value="online">{typeLabels.online}</option>
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-[360px] animate-pulse rounded-3xl border border-slate-100 bg-white shadow-sm" />
              ))
            ) : filteredCourses.length === 0 ? (
              <div className="col-span-full rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center">
                <BookOpen className="mx-auto mb-3 text-slate-300" size={42} />
                <p className="font-bold text-slate-600">ไม่พบหลักสูตรตามเงื่อนไขที่ค้นหา</p>
              </div>
            ) : (
              filteredCourses.map((course) => {
                const TypeIcon = typeIcons[course.course_type];
                const isRegistered = Boolean(course.enrollment_id);
                const badgeLabel = enrollmentBadgeLabel(course);
                return (
                  <a
                    key={course.course_id}
                    href={`/training-courses/${course.course_id}`}
                    className="group overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.08)] transition hover:-translate-y-1 hover:shadow-[0_24px_60px_rgba(37,99,235,0.18)]"
                  >
                    <div className="relative aspect-[16/9] overflow-hidden bg-slate-100">
                      {course.thumbnail_url ? (
                        <img src={getTrainingImageUrl(course.thumbnail_url)} alt={course.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                      ) : fallbackThumbnail(course)}
                      <div className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-black text-slate-700 shadow">
                        {course.category || 'หลักสูตร'}
                      </div>
                      {isRegistered && (
                        <div className="absolute right-4 top-4 rounded-full bg-emerald-500 px-3 py-1 text-xs font-black text-white shadow">
                          {badgeLabel}
                        </div>
                      )}
                    </div>
                    <div className="flex min-h-[220px] flex-col gap-4 p-5">
                      <div>
                        <div className="mb-2 flex items-center gap-2 text-xs font-bold text-blue-600">
                          <TypeIcon size={15} /> {typeLabels[course.course_type]}
                        </div>
                        <h2 className="line-clamp-2 text-lg font-black leading-snug text-slate-900">{course.title}</h2>
                      </div>
                      <div className="space-y-2 text-sm font-semibold text-slate-500">
                        <div className="flex items-center gap-2"><Users size={15} /> {course.instructor || 'ยังไม่ระบุวิทยากร'}</div>
                        <div className="flex items-center gap-2">
                          {isScheduledTraining(course) ? (
                            <>
                              <CalendarCheck size={15} /> {formatTrainingDateRange(course)}
                            </>
                          ) : (
                            <>
                              <Clock size={15} /> {formatMinutes(course.duration_minutes)}
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-2"><CalendarCheck size={15} /> ผู้ลงทะเบียน {course.enrolled_count || 0} คน</div>
                      </div>
                      <div className="mt-auto rounded-2xl bg-slate-50 px-4 py-3 text-center text-sm font-black text-blue-700 transition group-hover:bg-blue-600 group-hover:text-white">
                        {isRegistered ? 'เข้าอบรม / ดูรายละเอียด' : 'ดูรายละเอียดและลงทะเบียน'}
                      </div>
                    </div>
                  </a>
                );
              })
            )}
          </div>
        </div>

        <Footer />
      </main>
    </div>
  );
}
