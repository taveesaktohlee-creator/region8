import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardEdit,
  Database,
  FilePenLine,
  Loader2,
  MonitorCog,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Sparkles,
} from 'lucide-react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Header from '../Header';
import LeftSide from '../LeftSide';
import Footer from '../Footer';
import { API_BASE } from '../lib/apiConfig';

type SystemKey = 'ledger' | 'member' | 'loan' | 'deposit' | 'stock';

interface SystemForm {
  status: string;
  version: string;
  saved_to_date: string;
}

interface MonitorForm {
  office: string;
  visit_date: string;
  coop_name: string;
  visit_round: string;
  project: string;
  accounting_users: string;
  pc_count: string;
  notebook_count: string;
  network_usage: string;
  systems: Record<SystemKey, SystemForm>;
  data_recording: string;
  permission_note: string;
  backup_note: string;
  ups_status: string;
  access_register: string;
  upload_responsible: string;
  send_method: string;
  advice: string;
  problem: string;
}

type SheetRow = Record<string, any>;

const SHEET_KEYS = {
  timestamp: 'ประทับเวลา',
  office: 'สำนักงานตรวจบัญชีสหกรณ์',
  visitDate: 'วันที่เข้ากำกับติดตาม',
  coop: '1. ชื่อสหกรณ์',
  round: '1.1 กำกับติดตามครั้งที่',
  project: 'สหกรณ์เป้าหมาย ตามโครงการ',
  users: '2. จำนวนผู้ใช้งานโปรแกรมระบบบัญชี (คน)',
  pc: 'จำนวนคอมพิวเตอร์ที่ใช้งานโปรแกรม (เครื่อง) [คอมพิวเตอร์ PC]',
  notebook: 'จำนวนคอมพิวเตอร์ที่ใช้งานโปรแกรม (เครื่อง) [คอมพิวเตอร์ Notbook]',
  network: 'การใช้งานโปรแกรมผ่านระบบ(Network)',
  dataRecording: '4. การบันทึกข้อมูลในโปรแกรมระบบบัญชี',
  permissionMember: '5. กำหนดสิทธิ์การใช้งานโปรแกรม [ระบบสมาชิกและหุ้น]',
  permissionLoan: '5. กำหนดสิทธิ์การใช้งานโปรแกรม [ระบบเงินให้กู้]',
  permissionDeposit: '5. กำหนดสิทธิ์การใช้งานโปรแกรม [ระบบเงินรับฝาก]',
  permissionStock: '5. กำหนดสิทธิ์การใช้งานโปรแกรม [ระบบสินค้า]',
  permissionLedger: '5. กำหนดสิทธิ์การใช้งานโปรแกรม [ระบบบัญชีแยกประเภท]',
  backupNone: '6. การสำรองข้อมูลและการเก็บรักษาข้อมูล [ไม่ได้สำรองข้อมูลไว้ในสื่อบันทึกอื่น]',
  backupSingle: '6. การสำรองข้อมูลและการเก็บรักษาข้อมูล [สำรองข้อมูลในสื่ออื่นเพียงชุดเดียว]',
  backupMultiple: '6. การสำรองข้อมูลและการเก็บรักษาข้อมูล [สำรองข้อมูลในสื่อบันทึกอื่นมากกว่า 1 ชุด]',
  accessRegister: '8.จัดทำทะเบียนคุมการเข้าถึงแฟ้มข้อมูล',
  uploadResponsible: '9.ผู้รับผิดชอบนำส่งแฟ้มข้อมูลออนไลน์ (ระบุชื่อ)',
  sendCurrent: '10. วิธีการนำส่งข้อมูล SmartMember & SmartManage [ส่งข้อมูลเป็นปัจจุบัน]',
  sendNotCurrent: '10. วิธีการนำส่งข้อมูล SmartMember & SmartManage [ส่งข้อมูลไม่เป็นปัจจุบัน]',
  backupToAuditor: '11.ส่งแฟ้มข้อมูลสำรองให้ผู้สอบบัญชี',
  advice: '12. เรื่องที่แนะนำให้เจ้าหน้าที่/IT Provider',
  problem: '13. ปัญหาการใช้งานโปรแกรม',
  techOfficer: 'ชื่อ-นามสกุล เจ้าหน้าที่กลุ่มเทคฯ (ผู้ติดตาม)',
  coopOfficer: 'ชื่อ-นามสกุล เจ้าหน้าที่สหกรณ์ (ผู้ให้ข้อมูล)',
  officeOfficer: 'ชื่อ-นามสกุล เจ้าหน้าที่สำนักงานตรวจบัญชี',
  ups: '7. เครื่องสำรองไฟ',
};

const SYSTEM_KEYS: Record<SystemKey, { status: string; version: string; date: string }> = {
  ledger: {
    status: 'สถานะใช้งาน(CAD_SOFT) 1. ระบบบัญชีแยกประเภท',
    version: 'เวอร์ชั่นที่ใช้งาน (1. ระบบบัญชีแยกประเภท)',
    date: 'การบันทึกงานถึงวันที่ (1. ระบบบัญชีแยกประเภท)',
  },
  member: {
    status: 'สถานะใช้งาน(CAD_SOFT)   2. ระบบสมาชิกและหุ้น',
    version: 'เวอร์ชั่นที่ใช้งาน (2. ระบบสมาชิกและหุ้น)',
    date: 'การบันทึกงานถึงวันที่ (2. ระบบสมาชิกและหุ้น)',
  },
  loan: {
    status: 'สถานะใช้งาน(CAD_SOFT) 3. ระบบเงินให้กู้',
    version: 'เวอร์ชั่นที่ใช้งาน (3. ระบบเงินให้กู้)',
    date: 'การบันทึกงานถึงวันที่ (3. ระบบเงินให้กู้)',
  },
  deposit: {
    status: 'สถานะใช้งาน(CAD_SOFT) 4. ระบบเงินรับฝาก',
    version: 'เวอร์ชั่นที่ใช้งาน (4. ระบบเงินรับฝาก)',
    date: 'การบันทึกงานถึงวันที่ (4. ระบบเงินรับฝาก)',
  },
  stock: {
    status: 'สถานะใช้งาน(CAD_SOFT) 5. ระบบสินค้า',
    version: 'เวอร์ชั่นที่ใช้งาน (5. ระบบสินค้า)',
    date: 'การบันทึกงานถึงวันที่ (5. ระบบสินค้า)',
  },
};

const SYSTEMS: { key: SystemKey; label: string }[] = [
  { key: 'ledger', label: 'ระบบบัญชีแยกประเภท' },
  { key: 'member', label: 'ระบบสมาชิกและหุ้น' },
  { key: 'loan', label: 'ระบบเงินให้กู้' },
  { key: 'deposit', label: 'ระบบเงินรับฝาก' },
  { key: 'stock', label: 'ระบบสินค้า' },
];

const emptySystems = (): Record<SystemKey, SystemForm> => ({
  ledger: { status: '', version: '', saved_to_date: '' },
  member: { status: '', version: '', saved_to_date: '' },
  loan: { status: '', version: '', saved_to_date: '' },
  deposit: { status: '', version: '', saved_to_date: '' },
  stock: { status: '', version: '', saved_to_date: '' },
});

const initialForm = (): MonitorForm => ({
  office: '',
  visit_date: new Date().toISOString().slice(0, 10),
  coop_name: '',
  visit_round: 'ครั้งที่ 2',
  project: '',
  accounting_users: '',
  pc_count: '',
  notebook_count: '',
  network_usage: 'ไม่ใช้งาน',
  systems: emptySystems(),
  data_recording: '',
  permission_note: '',
  backup_note: '',
  ups_status: '',
  access_register: '',
  upload_responsible: '',
  send_method: '',
  advice: '',
  problem: '',
});

const toText = (value: unknown) => String(value ?? '').trim();

const normalizeRound = (value: unknown) => {
  const raw = toText(value).replace(/\s+/g, ' ');
  const matched = raw.match(/[12]/);
  return matched ? `ครั้งที่ ${matched[0]}` : raw;
};

const stripUnit = (value: unknown) => toText(value).replace(/คน|เครื่อง/g, '').trim();

const inputDateFromSheet = (value: unknown) => {
  const raw = toText(value);
  if (!raw) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (!match) return '';

  const day = match[1].padStart(2, '0');
  const month = match[2].padStart(2, '0');
  const yearNumber = Number(match[3]);
  const year = yearNumber > 2400 ? yearNumber - 543 : yearNumber;
  return `${year}-${month}-${day}`;
};

const sheetDateFromInput = (value: string) => {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${Number(day)}/${Number(month)}/${Number(year) + 543}`;
};

const thaiTimestamp = () => {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear() + 543;
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  const second = String(now.getSeconds()).padStart(2, '0');
  return `${day}/${month}/${year} ${hour}:${minute}:${second}`;
};

const buildPermissionNote = (row: SheetRow) => [
  toText(row[SHEET_KEYS.permissionLedger]),
  toText(row[SHEET_KEYS.permissionMember]),
  toText(row[SHEET_KEYS.permissionLoan]),
  toText(row[SHEET_KEYS.permissionDeposit]),
  toText(row[SHEET_KEYS.permissionStock]),
].filter(Boolean).join(' | ');

const buildBackupNote = (row: SheetRow) => [
  toText(row[SHEET_KEYS.backupMultiple]),
  toText(row[SHEET_KEYS.backupSingle]),
  toText(row[SHEET_KEYS.backupNone]),
].filter(Boolean).join(' | ');

const sheetRowToForm = (row: SheetRow, userData?: any): MonitorForm => {
  const systems = emptySystems();
  SYSTEMS.forEach(system => {
    const keys = SYSTEM_KEYS[system.key];
    systems[system.key] = {
      status: toText(row[keys.status]),
      version: toText(row[keys.version]),
      saved_to_date: inputDateFromSheet(row[keys.date]),
    };
  });

  return {
    ...initialForm(),
    office: toText(row[SHEET_KEYS.office]) || userData?.Division_Province || '',
    visit_date: inputDateFromSheet(row[SHEET_KEYS.visitDate]) || new Date().toISOString().slice(0, 10),
    coop_name: toText(row[SHEET_KEYS.coop]),
    visit_round: 'ครั้งที่ 2',
    project: toText(row[SHEET_KEYS.project]),
    accounting_users: stripUnit(row[SHEET_KEYS.users]),
    pc_count: stripUnit(row[SHEET_KEYS.pc]),
    notebook_count: stripUnit(row[SHEET_KEYS.notebook]),
    network_usage: toText(row[SHEET_KEYS.network]) || 'ไม่ใช้งาน',
    systems,
    data_recording: toText(row[SHEET_KEYS.dataRecording]),
    permission_note: buildPermissionNote(row),
    backup_note: buildBackupNote(row),
    ups_status: toText(row[SHEET_KEYS.ups]),
    access_register: toText(row[SHEET_KEYS.accessRegister]),
    upload_responsible: toText(row[SHEET_KEYS.uploadResponsible]) || userData?.Name_Surname || '',
    send_method: toText(row[SHEET_KEYS.sendCurrent]) || toText(row[SHEET_KEYS.sendNotCurrent]),
    advice: toText(row[SHEET_KEYS.advice]),
    problem: toText(row[SHEET_KEYS.problem]),
  };
};

const formToSheetRow = (form: MonitorForm, userData?: any): SheetRow => {
  const row: SheetRow = {
    [SHEET_KEYS.timestamp]: thaiTimestamp(),
    [SHEET_KEYS.office]: form.office,
    [SHEET_KEYS.visitDate]: sheetDateFromInput(form.visit_date),
    [SHEET_KEYS.coop]: form.coop_name,
    [SHEET_KEYS.round]: 'ครั้งที่ 2',
    [SHEET_KEYS.project]: form.project,
    [SHEET_KEYS.users]: form.accounting_users,
    [SHEET_KEYS.pc]: form.pc_count,
    [SHEET_KEYS.notebook]: form.notebook_count,
    [SHEET_KEYS.network]: form.network_usage,
    [SHEET_KEYS.dataRecording]: form.data_recording,
    [SHEET_KEYS.permissionMember]: form.permission_note,
    [SHEET_KEYS.permissionLoan]: '',
    [SHEET_KEYS.permissionDeposit]: '',
    [SHEET_KEYS.permissionStock]: '',
    [SHEET_KEYS.permissionLedger]: form.permission_note,
    [SHEET_KEYS.backupNone]: '',
    [SHEET_KEYS.backupSingle]: form.backup_note,
    [SHEET_KEYS.backupMultiple]: '',
    [SHEET_KEYS.accessRegister]: form.access_register,
    [SHEET_KEYS.uploadResponsible]: form.upload_responsible,
    [SHEET_KEYS.sendCurrent]: form.send_method,
    [SHEET_KEYS.sendNotCurrent]: '',
    [SHEET_KEYS.backupToAuditor]: '',
    [SHEET_KEYS.advice]: form.advice,
    [SHEET_KEYS.problem]: form.problem,
    [SHEET_KEYS.techOfficer]: userData?.Name_Surname || '',
    [SHEET_KEYS.coopOfficer]: '',
    [SHEET_KEYS.officeOfficer]: userData?.Name_Surname || '',
    [SHEET_KEYS.ups]: form.ups_status,
  };

  SYSTEMS.forEach(system => {
    const keys = SYSTEM_KEYS[system.key];
    const value = form.systems[system.key];
    row[keys.status] = value.status;
    row[keys.version] = value.version;
    row[keys.date] = sheetDateFromInput(value.saved_to_date);
  });

  return row;
};

export default function MonitorData() {
  const [userData, setUserData] = useState<any>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sheetRows, setSheetRows] = useState<SheetRow[]>([]);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [sourceSearch, setSourceSearch] = useState('');
  const [sheetLoading, setSheetLoading] = useState(false);
  const [form, setForm] = useState<MonitorForm>(initialForm);

  const hasSelectedSource = selectedRowIndex !== null;

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser && savedUser !== 'undefined') {
      try {
        const parsed = JSON.parse(savedUser);
        setUserData(parsed);
        setForm(current => ({
          ...current,
          office: parsed?.Division_Province || current.office,
          upload_responsible: parsed?.Name_Surname || current.upload_responsible,
        }));
      } catch {
        window.location.href = '/';
      }
    } else {
      window.location.href = '/';
    }

    const handleResize = () => setIsSidebarOpen(window.innerWidth >= 1024);
    handleResize();
    window.addEventListener('resize', handleResize);
    const timer = window.setTimeout(() => setPageLoading(false), 350);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.clearTimeout(timer);
    };
  }, []);

  const fetchSheetRows = useCallback(async () => {
    if (!userData) return;
    setSheetLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/google-monitor-data`);
      if (!response.ok) throw new Error('Cannot load Google Sheets data');
      const data = await response.json();
      const rows = Array.isArray(data) ? data : [];
      setSheetRows(rows.filter((row: SheetRow) => normalizeRound(row[SHEET_KEYS.round]) === 'ครั้งที่ 1'));
    } catch (error) {
      console.error(error);
      toast.error('ไม่สามารถโหลดข้อมูลครั้งที่ 1 จาก Google Sheets ได้');
    } finally {
      setSheetLoading(false);
    }
  }, [userData]);

  useEffect(() => {
    fetchSheetRows();
  }, [fetchSheetRows]);

  const handleLogout = () => {
    localStorage.removeItem('user');
    window.location.href = '/';
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchSheetRows().finally(() => {
      setTimeout(() => setIsRefreshing(false), 500);
    });
  };

  const updateField = (key: keyof MonitorForm, value: string) => {
    setForm(current => ({ ...current, [key]: value }));
  };

  const updateSystem = (system: SystemKey, key: keyof SystemForm, value: string) => {
    setForm(current => ({
      ...current,
      systems: {
        ...current.systems,
        [system]: { ...current.systems[system], [key]: value },
      },
    }));
  };

  const resetForm = () => {
    setForm({
      ...initialForm(),
      office: userData?.Division_Province || '',
      upload_responsible: userData?.Name_Surname || '',
    });
    setSelectedRowIndex(null);
    toast.info('ล้างฟอร์มเรียบร้อยแล้ว');
  };

  const validateForm = () => {
    if (!form.office.trim()) return 'กรุณากรอกสำนักงานตรวจบัญชีสหกรณ์';
    if (!form.visit_date) return 'กรุณาเลือกวันที่เข้ากำกับติดตาม';
    if (!form.coop_name.trim()) return 'กรุณากรอกชื่อสหกรณ์';
    if (!form.visit_round.trim()) return 'กรุณาเลือกครั้งที่กำกับติดตาม';
    return '';
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const validationMessage = validateForm();
    if (validationMessage) {
      toast.warning(validationMessage);
      return;
    }

    setSaving(true);
    try {
      const row = formToSheetRow({ ...form, visit_round: 'ครั้งที่ 2' }, userData);
      const response = await fetch(`${API_BASE}/api/google-monitor-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ row }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Save failed');

      toast.success(result.message || 'เพิ่มข้อมูลกำกับติดตามครั้งที่ 2 ลง Google Sheets แล้ว');
      setSelectedRowIndex(null);
      setForm({
        ...initialForm(),
        office: userData?.Division_Province || '',
        upload_responsible: userData?.Name_Surname || '',
      });
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      setSaving(false);
    }
  };

  const handleSelectSource = (row: SheetRow, index: number) => {
    setSelectedRowIndex(index);
    setForm(sheetRowToForm(row, userData));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast.info(`ดึงข้อมูลครั้งที่ 1 ของ ${toText(row[SHEET_KEYS.coop]) || 'สหกรณ์ที่เลือก'} มาแก้ไขเป็นครั้งที่ 2 แล้ว`);
  };

  const filteredSheetRows = useMemo(() => {
    const keyword = sourceSearch.trim().toLowerCase();
    if (!keyword) return sheetRows;
    return sheetRows.filter(row => [
      row[SHEET_KEYS.coop],
      row[SHEET_KEYS.office],
      row[SHEET_KEYS.project],
      row[SHEET_KEYS.visitDate],
    ].some(value => toText(value).toLowerCase().includes(keyword)));
  }, [sheetRows, sourceSearch]);

  const completion = useMemo(() => {
    const required = [form.office, form.visit_date, form.coop_name, form.visit_round];
    return Math.round((required.filter(Boolean).length / required.length) * 100);
  }, [form]);

  return (
    <div className="flex h-screen bg-[#f8fafc] overflow-hidden text-slate-800">
      <ToastContainer position="top-right" autoClose={2600} />
      <LeftSide userData={userData} isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} handleLogout={handleLogout} />

      <main className="flex-1 flex flex-col h-full overflow-y-auto">
        <Header setIsSidebarOpen={setIsSidebarOpen} handleRefresh={handleRefresh} isRefreshing={isRefreshing} handleLogout={handleLogout} />

        <div className={`flex-1 transition-all duration-500 ${pageLoading ? 'opacity-0 translate-y-3' : 'opacity-100 translate-y-0'}`}>
          <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold mb-2">
                  <a href="/index" className="flex items-center gap-1 text-blue-600 hover:text-blue-800 transition">
                    <ArrowLeft size={16} /> หน้าหลัก
                  </a>
                  <ChevronRight size={15} className="text-slate-400" />
                  <span className="text-slate-500">บันทึกกำกับติดตามกลุ่มเทคฯ</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">บันทึกข้อมูลการกำกับติดตาม</h1>
                <p className="mt-1 text-sm sm:text-base text-slate-500 font-medium">ดึงข้อมูลกำกับติดตามครั้งที่ 1 จาก Google Sheets แล้วบันทึกเพิ่มเป็นครั้งที่ 2</p>
              </div>
              <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3 shadow-sm flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Sparkles size={20} />
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-bold">ความครบถ้วนข้อมูลหลัก</p>
                  <p className="text-xl font-black text-blue-600">{completion}%</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
              <section className="space-y-6">
                <Panel icon={<ClipboardEdit size={20} />} title="ข้อมูลทั่วไป">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <TextInput label="สำนักงานตรวจบัญชีสหกรณ์" value={form.office} onChange={(v) => updateField('office', v)} icon={<Building2 size={16} />} required />
                    <DateInput label="วันที่เข้ากำกับติดตาม" value={form.visit_date} onChange={(v) => updateField('visit_date', v)} required />
                    <TextInput label="ชื่อสหกรณ์" value={form.coop_name} onChange={(v) => updateField('coop_name', v)} required />
                    <SelectInput label="กำกับติดตามครั้งที่" value={form.visit_round} onChange={(v) => updateField('visit_round', v)} options={['ครั้งที่ 2']} required />
                    <div className="md:col-span-2">
                      <TextInput label="สหกรณ์เป้าหมายตามโครงการ" value={form.project} onChange={(v) => updateField('project', v)} />
                    </div>
                  </div>
                </Panel>

                <Panel icon={<MonitorCog size={20} />} title="ผู้ใช้งานโปรแกรมระบบบัญชี">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <TextInput label="จำนวนผู้ใช้งาน (คน)" value={form.accounting_users} onChange={(v) => updateField('accounting_users', v)} type="number" />
                    <TextInput label="คอมพิวเตอร์ PC (เครื่อง)" value={form.pc_count} onChange={(v) => updateField('pc_count', v)} type="number" />
                    <TextInput label="Notebook (เครื่อง)" value={form.notebook_count} onChange={(v) => updateField('notebook_count', v)} type="number" />
                    <SelectInput label="Network" value={form.network_usage} onChange={(v) => updateField('network_usage', v)} options={['ไม่ใช้งาน', 'ใช้งาน', 'ใช้งานระบบ LAN']} />
                  </div>
                </Panel>

                <Panel icon={<Database size={20} />} title="โปรแกรมระบบบัญชีที่ใช้">
                  <div className="space-y-4">
                    {SYSTEMS.map(system => (
                      <div key={system.key} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                        <p className="font-bold text-slate-800 mb-3">{system.label}</p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <SelectInput label="สถานะ" value={form.systems[system.key].status} onChange={(v) => updateSystem(system.key, 'status', v)} options={['', 'ใช้งานปกติ', 'ปรับเปลี่ยน', 'ไม่ได้ใช้งาน', 'พบปัญหา']} />
                          <TextInput label="เวอร์ชั่น" value={form.systems[system.key].version} onChange={(v) => updateSystem(system.key, 'version', v)} />
                          <DateInput label="บันทึกงานถึงวันที่" value={form.systems[system.key].saved_to_date} onChange={(v) => updateSystem(system.key, 'saved_to_date', v)} />
                        </div>
                      </div>
                    ))}
                  </div>
                </Panel>

                <Panel icon={<FilePenLine size={20} />} title="รายละเอียดการควบคุมและข้อเสนอแนะ">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <TextareaInput label="การบันทึกข้อมูลในโปรแกรมระบบบัญชี" value={form.data_recording} onChange={(v) => updateField('data_recording', v)} />
                    <TextareaInput label="การกำหนดสิทธิ์การใช้งาน" value={form.permission_note} onChange={(v) => updateField('permission_note', v)} />
                    <TextareaInput label="การสำรองข้อมูลและการเก็บรักษาข้อมูล" value={form.backup_note} onChange={(v) => updateField('backup_note', v)} />
                    <TextareaInput label="เครื่องสำรองไฟ" value={form.ups_status} onChange={(v) => updateField('ups_status', v)} />
                    <TextareaInput label="ทะเบียนคุมการเข้าถึงแฟ้มข้อมูล" value={form.access_register} onChange={(v) => updateField('access_register', v)} />
                    <TextInput label="ผู้รับผิดชอบนำส่งแฟ้มข้อมูลออนไลน์" value={form.upload_responsible} onChange={(v) => updateField('upload_responsible', v)} />
                    <TextareaInput label="วิธีการนำส่งข้อมูล SmartMember & SmartManage" value={form.send_method} onChange={(v) => updateField('send_method', v)} />
                    <TextareaInput label="เรื่องที่แนะนำให้เจ้าหน้าที่/IT Provider" value={form.advice} onChange={(v) => updateField('advice', v)} />
                    <div className="md:col-span-2">
                      <TextareaInput label="ปัญหาการใช้งานโปรแกรม" value={form.problem} onChange={(v) => updateField('problem', v)} rows={4} />
                    </div>
                  </div>
                </Panel>
              </section>

              <aside className="xl:sticky xl:top-6 h-fit space-y-4">
                <div className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-12 w-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
                      {hasSelectedSource ? <FilePenLine size={22} /> : <Save size={22} />}
                    </div>
                    <div>
                      <p className="font-black text-slate-900">{hasSelectedSource ? 'เตรียมบันทึกครั้งที่ 2' : 'พร้อมบันทึกครั้งที่ 2'}</p>
                      <p className="text-xs text-slate-500 font-medium">ระบบจะเพิ่มแถวใหม่ลง Google Sheets</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    <button type="submit" disabled={saving} className="cursor-pointer rounded-2xl bg-blue-600 px-5 py-3 text-white font-bold shadow-lg shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2 transition">
                      {saving ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                      บันทึกเป็นครั้งที่ 2
                    </button>
                    <button type="button" onClick={resetForm} className="cursor-pointer rounded-2xl border border-slate-200 bg-white px-5 py-3 text-slate-600 font-bold hover:bg-slate-50 flex items-center justify-center gap-2 transition">
                      <RotateCcw size={18} /> ล้างฟอร์ม
                    </button>
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="font-black text-slate-900">ข้อมูลครั้งที่ 1 จาก Google Sheets</p>
                      <p className="text-xs text-slate-500 font-medium">{filteredSheetRows.length} จาก {sheetRows.length} รายการ</p>
                    </div>
                    <button type="button" onClick={handleRefresh} className="cursor-pointer h-10 w-10 rounded-xl bg-slate-50 text-slate-500 hover:text-blue-600 hover:bg-blue-50 flex items-center justify-center transition">
                      <RefreshCw size={17} className={isRefreshing || sheetLoading ? 'animate-spin' : ''} />
                    </button>
                  </div>
                  <div className="relative mb-3">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={sourceSearch}
                      onChange={(event) => setSourceSearch(event.target.value)}
                      placeholder="ค้นหาชื่อสหกรณ์..."
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-50"
                    />
                  </div>
                  <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
                    {sheetLoading ? (
                      <div className="rounded-2xl border border-dashed border-blue-100 bg-blue-50/40 p-5 text-center text-sm text-blue-600 font-bold flex items-center justify-center gap-2">
                        <Loader2 size={17} className="animate-spin" />
                        กำลังโหลดข้อมูลจาก Google Sheets
                      </div>
                    ) : filteredSheetRows.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-400 font-medium">
                        ไม่พบข้อมูลกำกับติดตามครั้งที่ 1
                      </div>
                    ) : filteredSheetRows.map((row, index) => (
                      <button
                        key={`${toText(row[SHEET_KEYS.coop])}-${index}`}
                        type="button"
                        onClick={() => handleSelectSource(row, sheetRows.indexOf(row))}
                        className={`cursor-pointer w-full rounded-2xl border p-4 text-left transition hover:border-blue-200 hover:bg-blue-50/60 ${selectedRowIndex === sheetRows.indexOf(row) ? 'border-blue-300 bg-blue-50' : 'border-slate-100 bg-white'}`}
                      >
                        <p className="font-bold text-slate-800 line-clamp-2">{toText(row[SHEET_KEYS.coop]) || '-'}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500 line-clamp-1">{toText(row[SHEET_KEYS.office]) || '-'}</p>
                        <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                          <CalendarDays size={14} />
                          <span>{toText(row[SHEET_KEYS.visitDate]) || '-'}</span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold">ครั้งที่ 1</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </aside>
            </form>
          </div>
        </div>

        <Footer />
      </main>
    </div>
  );
}

function Panel({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-slate-100 bg-white p-4 sm:p-6 shadow-sm">
      <div className="mb-5 flex items-center gap-3">
        <div className="h-11 w-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
          {icon}
        </div>
        <h2 className="text-lg font-black text-slate-900">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function FieldWrap({ label, required, icon, children }: { label: string; required?: boolean; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-500">
        {icon}
        {label}
        {required && <span className="text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}

function TextInput({ label, value, onChange, type = 'text', required, icon }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; icon?: React.ReactNode }) {
  return (
    <FieldWrap label={label} required={required} icon={icon}>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-50"
      />
    </FieldWrap>
  );
}

function DateInput({ label, value, onChange, required }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return (
    <FieldWrap label={label} required={required} icon={<CalendarDays size={16} />}>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-50"
      />
    </FieldWrap>
  );
}

function SelectInput({ label, value, onChange, options, required }: { label: string; value: string; onChange: (value: string) => void; options: string[]; required?: boolean }) {
  return (
    <FieldWrap label={label} required={required}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-50"
      >
        {options.map(option => <option key={option} value={option}>{option || 'ไม่ระบุ'}</option>)}
      </select>
    </FieldWrap>
  );
}

function TextareaInput({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (value: string) => void; rows?: number }) {
  return (
    <FieldWrap label={label}>
      <textarea
        value={value}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-50"
      />
    </FieldWrap>
  );
}
