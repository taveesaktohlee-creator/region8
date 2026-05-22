import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, BookOpen, CheckCircle2, Clock, Eye, FilePlus2, ImagePlus, Plus, RefreshCw, Save, Search, Star, Trash2, UploadCloud, X } from 'lucide-react';
import Header from '../Header';
import LeftSide from '../LeftSide';
import Footer from '../Footer';
import { API_BASE } from '../lib/apiConfig';
import { getDriveFileIdFromUrl, getTrainingFileUrl, getTrainingImageUrl } from './driveMedia';
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

type TrainingMaterial = {
  material_id: number;
  title: string;
  drive_url: string;
};

type AdminTab = 'report' | 'courses';

type QuizType = 'pre' | 'post';

type AdminQuiz = {
  quiz_id: number;
  quiz_type: QuizType;
  title: string;
  pass_score: number;
  time_limit_minutes: number;
  questions: {
    question_id: number;
    question_text: string;
    choices: { choice_id: number; choice_text: string; is_correct: number }[];
  }[];
};

type EvaluationQuestionType = 'rating' | 'single_choice' | 'multiple_choice' | 'text';

type AdminEvaluationQuestion = {
  question_id: number;
  question_text: string;
  question_type: EvaluationQuestionType;
  is_required: number;
  sort_order: number;
  options: { option_id: number; option_text: string }[];
};

type EvaluationReport = {
  response_count: number;
  questions: Array<AdminEvaluationQuestion & {
    total_answers?: number;
    average_rating?: number | null;
    option_counts?: Record<string, number>;
    text_answers?: string[];
  }>;
};

type EvaluationFormState = {
  question_text: string;
  question_type: EvaluationQuestionType;
  options: string[];
  is_required: boolean;
  sort_order: number;
};

const courseTypeLabels: Record<Course['course_type'], string> = {
  onsite: 'อบรม ณ สถานที่จัดอบรม (On-site Training)',
  zoom: 'อบรมผ่านระบบ Zoom Meeting',
  online: 'อบรมผ่านสื่ออิเล็กทรอนิกส์ (Online Training)',
};

const courseStatusLabels: Record<Course['status'], string> = {
  open: 'ลงทะเบียน',
  closed: 'ปิดลงทะเบียน',
  draft: 'ฉบับร่าง',
};

const evaluationTypeLabels: Record<EvaluationQuestionType, string> = {
  rating: 'ให้คะแนน 1-5',
  single_choice: 'เลือกตอบ 1 ข้อ',
  multiple_choice: 'เลือกได้หลายข้อ',
  text: 'พิมพ์ข้อความ',
};

const COURSE_COVER_MAX_BYTES = 1024 * 1024;
const COURSE_COVER_MAX_ORIGINAL_BYTES = 30 * 1024 * 1024;
const COURSE_COVER_DIMENSIONS = [1600, 1400, 1200, 1000, 800];
const COURSE_COVER_QUALITIES = [0.86, 0.78, 0.7, 0.62, 0.54, 0.46];
const COURSE_COVER_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/avif,image/bmp,image/svg+xml,image/tiff,.jpg,.jpeg,.png,.webp,.gif,.avif,.bmp,.svg,.tif,.tiff';
const TRAINING_MATERIAL_MAX_BYTES = 18 * 1024 * 1024;

const defaultQuizSettings = {
  pre: { hours: 0, minutes: 30, pass_score: 70 },
  post: { hours: 0, minutes: 30, pass_score: 70 },
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

function formatFileSize(bytes: number) {
  if (!bytes) return '0 KB';
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function readBlobAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBase64(dataUrl: string) {
  return dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
}

function parseJsonish(value: any): any {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function collectDriveUploadCandidates(value: any, output: string[] = [], depth = 0) {
  if (value == null || depth > 4) return output;
  const parsed = parseJsonish(value);

  if (typeof parsed === 'string') {
    if (parsed.trim()) output.push(parsed.trim());
    return output;
  }

  if (Array.isArray(parsed)) {
    parsed.forEach(item => collectDriveUploadCandidates(item, output, depth + 1));
    return output;
  }

  if (typeof parsed === 'object') {
    [
      'fileProxyPath',
      'fileId',
      'file_id',
      'id',
      'url',
      'driveUrl',
      'drive_url',
      'webViewLink',
      'web_view_link',
      'webContentLink',
      'downloadUrl',
      'thumbnailUrl',
    ].forEach((key) => collectDriveUploadCandidates(parsed[key], output, depth + 1));

    ['data', 'file', 'result', 'payload', 'response'].forEach((key) => {
      collectDriveUploadCandidates(parsed[key], output, depth + 1);
    });
  }

  return output;
}

function resolveDriveUploadResult(data: any) {
  const candidates = collectDriveUploadCandidates(data);
  const fileId = candidates.map(getDriveFileIdFromUrl).find(Boolean) || '';
  const proxyPath = candidates.find(value => value.startsWith('/api/google-drive/files/')) || (fileId ? `/api/google-drive/files/${encodeURIComponent(fileId)}` : '');
  const directUrl = candidates.find(value => /^https?:\/\//i.test(value)) || '';
  const url = directUrl || proxyPath;

  return { fileId, url };
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

async function uploadTrainingDriveFile(params: {
  kind: 'cover' | 'material';
  courseTitle: string;
  fileName: string;
  mimeType: string;
  base64: string;
}) {
  const endpoint = params.kind === 'cover' ? 'cover-drive' : 'material-drive';
  const uploadLabel = params.kind === 'cover' ? 'รูปปก' : 'เอกสาร';
  const primaryResponse = await fetch(`${API_BASE}/api/admin/training/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      course_title: params.courseTitle || 'training-course',
      file_name: params.fileName,
      mime_type: params.mimeType,
      base64: params.base64,
    }),
  });
  const primaryData = await readJsonResponse(primaryResponse);
  const primaryUpload = primaryResponse.ok && primaryData?.ok !== false
    ? resolveDriveUploadResult(primaryData)
    : { fileId: '', url: '' };

  if (primaryUpload.url) return primaryUpload;

  const shouldFallback = primaryResponse.ok && primaryData?.ok !== false;
  if (!shouldFallback) {
    throw new Error(primaryData?.error || `อัปโหลด${uploadLabel}ไป Google Drive ไม่สำเร็จ`);
  }

  const fallbackResponse = await fetch('/drive-upload-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      row: {
        action: 'uploadAvatar',
        userId: `training-${params.kind}`,
        displayName: params.courseTitle || 'training-course',
        fileName: `${Date.now()}-course-${params.kind}-${params.fileName}`,
        mimeType: params.mimeType || 'application/octet-stream',
        base64: params.base64,
      },
    }),
  });
  const fallbackData = await readJsonResponse(fallbackResponse);
  if (!fallbackResponse.ok || fallbackData?.ok === false) {
    throw new Error(fallbackData?.error || `อัปโหลด${uploadLabel}ไป Google Drive ไม่สำเร็จ`);
  }

  const fallbackUpload = resolveDriveUploadResult(fallbackData);
  if (!fallbackUpload.url) {
    throw new Error(`Google Drive ไม่ส่ง URL ${uploadLabel}กลับมา`);
  }

  return fallbackUpload;
}

function getEvaluationProxyUrl(params: { courseId?: number; questionId?: number; mode?: 'questions' | 'report' }) {
  const search = new URLSearchParams();
  if (params.courseId) search.set('courseId', String(params.courseId));
  if (params.questionId) search.set('questionId', String(params.questionId));
  if (params.mode) search.set('mode', params.mode);
  return `/training-evaluation-proxy?${search.toString()}`;
}

function getLocalEvaluationStorageKey(courseId: number) {
  return `training-evaluation-questions:${courseId}`;
}

function loadLocalEvaluationQuestions(courseId: number): AdminEvaluationQuestion[] {
  try {
    const raw = localStorage.getItem(getLocalEvaluationStorageKey(courseId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalEvaluationQuestions(courseId: number, questions: AdminEvaluationQuestion[]) {
  localStorage.setItem(getLocalEvaluationStorageKey(courseId), JSON.stringify(questions));
}

function getLocalEvaluationReport(courseId: number): EvaluationReport {
  return {
    response_count: 0,
    questions: loadLocalEvaluationQuestions(courseId).map((question) => ({
      ...question,
      total_answers: 0,
      average_rating: null,
      option_counts: {},
      text_answers: [],
    })),
  };
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

function splitMinutes(totalMinutes?: number) {
  const safe = Math.max(0, Number(totalMinutes || 0));
  return { hours: Math.floor(safe / 60), minutes: safe % 60 };
}

function formatQuizLimit(minutes?: number) {
  const safe = Math.max(0, Number(minutes || 0));
  if (safe <= 0) return 'ไม่จำกัดเวลา';
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  return `${hours} ชม. ${mins} นาที`;
}

function formatSecondsAsHoursMinutes(seconds?: number) {
  const safe = Math.max(0, Number(seconds || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  return `${hours} ชม. ${minutes} นาที`;
}

function enrollmentStatusMeta(status?: string) {
  if (status === 'completed') return { label: 'สำเร็จการอบรม', className: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
  if (status === 'in_progress') return { label: 'กำลังอบรม', className: 'bg-blue-50 text-blue-700 border-blue-100' };
  if (status === 'registered') return { label: 'ลงทะเบียนแล้ว', className: 'bg-slate-50 text-slate-600 border-slate-100' };
  return { label: status || '-', className: 'bg-slate-50 text-slate-600 border-slate-100' };
}

function passResultMeta(postScore?: number | null, passScore?: number | null) {
  if (postScore === null || postScore === undefined) {
    return { label: 'ยังไม่สอบหลังเรียน', className: 'bg-slate-50 text-slate-500 border-slate-100' };
  }
  const passed = Number(postScore) >= Number(passScore || 70);
  return passed
    ? { label: 'ผ่าน', className: 'bg-emerald-50 text-emerald-700 border-emerald-100' }
    : { label: 'ไม่ผ่าน', className: 'bg-rose-50 text-rose-700 border-rose-100' };
}

function loadImageFromUrl(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์รูปภาพนี้ได้'));
    image.src = url;
  });
}

function canvasToWebp(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/webp', quality);
  });
}

async function optimizeCourseCover(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
  if (file.size > COURSE_COVER_MAX_ORIGINAL_BYTES) {
    throw new Error(`ขนาดไฟล์ต้นฉบับต้องไม่เกิน ${formatFileSize(COURSE_COVER_MAX_ORIGINAL_BYTES)}`);
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageFromUrl(objectUrl);
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'training-cover';
    let best: { blob: Blob; dataUrl: string; width: number; height: number } | null = null;

    for (const maxDimension of COURSE_COVER_DIMENSIONS) {
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('ไม่สามารถประมวลผลรูปภาพได้');
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, 0, width, height);

      for (const quality of COURSE_COVER_QUALITIES) {
        const blob = await canvasToWebp(canvas, quality);
        if (!blob) continue;
        const dataUrl = await readBlobAsDataUrl(blob);

        if (!best || blob.size < best.blob.size) {
          best = { blob, dataUrl, width, height };
        }

        if (blob.size <= COURSE_COVER_MAX_BYTES) {
          return {
            fileName: `${baseName}.webp`,
            mimeType: 'image/webp',
            base64: dataUrlToBase64(dataUrl),
            previewUrl: dataUrl,
            originalSize: file.size,
            outputSize: blob.size,
            width,
            height,
          };
        }
      }
    }

    if (!best) throw new Error('ไม่สามารถย่อรูปภาพได้');
    return {
      fileName: `${baseName}.webp`,
      mimeType: 'image/webp',
      base64: dataUrlToBase64(best.dataUrl),
      previewUrl: best.dataUrl,
      originalSize: file.size,
      outputSize: best.blob.size,
      width: best.width,
      height: best.height,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function TrainingAdmin() {
  const [userData, setUserData] = useState<any>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [form, setForm] = useState<Course>(emptyCourse);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [lessonForm, setLessonForm] = useState({ title: '', youtube_url: '', content: '', duration_seconds: 0 });
  const [materialForm, setMaterialForm] = useState({ title: '' });
  const [materialFile, setMaterialFile] = useState<File | null>(null);
  const [isUploadingMaterial, setIsUploadingMaterial] = useState(false);
  const [questionForm, setQuestionForm] = useState({ quiz_type: 'post', question_text: '', choices: ['', '', '', ''], correct_index: 0 });
  const [evaluationForm, setEvaluationForm] = useState<EvaluationFormState>({
    question_text: '',
    question_type: 'rating' as EvaluationQuestionType,
    options: ['', ''],
    is_required: true,
    sort_order: 0,
  });
  const [evaluationQuestions, setEvaluationQuestions] = useState<AdminEvaluationQuestion[]>([]);
  const [evaluationReport, setEvaluationReport] = useState<EvaluationReport | null>(null);
  const [courseMaterials, setCourseMaterials] = useState<TrainingMaterial[]>([]);
  const [quizSettings, setQuizSettings] = useState(defaultQuizSettings);
  const [quizPreview, setQuizPreview] = useState<AdminQuiz[] | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [report, setReport] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<AdminTab>('report');

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

  const loadQuizPreview = useCallback(async (courseId: number) => {
    const res = await fetch(`${API_BASE}/api/admin/training/courses/${courseId}/quizzes`);
    if (!res.ok) throw new Error('Cannot load quiz preview');
    const data: AdminQuiz[] = await res.json();
    setQuizPreview(data);
    const nextSettings = { ...defaultQuizSettings };
    data.forEach((quiz) => {
      const limit = splitMinutes(quiz.time_limit_minutes);
      nextSettings[quiz.quiz_type] = {
        hours: limit.hours,
        minutes: limit.minutes,
        pass_score: Number(quiz.pass_score || 70),
      };
    });
    setQuizSettings(nextSettings);
    return data;
  }, []);

  const loadEvaluationQuestions = useCallback(async (courseId: number) => {
    try {
      const { response, data } = await fetchJsonWithFallback(
        `${API_BASE}/api/admin/training/courses/${courseId}/evaluation-questions`,
        getEvaluationProxyUrl({ courseId }),
      );
      if (!response.ok) throw new Error(data?.error || 'Cannot load evaluation questions');
      const questions = Array.isArray(data) ? data : [];
      setEvaluationQuestions(questions);
      saveLocalEvaluationQuestions(courseId, questions);
      return questions;
    } catch {
      const localQuestions = loadLocalEvaluationQuestions(courseId);
      setEvaluationQuestions(localQuestions);
      return localQuestions;
    }
  }, []);

  const loadEvaluationReport = useCallback(async (courseId: number) => {
    try {
      const { response, data } = await fetchJsonWithFallback(
        `${API_BASE}/api/admin/training/courses/${courseId}/evaluation-report`,
        getEvaluationProxyUrl({ courseId, mode: 'report' }),
      );
      if (!response.ok) throw new Error(data?.error || 'Cannot load evaluation report');
      setEvaluationReport(data);
      return data;
    } catch {
      const localReport = getLocalEvaluationReport(courseId);
      setEvaluationReport(localReport);
      return localReport;
    }
  }, []);

  const loadCourseMaterials = useCallback(async (courseId: number) => {
    const res = await fetch(`${API_BASE}/api/training/courses/${courseId}`);
    if (!res.ok) throw new Error('Cannot load course materials');
    const data = await res.json();
    const materials = Array.isArray(data?.materials) ? data.materials : [];
    setCourseMaterials(materials);
    return materials;
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
    if (course.course_id) {
      loadQuizPreview(course.course_id).catch(() => toast.error('โหลดการตั้งค่าแบบทดสอบไม่สำเร็จ'));
      loadCourseMaterials(course.course_id).catch(() => setCourseMaterials([]));
      loadEvaluationQuestions(course.course_id);
      loadEvaluationReport(course.course_id);
    }
  };

  const resetForm = () => {
    setSelectedCourseId(null);
    setForm(emptyCourse);
    setQuizSettings(defaultQuizSettings);
    setQuizPreview(null);
    setEvaluationQuestions([]);
    setEvaluationReport(null);
    setCourseMaterials([]);
    setEvaluationForm({ question_text: '', question_type: 'rating', options: ['', ''], is_required: true, sort_order: 0 });
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
    if (!materialFile) return toast.warning('กรุณาเลือกไฟล์เอกสารก่อนเพิ่มข้อมูล');
    if (materialFile.size > TRAINING_MATERIAL_MAX_BYTES) {
      return toast.warning(`ขนาดไฟล์ต้องไม่เกิน ${formatFileSize(TRAINING_MATERIAL_MAX_BYTES)}`);
    }

    try {
      setIsUploadingMaterial(true);
      const dataUrl = await readBlobAsDataUrl(materialFile);
      const upload = await uploadTrainingDriveFile({
        kind: 'material',
        courseTitle: form.title || 'training-course',
        fileName: materialFile.name,
        mimeType: materialFile.type || 'application/octet-stream',
        base64: dataUrlToBase64(dataUrl),
      });

      const res = await fetch(`${API_BASE}/api/admin/training/courses/${selectedCourseId}/materials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: materialForm.title.trim() || materialFile.name,
          drive_url: upload.url,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'เพิ่มเอกสารไม่สำเร็จ');
      toast.success(data.message);
      setMaterialForm({ title: '' });
      setMaterialFile(null);
      await loadCourseMaterials(selectedCourseId).catch(() => undefined);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'เพิ่มเอกสารไม่สำเร็จ');
    } finally {
      setIsUploadingMaterial(false);
    }
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
    await loadQuizPreview(selectedCourseId).catch(() => undefined);
  };

  const addEvaluationQuestion = async () => {
    if (!selectedCourseId) return toast.warning('กรุณาเลือกหลักสูตรก่อนเพิ่มหัวข้อประเมิน');
    const options = evaluationForm.options.map((option) => option.trim()).filter(Boolean);
    const needsOptions = evaluationForm.question_type === 'single_choice' || evaluationForm.question_type === 'multiple_choice';
    if (!evaluationForm.question_text.trim()) return toast.warning('กรุณาระบุหัวข้อการประเมิน');
    if (needsOptions && options.length < 2) return toast.warning('คำถามแบบตัวเลือกต้องมีตัวเลือกอย่างน้อย 2 รายการ');

    const payload = { ...evaluationForm, options };
    try {
      const { response, data } = await fetchJsonWithFallback(`${API_BASE}/api/admin/training/courses/${selectedCourseId}/evaluation-questions`, getEvaluationProxyUrl({ courseId: selectedCourseId }), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(data.error || 'เพิ่มหัวข้อการประเมินไม่สำเร็จ');
      toast.success(data.message);
    } catch {
      const current = loadLocalEvaluationQuestions(selectedCourseId);
      const questionId = Date.now();
      const localQuestion: AdminEvaluationQuestion = {
        question_id: questionId,
        question_text: payload.question_text,
        question_type: payload.question_type,
        is_required: payload.is_required ? 1 : 0,
        sort_order: payload.sort_order,
        options: options.map((option, index) => ({
          option_id: questionId + index + 1,
          option_text: option,
        })),
      };
      const next = [...current, localQuestion].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.question_id - b.question_id);
      saveLocalEvaluationQuestions(selectedCourseId, next);
      setEvaluationQuestions(next);
      setEvaluationReport(getLocalEvaluationReport(selectedCourseId));
      toast.success('เพิ่มหัวข้อการประเมินเรียบร้อยแล้ว');
    }
    setEvaluationForm({ question_text: '', question_type: 'rating', options: ['', ''], is_required: true, sort_order: 0 });
    await loadEvaluationQuestions(selectedCourseId).catch(() => undefined);
    await loadEvaluationReport(selectedCourseId).catch(() => undefined);
  };

  const deleteEvaluationQuestion = async (questionId: number) => {
    if (!selectedCourseId || !window.confirm('ต้องการลบหัวข้อประเมินนี้หรือไม่')) return;
    let successMessage = 'ลบหัวข้อการประเมินเรียบร้อยแล้ว';
    try {
      const { response, data } = await fetchJsonWithFallback(
        `${API_BASE}/api/admin/training/evaluation-questions/${questionId}`,
        getEvaluationProxyUrl({ questionId }),
        { method: 'DELETE' },
      );
      if (!response.ok) throw new Error(data.error || 'ลบหัวข้อการประเมินไม่สำเร็จ');
      successMessage = data.message || successMessage;
    } catch {
      const next = loadLocalEvaluationQuestions(selectedCourseId).filter((question) => question.question_id !== questionId);
      saveLocalEvaluationQuestions(selectedCourseId, next);
      setEvaluationQuestions(next);
      setEvaluationReport(getLocalEvaluationReport(selectedCourseId));
    }
    toast.success(successMessage);
    await loadEvaluationQuestions(selectedCourseId).catch(() => undefined);
    await loadEvaluationReport(selectedCourseId).catch(() => undefined);
  };

  const updateQuizSetting = (quizType: QuizType, key: 'hours' | 'minutes' | 'pass_score', value: number) => {
    setQuizSettings((current) => ({
      ...current,
      [quizType]: {
        ...current[quizType],
        [key]: Math.max(0, value || 0),
      },
    }));
  };

  const saveQuizSettings = async (quizType: QuizType) => {
    if (!selectedCourseId) return toast.warning('กรุณาเลือกหลักสูตรก่อนตั้งค่าแบบทดสอบ');
    const setting = quizSettings[quizType];
    const timeLimitMinutes = Math.max(0, (Number(setting.hours) || 0) * 60 + (Number(setting.minutes) || 0));
    const res = await fetch(`${API_BASE}/api/admin/training/courses/${selectedCourseId}/quizzes/${quizType}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pass_score: setting.pass_score,
        time_limit_minutes: timeLimitMinutes,
      }),
    });
    const data = await res.json();
    if (!res.ok) return toast.error(data.error || 'บันทึกการตั้งค่าแบบทดสอบไม่สำเร็จ');
    toast.success(data.message);
    await loadQuizPreview(selectedCourseId).catch(() => undefined);
  };

  const openQuizPreview = async () => {
    if (!selectedCourseId) return toast.warning('กรุณาเลือกหลักสูตรก่อนดูตัวอย่างแบบทดสอบ');
    try {
      await loadQuizPreview(selectedCourseId);
      setIsPreviewOpen(true);
    } catch {
      toast.error('โหลดตัวอย่างแบบทดสอบไม่สำเร็จ');
    }
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

        <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-4 py-8 sm:px-8">
          <div className="flex flex-col gap-4 rounded-3xl border border-slate-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-black text-slate-900">จัดการระบบอบรม</h1>
              <p className="text-sm font-semibold text-slate-500">รายงานผู้ลงทะเบียน จัดการหลักสูตร บทเรียน เอกสาร และข้อสอบ</p>
            </div>
            <div className="grid gap-2 rounded-2xl bg-slate-100 p-1 sm:grid-cols-2">
              <TabButton active={activeTab === 'report'} onClick={() => setActiveTab('report')} icon={<BarChart3 size={16} />} label="รายงานผู้ลงทะเบียน" />
              <TabButton active={activeTab === 'courses'} onClick={() => setActiveTab('courses')} icon={<BookOpen size={16} />} label="จัดการหลักสูตร" />
            </div>
          </div>

          {activeTab === 'report' ? (
            <ReportSection report={report} onRefresh={loadReport} onConfirmAttendance={confirmAttendance} />
          ) : (
            <div className="grid min-w-0 items-start gap-6 2xl:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
              <section className="relative z-0 min-w-0 overflow-hidden rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-black text-slate-900">จัดการหลักสูตร</h2>
                    <p className="text-sm font-semibold text-slate-500">เพิ่ม/แก้ไขหลักสูตรอบรม</p>
                  </div>
                  <button onClick={resetForm} className="rounded-2xl bg-blue-600 p-3 text-white"><Plus size={18} /></button>
                </div>
                <CourseForm form={form} setForm={setForm} onSave={saveCourse} selectedCourseId={selectedCourseId} />
              </section>

              <div className="relative z-10 flex min-w-0 flex-col gap-6">
                <section className="min-w-0 overflow-hidden rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="flex items-center gap-2 text-lg font-black"><BookOpen className="text-blue-600" /> รายการหลักสูตร</h2>
                    <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 sm:min-w-72">
                      <Search size={16} className="text-slate-400" />
                      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาหลักสูตร..." className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none" />
                    </div>
                  </div>
                  <div className="grid gap-3">
                    {filteredCourses.map((course) => (
                      <div key={course.course_id} className={`grid min-w-0 gap-3 rounded-2xl border p-4 transition sm:grid-cols-[minmax(0,1fr)_auto] ${selectedCourseId === course.course_id ? 'border-blue-200 bg-blue-50' : 'border-slate-100 bg-slate-50'}`}>
                        <button onClick={() => selectCourse(course)} className="min-w-0 text-left">
                          <p className="break-words font-black text-slate-900">{course.title}</p>
                          <p className="mt-1 text-xs font-bold text-slate-500">{course.category || '-'} · {courseTypeLabels[course.course_type]} · ผู้ลงทะเบียน {course.enrolled_count || 0} คน</p>
                          <p className="mt-1 text-xs font-black text-blue-600">{courseStatusLabels[course.status]}</p>
                        </button>
                        <button onClick={() => deleteCourse(course.course_id)} className="rounded-xl bg-red-50 p-3 text-red-600"><Trash2 size={16} /></button>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="grid min-w-0 items-start gap-5 xl:grid-cols-2 2xl:grid-cols-3">
                  <QuickPanel title="เพิ่มบทเรียน YouTube" icon={<FilePlus2 />} onSubmit={addLesson}>
                    <Input value={lessonForm.title} onChange={(v) => setLessonForm({ ...lessonForm, title: v })} placeholder="ชื่อบทเรียน" />
                    <Input value={lessonForm.youtube_url} onChange={(v) => setLessonForm({ ...lessonForm, youtube_url: v })} placeholder="YouTube URL" />
                    <Input value={String(lessonForm.duration_seconds || '')} onChange={(v) => setLessonForm({ ...lessonForm, duration_seconds: Number(v) || 0 })} placeholder="เวลาเรียน (วินาที)" />
                  </QuickPanel>
                  <QuickPanel title="เพิ่มเอกสาร Drive" icon={<FilePlus2 />} onSubmit={addMaterial} submitLabel={isUploadingMaterial ? 'กำลังอัปโหลด...' : 'อัปโหลดและเพิ่มข้อมูล'} disabled={isUploadingMaterial}>
                    <Input value={materialForm.title} onChange={(v) => setMaterialForm({ ...materialForm, title: v })} placeholder="ชื่อเอกสาร" />
                    <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-blue-200 bg-blue-50 px-4 py-5 text-center text-sm font-black text-blue-700 hover:bg-blue-100">
                      <UploadCloud size={22} />
                      {materialFile ? materialFile.name : 'เลือกไฟล์เอกสารจากเครื่อง'}
                      <span className="text-xs font-semibold text-blue-500">อัปโหลดเข้า Google Drive อัตโนมัติ ไม่ต้องกรอก URL</span>
                      <input
                        type="file"
                        onChange={(event) => setMaterialFile(event.target.files?.[0] || null)}
                        className="hidden"
                        disabled={isUploadingMaterial}
                      />
                    </label>
                    {materialFile && <p className="text-xs font-bold text-slate-500">{formatFileSize(materialFile.size)}</p>}
                    {selectedCourseId && (
                      <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50 p-3">
                        <p className="text-xs font-black text-slate-500">เอกสารที่บันทึกไว้</p>
                        {courseMaterials.length === 0 ? (
                          <p className="text-xs font-semibold text-slate-400">ยังไม่มีเอกสารประกอบ</p>
                        ) : courseMaterials.map((material) => (
                          <a
                            key={material.material_id}
                            href={getTrainingFileUrl(material.drive_url)}
                            target="_blank"
                            rel="noreferrer"
                            className="block overflow-hidden text-ellipsis whitespace-nowrap rounded-xl bg-white px-3 py-2 text-xs font-bold text-blue-700 ring-1 ring-slate-100 hover:bg-blue-50"
                            title={material.title}
                          >
                            {material.title}
                          </a>
                        ))}
                      </div>
                    )}
                  </QuickPanel>
                  <QuickPanel title="เพิ่มข้อสอบ" icon={<FilePlus2 />} onSubmit={addQuestion}>
                    <select value={questionForm.quiz_type} onChange={(e) => setQuestionForm({ ...questionForm, quiz_type: e.target.value })} className="min-w-0 max-w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none">
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

                <section className="min-w-0 overflow-hidden rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="flex items-center gap-2 text-lg font-black text-slate-900"><Clock className="text-blue-600" /> ตั้งค่าเวลาแบบทดสอบ</h2>
                      <p className="text-sm font-semibold text-slate-500">กำหนดเวลาในการทำแบบทดสอบก่อนเรียนและหลังเรียน แสดงผลในหน้าผู้ลงทะเบียน</p>
                    </div>
                    <button onClick={openQuizPreview} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-black text-blue-700 disabled:cursor-not-allowed disabled:opacity-50" disabled={!selectedCourseId}>
                      <Eye size={16} /> ดูตัวอย่างแบบทดสอบ
                    </button>
                  </div>
                  <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <QuizSettingCard
                      title="แบบทดสอบก่อนเรียน"
                      settings={quizSettings.pre}
                      onChange={(key, value) => updateQuizSetting('pre', key, value)}
                      onSave={() => saveQuizSettings('pre')}
                      disabled={!selectedCourseId}
                    />
                    <QuizSettingCard
                      title="แบบทดสอบหลังเรียน"
                      settings={quizSettings.post}
                      onChange={(key, value) => updateQuizSetting('post', key, value)}
                      onSave={() => saveQuizSettings('post')}
                      disabled={!selectedCourseId}
                    />
                  </div>
                </section>

                <section className="min-w-0 overflow-hidden rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="flex items-center gap-2 text-lg font-black text-slate-900"><Star className="text-amber-500" /> แบบประเมินหลังอบรม</h2>
                      <p className="text-sm font-semibold text-slate-500">เพิ่มหัวข้อประเมินแบบให้คะแนน เลือกตอบ เลือกหลายข้อ หรือพิมพ์ข้อความ</p>
                    </div>
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
                      ผู้ตอบ {evaluationReport?.response_count || 0} คน
                    </span>
                  </div>
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
                    <EvaluationQuestionForm
                      form={evaluationForm}
                      setForm={setEvaluationForm}
                      disabled={!selectedCourseId}
                      disabledReason={!selectedCourseId ? 'กรุณาเลือกหลักสูตรจากรายการ หรือบันทึกหลักสูตรใหม่ก่อนเพิ่มหัวข้อประเมิน' : ''}
                      onSubmit={addEvaluationQuestion}
                    />
                    <EvaluationSummary
                      questions={evaluationQuestions}
                      report={evaluationReport}
                      onDelete={deleteEvaluationQuestion}
                    />
                  </div>
                </section>
              </div>
            </div>
          )}
        </div>

        <Footer />
      </main>
      {isPreviewOpen && (
        <QuizPreviewModal quizzes={quizPreview || []} onClose={() => setIsPreviewOpen(false)} />
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black transition ${
        active ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-900'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ReportSection({ report, onRefresh, onConfirmAttendance }: {
  report: any[];
  onRefresh: () => void;
  onConfirmAttendance: (enrollmentId: number, confirmed: boolean) => void;
}) {
  return (
    <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black"><BarChart3 className="text-blue-600" /> รายงานผู้ลงทะเบียน</h2>
          <p className="text-sm font-semibold text-slate-500">รายชื่อผู้ลงทะเบียน เวลาเข้าอบรม คะแนนก่อน/หลัง และสถานะยืนยัน</p>
        </div>
        <button onClick={onRefresh} className="rounded-xl bg-slate-100 p-2 text-slate-600"><RefreshCw size={16} /></button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-black text-slate-500">
            <tr>
              <th className="px-4 py-3">ผู้เข้าอบรม</th>
              <th className="px-4 py-3">หลักสูตร</th>
              <th className="px-4 py-3">ประเภท</th>
              <th className="px-4 py-3">เวลา</th>
              <th className="px-4 py-3">ก่อน/หลัง</th>
              <th className="px-4 py-3">สถานะ</th>
              <th className="px-4 py-3">ยืนยัน</th>
            </tr>
          </thead>
          <tbody>
            {report.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center font-bold text-slate-400">ยังไม่มีข้อมูลผู้ลงทะเบียน</td>
              </tr>
            ) : report.map((row) => {
              const status = enrollmentStatusMeta(row.status);
              const result = passResultMeta(row.post_score, row.pass_score);
              return (
                <tr key={row.enrollment_id} className="border-b border-slate-100">
                  <td className="px-4 py-3 font-bold text-slate-800">{row.Name_Surname}<p className="text-xs text-slate-400">{row.position}</p></td>
                  <td className="max-w-[360px] px-4 py-3 font-semibold text-slate-600">{row.title}</td>
                  <td className="px-4 py-3 text-xs font-black text-blue-600">{courseTypeLabels[row.course_type as Course['course_type']] || row.course_type}</td>
                  <td className="px-4 py-3 font-bold">{formatSecondsAsHoursMinutes(row.attended_seconds)}</td>
                  <td className="px-4 py-3 font-bold">{row.pre_score ?? '-'} / {row.post_score ?? '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-start gap-1">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${status.className}`}>{status.label}</span>
                      <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${result.className}`}>{result.label}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => onConfirmAttendance(row.enrollment_id, !row.attendance_confirmed)} className={`rounded-xl px-3 py-2 text-xs font-black ${row.attendance_confirmed ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                      {row.attendance_confirmed ? 'ยืนยันแล้ว' : 'ยืนยันเข้าอบรม'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EvaluationQuestionForm({ form, setForm, disabled, disabledReason, onSubmit }: {
  form: EvaluationFormState;
  setForm: React.Dispatch<React.SetStateAction<EvaluationFormState>>;
  disabled: boolean;
  disabledReason: string;
  onSubmit: () => void;
}) {
  const needsOptions = form.question_type === 'single_choice' || form.question_type === 'multiple_choice';
  const updateOption = (index: number, value: string) => {
    setForm((current) => {
      const next = [...current.options];
      next[index] = value;
      return { ...current, options: next };
    });
  };

  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <div className="grid gap-3">
        <Input value={form.question_text} onChange={(value) => setForm((current) => ({ ...current, question_text: value }))} placeholder="หัวข้อการประเมิน" />
        <div className="grid gap-3 sm:grid-cols-2">
          <select value={form.question_type} onChange={(event) => setForm((current) => ({ ...current, question_type: event.target.value as EvaluationQuestionType }))} className="min-w-0 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none">
            {Object.entries(evaluationTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <Input value={String(form.sort_order || 0)} onChange={(value) => setForm((current) => ({ ...current, sort_order: Number(value) || 0 }))} placeholder="ลำดับ" />
        </div>
        <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-600">
          <input type="checkbox" checked={form.is_required} onChange={(event) => setForm((current) => ({ ...current, is_required: event.target.checked }))} />
          จำเป็นต้องตอบ
        </label>
        {needsOptions && (
          <div className="grid gap-2">
            <p className="text-xs font-black text-slate-500">ตัวเลือก</p>
            {form.options.map((option, index) => (
              <Input key={index} value={option} onChange={(value) => updateOption(index, value)} placeholder={`ตัวเลือก ${index + 1}`} />
            ))}
            <button type="button" onClick={() => setForm((current) => ({ ...current, options: [...current.options, ''] }))} className="rounded-xl border border-blue-100 bg-white px-3 py-2 text-xs font-black text-blue-700">
              เพิ่มตัวเลือก
            </button>
          </div>
        )}
        {disabledReason && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">{disabledReason}</p>}
        <button onClick={onSubmit} disabled={disabled} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300">
          <Save size={16} /> {disabled ? 'เลือก/บันทึกหลักสูตรก่อน' : 'เพิ่มหัวข้อประเมิน'}
        </button>
      </div>
    </div>
  );
}

function EvaluationSummary({ questions, report, onDelete }: {
  questions: AdminEvaluationQuestion[];
  report: EvaluationReport | null;
  onDelete: (questionId: number) => void;
}) {
  const reportByQuestion = new Map((report?.questions || []).map((question) => [question.question_id, question]));

  return (
    <div className="grid gap-4">
      {questions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-bold text-slate-400">
          ยังไม่มีหัวข้อการประเมิน
        </div>
      ) : questions.map((question, index) => {
        const summary = reportByQuestion.get(question.question_id);
        return (
          <div key={question.question_id} className="rounded-2xl border border-slate-100 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-black text-slate-900">{index + 1}. {question.question_text}</p>
                <p className="mt-1 text-xs font-bold text-blue-600">{evaluationTypeLabels[question.question_type]} · {question.is_required ? 'จำเป็นต้องตอบ' : 'ไม่บังคับ'}</p>
              </div>
              <button onClick={() => onDelete(question.question_id)} className="rounded-xl bg-red-50 p-2 text-red-600"><Trash2 size={15} /></button>
            </div>
            {question.options.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {question.options.map((option) => <span key={option.option_id} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{option.option_text}</span>)}
              </div>
            )}
            <EvaluationQuestionResult summary={summary} />
          </div>
        );
      })}
    </div>
  );
}

function EvaluationQuestionResult({ summary }: { summary?: EvaluationReport['questions'][number] }) {
  if (!summary) return <p className="mt-3 text-xs font-bold text-slate-400">ยังไม่มีคำตอบ</p>;

  if (summary.question_type === 'rating') {
    return (
      <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-black text-amber-700">
        ค่าเฉลี่ย {summary.average_rating ?? '-'} / 5 จาก {summary.total_answers || 0} คำตอบ
      </p>
    );
  }

  if (summary.question_type === 'single_choice' || summary.question_type === 'multiple_choice') {
    const entries = Object.entries(summary.option_counts || {});
    return (
      <div className="mt-3 grid gap-2">
        {entries.length === 0 ? <p className="text-xs font-bold text-slate-400">ยังไม่มีคำตอบ</p> : entries.map(([label, count]) => (
          <div key={label} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-600">
            <span>{label}</span>
            <span className="text-blue-700">{count} คน</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-3 grid gap-2">
      {(summary.text_answers || []).length === 0 ? <p className="text-xs font-bold text-slate-400">ยังไม่มีคำตอบข้อความ</p> : summary.text_answers?.map((answer, index) => (
        <p key={index} className="rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600">{answer}</p>
      ))}
    </div>
  );
}

function QuizSettingCard({ title, settings, onChange, onSave, disabled }: {
  title: string;
  settings: { hours: number; minutes: number; pass_score: number };
  onChange: (key: 'hours' | 'minutes' | 'pass_score', value: number) => void;
  onSave: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-black text-slate-900">{title}</h3>
        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-700">
          {formatQuizLimit((settings.hours * 60) + settings.minutes)}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <label className="text-xs font-black text-slate-500">
          ชั่วโมง
          <input
            type="number"
            min={0}
            max={24}
            value={settings.hours}
            onChange={(event) => onChange('hours', Number(event.target.value))}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-200"
          />
        </label>
        <label className="text-xs font-black text-slate-500">
          นาที
          <input
            type="number"
            min={0}
            max={59}
            value={settings.minutes}
            onChange={(event) => onChange('minutes', Math.min(59, Number(event.target.value)))}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-200"
          />
        </label>
        <label className="text-xs font-black text-slate-500">
          เกณฑ์ผ่าน %
          <input
            type="number"
            min={0}
            max={100}
            value={settings.pass_score}
            onChange={(event) => onChange('pass_score', Math.min(100, Number(event.target.value)))}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-200"
          />
        </label>
      </div>
      <button
        onClick={onSave}
        disabled={disabled}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        <Save size={16} /> บันทึกการตั้งค่า
      </button>
      <p className="mt-2 text-xs font-semibold text-slate-400">ใส่ 0 ชั่วโมง 0 นาที หากต้องการไม่จำกัดเวลา</p>
    </div>
  );
}

function QuizPreviewModal({ quizzes, onClose }: { quizzes: AdminQuiz[]; onClose: () => void }) {
  const getQuiz = (quizType: QuizType) => quizzes.find((quiz) => quiz.quiz_type === quizType);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <div className="max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-xl font-black text-slate-900">ตัวอย่างแบบทดสอบ</h2>
            <p className="text-sm font-semibold text-slate-500">ดูรูปแบบคำถาม ตัวเลือก และคำตอบที่ตั้งไว้</p>
          </div>
          <button onClick={onClose} className="rounded-2xl bg-slate-100 p-3 text-slate-600 hover:bg-slate-200">
            <X size={18} />
          </button>
        </div>
        <div className="grid max-h-[76vh] gap-5 overflow-y-auto p-6 lg:grid-cols-2">
          {(['pre', 'post'] as QuizType[]).map((quizType) => {
            const quiz = getQuiz(quizType);
            return (
              <section key={quizType} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black text-slate-900">{quizType === 'pre' ? 'แบบทดสอบก่อนเรียน' : 'แบบทดสอบหลังเรียน'}</h3>
                    <p className="text-xs font-bold text-slate-500">
                      เวลา {formatQuizLimit(quiz?.time_limit_minutes)} · เกณฑ์ผ่าน {quiz?.pass_score ?? 70}%
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-500">{quiz?.questions.length || 0} ข้อ</span>
                </div>
                {!quiz || quiz.questions.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm font-bold text-slate-400">ยังไม่มีคำถาม</div>
                ) : (
                  <div className="space-y-3">
                    {quiz.questions.map((question, index) => (
                      <div key={question.question_id} className="rounded-2xl bg-white p-4">
                        <p className="mb-3 font-black text-slate-800">{index + 1}. {question.question_text}</p>
                        <div className="grid gap-2">
                          {question.choices.map((choice) => (
                            <div key={choice.choice_id} className={`rounded-xl px-3 py-2 text-sm font-bold ${choice.is_correct ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-slate-50 text-slate-600'}`}>
                              {choice.choice_text}
                              {choice.is_correct ? <span className="ml-2 text-xs font-black">คำตอบถูก</span> : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CourseForm({ form, setForm, onSave, selectedCourseId }: { form: Course; setForm: React.Dispatch<React.SetStateAction<Course>>; onSave: () => void; selectedCourseId: number | null }) {
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [coverUploadNote, setCoverUploadNote] = useState('');
  const [coverPreviewUrl, setCoverPreviewUrl] = useState('');
  const [coverImageError, setCoverImageError] = useState(false);
  const update = (key: keyof Course, value: any) => setForm((current) => ({ ...current, [key]: value }));
  const coverImageSrc = coverPreviewUrl || getTrainingImageUrl(form.thumbnail_url);
  const duration = splitMinutes(form.duration_minutes);
  const updateDuration = (key: 'hours' | 'minutes', value: string) => {
    const next = Math.max(0, Number(value) || 0);
    const hours = key === 'hours' ? next : duration.hours;
    const minutes = key === 'minutes' ? next : duration.minutes;
    update('duration_minutes', (hours * 60) + minutes);
  };

  useEffect(() => {
    setCoverUploadNote('');
    setCoverPreviewUrl('');
    setCoverImageError(false);
  }, [selectedCourseId]);

  useEffect(() => {
    setCoverImageError(false);
  }, [coverPreviewUrl, form.thumbnail_url]);

  const handleCoverUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      setIsUploadingCover(true);
      setCoverUploadNote('กำลังย่อและอัปโหลดรูปปก...');
      const optimized = await optimizeCourseCover(file);
      setCoverPreviewUrl(optimized.previewUrl);
      setCoverImageError(false);
      const upload = await uploadTrainingDriveFile({
        kind: 'cover',
        courseTitle: form.title || 'training-course',
        fileName: optimized.fileName,
        mimeType: optimized.mimeType,
        base64: optimized.base64,
      });
      const coverUrl = upload.url;
      if (!coverUrl) throw new Error('Google Drive ไม่ส่ง URL รูปปกกลับมา');
      update('thumbnail_url', coverUrl);
      setCoverUploadNote(`${optimized.fileName} (${formatFileSize(optimized.originalSize)} → ${formatFileSize(optimized.outputSize)})`);
      toast.success('อัปโหลดรูปปกไป Google Drive เรียบร้อยแล้ว');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'อัปโหลดรูปปกไม่สำเร็จ';
      setCoverUploadNote('');
      toast.error(message);
    } finally {
      setIsUploadingCover(false);
    }
  };

  return (
    <div className="grid min-w-0 max-w-full gap-3 overflow-hidden">
      <Input value={form.title} onChange={(v) => update('title', v)} placeholder="ชื่อหลักสูตร" />
      <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Input value={form.category} onChange={(v) => update('category', v)} placeholder="หมวดหมู่" />
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <Input value={String(duration.hours)} onChange={(v) => updateDuration('hours', v)} placeholder="เวลาเรียน (ชั่วโมง)" />
          <Input value={String(duration.minutes)} onChange={(v) => updateDuration('minutes', v)} placeholder="เวลาเรียน (นาที)" />
        </div>
      </div>
      <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <select value={form.course_type} onChange={(e) => update('course_type', e.target.value)} className="min-w-0 max-w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none">
          <option value="onsite">{courseTypeLabels.onsite}</option>
          <option value="zoom">{courseTypeLabels.zoom}</option>
          <option value="online">{courseTypeLabels.online}</option>
        </select>
        <select value={form.status} onChange={(e) => update('status', e.target.value)} className="min-w-0 max-w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none">
          <option value="open">ลงทะเบียน</option>
          <option value="closed">ปิดลงทะเบียน</option>
          <option value="draft">ฉบับร่าง</option>
        </select>
      </div>
      <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="h-24 w-full shrink-0 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200 sm:w-36">
            {coverImageSrc && !coverImageError ? (
              <img
                src={coverImageSrc}
                alt="รูปปกหลักสูตร"
                className="h-full w-full object-cover"
                onError={() => setCoverImageError(true)}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-slate-300">
                <ImagePlus size={28} />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 overflow-hidden">
            <p className="text-sm font-black text-slate-700">รูปปกหลักสูตร</p>
            <p className="text-xs font-semibold text-slate-500">เลือกรูปจากเครื่อง ระบบจะย่อเป็น WebP และเก็บใน Google Drive</p>
            {coverUploadNote && <p className="mt-1 text-xs font-bold text-blue-600">{coverUploadNote}</p>}
            {form.thumbnail_url && <p className="mt-1 block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-xs font-semibold text-slate-400">{form.thumbnail_url}</p>}
          </div>
          <label className={`inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black text-white shadow-sm ${isUploadingCover ? 'bg-slate-400' : 'bg-blue-600 hover:bg-blue-700'}`}>
            <UploadCloud size={16} /> {isUploadingCover ? 'กำลังอัปโหลด...' : 'เลือกรูปปก'}
            <input type="file" accept={COURSE_COVER_ACCEPT} onChange={handleCoverUpload} disabled={isUploadingCover} className="hidden" />
          </label>
        </div>
      </div>
      <Input value={form.instructor} onChange={(v) => update('instructor', v)} placeholder="วิทยากร" />
      <Input value={form.zoom_url} onChange={(v) => update('zoom_url', v)} placeholder="Zoom URL (ถ้ามี)" />
      <Input value={form.location} onChange={(v) => update('location', v)} placeholder="สถานที่อบรม (ถ้ามี)" />
      <Textarea value={form.learning_objectives} onChange={(v) => update('learning_objectives', v)} placeholder="เป้าหมายการเรียนรู้" />
      <Textarea value={form.learning_topics} onChange={(v) => update('learning_topics', v)} placeholder="ประเด็นการเรียนรู้" />
      <Textarea value={form.target_group} onChange={(v) => update('target_group', v)} placeholder="กลุ่มเป้าหมาย" />
      <Textarea value={form.content_summary} onChange={(v) => update('content_summary', v)} placeholder="เนื้อหาการอบรม" />
      <Textarea value={form.evaluation_method} onChange={(v) => update('evaluation_method', v)} placeholder="วิธีการประเมินผล" />
      <button onClick={onSave} className="mt-2 inline-flex min-w-0 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white">
        <Save size={16} /> {selectedCourseId ? 'บันทึกการแก้ไข' : 'เพิ่มหลักสูตร'}
      </button>
    </div>
  );
}

function QuickPanel({ title, icon, children, onSubmit, submitLabel = 'เพิ่มข้อมูล', disabled = false }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onSubmit: () => void;
  submitLabel?: string;
  disabled?: boolean;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
      <h3 className="mb-3 flex items-center gap-2 text-base font-black text-slate-900">{icon} {title}</h3>
      <div className="grid min-w-0 gap-3">{children}</div>
      <button onClick={onSubmit} disabled={disabled} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300">
        <CheckCircle2 size={16} /> {submitLabel}
      </button>
    </section>
  );
}

function Input({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full min-w-0 max-w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-200" />;
}

function Textarea({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="min-h-24 w-full min-w-0 max-w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-200" />;
}
