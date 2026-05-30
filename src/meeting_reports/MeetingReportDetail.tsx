import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
} from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { ArrowLeft, ArrowRight, CheckCircle2, Circle, FileText, GripVertical, Loader2, Lock, MessageSquare, MousePointer2, Square, Timer, Trash2, Unlock } from 'lucide-react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Header from '../Header';
import LeftSide from '../LeftSide';
import Footer from '../Footer';
import { API_BASE } from '../lib/apiConfig';
import { closeSession, getSessionId, stopHeartbeat } from '../lib/activityTracker';
import {
  formatDuration,
  formatMeetingReportDate,
  getMeetingReportDrivePreviewUrl,
  getMeetingReportPdfOpenUrl,
  getMeetingReportPdfPreviewUrl,
  getStoredUser,
  readApiResponse,
  sectionLabels,
  type MeetingReportComment,
  type MeetingReportItem,
} from './meetingReportUtils';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const READING_FLUSH_INTERVAL_MS = 15_000;
const MAX_READING_CHUNK_SECONDS = 60;

type DraftComment = {
  pageNumber: number;
  xPercent: number;
  yPercent: number;
  markerType: 'point' | 'circle' | 'rect';
  widthPercent: number;
  heightPercent: number;
};

type AnnotationMode = 'off' | 'point' | 'circle' | 'rect';

export default function MeetingReportDetail({ reportId }: { reportId: number }) {
  const [userData, setUserData] = useState<any>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [report, setReport] = useState<MeetingReportItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageCount, setPageCount] = useState(0);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [pdfLoadFailed, setPdfLoadFailed] = useState(false);
  const [annotationMode, setAnnotationMode] = useState<AnnotationMode>('off');
  const [draftComment, setDraftComment] = useState<DraftComment | null>(null);
  const [readLogId, setReadLogId] = useState<number | null>(null);
  const [readingSeconds, setReadingSeconds] = useState(0);
  const [activePdfPage, setActivePdfPage] = useState(1);
  const [selectedCommentId, setSelectedCommentId] = useState<number | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const activeStartRef = useRef<number | null>(null);
  const viewerVisibleRef = useRef(false);
  const startedRef = useRef(false);
  const userIdRef = useRef<number | null>(null);
  const isPageFocusedRef = useRef(false);

  const loadReport = useCallback(async (userId: number) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/meeting-reports/${reportId}?user_id=${userId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Cannot load meeting report');
      setReport(data);
    } catch (error) {
      console.error(error);
      setReport(null);
    } finally {
      setIsLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    const parsedUser = getStoredUser();
    if (parsedUser) {
      setUserData(parsedUser);
      userIdRef.current = parsedUser.user_id || null;
      void loadReport(Number(parsedUser.user_id || 0));
    } else {
      setIsLoading(false);
    }
    const handleResize = () => setIsSidebarOpen(window.innerWidth >= 1024);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [loadReport]);

  useEffect(() => {
    if (selectedCommentId && report?.comments) {
      const match = report.comments.find((c) => Number(c.comment_id) === selectedCommentId);
      if (match && Number(match.page_number || 1) !== activePdfPage) {
        setActivePdfPage(Number(match.page_number || 1));
      }
    }
  }, [selectedCommentId, report?.comments, activePdfPage]);

  useEffect(() => {
    setDraftComment(null);
  }, [activePdfPage]);

  const pdfUrl = useMemo(() => getMeetingReportPdfPreviewUrl(report), [report]);
  const pdfOpenUrl = useMemo(() => getMeetingReportPdfOpenUrl(report), [report]);
  const pdfDrivePreviewUrl = useMemo(() => getMeetingReportDrivePreviewUrl(report), [report]);

  useEffect(() => {
    setPdfLoadFailed(false);
    if (!pdfUrl) {
      setPdfDoc(null);
      setPageCount(0);
      return;
    }
    let cancelled = false;
    setIsPdfLoading(true);
    const loadingTask = pdfjsLib.getDocument(pdfUrl);
    loadingTask.promise
      .then((doc) => {
        if (cancelled) {
          void doc.destroy();
          return;
        }
        setPdfDoc(doc);
        setPageCount(doc.numPages);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) {
          setPdfDoc(null);
          setPageCount(0);
          setPdfLoadFailed(true);
          if (!pdfDrivePreviewUrl) toast.error('ไม่สามารถแสดง PDF ได้');
        }
      })
      .finally(() => {
        if (!cancelled) setIsPdfLoading(false);
      });
    return () => {
      cancelled = true;
      void loadingTask.destroy();
    };
  }, [pdfDrivePreviewUrl, pdfUrl]);

  const viewerReady = Boolean(pdfDoc || (pdfLoadFailed && pdfDrivePreviewUrl));

  const shouldTrackReading = useCallback(() => {
    return (
      document.visibilityState === 'visible' &&
      document.hasFocus() &&
      isPageFocusedRef.current &&
      viewerVisibleRef.current
    );
  }, []);

  const sendReadingTime = useCallback((seconds: number, useBeacon = false) => {
    const logId = readLogId;
    const userId = userIdRef.current;
    if (!logId || !userId || seconds <= 0) return;
    const payload = JSON.stringify({ user_id: userId, seconds });
    const url = `${API_BASE}/api/meeting-reports/read-logs/${logId}/time`;
    setReadingSeconds((current) => current + seconds);

    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
      return;
    }

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => undefined);
  }, [readLogId]);

  const pauseTracking = useCallback((useBeacon = false) => {
    if (!activeStartRef.current) return;
    const elapsed = Math.min(
      Math.floor((Date.now() - activeStartRef.current) / 1000),
      MAX_READING_CHUNK_SECONDS,
    );
    activeStartRef.current = null;
    if (elapsed > 0) sendReadingTime(elapsed, useBeacon);
  }, [sendReadingTime]);

  const resumeTracking = useCallback(() => {
    if (!activeStartRef.current && shouldTrackReading()) activeStartRef.current = Date.now();
  }, [shouldTrackReading]);

  const syncTracking = useCallback(() => {
    if (shouldTrackReading()) {
      resumeTracking();
    } else {
      pauseTracking();
    }
  }, [pauseTracking, resumeTracking, shouldTrackReading]);

  useEffect(() => {
    if (!report || !userData?.user_id || startedRef.current) return;
    startedRef.current = true;
    fetch(`${API_BASE}/api/notifications/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userData.user_id,
        notification_type: 'meeting_report',
        source_id: reportId,
      }),
      keepalive: true,
    }).catch(() => undefined);
    fetch(`${API_BASE}/api/meeting-reports/${reportId}/read/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userData.user_id, session_id: getSessionId() }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.log_id) {
          setReadLogId(Number(data.log_id));
          setReport((current) => current ? { ...current, view_count: Number(current.view_count || 0) + 1 } : current);
        }
      })
      .catch(() => undefined);
  }, [report, reportId, userData?.user_id]);

  useEffect(() => {
    if (!readLogId || !viewerReady) return;
    const viewer = viewerRef.current;
    if (!viewer) return;

    const updateFocusState = () => {
      isPageFocusedRef.current = document.visibilityState === 'visible' && document.hasFocus();
      syncTracking();
    };

    const observer = new IntersectionObserver((entries) => {
      viewerVisibleRef.current = (entries[0]?.intersectionRatio || 0) >= 0.35;
      syncTracking();
    }, { threshold: [0, 0.25, 0.35, 0.5, 0.75, 1] });
    observer.observe(viewer);

    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') {
        isPageFocusedRef.current = false;
        pauseTracking(true);
        return;
      }
      updateFocusState();
    };
    const handleFocus = () => updateFocusState();
    const handleBlur = () => window.setTimeout(updateFocusState, 100);
    const handlePageHide = () => pauseTracking(true);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('beforeunload', handlePageHide);
    window.addEventListener('pagehide', handlePageHide);

    const timer = window.setInterval(() => {
      if (shouldTrackReading() && activeStartRef.current) {
        const elapsed = Math.min(
          Math.floor((Date.now() - activeStartRef.current) / 1000),
          MAX_READING_CHUNK_SECONDS,
        );
        if (elapsed > 0) {
          activeStartRef.current = Date.now();
          sendReadingTime(elapsed);
        }
      } else {
        pauseTracking();
      }
    }, READING_FLUSH_INTERVAL_MS);

    updateFocusState();

    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('beforeunload', handlePageHide);
      window.removeEventListener('pagehide', handlePageHide);
      window.clearInterval(timer);
      pauseTracking(true);
      viewerVisibleRef.current = false;
      isPageFocusedRef.current = false;
    };
  }, [pauseTracking, readLogId, sendReadingTime, shouldTrackReading, syncTracking, viewerReady]);

  const handleAcknowledge = async () => {
    if (!userData?.user_id || !report?.report_id) return;
    const res = await fetch(`${API_BASE}/api/meeting-reports/${report.report_id}/acknowledge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userData.user_id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || 'บันทึกรับทราบไม่สำเร็จ');
      return;
    }
    toast.success(data.message || 'รับทราบแล้ว');
    setReport((current) => current ? { ...current, acknowledged: 1, acknowledged_at: current.acknowledged_at || new Date().toISOString() } : current);
  };

  const handleStartComment = (
    pageNumber: number,
    xPercent: number,
    yPercent: number,
    options?: { markerType?: 'point' | 'circle' | 'rect'; widthPercent?: number; heightPercent?: number },
  ) => {
    setDraftComment({
      pageNumber,
      xPercent,
      yPercent,
      markerType: options?.markerType || 'point',
      widthPercent: options?.widthPercent || 0,
      heightPercent: options?.heightPercent || 0,
    });
  };

  const handleSaveNewComment = async (commentText: string) => {
    if (!draftComment) return;
    if (!userData?.user_id || !report?.report_id) return;
    if (!commentText?.trim()) return;
    const res = await fetch(`${API_BASE}/api/meeting-reports/${report.report_id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userData.user_id,
        page_number: draftComment.pageNumber,
        x_percent: draftComment.xPercent,
        y_percent: draftComment.yPercent,
        marker_type: draftComment.markerType,
        width_percent: draftComment.widthPercent,
        height_percent: draftComment.heightPercent,
        comment_text: commentText.trim(),
      }),
    });
    const data = await readApiResponse(res);
    if (!res.ok) {
      toast.error(data.error || 'บันทึกข้อความแจ้งแก้ไขไม่สำเร็จ');
      return;
    }
    const comment = data.comment as MeetingReportComment | undefined;
    if (comment) {
      setReport((current) => current ? { ...current, comments: [...(current.comments || []), comment] } : current);
    }
    setDraftComment(null);
    toast.success(data.message || 'เพิ่มคอมเมนต์แล้ว');
  };

  const handleUpdateComment = async (commentId: number, commentText: string) => {
    if (!userData?.user_id) return false;
    if (!commentText?.trim()) {
      toast.warning('กรุณากรอกข้อความแจ้งแก้ไข');
      return false;
    }

    const res = await fetch(`${API_BASE}/api/meeting-reports/comments/${commentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userData.user_id,
        comment_text: commentText.trim(),
      }),
    });
    const data = await readApiResponse(res);
    if (!res.ok) {
      toast.error(data.error || 'แก้ไขข้อความแจ้งแก้ไขไม่สำเร็จ');
      return false;
    }

    const updatedComment = data.comment as MeetingReportComment | undefined;
    if (updatedComment) {
      setReport((current) => current ? {
        ...current,
        comments: (current.comments || []).map((comment) => (
          Number(comment.comment_id) === Number(commentId) ? updatedComment : comment
        )),
      } : current);
    }
    toast.success(data.message || 'แก้ไขข้อความแล้ว');
    return true;
  };

  const handleMoveComment = async (commentId: number, pageNumber: number, xPercent: number, yPercent: number) => {
    if (!userData?.user_id) return false;

    const res = await fetch(`${API_BASE}/api/meeting-reports/comments/${commentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userData.user_id,
        page_number: pageNumber,
        x_percent: xPercent,
        y_percent: yPercent,
      }),
    });
    const data = await readApiResponse(res);
    if (!res.ok) {
      toast.error(data.error || 'ย้ายตำแหน่งข้อความแจ้งแก้ไขไม่สำเร็จ');
      return false;
    }

    const updatedComment = data.comment as MeetingReportComment | undefined;
    if (updatedComment) {
      setReport((current) => current ? {
        ...current,
        comments: (current.comments || []).map((comment) => (
          Number(comment.comment_id) === Number(commentId) ? updatedComment : comment
        )),
      } : current);
    }
    toast.success(data.message || 'ย้ายตำแหน่งแล้ว');
    return true;
  };

  const handleResizeComment = async (
    commentId: number,
    widthPercent: number,
    heightPercent: number,
    xPercent?: number,
    yPercent?: number
  ) => {
    if (!userData?.user_id) return false;

    const res = await fetch(`${API_BASE}/api/meeting-reports/comments/${commentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userData.user_id,
        width_percent: widthPercent,
        height_percent: heightPercent,
        ...(xPercent !== undefined ? { x_percent: xPercent } : {}),
        ...(yPercent !== undefined ? { y_percent: yPercent } : {}),
      }),
    });
    const data = await readApiResponse(res);
    if (!res.ok) {
      toast.error(data.error || 'ปรับขนาดกรอบไม่สำเร็จ');
      return false;
    }

    const updatedComment = data.comment as MeetingReportComment | undefined;
    if (updatedComment) {
      setReport((current) => current ? {
        ...current,
        comments: (current.comments || []).map((comment) => (
          Number(comment.comment_id) === Number(commentId) ? updatedComment : comment
        )),
      } : current);
    }
    toast.success(data.message || 'ปรับขนาดกรอบแล้ว');
    return true;
  };

  const handleDeleteComment = async (commentId: number) => {
    if (!userData?.user_id) return false;
    const confirmed = window.confirm('ต้องการลบข้อความแจ้งแก้ไขนี้ใช่หรือไม่');
    if (!confirmed) return false;

    const res = await fetch(`${API_BASE}/api/meeting-reports/comments/${commentId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userData.user_id }),
    });
    const data = await readApiResponse(res);
    if (!res.ok) {
      toast.error(data.error || 'ลบข้อความแจ้งแก้ไขไม่สำเร็จ');
      return false;
    }

    setReport((current) => current ? {
      ...current,
      comments: (current.comments || []).filter((comment) => Number(comment.comment_id) !== Number(commentId)),
    } : current);
    toast.success(data.message || 'ลบข้อความแจ้งแก้ไขแล้ว');
    return true;
  };

  const handleLogout = async () => {
    pauseTracking(true);
    stopHeartbeat();
    await closeSession();
    localStorage.removeItem('user');
    window.location.href = '/';
  };

  const handleRefresh = () => {
    if (!userData?.user_id) return;
    setIsRefreshing(true);
    loadReport(userData.user_id).finally(() => setIsRefreshing(false));
  };

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center bg-slate-50 font-bold text-slate-500">กำลังโหลดรายงานการประชุม...</div>;
  }

  if (!report) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 p-6 text-center">
        <div>
          <FileText className="mx-auto mb-4 text-slate-300" size={54} />
          <p className="text-lg font-black text-slate-700">ไม่พบรายงานการประชุม หรือไม่มีสิทธิ์เข้าถึง</p>
          <a href="/index" className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white">
            <ArrowLeft size={16} /> กลับหน้าหลัก
          </a>
        </div>
      </div>
    );
  }

  const section = report.section || 'office';
  const comments = report.comments || [];

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8fafc] text-slate-900">
      <ToastContainer position="top-right" autoClose={2600} />
      <LeftSide userData={userData} isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} handleLogout={handleLogout} />

      <main className="z-10 flex h-full flex-1 flex-col overflow-y-auto">
        <Header setIsSidebarOpen={setIsSidebarOpen} handleRefresh={handleRefresh} isRefreshing={isRefreshing} handleLogout={handleLogout} />

        <div className="mx-auto flex w-full max-w-[1540px] flex-col gap-6 px-4 py-8 sm:px-8">
          <a href={`/meeting-reports/${section}`} className="inline-flex w-fit cursor-pointer items-center gap-2 text-sm font-bold text-blue-600 hover:underline">
            <ArrowLeft size={16} /> กลับไปรายการรายงาน
          </a>

          <section className="grid gap-5 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>
              <p className="text-xs font-black text-blue-600">รายงานการประชุม{sectionLabels[section]}</p>
              <h1 className="mt-2 text-2xl font-black leading-snug text-slate-900">{report.title}</h1>
              <p className="mt-2 text-sm font-semibold text-slate-500">
                วันที่ประชุม {formatMeetingReportDate(report.meeting_date || report.published_at || report.updated_at)}
              </p>
              {report.description && <p className="mt-3 whitespace-pre-line text-sm font-semibold leading-7 text-slate-600">{report.description}</p>}
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[520px]">
              <InfoBox icon={<Timer size={19} />} label="เวลาที่อ่าน" value={formatDuration(readingSeconds)} />
              <InfoBox icon={<MessageSquare size={19} />} label="แจ้งแก้ไข" value={`${comments.length.toLocaleString('th-TH')} ข้อความ`} />
              <button
                type="button"
                onClick={() => void handleAcknowledge()}
                className={`cursor-pointer rounded-2xl px-4 py-4 text-left shadow-sm transition ${Number(report.acknowledged || 0) === 1 ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
              >
                <CheckCircle2 size={20} />
                <p className="mt-2 text-xs font-black opacity-80">สถานะ</p>
                <p className="text-sm font-black">{Number(report.acknowledged || 0) === 1 ? 'รับทราบแล้ว' : 'กดรับทราบ'}</p>
              </button>
            </div>
          </section>

          <section ref={viewerRef} className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
                <FileText className="text-blue-600" /> เอกสาร PDF
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAnnotationMode((value) => value === 'point' ? 'off' : 'point')}
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-2xl px-4 py-2 text-sm font-black transition ${annotationMode === 'point' ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                >
                  <MousePointer2 size={16} /> {annotationMode === 'point' ? 'คลิกเพื่อคอมเมนต์' : 'คอมเมนต์'}
                </button>
                <button
                  type="button"
                  onClick={() => setAnnotationMode((value) => value === 'circle' ? 'off' : 'circle')}
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-2xl px-4 py-2 text-sm font-black transition ${annotationMode === 'circle' ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                >
                  <Circle size={16} /> {annotationMode === 'circle' ? 'ลากวงจุดแก้ไข' : 'วงจุดแก้ไข'}
                </button>
                <button
                  type="button"
                  onClick={() => setAnnotationMode((value) => value === 'rect' ? 'off' : 'rect')}
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-2xl px-4 py-2 text-sm font-black transition ${annotationMode === 'rect' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                >
                  <Square size={16} /> {annotationMode === 'rect' ? 'ลากกรอบสี่เหลี่ยม' : 'กรอบสี่เหลี่ยม'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const nextLocked = !isLocked;
                    setIsLocked(nextLocked);
                    if (nextLocked) {
                      toast.success('ล็อกตำแหน่งเครื่องมือในเอกสารเรียบร้อยแล้ว');
                    } else {
                      toast.info('ปลดล็อกตำแหน่งเครื่องมือแล้ว');
                    }
                  }}
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-2xl px-4 py-2 text-sm font-black transition ${isLocked ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                >
                  {isLocked ? <Lock size={16} /> : <Unlock size={16} />} {isLocked ? 'ล็อกตำแหน่งแล้ว' : 'ล็อกตำแหน่ง'}
                </button>
                {pdfOpenUrl && (
                  <a href={pdfOpenUrl} target="_blank" rel="noreferrer" className="cursor-pointer rounded-2xl bg-blue-50 px-4 py-2 text-sm font-black text-blue-700 hover:bg-blue-100">
                    เปิดใน Google Drive
                  </a>
                )}
              </div>
            </div>
            {isPdfLoading ? (
              <div className="flex min-h-[520px] items-center justify-center gap-3 font-black text-slate-500">
                <Loader2 className="animate-spin text-blue-600" /> กำลังแสดง PDF...
              </div>
            ) : pdfDoc ? (
              <div className="flex flex-col items-center gap-4 bg-slate-100 px-2 py-6 sm:px-6">
                {/* Page Navigation */}
                <div className="flex w-full max-w-[1480px] items-center justify-between rounded-2xl bg-white px-5 py-3 shadow-sm ring-1 ring-slate-100">
                  <button
                    type="button"
                    onClick={() => setActivePdfPage((p) => Math.max(1, p - 1))}
                    disabled={activePdfPage <= 1}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ArrowLeft size={16} /> ย้อนกลับ
                  </button>
                  <span className="text-sm font-black text-slate-600">
                    หน้าที่ <span className="text-lg text-blue-600">{activePdfPage.toLocaleString('th-TH')}</span> / {pageCount.toLocaleString('th-TH')}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActivePdfPage((p) => Math.min(pageCount, p + 1))}
                    disabled={activePdfPage >= pageCount}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    ถัดไป <ArrowRight size={16} />
                  </button>
                </div>

                <PdfPage
                  key={activePdfPage}
                  pdfDoc={pdfDoc}
                  pageNumber={activePdfPage}
                  comments={comments.filter((c) => Number(c.page_number) === activePdfPage)}
                  allComments={comments}
                  draftComment={draftComment?.pageNumber === activePdfPage ? draftComment : null}
                  currentUserId={Number(userData?.user_id || 0)}
                  annotationMode={annotationMode}
                  selectedCommentId={selectedCommentId}
                  isLocked={isLocked}
                  onSelectComment={setSelectedCommentId}
                  onStartComment={handleStartComment}
                  onSaveNewComment={handleSaveNewComment}
                  onCancelDraft={() => setDraftComment(null)}
                  onUpdateComment={handleUpdateComment}
                  onMoveComment={handleMoveComment}
                  onResizeComment={handleResizeComment}
                  onDeleteComment={handleDeleteComment}
                />

                {/* Bottom Page Navigation */}
                <div className="flex w-full max-w-[1480px] items-center justify-between rounded-2xl bg-white px-5 py-3 shadow-sm ring-1 ring-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setActivePdfPage((p) => Math.max(1, p - 1));
                      viewerRef.current?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    disabled={activePdfPage <= 1}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-black text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ArrowLeft size={16} /> ย้อนกลับ
                  </button>
                  <span className="text-sm font-black text-slate-600">
                    หน้าที่ <span className="text-lg text-blue-600">{activePdfPage.toLocaleString('th-TH')}</span> / {pageCount.toLocaleString('th-TH')}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setActivePdfPage((p) => Math.min(pageCount, p + 1));
                      viewerRef.current?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    disabled={activePdfPage >= pageCount}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    ถัดไป <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            ) : pdfDrivePreviewUrl ? (
              <DrivePreviewFallback
                title={report.title}
                previewUrl={pdfDrivePreviewUrl}
                comments={comments}
                draftComment={draftComment?.pageNumber === 1 ? draftComment : null}
                currentUserId={Number(userData?.user_id || 0)}
                annotationMode={annotationMode}
                isLocked={isLocked}
                onStartComment={handleStartComment}
                onSaveNewComment={handleSaveNewComment}
                onCancelDraft={() => setDraftComment(null)}
                onUpdateComment={handleUpdateComment}
                onMoveComment={handleMoveComment}
                onDeleteComment={handleDeleteComment}
              />
            ) : (
              <div className="flex min-h-[420px] flex-col items-center justify-center p-8 text-center text-slate-400">
                <FileText size={52} className="mb-4 text-slate-300" />
                <p className="font-bold">ยังไม่มีไฟล์ PDF สำหรับรายงานนี้</p>
              </div>
            )}
          </section>
        </div>

        <Footer />
      </main>
    </div>
  );
}

function DrivePreviewFallback({
  title,
  previewUrl,
  comments,
  draftComment,
  currentUserId,
  annotationMode,
  isLocked = false,
  onStartComment,
  onSaveNewComment,
  onCancelDraft,
  onUpdateComment,
  onMoveComment,
  onDeleteComment,
}: {
  title: string;
  previewUrl: string;
  comments: MeetingReportComment[];
  draftComment: DraftComment | null;
  currentUserId: number;
  annotationMode: AnnotationMode;
  isLocked?: boolean;
  onStartComment: (pageNumber: number, xPercent: number, yPercent: number, options?: { markerType?: 'point' | 'circle' | 'rect'; widthPercent?: number; heightPercent?: number }) => void;
  onSaveNewComment: (commentText: string) => Promise<void>;
  onCancelDraft: () => void;
  onUpdateComment: (commentId: number, commentText: string) => Promise<boolean>;
  onMoveComment: (commentId: number, pageNumber: number, xPercent: number, yPercent: number) => Promise<boolean>;
  onDeleteComment: (commentId: number) => Promise<boolean>;
}) {
  const visibleComments = comments.filter((comment) => Number(comment.page_number || 1) === 1);

  const handleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (annotationMode === 'off') return;
    const rect = event.currentTarget.getBoundingClientRect();
    const xPercent = ((event.clientX - rect.left) / rect.width) * 100;
    const yPercent = ((event.clientY - rect.top) / rect.height) * 100;
    const markerType = annotationMode === 'rect' ? 'rect' : annotationMode === 'circle' ? 'circle' : 'point';
    onStartComment(1, xPercent, yPercent, {
      markerType,
      widthPercent: markerType === 'point' ? 0 : 18,
      heightPercent: markerType === 'point' ? 0 : 8,
    });
  };

  return (
    <div className="grid gap-4 bg-slate-100 p-3 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="relative h-[78vh] min-h-[620px] w-full overflow-hidden bg-slate-100">
        <iframe
          title={title}
          src={previewUrl}
          className={`h-full w-full bg-slate-100 ${annotationMode !== 'off' ? 'pointer-events-none' : ''}`}
          allow="autoplay"
        />

        {visibleComments.map((comment) => (
          <CommentAnchorMarker
            key={`fallback-marker-${comment.comment_id}`}
            comment={comment}
            style={{
              left: `${Number(comment.x_percent || 0)}%`,
              top: `${Number(comment.y_percent || 0)}%`,
              width: `${Number(comment.width_percent || 0)}%`,
              height: `${Number(comment.height_percent || 0)}%`,
            }}
          />
        ))}

        {draftComment && (
          <>
            <DraftAnnotationMarker draftComment={draftComment} />
            <DraftCommentBubble
              style={{
                left: `${draftComment.markerType !== 'point' ? Math.min(draftComment.xPercent + draftComment.widthPercent + 1, 70) : Math.min(draftComment.xPercent, 70)}%`,
                top: `${draftComment.yPercent}%`,
              }}
              draftComment={draftComment}
              onSave={onSaveNewComment}
              onCancel={onCancelDraft}
            />
          </>
        )}

        {annotationMode !== 'off' && (
          <div
            onClick={handleClick}
            className="absolute inset-0 z-10 cursor-crosshair bg-amber-200/10"
            title="คลิกตำแหน่งที่ต้องการแจ้งแก้ไข"
          >
            <div className="absolute right-4 top-4 rounded-2xl border border-amber-200 bg-white/95 px-4 py-2 text-xs font-black text-amber-700 shadow-lg">
              {annotationMode === 'rect' ? 'คลิกบนเอกสารเพื่อวางกรอบสี่เหลี่ยม' : annotationMode === 'circle' ? 'คลิกบนเอกสารเพื่อวงจุดที่ต้องแก้ไข' : 'คลิกบนเอกสารเพื่อเพิ่มข้อความแจ้งแก้ไข'}
            </div>
          </div>
        )}
      </div>

      {visibleComments.length > 0 && (
        <div className="grid content-start gap-3 xl:sticky xl:top-6">
          {visibleComments.map((comment) => (
            <EditableCommentBubble
              key={`fallback-comment-${comment.comment_id}`}
              comment={comment}
              currentUserId={currentUserId}
              isLocked={isLocked}
              onUpdateComment={onUpdateComment}
              onMoveComment={onMoveComment}
              onDeleteComment={onDeleteComment}
              docked
              style={{
                left: `${Number(comment.x_percent || 0)}%`,
                top: `${Number(comment.y_percent || 0)}%`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PdfPage({
  pdfDoc,
  pageNumber,
  comments,
  allComments,
  draftComment,
  currentUserId,
  annotationMode,
  selectedCommentId,
  isLocked = false,
  onSelectComment,
  onStartComment,
  onSaveNewComment,
  onCancelDraft,
  onUpdateComment,
  onMoveComment,
  onResizeComment,
  onDeleteComment,
}: {
  pdfDoc: any;
  pageNumber: number;
  comments: MeetingReportComment[];
  allComments: MeetingReportComment[];
  draftComment: DraftComment | null;
  currentUserId: number;
  annotationMode: AnnotationMode;
  selectedCommentId: number | null;
  isLocked?: boolean;
  onSelectComment: (id: number | null) => void;
  onStartComment: (pageNumber: number, xPercent: number, yPercent: number, options?: { markerType?: 'point' | 'circle' | 'rect'; widthPercent?: number; heightPercent?: number }) => void;
  onSaveNewComment: (commentText: string) => Promise<void>;
  onCancelDraft: () => void;
  onUpdateComment: (commentId: number, commentText: string) => Promise<boolean>;
  onMoveComment: (commentId: number, pageNumber: number, xPercent: number, yPercent: number) => Promise<boolean>;
  onResizeComment: (commentId: number, widthPercent: number, heightPercent: number, xPercent?: number, yPercent?: number) => Promise<boolean>;
  onDeleteComment: (commentId: number) => Promise<boolean>;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const pageSurfaceRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<any>(null);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [drawSelection, setDrawSelection] = useState<DraftComment | null>(null);
  const sortedComments = useMemo(() => (
    [...comments].sort((a, b) => Number(a.y_percent || 0) - Number(b.y_percent || 0))
  ), [comments]);

  const renderPage = useCallback(async () => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }
    const page = await pdfDoc.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const availableWidth = Math.max(320, Math.min(wrapper.clientWidth || 900, 1120));
    const scale = Math.max(0.55, Math.min(1.65, availableWidth / baseViewport.width));
    const viewport = page.getViewport({ scale });
    const context = canvas.getContext('2d');
    if (!context) return;
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    setPageSize({ width: viewport.width, height: viewport.height });
    const renderTask = page.render({ canvasContext: context, viewport });
    renderTaskRef.current = renderTask;
    try {
      await renderTask.promise;
    } catch (error) {
      if (!(error instanceof Error) || error.name !== 'RenderingCancelledException') throw error;
    } finally {
      if (renderTaskRef.current === renderTask) renderTaskRef.current = null;
    }
  }, [pageNumber, pdfDoc]);

  useEffect(() => {
    void renderPage();
    const wrapper = wrapperRef.current;
    if (!wrapper) return undefined;
    const observer = new ResizeObserver(() => void renderPage());
    observer.observe(wrapper);
    return () => {
      observer.disconnect();
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
    };
  }, [renderPage]);

  const handleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (annotationMode !== 'point' || pageSize.width <= 0 || pageSize.height <= 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const xPercent = ((event.clientX - rect.left) / rect.width) * 100;
    const yPercent = ((event.clientY - rect.top) / rect.height) * 100;
    onStartComment(pageNumber, xPercent, yPercent, { markerType: 'point' });
  };

  const getPagePoint = (event: ReactPointerEvent<HTMLDivElement> | PointerEvent) => {
    const target = pageSurfaceRef.current;
    if (!target) return { xPercent: 0, yPercent: 0 };
    const rect = target.getBoundingClientRect();
    return {
      xPercent: Math.max(0, Math.min(((event.clientX - rect.left) / rect.width) * 100, 100)),
      yPercent: Math.max(0, Math.min(((event.clientY - rect.top) / rect.height) * 100, 100)),
    };
  };

  const startShapeDraw = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((annotationMode !== 'circle' && annotationMode !== 'rect') || pageSize.width <= 0 || pageSize.height <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const markerType = annotationMode;
    const start = getPagePoint(event);
    setDrawSelection({
      pageNumber,
      xPercent: start.xPercent,
      yPercent: start.yPercent,
      markerType,
      widthPercent: 0,
      heightPercent: 0,
    });

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const current = getPagePoint(moveEvent);
      setDrawSelection({
        pageNumber,
        xPercent: Math.min(start.xPercent, current.xPercent),
        yPercent: Math.min(start.yPercent, current.yPercent),
        markerType,
        widthPercent: Math.abs(current.xPercent - start.xPercent),
        heightPercent: Math.abs(current.yPercent - start.yPercent),
      });
    };
    const handlePointerUp = (upEvent: PointerEvent) => {
      const current = getPagePoint(upEvent);
      const xPercent = Math.min(start.xPercent, current.xPercent);
      const yPercent = Math.min(start.yPercent, current.yPercent);
      const widthPercent = Math.max(3, Math.abs(current.xPercent - start.xPercent));
      const heightPercent = Math.max(2, Math.abs(current.yPercent - start.yPercent));
      setDrawSelection(null);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      onStartComment(pageNumber, xPercent, yPercent, { markerType, widthPercent, heightPercent });
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
  };

  return (
    <div ref={wrapperRef} className="w-full max-w-[1480px]">
      <div className="mb-2 text-center text-xs font-black text-slate-400">หน้า {pageNumber.toLocaleString('th-TH')}</div>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1120px)_320px]">
        <div
          ref={pageSurfaceRef}
          onClick={handleClick}
          onPointerDown={startShapeDraw}
          className={`relative mx-auto overflow-visible bg-white shadow-xl shadow-slate-900/10 ring-1 ring-slate-200 xl:mx-0 ${annotationMode !== 'off' ? 'cursor-crosshair' : ''}`}
          style={{ width: pageSize.width || '100%', minHeight: pageSize.height || 520 }}
        >
          <canvas ref={canvasRef} className="block max-w-full" />
          {sortedComments.map((comment, idx) => {
            const mt = comment.marker_type || 'point';
            const isShape = mt === 'circle' || mt === 'rect';
            const canEditMarker = Number(comment.user_id) === currentUserId && !isLocked;
            if (isShape) {
              return (
                <InteractiveShapeMarker
                  key={`shape-${comment.comment_id}`}
                  comment={comment}
                  index={idx}
                  canEdit={canEditMarker}
                  isSelected={selectedCommentId === comment.comment_id}
                  pageSurfaceRef={pageSurfaceRef}
                  onMoveComment={onMoveComment}
                  onResizeComment={onResizeComment}
                  onSelect={onSelectComment}
                />
              );
            }
            return (
              <CommentAnchorMarker
                key={`anchor-${comment.comment_id}`}
                comment={comment}
                style={{
                  left: `${Number(comment.x_percent || 0)}%`,
                  top: `${Number(comment.y_percent || 0)}%`,
                  width: `${Number(comment.width_percent || 0)}%`,
                  height: `${Number(comment.height_percent || 0)}%`,
                }}
              />
            );
          })}
          {drawSelection && <DraftAnnotationMarker draftComment={drawSelection} />}
          {draftComment && (
            <>
              <DraftAnnotationMarker draftComment={draftComment} />
              <DraftCommentBubble
                style={{
                  left: `${draftComment.markerType !== 'point' ? Math.min(draftComment.xPercent + draftComment.widthPercent + 1, 74) : draftComment.xPercent}%`,
                  top: `${draftComment.yPercent}%`,
                }}
                draftComment={draftComment}
                onSave={onSaveNewComment}
                onCancel={onCancelDraft}
              />
            </>
          )}
        </div>

        <div className="hidden xl:block">
          <div className="sticky top-6 grid gap-4">
            <FieldSidebarPanel
              comments={allComments}
              currentUserId={currentUserId}
              selectedCommentId={selectedCommentId}
              onSelect={(id) => onSelectComment(id)}
              onDelete={onDeleteComment}
            />
            {sortedComments.map((comment) => (
              <EditableCommentBubble
                key={comment.comment_id}
                comment={comment}
                currentUserId={currentUserId}
                isLocked={isLocked}
                onUpdateComment={onUpdateComment}
                onMoveComment={onMoveComment}
                onDeleteComment={onDeleteComment}
                dragBoundsRef={pageSurfaceRef}
                docked
                style={{
                  left: `${Number(comment.x_percent || 0)}%`,
                  top: `${Number(comment.y_percent || 0)}%`,
                }}
              />
            ))}
          </div>
        </div>

        {sortedComments.length > 0 && (
          <div className="grid gap-3 xl:hidden">
            {sortedComments.map((comment) => (
              <EditableCommentBubble
                key={`mobile-${comment.comment_id}`}
                comment={comment}
                currentUserId={currentUserId}
                isLocked={isLocked}
                onUpdateComment={onUpdateComment}
                onMoveComment={onMoveComment}
                onDeleteComment={onDeleteComment}
                dragBoundsRef={pageSurfaceRef}
                docked
                style={{
                  left: `${Number(comment.x_percent || 0)}%`,
                  top: `${Number(comment.y_percent || 0)}%`,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CommentAnchorMarker({ comment, style }: { comment: MeetingReportComment; style: CSSProperties }) {
  const markerType = comment.marker_type || 'point';
  const isShape = markerType === 'circle' || markerType === 'rect';
  const label = Number(comment.comment_id || 0).toLocaleString('th-TH');

  if (isShape) {
    return (
      <div className="pointer-events-none absolute z-20" style={style} title={comment.comment_text}>
        <span className="absolute -left-3 -top-3 z-10 flex h-6 min-w-6 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-black text-white shadow ring-2 ring-white">
          {label}
        </span>
        <ShapeOutline markerType={markerType} />
      </div>
    );
  }

  return (
    <div
      className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2"
      style={style}
      title={comment.comment_text}
    >
      <span className="flex h-7 min-w-7 items-center justify-center rounded-full border-2 border-white bg-amber-500 px-1 text-[10px] font-black text-white shadow-lg shadow-amber-900/20 ring-2 ring-amber-300">
        {label}
      </span>
      <span className="absolute left-7 top-1/2 h-px w-10 bg-amber-300" />
    </div>
  );
}

function DraftAnnotationMarker({ draftComment }: { draftComment: DraftComment }) {
  if (draftComment.markerType !== 'circle' && draftComment.markerType !== 'rect') return null;
  return (
    <div
      className="pointer-events-none absolute z-30"
      style={{
        left: `${draftComment.xPercent}%`,
        top: `${draftComment.yPercent}%`,
        width: `${draftComment.widthPercent}%`,
        height: `${draftComment.heightPercent}%`,
      }}
    >
      <ShapeOutline markerType={draftComment.markerType} isDraft />
    </div>
  );
}

function ShapeOutline({ markerType, isDraft = false }: { markerType: 'circle' | 'rect'; isDraft?: boolean }) {
  const stroke = markerType === 'circle' ? '#f43f5e' : '#2563eb';
  return (
    <svg
      aria-hidden="true"
      className="block h-full min-h-8 w-full min-w-10 overflow-visible drop-shadow-[0_0_0_rgba(255,255,255,0.95)]"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      {markerType === 'circle' ? (
        <ellipse
          cx="50"
          cy="50"
          rx="48"
          ry="48"
          fill={isDraft ? 'rgba(244,63,94,0.08)' : 'rgba(244,63,94,0.06)'}
          stroke={stroke}
          strokeWidth="4"
          vectorEffect="non-scaling-stroke"
        />
      ) : (
        <rect
          x="2"
          y="2"
          width="96"
          height="96"
          rx="4"
          fill={isDraft ? 'rgba(37,99,235,0.08)' : 'rgba(37,99,235,0.06)'}
          stroke={stroke}
          strokeWidth="4"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}

function EditableCommentBubble({
  comment,
  currentUserId,
  style,
  onUpdateComment,
  onMoveComment,
  onDeleteComment,
  dragBoundsRef,
  docked = false,
  isLocked = false,
}: {
  comment: MeetingReportComment;
  currentUserId: number;
  style?: CSSProperties;
  onUpdateComment: (commentId: number, commentText: string) => Promise<boolean>;
  onMoveComment: (commentId: number, pageNumber: number, xPercent: number, yPercent: number) => Promise<boolean>;
  onDeleteComment: (commentId: number) => Promise<boolean>;
  dragBoundsRef?: RefObject<HTMLDivElement | null>;
  docked?: boolean;
  isLocked?: boolean;
}) {
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(comment.comment_text);
  const [isSaving, setIsSaving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({
    xPercent: Number(comment.x_percent || 0),
    yPercent: Number(comment.y_percent || 0),
  });
  const canEdit = Number(comment.user_id) === currentUserId && !isLocked;

  useEffect(() => {
    setText(comment.comment_text);
    setPosition({
      xPercent: Number(comment.x_percent || 0),
      yPercent: Number(comment.y_percent || 0),
    });
  }, [comment.comment_text, comment.x_percent, comment.y_percent]);

  const save = async () => {
    if (!canEdit || isSaving) return;
    const nextText = text.trim();
    if (!nextText) return;
    if (nextText === comment.comment_text.trim()) {
      setIsEditing(false);
      return;
    }
    setIsSaving(true);
    const ok = await onUpdateComment(comment.comment_id, nextText);
    setIsSaving(false);
    if (ok) setIsEditing(false);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      void save();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setText(comment.comment_text);
      setIsEditing(false);
    }
  };

  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!canEdit || isEditing || isSaving) return;
    event.preventDefault();
    event.stopPropagation();
    const parent = dragBoundsRef?.current || bubbleRef.current?.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const anchorX = rect.left + (position.xPercent / 100) * rect.width;
    const anchorY = rect.top + (position.yPercent / 100) * rect.height;
    const offsetX = event.clientX - anchorX;
    const offsetY = event.clientY - anchorY;
    setIsDragging(true);

    const updatePosition = (clientX: number, clientY: number) => {
      const nextX = Math.max(1, Math.min(((clientX - offsetX - rect.left) / rect.width) * 100, 98));
      const nextY = Math.max(1, Math.min(((clientY - offsetY - rect.top) / rect.height) * 100, 98));
      setPosition({ xPercent: nextX, yPercent: nextY });
      return { xPercent: nextX, yPercent: nextY };
    };

    let latest = updatePosition(event.clientX, event.clientY);
    const handlePointerMove = (moveEvent: PointerEvent) => {
      latest = updatePosition(moveEvent.clientX, moveEvent.clientY);
    };
    const handlePointerUp = async (upEvent: PointerEvent) => {
      latest = updatePosition(upEvent.clientX, upEvent.clientY);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      setIsDragging(false);
      const ok = await onMoveComment(comment.comment_id, Number(comment.page_number || 1), latest.xPercent, latest.yPercent);
      if (!ok) {
        setPosition({
          xPercent: Number(comment.x_percent || 0),
          yPercent: Number(comment.y_percent || 0),
        });
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
  };

  return (
    <div
      ref={bubbleRef}
      className={`${docked ? 'relative w-full min-w-0' : 'absolute z-30 w-[300px] max-w-[calc(100%-1rem)] -translate-x-3 -translate-y-3'} rounded-2xl border border-amber-200 bg-amber-50/95 p-3 text-left shadow-lg backdrop-blur ${isDragging ? 'scale-[1.02] ring-2 ring-amber-300' : ''} ${canEdit ? 'cursor-text' : 'cursor-default'}`}
      style={docked ? undefined : { ...style, left: `${position.xPercent}%`, top: `${position.yPercent}%` }}
      onClick={(event) => {
        event.stopPropagation();
        if (canEdit) setIsEditing(true);
      }}
      title={canEdit ? 'คลิกเพื่อแก้ไข หรือลากเพื่อย้ายตำแหน่ง' : 'ข้อความแจ้งแก้ไข'}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs font-black text-amber-800">{comment.Name_Surname || 'ผู้ใช้งาน'}</p>
        {canEdit && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onPointerDown={startDrag}
              onClick={(event) => event.stopPropagation()}
              className="inline-flex h-7 w-7 cursor-grab items-center justify-center rounded-lg text-amber-700 hover:bg-amber-100 active:cursor-grabbing"
              title="ลากเพื่อย้ายตำแหน่ง"
            >
              <GripVertical size={15} />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void onDeleteComment(comment.comment_id);
              }}
              className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-red-500 hover:bg-red-50"
              title="ลบข้อความแจ้งแก้ไข"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>
      {isEditing ? (
        <div className="mt-2 grid gap-2">
          <textarea
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={handleKeyDown}
            rows={4}
            className="w-full resize-none rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-semibold leading-5 text-slate-800 outline-none focus:ring-2 focus:ring-amber-300"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setText(comment.comment_text);
                setIsEditing(false);
              }}
              className="rounded-lg px-3 py-1.5 text-xs font-black text-slate-500 hover:bg-slate-100"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void save();
              }}
              disabled={isSaving || !text.trim()}
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-black text-white disabled:opacity-50"
            >
              {isSaving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-1 whitespace-pre-line break-words text-xs font-semibold leading-5 text-slate-700">{comment.comment_text}</p>
          {canEdit && <p className="mt-2 text-[10px] font-black text-amber-600">คลิกเพื่อแก้ไข หรือจับไอคอนเพื่อย้าย</p>}
        </>
      )}
    </div>
  );
}

function DraftCommentBubble({
  style,
  draftComment,
  onSave,
  onCancel,
}: {
  style: CSSProperties;
  draftComment: DraftComment;
  onSave: (commentText: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [text, setText] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const save = async () => {
    if (!text.trim() || isSaving) return;
    setIsSaving(true);
    await onSave(text);
    setIsSaving(false);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      void save();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  };

  return (
    <div
      className="absolute z-40 w-[300px] -translate-x-3 -translate-y-3 rounded-2xl border border-blue-200 bg-white p-3 text-left shadow-xl shadow-blue-900/10"
      style={style}
      onClick={(event) => event.stopPropagation()}
    >
      <p className="text-xs font-black text-blue-700">
        {draftComment.markerType === 'circle'
          ? 'คอมเมนต์สำหรับจุดที่วงไว้'
          : draftComment.markerType === 'rect'
            ? 'คอมเมนต์สำหรับกรอบสี่เหลี่ยม'
            : 'ข้อความแจ้งแก้ไขใหม่'}
      </p>
      <textarea
        autoFocus
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
        rows={4}
        placeholder="พิมพ์ข้อความเหมือนคอมเมนต์ใน Word..."
        className="mt-2 w-full resize-none rounded-xl border border-blue-100 bg-blue-50/40 px-3 py-2 text-xs font-semibold leading-5 text-slate-800 outline-none focus:bg-white focus:ring-2 focus:ring-blue-300"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-xs font-black text-slate-500 hover:bg-slate-100"
        >
          ยกเลิก
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={isSaving || !text.trim()}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-black text-white disabled:opacity-50"
        >
          {isSaving ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
      </div>
    </div>
  );
}

function InteractiveShapeMarker({
  comment,
  index,
  canEdit,
  isSelected,
  pageSurfaceRef,
  onMoveComment,
  onResizeComment,
  onSelect,
}: {
  comment: MeetingReportComment;
  index: number;
  canEdit: boolean;
  isSelected: boolean;
  pageSurfaceRef: RefObject<HTMLDivElement | null>;
  onMoveComment: (commentId: number, pageNumber: number, xPercent: number, yPercent: number) => Promise<boolean>;
  onResizeComment: (commentId: number, widthPercent: number, heightPercent: number, xPercent?: number, yPercent?: number) => Promise<boolean>;
  onSelect: (id: number | null) => void;
}) {
  const markerType = (comment.marker_type || 'rect') as 'circle' | 'rect';
  const label = String(index + 1);

  const [pos, setPos] = useState({ x: Number(comment.x_percent || 0), y: Number(comment.y_percent || 0) });
  const [dim, setDim] = useState({ w: Number(comment.width_percent || 10), h: Number(comment.height_percent || 5) });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    setPos({ x: Number(comment.x_percent || 0), y: Number(comment.y_percent || 0) });
    setDim({ w: Number(comment.width_percent || 10), h: Number(comment.height_percent || 5) });
  }, [comment.x_percent, comment.y_percent, comment.width_percent, comment.height_percent]);

  const toPagePct = useCallback((e: PointerEvent | ReactPointerEvent<HTMLDivElement>) => {
    const el = pageSurfaceRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(((e.clientX - r.left) / r.width) * 100, 100)),
      y: Math.max(0, Math.min(((e.clientY - r.top) / r.height) * 100, 100)),
    };
  }, [pageSurfaceRef]);

  const handleDragStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!canEdit || isResizing) return;
    e.preventDefault();
    e.stopPropagation();
    const start = toPagePct(e);
    const ox = start.x - pos.x;
    const oy = start.y - pos.y;
    setIsDragging(true);
    onSelect(comment.comment_id);
    let latest = { x: pos.x, y: pos.y };

    const move = (me: PointerEvent) => {
      const p = toPagePct(me);
      latest = {
        x: Math.max(0, Math.min(p.x - ox, 100 - dim.w)),
        y: Math.max(0, Math.min(p.y - oy, 100 - dim.h)),
      };
      setPos(latest);
    };
    const up = async () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setIsDragging(false);
      const ok = await onMoveComment(comment.comment_id, Number(comment.page_number || 1), latest.x, latest.y);
      if (!ok) setPos({ x: Number(comment.x_percent || 0), y: Number(comment.y_percent || 0) });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  };

  const handleResizeStart = (e: ReactPointerEvent<HTMLDivElement>, corner: string) => {
    if (!canEdit) return;
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    onSelect(comment.comment_id);
    const start = toPagePct(e);
    const sp = { ...pos };
    const sd = { ...dim };
    let latestPos = { ...pos };
    let latestDim = { ...dim };

    const move = (me: PointerEvent) => {
      const p = toPagePct(me);
      const dx = p.x - start.x;
      const dy = p.y - start.y;
      let nx = sp.x, ny = sp.y, nw = sd.w, nh = sd.h;
      
      if (corner.includes('r')) nw = Math.max(3, Math.min(sd.w + dx, 100 - sp.x));
      if (corner.includes('l')) {
        const targetX = Math.max(0, Math.min(sp.x + dx, sp.x + sd.w - 3));
        nw = sd.w + (sp.x - targetX);
        nx = targetX;
      }
      if (corner.includes('b')) nh = Math.max(2, Math.min(sd.h + dy, 100 - sp.y));
      if (corner.includes('t')) {
        const targetY = Math.max(0, Math.min(sp.y + dy, sp.y + sd.h - 2));
        nh = sd.h + (sp.y - targetY);
        ny = targetY;
      }
      
      latestPos = { x: nx, y: ny };
      latestDim = { w: nw, h: nh };
      setPos(latestPos);
      setDim(latestDim);
    };
    const up = async () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setIsResizing(false);
      const posChanged = Math.abs(latestPos.x - sp.x) > 0.5 || Math.abs(latestPos.y - sp.y) > 0.5;
      if (posChanged) {
        await onResizeComment(comment.comment_id, latestDim.w, latestDim.h, latestPos.x, latestPos.y);
      } else {
        await onResizeComment(comment.comment_id, latestDim.w, latestDim.h);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  };

  return (
    <div
      className={`absolute z-20 transition-shadow ${canEdit ? 'cursor-move' : ''} ${isDragging ? 'z-30 opacity-75 shadow-2xl' : ''} ${isResizing ? 'z-30' : ''} ${isSelected && !isDragging ? 'z-30' : ''}`}
      style={{ left: `${pos.x}%`, top: `${pos.y}%`, width: `${dim.w}%`, height: `${dim.h}%` }}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (canEdit && !isResizing) {
          handleDragStart(e);
        }
      }}
      onClick={(e) => { e.stopPropagation(); onSelect(comment.comment_id); }}
      title={comment.comment_text || `กรอบ #${label}`}
    >
      <span className="absolute -left-3 -top-3 z-10 flex h-6 min-w-6 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-black text-white shadow ring-2 ring-white">
        {label}
      </span>
      <ShapeOutline markerType={markerType} />
      {isSelected && (
        <div className="pointer-events-none absolute inset-0 rounded-sm ring-2 ring-blue-500 ring-offset-1" />
      )}
      {canEdit && (isSelected || isDragging) && (
        <>
          <ResizeHandle corner="tl" onPointerDown={(e) => handleResizeStart(e, 'tl')} />
          <ResizeHandle corner="tr" onPointerDown={(e) => handleResizeStart(e, 'tr')} />
          <ResizeHandle corner="bl" onPointerDown={(e) => handleResizeStart(e, 'bl')} />
          <ResizeHandle corner="br" onPointerDown={(e) => handleResizeStart(e, 'br')} />
        </>
      )}
    </div>
  );
}

function ResizeHandle({ corner, onPointerDown }: { corner: string; onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void }) {
  const cls: Record<string, string> = {
    tl: '-left-1.5 -top-1.5 cursor-nw-resize',
    tr: '-right-1.5 -top-1.5 cursor-ne-resize',
    bl: '-left-1.5 -bottom-1.5 cursor-sw-resize',
    br: '-right-1.5 -bottom-1.5 cursor-se-resize',
  };
  return (
    <div
      className={`absolute z-40 h-3.5 w-3.5 rounded-full border-2 border-white bg-blue-500 shadow-md transition hover:scale-125 hover:bg-blue-600 ${cls[corner] || ''}`}
      onPointerDown={onPointerDown}
    />
  );
}

function FieldSidebarPanel({
  comments,
  currentUserId,
  selectedCommentId,
  onSelect,
  onDelete,
}: {
  comments: MeetingReportComment[];
  currentUserId: number;
  selectedCommentId: number | null;
  onSelect: (id: number | null) => void;
  onDelete: (commentId: number) => Promise<boolean>;
}) {
  if (comments.length === 0) return null;

  const markerLabel: Record<string, string> = { point: 'จุดแก้ไข', circle: 'วงจุดแก้ไข', rect: 'กรอบสี่เหลี่ยม' };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-400">
        <FileText size={14} /> FIELD ที่วางแล้ว
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700">{comments.length}</span>
      </h3>
      <div className="grid gap-2 max-h-[420px] overflow-y-auto">
        {comments.map((c, idx) => {
          const mt = c.marker_type || 'point';
          const isOwner = Number(c.user_id) === currentUserId;
          const isActive = selectedCommentId === c.comment_id;
          return (
            <div
              key={c.comment_id}
              onClick={() => onSelect(isActive ? null : c.comment_id)}
              className={`group flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 text-left transition ${isActive ? 'bg-blue-50 ring-2 ring-blue-300' : 'bg-slate-50 hover:bg-slate-100'}`}
            >
              <span className={`mt-0.5 shrink-0 rounded-lg p-1.5 ${mt === 'rect' ? 'bg-blue-100 text-blue-600' : mt === 'circle' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'}`}>
                {mt === 'circle' ? <Circle size={14} /> : mt === 'rect' ? <Square size={14} /> : <MousePointer2 size={14} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black text-slate-700">
                  {markerLabel[mt] || mt} <span className="text-blue-500">#{idx + 1}</span>
                </p>
                <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-400">
                  หน้า {Number(c.page_number || 1).toLocaleString('th-TH')} · {c.Name_Surname || 'ผู้ใช้งาน'}
                </p>
                {c.comment_text && (
                  <p className="mt-1 truncate text-[11px] font-semibold italic text-slate-500">
                    {c.comment_text.slice(0, 40)}{c.comment_text.length > 40 ? '...' : ''}
                  </p>
                )}
              </div>
              {isOwner && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); void onDelete(c.comment_id); }}
                  className="shrink-0 rounded-lg p-1.5 text-red-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                  title="ลบ"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InfoBox({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4 shadow-sm">
      <span className="text-blue-600">{icon}</span>
      <p className="mt-2 text-xs font-black text-slate-400">{label}</p>
      <p className="text-sm font-black text-slate-800">{value}</p>
    </div>
  );
}
