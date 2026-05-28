import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { ArrowLeft, CheckCircle2, FileText, Loader2, MessageSquare, MousePointer2, Timer } from 'lucide-react';
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
};

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
  const [isCommentMode, setIsCommentMode] = useState(false);
  const [draftComment, setDraftComment] = useState<DraftComment | null>(null);
  const [readLogId, setReadLogId] = useState<number | null>(null);
  const [readingSeconds, setReadingSeconds] = useState(0);
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

  const handleStartComment = (pageNumber: number, xPercent: number, yPercent: number) => {
    setDraftComment({ pageNumber, xPercent, yPercent });
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
                  onClick={() => setIsCommentMode((value) => !value)}
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-2xl px-4 py-2 text-sm font-black transition ${isCommentMode ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                >
                  <MousePointer2 size={16} /> {isCommentMode ? 'กำลังคอมเมนต์' : 'คอมเมนต์บน PDF'}
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
              <div className="flex flex-col items-center gap-6 bg-slate-100 px-2 py-6 sm:px-6">
                {Array.from({ length: pageCount }, (_, index) => (
                  <PdfPage
                    key={index + 1}
                    pdfDoc={pdfDoc}
                    pageNumber={index + 1}
                    comments={comments.filter((comment) => Number(comment.page_number) === index + 1)}
                    draftComment={draftComment?.pageNumber === index + 1 ? draftComment : null}
                    currentUserId={Number(userData?.user_id || 0)}
                    isCommentMode={isCommentMode}
                    onStartComment={handleStartComment}
                    onSaveNewComment={handleSaveNewComment}
                    onCancelDraft={() => setDraftComment(null)}
                    onUpdateComment={handleUpdateComment}
                  />
                ))}
              </div>
            ) : pdfDrivePreviewUrl ? (
              <DrivePreviewFallback
                title={report.title}
                previewUrl={pdfDrivePreviewUrl}
                comments={comments}
                draftComment={draftComment?.pageNumber === 1 ? draftComment : null}
                currentUserId={Number(userData?.user_id || 0)}
                isCommentMode={isCommentMode}
                onStartComment={handleStartComment}
                onSaveNewComment={handleSaveNewComment}
                onCancelDraft={() => setDraftComment(null)}
                onUpdateComment={handleUpdateComment}
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
  isCommentMode,
  onStartComment,
  onSaveNewComment,
  onCancelDraft,
  onUpdateComment,
}: {
  title: string;
  previewUrl: string;
  comments: MeetingReportComment[];
  draftComment: DraftComment | null;
  currentUserId: number;
  isCommentMode: boolean;
  onStartComment: (pageNumber: number, xPercent: number, yPercent: number) => void;
  onSaveNewComment: (commentText: string) => Promise<void>;
  onCancelDraft: () => void;
  onUpdateComment: (commentId: number, commentText: string) => Promise<boolean>;
}) {
  const visibleComments = comments.filter((comment) => Number(comment.page_number || 1) === 1);

  const handleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!isCommentMode) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const xPercent = ((event.clientX - rect.left) / rect.width) * 100;
    const yPercent = ((event.clientY - rect.top) / rect.height) * 100;
    onStartComment(1, xPercent, yPercent);
  };

  return (
    <div className="relative h-[78vh] min-h-[620px] w-full bg-slate-100">
      <iframe
        title={title}
        src={previewUrl}
        className={`h-full w-full bg-slate-100 ${isCommentMode ? 'pointer-events-none' : ''}`}
        allow="autoplay"
      />

      {visibleComments.map((comment) => (
        <EditableCommentBubble
          key={comment.comment_id}
          comment={comment}
          currentUserId={currentUserId}
          onUpdateComment={onUpdateComment}
          style={{
            left: `${Number(comment.x_percent || 0)}%`,
            top: `${Number(comment.y_percent || 0)}%`,
          }}
        />
      ))}

      {draftComment && (
        <DraftCommentBubble
          style={{
            left: `${draftComment.xPercent}%`,
            top: `${draftComment.yPercent}%`,
          }}
          onSave={onSaveNewComment}
          onCancel={onCancelDraft}
        />
      )}

      {isCommentMode && (
        <div
          onClick={handleClick}
          className="absolute inset-0 z-10 cursor-crosshair bg-amber-200/10"
          title="คลิกตำแหน่งที่ต้องการแจ้งแก้ไข"
        >
          <div className="absolute right-4 top-4 rounded-2xl border border-amber-200 bg-white/95 px-4 py-2 text-xs font-black text-amber-700 shadow-lg">
            คลิกบนเอกสารเพื่อเพิ่มข้อความแจ้งแก้ไข
          </div>
        </div>
      )}
    </div>
  );
}

function PdfPage({
  pdfDoc,
  pageNumber,
  comments,
  draftComment,
  currentUserId,
  isCommentMode,
  onStartComment,
  onSaveNewComment,
  onCancelDraft,
  onUpdateComment,
}: {
  pdfDoc: any;
  pageNumber: number;
  comments: MeetingReportComment[];
  draftComment: DraftComment | null;
  currentUserId: number;
  isCommentMode: boolean;
  onStartComment: (pageNumber: number, xPercent: number, yPercent: number) => void;
  onSaveNewComment: (commentText: string) => Promise<void>;
  onCancelDraft: () => void;
  onUpdateComment: (commentId: number, commentText: string) => Promise<boolean>;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<any>(null);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });

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
    if (!isCommentMode || pageSize.width <= 0 || pageSize.height <= 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const xPercent = ((event.clientX - rect.left) / rect.width) * 100;
    const yPercent = ((event.clientY - rect.top) / rect.height) * 100;
    onStartComment(pageNumber, xPercent, yPercent);
  };

  return (
    <div ref={wrapperRef} className="w-full max-w-[1120px]">
      <div className="mb-2 text-center text-xs font-black text-slate-400">หน้า {pageNumber.toLocaleString('th-TH')}</div>
      <div
        onClick={handleClick}
        className={`relative mx-auto overflow-hidden bg-white shadow-xl shadow-slate-900/10 ring-1 ring-slate-200 ${isCommentMode ? 'cursor-crosshair' : ''}`}
        style={{ width: pageSize.width || '100%', minHeight: pageSize.height || 520 }}
      >
        <canvas ref={canvasRef} className="block max-w-full" />
        {comments.map((comment) => (
          <EditableCommentBubble
            key={comment.comment_id}
            comment={comment}
            currentUserId={currentUserId}
            onUpdateComment={onUpdateComment}
            style={{
              left: `${Number(comment.x_percent || 0)}%`,
              top: `${Number(comment.y_percent || 0)}%`,
            }}
          />
        ))}
        {draftComment && (
          <DraftCommentBubble
            style={{
              left: `${draftComment.xPercent}%`,
              top: `${draftComment.yPercent}%`,
            }}
            onSave={onSaveNewComment}
            onCancel={onCancelDraft}
          />
        )}
      </div>
    </div>
  );
}

function EditableCommentBubble({
  comment,
  currentUserId,
  style,
  onUpdateComment,
}: {
  comment: MeetingReportComment;
  currentUserId: number;
  style: CSSProperties;
  onUpdateComment: (commentId: number, commentText: string) => Promise<boolean>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(comment.comment_text);
  const [isSaving, setIsSaving] = useState(false);
  const canEdit = Number(comment.user_id) === currentUserId;

  useEffect(() => {
    setText(comment.comment_text);
  }, [comment.comment_text]);

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

  return (
    <div
      className={`absolute z-30 max-w-[300px] -translate-x-3 -translate-y-3 rounded-2xl border border-amber-200 bg-amber-50/95 p-3 text-left shadow-lg backdrop-blur ${canEdit ? 'cursor-text' : 'cursor-default'}`}
      style={style}
      onClick={(event) => {
        event.stopPropagation();
        if (canEdit) setIsEditing(true);
      }}
      title={canEdit ? 'คลิกเพื่อแก้ไขข้อความนี้' : 'ข้อความแจ้งแก้ไข'}
    >
      <p className="text-xs font-black text-amber-800">{comment.Name_Surname || 'ผู้ใช้งาน'}</p>
      {isEditing ? (
        <div className="mt-2 grid gap-2">
          <textarea
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={handleKeyDown}
            rows={4}
            className="w-[260px] resize-none rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-semibold leading-5 text-slate-800 outline-none focus:ring-2 focus:ring-amber-300"
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
          {canEdit && <p className="mt-2 text-[10px] font-black text-amber-600">คลิกเพื่อแก้ไข</p>}
        </>
      )}
    </div>
  );
}

function DraftCommentBubble({
  style,
  onSave,
  onCancel,
}: {
  style: CSSProperties;
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
      <p className="text-xs font-black text-blue-700">ข้อความแจ้งแก้ไขใหม่</p>
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

function InfoBox({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4 shadow-sm">
      <span className="text-blue-600">{icon}</span>
      <p className="mt-2 text-xs font-black text-slate-400">{label}</p>
      <p className="text-sm font-black text-slate-800">{value}</p>
    </div>
  );
}
