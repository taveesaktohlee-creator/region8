import React, { useState, useEffect, useMemo } from 'react';
import {
    Database,
    Loader2,
    TrendingUp,
    RefreshCw,
    Filter,
    Building2,
    MapPin,
    Search,
    LayoutDashboard,
    FileText,
    TableProperties,
    AlertCircle,
    PlayCircle,
    ArrowLeft,
    ChevronRight,
    Printer
} from 'lucide-react';
import pdfMake from 'pdfmake/build/pdfmake';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import Header from '../Header';
import LeftSide from '../LeftSide';
import Footer from '../Footer';
import sarabunFontUrl from '../assets/fonts/THSarabunNew.ttf?url';
import sarabunBoldFontUrl from '../assets/fonts/THSarabunNew-Bold.ttf?url';

// --- Types & Interfaces ---
interface DataRow extends Record<string, any> { }

interface ProcessedData extends DataRow {
    _province: string;
    _coop: string;
    _project: string;
    _month: string;
    _visitDate: string;
    _visitRound: string;
    _provKey: string;
    _coopKey: string;
    _projectKey: string;
    _dateKey: string;
    _visitDateKey: string;
    _visitRoundKey: string;
}

interface TopicGroup {
    id: number;
    title: string;
    keys: string[];
}

// URL ของ API ที่ใช้งานจริง
const DEFAULT_API_URL = "https://script.google.com/macros/s/AKfycbwiK32Dwn80oGfbG4yElZQmKW0IwblvPO85yCW_1ex7LfcCzwd0FtgWMfG45aSqUd3H/exec";

const normalizeVisitRound = (value: any) => {
    const raw = String(value || '').trim();
    if (!raw || raw === '-') return "ไม่ระบุ";
    const numberMatch = raw.match(/[12]/);
    if (numberMatch) return `ครั้งที่ ${numberMatch[0]}`;
    return raw.replace(/\s+/g, ' ');
};

const formatVisitDate = (value: any) => {
    const raw = String(value || '').trim();
    if (!raw || raw === '-') return "-";
    return raw.split(/[,\sT]+/)[0] || raw;
};

let pdfFontReady: Promise<void> | null = null;

const fileToBase64 = async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error('ไม่สามารถโหลดฟอนต์สำหรับ PDF ได้');
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
};

const ensurePdfThaiFont = async () => {
    if (!pdfFontReady) {
        pdfFontReady = Promise.all([
            fileToBase64(sarabunFontUrl),
            fileToBase64(sarabunBoldFontUrl),
        ]).then(([regular, bold]) => {
            const pdf = pdfMake as any;
            pdf.vfs = {
                ...(pdf.vfs || {}),
                'THSarabunNew.ttf': regular,
                'THSarabunNew-Bold.ttf': bold,
            };
            pdf.fonts = {
                ...(pdf.fonts || {}),
                THSarabunNew: {
                    normal: 'THSarabunNew.ttf',
                    bold: 'THSarabunNew-Bold.ttf',
                    italics: 'THSarabunNew.ttf',
                    bolditalics: 'THSarabunNew-Bold.ttf',
                },
            };
        }).catch((error) => {
            pdfFontReady = null;
            throw error;
        });
    }
    return pdfFontReady;
};

const isFilled = (value: any) => value !== "" && value !== undefined && value !== null && String(value).trim() !== "" && String(value).trim() !== "-";

const buildProgramMonitoringPdf = (row: ProcessedData, evaluationKeys: string[], index: number): TDocumentDefinitions => {
    const keys = Object.keys(row);
    const findKey = (matcher: (key: string) => boolean) => keys.find(matcher);
    const getVal = (key: string | undefined) => key ? row[key] : "";
    const textVal = (key: string | undefined) => isFilled(getVal(key)) ? String(getVal(key)) : "-";
    const line = (label: string, value: any): Content => ({
        columns: [
            { text: label, width: 165, bold: true },
            { text: isFilled(value) ? String(value) : "-", width: '*' },
        ],
        columnGap: 8,
        margin: [0, 2, 0, 2],
    });

    const kCoopColumn = findKey(k => k.includes('คอลัมน์ 4') || k.toLowerCase().includes('column 4'));
    const kCoop = findKey(k => k.includes('1. ชื่อสหกรณ์'));
    const kOffice = findKey(k => k.includes('สำนักงานตรวจบัญชี'));
    const kVisit = findKey(k => k.includes('กำกับติดตามครั้งที่'));
    const kDate = findKey(k => k.includes('วันที่เข้า'));
    const kProject = findKey(k => k.includes('สหกรณ์เป้าหมาย'));
    const kUser = evaluationKeys.find(k => k.includes('จำนวนผู้ใช้งาน'));
    const kPc = evaluationKeys.find(k => k.includes('คอมพิวเตอร์ PC'));
    const kNb = evaluationKeys.find(k => k.includes('Notbook') || k.includes('Notebook'));
    const kNetwork = evaluationKeys.find(k => k.includes('Network') || k.includes('เครือข่าย'));
    const kRecord = evaluationKeys.find(k => k.startsWith('4.') && k.includes('การบันทึกข้อมูล'));

    const systems = [
        { id: '1', name: 'ระบบบัญชีแยกประเภท' },
        { id: '2', name: 'ระบบสมาชิกและหุ้น' },
        { id: '3', name: 'ระบบเงินให้กู้' },
        { id: '4', name: 'ระบบเงินรับฝาก' },
        { id: '5', name: 'ระบบสินค้า' },
    ];
    const perms = [
        { id: '5.1', name: 'ระบบสมาชิกและหุ้น', search: 'สมาชิกและหุ้น' },
        { id: '5.2', name: 'ระบบเงินให้กู้', search: 'เงินให้กู้' },
        { id: '5.3', name: 'ระบบเงินรับฝาก', search: 'เงินรับฝาก' },
        { id: '5.4', name: 'ระบบสินค้า', search: 'สินค้า' },
        { id: '5.5', name: 'ระบบบัญชีแยกประเภท', search: 'บัญชีแยกประเภท' },
        { id: '5.6', name: 'ระบบออมทรัพย์', search: 'ออมทรัพย์' },
    ];

    const usedKeys = new Set<string>();
    [kCoopColumn, kOffice, kVisit, kDate, kCoop, kProject, kUser, kPc, kNb, kNetwork, kRecord].forEach(key => key && usedKeys.add(key));

    const content: Content[] = [
        { text: `#${index + 1}`, color: '#64748b', fontSize: 12, margin: [0, 0, 0, 6] },
        { text: 'รายงานผลการกำกับติดตามการใช้งานโปรแกรมและการนำส่งข้อมูล', style: 'title' },
        { text: `${textVal(kOffice) || row._province} ${textVal(kVisit) !== '-' ? textVal(kVisit) : row._visitRound}`, style: 'subtitle' },
        { text: `วันที่เข้ากำกับติดตาม: ${textVal(kDate) !== '-' ? textVal(kDate) : row._visitDate}`, alignment: 'right', bold: true, margin: [0, 8, 0, 12] },
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: '#cbd5e1' }], margin: [0, 0, 0, 14] },
        { text: '1. ข้อมูลสหกรณ์', style: 'sectionHeader' },
        line('ชื่อสหกรณ์', getVal(kCoopColumn) || getVal(kCoop) || row._coop),
        line('สหกรณ์เป้าหมายตามโครงการ', getVal(kProject) || row._project),
        { text: '2. ผู้ใช้งานโปรแกรมระบบบัญชี', style: 'sectionHeader' },
        line('2.1 จำนวนผู้ใช้งานโปรแกรม', isFilled(getVal(kUser)) ? `${getVal(kUser)} คน` : '-'),
        line('2.2 คอมพิวเตอร์ PC', getVal(kPc)),
        line('คอมพิวเตอร์ Notebook', getVal(kNb)),
        line('2.3 การใช้งานผ่าน Network', getVal(kNetwork)),
    ];

    const systemRows = systems.flatMap((sys) => {
        const statusKey = evaluationKeys.find(k => k.includes('สถานะใช้งาน') && k.includes(sys.name));
        const dateKey = evaluationKeys.find(k => k.includes('การบันทึกงานถึงวันที่') && k.includes(sys.name));
        const versionKey = evaluationKeys.find(k => k.includes('เวอร์ชั่น') && k.includes(sys.name));
        [statusKey, dateKey, versionKey].forEach(key => key && usedKeys.add(key));
        if (!isFilled(getVal(statusKey)) && !isFilled(getVal(dateKey)) && !isFilled(getVal(versionKey))) return [];
        return [[
            { text: `${sys.id}. ${sys.name}`, bold: true },
            textVal(statusKey),
            textVal(dateKey),
            textVal(versionKey),
        ]];
    });

    if (systemRows.length > 0) {
        content.push(
            { text: '3. โปรแกรมระบบบัญชีที่ใช้', style: 'sectionHeader' },
            {
                table: {
                    widths: [130, '*', '*', '*'],
                    body: [
                        [
                            { text: 'ระบบ', style: 'tableHeader' },
                            { text: 'สถานะ', style: 'tableHeader' },
                            { text: 'บันทึกงานถึงวันที่', style: 'tableHeader' },
                            { text: 'เวอร์ชั่น', style: 'tableHeader' },
                        ],
                        ...systemRows,
                    ],
                },
                layout: 'lightHorizontalLines',
                margin: [0, 2, 0, 8],
            }
        );
    }

    if (isFilled(getVal(kRecord))) {
        content.push({ text: '4. การบันทึกข้อมูลในโปรแกรมระบบบัญชี', style: 'sectionHeader' }, line('', getVal(kRecord)));
    }

    const permissionLines = perms.flatMap((perm) => {
        const permKey = evaluationKeys.find(k => k.includes('กำหนดสิทธิ์') && k.includes(perm.search));
        if (permKey) usedKeys.add(permKey);
        if (!isFilled(getVal(permKey))) return [];
        return [line(`${perm.id} ${perm.name}`, getVal(permKey))];
    });
    if (permissionLines.length > 0) {
        content.push({ text: '5. การกำหนดสิทธิ์การใช้งานโปรแกรมระบบบัญชี', style: 'sectionHeader' }, ...permissionLines);
    }

    evaluationKeys
        .filter(k => !usedKeys.has(k) && isFilled(getVal(k)))
        .forEach((key) => {
            content.push({ text: key, style: 'sectionHeader' }, { text: String(getVal(key)), color: '#1d4ed8', margin: [18, 0, 0, 6] });
        });

    return {
        pageSize: 'A4',
        pageMargins: [40, 36, 40, 40],
        defaultStyle: { font: 'THSarabunNew', fontSize: 15, lineHeight: 1.08, color: '#111827' },
        styles: {
            title: { fontSize: 20, bold: true, alignment: 'center', margin: [0, 0, 0, 2] },
            subtitle: { fontSize: 17, alignment: 'center', margin: [0, 0, 0, 8] },
            sectionHeader: { fontSize: 16, bold: true, margin: [0, 8, 0, 3] },
            tableHeader: { bold: true, fillColor: '#eaf2ff', color: '#1e3a8a' },
        },
        content,
        footer: (currentPage, pageCount) => ({
            text: `หน้า ${currentPage} / ${pageCount}`,
            alignment: 'right',
            margin: [0, 0, 40, 0],
            font: 'THSarabunNew',
            fontSize: 12,
            color: '#64748b',
        }),
    };
};

// ข้อมูลจำลองอิงตามโครงสร้างจริง
const MOCK_DATA: DataRow[] = [
    {
        "ประทับเวลา": "2026-03-11 15:16:08",
        "สำนักงานตรวจบัญชีสหกรณ์": "สำนักงานตรวจบัญชีสหกรณ์สุราษฎร์ธานี",
        "วันที่เข้ากำกับติดตาม": "11/3/2569",
        "คอลัมน์ 4": "สหกรณ์เครดิตยูเนี่ยนไชยราษฎร์ จำกัด",
        "1.1 กำกับติดตามครั้งที่": "ครั้งที่ 1",
        "สหกรณ์เป้าหมาย ตามโครงการ": "(1113) ผลักดันให้สหกรณ์ใช้งาน Smart4M เพื่อการสอบบัญชีระยะไกล",
        "2. จำนวนผู้ใช้งานโปรแกรมระบบบัญชี (คน)": "2",
        "จำนวนคอมพิวเตอร์ที่ใช้งานโปรแกรม (เครื่อง) [คอมพิวเตอร์ PC]": "2 เครื่อง",
        "การใช้งานโปรแกรมผ่านระบบ (Network)": "ไม่ใช้งาน",
        "สถานะใช้งาน(CAD_SOFT) 1. ระบบบัญชีแยกประเภท": "ปรับเปลี่ยน",
        "เวอร์ชั่นที่ใช้งาน (1. ระบบบัญชีแยกประเภท)": "2.3, Patch 3",
        "การบันทึกงานถึงวันที่ (1. ระบบบัญชีแยกประเภท)": "11/3/2569",
        "สถานะใช้งาน(CAD_SOFT) 2. ระบบสมาชิกและหุ้น": "ปรับเปลี่ยน",
        "เวอร์ชั่นที่ใช้งาน (2. ระบบสมาชิกและหุ้น)": "1.9",
        "การบันทึกงานถึงวันที่ (2. ระบบสมาชิกและหุ้น)": "11/3/2569",
        "4. การบันทึกข้อมูลในโปรแกรมระบบบัญชี": "บันทึกเป็นปัจจุบันทุกวันทำการ",
        "5. กำหนดสิทธิ์การใช้งานโปรแกรม [ระบบบัญชีแยกประเภท]": "มีการกำหนดสิทธิ์แต่ผู้ใช้งานมีสิทธิยกเลิกแก้ไขได้",
        "6. การสำรองข้อมูลและการเก็บรักษาข้อมูล": "เก็บรักษาโดยเจ้าหน้าที่ผู้ปฏิบัติงาน, เก็บรักษาภายนอกสหกรณ์",
        "7. เครื่องสำรองไฟ": "มี/ใช้งานได้",
        "8. การจัดทำทะเบียนคุมการเข้าถึงแฟ้มข้อมูล/รหัสผู้ใช้งานโปรแกรม": "มีการจัดทำทะเบียนคุมการเข้าถึงข้อมูลชุดสำรอง",
        "11. เรื่องที่แนะนำให้เจ้าหน้าที่สหกรณ์/IT Provider ทราบ": "ควรสำรองข้อมูลทุกวัน และแยกเก็บแฟ้มสำรองไว้ต่างหากเพื่อความปลอดภัย",
        "ชื่อ-นามสกุล เจ้าหน้าที่สหกรณ์ (ผู้ให้ข้อมูล)": "นางสาวอรชร ไทรเทพยิ้ม",
        "ชื่อ-นามสกุล เจ้าหน้าที่สำนักงานตรวจบัญชี": "นายทวีศักดิ์ โต๊ะหลี"
    },
    {
        "ประทับเวลา": "2026-03-15 10:20:00",
        "สำนักงานตรวจบัญชีสหกรณ์": "สำนักงานตรวจบัญชีสหกรณ์สุราษฎร์ธานี",
        "วันที่เข้ากำกับติดตาม": "15/3/2569",
        "คอลัมน์ 4": "สหกรณ์การเกษตรสมุย จำกัด",
        "1.1 กำกับติดตามครั้งที่": "ครั้งที่ 1",
        "สหกรณ์เป้าหมาย ตามโครงการ": "(1114) ส่งเสริมการใช้โปรแกรมบัญชีสหกรณ์ครบวงจร",
        "2. จำนวนผู้ใช้งานโปรแกรมระบบบัญชี (คน)": "4",
        "จำนวนคอมพิวเตอร์ที่ใช้งานโปรแกรม (เครื่อง) [คอมพิวเตอร์ PC]": "3 เครื่อง",
        "การใช้งานโปรแกรมผ่านระบบ (Network)": "ใช้งานระบบ LAN",
        "สถานะใช้งาน(CAD_SOFT) 1. ระบบบัญชีแยกประเภท": "ใช้งานปกติ",
        "เวอร์ชั่นที่ใช้งาน (1. ระบบบัญชีแยกประเภท)": "2.3, Patch 4",
        "การบันทึกงานถึงวันที่ (1. ระบบบัญชีแยกประเภท)": "15/3/2569",
        "สถานะใช้งาน(CAD_SOFT) 2. ระบบสมาชิกและหุ้น": "ไม่ได้ใช้งาน",
        "4. การบันทึกข้อมูลในโปรแกรมระบบบัญชี": "บันทึกข้อมูลล่าช้า 1-3 วัน",
        "5. กำหนดสิทธิ์การใช้งานโปรแกรม [ระบบบัญชีแยกประเภท]": "กำหนดสิทธิ์ถูกต้องและรัดกุม",
        "11. เรื่องที่แนะนำให้เจ้าหน้าที่สหกรณ์/IT Provider ทราบ": "",
        "ชื่อ-นามสกุล เจ้าหน้าที่สหกรณ์ (ผู้ให้ข้อมูล)": "นายสมชาย ใจดี",
        "ชื่อ-นามสกุล เจ้าหน้าที่สำนักงานตรวจบัญชี": "นางสาวมาลี รักงาน"
    }
];

// --- Component สำหรับวาดรูปแบบรายงานเอกสาร PDF ---
interface PdfReportCardProps {
    row: ProcessedData;
    evaluationKeys: string[];
    index: number;
    onPrintPdf: (row: ProcessedData, index: number) => void;
}

const PdfReportCard: React.FC<PdfReportCardProps> = ({ row, evaluationKeys, index, onPrintPdf }) => {
    const hasData = (key: string | undefined): boolean => {
        if (!key) return false;
        const val = row[key];
        return val !== "" && val !== undefined && val !== null && String(val).trim() !== "" && String(val).trim() !== "-";
    };
    const getVal = (key: string | undefined): any => key ? row[key] : "";

    const usedKeys = new Set<string>();
    const markUsed = (key: string | undefined) => { if (key) usedKeys.add(key); };

    const k_coop_col4 = Object.keys(row).find(k => k.includes('คอลัมน์ 4') || k.toLowerCase().includes('column 4'));
    if (k_coop_col4) markUsed(k_coop_col4);

    const k_office = Object.keys(row).find(k => k.includes('สำนักงานตรวจบัญชี')); markUsed(k_office);
    const k_visit = Object.keys(row).find(k => k.includes('กำกับติดตามครั้งที่')); markUsed(k_visit);
    const k_date = Object.keys(row).find(k => k.includes('วันที่เข้า')); markUsed(k_date);

    const k_coop = Object.keys(row).find(k => k.includes('1. ชื่อสหกรณ์')); markUsed(k_coop);
    const k_proj = Object.keys(row).find(k => k.includes('สหกรณ์เป้าหมาย')); markUsed(k_proj);

    const k2_user = evaluationKeys.find(k => k.includes('จำนวนผู้ใช้งาน')); markUsed(k2_user);
    const k2_pc = evaluationKeys.find(k => k.includes('คอมพิวเตอร์ PC')); markUsed(k2_pc);
    const k2_nb = evaluationKeys.find(k => k.includes('Notbook') || k.includes('Notebook')); markUsed(k2_nb);
    const k2_net = evaluationKeys.find(k => k.includes('Network') || k.includes('เครือข่าย')); markUsed(k2_net);

    const systems = [
        { id: '1', name: 'ระบบบัญชีแยกประเภท' },
        { id: '2', name: 'ระบบสมาชิกและหุ้น' },
        { id: '3', name: 'ระบบเงินให้กู้' },
        { id: '4', name: 'ระบบเงินรับฝาก' },
        { id: '5', name: 'ระบบสินค้า' },
    ];

    const perms = [
        { id: '5.1', name: 'ระบบสมาชิกและหุ้น', search: 'สมาชิกและหุ้น' },
        { id: '5.2', name: 'ระบบเงินให้กู้', search: 'เงินให้กู้' },
        { id: '5.3', name: 'ระบบเงินรับฝาก', search: 'เงินรับฝาก' },
        { id: '5.4', name: 'ระบบสินค้า', search: 'สินค้า' },
        { id: '5.5', name: 'ระบบบัญชีแยกประเภท', search: 'บัญชีแยกประเภท' },
        { id: '5.6', name: 'ระบบออมทรัพย์', search: 'ออมทรัพย์' }
    ];

    const k4_record = evaluationKeys.find(k => k.startsWith('4.') && k.includes('การบันทึกข้อมูล')); markUsed(k4_record);

    const hasAnySystem = systems.some(sys => {
        const k_stat = evaluationKeys.find(k => k.includes('สถานะใช้งาน') && k.includes(sys.name));
        const k_date = evaluationKeys.find(k => k.includes('การบันทึกงานถึงวันที่') && k.includes(sys.name));
        const k_ver = evaluationKeys.find(k => k.includes('เวอร์ชั่น') && k.includes(sys.name));
        return hasData(k_stat) || hasData(k_date) || hasData(k_ver);
    });

    const hasAnyPerm = perms.some(perm => {
        const k_perm = evaluationKeys.find(k => k.includes('กำหนดสิทธิ์') && k.includes(perm.search));
        return hasData(k_perm);
    });

    return (
        <div className="bg-white rounded-lg shadow-md border border-gray-300 mb-8 max-w-4xl mx-auto overflow-hidden relative">
            <div className="absolute top-0 left-0 w-full h-2 bg-blue-800"></div>
            <div className="absolute top-4 left-4 bg-gray-100 text-gray-500 px-3 py-1 rounded text-xs font-mono">#{index + 1}</div>

            <div className="p-8 md:p-14 text-gray-900 leading-relaxed text-[15px] md:text-base">
                <div className="text-center font-bold text-lg md:text-xl mb-6 mt-4 leading-tight">
                    รายงานผลการกำกับติดตามการใช้งานโปรแกรมและการนำส่งข้อมูล<br />
                    <span className="font-normal mt-1 block">{getVal(k_office) || row._province} {getVal(k_visit) ? ` ${getVal(k_visit)}` : ''}</span>
                </div>
                <div className="text-right font-medium mb-8 border-b border-gray-200 pb-4">
                    วันที่เข้ากำกับติดตาม: {getVal(k_date) || row._dateKey || row._month}
                </div>

                <div className="space-y-6">
                    <div>
                        <span className="font-bold">1. ชื่อสหกรณ์</span> <span className="text-blue-800 ml-2">{k_coop_col4 && hasData(k_coop_col4) ? getVal(k_coop_col4) : (getVal(k_coop) || row._coop)}</span>
                        {hasData(k_proj) && (
                            <span className="inline-block mt-1 sm:mt-0"><span className="font-bold ml-0 sm:ml-6">สหกรณ์เป้าหมายตามโครงการ</span> <span className="text-blue-800 ml-2">{row._project}</span></span>
                        )}
                    </div>

                    {(hasData(k2_user) || hasData(k2_pc) || hasData(k2_nb) || hasData(k2_net)) && (
                        <div>
                            <div className="font-bold mb-1">2. ผู้ใช้งานโปรแกรมระบบบัญชี</div>
                            <div className="ml-6 space-y-1.5">
                                {hasData(k2_user) && <div><span className="font-medium">2.1 จำนวนผู้ใช้งานโปรแกรม</span> <span className="text-blue-800 ml-2 font-medium">{getVal(k2_user)}</span> คน</div>}
                                {(hasData(k2_pc) || hasData(k2_nb)) && (
                                    <div className="flex flex-wrap gap-x-6 gap-y-1.5">
                                        {hasData(k2_pc) && <div><span className="font-medium">2.2 คอมพิวเตอร์(PC)ใช้งานโปรแกรม</span> <span className="text-blue-800 ml-2 font-medium">{getVal(k2_pc)}</span></div>}
                                        {hasData(k2_nb) && <div><span className="font-medium">คอมพิวเตอร์โน้ตบุ๊กใช้งานโปรแกรม</span> <span className="text-blue-800 ml-2 font-medium">{getVal(k2_nb)}</span></div>}
                                    </div>
                                )}
                                {hasData(k2_net) && <div><span className="font-medium">2.3 การใช้งานโปรแกรมผ่านระบบ (Network)</span> <span className="text-blue-800 ml-2 font-medium">{getVal(k2_net)}</span></div>}
                            </div>
                        </div>
                    )}

                    {hasAnySystem && (
                        <div>
                            <div className="font-bold mb-1">3. โปรแกรมระบบบัญชีที่ใช้</div>
                            <div className="ml-6 space-y-2">
                                {systems.map(sys => {
                                    const k_stat = evaluationKeys.find(k => k.includes('สถานะใช้งาน') && k.includes(sys.name)); markUsed(k_stat);
                                    const k_date = evaluationKeys.find(k => k.includes('การบันทึกงานถึงวันที่') && k.includes(sys.name)); markUsed(k_date);
                                    const k_ver = evaluationKeys.find(k => k.includes('เวอร์ชั่น') && k.includes(sys.name)); markUsed(k_ver);

                                    if (!hasData(k_stat) && !hasData(k_date) && !hasData(k_ver)) return null;

                                    return (
                                        <div key={sys.id} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 pb-1">
                                            <div className="w-48 font-medium whitespace-nowrap">{sys.id}. {sys.name}</div>
                                            <div className="flex flex-wrap gap-x-6 gap-y-1">
                                                {hasData(k_stat) && <div>สถานะ <span className="text-blue-800 font-medium ml-1">{getVal(k_stat)}</span></div>}
                                                {hasData(k_date) && <div>การบันทึกงานถึงวันที่ <span className="text-blue-800 font-medium ml-1">{getVal(k_date)}</span></div>}
                                                {hasData(k_ver) && <div>เวอร์ชั่น <span className="text-blue-800 font-medium ml-1">{getVal(k_ver)}</span></div>}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {hasData(k4_record) && (
                        <div>
                            <span className="font-bold">4. การบันทึกข้อมูลในโปรแกรมระบบบัญชี</span> <span className="text-blue-800 ml-2">{getVal(k4_record)}</span>
                        </div>
                    )}

                    {hasAnyPerm && (
                        <div>
                            <div className="font-bold mb-1">5. การกำหนดสิทธิ์การใช้งานโปรแกรมระบบบัญชี</div>
                            <div className="ml-6 space-y-1.5">
                                {perms.map(perm => {
                                    const k_perm = evaluationKeys.find(k => k.includes('กำหนดสิทธิ์') && k.includes(perm.search)); markUsed(k_perm);
                                    if (!hasData(k_perm)) return null;
                                    return (
                                        <div key={perm.id} className="flex flex-col sm:flex-row gap-1 sm:gap-2 items-start">
                                            <span className="font-medium whitespace-nowrap w-48">{perm.id} {perm.name}</span>
                                            <span className="text-blue-800 break-words">{getVal(k_perm)}</span>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {evaluationKeys.filter(k => !usedKeys.has(k) && hasData(k)).map((key) => {
                        return (
                            <div key={key} className="mb-2 break-inside-avoid">
                                <div className="font-bold">{key}</div>
                                <div className="ml-6 text-blue-800 mt-1 whitespace-pre-wrap leading-relaxed">{getVal(key)}</div>
                            </div>
                        )
                    })}
                </div>
            </div>
            <div className="border-t border-slate-100 bg-slate-50 px-6 py-4 flex justify-end">
                <button
                    type="button"
                    onClick={() => onPrintPdf(row, index)}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-500/20 transition hover:bg-blue-700"
                >
                    <Printer className="h-4 w-4" />
                    พิมพ์รายงาน PDF
                </button>
            </div>
        </div>
    );
};

// --- Main Page Component ---
export default function ProgramMonitoring() {
    // --- Shared Layout States ---
    const [userData, setUserData] = useState<any>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // --- Dashboard States ---
    const [apiUrl, setApiUrl] = useState<string>(DEFAULT_API_URL);
    const [isApiSet, setIsApiSet] = useState<boolean>(true);
    const [data, setData] = useState<ProcessedData[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [isUsingMock, setIsUsingMock] = useState<boolean>(false);

    const [activeView, setActiveView] = useState<'summary' | 'details'>('summary');
    const [selectedProvince, setSelectedProvince] = useState<string>("ทั้งหมด");
    const [selectedProject, setSelectedProject] = useState<string>("ทั้งหมด");
    const [selectedMonth, setSelectedMonth] = useState<string>("ทั้งหมด");
    const [selectedVisitRound, setSelectedVisitRound] = useState<string>("ทั้งหมด");
    const [coopSearch, setCoopSearch] = useState<string>("");

    const thaiMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

    // --- Effects for Layout ---
    useEffect(() => {
        const savedUser = localStorage.getItem('user');
        if (savedUser && savedUser !== 'undefined') {
            try {
                setUserData(JSON.parse(savedUser));
            } catch (e) {
                console.error("Failed to parse user data from localStorage", e);
                localStorage.removeItem('user');
            }
        }

        const handleResize = () => {
            if (window.innerWidth < 1024) {
                setIsSidebarOpen(false);
            } else {
                setIsSidebarOpen(true);
            }
        };

        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const handleLogout = () => {
        localStorage.removeItem('user');
        window.location.href = '/';
    };

    const handleRefresh = () => {
        setIsRefreshing(true);
        fetchData();
        setTimeout(() => {
            setIsRefreshing(false);
        }, 1000);
    };

    // --- Dashboard Logic ---
    const processData = (rawData: DataRow[]): ProcessedData[] => {
        if (!rawData || rawData.length === 0) return [];

        const keys = Object.keys(rawData[0]);
        const findKey = (keywords: string[]): string => {
            for (const kw of keywords) {
                const exact = keys.find(k => k.trim().toLowerCase() === kw.toLowerCase());
                if (exact) return exact;
                const contains = keys.find(k => String(k).toLowerCase().includes(kw.toLowerCase()));
                if (contains) return contains;
            }
            return "";
        };

        const provKey = findKey(['สำนักงานตรวจบัญชีสหกรณ์', 'จังหวัด']) || keys[1];
        const coopKey = findKey(['คอลัมน์ 4', 'column 4', '1. ชื่อสหกรณ์', 'ชื่อสหกรณ์', 'สหกรณ์']) || keys[3];
        const projectKey = findKey(['สหกรณ์เป้าหมาย', 'โครงการ']) || keys[5];
        const dateKey = findKey(['ประทับเวลา', 'Timestamp', 'วันที่เข้า']) || keys[0];
        const visitDateKey = findKey(['วันที่เข้ากำกับติดตาม']);
        const visitRoundKey = findKey(['1.1 กำกับติดตามครั้งที่', 'กำกับติดตามครั้งที่', 'ครั้งที่']);

        return rawData.map(item => {
            const prov = item[provKey] || "ไม่ระบุ";
            const coop = item[coopKey] || "ไม่ระบุ";
            const proj = item[projectKey] || "ไม่ระบุ";
            let cleanProv = String(prov).replace('สำนักงานตรวจบัญชีสหกรณ์', '').replace(/^จ\./, '').trim();
            if (!cleanProv) cleanProv = "ไม่ระบุ";

            let monthStr = "ไม่ระบุ";
            const visitDateVal = visitDateKey ? item[visitDateKey] : item[dateKey];
            if (visitDateVal) {
                const datePart = String(visitDateVal).split(/[ T]/)[0];
                const parts = datePart.split(/[/-]/);
                if (parts.length >= 2) {
                    const m = parseInt(parts[1], 10);
                    if (m >= 1 && m <= 12) monthStr = thaiMonths[m - 1];
                }
            }

            return {
                ...item,
                _province: cleanProv,
                _coop: String(coop).trim() || "ไม่ระบุ",
                _project: String(proj).trim() || "ไม่ระบุ",
                _month: monthStr,
                _visitDate: formatVisitDate(visitDateVal),
                _visitRound: normalizeVisitRound(visitRoundKey ? item[visitRoundKey] : ''),
                _provKey: provKey,
                _coopKey: coopKey,
                _projectKey: projectKey,
                _dateKey: dateKey,
                _visitDateKey: visitDateKey,
                _visitRoundKey: visitRoundKey
            };
        });
    };

    const loadMockData = () => {
        setError(null);
        setIsUsingMock(true);
        setData(processData(MOCK_DATA));
        setIsApiSet(true);
    };

    const fetchData = async () => {
        if (!apiUrl || !apiUrl.startsWith("http")) {
            setError("กรุณาใส่ Web App URL ที่ถูกต้อง");
            return;
        }

        let finalUrl = apiUrl;
        if (finalUrl.endsWith('/dev')) {
            finalUrl = finalUrl.replace('/dev', '/exec');
            setApiUrl(finalUrl);
        }

        setLoading(true);
        setError(null);
        setIsUsingMock(false);

        try {
            const response = await fetch(finalUrl, { method: "GET", redirect: "follow" });
            if (!response.ok) throw new Error("ไม่สามารถเชื่อมต่อกับฐานข้อมูลได้");
            const result = await response.json();
            if (result.error) throw new Error(result.error);
            if (!Array.isArray(result)) throw new Error("รูปแบบข้อมูลที่ได้รับไม่ถูกต้อง");
            setData(processData(result));
            setIsApiSet(true);
        } catch (err: any) {
            console.error(err);
            if (err.message === "Failed to fetch" || err.message.includes("NetworkError")) {
                setError("ติดปัญหาการเข้าถึง (CORS) สาเหตุหลักคือการ Deploy ยังไม่ถูกต้อง 💡 วิธีแก้: ตอนกด Deploy ใน Google Sheet ช่อง 'Who has access' (ผู้ที่มีสิทธิ์เข้าถึง) ต้องเลือกเป็น 'Anyone' (ทุกคน) เท่านั้นครับ");
            } else {
                setError(err.message || "เกิดข้อผิดพลาดไม่ทราบสาเหตุ");
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isApiSet && !isUsingMock) {
            fetchData();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isApiSet, isUsingMock]);

    const uniqueProvinces = useMemo(() => ["ทั้งหมด", ...new Set(data.map(d => d._province).filter(Boolean))], [data]);
    const uniqueProjects = useMemo(() => ["ทั้งหมด", ...new Set(data.map(d => d._project).filter(Boolean))], [data]);
    const uniqueMonths = useMemo(() => ["ทั้งหมด", ...new Set(data.map(d => d._month).filter(Boolean))], [data]);
    const visitRoundOptions = useMemo(() => {
        const rounds = new Set(data.map(d => d._visitRound).filter(Boolean));
        return ["ทั้งหมด", "ครั้งที่ 1", "ครั้งที่ 2", ...Array.from(rounds).filter(round => !["ทั้งหมด", "ครั้งที่ 1", "ครั้งที่ 2"].includes(round))];
    }, [data]);

    const filteredData = useMemo(() => {
        const normalizedSearch = coopSearch.trim().toLowerCase();
        return data.filter(d => {
            return (selectedProvince === "ทั้งหมด" || d._province === selectedProvince) &&
                (selectedProject === "ทั้งหมด" || d._project === selectedProject) &&
                (selectedMonth === "ทั้งหมด" || d._month === selectedMonth) &&
                (selectedVisitRound === "ทั้งหมด" || d._visitRound === selectedVisitRound) &&
                (!normalizedSearch || d._coop.toLowerCase().includes(normalizedSearch));
        });
    }, [data, selectedProvince, selectedProject, selectedMonth, selectedVisitRound, coopSearch]);

    const evaluationKeys = useMemo(() => {
        if (filteredData.length === 0) return [];
        const row = filteredData[0];
        const keys = Object.keys(row).filter(k =>
            !k.startsWith('_') &&
            k !== row._dateKey &&
            k !== row._provKey &&
            k !== row._coopKey &&
            k !== row._projectKey &&
            k !== row._visitDateKey &&
            k !== row._visitRoundKey &&
            k !== 'ประทับเวลา' &&
            !k.includes('กำกับติดตามครั้งที่') &&
            !k.includes('ชื่อ-นามสกุล')
        );
        keys.sort((a, b) => a.localeCompare(b, 'th', { numeric: true, sensitivity: 'base' }));
        return keys;
    }, [filteredData]);

    const topicGroups = useMemo(() => {
        if (!evaluationKeys || evaluationKeys.length === 0) return [];
        const groups: TopicGroup[] = [
            { id: 2, title: "หัวข้อที่ 2 : ผู้ใช้งานโปรแกรมระบบบัญชี", keys: [] },
            { id: 3, title: "หัวข้อที่ 3 : โปรแกรมระบบบัญชีที่ใช้", keys: [] },
            { id: 478, title: "หัวข้อที่ 4, 7, 8 : การบันทึกข้อมูล, เครื่องสำรองไฟ และการจัดทำทะเบียนคุมฯ", keys: [] },
            { id: 5, title: "หัวข้อที่ 5 : การกำหนดสิทธิ์การใช้งานโปรแกรมระบบบัญชี", keys: [] },
            { id: 6, title: "หัวข้อที่ 6 : การสำรองข้อมูลและการเก็บรักษาข้อมูล", keys: [] },
            { id: 9, title: "หัวข้อที่ 9 : ผู้รับผิดชอบนำส่งแฟ้มข้อมูลออนไลน์", keys: [] },
            { id: 10, title: "หัวข้อที่ 10 : วิธีการนำส่งข้อมูล SmartMember & SmartManage", keys: [] },
            { id: 11, title: "หัวข้อที่ 11 : เรื่องที่แนะนำให้เจ้าหน้าที่สหกรณ์/IT Provider ทราบ", keys: [] },
            { id: 99, title: "หัวข้ออื่นๆ", keys: [] }
        ];

        evaluationKeys.forEach(k => {
            if (k.includes('ผู้ใช้งานโปรแกรมระบบบัญชี') || k.includes('คอมพิวเตอร์') || k.includes('Network') || k.includes('เครือข่าย')) {
                groups.find(g => g.id === 2)?.keys.push(k);
            } else if (k.includes('สถานะใช้งาน') || k.includes('เวอร์ชั่น') || k.includes('การบันทึกงานถึงวันที่')) {
                groups.find(g => g.id === 3)?.keys.push(k);
            } else if (k.startsWith('4.') || (k.includes('การบันทึกข้อมูล') && !k.includes('กำหนดสิทธิ์')) || k.startsWith('7.') || k.includes('เครื่องสำรองไฟ') || k.startsWith('8.') || k.includes('ทะเบียนคุม')) {
                groups.find(g => g.id === 478)?.keys.push(k);
            } else if (k.startsWith('5.') || k.includes('กำหนดสิทธิ์')) {
                groups.find(g => g.id === 5)?.keys.push(k);
            } else if (k.startsWith('6.') || k.includes('สำรองข้อมูล') || k.includes('เก็บรักษา')) {
                groups.find(g => g.id === 6)?.keys.push(k);
            } else if (k.startsWith('9.') || k.includes('ผู้รับผิดชอบนำส่ง')) {
                groups.find(g => g.id === 9)?.keys.push(k);
            } else if (k.startsWith('10.') || k.includes('วิธีการนำส่ง')) {
                groups.find(g => g.id === 10)?.keys.push(k);
            } else if (k.startsWith('11.') || k.includes('เรื่องที่แนะนำ')) {
                groups.find(g => g.id === 11)?.keys.push(k);
            } else {
                groups.find(g => g.id === 99)?.keys.push(k);
            }
        });
        return groups.filter(g => g.keys.length > 0);
    }, [evaluationKeys]);

    const getSystemData = (row: ProcessedData, sysName: string) => {
        const keys = Object.keys(row);
        const statusKey = keys.find(k => k.includes('สถานะใช้งาน') && k.includes(sysName));
        const versionKey = keys.find(k => k.includes('เวอร์ชั่น') && k.includes(sysName));
        const dateKey = keys.find(k => k.includes('การบันทึกงานถึงวันที่') && k.includes(sysName));
        const status = statusKey ? row[statusKey] : '';
        const version = versionKey ? row[versionKey] : '';
        const date = dateKey ? row[dateKey] : '';
        const isEmpty = (val: any) => val === "" || val === undefined || val === null || String(val).trim() === "" || String(val).trim() === "-";
        const hasData = !isEmpty(status) || !isEmpty(version) || !isEmpty(date);
        return { hasData, status, version, date };
    };

    const handlePrintCoopPdf = async (row: ProcessedData, index: number) => {
        try {
            await ensurePdfThaiFont();
            const docDefinition = buildProgramMonitoringPdf(row, evaluationKeys, index);
            pdfMake.createPdf(docDefinition).print();
        } catch (error) {
            console.error(error);
            alert('ไม่สามารถออกรายงาน PDF ได้ กรุณาลองใหม่อีกครั้ง');
        }
    };

    // --- Render Content ---
    const renderDashboardContent = () => {
        if (!isApiSet && data.length === 0) {
            return (
                <div className="flex-1 flex items-center justify-center p-4">
                    <div className="bg-white p-8 rounded-2xl shadow-xl max-w-lg w-full border border-gray-100 animate-in fade-in zoom-in duration-300">
                        <h1 className="text-2xl font-bold text-blue-800 mb-4 flex items-center gap-2">
                            <Database className="w-8 h-8 text-blue-600" /> เชื่อมต่อฐานข้อมูล
                        </h1>
                        <p className="text-gray-600 mb-6 text-sm">กรุณานำ Web App URL ที่ได้จากการ Deploy Google Apps Script มาใส่ในช่องด้านล่าง</p>
                        <input
                            type="text"
                            className="w-full p-3 border border-gray-300 rounded-lg mb-4 focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="https://script.google.com/macros/s/.../exec"
                            value={apiUrl}
                            onChange={(e) => setApiUrl(e.target.value)}
                        />
                        <div className="flex flex-col gap-3 mt-2">
                            <button onClick={fetchData} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg flex justify-center items-center gap-2 transition">
                                {loading ? <Loader2 className="animate-spin w-5 h-5" /> : "ดึงข้อมูลจาก Google Sheet"}
                            </button>
                            <button onClick={loadMockData} className="w-full bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold py-3 px-4 rounded-lg flex justify-center items-center gap-2 transition border border-emerald-200">
                                <PlayCircle className="w-5 h-5" /> ทดลองใช้งานด้วยข้อมูลจำลอง
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return (
            <div className="w-full">
                <div className="max-w-7xl mx-auto px-6 pt-6">
                    <div className="flex items-center gap-2 text-sm md:text-base mb-4">
                        <a href="/index" className="flex items-center gap-1.5 text-blue-600 hover:text-blue-800 font-bold transition-all hover:-translate-x-1">
                            <ArrowLeft size={18} /> หน้าหลัก
                        </a>
                        <ChevronRight size={16} className="text-slate-400" />
                        <span className="text-slate-600 font-medium">รายงานการกำกับติดตามการใช้งานโปรแกรมฯ</span>
                    </div>
                </div>

                <div className="bg-blue-800 text-white shadow-md pt-8 pb-16 px-6 rounded-b-[40px] mb-[-40px]">
                    <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
                        <div>
                            <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
                                <TrendingUp className="w-10 h-10 text-blue-300" />
                                ระบบติดตามการใช้งานโปรแกรม สตท.8
                            </h1>
                            <p className="text-blue-200">รายงานผลการกำกับติดตามการใช้งานโปรแกรมและการนำส่งข้อมูล {isUsingMock && <span className="bg-amber-400 text-amber-900 text-xs px-2 py-1 rounded-full font-bold ml-2 shadow-sm inline-flex items-center gap-1"><AlertCircle className="w-3 h-3" /> โหมดจำลอง</span>}</p>
                        </div>
                        <div className="flex gap-2 items-center">
                            {isUsingMock && (
                                <button onClick={() => { setIsUsingMock(false); setIsApiSet(false); setError(null); }} className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg flex items-center gap-2 transition text-sm text-white">
                                    <Database className="w-4 h-4" /> ใส่ลิงก์ API จริง
                                </button>
                            )}
                            <button onClick={fetchData} disabled={loading} className={`${isUsingMock ? 'hidden' : 'flex'} bg-blue-700 hover:bg-blue-600 px-4 py-2 rounded-lg items-center gap-2 transition text-sm`}>
                                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                                {loading ? 'กำลังโหลด...' : 'รีเฟรชข้อมูล'}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="max-w-7xl mx-auto px-4 relative z-10 pt-4">
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-800 px-6 py-5 rounded-2xl mb-6 shadow-sm flex flex-col md:flex-row items-start gap-4 animate-in slide-in-from-top duration-300">
                            <AlertCircle className="w-8 h-8 flex-shrink-0 text-red-500 mt-1" />
                            <div className="flex-grow">
                                <h3 className="font-bold text-lg mb-1">เกิดข้อผิดพลาดในการเชื่อมต่อ</h3>
                                <p className="text-sm mb-3 text-red-700">{error}</p>
                                <div className="mt-2 flex gap-3">
                                    <button onClick={() => { setIsApiSet(false); setError(null); }} className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition">เปลี่ยน URL ใหม่</button>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="bg-white rounded-2xl shadow-lg p-6 mb-6 border border-gray-100">
                        <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                            <Filter className="w-5 h-5 text-blue-600" /> กรองข้อมูลที่ต้องการประมวลผล
                        </h2>
                        <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50/70 p-2 shadow-inner">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                {visitRoundOptions.map(round => (
                                    <button
                                        key={round}
                                        type="button"
                                        onClick={() => setSelectedVisitRound(round)}
                                        className={`rounded-xl px-4 py-3 text-sm font-bold transition-all ${
                                            selectedVisitRound === round
                                                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25'
                                                : 'bg-white text-slate-600 border border-blue-100 hover:border-blue-300 hover:text-blue-700'
                                        }`}
                                    >
                                        {round}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-600 mb-2">📍 จังหวัด (สนง.ตรวจบัญชี)</label>
                                <select className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={selectedProvince} onChange={(e) => setSelectedProvince(e.target.value)}>
                                    {uniqueProvinces.map(prov => <option key={prov} value={prov}>{prov}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-600 mb-2">🎯 สหกรณ์เป้าหมายโครงการ</label>
                                <select className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)}>
                                    {uniqueProjects.map(proj => <option key={proj} value={proj} title={proj}>{proj.length > 40 ? proj.substring(0, 40) + "..." : proj}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-600 mb-2">📅 เดือนที่รายงาน</label>
                                <select className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
                                    {uniqueMonths.map(month => <option key={month} value={month}>{month}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="mt-5">
                            <label className="block text-sm font-medium text-gray-600 mb-2">🔎 ค้นหาชื่อสหกรณ์</label>
                            <div className="relative">
                                <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-blue-500" />
                                <input
                                    type="search"
                                    value={coopSearch}
                                    onChange={(e) => setCoopSearch(e.target.value)}
                                    placeholder="พิมพ์ชื่อสหกรณ์ที่ต้องการค้นหา..."
                                    className="w-full rounded-xl border border-blue-100 bg-blue-50/50 py-3 pl-12 pr-4 text-sm font-medium text-slate-700 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col lg:flex-row gap-6 mb-8">
                        <div className="grid grid-cols-2 gap-4 flex-grow">
                            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col justify-center items-center md:items-start md:flex-row md:justify-start gap-4">
                                <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                                    <Building2 className="w-7 h-7 text-green-600" />
                                </div>
                                <div className="text-center md:text-left mt-2 md:mt-0">
                                    <div className="text-gray-500 text-sm font-medium">จำนวนสหกรณ์</div>
                                    <div className="text-3xl font-bold text-gray-800">{filteredData.length} <span className="text-base font-normal text-gray-500">แห่ง</span></div>
                                </div>
                            </div>
                            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col justify-center items-center md:items-start md:flex-row md:justify-start gap-4">
                                <div className="w-14 h-14 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                                    <MapPin className="w-7 h-7 text-orange-600" />
                                </div>
                                <div className="text-center md:text-left mt-2 md:mt-0">
                                    <div className="text-gray-500 text-sm font-medium">ครอบคลุมจังหวัด</div>
                                    <div className="text-3xl font-bold text-gray-800">{new Set(filteredData.map(d => d._province)).size} <span className="text-base font-normal text-gray-500">จังหวัด</span></div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-2 flex lg:flex-col justify-center gap-2 self-stretch min-w-[200px]">
                            <button
                                onClick={() => setActiveView('summary')}
                                className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-medium transition duration-200 ${activeView === 'summary' ? 'bg-blue-100 text-blue-800 shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}
                            >
                                <LayoutDashboard className="w-5 h-5" /> สรุปข้อมูลภาพรวม
                            </button>
                            <button
                                onClick={() => setActiveView('details')}
                                className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-medium transition duration-200 ${activeView === 'details' ? 'bg-blue-100 text-blue-800 shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}
                            >
                                <FileText className="w-5 h-5" /> รายละเอียดรายสหกรณ์
                            </button>
                        </div>
                    </div>

                    {loading ? (
                        <div className="text-center py-20 bg-white rounded-2xl shadow-sm border border-gray-100">
                            <Loader2 className="animate-spin w-12 h-12 text-blue-500 mb-4 mx-auto" />
                            <p className="text-gray-500">กำลังประมวลผลข้อมูล...</p>
                        </div>
                    ) : filteredData.length === 0 && !error ? (
                        <div className="text-center py-20 bg-white rounded-2xl shadow-sm border border-dashed border-gray-300">
                            <Search className="w-12 h-12 text-gray-300 mb-2 mx-auto" />
                            <p className="text-gray-500">ไม่พบข้อมูลที่ตรงกับเงื่อนไขที่เลือก</p>
                        </div>
                    ) : (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {activeView === 'summary' ? (
                                <div className="space-y-8">
                                    {topicGroups.map(group => {
                                        const validRows = filteredData.filter(row => {
                                            return group.keys.some(k => {
                                                const val = row[k];
                                                return val !== "" && val !== undefined && val !== null && String(val).trim() !== "" && String(val).trim() !== "-";
                                            });
                                        });

                                        if (validRows.length === 0) return null;

                                        if (group.id === 3) {
                                            const systems = ["1. ระบบบัญชีแยกประเภท", "2. ระบบสมาชิกและหุ้น", "3. ระบบเงินให้กู้", "4. ระบบเงินรับฝาก", "5. ระบบสินค้า"];
                                            return (
                                                <div key={group.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-8">
                                                    <div className="bg-blue-50 px-6 py-4 border-b border-blue-100">
                                                        <h3 className="text-lg font-bold text-blue-900 flex items-center gap-2">
                                                            <TableProperties className="w-5 h-5 text-blue-600" /> {group.title}
                                                        </h3>
                                                    </div>
                                                    <div className="overflow-x-auto">
                                                        <table className="w-full text-left text-gray-700 border-collapse table-fixed min-w-[1000px]">
                                                            <thead className="text-[11px] lg:text-xs text-gray-700 bg-blue-50/50 border-b border-blue-200">
                                                                <tr>
                                                                    <th className="px-4 py-3 font-bold sticky left-0 z-10 bg-blue-50/90 border-r border-blue-100 w-[18%] shadow-[1px_0_0_0_#bfdbfe] backdrop-blur-sm align-middle">ชื่อสหกรณ์</th>
                                                                    {systems.map(sys => (<th key={sys} className="px-2 py-3 align-top border-r border-blue-100 last:border-0 leading-relaxed text-gray-800">{sys}</th>))}
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {validRows.map((row, i) => (
                                                                    <tr key={i} className="border-b border-gray-100 hover:bg-amber-50/50 transition duration-150 even:bg-gray-50/70">
                                                                        <td className={`px-4 py-3 font-semibold text-blue-800 sticky left-0 z-10 border-r border-gray-200 shadow-[1px_0_0_0_#e5e7eb] text-xs lg:text-sm ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>{row._coop}</td>
                                                                        {systems.map(sys => {
                                                                            const { hasData, status, version, date } = getSystemData(row, sys);
                                                                            return (
                                                                                <td key={sys} className="px-2 py-3 border-r border-gray-100 last:border-0 align-top">
                                                                                    {hasData ? (
                                                                                        <div className="space-y-1 text-[11px] lg:text-[12px] leading-snug">
                                                                                            {date && (<div><span className="text-gray-500">บันทึกงานถึงวันที่ : </span><span className="font-semibold text-gray-800 break-words">{date}</span></div>)}
                                                                                            {version && (<div><span className="text-gray-500">เวอร์ชั่น : </span><span className="font-semibold text-gray-800 break-words">{version}</span></div>)}
                                                                                            {status && (<div className="pt-1"><span className={`inline-block px-1.5 py-0.5 rounded text-[10px] lg:text-[11px] font-bold border ${status.includes('ปกติ') ? 'bg-green-50 text-green-700 border-green-200' : (status.includes('ไม่ได้') || status.includes('ปัญหา') ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200')}`}>สถานะ : {status}</span></div>)}
                                                                                        </div>
                                                                                    ) : (<div className="text-center pt-2"><span className="text-gray-300 italic font-light text-xs">-</span></div>)}
                                                                                </td>
                                                                            )
                                                                        })}
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            );
                                        }

                                        return (
                                            <div key={group.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-8">
                                                <div className="bg-blue-50 px-6 py-4 border-b border-blue-100">
                                                    <h3 className="text-lg font-bold text-blue-900 flex items-center gap-2">
                                                        <TableProperties className="w-5 h-5 text-blue-600" /> {group.title}
                                                    </h3>
                                                </div>
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-sm text-left text-gray-700 border-collapse">
                                                        <thead className="text-xs text-gray-700 bg-blue-50/50 border-b border-blue-200">
                                                            <tr>
                                                                <th className="px-4 py-3 font-bold sticky left-0 z-10 bg-blue-50/90 border-r border-blue-100 min-w-[200px] shadow-[1px_0_0_0_#bfdbfe] backdrop-blur-sm align-middle">ชื่อสหกรณ์</th>
                                                                {group.id === 2 && <th className="px-4 py-3 min-w-[140px] whitespace-normal align-middle border-r border-blue-100 leading-relaxed text-center text-gray-800">วันที่เข้ากำกับติดตาม</th>}
                                                                {group.keys.map(k => (<th key={k} className="px-4 py-3 min-w-[150px] max-w-[250px] whitespace-normal align-bottom border-r border-blue-100 last:border-0 leading-relaxed text-gray-800">{k}</th>))}
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {validRows.map((row, i) => (
                                                                <tr key={i} className="border-b border-gray-100 hover:bg-amber-50/50 transition duration-150 even:bg-gray-50/70">
                                                                    <td className={`px-4 py-3 font-semibold text-blue-800 sticky left-0 z-10 border-r border-gray-200 shadow-[1px_0_0_0_#e5e7eb] ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>{row._coop}</td>
                                                                    {group.id === 2 && <td className="px-4 py-3 border-r border-gray-100 text-center font-semibold text-slate-600 whitespace-nowrap">{row._visitDate}</td>}
                                                                    {group.keys.map(k => {
                                                                        const val = row[k];
                                                                        const isEmpty = val === "" || val === undefined || val === null || String(val).trim() === "" || String(val).trim() === "-";
                                                                        return (<td key={k} className={`px-4 py-3 min-w-[150px] max-w-[250px] whitespace-normal align-top border-r border-gray-100 last:border-0 ${isEmpty ? 'text-gray-400 italic font-light' : 'text-gray-800'}`}>{isEmpty ? "-" : val}</td>);
                                                                    })}
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="space-y-8">
                                    {filteredData.map((row, index) => (
                                        <PdfReportCard key={index} row={row} evaluationKeys={evaluationKeys} index={index} onPrintPdf={handlePrintCoopPdf} />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="flex h-screen bg-[#f8fafc] font-sans text-slate-800 overflow-hidden relative selection:bg-blue-500/30">
            {/* Background Orbs */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
                <div className="absolute top-[-10%] left-[-5%] w-[40vw] h-[40vw] bg-blue-400/10 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[-5%] w-[35vw] h-[35vw] bg-purple-400/10 rounded-full blur-[120px]" />
            </div>

            <LeftSide
                userData={userData}
                isSidebarOpen={isSidebarOpen}
                setIsSidebarOpen={setIsSidebarOpen}
                handleLogout={handleLogout}
            />

            <main className="flex-1 flex flex-col h-full overflow-y-auto z-10 scroll-smooth transition-all duration-300">
                <Header
                    setIsSidebarOpen={setIsSidebarOpen}
                    handleRefresh={handleRefresh}
                    isRefreshing={isRefreshing}
                    handleLogout={handleLogout}
                />

                <div className="flex-1">
                    {renderDashboardContent()}
                </div>

                <Footer />
            </main>

            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes loading {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(300%); }
                }
                `
            }} />
        </div>
    );
}
