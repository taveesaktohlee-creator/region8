import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { BarChart3, FileText, ImagePlus, LibraryBig, Loader2, Plus, RefreshCw, Save, Search, Trash2, UploadCloud } from 'lucide-react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Header from '../Header';
import LeftSide from '../LeftSide';
import Footer from '../Footer';
import { API_BASE } from '../lib/apiConfig';
import { clearMenuAccessCache } from '../lib/menuAccess';
import { closeSession, stopHeartbeat } from '../lib/activityTracker';
import { confirmDialog } from '../lib/sweetAlert';
import {
  dataUrlToBase64,
  emptyKnowledgeItem,
  formatDuration,
  formatFileSize,
  formatThaiDate,
  getDriveFileIdFromUrl,
  getKnowledgeAssetUrl,
  KNOWLEDGE_COVER_ACCEPT,
  KNOWLEDGE_PDF_MAX_BYTES,
  optimizeKnowledgeCover,
  readBlobAsDataUrl,
  resolveDriveUploadResult,
  type KnowledgeItem,
  type KnowledgeStatus,
} from './knowledgeUtils';

type AdminTab = 'items' | 'report';

type KnowledgeReportRow = {
  item_id: number;
  user_id: number;
  title: string;
  category: string;
  Name_Surname: string;
  position?: string;
  Division_Province?: string;
  Department?: string;
  read_count: number;
  total_active_seconds: number;
  first_read_at?: string | null;
  last_read_at?: string | null;
};

const statusLabels: Record<KnowledgeStatus, string> = {
  draft: 'ฉบับร่าง',
  published: 'เผยแพร่',
  archived: 'เก็บถาวร',
};

const REPORT_PAGE_SIZE = 10;

async function readJsonResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

async function uploadKnowledgeDriveFile(params: {
  kind: 'cover' | 'pdf';
  itemTitle: string;
  fileName: string;
  mimeType: string;
  base64: string;
}) {
  const endpoint = params.kind === 'cover' ? 'cover-drive' : 'pdf-drive';
  const uploadLabel = params.kind === 'cover' ? 'รูปปก' : 'PDF';
  const primaryResponse = await fetch(`${API_BASE}/api/admin/knowledge/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      item_title: params.itemTitle || 'knowledge-item',
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

  const fallbackResponse = await fetch('/drive-upload-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      row: {
        action: 'uploadAvatar',
        userId: `knowledge-${params.kind}`,
        displayName: params.itemTitle || 'knowledge-item',
        fileName: `${Date.now()}-knowledge-${params.kind}-${params.fileName}`,
        mimeType: params.mimeType || (params.kind === 'pdf' ? 'application/pdf' : 'application/octet-stream'),
        base64: params.base64,
      },
    }),
  });
  const fallbackData = await readJsonResponse(fallbackResponse);
  if (!fallbackResponse.ok || fallbackData?.ok === false) {
    throw new Error(
      fallbackData?.error ||
      primaryData?.error ||
      `อัปโหลด${uploadLabel}ไป Google Drive ไม่สำเร็จ`,
    );
  }

  const fallbackUpload = resolveDriveUploadResult(fallbackData);
  if (!fallbackUpload.url) {
    throw new Error(`Google Drive ไม่ส่ง URL ${uploadLabel} กลับมา`);
  }

  return fallbackUpload;
}

export default function KnowledgeAdmin() {
  const [userData, setUserData] = useState<any>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [report, setReport] = useState<KnowledgeReportRow[]>([]);
  const [form, setForm] = useState<KnowledgeItem>({ ...emptyKnowledgeItem });
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>('report');
  const [search, setSearch] = useState('');
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [isSavingItem, setIsSavingItem] = useState(false);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState('');

  const loadItems = useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/admin/knowledge/items`);
    if (!res.ok) throw new Error('Cannot load knowledge items');
    setItems(await res.json());
  }, []);

  const loadReport = useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/admin/knowledge/report`);
    if (!res.ok) throw new Error('Cannot load knowledge report');
    setReport(await res.json());
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadItems(), loadReport()]);
  }, [loadItems, loadReport]);

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser && savedUser !== 'undefined') {
      try { setUserData(JSON.parse(savedUser)); } catch { localStorage.removeItem('user'); }
    }
    const handleResize = () => setIsSidebarOpen(window.innerWidth >= 1024);
    handleResize();
    window.addEventListener('resize', handleResize);
    fetch(`${API_BASE}/api/admin/setup-knowledge-tables`, { method: 'POST' })
      .then(() => refreshAll())
      .catch(() => toast.error('โหลดข้อมูลคลังความรู้ไม่สำเร็จ'));
    return () => window.removeEventListener('resize', handleResize);
  }, [refreshAll]);

  const filteredItems = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => `${item.title} ${item.category} ${item.description}`.toLowerCase().includes(needle));
  }, [items, search]);

  const updateForm = (key: keyof KnowledgeItem, value: KnowledgeItem[keyof KnowledgeItem]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const resetForm = () => {
    setSelectedItemId(null);
    setForm({ ...emptyKnowledgeItem });
    setCoverPreviewUrl('');
  };

  const selectItem = (item: KnowledgeItem) => {
    setSelectedItemId(item.item_id || null);
    setForm({ ...emptyKnowledgeItem, ...item, status: item.status || 'published' });
    setCoverPreviewUrl('');
  };

  const saveItem = async () => {
    if (isSavingItem) return;
    const url = selectedItemId
      ? `${API_BASE}/api/admin/knowledge/items/${selectedItemId}`
      : `${API_BASE}/api/admin/knowledge/items`;
    setIsSavingItem(true);
    try {
      const res = await fetch(url, {
        method: selectedItemId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) return toast.error(data.error || 'บันทึกคลังความรู้ไม่สำเร็จ');
      toast.success(data.message);
      resetForm();
      await loadItems();
    } finally {
      setIsSavingItem(false);
    }
  };

  const deleteItem = async (itemId?: number) => {
    if (!itemId) return;
    const confirmed = await confirmDialog({ text: 'ต้องการลบเรื่องนี้หรือไม่' });
    if (!confirmed) return;
    const res = await fetch(`${API_BASE}/api/admin/knowledge/items/${itemId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) return toast.error(data.error || 'ลบเรื่องไม่สำเร็จ');
    toast.success(data.message);
    if (selectedItemId === itemId) resetForm();
    setItems((current) => current.filter((item) => Number(item.item_id) !== Number(itemId)));
    setReport((current) => current.filter((row) => Number(row.item_id) !== Number(itemId)));
    loadReport().catch(() => undefined);
  };

  const handleCoverUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      setIsUploadingCover(true);
      const optimized = await optimizeKnowledgeCover(file);
      setCoverPreviewUrl(optimized.previewUrl);
      const upload = await uploadKnowledgeDriveFile({
        kind: 'cover',
        itemTitle: form.title || 'knowledge-item',
        fileName: optimized.fileName,
        mimeType: optimized.mimeType,
        base64: optimized.base64,
      });
      const coverUrl = upload.url;
      if (!coverUrl) throw new Error('Google Drive ไม่ส่ง URL รูปปกกลับมา');
      setForm((current) => ({
        ...current,
        cover_url: coverUrl,
        cover_file_id: upload.fileId || getDriveFileIdFromUrl(coverUrl),
      }));
      toast.success(`อัปโหลดรูปปกแล้ว (${formatFileSize(optimized.originalSize)} → ${formatFileSize(optimized.outputSize)})`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'อัปโหลดรูปปกไม่สำเร็จ');
    } finally {
      setIsUploadingCover(false);
    }
  };

  const handlePdfUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      return toast.warning('กรุณาเลือกไฟล์ PDF เท่านั้น');
    }
    if (file.size > KNOWLEDGE_PDF_MAX_BYTES) {
      return toast.warning(`ขนาดไฟล์ PDF ต้องไม่เกิน ${formatFileSize(KNOWLEDGE_PDF_MAX_BYTES)}`);
    }

    try {
      setIsUploadingPdf(true);
      const dataUrl = await readBlobAsDataUrl(file);
      const upload = await uploadKnowledgeDriveFile({
        kind: 'pdf',
        itemTitle: form.title || 'knowledge-item',
        fileName: file.name,
        mimeType: file.type || 'application/pdf',
        base64: dataUrlToBase64(dataUrl),
      });
      const pdfUrl = upload.url;
      if (!pdfUrl) throw new Error('Google Drive ไม่ส่ง URL PDF กลับมา');
      setForm((current) => ({
        ...current,
        pdf_url: pdfUrl,
        pdf_file_id: upload.fileId || getDriveFileIdFromUrl(pdfUrl),
      }));
      toast.success(`อัปโหลด PDF แล้ว (${formatFileSize(file.size)})`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'อัปโหลด PDF ไม่สำเร็จ');
    } finally {
      setIsUploadingPdf(false);
    }
  };

  const handleLogout = async () => {
    stopHeartbeat();
    await closeSession();
    localStorage.removeItem('user');
    window.location.href = '/';
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    clearMenuAccessCache();
    refreshAll().finally(() => {
      setIsRefreshing(false);
      toast.success('โหลดข้อมูลใหม่แล้ว');
    });
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
              <h1 className="text-2xl font-black text-slate-900">จัดการคลังความรู้</h1>
              <p className="text-sm font-semibold text-slate-500">เพิ่มเรื่อง อัปโหลดรูปปก/PDF และดูรายงานการเปิดอ่าน</p>
            </div>
            <div className="grid gap-2 rounded-2xl bg-slate-100 p-1 sm:grid-cols-2">
              <TabButton active={activeTab === 'report'} onClick={() => setActiveTab('report')} icon={<BarChart3 size={16} />} label="รายงานการอ่าน" />
              <TabButton active={activeTab === 'items'} onClick={() => setActiveTab('items')} icon={<LibraryBig size={16} />} label="จัดการเรื่อง" />
            </div>
          </div>

          {activeTab === 'report' ? (
            <ReportSection items={items} report={report} onRefresh={loadReport} />
          ) : (
            <div className="grid min-w-0 items-start gap-6 2xl:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
              <section className="min-w-0 overflow-hidden rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-black text-slate-900">รายละเอียดเรื่อง</h2>
                    <p className="text-sm font-semibold text-slate-500">กรอกข้อมูลและอัปโหลดไฟล์เข้า Google Drive</p>
                  </div>
                  <button onClick={resetForm} className="rounded-2xl bg-blue-600 p-3 text-white"><Plus size={18} /></button>
                </div>
                <div className="grid min-w-0 gap-3">
                  <Input value={form.title} onChange={(value) => updateForm('title', value)} placeholder="ชื่อเรื่อง" />
                  <Input value={form.category} onChange={(value) => updateForm('category', value)} placeholder="หมวดหมู่ / ระดับชั้น" />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <select value={form.status || 'published'} onChange={(event) => updateForm('status', event.target.value as KnowledgeStatus)} className="min-w-0 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none">
                      <option value="published">เผยแพร่</option>
                      <option value="draft">ฉบับร่าง</option>
                      <option value="archived">เก็บถาวร</option>
                    </select>
                    <Input value={String(form.sort_order || 0)} onChange={(value) => updateForm('sort_order', Number(value) || 0)} placeholder="ลำดับแสดงผล" />
                  </div>
                  <Textarea value={form.description} onChange={(value) => updateForm('description', value)} placeholder="รายละเอียด / คำอธิบาย" />

                  <UploadPanel
                    title="รูปปก"
                    note="เลือกรูปจากเครื่อง ระบบจะย่อเป็น WebP และเก็บใน Google Drive"
                    icon={<ImagePlus size={24} />}
                    previewUrl={coverPreviewUrl || getKnowledgeAssetUrl(form.cover_url)}
                    fileText={form.cover_url}
                    buttonText={isUploadingCover ? 'กำลังอัปโหลด...' : 'เลือกรูปปก'}
                    accept={KNOWLEDGE_COVER_ACCEPT}
                    disabled={isUploadingCover}
                    onChange={handleCoverUpload}
                  />
                  <UploadPanel
                    title="ไฟล์ PDF"
                    note={`เลือกไฟล์ PDF ขนาดไม่เกิน ${formatFileSize(KNOWLEDGE_PDF_MAX_BYTES)} เพื่อแสดงในหน้าอ่าน`}
                    icon={<FileText size={24} />}
                    fileText={form.pdf_url}
                    buttonText={isUploadingPdf ? 'กำลังอัปโหลด...' : 'เลือก PDF'}
                    accept="application/pdf,.pdf"
                    disabled={isUploadingPdf}
                    onChange={handlePdfUpload}
                  />

                  <button
                    onClick={saveItem}
                    disabled={isSavingItem || isUploadingCover || isUploadingPdf}
                    className="mt-2 inline-flex min-w-0 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {isSavingItem ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    {isSavingItem ? 'กำลังบันทึก...' : selectedItemId ? 'บันทึกการแก้ไข' : 'เพิ่มเรื่อง'}
                  </button>
                </div>
              </section>

              <section className="min-w-0 overflow-hidden rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="flex items-center gap-2 text-lg font-black"><LibraryBig className="text-blue-600" /> เรื่องทั้งหมด</h2>
                  <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 sm:min-w-80">
                    <Search size={16} className="text-slate-400" />
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาเรื่อง..." className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none" />
                  </div>
                </div>
                <div className="grid gap-3">
                  {filteredItems.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-bold text-slate-400">ยังไม่มีเรื่องในคลังความรู้</div>
                  ) : filteredItems.map((item) => (
                    <div key={item.item_id} className={`grid min-w-0 gap-3 rounded-2xl border p-4 transition sm:grid-cols-[96px_minmax(0,1fr)_auto] ${selectedItemId === item.item_id ? 'border-blue-200 bg-blue-50' : 'border-slate-100 bg-slate-50'}`}>
                      <button onClick={() => selectItem(item)} className="h-20 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
                        {item.cover_url ? (
                          <img src={getKnowledgeAssetUrl(item.cover_url)} alt={item.title} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-slate-300"><LibraryBig size={24} /></div>
                        )}
                      </button>
                      <button onClick={() => selectItem(item)} className="min-w-0 text-left">
                        <p className="break-words font-black text-slate-900">{item.title}</p>
                        <p className="mt-1 text-xs font-bold text-slate-500">{item.category || '-'} · {statusLabels[(item.status || 'published') as KnowledgeStatus]} · เปิดอ่าน {Number(item.view_count || 0).toLocaleString('th-TH')} ครั้ง</p>
                        <p className="mt-1 text-xs font-black text-blue-600">{formatThaiDate(item.published_at || item.updated_at)}</p>
                      </button>
                      <button onClick={() => deleteItem(item.item_id)} className="rounded-xl bg-red-50 p-3 text-red-600"><Trash2 size={16} /></button>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>

        <Footer />
      </main>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button
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

function UploadPanel({ title, note, icon, previewUrl = '', fileText = '', buttonText, accept, disabled, onChange }: {
  title: string;
  note: string;
  icon: ReactNode;
  previewUrl?: string;
  fileText?: string;
  buttonText: string;
  accept: string;
  disabled: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex h-24 w-full shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white text-slate-300 ring-1 ring-slate-200 sm:w-36">
          {previewUrl ? <img src={previewUrl} alt={title} className="h-full w-full object-cover" /> : icon}
        </div>
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="text-sm font-black text-slate-700">{title}</p>
          <p className="text-xs font-semibold text-slate-500">{note}</p>
          {fileText && <p className="mt-1 block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-xs font-semibold text-slate-400">{fileText}</p>}
        </div>
        <label className={`inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black text-white shadow-sm ${disabled ? 'bg-slate-400' : 'bg-blue-600 hover:bg-blue-700'}`}>
          <UploadCloud size={16} /> {buttonText}
          <input type="file" accept={accept} onChange={onChange} disabled={disabled} className="hidden" />
        </label>
      </div>
    </div>
  );
}

function ReportSection({ items, report, onRefresh }: { items: KnowledgeItem[]; report: KnowledgeReportRow[]; onRefresh: () => void }) {
  const [selectedDivision, setSelectedDivision] = useState('ทั้งหมด');
  const [selectedItemId, setSelectedItemId] = useState('ทั้งหมด');
  const [reportSearch, setReportSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemOptions = useMemo(() => {
    const options = new Map<string, string>();
    items.forEach((item) => {
      if (item.item_id) options.set(String(item.item_id), item.title || `เรื่อง #${item.item_id}`);
    });
    report.forEach((row) => {
      const itemId = String(row.item_id || '').trim();
      if (itemId && !options.has(itemId)) options.set(itemId, row.title || `เรื่อง #${itemId}`);
    });
    return Array.from(options.entries())
      .map(([itemId, title]) => ({ itemId, title }))
      .sort((a, b) => a.title.localeCompare(b.title, 'th'));
  }, [items, report]);
  const divisionOptions = useMemo(() => {
    const divisions = Array.from(
      new Set(report.map((row) => String(row.Division_Province || '').trim()).filter(Boolean)),
    );
    return ['ทั้งหมด', ...divisions.sort((a, b) => a.localeCompare(b, 'th'))];
  }, [report]);
  const filteredReport = useMemo(() => {
    const needle = reportSearch.trim().toLowerCase();
    return report.filter((row) => {
      const matchesItem = selectedItemId === 'ทั้งหมด' || String(row.item_id || '').trim() === selectedItemId;
      if (!matchesItem) return false;
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
      ].some((value) => String(value || '').toLowerCase().includes(needle));
    });
  }, [report, reportSearch, selectedDivision, selectedItemId]);
  const totalPages = Math.max(1, Math.ceil(filteredReport.length / REPORT_PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * REPORT_PAGE_SIZE;
  const paginatedReport = filteredReport.slice(pageStart, pageStart + REPORT_PAGE_SIZE);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedDivision, selectedItemId, reportSearch, report]);

  return (
    <section className="rounded-[18px] border border-[#e0e0e0] bg-white p-6">
      <div className="mb-5 border-l-4 border-blue-600 pl-4">
        <h2 className="text-xl font-black text-slate-900">รายงานการอ่าน</h2>
        <p className="text-sm font-semibold text-slate-500">รายชื่อผู้เปิดอ่าน จำนวนครั้ง และเวลาที่อ่านจริง</p>
      </div>
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-12 items-end">
        <div className="sm:col-span-6 lg:col-span-4 flex flex-col gap-1.5">
          <label className="text-xs font-black text-slate-500" htmlFor="knowledge-report-item">เรื่อง</label>
          <select
            id="knowledge-report-item"
            value={selectedItemId}
            onChange={(event) => setSelectedItemId(event.target.value)}
            className="h-12 w-full rounded-2xl border border-[#e0e0e0] bg-white px-4 text-sm font-black text-slate-700 outline-none transition-all duration-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
          >
            <option value="ทั้งหมด">ทุกเรื่อง</option>
            {itemOptions.map((item) => (
              <option key={item.itemId} value={item.itemId}>{item.title}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-6 lg:col-span-3 flex flex-col gap-1.5">
          <label className="text-xs font-black text-slate-500" htmlFor="knowledge-report-division">หน่วยงาน</label>
          <select
            id="knowledge-report-division"
            value={selectedDivision}
            onChange={(event) => setSelectedDivision(event.target.value)}
            className="h-12 w-full rounded-2xl border border-[#e0e0e0] bg-white px-4 text-sm font-black text-slate-700 outline-none transition-all duration-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
          >
            {divisionOptions.map((division) => (
              <option key={division} value={division}>{division}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-10 lg:col-span-4 flex flex-col gap-1.5">
          <label className="text-xs font-black text-slate-500" htmlFor="knowledge-report-search">ค้นหา</label>
          <div className="relative w-full">
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              id="knowledge-report-search"
              value={reportSearch}
              onChange={(event) => setReportSearch(event.target.value)}
              placeholder="ค้นหาผู้ใช้ เรื่อง หรือหมวดหมู่..."
              className="h-12 w-full rounded-2xl border border-[#e0e0e0] bg-white pl-11 pr-4 text-sm font-black text-slate-700 outline-none transition-all duration-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
            />
          </div>
        </div>
        <div className="sm:col-span-2 lg:col-span-1 flex justify-start sm:justify-end">
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[#e0e0e0] bg-[#fafafc] text-slate-600 transition-all duration-300 hover:border-[#cccccc] hover:bg-slate-50"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[#f5f5f7] border-b border-[#e0e0e0] text-xs font-black text-slate-500">
            <tr>
              <th className="px-4 py-3">ผู้ใช้งาน</th>
              <th className="px-4 py-3">เรื่อง</th>
              <th className="px-4 py-3">หมวดหมู่</th>
              <th className="px-4 py-3">จำนวนเปิดอ่าน</th>
              <th className="px-4 py-3">เวลาอ่านจริง</th>
              <th className="px-4 py-3">เปิดล่าสุด</th>
            </tr>
          </thead>
          <tbody>
            {filteredReport.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center font-bold text-slate-400">ยังไม่มีข้อมูลการอ่านในหน่วยงานนี้</td>
              </tr>
            ) : paginatedReport.map((row) => (
              <tr key={`${row.item_id}-${row.user_id}`} className="border-b border-slate-100">
                <td className="px-4 py-3 font-bold text-slate-800">
                  {row.Name_Surname}
                  <p className="text-xs text-slate-400">{row.position || row.Division_Province || '-'}</p>
                </td>
                <td className="max-w-[380px] px-4 py-3 font-semibold text-slate-600">{row.title}</td>
                <td className="px-4 py-3 text-xs font-black text-blue-600">{row.category || '-'}</td>
                <td className="px-4 py-3 font-bold">{Number(row.read_count || 0).toLocaleString('th-TH')} ครั้ง</td>
                <td className="px-4 py-3 font-bold">{formatDuration(row.total_active_seconds)}</td>
                <td className="px-4 py-3 font-bold text-slate-500">{formatThaiDate(row.last_read_at)}</td>
              </tr>
            ))}
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
    </section>
  );
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

function Input({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="min-w-0 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-200"
    />
  );
}

function Textarea({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={4}
      className="min-w-0 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-200"
    />
  );
}
