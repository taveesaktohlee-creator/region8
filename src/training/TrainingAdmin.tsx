import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, BookOpen, CheckCircle2, FilePlus2, Plus, RefreshCw, Save, Search, Trash2 } from 'lucide-react';
import Header from '../Header';
import LeftSide from '../LeftSide';
import Footer from '../Footer';
import { API_BASE } from '../lib/apiConfig';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

type Course = {
  course_id?: number;
  title: string;
  category: string;
  course_type: 'online' | 'zoom' | 'onsite';
  status: 'draft' | 'open' | 'closed';
  thumbnail_url: string;
  instructor: string;
  target_group: string;
  learning_objectives: string;
  learning_topics: string;
  content_summary: string;
  evaluation_method: string;
  description: string;
  duration_minutes: number;
  zoom_url: string;
  location: string;
  pass_score: number;
  certificate_enabled: boolean;
  enrolled_count?: number;
};

const emptyCourse: Course = {
  title: '',
  category: '',
  course_type: 'online',
  status: 'open',
  thumbnail_url: '',
  instructor: '',
  target_group: '',
  learning_objectives: '',
  learning_topics: '',
  content_summary: '',
  evaluation_method: '',
  description: '',
  duration_minutes: 60,
  zoom_url: '',
  location: '',
  pass_score: 70,
  certificate_enabled: true,
};

export default function TrainingAdmin() {
  const [userData, setUserData] = useState<any>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [form, setForm] = useState<Course>(emptyCourse);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [lessonForm, setLessonForm] = useState({ title: '', youtube_url: '', content: '', duration_seconds: 0 });
  const [materialForm, setMaterialForm] = useState({ title: '', drive_url: '' });
  const [questionForm, setQuestionForm] = useState({ quiz_type: 'post', question_text: '', choices: ['', '', '', ''], correct_index: 0 });
  const [report, setReport] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  const loadCourses = useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/admin/training/courses`);
    if (!res.ok) throw new Error('Cannot load courses');
    setCourses(await res.json());
  }, []);

  const loadReport = useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/admin/training/report`);
    if (!res.ok) throw new Error('Cannot load report');
    setReport(await res.json());
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadCourses(), loadReport()]);
  }, [loadCourses, loadReport]);

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser && savedUser !== 'undefined') {
      try { setUserData(JSON.parse(savedUser)); } catch { localStorage.removeItem('user'); }
    }
    const handleResize = () => setIsSidebarOpen(window.innerWidth >= 1024);
    handleResize();
    window.addEventListener('resize', handleResize);
    refreshAll().catch(() => toast.error('โหลดข้อมูลระบบอบรมไม่สำเร็จ'));
    return () => window.removeEventListener('resize', handleResize);
  }, [refreshAll]);

  const filteredCourses = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return courses;
    return courses.filter((course) => `${course.title} ${course.category} ${course.instructor}`.toLowerCase().includes(needle));
  }, [courses, search]);

  const handleLogout = () => {
    localStorage.removeItem('user');
    window.location.href = '/';
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    refreshAll().finally(() => setIsRefreshing(false));
  };

  const selectCourse = (course: Course) => {
    setSelectedCourseId(course.course_id || null);
    setForm({ ...emptyCourse, ...course, certificate_enabled: Boolean(course.certificate_enabled) });
  };

  const resetForm = () => {
    setSelectedCourseId(null);
    setForm(emptyCourse);
  };

  const saveCourse = async () => {
    const url = selectedCourseId
      ? `${API_BASE}/api/admin/training/courses/${selectedCourseId}`
      : `${API_BASE}/api/admin/training/courses`;
    const res = await fetch(url, {
      method: selectedCourseId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) return toast.error(data.error || 'บันทึกหลักสูตรไม่สำเร็จ');
    toast.success(data.message);
    resetForm();
    await loadCourses();
  };

  const deleteCourse = async (courseId?: number) => {
    if (!courseId || !window.confirm('ต้องการลบหลักสูตรนี้หรือไม่')) return;
    const res = await fetch(`${API_BASE}/api/admin/training/courses/${courseId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) return toast.error(data.error || 'ลบหลักสูตรไม่สำเร็จ');
    toast.success(data.message);
    await refreshAll();
  };

  const addLesson = async () => {
    if (!selectedCourseId) return toast.warning('กรุณาเลือกหลักสูตรก่อนเพิ่มบทเรียน');
    const res = await fetch(`${API_BASE}/api/admin/training/courses/${selectedCourseId}/lessons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lessonForm),
    });
    const data = await res.json();
    if (!res.ok) return toast.error(data.error || 'เพิ่มบทเรียนไม่สำเร็จ');
    toast.success(data.message);
    setLessonForm({ title: '', youtube_url: '', content: '', duration_seconds: 0 });
  };

  const addMaterial = async () => {
    if (!selectedCourseId) return toast.warning('กรุณาเลือกหลักสูตรก่อนเพิ่มเอกสาร');
    const res = await fetch(`${API_BASE}/api/admin/training/courses/${selectedCourseId}/materials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(materialForm),
    });
    const data = await res.json();
    if (!res.ok) return toast.error(data.error || 'เพิ่มเอกสารไม่สำเร็จ');
    toast.success(data.message);
    setMaterialForm({ title: '', drive_url: '' });
  };

  const addQuestion = async () => {
    if (!selectedCourseId) return toast.warning('กรุณาเลือกหลักสูตรก่อนเพิ่มข้อสอบ');
    const res = await fetch(`${API_BASE}/api/admin/training/courses/${selectedCourseId}/questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(questionForm),
    });
    const data = await res.json();
    if (!res.ok) return toast.error(data.error || 'เพิ่มข้อสอบไม่สำเร็จ');
    toast.success(data.message);
    setQuestionForm({ quiz_type: 'post', question_text: '', choices: ['', '', '', ''], correct_index: 0 });
  };

  const confirmAttendance = async (enrollmentId: number, confirmed: boolean) => {
    const res = await fetch(`${API_BASE}/api/admin/training/enrollments/${enrollmentId}/confirm`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmed }),
    });
    const data = await res.json();
    if (!res.ok) return toast.error(data.error || 'อัปเดตสถานะไม่สำเร็จ');
    toast.success(data.message);
    await loadReport();
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8fafc] text-slate-900">
      <ToastContainer position="top-right" autoClose={2800} />
      <LeftSide userData={userData} isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} handleLogout={handleLogout} />

      <main className="z-10 flex h-full flex-1 flex-col overflow-y-auto">
        <Header setIsSidebarOpen={setIsSidebarOpen} handleRefresh={handleRefresh} isRefreshing={isRefreshing} handleLogout={handleLogout} />

        <div className="mx-auto grid w-full max-w-[1500px] gap-6 px-4 py-8 sm:px-8 xl:grid-cols-[420px_1fr]">
          <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h1 className="text-xl font-black text-slate-900">จัดการหลักสูตร</h1>
                <p className="text-sm font-semibold text-slate-500">เพิ่ม/แก้ไขหลักสูตรอบรม</p>
              </div>
              <button onClick={resetForm} className="rounded-2xl bg-blue-600 p-3 text-white"><Plus size={18} /></button>
            </div>
            <CourseForm form={form} setForm={setForm} onSave={saveCourse} selectedCourseId={selectedCourseId} />
          </section>

          <div className="flex flex-col gap-6">
            <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="flex items-center gap-2 text-lg font-black"><BookOpen className="text-blue-600" /> รายการหลักสูตร</h2>
                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2">
                  <Search size={16} className="text-slate-400" />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาหลักสูตร..." className="bg-transparent text-sm font-semibold outline-none" />
                </div>
              </div>
              <div className="grid gap-3">
                {filteredCourses.map((course) => (
                  <div key={course.course_id} className={`grid gap-3 rounded-2xl border p-4 transition sm:grid-cols-[1fr_auto] ${selectedCourseId === course.course_id ? 'border-blue-200 bg-blue-50' : 'border-slate-100 bg-slate-50'}`}>
                    <button onClick={() => selectCourse(course)} className="text-left">
                      <p className="font-black text-slate-900">{course.title}</p>
                      <p className="mt-1 text-xs font-bold text-slate-500">{course.category || '-'} · {course.course_type} · ผู้ลงทะเบียน {course.enrolled_count || 0} คน</p>
                    </button>
                    <button onClick={() => deleteCourse(course.course_id)} className="rounded-xl bg-red-50 p-3 text-red-600"><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>
            </section>

            <section className="grid gap-5 lg:grid-cols-3">
              <QuickPanel title="เพิ่มบทเรียน YouTube" icon={<FilePlus2 />} onSubmit={addLesson}>
                <Input value={lessonForm.title} onChange={(v) => setLessonForm({ ...lessonForm, title: v })} placeholder="ชื่อบทเรียน" />
                <Input value={lessonForm.youtube_url} onChange={(v) => setLessonForm({ ...lessonForm, youtube_url: v })} placeholder="YouTube URL" />
                <Input value={String(lessonForm.duration_seconds || '')} onChange={(v) => setLessonForm({ ...lessonForm, duration_seconds: Number(v) || 0 })} placeholder="เวลาเรียน (วินาที)" />
              </QuickPanel>
              <QuickPanel title="เพิ่มเอกสาร Drive" icon={<FilePlus2 />} onSubmit={addMaterial}>
                <Input value={materialForm.title} onChange={(v) => setMaterialForm({ ...materialForm, title: v })} placeholder="ชื่อเอกสาร" />
                <Input value={materialForm.drive_url} onChange={(v) => setMaterialForm({ ...materialForm, drive_url: v })} placeholder="Google Drive URL" />
              </QuickPanel>
              <QuickPanel title="เพิ่มข้อสอบ" icon={<FilePlus2 />} onSubmit={addQuestion}>
                <select value={questionForm.quiz_type} onChange={(e) => setQuestionForm({ ...questionForm, quiz_type: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none">
                  <option value="pre">ก่อนเรียน</option>
                  <option value="post">หลังเรียน</option>
                </select>
                <Input value={questionForm.question_text} onChange={(v) => setQuestionForm({ ...questionForm, question_text: v })} placeholder="คำถาม" />
                {questionForm.choices.map((choice, index) => (
                  <div key={index} className="flex gap-2">
                    <input type="radio" checked={questionForm.correct_index === index} onChange={() => setQuestionForm({ ...questionForm, correct_index: index })} />
                    <Input value={choice} onChange={(v) => {
                      const next = [...questionForm.choices];
                      next[index] = v;
                      setQuestionForm({ ...questionForm, choices: next });
                    }} placeholder={`ตัวเลือก ${index + 1}`} />
                  </div>
                ))}
              </QuickPanel>
            </section>

            <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-lg font-black"><BarChart3 className="text-blue-600" /> รายงานผู้ลงทะเบียน</h2>
                <button onClick={() => loadReport()} className="rounded-xl bg-slate-100 p-2 text-slate-600"><RefreshCw size={16} /></button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-black text-slate-500">
                    <tr>
                      <th className="px-4 py-3">ผู้เข้าอบรม</th>
                      <th className="px-4 py-3">หลักสูตร</th>
                      <th className="px-4 py-3">เวลา</th>
                      <th className="px-4 py-3">ก่อน/หลัง</th>
                      <th className="px-4 py-3">สถานะ</th>
                      <th className="px-4 py-3">ยืนยัน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.map((row) => (
                      <tr key={row.enrollment_id} className="border-b border-slate-100">
                        <td className="px-4 py-3 font-bold text-slate-800">{row.Name_Surname}<p className="text-xs text-slate-400">{row.position}</p></td>
                        <td className="px-4 py-3 font-semibold text-slate-600">{row.title}</td>
                        <td className="px-4 py-3 font-bold">{Math.floor((row.attended_seconds || 0) / 60)} นาที</td>
                        <td className="px-4 py-3 font-bold">{row.pre_score ?? '-'} / {row.post_score ?? '-'}</td>
                        <td className="px-4 py-3 font-bold">{row.status}</td>
                        <td className="px-4 py-3">
                          <button onClick={() => confirmAttendance(row.enrollment_id, !row.attendance_confirmed)} className={`rounded-xl px-3 py-2 text-xs font-black ${row.attendance_confirmed ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                            {row.attendance_confirmed ? 'ยืนยันแล้ว' : 'ยืนยันเข้าอบรม'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>

        <Footer />
      </main>
    </div>
  );
}

function CourseForm({ form, setForm, onSave, selectedCourseId }: { form: Course; setForm: (form: Course) => void; onSave: () => void; selectedCourseId: number | null }) {
  const update = (key: keyof Course, value: any) => setForm({ ...form, [key]: value });
  return (
    <div className="grid gap-3">
      <Input value={form.title} onChange={(v) => update('title', v)} placeholder="ชื่อหลักสูตร" />
      <div className="grid grid-cols-2 gap-3">
        <Input value={form.category} onChange={(v) => update('category', v)} placeholder="หมวดหมู่" />
        <Input value={String(form.duration_minutes)} onChange={(v) => update('duration_minutes', Number(v) || 0)} placeholder="เวลาเรียน (นาที)" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <select value={form.course_type} onChange={(e) => update('course_type', e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none">
          <option value="online">อบรมออนไลน์</option>
          <option value="zoom">อบรมผ่าน Zoom</option>
          <option value="onsite">อบรมในห้อง</option>
        </select>
        <select value={form.status} onChange={(e) => update('status', e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none">
          <option value="open">เปิดรับสมัคร</option>
          <option value="draft">ร่าง</option>
          <option value="closed">ปิดรับสมัคร</option>
        </select>
      </div>
      <Input value={form.thumbnail_url} onChange={(v) => update('thumbnail_url', v)} placeholder="URL รูปปก" />
      <Input value={form.instructor} onChange={(v) => update('instructor', v)} placeholder="วิทยากร" />
      <Input value={form.zoom_url} onChange={(v) => update('zoom_url', v)} placeholder="Zoom URL (ถ้ามี)" />
      <Input value={form.location} onChange={(v) => update('location', v)} placeholder="สถานที่อบรม (ถ้ามี)" />
      <Textarea value={form.learning_objectives} onChange={(v) => update('learning_objectives', v)} placeholder="เป้าหมายการเรียนรู้" />
      <Textarea value={form.learning_topics} onChange={(v) => update('learning_topics', v)} placeholder="ประเด็นการเรียนรู้" />
      <Textarea value={form.target_group} onChange={(v) => update('target_group', v)} placeholder="กลุ่มเป้าหมาย" />
      <Textarea value={form.content_summary} onChange={(v) => update('content_summary', v)} placeholder="เนื้อหาการอบรม" />
      <Textarea value={form.evaluation_method} onChange={(v) => update('evaluation_method', v)} placeholder="วิธีการประเมินผล" />
      <button onClick={onSave} className="mt-2 inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white">
        <Save size={16} /> {selectedCourseId ? 'บันทึกการแก้ไข' : 'เพิ่มหลักสูตร'}
      </button>
    </div>
  );
}

function QuickPanel({ title, icon, children, onSubmit }: { title: string; icon: React.ReactNode; children: React.ReactNode; onSubmit: () => void }) {
  return (
    <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
      <h3 className="mb-3 flex items-center gap-2 text-base font-black text-slate-900">{icon} {title}</h3>
      <div className="grid gap-3">{children}</div>
      <button onClick={onSubmit} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white">
        <CheckCircle2 size={16} /> เพิ่มข้อมูล
      </button>
    </section>
  );
}

function Input({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-200" />;
}

function Textarea({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-200" />;
}
