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
type PermissionKey = 'member' | 'loan' | 'deposit' | 'stock' | 'ledger' | 'savings';
type BackupKey = 'none' | 'single' | 'multiple';

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
  permissions: Record<PermissionKey, string>;
  backup_note: string;
  backups: Record<BackupKey, string>;
  ups_status: string;
  access_register: string;
  upload_responsible: string;
  send_method: string;
  send_current_method: string;
  send_not_current_method: string;
  backup_to_auditor: string;
  tech_officer: string;
  coop_officer: string;
  office_officer: string;
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
  permissionSavings: '5. กำหนดสิทธิ์การใช้งานโปรแกรม [ระบบออมทรัพย์]',
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

const PERMISSION_PROGRAMS: { key: PermissionKey; label: string }[] = [
  { key: 'member', label: 'ระบบสมาชิกและหุ้น' },
  { key: 'loan', label: 'ระบบเงินให้กู้' },
  { key: 'deposit', label: 'ระบบเงินรับฝาก' },
  { key: 'stock', label: 'ระบบสินค้า' },
  { key: 'ledger', label: 'ระบบบัญชีแยกประเภท' },
  { key: 'savings', label: 'ระบบออมทรัพย์' },
];

const BACKUP_SECTIONS: { key: BackupKey; label: string }[] = [
  { key: 'none', label: 'ไม่ได้สำรองข้อมูลไว้ในสื่อบันทึกอื่น' },
  { key: 'single', label: 'สำรองข้อมูลในสื่ออื่นเพียงชุดเดียว' },
  { key: 'multiple', label: 'สำรองข้อมูลในสื่อบันทึกอื่นมากกว่า 1 ชุด' },
];

const SYSTEM_STATUS_OPTIONS = ['', 'ยกยอด', 'ย้อนหลัง', 'ปัจจุบัน', 'ปรับเปลี่ยน'];

const DATA_RECORDING_OPTIONS = [
  '',
  'บันทึกเป็นปัจจุบันทุกวันทำการ',
  'บันทึกสัปดาห์ละ 1 ครั้ง',
  'บันทึกเดือนละ 2 ครั้ง',
  'บันทึกเดือนละ 1 ครั้ง',
];

const PERMISSION_OPTIONS = [
  '',
  'มีการกำหนดสิทธิ์แต่ละ user ชัดเจน',
  'มีการกำหนดสิทธิ์แต่ผู้ใช้งานมีสิทธิยกเลิกแก้ไขได้',
  'ไม่มีการกำหนดสิทธิ์(ใช้รหัสตั้งต้น)',
  'การกำหนดสิทธิให้ผู้ใช้งานชัดเจนแต่มีสิทธิ(เมนูกำหนดสิทธิ/log)',
  'มีการกำหนดสิทธิของผู้ปฎิบัติงานแต่ละระบบ(แต่เปิดใช้งานทุกเมนู)',
  'ยังมีสิทธิของผู้ใช้งานที่ลาออก/เกษียน',
  'ผู้ควบคุมระบบมีสิทธิ์(ระบบรับจ่ายเงิน/ฝาก-ถอน)',
  'ผู้ควบคุม/ผู้ปฏิบัติงานสิทธิเรียกคืน',
];

const BACKUP_OPTIONS = [
  '',
  'เก็บรักษาโดยเจ้าหน้าที่ผู้ปฏิบัติงาน(ไม่มีมติมอบหมาย)',
  'เก็บรักษาโดยเจ้าหน้าที่ผู้ปฏิบัติงาน(มีมติมอบหมาย)',
  'เก็บรักษาภายนอกสหกรณ์',
  'เก็บรักษาใว้ที่สหกรณ์เพียงอยางเดียว',
  'สำรองใว้ในเครื่องคอมพิวเตอร์',
  'เก็บรักษาใน Google Drive',
];

const UPS_OPTIONS = ['', 'มี/ใช้งานได้', 'มี/ใช้งานไม่ได้', 'ไม่มี'];

const ACCESS_REGISTER_OPTIONS = [
  '',
  'มีการจัดทำทะเบียนคุมการเข้าถึงข้อมูลชุดสำรอง',
  'ไม่มีการจัดทำทะเบียนคุมการเข้าถึงข้อมูลชุดสำรอง (สตส.แนะนำให้แบบฟอร์ม)',
  'ไม่มีการจัดทำทะเบียนคุมการเข้าถึงข้อมูลชุดสำรอง (สตส.ไม่ได้แนะนำ)',
];

const SEND_METHOD_OPTIONS = [
  '',
  'ส่งข้อมูลภายในเครื่องเดียวกันที่บันทึกงาน',
  'มีการเชื่อมต่อผ่านระบบเครือข่ายในการนำส่งข้อมูลที่อยู่ต่างเครื่อง',
  'นำก้อนข้อมูลมาเรียกคืนต่างเครื่องเพื่อนำส่งข้อมูล',
];

const BACKUP_TO_AUDITOR_OPTIONS = [
  '',
  'ส่งแฟ้มข้อมูลสำรองให้ผู้สอบบัญชี',
  'ส่งแฟ้มข้อมูลสำรองให้ผู้สอบบัญชีไม่ถูกต้อง',
  'ไม่ได้ส่งแฟ้มข้อมูลสำรองให้ผู้สอบบัญชี(สตส.มีการแนะนำ)',
  'ไม่ได้ส่งแฟ้มข้อมูลสำรองให้ผู้สอบบัญชี(สตส.ไม่มีการแนะนำ)',
];

const TECH_OFFICER_OPTIONS = [
  '',
  'นางภัทร์ชยาพร  บุญภิบาล',
  'นางกิตติมา  สุขจันทรา',
  'นางสาวพัชรินทร์ คีรีเพ็ชร',
  'นายทวีศักดิ์  โต๊ะหลี',
  'นายสุภลักษณ์  จันโบ',
];

const emptySystems = (): Record<SystemKey, SystemForm> => ({
  ledger: { status: '', version: '', saved_to_date: '' },
  member: { status: '', version: '', saved_to_date: '' },
  loan: { status: '', version: '', saved_to_date: '' },
  deposit: { status: '', version: '', saved_to_date: '' },
  stock: { status: '', version: '', saved_to_date: '' },
});

const emptyPermissions = (): Record<PermissionKey, string> => ({
  member: '',
  loan: '',
  deposit: '',
  stock: '',
  ledger: '',
  savings: '',
});

const emptyBackups = (): Record<BackupKey, string> => ({
  none: '',
  single: '',
  multiple: '',
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
  permissions: emptyPermissions(),
  backup_note: '',
  backups: emptyBackups(),
  ups_status: '',
  access_register: '',
  upload_responsible: '',
  send_method: '',
  send_current_method: '',
  send_not_current_method: '',
  backup_to_auditor: '',
  tech_officer: '',
  coop_officer: '',
  office_officer: '',
  advice: '',
  problem: '',
});

const toText = (value: unknown) => String(value ?? '').trim();

const splitSheetChoices = (value: unknown) => toText(value)
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);

const joinSheetChoices = (values: string[]) => values
  .map(item => item.trim())
  .filter(Boolean)
  .join(', ');

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
  toText(row[SHEET_KEYS.permissionSavings]),
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
    permissions: {
      member: toText(row[SHEET_KEYS.permissionMember]),
      loan: toText(row[SHEET_KEYS.permissionLoan]),
      deposit: toText(row[SHEET_KEYS.permissionDeposit]),
      stock: toText(row[SHEET_KEYS.permissionStock]),
      ledger: toText(row[SHEET_KEYS.permissionLedger]),
      savings: toText(row[SHEET_KEYS.permissionSavings]),
    },
    backup_note: buildBackupNote(row),
    backups: {
      none: toText(row[SHEET_KEYS.backupNone]),
      single: toText(row[SHEET_KEYS.backupSingle]),
      multiple: toText(row[SHEET_KEYS.backupMultiple]),
    },
    ups_status: toText(row[SHEET_KEYS.ups]),
    access_register: toText(row[SHEET_KEYS.accessRegister]),
    upload_responsible: toText(row[SHEET_KEYS.uploadResponsible]) || userData?.Name_Surname || '',
    send_method: toText(row[SHEET_KEYS.sendCurrent]) || toText(row[SHEET_KEYS.sendNotCurrent]),
    send_current_method: toText(row[SHEET_KEYS.sendCurrent]),
    send_not_current_method: toText(row[SHEET_KEYS.sendNotCurrent]),
    backup_to_auditor: toText(row[SHEET_KEYS.backupToAuditor]),
    tech_officer: toText(row[SHEET_KEYS.techOfficer]),
    coop_officer: toText(row[SHEET_KEYS.coopOfficer]),
    office_officer: toText(row[SHEET_KEYS.officeOfficer]),
    advice: toText(row[SHEET_KEYS.advice]),
    problem: toText(row[SHEET_KEYS.problem]),
  };
};

const formToSheetRow = (form: MonitorForm, _userData?: any): SheetRow => {
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
    [SHEET_KEYS.permissionMember]: form.permissions.member,
    [SHEET_KEYS.permissionLoan]: form.permissions.loan,
    [SHEET_KEYS.permissionDeposit]: form.permissions.deposit,
    [SHEET_KEYS.permissionStock]: form.permissions.stock,
    [SHEET_KEYS.permissionLedger]: form.permissions.ledger,
    [SHEET_KEYS.permissionSavings]: form.permissions.savings,
    [SHEET_KEYS.backupNone]: form.backups.none,
    [SHEET_KEYS.backupSingle]: form.backups.single,
    [SHEET_KEYS.backupMultiple]: form.backups.multiple,
    [SHEET_KEYS.accessRegister]: form.access_register,
    [SHEET_KEYS.uploadResponsible]: form.upload_responsible,
    [SHEET_KEYS.sendCurrent]: form.send_current_method,
    [SHEET_KEYS.sendNotCurrent]: form.send_not_current_method,
    [SHEET_KEYS.backupToAuditor]: form.backup_to_auditor,
    [SHEET_KEYS.advice]: form.advice,
    [SHEET_KEYS.problem]: form.problem,
    [SHEET_KEYS.techOfficer]: form.tech_officer,
    [SHEET_KEYS.coopOfficer]: form.coop_officer,
    [SHEET_KEYS.officeOfficer]: form.office_officer,
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

  const updatePermission = (permission: PermissionKey, value: string) => {
    setForm(current => ({
      ...current,
      permissions: {
        ...current.permissions,
        [permission]: value,
      },
      permission_note: Object.entries({ ...current.permissions, [permission]: value })
        .map(([, item]) => item)
        .filter(Boolean)
        .join(' | '),
    }));
  };

  const updateBackup = (backup: BackupKey, value: string) => {
    setForm(current => ({
      ...current,
      backups: {
        ...current.backups,
        [backup]: value,
      },
      backup_note: Object.entries({ ...current.backups, [backup]: value })
        .map(([, item]) => item)
        .filter(Boolean)
        .join(' | '),
    }));
  };

  const handleSourceSearchChange = (value: string) => {
    setSourceSearch(value);
    if (hasSelectedSource && value !== form.coop_name) {
      setSelectedRowIndex(null);
      setForm(current => ({
        ...current,
        coop_name: '',
        project: '',
      }));
    }
  };

  const resetForm = () => {
    setForm({
      ...initialForm(),
      office: userData?.Division_Province || '',
      upload_responsible: userData?.Name_Surname || '',
    });
    setSelectedRowIndex(null);
    setSourceSearch('');
    toast.info('ล้างฟอร์มเรียบร้อยแล้ว');
  };

  const validateForm = () => {
    if (!hasSelectedSource) return 'กรุณาค้นหาและเลือกชื่อสหกรณ์จากข้อมูลครั้งที่ 1';
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
      setSourceSearch('');
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
    setSourceSearch(toText(row[SHEET_KEYS.coop]));
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

  const sourceSuggestions = useMemo(() => filteredSheetRows.slice(0, 8), [filteredSheetRows]);

  const completion = useMemo(() => {
    const required = [hasSelectedSource ? 'selected' : '', form.office, form.visit_date, form.coop_name, form.visit_round];
    return Math.round((required.filter(Boolean).length / required.length) * 100);
  }, [form, hasSelectedSource]);

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
                    <div className="md:col-span-2">
                      <div className="relative">
                        <FieldWrap label="ค้นหาและเลือกชื่อสหกรณ์จากข้อมูลครั้งที่ 1" required icon={<Search size={16} />}>
                          <input
                            value={sourceSearch}
                            onChange={(event) => handleSourceSearchChange(event.target.value)}
                            placeholder="พิมพ์ชื่อสหกรณ์เพื่อค้นหา..."
                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-50"
                          />
                        </FieldWrap>
                        {sourceSearch && !hasSelectedSource && (
                          <div className="absolute z-30 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-blue-100 bg-white p-2 shadow-xl shadow-slate-200/70">
                            {sheetLoading ? (
                              <div className="flex items-center justify-center gap-2 px-3 py-4 text-sm font-bold text-blue-600">
                                <Loader2 size={16} className="animate-spin" />
                                กำลังโหลดข้อมูล
                              </div>
                            ) : sourceSuggestions.length === 0 ? (
                              <div className="px-3 py-4 text-center text-sm font-semibold text-slate-400">ไม่พบชื่อสหกรณ์ที่ค้นหา</div>
                            ) : sourceSuggestions.map((row, index) => (
                              <button
                                key={`${toText(row[SHEET_KEYS.coop])}-suggest-${index}`}
                                type="button"
                                onClick={() => handleSelectSource(row, sheetRows.indexOf(row))}
                                className="cursor-pointer w-full rounded-xl px-3 py-3 text-left transition hover:bg-blue-50"
                              >
                                <p className="font-bold text-slate-800">{toText(row[SHEET_KEYS.coop]) || '-'}</p>
                                <p className="mt-0.5 text-xs font-semibold text-slate-500">{toText(row[SHEET_KEYS.office]) || '-'}</p>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <TextInput label="สำนักงานตรวจบัญชีสหกรณ์" value={form.office} onChange={(v) => updateField('office', v)} icon={<Building2 size={16} />} required />
                    <DateInput label="วันที่เข้ากำกับติดตาม" value={form.visit_date} onChange={(v) => updateField('visit_date', v)} required />
                    <TextInput label="ชื่อสหกรณ์" value={form.coop_name} onChange={(v) => updateField('coop_name', v)} required readOnly />
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
                          <SelectInput label="สถานะ" value={form.systems[system.key].status} onChange={(v) => updateSystem(system.key, 'status', v)} options={SYSTEM_STATUS_OPTIONS} />
                          <TextInput label="เวอร์ชั่น" value={form.systems[system.key].version} onChange={(v) => updateSystem(system.key, 'version', v)} />
                          <DateInput label="บันทึกงานถึงวันที่" value={form.systems[system.key].saved_to_date} onChange={(v) => updateSystem(system.key, 'saved_to_date', v)} />
                        </div>
                      </div>
                    ))}
                  </div>
                </Panel>

                <Panel icon={<FilePenLine size={20} />} title="รายละเอียดการควบคุมและข้อเสนอแนะ">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SingleChoiceInput label="4. การบันทึกข้อมูลในโปรแกรมระบบบัญชี" value={form.data_recording} onChange={(v) => updateField('data_recording', v)} options={DATA_RECORDING_OPTIONS} />
                    <div className="md:col-span-2 rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                      <p className="mb-4 font-black text-slate-900">การกำหนดสิทธิ์การใช้งานโปรแกรม</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {PERMISSION_PROGRAMS.map(program => (
                          <MultiChoiceInput
                            key={program.key}
                            label={program.label}
                            value={form.permissions[program.key]}
                            onChange={(v) => updatePermission(program.key, v)}
                            options={PERMISSION_OPTIONS}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="md:col-span-2 rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                      <p className="mb-4 font-black text-slate-900">การสำรองข้อมูลและการเก็บรักษาข้อมูล</p>
                      <div className="grid grid-cols-1 gap-4">
                        {BACKUP_SECTIONS.map(section => (
                          <MultiChoiceInput
                            key={section.key}
                            label={section.label}
                            value={form.backups[section.key]}
                            onChange={(v) => updateBackup(section.key, v)}
                            options={BACKUP_OPTIONS}
                          />
                        ))}
                      </div>
                    </div>
                    <SingleChoiceInput label="เครื่องสำรองไฟ" value={form.ups_status} onChange={(v) => updateField('ups_status', v)} options={UPS_OPTIONS} />
                    <SingleChoiceInput label="จัดทำทะเบียนคุมการเข้าถึงแฟ้มข้อมูล" value={form.access_register} onChange={(v) => updateField('access_register', v)} options={ACCESS_REGISTER_OPTIONS} />
                    <TextInput label="ผู้รับผิดชอบนำส่งแฟ้มข้อมูลออนไลน์" value={form.upload_responsible} onChange={(v) => updateField('upload_responsible', v)} />
                    <div className="md:col-span-2 rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                      <p className="mb-4 font-black text-slate-900">วิธีการนำส่งข้อมูล SmartMember & SmartManage</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <SingleChoiceInput label="ส่งข้อมูลเป็นปัจจุบัน" value={form.send_current_method} onChange={(v) => updateField('send_current_method', v)} options={SEND_METHOD_OPTIONS} />
                        <SingleChoiceInput label="ส่งข้อมูลไม่เป็นปัจจุบัน" value={form.send_not_current_method} onChange={(v) => updateField('send_not_current_method', v)} options={SEND_METHOD_OPTIONS} />
                      </div>
                    </div>
                    <SingleChoiceInput label="ส่งแฟ้มข้อมูลสำรองให้ผู้สอบบัญชี" value={form.backup_to_auditor} onChange={(v) => updateField('backup_to_auditor', v)} options={BACKUP_TO_AUDITOR_OPTIONS} />
                    <div className="md:col-span-2">
                      <TextareaInput label="เรื่องที่แนะนำให้เจ้าหน้าที่/IT Provider" value={form.advice} onChange={(v) => updateField('advice', v)} rows={7} />
                    </div>
                    <div className="md:col-span-2">
                      <TextareaInput label="ปัญหาการใช้งานโปรแกรม" value={form.problem} onChange={(v) => updateField('problem', v)} rows={4} />
                    </div>
                    <div className="md:col-span-2">
                      <SelectInput label="ชื่อ-นามสกุล เจ้าหน้าที่กลุ่มเทคฯ (ผู้ติดตาม)" value={form.tech_officer} onChange={(v) => updateField('tech_officer', v)} options={TECH_OFFICER_OPTIONS} />
                    </div>
                    <div className="md:col-span-2">
                      <TextInput label="ชื่อ-นามสกุล เจ้าหน้าที่สหกรณ์ (ผู้ให้ข้อมูล)" value={form.coop_officer} onChange={(v) => updateField('coop_officer', v)} />
                    </div>
                    <div className="md:col-span-2">
                      <TextInput label="ชื่อ-นามสกุล เจ้าหน้าที่สำนักงานตรวจบัญชี" value={form.office_officer} onChange={(v) => updateField('office_officer', v)} />
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

function TextInput({ label, value, onChange, type = 'text', required, icon, readOnly }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; icon?: React.ReactNode; readOnly?: boolean }) {
  return (
    <FieldWrap label={label} required={required} icon={icon}>
      <input
        type={type}
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-50 ${readOnly ? 'cursor-not-allowed text-slate-500' : ''}`}
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
  const selectOptions = value && !options.includes(value) ? [...options, value] : options;

  return (
    <FieldWrap label={label} required={required}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-50"
      >
        {selectOptions.map(option => <option key={option} value={option}>{option || 'ไม่ระบุ'}</option>)}
      </select>
    </FieldWrap>
  );
}

function SingleChoiceInput({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  const normalizedOptions = options.filter(Boolean);
  const extraOptions = value && !normalizedOptions.includes(value) ? [value] : [];
  const allOptions = [...normalizedOptions, ...extraOptions];

  return (
    <FieldWrap label={label}>
      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <div className="grid grid-cols-1 gap-2">
          {allOptions.map(option => {
            const checked = value === option;
            return (
              <label
                key={option}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                  checked ? 'border-blue-200 bg-blue-50 text-slate-900' : 'border-slate-100 bg-slate-50 text-slate-600 hover:border-blue-100 hover:bg-blue-50/50'
                }`}
              >
                <input
                  type="radio"
                  checked={checked}
                  onChange={() => onChange(option)}
                  className="mt-1 h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="leading-relaxed">{option}</span>
              </label>
            );
          })}
        </div>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="mt-3 cursor-pointer text-xs font-bold text-slate-400 transition hover:text-blue-600"
          >
            ล้างค่า
          </button>
        )}
        {!value && (
          <p className="mt-2 text-xs font-semibold text-slate-400">ไม่ระบุ</p>
        )}
      </div>
    </FieldWrap>
  );
}

function MultiChoiceInput({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  const [otherText, setOtherText] = useState('');
  const selected = splitSheetChoices(value);
  const normalizedOptions = options.filter(Boolean);
  const extraOptions = selected.filter(item => !normalizedOptions.includes(item));
  const allOptions = [...normalizedOptions, ...extraOptions];

  const updateChoices = (choices: string[]) => {
    onChange(joinSheetChoices(Array.from(new Set(choices))));
  };

  const toggleValue = (option: string, checked: boolean) => {
    const current = new Set(selected);
    if (checked) {
      current.add(option);
    } else {
      current.delete(option);
    }
    updateChoices(Array.from(current));
  };

  const addOtherChoice = () => {
    const value = otherText.trim();
    if (!value) return;
    updateChoices([...selected, value]);
    setOtherText('');
  };

  return (
    <FieldWrap label={label}>
      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <div className="grid grid-cols-1 gap-2">
          {allOptions.map(option => {
            const checked = selected.includes(option);
            return (
              <label
                key={option}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                  checked ? 'border-blue-200 bg-blue-50 text-slate-900' : 'border-slate-100 bg-slate-50 text-slate-600 hover:border-blue-100 hover:bg-blue-50/50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => toggleValue(option, event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="leading-relaxed">
                  {option}
                </span>
              </label>
            );
          })}
        </div>
        <div className="mt-3 rounded-xl border border-dashed border-blue-100 bg-blue-50/40 p-3">
          <p className="mb-2 text-xs font-black text-blue-700">อื่นๆ</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={otherText}
              onChange={(event) => setOtherText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addOtherChoice();
                }
              }}
              placeholder="พิมพ์ระบุเพิ่มเติม..."
              className="min-w-0 flex-1 rounded-xl border border-blue-100 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
            />
            <button
              type="button"
              onClick={addOtherChoice}
              className="cursor-pointer rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-blue-500/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!otherText.trim()}
            >
              เพิ่ม
            </button>
          </div>
        </div>
        {selected.length === 0 && (
          <p className="mt-2 text-xs font-semibold text-slate-400">ไม่ระบุ</p>
        )}
      </div>
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
