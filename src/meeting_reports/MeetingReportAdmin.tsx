import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { BarChart3, CheckCircle2, ClipboardList, FileText, Loader2, MessageSquare, Plus, RefreshCcw, Save, Search, Trash2, UploadCloud } from 'lucide-react';
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
  emptyMeetingReport,
  formatDuration,
  formatFileSize,
  formatMeetingReportDate,
  getDriveFileIdFromUrl,
  getStoredUser,
  readApiResponse,
  readPdfFileAsBase64,
  sectionLabels,
  uploadMeetingReportPdf,
  type MeetingReportAckRow,
  type MeetingReportAdminCommentRow,
  type MeetingReportAdminData,
  type MeetingReportItem,
  type MeetingReportReadRow,
  type MeetingReportSection,
  type MeetingReportStatus,
} from './meetingReportUtils';

type AdminTab = 'report' | 'items';
type ReportTable = 'reads' | 'acks' | 'comments';
type ReportSectionFilter = 'all' | MeetingReportSection;
type ReportDashboardRow = MeetingReportReadRow | MeetingReportAckRow | MeetingReportAdminCommentRow;

const statusLabels: Record<MeetingReportStatus, string> = {
  draft: 'ฉบับร่าง',
  published: 'เผยแพร่',
  archived: 'เก็บถาวร',
};

const REPORT_PAGE_SIZE = 12;

export default function MeetingReportAdmin() {
  const [userData, setUserData] = useState<any>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>('report');
  const [activeSection, setActiveSection] = useState<MeetingReportSection>('office');
  const [items, setItems] = useState<MeetingReportItem[]>([]);
  const [reportData, setReportData] = useState<MeetingReportAdminData>({ reads: [], acknowledgements: [], comments: [] });
  const [form, setForm] = useState<MeetingReportItem>({ ...emptyMeetingReport });
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [isSavingItem, setIsSavingItem] = useState(false);

  const loadItems = useCallback(async (userId: number) => {
    const res = await fetch(`${API_BASE}/api/admin/meeting-reports?user_id=${userId}`);
    const data = await readApiResponse(res);
    if (!res.ok) throw new Error(data.error || 'Cannot load meeting reports');
    setItems(Array.isArray(data) ? data : []);
  }, []);

  const loadReport = useCallback(async (userId: number) => {
    const res = await fetch(`${API_BASE}/api/admin/meeting-reports/report?user_id=${userId}`);
    const data = await readApiResponse(res);
    if (!res.ok) throw new Error(data.error || 'Cannot load meeting report dashboard');
    setReportData({
      reads: Array.isArray(data.reads) ? data.reads : [],
      acknowledgements: Array.isArray(data.acknowledgements) ? data.acknowledgements : [],
      comments: Array.isArray(data.comments) ? data.comments : [],
    });
  }, []);

  const refreshAll = useCallback(async (userId: number) => {
    await Promise.all([loadItems(userId), loadReport(userId)]);
  }, [loadItems, loadReport]);

  useEffect(() => {
    const parsedUser = getStoredUser();
    if (parsedUser) {
      setUserData(parsedUser);
      fetch(`${API_BASE}/api/admin/setup-meeting-report-tables`, { method: 'POST' })
        .then(async (response) => {
          const data = await readApiResponse(response);
          if (!response.ok) throw new Error(data.error || 'ตั้งค่าตารางรายงานการประชุมไม่สำเร็จ');
          await refreshAll(Number(parsedUser.user_id || 0));
        })
        .catch((error) => toast.error(error instanceof Error ? error.message : 'โหลดข้อมูลรายงานการประชุมไม่สำเร็จ'));
    }
    const handleResize = () => setIsSidebarOpen(window.innerWidth >= 1024);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [refreshAll]);

  const filteredItems = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter((item) => {
      if (item.section !== activeSection) return false;
      if (!needle) return true;
      return `${item.title} ${item.description} ${item.meeting_date || ''}`.toLowerCase().includes(needle);
    });
  }, [activeSection, items, search]);

  const resetForm = () => {
    setSelectedReportId(null);
    setForm({ ...emptyMeetingReport, section: activeSection });
  };

  const selectItem = (item: MeetingReportItem) => {
    setSelectedReportId(item.report_id || null);
    setActiveSection(item.section);
    setForm({ ...emptyMeetingReport, ...item, status: item.status || 'published' });
  };

  const updateForm = (key: keyof MeetingReportItem, value: MeetingReportItem[keyof MeetingReportItem]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handlePdfUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !userData?.user_id) return;
    try {
      setIsUploadingPdf(true);
      const base64 = await readPdfFileAsBase64(file);
      const upload = await uploadMeetingReportPdf({
        userId: userData.user_id,
        reportTitle: form.title || 'meeting-report',
        fileName: file.name,
        mimeType: file.type || 'application/pdf',
        base64,
      });
      setForm((current) => ({
        ...current,
        pdf_url: upload.url,
        pdf_file_id: upload.fileId || getDriveFileIdFromUrl(upload.url),
      }));
      toast.success(`อัปโหลด PDF แล้ว (${formatFileSize(file.size)})`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'อัปโหลด PDF ไม่สำเร็จ');
    } finally {
      setIsUploadingPdf(false);
    }
  };

  const saveItem = async () => {
    if (!userData?.user_id || isSavingItem) return;
    const url = selectedReportId
      ? `${API_BASE}/api/admin/meeting-reports/${selectedReportId}`
      : `${API_BASE}/api/admin/meeting-reports`;
    setIsSavingItem(true);
    try {
      const res = await fetch(url, {
        method: selectedReportId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, user_id: userData.user_id }),
      });
      const data = await readApiResponse(res);
      if (!res.ok) {
        toast.error(data.error || 'บันทึกรายงานการประชุมไม่สำเร็จ');
        return;
      }
      toast.success(data.message || 'บันทึกข้อมูลแล้ว');
      resetForm();
      await refreshAll(userData.user_id);
    } finally {
      setIsSavingItem(false);
    }
  };

  const deleteItem = async (reportId?: number) => {
    if (!reportId || !userData?.user_id) return;
    const confirmed = await confirmDialog({ text: 'ต้องการลบรายงานการประชุมนี้หรือไม่' });
    if (!confirmed) return;
    const res = await fetch(`${API_BASE}/api/admin/meeting-reports/${reportId}?user_id=${userData.user_id}`, { method: 'DELETE' });
    const data = await readApiResponse(res);
    if (!res.ok) {
      toast.error(data.error || 'ลบรายงานการประชุมไม่สำเร็จ');
      return;
    }
    toast.success(data.message || 'ลบข้อมูลแล้ว');
    if (selectedReportId === reportId) resetForm();
    await refreshAll(userData.user_id);
  };

  const handleLogout = async () => {
    stopHeartbeat();
    await closeSession();
    localStorage.removeItem('user');
    window.location.href = '/';
  };

  const handleRefresh = () => {
    if (!userData?.user_id) return;
    setIsRefreshing(true);
    clearMenuAccessCache();
    refreshAll(userData.user_id).finally(() => {
      setIsRefreshing(false);
      toast.success('โหลดข้อมูลใหม่แล้ว');
    });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8fafc] text-slate-900">
      <ToastContainer position="top-right" autoClose={2600} />
      <LeftSide userData={userData} isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} handleLogout={handleLogout} />

      <main className="z-10 flex h-full flex-1 flex-col overflow-y-auto">
        <Header setIsSidebarOpen={setIsSidebarOpen} handleRefresh={handleRefresh} isRefreshing={isRefreshing} handleLogout={handleLogout} />

        <div className="mx-auto flex w-full max-w-[1540px] flex-col gap-6 px-4 py-8 sm:px-8">
          <div className="flex flex-col gap-4 rounded-3xl border border-slate-100 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-black text-slate-900"><ClipboardList className="text-blue-600" /> จัดการรายงานการประชุม</h1>
              <p className="text-sm font-semibold text-slate-500">อัปโหลด PDF แจ้งเวียน แยกสำนักงาน/สำนักงานในพื้นที่ และตรวจสอบการอ่าน</p>
            </div>
            <div className="grid gap-2 rounded-2xl bg-slate-100 p-1 sm:grid-cols-2">
              <TabButton active={activeTab === 'report'} onClick={() => setActiveTab('report')} icon={<BarChart3 size={16} />} label="รายงานหลังบ้าน" />
              <TabButton active={activeTab === 'items'} onClick={() => setActiveTab('items')} icon={<FileText size={16} />} label="จัดการ PDF" />
            </div>
          </div>

          {activeTab === 'report' ? (
            <ReportDashboard reportData={reportData} />
          ) : (
            <div className="grid min-w-0 items-start gap-6 2xl:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
              <section className="min-w-0 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-black text-slate-900">รายละเอียดรายงาน</h2>
                    <p className="text-sm font-semibold text-slate-500">เลือกประเภทและอัปโหลด PDF ไป Google Drive</p>
                  </div>
                  <button onClick={resetForm} className="rounded-2xl bg-blue-600 p-3 text-white"><Plus size={18} /></button>
                </div>
                <div className="grid gap-3">
                  <SectionSwitch value={form.section} onChange={(value) => updateForm('section', value)} />
                  <Input value={form.title} onChange={(value) => updateForm('title', value)} placeholder="ชื่อรายงานการประชุม" />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input value={String(form.meeting_date || '')} type="date" onChange={(value) => updateForm('meeting_date', value)} placeholder="วันที่ประชุม" />
                    <Input value={String(form.sort_order || 0)} onChange={(value) => updateForm('sort_order', Number(value) || 0)} placeholder="ลำดับแสดงผล" />
                  </div>
                  <select value={form.status || 'published'} onChange={(event) => updateForm('status', event.target.value as MeetingReportStatus)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none">
                    <option value="published">เผยแพร่</option>
                    <option value="draft">ฉบับร่าง</option>
                    <option value="archived">เก็บถาวร</option>
                  </select>
                  <Textarea value={form.description} onChange={(value) => updateForm('description', value)} placeholder="รายละเอียด / หมายเหตุ" />
                  <UploadPanel
                    fileText={form.pdf_url}
                    buttonText={isUploadingPdf ? 'กำลังอัปโหลด...' : 'เลือก PDF'}
                    disabled={isUploadingPdf}
                    onChange={handlePdfUpload}
                  />
                  <button
                    onClick={() => void saveItem()}
                    disabled={isSavingItem || isUploadingPdf}
                    className="mt-2 inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {isSavingItem ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    {isSavingItem ? 'กำลังบันทึก...' : selectedReportId ? 'บันทึกการแก้ไข' : 'เพิ่มรายงาน'}
                  </button>
                </div>
              </section>

              <section className="min-w-0 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="grid gap-2 rounded-2xl bg-slate-100 p-1 sm:grid-cols-2">
                    <TabButton active={activeSection === 'office'} onClick={() => setActiveSection('office')} icon={<ClipboardList size={16} />} label="สำนักงาน" />
                    <TabButton active={activeSection === 'area'} onClick={() => setActiveSection('area')} icon={<ClipboardList size={16} />} label="สำนักงานในพื้นที่" />
                  </div>
                  <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 lg:min-w-80">
                    <Search size={16} className="text-slate-400" />
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหารายงาน..." className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none" />
                  </div>
                </div>
                <div className="grid gap-3">
                  {filteredItems.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-bold text-slate-400">ยังไม่มีรายงานในส่วนนี้</div>
                  ) : filteredItems.map((item) => (
                    <div key={item.report_id} className={`grid gap-3 rounded-2xl border p-4 transition md:grid-cols-[minmax(0,1fr)_auto] ${selectedReportId === item.report_id ? 'border-blue-200 bg-blue-50' : 'border-slate-100 bg-slate-50'}`}>
                      <button onClick={() => selectItem(item)} className="min-w-0 text-left">
                        <p className="break-words font-black text-slate-900">{item.title}</p>
                        <p className="mt-1 text-xs font-bold text-slate-500">
                          {sectionLabels[item.section]} · {statusLabels[(item.status || 'published') as MeetingReportStatus]} · {formatMeetingReportDate(item.meeting_date || item.published_at || item.updated_at)}
                        </p>
                        <p className="mt-2 text-xs font-black text-blue-600">
                          อ่าน {Number(item.reader_count || 0).toLocaleString('th-TH')} คน · รับทราบ {Number(item.acknowledgement_count || 0).toLocaleString('th-TH')} คน · แจ้งแก้ไข {Number(item.comment_count || 0).toLocaleString('th-TH')} ข้อความ
                        </p>
                      </button>
                      <div className="flex items-start gap-2">
                        {item.report_id && <a href={`/meeting-reports/${item.report_id}`} className="rounded-xl bg-white p-3 text-blue-600 ring-1 ring-slate-200"><FileText size={16} /></a>}
                        <button onClick={() => void deleteItem(item.report_id)} className="rounded-xl bg-red-50 p-3 text-red-600"><Trash2 size={16} /></button>
                      </div>
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

function ReportDashboard({ reportData }: { reportData: MeetingReportAdminData }) {
  const [activeTable, setActiveTable] = useState<ReportTable>('reads');
  const [sectionFilter, setSectionFilter] = useState<ReportSectionFilter>('all');
  const [unitFilter, setUnitFilter] = useState('all');
  const [query, setQuery] = useState('');
  const rows = activeTable === 'reads' ? reportData.reads : activeTable === 'acks' ? reportData.acknowledgements : reportData.comments;
  const sectionRows = useMemo(() => (
    rows.filter((row) => sectionFilter === 'all' || row.section === sectionFilter)
  ), [rows, sectionFilter]);
  const unitOptions = useMemo(() => {
    const units = new Set<string>();
    sectionRows.forEach((row) => {
      const unit = getReportRowUnit(row);
      if (unit) units.add(unit);
    });
    return Array.from(units).sort((a, b) => a.localeCompare(b, 'th'));
  }, [sectionRows]);
  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sectionRows.filter((row) => {
      const unit = getReportRowUnit(row);
      if (unitFilter !== 'all' && unit !== unitFilter) return false;
      if (!needle) return true;
      return getReportRowSearchText(row).toLowerCase().includes(needle);
    });
  }, [query, sectionRows, unitFilter]);

  useEffect(() => {
    setUnitFilter('all');
    setQuery('');
  }, [activeTable, sectionFilter]);

  return (
    <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black"><BarChart3 className="text-blue-600" /> รายงานหลังบ้าน</h2>
          <p className="text-sm font-semibold text-slate-500">ตรวจสอบการเปิดอ่าน เวลาอ่านจริง การรับทราบ และข้อความแจ้งแก้ไข</p>
        </div>
        <div className="grid gap-2 rounded-2xl bg-slate-100 p-1 sm:grid-cols-3">
          <TabButton active={activeTable === 'reads'} onClick={() => setActiveTable('reads')} icon={<FileText size={16} />} label="การอ่าน" />
          <TabButton active={activeTable === 'acks'} onClick={() => setActiveTable('acks')} icon={<CheckCircle2 size={16} />} label="รับทราบ" />
          <TabButton active={activeTable === 'comments'} onClick={() => setActiveTable('comments')} icon={<MessageSquare size={16} />} label="แจ้งแก้ไข" />
        </div>
      </div>
      <div className="mb-5 grid gap-3 xl:grid-cols-[auto_minmax(220px,360px)_minmax(260px,1fr)_auto] xl:items-center">
        <div className="grid gap-2 rounded-2xl bg-slate-100 p-1 sm:grid-cols-3">
          <TabButton active={sectionFilter === 'all'} onClick={() => setSectionFilter('all')} icon={<ClipboardList size={16} />} label="ทั้งหมด" />
          <TabButton active={sectionFilter === 'office'} onClick={() => setSectionFilter('office')} icon={<ClipboardList size={16} />} label="สำนักงาน" />
          <TabButton active={sectionFilter === 'area'} onClick={() => setSectionFilter('area')} icon={<ClipboardList size={16} />} label="สำนักงานในพื้นที่" />
        </div>
        <label className="grid gap-1 text-xs font-black text-slate-500 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
          <span>หน่วยงาน</span>
          <select
            value={unitFilter}
            onChange={(event) => setUnitFilter(event.target.value)}
            className="min-w-0 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800 outline-none focus:ring-2 focus:ring-blue-200"
          >
            <option value="all">ทั้งหมด</option>
            {unitOptions.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
          </select>
        </label>
        <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <Search size={18} className="shrink-0 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหาผู้ใช้ เรื่อง หรือหมวดหมู่..."
            className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none placeholder:text-slate-400"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setUnitFilter('all');
            setQuery('');
          }}
          className="inline-flex cursor-pointer items-center justify-center rounded-2xl bg-slate-100 px-4 py-3 text-slate-600 hover:bg-slate-200"
          title="ล้างตัวกรอง"
        >
          <RefreshCcw size={18} />
        </button>
      </div>
      {activeTable === 'reads' && <ReadTable rows={filteredRows as MeetingReportReadRow[]} />}
      {activeTable === 'acks' && <AckTable rows={filteredRows as MeetingReportAckRow[]} />}
      {activeTable === 'comments' && <CommentTable rows={filteredRows as MeetingReportAdminCommentRow[]} />}
    </section>
  );
}

function getReportRowUnit(row: ReportDashboardRow) {
  return String(row.Division_Province || row.Department || '').trim();
}

function getReportRowSearchText(row: ReportDashboardRow) {
  const commentText = 'comment_text' in row ? row.comment_text : '';
  return [
    row.Name_Surname,
    row.position,
    row.Division_Province,
    row.Department,
    row.title,
    sectionLabels[row.section],
    commentText,
  ].filter(Boolean).join(' ');
}

function ReadTable({ rows }: { rows: MeetingReportReadRow[] }) {
  const { pageRows, pagination } = usePagedRows(rows);
  return (
    <>
      <DataTable emptyText="ยังไม่มีข้อมูลการเปิดอ่าน" headers={['ผู้ใช้งาน', 'รายงาน', 'ส่วน', 'จำนวนเปิด', 'เวลาอ่านจริง', 'เปิดล่าสุด']}>
        {pageRows.map((row) => (
          <tr key={`${row.report_id}-${row.user_id}`} className="border-b border-slate-100">
            <UserCell name={row.Name_Surname} detail={row.position || row.Division_Province || '-'} />
            <td className="max-w-[360px] px-4 py-3 font-semibold text-slate-600">{row.title}</td>
            <td className="px-4 py-3 text-xs font-black text-blue-600">{sectionLabels[row.section]}</td>
            <td className="px-4 py-3 font-bold">{Number(row.read_count || 0).toLocaleString('th-TH')} ครั้ง</td>
            <td className="px-4 py-3 font-bold">{formatDuration(row.total_active_seconds)}</td>
            <td className="px-4 py-3 font-bold text-slate-500">{formatMeetingReportDate(row.last_read_at)}</td>
          </tr>
        ))}
      </DataTable>
      {pagination}
    </>
  );
}

function AckTable({ rows }: { rows: MeetingReportAckRow[] }) {
  const { pageRows, pagination } = usePagedRows(rows);
  return (
    <>
      <DataTable emptyText="ยังไม่มีข้อมูลรับทราบ" headers={['ผู้ใช้งาน', 'รายงาน', 'ส่วน', 'เวลารับทราบ']}>
        {pageRows.map((row) => (
          <tr key={`${row.report_id}-${row.user_id}`} className="border-b border-slate-100">
            <UserCell name={row.Name_Surname} detail={row.position || row.Division_Province || '-'} />
            <td className="max-w-[440px] px-4 py-3 font-semibold text-slate-600">{row.title}</td>
            <td className="px-4 py-3 text-xs font-black text-blue-600">{sectionLabels[row.section]}</td>
            <td className="px-4 py-3 font-bold text-slate-500">{formatMeetingReportDate(row.acknowledged_at)}</td>
          </tr>
        ))}
      </DataTable>
      {pagination}
    </>
  );
}

function CommentTable({ rows }: { rows: MeetingReportAdminCommentRow[] }) {
  const { pageRows, pagination } = usePagedRows(rows);
  return (
    <>
      <DataTable emptyText="ยังไม่มีข้อความแจ้งแก้ไข" headers={['ผู้ใช้งาน', 'รายงาน', 'ส่วน', 'หน้า', 'ข้อความ', 'เวลาแจ้ง']}>
        {pageRows.map((row) => (
          <tr key={row.comment_id} className="border-b border-slate-100">
            <UserCell name={row.Name_Surname || '-'} detail={row.position || row.Division_Province || '-'} />
            <td className="max-w-[280px] px-4 py-3 font-semibold text-slate-600">{row.title}</td>
            <td className="px-4 py-3 text-xs font-black text-blue-600">{sectionLabels[row.section]}</td>
            <td className="px-4 py-3 font-bold">{Number(row.page_number || 1).toLocaleString('th-TH')}</td>
            <td className="max-w-[360px] whitespace-pre-line break-words px-4 py-3 text-sm font-semibold text-slate-600">{row.comment_text}</td>
            <td className="px-4 py-3 font-bold text-slate-500">{formatMeetingReportDate(row.created_at)}</td>
          </tr>
        ))}
      </DataTable>
      {pagination}
    </>
  );
}

function usePagedRows<T>(rows: T[]) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / REPORT_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * REPORT_PAGE_SIZE;
  const pageRows = rows.slice(start, start + REPORT_PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [rows]);

  return {
    pageRows,
    pagination: rows.length === 0 ? null : (
      <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 text-sm font-bold text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span>แสดง {(start + 1).toLocaleString('th-TH')}-{(start + pageRows.length).toLocaleString('th-TH')} จาก {rows.length.toLocaleString('th-TH')} รายการ</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setPage(Math.max(1, safePage - 1))} disabled={safePage <= 1} className="rounded-xl border border-slate-200 px-4 py-2 font-black text-slate-600 disabled:opacity-40">ก่อนหน้า</button>
          <span className="rounded-xl bg-slate-100 px-4 py-2 font-black text-slate-700">{safePage.toLocaleString('th-TH')} / {totalPages.toLocaleString('th-TH')}</span>
          <button onClick={() => setPage(Math.min(totalPages, safePage + 1))} disabled={safePage >= totalPages} className="rounded-xl border border-slate-200 px-4 py-2 font-black text-slate-600 disabled:opacity-40">ถัดไป</button>
        </div>
      </div>
    ),
  };
}

function DataTable({ headers, emptyText, children }: { headers: string[]; emptyText: string; children: ReactNode }) {
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs font-black text-slate-500">
          <tr>{headers.map((header) => <th key={header} className="px-4 py-3">{header}</th>)}</tr>
        </thead>
        <tbody>
          {hasRows ? children : (
            <tr>
              <td colSpan={headers.length} className="px-4 py-12 text-center font-bold text-slate-400">{emptyText}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function UserCell({ name, detail }: { name: string; detail: string }) {
  return (
    <td className="px-4 py-3 font-bold text-slate-800">
      {name}
      <p className="text-xs text-slate-400">{detail}</p>
    </td>
  );
}

function SectionSwitch({ value, onChange }: { value: MeetingReportSection; onChange: (value: MeetingReportSection) => void }) {
  return (
    <div className="grid gap-2 rounded-2xl bg-slate-100 p-1 sm:grid-cols-2">
      <TabButton active={value === 'office'} onClick={() => onChange('office')} icon={<ClipboardList size={16} />} label="สำนักงาน" />
      <TabButton active={value === 'area'} onClick={() => onChange('area')} icon={<ClipboardList size={16} />} label="สำนักงานในพื้นที่" />
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button
      type="button"
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

function UploadPanel({ fileText, buttonText, disabled, onChange }: {
  fileText?: string;
  buttonText: string;
  disabled: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex h-20 w-full shrink-0 items-center justify-center rounded-xl bg-white text-slate-300 ring-1 ring-slate-200 sm:w-28">
          <FileText size={28} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-slate-700">ไฟล์ PDF</p>
          <p className="text-xs font-semibold text-slate-500">เลือกไฟล์ PDF เพื่ออัปโหลดไป Google Drive</p>
          {fileText && <p className="mt-1 truncate text-xs font-semibold text-slate-400">{fileText}</p>}
        </div>
        <label className={`inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black text-white shadow-sm ${disabled ? 'bg-slate-400' : 'bg-blue-600 hover:bg-blue-700'}`}>
          <UploadCloud size={16} /> {buttonText}
          <input type="file" accept="application/pdf,.pdf" onChange={onChange} disabled={disabled} className="hidden" />
        </label>
      </div>
    </div>
  );
}

function Input({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (value: string) => void; placeholder: string; type?: string }) {
  return (
    <input
      type={type}
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
