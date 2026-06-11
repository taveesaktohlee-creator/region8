import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, BookOpen, CheckCircle2, Clock, Edit3, Eye, FilePlus2, ImagePlus, Loader2, Plus, RefreshCw, Save, Search, Star, Trash2, UploadCloud, X } from 'lucide-react';
import Header from '../Header';
import LeftSide from '../LeftSide';
import Footer from '../Footer';
import { API_BASE } from '../lib/apiConfig';
import { getDriveFileIdFromUrl, getTrainingFileUrl, getTrainingImageUrl } from './driveMedia';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { confirmDialog } from '../lib/sweetAlert';

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
  pre_quiz_enabled: boolean | number;
  post_quiz_enabled: boolean | number;
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
    sort_order: number;
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
    course_id?: number;
    title?: string;
    course_type?: Course['course_type'];
    category?: string;
    total_answers?: number;
    average_rating?: number | null;
    option_counts?: Record<string, number>;
    text_answers?: string[];
  }>;
  responses?: EvaluationReportResponse[];
};

type EvaluationReportResponse = {
  response_id: number;
  enrollment_id: number;
  course_id: number;
  user_id: number;
  submitted_at: string;
  title: string;
  course_type: Course['course_type'];
  category?: string;
  Name_Surname: string;
  position?: string;
  Division_Province?: string;
  Department?: string;
  answers: {
    question_id: number;
    question_text: string;
    question_type: EvaluationQuestionType;
    answer_value: string;
  }[];
};

type EvaluationFormState = {
  question_text: string;
  question_type: EvaluationQuestionType;
  options: string[];
  is_required: boolean;
  sort_order: number;
};

type QuizQuestionFormState = {
  quiz_type: QuizType | '';
  question_text: string;
  choices: string[];
  correct_index: number;
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

const defaultQuestionForm: QuizQuestionFormState = {
  quiz_type: '',
  question_text: '',
  choices: ['', '', '', ''],
  correct_index: 0,
  sort_order: 0,
};

const defaultEvaluationForm: EvaluationFormState = {
  question_text: '',
  question_type: 'rating',
  options: ['', ''],
  is_required: true,
  sort_order: 0,
};

const REPORT_PAGE_SIZE = 10;

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
  pre_quiz_enabled: true,
  post_quiz_enabled: true,
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
    const trimmed = text.trim();
    if (/^<!doctype html/i.test(trimmed) || /^<html/i.test(trimmed)) {
      return { error: 'เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง' };
    }
    return { error: trimmed.length > 180 ? `${trimmed.slice(0, 180)}...` : trimmed };
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
    responses: [],
  };
}

function enrichEvaluationReport(report: Partial<EvaluationReport> | null | undefined, course?: Course): EvaluationReport {
  const questions = (Array.isArray(report?.questions) ? report?.questions : []).map((question) => ({
    ...question,
    course_id: Number(question.course_id || course?.course_id || 0) || undefined,
    title: question.title || course?.title || '',
    course_type: question.course_type || course?.course_type || 'online',
    category: question.category || course?.category || '',
    options: Array.isArray(question.options) ? question.options : [],
  }));
  const questionById = new Map(questions.map((question) => [Number(question.question_id), question]));
  const responses = (Array.isArray(report?.responses) ? report?.responses : []).map((response) => ({
    ...response,
    course_id: Number(response.course_id || course?.course_id || 0) || 0,
    title: response.title || course?.title || '',
    course_type: response.course_type || course?.course_type || 'online',
    category: response.category || course?.category || '',
    answers: (Array.isArray(response.answers) ? response.answers : []).map((answer) => {
      const question = questionById.get(Number(answer.question_id));
      return {
        question_id: Number(answer.question_id),
        question_text: answer.question_text || question?.question_text || `ข้อ ${answer.question_id}`,
        question_type: answer.question_type || question?.question_type || 'text',
        answer_value: answer.answer_value || '',
      };
    }),
  }));

  return {
    response_count: Number(report?.response_count ?? responses.length) || responses.length,
    questions,
    responses,
  };
}

function combineEvaluationReports(reports: EvaluationReport[]): EvaluationReport {
  const questionsByKey = new Map<string, EvaluationReport['questions'][number]>();
  const responsesById = new Map<number, EvaluationReportResponse>();

  reports.forEach((report) => {
    report.questions.forEach((question) => {
      const key = `${question.course_id || ''}:${question.question_id}`;
      questionsByKey.set(key, question);
    });
    (report.responses || []).forEach((response) => {
      responsesById.set(Number(response.response_id), response);
    });
  });

  const responses = Array.from(responsesById.values());
  return {
    response_count: responses.length,
    questions: Array.from(questionsByKey.values()),
    responses,
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

function formatPercent(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '-';
  return `${Number(value).toFixed(2)}%`;
}

function scoreToPoints(score?: number | string | null, total?: number | string | null) {
  if (score === null || score === undefined || String(score).trim() === '') return null;
  const value = Number(score);
  if (!Number.isFinite(value)) return null;
  const totalValue = Number(total);
  if (Number.isFinite(totalValue) && totalValue > 0) {
    return Math.round((value / 100) * totalValue);
  }
  return Math.round(value);
}

function formatQuizScore(score?: number | string | null, total?: number | string | null) {
  const points = scoreToPoints(score, total);
  return points === null ? '-' : `${points.toLocaleString('th-TH')} คะแนน`;
}

function toEnabledBoolean(value: unknown, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  const text = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'off'].includes(text)) return false;
  return fallback;
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
  const [isSavingQuestion, setIsSavingQuestion] = useState(false);
  const [questionForm, setQuestionForm] = useState<QuizQuestionFormState>(defaultQuestionForm);
  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(null);
  const [evaluationForm, setEvaluationForm] = useState<EvaluationFormState>(defaultEvaluationForm);
  const [editingEvaluationQuestionId, setEditingEvaluationQuestionId] = useState<number | null>(null);
  const [evaluationQuestions, setEvaluationQuestions] = useState<AdminEvaluationQuestion[]>([]);
  const [evaluationReport, setEvaluationReport] = useState<EvaluationReport | null>(null);
  const [allEvaluationReport, setAllEvaluationReport] = useState<EvaluationReport | null>(null);
  const [courseMaterials, setCourseMaterials] = useState<TrainingMaterial[]>([]);
  const [quizSettings, setQuizSettings] = useState(defaultQuizSettings);
  const [quizPreview, setQuizPreview] = useState<AdminQuiz[] | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [report, setReport] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<AdminTab>('report');
  const [isSavingCourse, setIsSavingCourse] = useState(false);
  const [savingQuizType, setSavingQuizType] = useState<QuizType | null>(null);
  const [savingQuizAccessType, setSavingQuizAccessType] = useState<QuizType | null>(null);

  const loadCourses = useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/admin/training/courses`);
    if (!res.ok) throw new Error('Cannot load courses');
    const data: Course[] = await res.json();
    setCourses(data);
    return data;
  }, []);

  const loadReport = useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/admin/training/report`);
    if (!res.ok) throw new Error('Cannot load report');
    const data = await res.json();
    setReport(data);
    return data;
  }, []);

  const loadAllEvaluationReport = useCallback(async (courseList?: Course[]) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/training/evaluation-report`);
      const data = await readJsonResponse(res);
      if (res.ok) {
        const nextReport = enrichEvaluationReport(data);
        setAllEvaluationReport(nextReport);
        return nextReport;
      }
      throw new Error(data?.error || 'Cannot load evaluation report');
    } catch (error) {
      console.warn('Load all training evaluation report failed:', error);
    }

    const sourceCourses = (courseList && courseList.length > 0 ? courseList : courses).filter((course) => course.course_id);
    if (sourceCourses.length === 0) {
      const emptyReport = { response_count: 0, questions: [], responses: [] };
      setAllEvaluationReport(emptyReport);
      return emptyReport;
    }

    const settledReports = await Promise.allSettled(sourceCourses.map(async (course) => {
      const { response, data } = await fetchJsonWithFallback(
        `${API_BASE}/api/admin/training/courses/${course.course_id}/evaluation-report`,
        getEvaluationProxyUrl({ courseId: course.course_id, mode: 'report' }),
      );
      if (!response.ok) throw new Error(data?.error || `Cannot load evaluation report for course ${course.course_id}`);
      return enrichEvaluationReport(data, course);
    }));
    const reports = settledReports.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
    const combinedReport = combineEvaluationReports(reports);
    setAllEvaluationReport(combinedReport);
    return combinedReport;
  }, [courses]);

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
    const [loadedCourses] = await Promise.all([loadCourses(), loadReport()]);
    await loadAllEvaluationReport(loadedCourses);
  }, [loadAllEvaluationReport, loadCourses, loadReport]);

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
    refreshAll()
      .catch(() => toast.error('โหลดข้อมูลระบบอบรมไม่สำเร็จ'))
      .finally(() => setIsRefreshing(false));
  };

  const selectCourse = (course: Course) => {
    setSelectedCourseId(course.course_id || null);
    setForm({
      ...emptyCourse,
      ...course,
      pre_quiz_enabled: toEnabledBoolean(course.pre_quiz_enabled, true),
      post_quiz_enabled: toEnabledBoolean(course.post_quiz_enabled, true),
      certificate_enabled: toEnabledBoolean(course.certificate_enabled, true),
    });
    setQuestionForm(defaultQuestionForm);
    setEditingQuestionId(null);
    setEvaluationForm(defaultEvaluationForm);
    setEditingEvaluationQuestionId(null);
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
    setQuestionForm(defaultQuestionForm);
    setEditingQuestionId(null);
    setEvaluationForm(defaultEvaluationForm);
    setEditingEvaluationQuestionId(null);
  };

  const saveCourse = async () => {
    if (isSavingCourse) return;
    const url = selectedCourseId
      ? `${API_BASE}/api/admin/training/courses/${selectedCourseId}`
      : `${API_BASE}/api/admin/training/courses`;
    setIsSavingCourse(true);
    try {
      const payload = {
        ...form,
        pre_quiz_enabled: toEnabledBoolean(form.pre_quiz_enabled, true),
        post_quiz_enabled: toEnabledBoolean(form.post_quiz_enabled, true),
        certificate_enabled: toEnabledBoolean(form.certificate_enabled, true),
      };
      const res = await fetch(url, {
        method: selectedCourseId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) return toast.error(data.error || 'บันทึกหลักสูตรไม่สำเร็จ');
      toast.success(data.message);
      resetForm();
      await loadCourses();
    } finally {
      setIsSavingCourse(false);
    }
  };

  const deleteCourse = async (courseId?: number) => {
    if (!courseId) return;
    const confirmed = await confirmDialog({ text: 'ต้องการลบหลักสูตรนี้หรือไม่' });
    if (!confirmed) return;
    const res = await fetch(`${API_BASE}/api/admin/training/courses/${courseId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) return toast.error(data.error || 'ลบหลักสูตรไม่สำเร็จ');
    toast.success(data.message);
    if (selectedCourseId === courseId) resetForm();
    setCourses((current) => current.filter((course) => Number(course.course_id) !== Number(courseId)));
    setReport((current) => current.filter((row) => Number(row.course_id) !== Number(courseId)));
    loadReport().catch(() => undefined);
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

  const updateCourseQuizAccess = async (quizType: QuizType, enabled: boolean) => {
    if (!selectedCourseId) return toast.warning('กรุณาเลือกหลักสูตรก่อนเปิด/ปิดแบบทดสอบ');
    const key = quizType === 'pre' ? 'pre_quiz_enabled' : 'post_quiz_enabled';
    const nextForm = { ...form, [key]: enabled };
    setSavingQuizAccessType(quizType);
    try {
      const payload = {
        quiz_type: quizType,
        enabled,
      };
      const res = await fetch(`${API_BASE}/api/admin/training/courses/${selectedCourseId}/quiz-access`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error(data?.error || 'บันทึกสถานะแบบทดสอบไม่สำเร็จ');
      const savedCourse = data?.course || {};
      const savedPreEnabled = savedCourse.pre_quiz_enabled ?? nextForm.pre_quiz_enabled;
      const savedPostEnabled = savedCourse.post_quiz_enabled ?? nextForm.post_quiz_enabled;
      const savedForm = {
        ...nextForm,
        pre_quiz_enabled: toEnabledBoolean(savedPreEnabled, true),
        post_quiz_enabled: toEnabledBoolean(savedPostEnabled, true),
      };
      setForm(savedForm);
      setCourses((current) => current.map((course) => (
        Number(course.course_id) === Number(selectedCourseId)
          ? { ...course, pre_quiz_enabled: savedForm.pre_quiz_enabled, post_quiz_enabled: savedForm.post_quiz_enabled }
          : course
      )));
      toast.success(data?.message || (enabled ? 'เปิดแบบทดสอบเรียบร้อยแล้ว' : 'ปิดแบบทดสอบเรียบร้อยแล้ว'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'บันทึกสถานะแบบทดสอบไม่สำเร็จ');
    } finally {
      setSavingQuizAccessType(null);
    }
  };

  const saveQuestion = async () => {
    if (!selectedCourseId) return toast.warning('กรุณาเลือกหลักสูตรก่อนเพิ่มข้อสอบ');
    if (!questionForm.quiz_type) return toast.warning('กรุณาเลือกแบบทดสอบก่อนเรียนหรือหลังเรียน');
    const questionText = questionForm.question_text.trim();
    const choices = questionForm.choices.flatMap((choice) => {
      const trimmedChoice = choice.trim();
      return trimmedChoice ? [trimmedChoice] : [];
    });
    const selectedAnswerText = questionForm.choices[questionForm.correct_index]?.trim();
    if (!questionText) return toast.warning('กรุณาระบุคำถาม');
    if (choices.length < 2) return toast.warning('กรุณาระบุตัวเลือกอย่างน้อย 2 ตัวเลือก');
    if (!selectedAnswerText) return toast.warning('กรุณาเลือกคำตอบที่ถูกต้องจากตัวเลือกที่มีข้อความ');

    const payload = {
      ...questionForm,
      question_text: questionText,
      choices: questionForm.choices,
      course_id: selectedCourseId,
    };
    try {
      setIsSavingQuestion(true);
      const requestInit = {
        method: editingQuestionId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      };
      const { response: res, data } = editingQuestionId
        ? await fetchJsonWithFallback(
            `${API_BASE}/api/admin/training/questions/${editingQuestionId}`,
            `${API_BASE}/training-evaluation-proxy?mode=quiz-question&questionId=${editingQuestionId}`,
            requestInit,
          )
        : {
            response: await fetch(`${API_BASE}/api/admin/training/courses/${selectedCourseId}/questions`, requestInit),
            data: null as any,
          };
      const responseData = editingQuestionId ? data : await readJsonResponse(res);
      if (!res.ok) {
        const fallbackMessage = editingQuestionId ? 'แก้ไขข้อสอบไม่สำเร็จ' : 'เพิ่มข้อสอบไม่สำเร็จ';
        throw new Error(responseData?.error || fallbackMessage);
      }
      toast.success(responseData?.message || (editingQuestionId ? 'แก้ไขข้อสอบเรียบร้อยแล้ว' : 'เพิ่มข้อสอบเรียบร้อยแล้ว'));
      setQuestionForm(defaultQuestionForm);
      setEditingQuestionId(null);
      await loadQuizPreview(selectedCourseId).catch(() => undefined);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (editingQuestionId ? 'แก้ไขข้อสอบไม่สำเร็จ' : 'เพิ่มข้อสอบไม่สำเร็จ'));
    } finally {
      setIsSavingQuestion(false);
    }
  };

  const editQuestion = (quizType: QuizType, question: AdminQuiz['questions'][number]) => {
    const correctIndex = Math.max(0, question.choices.findIndex((choice) => Number(choice.is_correct) === 1));
    setQuestionForm({
      quiz_type: quizType,
      question_text: question.question_text,
      choices: [...question.choices.map((choice) => choice.choice_text), '', '', '', ''].slice(0, Math.max(4, question.choices.length)),
      correct_index: correctIndex < 0 ? 0 : correctIndex,
      sort_order: Number(question.sort_order || 0),
    });
    setEditingQuestionId(question.question_id);
  };

  const cancelQuestionEdit = () => {
    setQuestionForm(defaultQuestionForm);
    setEditingQuestionId(null);
  };

  const deleteQuestion = async (questionId: number) => {
    if (!selectedCourseId) return;
    const confirmed = await confirmDialog({ text: 'ต้องการลบข้อสอบนี้หรือไม่' });
    if (!confirmed) return;
    const { response: res, data } = await fetchJsonWithFallback(
      `${API_BASE}/api/admin/training/questions/${questionId}`,
      `${API_BASE}/training-evaluation-proxy?mode=quiz-question&questionId=${questionId}`,
      { method: 'DELETE' },
    );
    if (!res.ok) return toast.error(data.error || 'ลบข้อสอบไม่สำเร็จ');
    toast.success(data.message);
    if (editingQuestionId === questionId) cancelQuestionEdit();
    await loadQuizPreview(selectedCourseId).catch(() => undefined);
  };

  const saveEvaluationQuestion = async () => {
    if (!selectedCourseId) return toast.warning('กรุณาเลือกหลักสูตรก่อนเพิ่มหัวข้อประเมิน');
    const options = evaluationForm.options.flatMap((option) => {
      const trimmedOption = option.trim();
      return trimmedOption ? [trimmedOption] : [];
    });
    const needsOptions = evaluationForm.question_type === 'single_choice' || evaluationForm.question_type === 'multiple_choice';
    if (!evaluationForm.question_text.trim()) return toast.warning('กรุณาระบุหัวข้อการประเมิน');
    if (needsOptions && options.length < 2) return toast.warning('คำถามแบบตัวเลือกต้องมีตัวเลือกอย่างน้อย 2 รายการ');

    const payload = { ...evaluationForm, options };
    try {
      const { response, data } = await fetchJsonWithFallback(
        editingEvaluationQuestionId
          ? `${API_BASE}/api/admin/training/evaluation-questions/${editingEvaluationQuestionId}`
          : `${API_BASE}/api/admin/training/courses/${selectedCourseId}/evaluation-questions`,
        editingEvaluationQuestionId
          ? getEvaluationProxyUrl({ questionId: editingEvaluationQuestionId })
          : getEvaluationProxyUrl({ courseId: selectedCourseId }),
        {
        method: editingEvaluationQuestionId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        },
      );
      if (!response.ok) throw new Error(data.error || (editingEvaluationQuestionId ? 'แก้ไขหัวข้อการประเมินไม่สำเร็จ' : 'เพิ่มหัวข้อการประเมินไม่สำเร็จ'));
      toast.success(data.message);
    } catch {
      const current = loadLocalEvaluationQuestions(selectedCourseId);
      const questionId = editingEvaluationQuestionId || Date.now();
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
      const next = [
        ...current.filter((question) => Number(question.question_id) !== Number(questionId)),
        localQuestion,
      ].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.question_id - b.question_id);
      saveLocalEvaluationQuestions(selectedCourseId, next);
      setEvaluationQuestions(next);
      setEvaluationReport(getLocalEvaluationReport(selectedCourseId));
      toast.success(editingEvaluationQuestionId ? 'แก้ไขหัวข้อการประเมินเรียบร้อยแล้ว' : 'เพิ่มหัวข้อการประเมินเรียบร้อยแล้ว');
    }
    setEvaluationForm(defaultEvaluationForm);
    setEditingEvaluationQuestionId(null);
    await loadEvaluationQuestions(selectedCourseId).catch(() => undefined);
    await loadEvaluationReport(selectedCourseId).catch(() => undefined);
  };

  const editEvaluationQuestion = (question: AdminEvaluationQuestion) => {
    const optionTexts = question.options.length > 0 ? question.options.map((option) => option.option_text) : ['', ''];
    setEvaluationForm({
      question_text: question.question_text,
      question_type: question.question_type,
      options: optionTexts.length >= 2 ? optionTexts : [...optionTexts, ''].slice(0, 2),
      is_required: Number(question.is_required) === 1,
      sort_order: Number(question.sort_order || 0),
    });
    setEditingEvaluationQuestionId(question.question_id);
  };

  const cancelEvaluationEdit = () => {
    setEvaluationForm(defaultEvaluationForm);
    setEditingEvaluationQuestionId(null);
  };

  const deleteEvaluationQuestion = async (questionId: number) => {
    if (!selectedCourseId) return;
    const confirmed = await confirmDialog({ text: 'ต้องการลบหัวข้อประเมินนี้หรือไม่' });
    if (!confirmed) return;
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
    if (editingEvaluationQuestionId === questionId) cancelEvaluationEdit();
    setEvaluationQuestions((current) => current.filter((question) => Number(question.question_id) !== Number(questionId)));
    loadEvaluationReport(selectedCourseId).catch(() => undefined);
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
    if (savingQuizType) return;
    const setting = quizSettings[quizType];
    const timeLimitMinutes = Math.max(0, (Number(setting.hours) || 0) * 60 + (Number(setting.minutes) || 0));
    setSavingQuizType(quizType);
    try {
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
    } finally {
      setSavingQuizType(null);
    }
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
    <div className="flex h-screen overflow-hidden bg-[#f5f5f7] text-slate-900">
      <ToastContainer position="top-right" autoClose={2800} />
      <LeftSide userData={userData} isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} handleLogout={handleLogout} />

      <main className="z-10 flex h-full flex-1 flex-col overflow-y-auto">
        <Header setIsSidebarOpen={setIsSidebarOpen} handleRefresh={handleRefresh} isRefreshing={isRefreshing} handleLogout={handleLogout} />

        <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-4 py-8 sm:px-8">
          <div className="flex flex-col gap-4 rounded-[18px] border border-[#e0e0e0] bg-white p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="border-l-4 border-blue-600 pl-4">
              <h1 className="text-2xl font-black text-slate-900">จัดการระบบอบรม</h1>
              <p className="text-sm font-semibold text-slate-500">รายงานผู้ลงทะเบียน จัดการหลักสูตร บทเรียน เอกสาร และข้อสอบ</p>
            </div>
            <div className="grid gap-2 rounded-2xl bg-slate-100 p-1 sm:grid-cols-2">
              <TabButton active={activeTab === 'report'} onClick={() => setActiveTab('report')} icon={<BarChart3 size={16} />} label="รายงานผู้ลงทะเบียน" />
              <TabButton active={activeTab === 'courses'} onClick={() => setActiveTab('courses')} icon={<BookOpen size={16} />} label="จัดการหลักสูตร" />
            </div>
          </div>

          {activeTab === 'report' ? (
            <ReportSection courses={courses} report={report} evaluationReport={allEvaluationReport} onRefresh={refreshAll} onConfirmAttendance={confirmAttendance} />
          ) : (
            <div className="grid min-w-0 items-start gap-6 2xl:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
              <section className="relative z-0 min-w-0 overflow-hidden rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-black text-slate-900">จัดการหลักสูตร</h2>
                    <p className="text-sm font-semibold text-slate-500">เพิ่ม/แก้ไขหลักสูตรอบรม</p>
                  </div>
                  <button type="button" onClick={resetForm} className="rounded-2xl bg-blue-600 p-3 text-white"><Plus size={18} /></button>
                </div>
                <CourseForm
                  key={selectedCourseId ?? 'new-course'}
                  form={form}
                  setForm={setForm}
                  onSave={saveCourse}
                  selectedCourseId={selectedCourseId}
                  isSaving={isSavingCourse}
                />
              </section>

              <div className="relative z-10 flex min-w-0 flex-col gap-6">
                <section className="min-w-0 overflow-hidden rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="flex items-center gap-2 text-lg font-black"><BookOpen className="text-blue-600" /> รายการหลักสูตร</h2>
                    <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 sm:min-w-72">
                      <Search size={16} className="text-slate-400" />
                      <input aria-label="ค้นหาหลักสูตร" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาหลักสูตร..." className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none" />
                    </div>
                  </div>
                  <div className="grid gap-3">
                    {filteredCourses.map((course) => (
                      <div key={course.course_id} className={`grid min-w-0 gap-3 rounded-2xl border p-4 transition sm:grid-cols-[minmax(0,1fr)_auto] ${selectedCourseId === course.course_id ? 'border-blue-200 bg-blue-50' : 'border-slate-100 bg-slate-50'}`}>
                        <button type="button" onClick={() => selectCourse(course)} className="min-w-0 text-left">
                          <p className="break-words font-black text-slate-900">{course.title}</p>
                          <p className="mt-1 text-xs font-bold text-slate-500">{course.category || '-'} · {courseTypeLabels[course.course_type]} · ผู้ลงทะเบียน {course.enrolled_count || 0} คน</p>
                          <p className="mt-1 text-xs font-black text-blue-600">{courseStatusLabels[course.status]}</p>
                        </button>
                        <button type="button" onClick={() => deleteCourse(course.course_id)} className="rounded-xl bg-red-50 p-3 text-red-600"><Trash2 size={16} /></button>
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
                  <QuickPanel
                    title={editingQuestionId ? 'แก้ไขข้อสอบ' : 'เพิ่มข้อสอบ'}
                    icon={<FilePlus2 />}
                    onSubmit={saveQuestion}
                    submitLabel={isSavingQuestion ? 'กำลังบันทึก...' : editingQuestionId ? 'บันทึกการแก้ไข' : 'เพิ่มข้อมูล'}
                    disabled={isSavingQuestion}
                    className="xl:col-span-2 2xl:col-span-3"
                    hideSubmit
                  >
                    <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(300px,0.78fr)_minmax(0,1.22fr)]">
                      <div className="grid min-w-0 gap-3">
                        <select value={questionForm.quiz_type} onChange={(e) => setQuestionForm({ ...questionForm, quiz_type: e.target.value as QuizType | '' })} className="min-w-0 max-w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none">
                          <option value="">กรุณาเลือก</option>
                          <option value="pre">ก่อนเรียน</option>
                          <option value="post">หลังเรียน</option>
                        </select>
                        <Input value={questionForm.question_text} onChange={(v) => setQuestionForm({ ...questionForm, question_text: v })} placeholder="คำถาม" />
                        {questionForm.choices.map((choice, index) => (
                          <div key={`quiz-choice-${index + 1}-${questionForm.choices.length}`} className="flex gap-2">
                            <input aria-label={`กำหนดตัวเลือก ${index + 1} เป็นคำตอบถูก`} type="radio" checked={questionForm.correct_index === index} onChange={() => setQuestionForm({ ...questionForm, correct_index: index })} />
                            <Input value={choice} onChange={(v) => {
                              const next = [...questionForm.choices];
                              next[index] = v;
                              setQuestionForm({ ...questionForm, choices: next });
                            }} placeholder={`ตัวเลือก ${index + 1}`} />
                          </div>
                        ))}
                        {editingQuestionId && (
                          <button type="button" onClick={cancelQuestionEdit} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600">
                            ยกเลิกการแก้ไข
                          </button>
                        )}
                        <button type="button" onClick={saveQuestion} disabled={isSavingQuestion} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300">
                          <CheckCircle2 size={16} /> {isSavingQuestion ? 'กำลังบันทึก...' : editingQuestionId ? 'บันทึกการแก้ไข' : 'เพิ่มข้อมูล'}
                        </button>
                      </div>
                      <QuizQuestionSummary
                        quizzes={quizPreview || []}
                        activeQuizType={questionForm.quiz_type}
                        onEdit={editQuestion}
                        onDelete={deleteQuestion}
                      />
                    </div>
                  </QuickPanel>
                </section>

                <section className="min-w-0 overflow-hidden rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="flex items-center gap-2 text-lg font-black text-slate-900"><Clock className="text-blue-600" /> ตั้งค่าเวลาแบบทดสอบ</h2>
                      <p className="text-sm font-semibold text-slate-500">กำหนดเวลาในการทำแบบทดสอบก่อนเรียนและหลังเรียน แสดงผลในหน้าผู้ลงทะเบียน</p>
                    </div>
                    <button type="button" onClick={openQuizPreview} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-black text-blue-700 disabled:cursor-not-allowed disabled:opacity-50" disabled={!selectedCourseId}>
                      <Eye size={16} /> ดูตัวอย่างแบบทดสอบ
                    </button>
                  </div>
                  <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <QuizSettingCard
                      title="แบบทดสอบก่อนเรียน"
                      settings={quizSettings.pre}
                      enabled={toEnabledBoolean(form.pre_quiz_enabled, true)}
                      onChange={(key, value) => updateQuizSetting('pre', key, value)}
                      onSave={() => saveQuizSettings('pre')}
                      onToggleEnabled={(enabled) => updateCourseQuizAccess('pre', enabled)}
                      disabled={!selectedCourseId || Boolean(savingQuizType) || Boolean(savingQuizAccessType)}
                      saving={savingQuizType === 'pre'}
                      toggling={savingQuizAccessType === 'pre'}
                    />
                    <QuizSettingCard
                      title="แบบทดสอบหลังเรียน"
                      settings={quizSettings.post}
                      enabled={toEnabledBoolean(form.post_quiz_enabled, true)}
                      onChange={(key, value) => updateQuizSetting('post', key, value)}
                      onSave={() => saveQuizSettings('post')}
                      onToggleEnabled={(enabled) => updateCourseQuizAccess('post', enabled)}
                      disabled={!selectedCourseId || Boolean(savingQuizType) || Boolean(savingQuizAccessType)}
                      saving={savingQuizType === 'post'}
                      toggling={savingQuizAccessType === 'post'}
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
                      editingQuestionId={editingEvaluationQuestionId}
                      onCancelEdit={cancelEvaluationEdit}
                      onSubmit={saveEvaluationQuestion}
                    />
                    <EvaluationSummary
                      questions={evaluationQuestions}
                      report={evaluationReport}
                      onEdit={editEvaluationQuestion}
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
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black transition-all duration-300 ${
        active ? 'bg-white text-blue-700 border border-[#e0e0e0] shadow-sm' : 'text-slate-500 hover:text-slate-900 border border-transparent'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ReportSection({ courses, report, evaluationReport, onRefresh, onConfirmAttendance }: {
  courses: Course[];
  report: any[];
  evaluationReport: EvaluationReport | null;
  onRefresh: () => void | Promise<void>;
  onConfirmAttendance: (enrollmentId: number, confirmed: boolean) => void;
}) {
  const [selectedDivision, setSelectedDivision] = useState('ทั้งหมด');
  const [selectedReportCourseId, setSelectedReportCourseId] = useState('ทั้งหมด');
  const [reportSearch, setReportSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const courseOptions = useMemo(() => {
    const options = new Map<string, string>();
    courses.forEach((course) => {
      if (course.course_id) options.set(String(course.course_id), course.title || `หลักสูตร #${course.course_id}`);
    });
    report.forEach((row) => {
      const courseId = String(row.course_id || '').trim();
      if (courseId && !options.has(courseId)) options.set(courseId, row.title || `หลักสูตร #${courseId}`);
    });
    return Array.from(options.entries())
      .map(([courseId, title]) => ({ courseId, title }))
      .sort((a, b) => a.title.localeCompare(b.title, 'th'));
  }, [courses, report]);
  const divisionOptions = useMemo(() => {
    const divisions = Array.from(
      new Set(report.flatMap((row) => {
        const division = String(row.Division_Province || '').trim();
        return division ? [division] : [];
      })),
    );
    return ['ทั้งหมด', ...divisions.sort((a, b) => a.localeCompare(b, 'th'))];
  }, [report]);
  const filteredReport = useMemo(() => {
    const needle = reportSearch.trim().toLowerCase();
    return report.filter((row) => {
      const matchesCourse = selectedReportCourseId === 'ทั้งหมด' || String(row.course_id || '').trim() === selectedReportCourseId;
      if (!matchesCourse) return false;
      const matchesDivision = selectedDivision === 'ทั้งหมด' || String(row.Division_Province || '').trim() === selectedDivision;
      if (!matchesDivision) return false;
      if (!needle) return true;
      return [
        row.Name_Surname,
        row.position,
        row.Division_Province,
        row.Department,
        row.title,
        row.category,
        courseTypeLabels[row.course_type as Course['course_type']] || row.course_type,
        enrollmentStatusMeta(row.status).label,
        passResultMeta(row.post_score, row.pass_score).label,
      ].some((value) => String(value || '').toLowerCase().includes(needle));
    });
  }, [report, reportSearch, selectedDivision, selectedReportCourseId]);
  const totalPages = Math.max(1, Math.ceil(filteredReport.length / REPORT_PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * REPORT_PAGE_SIZE;
  const paginatedReport = filteredReport.slice(pageStart, pageStart + REPORT_PAGE_SIZE);
  const quizSummary = useMemo(() => {
    const total = filteredReport.length;
    const summary = filteredReport.reduce((acc, row) => {
      const pre = Number(row.pre_score);
      const post = Number(row.post_score);
      if (Number.isFinite(pre)) acc.preScores.push(pre);
      if (Number.isFinite(post)) {
        acc.postScores.push(post);
        if (post >= Number(row.pass_score || 70)) acc.passedCount += 1;
      }
      if (Number.isFinite(pre) && Number.isFinite(post)) {
        acc.bothCount += 1;
        if (post > pre) acc.improvedCount += 1;
      }
      if (row.status === 'completed') acc.completedCount += 1;
      return acc;
    }, {
      preScores: [] as number[],
      postScores: [] as number[],
      passedCount: 0,
      completedCount: 0,
      bothCount: 0,
      improvedCount: 0,
    });
    const average = (values: number[]) => values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

    return {
      total,
      preTaken: summary.preScores.length,
      postTaken: summary.postScores.length,
      completedCount: summary.completedCount,
      avgPre: average(summary.preScores),
      avgPost: average(summary.postScores),
      passRate: summary.postScores.length > 0 ? (summary.passedCount / summary.postScores.length) * 100 : null,
      completionRate: total > 0 ? (summary.completedCount / total) * 100 : null,
      improvementRate: summary.bothCount > 0 ? (summary.improvedCount / summary.bothCount) * 100 : null,
    };
  }, [filteredReport]);
  const filteredEvaluationResponses = useMemo(() => {
    const needle = reportSearch.trim().toLowerCase();
    return (evaluationReport?.responses || []).filter((response) => {
      const matchesCourse = selectedReportCourseId === 'ทั้งหมด' || String(response.course_id || '').trim() === selectedReportCourseId;
      if (!matchesCourse) return false;
      const matchesDivision = selectedDivision === 'ทั้งหมด' || String(response.Division_Province || '').trim() === selectedDivision;
      if (!matchesDivision) return false;
      if (!needle) return true;
      return [
        response.Name_Surname,
        response.position,
        response.Division_Province,
        response.Department,
        response.title,
        response.category,
        courseTypeLabels[response.course_type] || response.course_type,
        ...response.answers.flatMap((answer) => [answer.question_text, answer.answer_value]),
      ].some((value) => String(value || '').toLowerCase().includes(needle));
    });
  }, [evaluationReport?.responses, reportSearch, selectedDivision, selectedReportCourseId]);
  const filteredEvaluationQuestions = useMemo(() => {
    const needle = reportSearch.trim().toLowerCase();
    const responseCourseIds = new Set(filteredEvaluationResponses.map((response) => Number(response.course_id)));
    return (evaluationReport?.questions || []).filter((question) => {
      if (selectedReportCourseId !== 'ทั้งหมด' && String(question.course_id || '').trim() !== selectedReportCourseId) return false;
      if (selectedDivision !== 'ทั้งหมด' && !responseCourseIds.has(Number(question.course_id))) return false;
      if (!needle) return true;
      return [
        question.title,
        question.category,
        question.question_text,
        evaluationTypeLabels[question.question_type],
      ].some((value) => String(value || '').toLowerCase().includes(needle));
    });
  }, [evaluationReport?.questions, filteredEvaluationResponses, reportSearch, selectedDivision, selectedReportCourseId]);

  return (
    <section className="space-y-5">
      <div className="rounded-[18px] border border-[#e0e0e0] bg-white p-6">
        <div className="mb-5 grid min-w-0 gap-4 xl:grid-cols-[minmax(240px,0.8fr)_minmax(0,2fr)] xl:items-start">
          <div className="min-w-0 border-l-4 border-blue-600 pl-4">
            <h2 className="text-xl font-black text-slate-900">รายงานผู้ลงทะเบียน</h2>
            <p className="text-sm font-semibold text-slate-500">รายชื่อผู้ลงทะเบียน เวลาเข้าอบรม คะแนนก่อน/หลัง และสถานะยืนยัน</p>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_auto]">
            <div className="grid min-w-0 gap-1">
              <label className="text-xs font-black text-slate-500" htmlFor="training-report-course">หลักสูตร</label>
              <select
                id="training-report-course"
                value={selectedReportCourseId}
                onChange={(event) => {
                  setSelectedReportCourseId(event.target.value);
                  setCurrentPage(1);
                }}
                className="h-12 w-full min-w-0 rounded-2xl border border-[#e0e0e0] bg-white px-4 text-sm font-black text-slate-700 outline-none transition-all duration-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
              >
                <option value="ทั้งหมด">ทุกหลักสูตร</option>
                {courseOptions.map((course) => (
                  <option key={course.courseId} value={course.courseId}>{course.title}</option>
                ))}
              </select>
            </div>
            <div className="grid min-w-0 gap-1">
              <label className="text-xs font-black text-slate-500" htmlFor="training-report-division">หน่วยงาน</label>
              <select
                id="training-report-division"
                value={selectedDivision}
                onChange={(event) => {
                  setSelectedDivision(event.target.value);
                  setCurrentPage(1);
                }}
                className="h-12 w-full min-w-0 rounded-2xl border border-[#e0e0e0] bg-white px-4 text-sm font-black text-slate-700 outline-none transition-all duration-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
              >
                {divisionOptions.map((division) => (
                  <option key={division} value={division}>{division}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={onRefresh}
              className="mt-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[#e0e0e0] bg-[#fafafc] text-slate-600 transition-all duration-300 hover:border-[#cccccc] hover:bg-slate-50"
            >
              <RefreshCw size={16} />
            </button>
            <div className="grid min-w-0 gap-1 md:col-span-3">
              <label className="text-xs font-black text-slate-500" htmlFor="training-report-search">ค้นหา</label>
              <div className="relative min-w-0">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  id="training-report-search"
                  value={reportSearch}
                  onChange={(event) => {
                    setReportSearch(event.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="ค้นหาผู้ลงทะเบียน หลักสูตร สถานะ หรือคำตอบประเมิน..."
                  className="h-12 w-full min-w-0 rounded-2xl border border-[#e0e0e0] bg-white py-3 pl-10 pr-4 text-sm font-black text-slate-700 outline-none transition-all duration-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <ReportStatCard title="ผู้ลงทะเบียน" value={quizSummary.total.toLocaleString('th-TH')} detail={`สำเร็จ ${quizSummary.completedCount.toLocaleString('th-TH')} คน`} tone="blue" />
          <ReportStatCard title="เฉลี่ยก่อนเรียน" value={formatPercent(quizSummary.avgPre)} detail={`เข้าสอบ ${quizSummary.preTaken.toLocaleString('th-TH')} คน`} tone="amber" />
          <ReportStatCard title="เฉลี่ยหลังเรียน" value={formatPercent(quizSummary.avgPost)} detail={`เข้าสอบ ${quizSummary.postTaken.toLocaleString('th-TH')} คน`} tone="orange" />
          <ReportStatCard title="อัตราความสำเร็จ" value={formatPercent(quizSummary.passRate)} detail="ผ่านเกณฑ์แบบทดสอบหลังเรียน" tone="emerald" />
          <ReportStatCard title="คะแนนพัฒนาขึ้น" value={formatPercent(quizSummary.improvementRate)} detail={`จบอบรม ${formatPercent(quizSummary.completionRate)}`} tone="purple" />
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#f5f5f7] border-b border-[#e0e0e0] text-xs font-black text-slate-500">
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
              {filteredReport.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center font-bold text-slate-400">ยังไม่มีข้อมูลผู้ลงทะเบียนในหน่วยงานนี้</td>
                </tr>
              ) : paginatedReport.map((row) => {
                const status = enrollmentStatusMeta(row.status);
                const result = passResultMeta(row.post_score, row.pass_score);
                return (
                  <tr key={row.enrollment_id} className="border-b border-slate-100">
                    <td className="px-4 py-3 font-bold text-slate-800">{row.Name_Surname}<p className="text-xs text-slate-400">{row.position}</p></td>
                    <td className="max-w-[360px] px-4 py-3 font-semibold text-slate-600">{row.title}</td>
                    <td className="px-4 py-3 text-xs font-black text-blue-600">{courseTypeLabels[row.course_type as Course['course_type']] || row.course_type}</td>
                    <td className="px-4 py-3 font-bold">{formatSecondsAsHoursMinutes(row.attended_seconds)}</td>
                    <td className="px-4 py-3 font-bold">{formatQuizScore(row.pre_score, row.pre_total)} / {formatQuizScore(row.post_score, row.post_total)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${status.className}`}>{status.label}</span>
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${result.className}`}>{result.label}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onConfirmAttendance(row.enrollment_id, !row.attendance_confirmed)}
                        className={`rounded-[11px] border px-3 py-2 text-xs font-black transition-all duration-300 ${
                          row.attendance_confirmed
                            ? 'bg-emerald-50 border-emerald-100 text-emerald-700 hover:bg-emerald-100/50'
                            : 'bg-[#fafafc] border-[#e0e0e0] text-slate-600 hover:bg-slate-50 hover:border-[#cccccc]'
                        }`}
                      >
                        {row.attendance_confirmed ? 'ยืนยันแล้ว' : 'ยืนยันเข้าอบรม'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <ReportPagination
          currentPage={safePage}
          totalPages={totalPages}
          totalItems={filteredReport.length}
          pageStart={pageStart}
          pageCount={paginatedReport.length}
          onPageChange={setCurrentPage}
        />
      </div>

      <EvaluationDetailedReport
        questions={filteredEvaluationQuestions}
        responses={filteredEvaluationResponses}
      />
    </section>
  );
}

function ReportStatCard({
  title,
  value,
  detail,
  tone = 'slate',
}: {
  title: string;
  value: string;
  detail: string;
  tone?: 'slate' | 'blue' | 'emerald' | 'amber' | 'orange' | 'purple';
}) {
  let toneClass = 'border-t-slate-500 bg-slate-50/20 text-slate-700';
  let valueColor = 'text-slate-900';
  if (tone === 'blue') {
    toneClass = 'border-t-blue-500 bg-blue-50/25 border-slate-100';
    valueColor = 'text-blue-700';
  } else if (tone === 'emerald') {
    toneClass = 'border-t-emerald-500 bg-emerald-50/25 border-slate-100';
    valueColor = 'text-emerald-700';
  } else if (tone === 'amber') {
    toneClass = 'border-t-amber-500 bg-amber-50/25 border-slate-100';
    valueColor = 'text-amber-700';
  } else if (tone === 'orange') {
    toneClass = 'border-t-orange-500 bg-orange-50/25 border-slate-100';
    valueColor = 'text-orange-700';
  } else if (tone === 'purple') {
    toneClass = 'border-t-purple-500 bg-purple-50/25 border-slate-100';
    valueColor = 'text-purple-700';
  }

  return (
    <div className={`rounded-[18px] border border-t-4 px-4 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.01)] transition-all duration-300 hover:shadow-[0_4px_16px_rgba(0,0,0,0.03)] ${toneClass}`}>
      <p className="text-xs font-black text-slate-500">{title}</p>
      <p className={`mt-1 text-2xl font-black ${valueColor}`}>{value}</p>
      <p className="mt-1 text-xs font-bold text-slate-400">{detail}</p>
    </div>
  );
}

function EvaluationDetailedReport({
  questions,
  responses,
}: {
  questions: EvaluationReport['questions'];
  responses: EvaluationReportResponse[];
}) {
  return (
    <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black"><Star className="text-amber-500" /> รายงานสรุปแบบประเมินแบบละเอียด</h2>
          <p className="text-sm font-semibold text-slate-500">สรุปผลรายหัวข้อและคำตอบรายผู้เข้าอบรม ตามตัวกรองด้านบน</p>
        </div>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
          ผู้ตอบ {responses.length.toLocaleString('th-TH')} คน
        </span>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="min-w-0 rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <h3 className="mb-3 text-base font-black text-slate-900">สรุปตามหัวข้อประเมิน</h3>
          <div className="grid max-h-[520px] gap-3 overflow-y-auto pr-1">
            {questions.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm font-bold text-slate-400">
                ยังไม่มีข้อมูลสรุปแบบประเมิน
              </p>
            ) : questions.map((question, index) => (
              <div key={question.question_id} className="rounded-2xl border border-slate-100 bg-white p-4">
                <p className="text-xs font-black text-blue-600">{question.title || 'หลักสูตร'} · {evaluationTypeLabels[question.question_type]}</p>
                <p className="mt-1 font-black text-slate-900">{index + 1}. {question.question_text}</p>
                <EvaluationQuestionResult summary={question} />
              </div>
            ))}
          </div>
        </div>

        <div className="min-w-0 rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <h3 className="mb-3 text-base font-black text-slate-900">รายละเอียดคำตอบรายผู้เข้าอบรม</h3>
          <div className="grid max-h-[520px] gap-3 overflow-y-auto pr-1">
            {responses.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm font-bold text-slate-400">
                ยังไม่มีผู้ส่งแบบประเมินตามตัวกรองนี้
              </p>
            ) : responses.map((response) => (
              <div key={response.response_id} className="rounded-2xl border border-slate-100 bg-white p-4">
                <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-black text-slate-900">{response.Name_Surname}</p>
                    <p className="text-xs font-bold text-slate-400">{response.position || '-'} · {response.Division_Province || '-'}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">{response.submitted_at}</span>
                </div>
                <p className="mb-3 rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">{response.title}</p>
                <div className="grid gap-2">
                  {response.answers.length === 0 ? (
                    <p className="text-xs font-bold text-slate-400">ไม่มีคำตอบ</p>
                  ) : response.answers.map((answer) => (
                    <div key={`${response.response_id}-${answer.question_id}`} className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-xs font-black text-slate-500">{answer.question_text}</p>
                      <p className="mt-1 whitespace-pre-line text-sm font-bold text-slate-800">
                        {formatEvaluationAnswer(answer)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function formatEvaluationAnswer(answer: EvaluationReportResponse['answers'][number]) {
  if (answer.question_type === 'multiple_choice') {
    try {
      const values = JSON.parse(answer.answer_value || '[]');
      return Array.isArray(values) && values.length > 0 ? values.join(', ') : '-';
    } catch {
      return answer.answer_value || '-';
    }
  }
  if (answer.question_type === 'rating' && answer.answer_value) return `${answer.answer_value} / 5`;
  return answer.answer_value || '-';
}

function ReportPagination({
  currentPage,
  totalPages,
  totalItems,
  pageStart,
  pageCount,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageStart: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  if (totalItems === 0) return null;
  const from = pageStart + 1;
  const to = pageStart + pageCount;
  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 text-sm font-bold text-slate-500 sm:flex-row sm:items-center sm:justify-between">
      <span>แสดง {from.toLocaleString('th-TH')}-{to.toLocaleString('th-TH')} จาก {totalItems.toLocaleString('th-TH')} รายการ</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
          className="rounded-[11px] border border-[#e0e0e0] bg-[#fafafc] px-4 py-2 font-black text-slate-600 transition-all duration-300 hover:bg-slate-50 hover:border-[#cccccc] disabled:cursor-not-allowed disabled:opacity-40"
        >
          ก่อนหน้า
        </button>
        <span className="rounded-[11px] border border-[#e0e0e0] bg-slate-50 px-4 py-2 font-black text-slate-700">
          {currentPage.toLocaleString('th-TH')} / {totalPages.toLocaleString('th-TH')}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages}
          className="rounded-[11px] border border-[#e0e0e0] bg-[#fafafc] px-4 py-2 font-black text-slate-600 transition-all duration-300 hover:bg-slate-50 hover:border-[#cccccc] disabled:cursor-not-allowed disabled:opacity-40"
        >
          ถัดไป
        </button>
      </div>
    </div>
  );
}

function EvaluationQuestionForm({ form, setForm, disabled, disabledReason, editingQuestionId, onCancelEdit, onSubmit }: {
  form: EvaluationFormState;
  setForm: React.Dispatch<React.SetStateAction<EvaluationFormState>>;
  disabled: boolean;
  disabledReason: string;
  editingQuestionId: number | null;
  onCancelEdit: () => void;
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
              <Input key={`evaluation-option-${index + 1}-${form.options.length}`} value={option} onChange={(value) => updateOption(index, value)} placeholder={`ตัวเลือก ${index + 1}`} />
            ))}
            <button type="button" onClick={() => setForm((current) => ({ ...current, options: [...current.options, ''] }))} className="rounded-xl border border-blue-100 bg-white px-3 py-2 text-xs font-black text-blue-700">
              เพิ่มตัวเลือก
            </button>
          </div>
        )}
        {disabledReason && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">{disabledReason}</p>}
        {editingQuestionId && (
          <button type="button" onClick={onCancelEdit} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600">
            ยกเลิกการแก้ไข
          </button>
        )}
        <button type="button" onClick={onSubmit} disabled={disabled} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300">
          <Save size={16} /> {disabled ? 'เลือก/บันทึกหลักสูตรก่อน' : editingQuestionId ? 'บันทึกการแก้ไข' : 'เพิ่มหัวข้อประเมิน'}
        </button>
      </div>
    </div>
  );
}

function QuizQuestionSummary({ quizzes, activeQuizType, onEdit, onDelete }: {
  quizzes: AdminQuiz[];
  activeQuizType: QuizType | '';
  onEdit: (quizType: QuizType, question: AdminQuiz['questions'][number]) => void;
  onDelete: (questionId: number) => void;
}) {
  const visibleQuizzes = activeQuizType ? quizzes.filter((item) => item.quiz_type === activeQuizType) : quizzes;
  const totalQuestions = visibleQuizzes.reduce((sum, quiz) => sum + quiz.questions.length, 0);
  const title = activeQuizType ? (activeQuizType === 'pre' ? 'แบบทดสอบก่อนเรียน' : 'แบบทดสอบหลังเรียน') : 'ข้อสอบทั้งหมด';

  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-black text-slate-600">ข้อสอบที่บันทึกไว้ · {title}</p>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-slate-500">{totalQuestions} ข้อ</span>
      </div>
      {totalQuestions === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-4 text-center text-xs font-bold text-slate-400">ยังไม่มีข้อสอบในส่วนนี้</p>
      ) : (
        <div className="grid gap-2">
          {visibleQuizzes.map((quiz) => (
            <div key={quiz.quiz_id || quiz.quiz_type} className="grid gap-2">
              {!activeQuizType && (
                <p className="rounded-xl bg-white px-3 py-2 text-sm font-black text-blue-700 ring-1 ring-blue-50">
                  {quiz.quiz_type === 'pre' ? 'แบบทดสอบก่อนเรียน' : 'แบบทดสอบหลังเรียน'}
                </p>
              )}
              {quiz.questions.map((question, index) => (
                <div key={question.question_id} className="rounded-xl bg-white p-3 ring-1 ring-slate-100">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 break-words text-sm font-black leading-6 text-slate-800">{index + 1}. {question.question_text}</p>
                    <div className="flex shrink-0 gap-1">
                      <button type="button" onClick={() => onEdit(quiz.quiz_type, question)} className="rounded-lg bg-blue-50 p-2 text-blue-600" title="แก้ไขข้อสอบ">
                        <Edit3 size={13} />
                      </button>
                      <button type="button" onClick={() => onDelete(question.question_id)} className="rounded-lg bg-red-50 p-2 text-red-600" title="ลบข้อสอบ">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 grid gap-1">
                    {question.choices.map((choice) => (
                      <p key={choice.choice_id} className={`rounded-lg px-2.5 py-1.5 text-xs font-bold leading-5 ${choice.is_correct ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-500'}`}>
                        {choice.choice_text}{choice.is_correct ? ' · คำตอบถูก' : ''}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EvaluationSummary({ questions, report, onEdit, onDelete }: {
  questions: AdminEvaluationQuestion[];
  report: EvaluationReport | null;
  onEdit: (question: AdminEvaluationQuestion) => void;
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
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => onEdit(question)} className="rounded-xl bg-blue-50 p-2 text-blue-600" title="แก้ไขหัวข้อประเมิน"><Edit3 size={15} /></button>
                <button type="button" onClick={() => onDelete(question.question_id)} className="rounded-xl bg-red-50 p-2 text-red-600" title="ลบหัวข้อประเมิน"><Trash2 size={15} /></button>
              </div>
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
        <p key={`${answer}-${index + 1}`} className="rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600">{answer}</p>
      ))}
    </div>
  );
}

function QuizSettingCard({
  title,
  settings,
  enabled,
  onChange,
  onSave,
  onToggleEnabled,
  disabled,
  saving = false,
  toggling = false,
}: {
  title: string;
  settings: { hours: number; minutes: number; pass_score: number };
  enabled: boolean;
  onChange: (key: 'hours' | 'minutes' | 'pass_score', value: number) => void;
  onSave: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  disabled?: boolean;
  saving?: boolean;
  toggling?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-black text-slate-900">{title}</h3>
          <span className={`mt-1 inline-flex rounded-full px-3 py-1 text-xs font-black ${enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
            {enabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-700">
            {formatQuizLimit((settings.hours * 60) + settings.minutes)}
          </span>
          <button
            type="button"
            onClick={() => onToggleEnabled(!enabled)}
            aria-label={`${enabled ? 'ปิด' : 'เปิด'}${title}`}
            aria-pressed={enabled}
            disabled={disabled || toggling}
            className={`relative inline-flex h-10 w-20 shrink-0 items-center rounded-full border-[3px] p-1 transition duration-200 focus:outline-none focus:ring-4 focus:ring-sky-100 disabled:cursor-not-allowed disabled:opacity-60 ${
              enabled ? 'border-sky-400 bg-sky-400 hover:border-sky-500 hover:bg-sky-500' : 'border-slate-950 bg-white hover:bg-slate-50'
            }`}
          >
            <span className={`flex h-7 w-7 items-center justify-center rounded-full bg-white transition duration-200 ${
              enabled ? 'translate-x-10 text-sky-500' : 'translate-x-0 border-[3px] border-slate-950 text-slate-950'
            }`}>
              {toggling ? <Loader2 size={14} className="animate-spin" /> : null}
            </span>
          </button>
        </div>
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
        type="button"
        onClick={onSave}
        disabled={disabled}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        {saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
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
          <button type="button" onClick={onClose} className="rounded-2xl bg-slate-100 p-3 text-slate-600 hover:bg-slate-200">
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

function CourseForm({
  form,
  setForm,
  onSave,
  selectedCourseId,
  isSaving,
}: {
  form: Course;
  setForm: React.Dispatch<React.SetStateAction<Course>>;
  onSave: () => void;
  selectedCourseId: number | null;
  isSaving: boolean;
}) {
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [coverUploadNote, setCoverUploadNote] = useState('');
  const [coverPreviewUrl, setCoverPreviewUrl] = useState('');
  const [failedCoverImageSrc, setFailedCoverImageSrc] = useState('');
  const update = (key: keyof Course, value: any) => setForm((current) => ({ ...current, [key]: value }));
  const coverImageSrc = coverPreviewUrl || getTrainingImageUrl(form.thumbnail_url);
  const shouldShowCoverImage = Boolean(coverImageSrc) && failedCoverImageSrc !== coverImageSrc;
  const duration = splitMinutes(form.duration_minutes);
  const updateDuration = (key: 'hours' | 'minutes', value: string) => {
    const next = Math.max(0, Number(value) || 0);
    const hours = key === 'hours' ? next : duration.hours;
    const minutes = key === 'minutes' ? next : duration.minutes;
    update('duration_minutes', (hours * 60) + minutes);
  };

  const handleCoverUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      setIsUploadingCover(true);
      setCoverUploadNote('กำลังย่อและอัปโหลดรูปปก...');
      const optimized = await optimizeCourseCover(file);
      setCoverPreviewUrl(optimized.previewUrl);
      setFailedCoverImageSrc('');
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
            {shouldShowCoverImage ? (
              <img
                src={coverImageSrc}
                alt="รูปปกหลักสูตร"
                className="h-full w-full object-cover"
                onError={() => setFailedCoverImageSrc(coverImageSrc)}
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
      <button
        type="button"
        onClick={onSave}
        disabled={isSaving || isUploadingCover}
        className="mt-2 inline-flex min-w-0 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        {isSaving ? 'กำลังบันทึก...' : selectedCourseId ? 'บันทึกการแก้ไข' : 'เพิ่มหลักสูตร'}
      </button>
    </div>
  );
}

function QuickPanel({ title, icon, children, onSubmit, submitLabel = 'เพิ่มข้อมูล', disabled = false, className = '', hideSubmit = false }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onSubmit: () => void;
  submitLabel?: string;
  disabled?: boolean;
  className?: string;
  hideSubmit?: boolean;
}) {
  return (
    <section className={`min-w-0 overflow-hidden rounded-3xl border border-slate-100 bg-white p-5 shadow-sm ${className}`}>
      <h3 className="mb-3 flex items-center gap-2 text-base font-black text-slate-900">{icon} {title}</h3>
      <div className="grid min-w-0 gap-3">{children}</div>
      {!hideSubmit && (
        <button type="button" onClick={onSubmit} disabled={disabled} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300">
          <CheckCircle2 size={16} /> {submitLabel}
        </button>
      )}
    </section>
  );
}

function Input({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <input aria-label={placeholder} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full min-w-0 max-w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-200" />;
}

function Textarea({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <textarea aria-label={placeholder} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="min-h-24 w-full min-w-0 max-w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-200" />;
}
