import { API_BASE } from '../lib/apiConfig';
import {
  dataUrlToBase64,
  formatDigitalDuration,
  formatDuration,
  formatFileSize,
  formatThaiDate,
  getDriveFileIdFromUrl,
  getDrivePreviewUrl,
  getDriveThumbnailUrl,
  getDriveWebViewUrl,
  readBlobAsDataUrl,
  resolveDriveUploadResult,
} from '../knowledge/knowledgeUtils';

export type MeetingReportSection = 'office' | 'area';
export type MeetingReportStatus = 'draft' | 'published' | 'archived';

export type MeetingReportComment = {
  comment_id: number;
  report_id: number;
  user_id: number;
  page_number: number;
  x_percent: number | string;
  y_percent: number | string;
  marker_type?: 'point' | 'circle' | 'rect';
  width_percent?: number | string;
  height_percent?: number | string;
  comment_text: string;
  status: 'open' | 'resolved';
  created_at?: string;
  Name_Surname?: string;
  position?: string;
  Division_Province?: string;
  Department?: string;
};

export type MeetingReportItem = {
  report_id?: number;
  section: MeetingReportSection;
  section_label?: string;
  title: string;
  meeting_date?: string | null;
  description: string;
  status?: MeetingReportStatus;
  pdf_url: string;
  pdf_file_id?: string;
  pdf_proxy_url?: string;
  published_at?: string | null;
  view_count?: number;
  sort_order: number;
  updated_at?: string | null;
  acknowledged?: number;
  acknowledged_at?: string | null;
  comment_count?: number;
  reader_count?: number;
  acknowledgement_count?: number;
  read_count?: number;
  comments?: MeetingReportComment[];
};

export type MeetingReportAdminData = {
  reads: MeetingReportReadRow[];
  acknowledgements: MeetingReportAckRow[];
  comments: MeetingReportAdminCommentRow[];
};

export type MeetingReportReadRow = {
  report_id: number;
  user_id: number;
  section: MeetingReportSection;
  title: string;
  meeting_date?: string | null;
  Name_Surname: string;
  position?: string;
  Division_Province?: string;
  Department?: string;
  read_count: number;
  total_active_seconds: number;
  first_read_at?: string | null;
  last_read_at?: string | null;
};

export type MeetingReportAckRow = {
  report_id: number;
  user_id: number;
  section: MeetingReportSection;
  title: string;
  meeting_date?: string | null;
  Name_Surname: string;
  position?: string;
  Division_Province?: string;
  Department?: string;
  acknowledged_at?: string | null;
};

export type MeetingReportAdminCommentRow = MeetingReportComment & {
  section: MeetingReportSection;
  title: string;
  meeting_date?: string | null;
};

export const MEETING_REPORT_PDF_MAX_BYTES = 18 * 1024 * 1024;

export const sectionLabels: Record<MeetingReportSection, string> = {
  office: 'สำนักงาน',
  area: 'สำนักงานในพื้นที่',
};

export const emptyMeetingReport: MeetingReportItem = {
  section: 'office',
  title: '',
  meeting_date: '',
  description: '',
  status: 'published',
  pdf_url: '',
  pdf_file_id: '',
  sort_order: 0,
};

export async function readApiResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const message = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return {
      error: message
        ? message.slice(0, 240)
        : `API ตอบกลับไม่ถูกต้อง (${response.status})`,
    };
  }
}

export function getStoredUser() {
  try {
    const savedUser = localStorage.getItem('user');
    return savedUser && savedUser !== 'undefined' ? JSON.parse(savedUser) : null;
  } catch {
    return null;
  }
}

export function getMeetingReportPdfPreviewUrl(report?: Pick<MeetingReportItem, 'pdf_file_id' | 'pdf_url' | 'pdf_proxy_url'> | null) {
  const fileId = getDriveFileIdFromUrl(report?.pdf_file_id || report?.pdf_url || report?.pdf_proxy_url || '');
  if (report?.pdf_proxy_url) return `${API_BASE}${report.pdf_proxy_url}`;
  if (fileId) return `${API_BASE}/api/google-drive/files/${encodeURIComponent(fileId)}`;
  return report?.pdf_url || '';
}

export function getMeetingReportPdfOpenUrl(report?: Pick<MeetingReportItem, 'pdf_file_id' | 'pdf_url' | 'pdf_proxy_url'> | null) {
  const fileId = getDriveFileIdFromUrl(report?.pdf_file_id || report?.pdf_url || report?.pdf_proxy_url || '');
  if (fileId) return getDriveWebViewUrl(fileId);
  return report?.pdf_url || '';
}

export function getMeetingReportDrivePreviewUrl(report?: Pick<MeetingReportItem, 'pdf_file_id' | 'pdf_url' | 'pdf_proxy_url'> | null) {
  const fileId = getDriveFileIdFromUrl(report?.pdf_file_id || report?.pdf_url || report?.pdf_proxy_url || '');
  if (fileId) return getDrivePreviewUrl(fileId);
  return report?.pdf_url || '';
}

export function getMeetingReportPdfThumbnailUrl(report?: Pick<MeetingReportItem, 'pdf_file_id' | 'pdf_url' | 'pdf_proxy_url'> | null) {
  const fileId = getDriveFileIdFromUrl(report?.pdf_file_id || report?.pdf_url || report?.pdf_proxy_url || '');
  return fileId ? getDriveThumbnailUrl(fileId) : '';
}

export async function uploadMeetingReportPdf(params: {
  userId: number;
  reportTitle: string;
  fileName: string;
  mimeType: string;
  base64: string;
}) {
  const response = await fetch(`${API_BASE}/api/admin/meeting-reports/pdf-drive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: params.userId,
      report_title: params.reportTitle || 'meeting-report',
      file_name: params.fileName,
      mime_type: params.mimeType || 'application/pdf',
      base64: params.base64,
    }),
  });
  const data = await readApiResponse(response);
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || `อัปโหลด PDF รายงานการประชุมไม่สำเร็จ (${response.status})`);
  }
  const upload = resolveDriveUploadResult(data);
  if (!upload.url) throw new Error('Google Drive ไม่ส่ง URL PDF กลับมา');
  return upload;
}

export async function readPdfFileAsBase64(file: File) {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('กรุณาเลือกไฟล์ PDF เท่านั้น');
  }
  if (file.size > MEETING_REPORT_PDF_MAX_BYTES) {
    throw new Error(`ขนาดไฟล์ PDF ต้องไม่เกิน ${formatFileSize(MEETING_REPORT_PDF_MAX_BYTES)}`);
  }
  return dataUrlToBase64(await readBlobAsDataUrl(file));
}

export function formatMeetingReportDate(value?: string | null) {
  return formatThaiDate(value);
}

export { formatDigitalDuration, formatDuration, formatFileSize, getDriveFileIdFromUrl };
