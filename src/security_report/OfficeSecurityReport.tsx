import { useCallback, useState, useEffect } from 'react';
import {
  ShieldCheck,
  Search,
  Clock,
  MapPin,
  FileText,
  ChevronRight,
  ShieldAlert,
  Info,
  CheckCircle2,
  ClipboardList,
  AlertCircle,
  ArrowLeft,
  X
} from 'lucide-react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import Header from '../Header';
import LeftSide from '../LeftSide';
import Footer from '../Footer';

// ==========================================
// FALLBACK DATA (ใช้แสดงผลเมื่อ API มีปัญหา)
// ==========================================
const FALLBACK_MOCK_DATA = [
  { "วันที่": "24/10/2023", "เวลา": "08:00", "จุดตรวจ": "ประตูหลัก (Main Gate)", "ผู้ตรวจ": "สมชาย โพธิ์งาม", "สถานะ": "ปกติ", "หมายเหตุ": "-" },
  { "วันที่": "24/10/2023", "เวลา": "09:30", "จุดตรวจ": "ลานจอดรถ A", "ผู้ตรวจ": "สมชาย โพธิ์งาม", "สถานะ": "ผิดปกติ", "หมายเหตุ": "พบไฟส่องสว่างดวงที่ 3 กระพริบ" },
  { "วันที่": "24/10/2023", "เวลา": "11:00", "จุดตรวจ": "ห้องเซิร์ฟเวอร์", "ผู้ตรวจ": "วิชัย รักษาความปลอดภัย", "สถานะ": "ปกติ", "หมายเหตุ": "อุณหภูมิห้อง 22 องศาเซลเซียส" },
  { "วันที่": "24/10/2023", "เวลา": "13:00", "จุดตรวจ": "ประตูหลัง", "ผู้ตรวจ": "สมชาย โพธิ์งาม", "สถานะ": "ปกติ", "หมายเหตุ": "ตรวจสอบความเรียบร้อย" },
  { "วันที่": "24/10/2023", "เวลา": "15:45", "จุดตรวจ": "โกดังเก็บของ", "ผู้ตรวจ": "วิชัย รักษาความปลอดภัย", "สถานะ": "ผิดปกติ", "หมายเหตุ": "พบรอยงัดแงะที่แม่กุญแจ ได้แจ้งหัวหน้าแล้ว" }
];

// เปลี่ยนจาก App Script เป็นลิงก์ Google Sheets CSV (ไม่มีปัญหา CORS 100%)
const SECURITY_REPORT_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ19m-yrpFmOhL7HzPlSnupVa80QBRH3e0zWcI0joKWgkKiM-h9THfsiIM5gVDnKPJMeD3RJ1FuuxJ0/pub?output=csv';

// ฟังก์ชันช่วยแปลงข้อมูล CSV เป็น JSON
const csvToJson = (csv: string) => {
  const lines = csv.split(/\r?\n/);
  if (lines.length === 0) return [];

  const splitRegex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
  const headers = lines[0].split(splitRegex).map(h => h.replace(/^"|"$/g, '').trim());
  const result = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const currentline = lines[i].split(splitRegex);
    const obj: any = {};
    for (let j = 0; j < headers.length; j++) {
      const val = currentline[j] || '';
      obj[headers[j]] = val.replace(/^"|"$/g, '').trim();
    }
    result.push(obj);
  }
  return result;
};

export default function OfficeSecurityReport() {
  const [userData, setUserData] = useState<any>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Data States
  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [isUsingMockData, setIsUsingMockData] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 2; // แสดง 2 วันต่อหน้า
  
  // Modal States
  const [showAbnormalModal, setShowAbnormalModal] = useState(false);

  const fetchData = useCallback(async (showToast = false) => {
    setIsLoading(true);
    setError(null);
    setIsUsingMockData(false);
    if (showToast) toast.info('กำลังอัปเดตข้อมูล...', { autoClose: 1500 });

    try {
      const response = await fetch(SECURITY_REPORT_CSV_URL);
      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
      const csvText = await response.text();
      const finalData = csvToJson(csvText);
      setData(finalData);
      if (showToast) toast.success('อัปเดตข้อมูลสำเร็จ');
    } catch (err: any) {
      console.warn("Fetch Warning:", err.message);
      const errorMsg = 'ไม่สามารถดึงข้อมูลจาก Google Sheets ได้ แสดงข้อมูลจำลองแทน';
      setError(errorMsg);
      if (showToast) toast.warning(errorMsg);
      setData(FALLBACK_MOCK_DATA);
      setIsUsingMockData(true);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser && savedUser !== 'undefined') {
      try {
        setUserData(JSON.parse(savedUser));
      } catch (e) {
        localStorage.removeItem('user');
      }
    }

    const handleResize = () => {
      if (window.innerWidth < 1024) setIsSidebarOpen(false);
      else setIsSidebarOpen(true);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    fetchData();

    return () => window.removeEventListener('resize', handleResize);
  }, [fetchData]);

  const handleLogout = () => {
    localStorage.removeItem('user');
    window.location.href = '/';
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchData(true);
  };

  const filteredData = data.filter(item => {
    // ดึงค่าประทับเวลา (ใช้ "วันที่" สำหรับ mock หรือ "ประทับเวลา" สำหรับข้อมูลจริง)
    const timeStr = item["ประทับเวลา"] || item["วันที่"] || "";
    if (!timeStr) return true;

    // ตรวจสอบการกรองด้วยเดือน
    const [d, m, y] = timeStr.split(',')[0].split('/');
    if (d && m && y) {
      const itemMonth = `${y}-${m.padStart(2, '0')}`;
      if (selectedMonth && itemMonth !== selectedMonth) return false;
    }

    if (!searchTerm) return true;
    return Object.values(item).some(val =>
      String(val).toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  // ฟังก์ชันแปลงวันที่เป็นภาษาไทย
  const toThaiDate = (dateStr: string) => {
    if (!dateStr) return "";
    const [datePart, timePart] = dateStr.split(', ');
    const [d, m, y] = datePart.split('/');
    const thaiMonths = [
      "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
      "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
    ];
    const yearThai = parseInt(y) + 543;
    return `${d} ${thaiMonths[parseInt(m) - 1]} ${yearThai}${timePart ? ` เวลา ${timePart.slice(0, 5)} น.` : ""}`;
  };

  const toThaiTimeOnly = (dateStr: string) => {
    if (!dateStr) return "";
    const parts = dateStr.split(', ');
    const timePart = parts[1] || "";
    return timePart ? `เวลา ${timePart.slice(0, 5)} น.` : "-";
  };

  const toThaiDateOnly = (dateStr: string) => {
    if (!dateStr) return "";
    const [datePart] = dateStr.split(', ');
    const [d, m, y] = datePart.split('/');
    const thaiMonths = [
      "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
      "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
    ];
    const yearThai = parseInt(y) + 543;
    return `${d} ${thaiMonths[parseInt(m) - 1]} ${yearThai}`;
  };

  // จัดกลุ่มข้อมูลตามวัน (นับ 19:00 - 05:00 เป็นวันเดียวกัน)
  const groupedData: { [key: string]: any[] } = {};
  filteredData.forEach(item => {
    const timeStr = item["ประทับเวลา"] || item["วันที่"] || "";
    if (!timeStr) return;

    const [datePart, timePart] = timeStr.split(', ');
    const [d, m, y] = datePart.split('/').map(Number);
    const [hh, mm] = (timePart || "00:00").split(':').map(Number);

    // สร้าง Date object สำหรับคำนวณ (ใช้ ค.ศ.)
    const entryDate = new Date(y, m - 1, d, hh, mm);
    
    // ถ้าเวลาอยู่ระหว่าง 00:00 - 05:59 น. ให้ถือเป็นข้อมูลของเมื่อวาน (กะกลางคืน)
    const reportDate = new Date(entryDate);
    if (hh < 6) { // ปรับเป็นก่อน 6 โมงเช้า (ครอบคลุมตี 5 ตามที่ผู้ใช้แจ้ง)
      reportDate.setDate(reportDate.getDate() - 1);
    }

    const reportDateStr = `${reportDate.getDate()}/${reportDate.getMonth() + 1}/${reportDate.getFullYear()}`;

    if (!groupedData[reportDateStr]) {
      groupedData[reportDateStr] = [];
    }
    groupedData[reportDateStr].push(item);
  });

  // เรียงลำดับวันที่ (จากใหม่ไปเก่า)
  const sortedDates = Object.keys(groupedData).sort((a, b) => {
    const [d1, m1, y1] = a.split('/').map(Number);
    const [d2, m2, y2] = b.split('/').map(Number);
    return new Date(y2, m2 - 1, d2).getTime() - new Date(y1, m1 - 1, d1).getTime();
  });

  // การแบ่งหน้า
  const totalPages = Math.ceil(sortedDates.length / itemsPerPage);
  const currentDates = sortedDates.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // กำหนดลำดับคอลัมน์ใหม่ตามที่ผู้ใช้ขอ
  // ลำดับที่ต้องการ: ประทับเวลา, ชื่อผู้ตรวจยาม, เหตุการณ์, จุดตรวจ, บันทึกการตรวจของยาม
  const rawColumns = data.length > 0 ? Object.keys(data[0]) : [];
  const orderedColumns = [
    "ประทับเวลา",
    "ชื่อผู้ตรวจยาม",
    "เหตุการณ์",
    "จุดตรวจ",
    "บันทึกการตรวจของยาม"
  ].filter(col => rawColumns.includes(col));

  // รวมคอลัมน์ที่เหลือ (ถ้ามี)
  const columns = [...orderedColumns, ...rawColumns.filter(col => !orderedColumns.includes(col))];

  // เตรียมข้อมูลความผิดปกติไว้ล่วงหน้าเพื่อความเร็วในการแสดงผล
  const abnormalRecords = filteredData.filter(row => 
    Object.values(row).some(val => String(val).includes('ผิดปกติ'))
  );

  return (
    <div className="flex h-screen bg-[#f8fafc] font-sans text-slate-800 overflow-hidden relative selection:bg-blue-500/30">
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar={false} theme="colored" />
      
      {/* Background Orbs */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-5%] w-[40vw] h-[40vw] bg-blue-400/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-5%] w-[35vw] h-[35vw] bg-indigo-400/10 rounded-full blur-[120px]" />
      </div>

      <LeftSide
        userData={userData}
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        handleLogout={handleLogout}
      />

      <main className="flex-1 flex flex-col h-full overflow-hidden z-10 transition-all duration-300">
        <Header
          setIsSidebarOpen={setIsSidebarOpen}
          handleRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          handleLogout={handleLogout}
        />

        <div className="flex-1 overflow-y-auto scroll-smooth">
          {/* Breadcrumbs */}
          <div className="max-w-7xl mx-auto px-6 pt-6">
            <div className="flex items-center gap-2 text-sm md:text-base mb-4">
              <a href="/index" className="flex items-center gap-1.5 text-blue-600 hover:text-blue-800 font-bold transition-all hover:-translate-x-1">
                <ArrowLeft size={18} /> หน้าหลัก
              </a>
              <ChevronRight size={16} className="text-slate-400" />
              <span className="text-slate-600 font-medium">รายงานการรักษาความปลอดภัยสำนักงาน</span>
            </div>
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-800 flex items-center gap-3">
                  <ShieldCheck className="text-blue-500" size={32} />
                  รายงานการรักษาความปลอดภัย
                </h2>
                <p className="text-slate-500 mt-1">รายการตรวจสอบและรายงานสถานการณ์ประจำวัน</p>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                <div className="flex items-center gap-2 w-full sm:w-auto bg-white border border-slate-200 rounded-xl px-2 py-1 shadow-sm">
                  <select 
                    className="bg-transparent border-none focus:ring-0 text-sm font-medium text-slate-700 py-1.5 cursor-pointer"
                    value={selectedMonth.split('-')[1]}
                    onChange={(e) => {
                      const [y] = selectedMonth.split('-');
                      setSelectedMonth(`${y}-${e.target.value}`);
                    }}
                  >
                    {[
                      "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
                      "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
                    ].map((m, idx) => (
                      <option key={idx} value={String(idx + 1).padStart(2, '0')}>{m}</option>
                    ))}
                  </select>
                  <div className="w-px h-4 bg-slate-200"></div>
                  <select 
                    className="bg-transparent border-none focus:ring-0 text-sm font-medium text-slate-700 py-1.5 cursor-pointer"
                    value={selectedMonth.split('-')[0]}
                    onChange={(e) => {
                      const [, m] = selectedMonth.split('-');
                      setSelectedMonth(`${e.target.value}-${m}`);
                    }}
                  >
                    {Array.from({ length: 11 }, (_, i) => 2020 + i).map(y => (
                      <option key={y} value={String(y)}>{y + 543}</option>
                    ))}
                  </select>
                </div>
                
                <div className="relative w-full md:w-72 shadow-sm rounded-xl">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="text"
                    placeholder="ค้นหารายงาน..."
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Error Alert Box */}
            {error && (
              <div className="bg-orange-50 border border-orange-200 p-5 rounded-2xl animate-in fade-in duration-300 flex gap-4">
                <div className="mt-0.5">
                  <Info className="text-orange-500" size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-orange-800 text-sm mb-1">{error}</h3>
                  <div className="text-orange-700 text-sm space-y-2">
                    <p>ระบบไม่สามารถดึงข้อมูลจริงจาก Google Sheets ได้ จึงแสดงข้อมูลจำลองแทน</p>
                    <p className="text-xs opacity-75">ข้อแนะนำ: ตรวจสอบการตั้งค่า "เผยแพร่ทางเว็บ" ของ Google Sheets</p>
                  </div>
                </div>
              </div>
            )}

            {/* Summary Cards */}
            {!isLoading && filteredData.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-75">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center text-blue-500">
                    <ClipboardList size={24} />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 font-medium">รายงานทั้งหมด</p>
                    <p className="text-2xl font-bold text-slate-800">{filteredData.length} <span className="text-sm font-normal text-slate-500">รายการ</span></p>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                  <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center text-green-500">
                    <CheckCircle2 size={24} />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 font-medium">สถานะปกติ</p>
                    <p className="text-2xl font-bold text-slate-800">
                      {filteredData.filter(row => !Object.values(row).some(val => String(val).includes('ผิดปกติ'))).length}
                      <span className="text-sm font-normal text-slate-500"> รายการ</span>
                    </p>
                  </div>
                </div>

                <button 
                  onClick={() => setShowAbnormalModal(true)}
                  className="bg-white p-5 rounded-2xl border border-red-100 shadow-sm flex items-center gap-4 relative overflow-hidden hover:bg-red-50/50 transition-all text-left group"
                >
                  <div className="absolute top-0 left-0 w-1 h-full bg-red-500 group-hover:w-2 transition-all"></div>
                  <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center text-red-500">
                    <AlertCircle size={24} />
                  </div>
                  <div>
                    <p className="text-sm text-red-600 font-medium">พบความผิดปกติ</p>
                    <p className="text-2xl font-bold text-slate-800">
                      {abnormalRecords.length}
                      <span className="text-sm font-normal text-slate-500"> รายการ</span>
                    </p>
                  </div>
                  <ChevronRight size={20} className="ml-auto text-red-300 group-hover:text-red-500 transition-colors" />
                </button>
              </div>
            )}

            <div className="relative min-h-[400px]">
              {isLoading && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/50 backdrop-blur-sm rounded-2xl border border-white">
                  <div className="relative w-20 h-20 flex items-center justify-center">
                    <div className="absolute inset-0 border-4 border-blue-100 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-blue-500 rounded-full border-t-transparent animate-spin"></div>
                    <ShieldCheck className="text-blue-500 animate-pulse" size={28} />
                  </div>
                  <p className="mt-4 font-medium text-slate-600 animate-pulse">กำลังโหลดข้อมูล...</p>
                </div>
              )}

              {!isLoading && filteredData.length === 0 && (
                <div className="flex flex-col items-center justify-center p-16 bg-white rounded-2xl border border-slate-200 shadow-sm text-center animate-in fade-in duration-500">
                  <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4 border border-slate-100">
                    <FileText className="text-slate-400" size={36} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-700 mb-1">ไม่พบข้อมูลรายงาน</h3>
                  <p className="text-slate-500">
                    {searchTerm ? `ไม่มีผลลัพธ์ที่ตรงกับคำว่า "${searchTerm}"` : "ยังไม่มีข้อมูลการรายงานในระบบขณะนี้"}
                  </p>
                </div>
              )}

              {!isLoading && filteredData.length > 0 && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150 fill-mode-both">
                  {isUsingMockData && (
                    <div className="mb-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right italic">
                      * กำลังแสดงผลด้วยข้อมูลจำลอง (Fallback Data)
                    </div>
                  )}

                  {/* Desktop Daily Sets */}
                  <div className="hidden md:block space-y-8">
                    {currentDates.map((dateStr) => (
                      <div key={dateStr} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                          <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <Clock className="text-blue-500" size={20} />
                            ข้อมูลประจำวันที่ {toThaiDateOnly(dateStr)}
                          </h3>
                          <span className="text-sm font-medium text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                            {groupedData[dateStr].length} รายการตรวจ
                          </span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-white border-b border-slate-100">
                                {columns.map((col, index) => (
                                  <th key={index} className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">
                                    {col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {groupedData[dateStr].sort((a, b) => {
                                const timeAStr = a["ประทับเวลา"] || a["วันที่"] || "";
                                const timeBStr = b["ประทับเวลา"] || b["วันที่"] || "";
                                
                                const parseEntry = (ts: string) => {
                                  const [dp, tp] = ts.split(', ');
                                  const [d, m, y] = dp.split('/').map(Number);
                                  const [hh, mm] = (tp || "00:00").split(':').map(Number);
                                  return new Date(y, m - 1, d, hh, mm).getTime();
                                };
                                
                                return parseEntry(timeAStr) - parseEntry(timeBStr);
                              }).map((row, rowIndex) => (
                                <tr key={rowIndex} className="hover:bg-blue-50/30 transition-colors group">
                                  {columns.map((col, colIndex) => {
                                    let value = row[col];
                                    const isStatus = String(value).includes('ปกติ') || String(col).toLowerCase().includes('status');
                                    const isWarning = String(value).includes('ผิดปกติ');
                                    
                                    // แปลงวันที่เป็นไทยในตาราง - ตัดเหลือแค่เวลา
                                    if (col === "ประทับเวลา" || col === "วันที่") {
                                      value = toThaiTimeOnly(value);
                                    }

                                    return (
                                      <td key={colIndex} className="px-6 py-4 text-sm text-slate-700">
                                        {isStatus ? (
                                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${isWarning ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                                            {value}
                                          </span>
                                        ) : (
                                          value
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between bg-white px-6 py-4 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="text-sm text-slate-500">
                          แสดงหน้า <span className="font-semibold text-slate-700">{currentPage}</span> จาก <span className="font-semibold text-slate-700">{totalPages}</span> หน้า
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                            className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            ก่อนหน้า
                          </button>
                          
                          {/* เลขหน้า */}
                          <div className="hidden sm:flex items-center gap-1">
                            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                              // แสดงเลขหน้าแบบจำกัด (ถ้าหน้าเยอะเกินไป)
                              if (
                                totalPages > 7 && 
                                page !== 1 && 
                                page !== totalPages && 
                                Math.abs(page - currentPage) > 1
                              ) {
                                if (Math.abs(page - currentPage) === 2) return <span key={page} className="px-1 text-slate-400">...</span>;
                                return null;
                              }
                              
                              return (
                                <button
                                  key={page}
                                  onClick={() => setCurrentPage(page)}
                                  className={`w-10 h-10 flex items-center justify-center rounded-lg text-sm font-bold transition-all ${
                                    currentPage === page 
                                    ? 'bg-blue-500 text-white shadow-md shadow-blue-200' 
                                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                                  }`}
                                >
                                  {page}
                                </button>
                              );
                            })}
                          </div>

                          <button
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            ถัดไป
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="bg-slate-50 px-6 py-4 rounded-xl border border-dashed border-slate-300 text-center text-sm text-slate-500">
                      แสดงผล <span className="font-semibold text-slate-700">{filteredData.length}</span> รายการ จากทั้งหมด {data.length} รายการ
                    </div>
                  </div>

                  {/* Mobile Daily Sets */}
                  <div className="md:hidden space-y-6">
                    {currentDates.map((dateStr) => (
                      <div key={dateStr} className="space-y-3">
                        <div className="flex items-center gap-2 px-1">
                          <div className="h-px flex-1 bg-slate-200"></div>
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{toThaiDateOnly(dateStr)}</span>
                          <div className="h-px flex-1 bg-slate-200"></div>
                        </div>
                        
                        {groupedData[dateStr].sort((a, b) => {
                          const timeAStr = a["ประทับเวลา"] || a["วันที่"] || "";
                          const timeBStr = b["ประทับเวลา"] || b["วันที่"] || "";
                          
                          const parseEntry = (ts: string) => {
                            const [dp, tp] = ts.split(', ');
                            const [d, m, y] = dp.split('/').map(Number);
                            const [hh, mm] = (tp || "00:00").split(':').map(Number);
                            return new Date(y, m - 1, d, hh, mm).getTime();
                          };
                          
                          return parseEntry(timeAStr) - parseEntry(timeBStr);
                        }).map((row, rowIndex) => (
                          <div key={rowIndex} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-3 relative overflow-hidden group">
                            <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                            {columns.map((col, colIndex) => {
                              let value = row[col];
                              const isImportant = colIndex === 0 || colIndex === 1;
                              const isStatus = String(value).includes('ปกติ') || String(col).toLowerCase().includes('status');
                              const isWarning = String(value).includes('ผิดปกติ');

                              if (col === "ประทับเวลา" || col === "วันที่") {
                                value = toThaiTimeOnly(value);
                              }

                              return (
                                <div key={colIndex} className="flex justify-between items-start gap-4 text-sm">
                                  <span className="text-slate-500 whitespace-nowrap">{col}</span>
                                  <div className={`text-right ${isImportant ? 'font-semibold text-slate-800' : 'text-slate-700'}`}>
                                    {isStatus ? (
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold ${isWarning ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                        {value}
                                      </span>
                                    ) : (
                                      value
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    ))}

                    {/* Mobile Pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-sm mt-4">
                        <button
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                          className="p-2 text-slate-600 disabled:opacity-30"
                        >
                          <ArrowLeft size={20} />
                        </button>
                        <span className="text-sm font-medium text-slate-600">
                          หน้า {currentPage} / {totalPages}
                        </span>
                        <button
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={currentPage === totalPages}
                          className="p-2 text-slate-600 disabled:opacity-30"
                        >
                          <ChevronRight size={20} />
                        </button>
                      </div>
                    )}

                    <div className="text-center text-sm text-slate-400 py-4 italic">
                      สิ้นสุดรายการที่เลือก ({filteredData.length} รายการ)
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          <Footer />
        </div>
      </main>

      {/* Abnormal Records Modal */}
      {showAbnormalModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-4xl max-h-[85vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-red-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center text-red-600">
                  <AlertCircle size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">รายการความผิดปกติที่พบ</h3>
                  <p className="text-xs text-red-600 font-medium">ข้อมูลจากการกรองปัจจุบัน</p>
                </div>
              </div>
              <button 
                onClick={() => setShowAbnormalModal(false)}
                className="p-2 hover:bg-white rounded-full text-slate-400 hover:text-slate-600 transition-colors shadow-sm"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              {abnormalRecords.length > 0 ? (
                <div className="space-y-4">
                  {abnormalRecords.map((row, idx) => (
                    <div key={idx} className="bg-red-50/30 border border-red-100 rounded-2xl p-5 relative overflow-hidden group hover:border-red-200 transition-colors">
                      <div className="absolute top-0 left-0 w-1 h-full bg-red-400"></div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <Clock size={16} className="text-slate-400" />
                            <span className="text-slate-500">วัน/เวลา:</span>
                            <span className="font-bold text-slate-700">{toThaiDate(row["ประทับเวลา"] || row["วันที่"])}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <MapPin size={16} className="text-slate-400" />
                            <span className="text-slate-500">จุดตรวจ:</span>
                            <span className="font-semibold text-slate-700">{row["จุดตรวจ"]}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <ShieldAlert size={16} className="text-slate-400" />
                            <span className="text-slate-500">สถานะ:</span>
                            <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-md text-xs font-bold">{row["เหตุการณ์"] || row["สถานะ"]}</span>
                          </div>
                        </div>
                        <div className="bg-white/60 rounded-xl p-3 border border-red-50">
                          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                            <FileText size={12} /> บันทึก/หมายเหตุ
                          </p>
                          <p className="text-sm text-slate-700 italic">
                            {row["บันทึกการตรวจของยาม"] || row["หมายเหตุ"] || "ไม่มีการระบุรายละเอียดเพิ่มเติม"}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4 text-slate-300">
                    <ShieldCheck size={32} />
                  </div>
                  <h4 className="text-lg font-bold text-slate-700">ไม่พบความผิดปกติ</h4>
                  <p className="text-slate-500 max-w-xs mx-auto">ยินดีด้วย! ในช่วงเวลาที่คุณเลือกยังไม่พบรายงานความผิดปกติใดๆ</p>
                </div>
              )}
            </div>
            
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
              <button 
                onClick={() => setShowAbnormalModal(false)}
                className="px-6 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
