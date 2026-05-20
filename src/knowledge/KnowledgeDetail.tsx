import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeft, CalendarDays, Eye, FileText, LibraryBig, Timer } from 'lucide-react';
import Header from '../Header';
import LeftSide from '../LeftSide';
import Footer from '../Footer';
import { API_BASE } from '../lib/apiConfig';
import { closeSession, getSessionId, stopHeartbeat } from '../lib/activityTracker';
import { formatDuration, formatThaiDate, getDriveFileProxyUrl, getKnowledgeAssetUrl, type KnowledgeItem } from './knowledgeUtils';

function getStoredUser() {
  try {
    const savedUser = localStorage.getItem('user');
    return savedUser && savedUser !== 'undefined' ? JSON.parse(savedUser) : null;
  } catch {
    return null;
  }
}

export default function KnowledgeDetail({ itemId }: { itemId: number }) {
  const [userData, setUserData] = useState<any>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [item, setItem] = useState<KnowledgeItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [readLogId, setReadLogId] = useState<number | null>(null);
  const [readingSeconds, setReadingSeconds] = useState(0);
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const activeStartRef = useRef<number | null>(null);
  const viewerVisibleRef = useRef(false);
  const startedRef = useRef(false);
  const userIdRef = useRef<number | null>(null);

  const loadItem = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/knowledge/items/${itemId}`);
      if (!res.ok) throw new Error('Cannot load knowledge item');
      setItem(await res.json());
    } catch (error) {
      console.error(error);
      setItem(null);
    } finally {
      setIsLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    const parsedUser = getStoredUser();
    if (parsedUser) {
      setUserData(parsedUser);
      userIdRef.current = parsedUser.user_id || null;
    }
    const handleResize = () => setIsSidebarOpen(window.innerWidth >= 1024);
    handleResize();
    window.addEventListener('resize', handleResize);
    void loadItem();
    return () => window.removeEventListener('resize', handleResize);
  }, [loadItem]);

  const pdfUrl = useMemo(() => {
    if (!item) return '';
    if (item.pdf_proxy_url) return getKnowledgeAssetUrl(item.pdf_proxy_url);
    if (item.pdf_file_id) return getDriveFileProxyUrl(item.pdf_file_id);
    return getKnowledgeAssetUrl(item.pdf_url);
  }, [item]);

  const shouldTrackReading = useCallback(() => {
    return document.visibilityState === 'visible' && document.hasFocus() && viewerVisibleRef.current;
  }, []);

  const sendReadingTime = useCallback((seconds: number, useBeacon = false) => {
    const logId = readLogId;
    const userId = userIdRef.current;
    if (!logId || !userId || seconds <= 0) return;
    const payload = JSON.stringify({ user_id: userId, seconds });
    const url = `${API_BASE}/api/knowledge/read-logs/${logId}/time`;
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
    const elapsed = Math.floor((Date.now() - activeStartRef.current) / 1000);
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
    if (!item || !userData?.user_id || startedRef.current) return;
    startedRef.current = true;
    fetch(`${API_BASE}/api/knowledge/items/${itemId}/read/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userData.user_id, session_id: getSessionId() }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.log_id) {
          setReadLogId(Number(data.log_id));
          setItem((current) => current ? { ...current, view_count: Number(current.view_count || 0) + 1 } : current);
        }
      })
      .catch(() => undefined);
  }, [item, itemId, userData?.user_id]);

  useEffect(() => {
    if (!readLogId || !pdfUrl) return;
    const viewer = viewerRef.current;
    if (!viewer) return;

    const observer = new IntersectionObserver((entries) => {
      viewerVisibleRef.current = (entries[0]?.intersectionRatio || 0) >= 0.5;
      syncTracking();
    }, { threshold: [0, 0.25, 0.5, 0.75, 1] });
    observer.observe(viewer);

    const handleVisibility = () => syncTracking();
    const handleFocus = () => syncTracking();
    const handleBlur = () => syncTracking();
    const handlePageHide = () => pauseTracking(true);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('beforeunload', handlePageHide);
    window.addEventListener('pagehide', handlePageHide);

    const timer = window.setInterval(() => {
      if (shouldTrackReading() && activeStartRef.current) {
        const elapsed = Math.floor((Date.now() - activeStartRef.current) / 1000);
        if (elapsed > 0) {
          activeStartRef.current = Date.now();
          sendReadingTime(elapsed);
        }
      } else {
        pauseTracking();
      }
    }, 15_000);

    syncTracking();

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
    };
  }, [pauseTracking, pdfUrl, readLogId, sendReadingTime, shouldTrackReading, syncTracking]);

  const handleLogout = async () => {
    pauseTracking(true);
    stopHeartbeat();
    await closeSession();
    localStorage.removeItem('user');
    window.location.href = '/';
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadItem().finally(() => setIsRefreshing(false));
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-500">
        <div className="text-center font-bold">กำลังโหลดคลังความรู้...</div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 p-6 text-center">
        <div>
          <LibraryBig className="mx-auto mb-4 text-slate-300" size={54} />
          <p className="text-lg font-black text-slate-700">ไม่พบเรื่องในคลังความรู้</p>
          <a href="/knowledge" className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white">
            <ArrowLeft size={16} /> กลับไปคลังความรู้
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8fafc] text-slate-900">
      <LeftSide userData={userData} isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} handleLogout={handleLogout} />

      <main className="z-10 flex h-full flex-1 flex-col overflow-y-auto">
        <Header setIsSidebarOpen={setIsSidebarOpen} handleRefresh={handleRefresh} isRefreshing={isRefreshing} handleLogout={handleLogout} />

        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-4 py-8 sm:px-8">
          <a href="/knowledge" className="inline-flex w-fit items-center gap-2 text-sm font-bold text-blue-600 hover:underline">
            <ArrowLeft size={16} /> กลับไปคลังความรู้
          </a>

          <section className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.10)]">
            <div className="grid lg:grid-cols-[420px_minmax(0,1fr)]">
              <div className="aspect-[1.55/1] bg-slate-100 lg:aspect-auto lg:min-h-80">
                {item.cover_url ? (
                  <img src={getKnowledgeAssetUrl(item.cover_url)} alt={item.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-600 to-emerald-500 text-white">
                    <LibraryBig size={72} />
                  </div>
                )}
              </div>
              <div className="flex flex-col justify-center gap-5 p-6 sm:p-8">
                <div>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{item.category || 'คลังความรู้'}</span>
                  <h1 className="mt-4 text-3xl font-black leading-tight text-slate-900">{item.title}</h1>
                  {item.description && <p className="mt-4 whitespace-pre-line text-sm font-semibold leading-7 text-slate-600">{item.description}</p>}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <InfoStat icon={<CalendarDays />} label="เผยแพร่" value={formatThaiDate(item.published_at || item.updated_at)} />
                  <InfoStat icon={<Eye />} label="เปิดอ่าน" value={`${Number(item.view_count || 0).toLocaleString('th-TH')} ครั้ง`} />
                  <InfoStat icon={<Timer />} label="เวลาที่อ่าน" value={formatDuration(readingSeconds)} />
                </div>
              </div>
            </div>
          </section>

          <section ref={viewerRef} className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
                <FileText className="text-blue-600" /> เอกสาร PDF
              </h2>
              {pdfUrl && (
                <a href={pdfUrl} target="_blank" rel="noreferrer" className="text-sm font-black text-blue-600 hover:underline">
                  เปิดเอกสารเต็มหน้าจอ
                </a>
              )}
            </div>
            {pdfUrl ? (
              <iframe
                title={item.title}
                src={pdfUrl}
                className="h-[78vh] min-h-[620px] w-full bg-slate-100"
              />
            ) : (
              <div className="flex min-h-[360px] flex-col items-center justify-center p-8 text-center text-slate-400">
                <FileText size={52} className="mb-4 text-slate-300" />
                <p className="font-bold">ยังไม่มีไฟล์ PDF สำหรับเรื่องนี้</p>
              </div>
            )}
          </section>
        </div>

        <Footer />
      </main>
    </div>
  );
}

function InfoStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
      <div className="mb-2 text-blue-600">{icon}</div>
      <p className="text-base font-black text-slate-900">{value}</p>
      <p className="text-xs font-bold text-slate-400">{label}</p>
    </div>
  );
}
