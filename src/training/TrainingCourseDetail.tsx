import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Award, CalendarCheck, CheckCircle2, Clock, ExternalLink, FileText, GraduationCap, PlayCircle, Send, Star, Users, Video } from 'lucide-react';
import Header from '../Header';
import LeftSide from '../LeftSide';
import Footer from '../Footer';
import { API_BASE } from '../lib/apiConfig';
import { getTrainingFileUrl, getTrainingImageUrl } from './driveMedia';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

type Course = {
  course_id: number;
  title: string;
  category: string;
  course_type: 'online' | 'zoom' | 'onsite';
  thumbnail_url?: string;
  instructor?: string;
  target_group?: string;
  learning_objectives?: string;
  learning_topics?: string;
  content_summary?: string;
  evaluation_method?: string;
  description?: string;
  duration_minutes?: number;
  zoom_url?: string;
  location?: string;
  pass_score?: number;
};

type Enrollment = {
  enrollment_id: number;
  status: string;
  pre_score?: number | string | null;
  post_score?: number | string | null;
  attended_seconds?: number;
  attendance_confirmed?: number;
  evaluated?: number;
  certificate_code?: string;
};

type Quiz = { quiz_id: number; quiz_type: 'pre' | 'post'; title: string; pass_score: number; time_limit_minutes?: number };
type QuizSubmitResult = { quizType: Quiz['quiz_type']; score: number; passed?: boolean };
type Question = { question_id: number; question_text: string; choices: { choice_id: number; choice_text: string }[] };
type EvaluationQuestion = {
  question_id: number;
  question_text: string;
  question_type: 'rating' | 'single_choice' | 'multiple_choice' | 'text';
  is_required: number;
  options: { option_id: number; option_text: string }[];
};

const courseTypeLabels: Record<Course['course_type'], string> = {
  online: 'อบรมผ่านสื่ออิเล็กทรอนิกส์ (Online Training)',
  zoom: 'อบรมผ่านระบบ Zoom Meeting',
  onsite: 'อบรม ณ สถานที่จัดอบรม (On-site Training)',
};

function formatSeconds(seconds?: number) {
  const value = Math.max(0, Number(seconds || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  return `${hours} ชม. ${minutes} นาที`;
}

function formatMinutes(totalMinutes?: number) {
  const value = Math.max(0, Number(totalMinutes || 0));
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${hours} ชม. ${minutes} นาที`;
}

function formatCountdown(seconds: number) {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function formatQuizLimit(minutes?: number) {
  const safe = Math.max(0, Number(minutes || 0));
  if (safe <= 0) return 'ไม่จำกัดเวลา';
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  return `${hours} ชม. ${mins} นาที`;
}

function hasScore(score: unknown) {
  return score !== null && score !== undefined && String(score).trim() !== '';
}

function formatScore(score?: number | string | null) {
  if (!hasScore(score)) return '-';
  const value = Number(score);
  if (!Number.isFinite(value)) return '-';
  return `${value.toFixed(2)}%`;
}

function getPassResult(postScore?: number | string | null, passScore?: number) {
  if (!hasScore(postScore)) return null;
  return Number(postScore) >= Number(passScore || 70) ? 'ผ่าน' : 'ไม่ผ่าน';
}

function getEnrollmentStatusLabel(enrollment: Enrollment | null, passScore?: number) {
  if (!enrollment) return 'ยังไม่ได้ลงทะเบียน';
  if (enrollment.status === 'completed') {
    const result = getPassResult(enrollment.post_score, passScore);
    return result ? `สำเร็จการอบรม · ${result}` : 'สำเร็จการอบรม';
  }
  if (enrollment.status === 'registered') return 'ลงทะเบียนแล้ว';
  return 'กำลังอบรม';
}

function InfoBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
      <h3 className="mb-3 text-lg font-black text-slate-900">{title}</h3>
      <div className="whitespace-pre-line text-sm font-medium leading-7 text-slate-600">{children || '-'}</div>
    </section>
  );
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

function getEvaluationProxyUrl(params: { courseId?: number; enrollmentId?: number; mode?: 'questions' | 'submit' }) {
  const search = new URLSearchParams();
  if (params.courseId) search.set('courseId', String(params.courseId));
  if (params.enrollmentId) search.set('enrollmentId', String(params.enrollmentId));
  if (params.mode) search.set('mode', params.mode);
  return `/training-evaluation-proxy?${search.toString()}`;
}

async function fetchJsonWithFallback(primaryUrl: string, fallbackUrl: string, init?: RequestInit) {
  const primaryResponse = await fetch(primaryUrl, init);
  const primaryData = await readJsonResponse(primaryResponse);
  if (primaryResponse.status !== 404) {
    return { response: primaryResponse, data: primaryData };
  }

  const fallbackResponse = await fetch(fallbackUrl, init);
  const fallbackData = await readJsonResponse(fallbackResponse);
  return { response: fallbackResponse, data: fallbackData };
}

export default function TrainingCourseDetail({ courseId }: { courseId: number }) {
  const [userData, setUserData] = useState<any>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [evaluationQuestions, setEvaluationQuestions] = useState<EvaluationQuestion[]>([]);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeLogId, setActiveLogId] = useState<number | null>(null);
  const lastFlushRef = useRef<number | null>(null);

  const loadDetail = useCallback(async (userId?: number) => {
    setIsLoading(true);
    try {
      const query = userId ? `?user_id=${userId}` : '';
      const res = await fetch(`${API_BASE}/api/training/courses/${courseId}${query}`);
      if (!res.ok) throw new Error('Cannot load course');
      const data = await res.json();
      setCourse(data.course);
      setLessons(data.lessons || []);
      setMaterials(data.materials || []);
      setQuizzes(data.quizzes || []);
      setEnrollment(data.enrollment || null);
      const { response: evalResponse, data: evalData } = await fetchJsonWithFallback(
        `${API_BASE}/api/training/courses/${courseId}/evaluation-form`,
        getEvaluationProxyUrl({ courseId }),
      );
      setEvaluationQuestions(evalResponse.ok && Array.isArray(evalData) ? evalData : []);
    } catch (error) {
      console.error(error);
      toast.error('ไม่สามารถโหลดรายละเอียดหลักสูตรได้');
    } finally {
      setIsLoading(false);
    }
  }, [courseId]);

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
    void loadDetail(parsedUser?.user_id);
    return () => window.removeEventListener('resize', handleResize);
  }, [loadDetail]);

  const enrollmentId = enrollment?.enrollment_id;

  const flushTime = useCallback(async () => {
    if (!enrollmentId || !lastFlushRef.current) return;
    const now = Date.now();
    const seconds = Math.floor((now - lastFlushRef.current) / 1000);
    if (seconds <= 0) return;
    lastFlushRef.current = now;
    await fetch(`${API_BASE}/api/training/enrollments/${enrollmentId}/time`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seconds, log_id: activeLogId }),
      keepalive: true,
    }).catch(() => undefined);
  }, [activeLogId, enrollmentId]);

  useEffect(() => {
    if (!activeLogId) return;
    const timer = window.setInterval(() => { void flushTime(); }, 30000);
    const onBeforeUnload = () => { void flushTime(); };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('beforeunload', onBeforeUnload);
      void flushTime();
    };
  }, [activeLogId, flushTime]);

  const preQuiz = useMemo(() => quizzes.find((quiz) => quiz.quiz_type === 'pre'), [quizzes]);
  const postQuiz = useMemo(() => quizzes.find((quiz) => quiz.quiz_type === 'post'), [quizzes]);
  const firstVideo = lessons.find((lesson) => lesson.embed_url);
  const hasPostQuizResult = hasScore(enrollment?.post_score);
  const hasEnteredTraining = Boolean(
    enrollment
    && (
      activeLogId
      || enrollment.status === 'in_progress'
      || enrollment.status === 'completed'
      || Number(enrollment.attended_seconds || 0) > 0
    ),
  );

  const handleLogout = () => {
    localStorage.removeItem('user');
    window.location.href = '/';
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadDetail(userData?.user_id).finally(() => setIsRefreshing(false));
  };

  const handleEnroll = async () => {
    if (!userData?.user_id) return toast.warning('กรุณาเข้าสู่ระบบก่อนลงทะเบียน');
    const res = await fetch(`${API_BASE}/api/training/courses/${courseId}/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userData.user_id }),
    });
    const data = await res.json();
    if (!res.ok) return toast.error(data.error || 'ลงทะเบียนไม่สำเร็จ');
    toast.success(data.message);
    setEnrollment(data.enrollment);
  };

  const handleStart = async () => {
    if (!enrollment?.enrollment_id) return toast.warning('กรุณาลงทะเบียนก่อนเข้าอบรม');
    const res = await fetch(`${API_BASE}/api/training/enrollments/${enrollment.enrollment_id}/start`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) return toast.error(data.error || 'เริ่มเข้าอบรมไม่สำเร็จ');
    setActiveLogId(data.log_id);
    lastFlushRef.current = Date.now();
    setEnrollment((current) => current ? { ...current, status: current.status === 'completed' ? current.status : 'in_progress' } : current);
    toast.success('เริ่มนับเวลาเข้าอบรมแล้ว');
  };

  const handleStop = async () => {
    await flushTime();
    setActiveLogId(null);
    lastFlushRef.current = null;
    await loadDetail(userData?.user_id);
    toast.info('หยุดนับเวลาเข้าอบรมแล้ว');
  };

  const handleQuizSubmitted = useCallback(async (result?: QuizSubmitResult) => {
    if (result) {
      setEnrollment((current) => {
        if (!current) return current;
        return {
          ...current,
          status: result.quizType === 'post' ? 'completed' : current.status,
          pre_score: result.quizType === 'pre' ? result.score : current.pre_score,
          post_score: result.quizType === 'post' ? result.score : current.post_score,
        };
      });
    }
    await loadDetail(userData?.user_id);
  }, [loadDetail, userData?.user_id]);

  const handleEvaluationSubmitted = useCallback(async () => {
    setEnrollment((current) => current ? { ...current, status: 'completed', evaluated: 1 } : current);
    await loadDetail(userData?.user_id);
  }, [loadDetail, userData?.user_id]);

  if (isLoading || !course) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-500">
        <div className="text-center font-bold">กำลังโหลดหลักสูตร...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8fafc] text-slate-900">
      <ToastContainer position="top-right" autoClose={2800} />
      <LeftSide userData={userData} isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} handleLogout={handleLogout} />

      <main className="z-10 flex h-full flex-1 flex-col overflow-y-auto">
        <Header setIsSidebarOpen={setIsSidebarOpen} handleRefresh={handleRefresh} isRefreshing={isRefreshing} handleLogout={handleLogout} />

        <div className="mx-auto flex w-full max-w-[1300px] flex-col gap-6 px-4 py-8 sm:px-8">
          <a href="/training-courses" className="inline-flex w-fit items-center gap-2 text-sm font-bold text-blue-600 hover:underline">
            <ArrowLeft size={16} /> กลับไปหน้าหลักสูตร
          </a>

          <section className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.12)]">
            <div className="relative h-56 bg-slate-200 sm:h-72">
              {course.thumbnail_url ? (
                <img src={getTrainingImageUrl(course.thumbnail_url)} alt={course.title} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-600 to-indigo-600 text-white">
                  <GraduationCap size={80} />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/45 to-transparent" />
            </div>
            <div className="relative -mt-10 mx-4 rounded-3xl bg-white p-5 shadow-xl sm:mx-8 sm:p-7">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="mb-3 flex flex-wrap gap-2">
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{course.category || 'หลักสูตรอบรม'}</span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                      {courseTypeLabels[course.course_type]}
                    </span>
                  </div>
                  <h1 className="text-2xl font-black leading-tight text-slate-900 sm:text-3xl">{course.title}</h1>
                  <p className="mt-3 flex items-center gap-2 text-sm font-bold text-slate-500"><Users size={16} /> วิทยากร: {course.instructor || '-'}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  {!enrollment ? (
                    <button onClick={handleEnroll} className="rounded-2xl bg-red-600 px-6 py-3 text-sm font-black text-white shadow-lg transition hover:bg-red-700">
                      ลงทะเบียน
                    </button>
                  ) : activeLogId ? (
                    <button onClick={handleStop} className="rounded-2xl bg-slate-900 px-6 py-3 text-sm font-black text-white shadow-lg">
                      หยุดนับเวลา
                    </button>
                  ) : (
                    <button onClick={handleStart} className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-6 py-3 text-sm font-black text-white shadow-lg transition hover:bg-blue-700">
                      <PlayCircle size={18} /> เริ่มเข้าอบรม
                    </button>
                  )}
                  {course.course_type === 'zoom' && course.zoom_url && (
                    <a href={course.zoom_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-2xl border border-blue-100 bg-white px-5 py-3 text-sm font-black text-blue-700">
                      เปิด Zoom <ExternalLink size={16} />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
            <div className="flex flex-col gap-5">
              <div className="grid gap-3 sm:grid-cols-4">
                <Stat icon={<Clock />} label="เวลาเรียน" value={formatMinutes(course.duration_minutes)} />
                <Stat icon={<CalendarCheck />} label="เวลาที่เข้าอบรม" value={formatSeconds(enrollment?.attended_seconds)} />
                <Stat icon={<Award />} label="คะแนนก่อนเรียน" value={formatScore(enrollment?.pre_score)} />
                <Stat icon={<CheckCircle2 />} label="คะแนนหลังเรียน" value={hasPostQuizResult ? `${formatScore(enrollment?.post_score)} ${getPassResult(enrollment?.post_score, course.pass_score)}` : '-'} />
              </div>

              {firstVideo && (
                <section className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
                  <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4 text-lg font-black">
                    <Video className="text-blue-600" /> วิดีโอการอบรม
                  </div>
                  <div className="aspect-video bg-black">
                    <iframe title={firstVideo.title} src={firstVideo.embed_url} className="h-full w-full" allowFullScreen />
                  </div>
                </section>
              )}

              <InfoBlock title="เป้าหมายการเรียนรู้">{course.learning_objectives}</InfoBlock>
              <InfoBlock title="ประเด็นการเรียนรู้">{course.learning_topics}</InfoBlock>
              <InfoBlock title="กลุ่มเป้าหมาย">{course.target_group}</InfoBlock>
              {course.location?.trim() && <InfoBlock title="สถานที่จัดอบรม">{course.location}</InfoBlock>}
              <InfoBlock title="เนื้อหาการอบรม">{course.content_summary || course.description}</InfoBlock>
              <InfoBlock title="วิธีการประเมินผล">{course.evaluation_method || `ทำแบบทดสอบหลังเรียนให้ได้ตั้งแต่ ${course.pass_score || 70}% ขึ้นไป`}</InfoBlock>

              {hasEnteredTraining && (
                <>
                  <QuizPanel quiz={preQuiz} title="แบบทดสอบก่อนเรียน" userId={userData?.user_id} attemptedScore={enrollment?.pre_score} onSubmitted={handleQuizSubmitted} disabled={!enrollment} />
                  <QuizPanel quiz={postQuiz} title="แบบทดสอบหลังเรียน" userId={userData?.user_id} attemptedScore={enrollment?.post_score} onSubmitted={handleQuizSubmitted} disabled={!enrollment} />
                  {hasPostQuizResult && enrollment?.status === 'completed' && (
                    <EvaluationPanel enrollment={enrollment} questions={evaluationQuestions} onSubmitted={handleEvaluationSubmitted} />
                  )}
                </>
              )}
            </div>

            <aside className="flex flex-col gap-5">
              {hasEnteredTraining && (
                <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                  <h3 className="mb-4 flex items-center gap-2 text-lg font-black"><FileText className="text-blue-600" /> เอกสารประกอบ</h3>
                  <div className="space-y-3">
                    {materials.length === 0 ? (
                      <p className="text-sm font-semibold text-slate-400">ยังไม่มีเอกสารประกอบ</p>
                    ) : materials.map((material) => (
                      <a key={material.material_id} href={getTrainingFileUrl(material.drive_url)} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 hover:border-blue-200 hover:bg-blue-50">
                        {material.title}
                        <ExternalLink size={15} />
                      </a>
                    ))}
                  </div>
                </section>
              )}
              <section className="rounded-3xl border border-blue-100 bg-blue-50 p-5">
                <h3 className="text-lg font-black text-blue-900">สถานะของคุณ</h3>
                <p className="mt-2 text-sm font-bold text-blue-700">
                  {getEnrollmentStatusLabel(enrollment, course.pass_score)}
                </p>
                {enrollment?.certificate_code && (
                  <p className="mt-3 rounded-2xl bg-white px-4 py-3 text-xs font-black text-slate-700">เลขใบรับรอง: {enrollment.certificate_code}</p>
                )}
              </section>
            </aside>
          </div>
        </div>

        <Footer />
      </main>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-3 text-blue-600">{icon}</div>
      <p className="text-xl font-black text-slate-900">{value}</p>
      <p className="text-xs font-bold text-slate-400">{label}</p>
    </div>
  );
}

function QuizPanel({ quiz, title, userId, attemptedScore, onSubmitted, disabled }: { quiz?: Quiz; title: string; userId?: number; attemptedScore?: number | string | null; onSubmitted: (result?: QuizSubmitResult) => void | Promise<void>; disabled?: boolean }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  const limitSeconds = Math.max(0, Number(quiz?.time_limit_minutes || 0) * 60);
  const isTimed = limitSeconds > 0;
  const isTimeUp = isTimed && isOpen && remainingSeconds <= 0;
  const hasAttempted = hasScore(attemptedScore);

  useEffect(() => {
    if (hasAttempted) {
      setIsOpen(false);
      setStartedAt(null);
    }
  }, [hasAttempted]);

  useEffect(() => {
    if (!isOpen || !startedAt || !isTimed) return;
    const timer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setRemainingSeconds(Math.max(0, limitSeconds - elapsed));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isOpen, isTimed, limitSeconds, startedAt]);

  useEffect(() => {
    if (isTimeUp) toast.warning(`${title} หมดเวลาแล้ว กรุณาส่งคำตอบที่ทำไว้`);
  }, [isTimeUp, title]);

  const loadQuiz = async () => {
    if (!quiz) return;
    if (hasAttempted) {
      toast.info(`${title} ทำแล้ว คะแนน ${formatScore(attemptedScore)}`);
      return;
    }
    setIsOpen(true);
    setAnswers({});
    const now = Date.now();
    setStartedAt(now);
    setRemainingSeconds(limitSeconds);
    if (questions.length > 0) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/training/quizzes/${quiz.quiz_id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'โหลดแบบทดสอบไม่สำเร็จ');
      setQuestions(data.questions || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'โหลดแบบทดสอบไม่สำเร็จ');
    } finally {
      setIsLoading(false);
    }
  };

  const submitQuiz = async () => {
    if (!quiz || !userId) return;
    if (hasAttempted) {
      toast.warning(`${title} ทำได้เพียงครั้งเดียว`);
      return;
    }
    const elapsedSeconds = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
    const res = await fetch(`${API_BASE}/api/training/quizzes/${quiz.quiz_id}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, answers, elapsed_seconds: elapsedSeconds }),
    });
    const data = await res.json();
    if (!res.ok) return toast.error(data.error || 'ส่งแบบทดสอบไม่สำเร็จ');
    const score = Number(data.score);
    toast.success(`${data.message} คะแนน ${formatScore(score)}`);
    setIsOpen(false);
    setStartedAt(null);
    await Promise.resolve(onSubmitted({ quizType: quiz.quiz_type, score, passed: Boolean(data.passed) }));
  };

  return (
    <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-black text-slate-900">{title}</h3>
          <p className="text-sm font-semibold text-slate-500">
            {quiz
              ? hasAttempted
                ? `ทำแล้ว · คะแนนที่ได้ ${formatScore(attemptedScore)}`
                : `เกณฑ์ผ่าน ${quiz.pass_score}% · เวลา ${formatQuizLimit(quiz.time_limit_minutes)} · ทำได้ 1 ครั้ง`
              : 'ยังไม่มีแบบทดสอบ'}
          </p>
        </div>
        <button disabled={!quiz || disabled || hasAttempted} onClick={loadQuiz} className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300">
          {hasAttempted ? 'ทำแบบทดสอบแล้ว' : 'เปิดแบบทดสอบ'}
        </button>
      </div>
      {hasAttempted && (
        <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700">
          คะแนนที่สอบได้ {formatScore(attemptedScore)}
        </div>
      )}
      {isOpen && (
        <div className="mt-5 space-y-4">
          {quiz && (
            <div className={`flex flex-col gap-2 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${isTimeUp ? 'border-red-100 bg-red-50 text-red-700' : 'border-blue-100 bg-blue-50 text-blue-700'}`}>
              <div className="flex items-center gap-2 text-sm font-black">
                <Clock size={16} />
                {isTimed ? 'เวลาคงเหลือในการทำแบบทดสอบ' : 'แบบทดสอบนี้ไม่จำกัดเวลา'}
              </div>
              <div className="text-2xl font-black tabular-nums">{isTimed ? formatCountdown(remainingSeconds) : 'ไม่จำกัดเวลา'}</div>
            </div>
          )}
          {isLoading ? <p className="text-sm font-bold text-slate-400">กำลังโหลด...</p> : questions.map((question, index) => (
            <div key={question.question_id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="mb-3 font-black text-slate-800">{index + 1}. {question.question_text}</p>
              <div className="grid gap-2">
                {question.choices.map((choice) => (
                  <label key={choice.choice_id} className="flex cursor-pointer items-center gap-3 rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-600">
                    <input
                      type="radio"
                      name={`question-${question.question_id}`}
                      checked={answers[String(question.question_id)] === choice.choice_id}
                      onChange={() => setAnswers((current) => ({ ...current, [String(question.question_id)]: choice.choice_id }))}
                      className="h-4 w-4"
                    />
                    {choice.choice_text}
                  </label>
                ))}
              </div>
            </div>
          ))}
          {questions.length > 0 && (
            <button onClick={submitQuiz} className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white">
              <Send size={16} /> {isTimeUp ? 'ส่งคำตอบที่ทำไว้' : 'ส่งคำตอบ'}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function EvaluationPanel({ enrollment, questions, onSubmitted }: { enrollment: Enrollment | null; questions: EvaluationQuestion[]; onSubmitted: () => void | Promise<void> }) {
  const [answers, setAnswers] = useState<Record<string, string | number | number[]>>({});

  useEffect(() => {
    setAnswers({});
  }, [enrollment?.enrollment_id, questions]);

  const updateMultiChoice = (questionId: number, optionId: number, checked: boolean) => {
    setAnswers((current) => {
      const key = String(questionId);
      const values = Array.isArray(current[key]) ? current[key] as number[] : [];
      return {
        ...current,
        [key]: checked ? [...values, optionId] : values.filter((value) => value !== optionId),
      };
    });
  };

  const submitEvaluation = async () => {
    if (!enrollment?.enrollment_id) return;
    const { response, data } = await fetchJsonWithFallback(`${API_BASE}/api/training/enrollments/${enrollment.enrollment_id}/evaluation`, getEvaluationProxyUrl({ enrollmentId: enrollment.enrollment_id, mode: 'submit' }), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers }),
    });
    if (!response.ok) return toast.error(data.error || 'บันทึกแบบประเมินไม่สำเร็จ');
    toast.success(data.message);
    await Promise.resolve(onSubmitted());
  };

  return (
    <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
      <h3 className="mb-3 flex items-center gap-2 text-lg font-black text-slate-900"><Star className="text-amber-500" /> แบบประเมินหลังอบรม</h3>
      {questions.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm font-bold text-slate-400">หลักสูตรนี้ยังไม่มีแบบประเมิน</p>
      ) : (
        <div className="space-y-4">
          {questions.map((question, index) => {
            const key = String(question.question_id);
            return (
              <div key={question.question_id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="mb-3 font-black text-slate-800">
                  {index + 1}. {question.question_text}
                  {question.is_required ? <span className="ml-1 text-red-500">*</span> : null}
                </p>
                {question.question_type === 'rating' && (
                  <select value={String(answers[key] || '')} onChange={(event) => setAnswers((current) => ({ ...current, [key]: Number(event.target.value) }))} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-black outline-none">
                    <option value="">เลือกคะแนน</option>
                    {[5, 4, 3, 2, 1].map((item) => <option key={item} value={item}>{item} คะแนน</option>)}
                  </select>
                )}
                {question.question_type === 'text' && (
                  <textarea value={String(answers[key] || '')} onChange={(event) => setAnswers((current) => ({ ...current, [key]: event.target.value }))} placeholder="พิมพ์คำตอบ..." className="min-h-28 w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-200" />
                )}
                {question.question_type === 'single_choice' && (
                  <div className="grid gap-2">
                    {question.options.map((option) => (
                      <label key={option.option_id} className="flex cursor-pointer items-center gap-3 rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-600">
                        <input type="radio" name={`evaluation-${question.question_id}`} checked={Number(answers[key]) === option.option_id} onChange={() => setAnswers((current) => ({ ...current, [key]: option.option_id }))} />
                        {option.option_text}
                      </label>
                    ))}
                  </div>
                )}
                {question.question_type === 'multiple_choice' && (
                  <div className="grid gap-2">
                    {question.options.map((option) => {
                      const values = Array.isArray(answers[key]) ? answers[key] as number[] : [];
                      return (
                        <label key={option.option_id} className="flex cursor-pointer items-center gap-3 rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-600">
                          <input type="checkbox" checked={values.includes(option.option_id)} onChange={(event) => updateMultiChoice(question.question_id, option.option_id, event.target.checked)} />
                          {option.option_text}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <button disabled={!enrollment || enrollment.status !== 'completed' || Boolean(enrollment.evaluated) || questions.length === 0} onClick={submitEvaluation} className="mt-3 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300">
        {enrollment?.evaluated ? 'ส่งแบบประเมินแล้ว' : 'ส่งแบบประเมิน'}
      </button>
      {enrollment && enrollment.status !== 'completed' && <p className="mt-2 text-xs font-bold text-slate-400">ส่งแบบประเมินได้หลังจบการอบรม</p>}
    </section>
  );
}
