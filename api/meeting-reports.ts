import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || '157.85.98.50',
  port: Number(process.env.DB_PORT) || 3307,
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || '041853671',
  database: process.env.DB_NAME || 'isr8',
  timezone: '+07:00',
  dateStrings: true,
  waitForConnections: true,
  connectionLimit: 2,
  queueLimit: 0,
});

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const GOOGLE_MONITOR_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwiK32Dwn80oGfbG4yElZQmKW0IwblvPO85yCW_1ex7LfcCzwd0FtgWMfG45aSqUd3H/exec';
const GOOGLE_DRIVE_FOLDER_ID = '1aaQIZ3nUcr0iDLOq8xENFpM_halgcndE';
const GOOGLE_AVATAR_UPLOAD_SCRIPT_URL = process.env.GOOGLE_AVATAR_UPLOAD_SCRIPT_URL || GOOGLE_MONITOR_SCRIPT_URL;
const DRIVE_SCRIPT_TIMEOUT_MS = 45_000;

type MeetingReportSection = 'office' | 'area';
type MeetingReportMarkerType = 'point' | 'circle' | 'rect';

const DEFAULT_MEETING_MENU_ITEMS = [
  ['meeting_reports_admin', 'จัดการรายงานการประชุม', 'sidebar', 'FileStack', '/meeting-reports-admin', 9],
  ['meeting_reports_office', 'รายงานการประชุมสำนักงาน', 'content', 'ClipboardList', '/meeting-reports/office', 16],
  ['meeting_reports_area', 'รายงานการประชุมสำนักงานในพื้นที่', 'content', 'MapPinned', '/meeting-reports/area', 17],
];

const SECTION_LABELS: Record<MeetingReportSection, string> = {
  office: 'สำนักงาน',
  area: 'สำนักงานในพื้นที่',
};

const SECTION_MENU_KEYS: Record<MeetingReportSection, string> = {
  office: 'meeting_reports_office',
  area: 'meeting_reports_area',
};

function sendJson(res: any, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(JSON.stringify(payload));
}

async function readBody(req: any) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function getRoutePath(req: any) {
  const value = req.query?.path;
  const raw = Array.isArray(value) ? value.join('/') : String(value || '');
  return raw.replace(/^\/+|\/+$/g, '');
}

function toInt(value: unknown, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSection(value: unknown): MeetingReportSection {
  return String(value || '').trim() === 'area' ? 'area' : 'office';
}

function normalizeStatus(value: unknown) {
  const text = String(value || '').trim();
  return ['draft', 'published', 'archived'].includes(text) ? text : 'published';
}

function normalizeMarkerType(value: unknown): MeetingReportMarkerType {
  const text = String(value || '').trim();
  if (text === 'circle' || text === 'rect') return text;
  return 'point';
}

function sanitizeFileName(value: unknown, fallbackName = 'meeting-report') {
  const raw = typeof value === 'string' && value.trim() ? value.trim() : fallbackName;
  return raw.replace(/[\\/:*?"<>|#%{}~&]/g, '-').replace(/\s+/g, '-').slice(0, 120);
}

function extractGoogleDriveFileId(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return '';
  const raw = value.trim();
  const proxyMatch = raw.match(/\/api\/google-drive\/files\/([^/?#]+)/);
  if (proxyMatch?.[1]) return decodeURIComponent(proxyMatch[1]);
  try {
    const url = new URL(raw);
    const idFromQuery = url.searchParams.get('id');
    if (idFromQuery) return idFromQuery;
    const fileMatch = url.pathname.match(/\/file\/d\/([^/]+)/);
    if (fileMatch?.[1]) return fileMatch[1];
  } catch {
    // Plain Drive IDs can still be passed from older saved values.
  }
  const ucMatch = raw.match(/[?&]id=([^&]+)/);
  if (ucMatch?.[1]) return decodeURIComponent(ucMatch[1]);
  return /^[a-zA-Z0-9_-]{20,}$/.test(raw) ? raw : '';
}

function buildDriveProxyPath(fileId: unknown) {
  const safeId = String(fileId || '').trim();
  return safeId ? `/api/google-drive/files/${encodeURIComponent(safeId)}` : '';
}

function parseJsonish(value: any): any {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function collectDriveUploadCandidates(value: any, output: string[] = [], depth = 0) {
  if (value == null || depth > 4) return output;
  const parsed = parseJsonish(value);
  if (typeof parsed === 'string') {
    if (parsed.trim()) output.push(parsed.trim());
    return output;
  }
  if (Array.isArray(parsed)) {
    parsed.forEach((item) => collectDriveUploadCandidates(item, output, depth + 1));
    return output;
  }
  if (typeof parsed === 'object') {
    [
      'fileProxyPath',
      'fileId',
      'file_id',
      'id',
      'url',
      'driveUrl',
      'drive_url',
      'webViewLink',
      'web_view_link',
      'webContentLink',
      'downloadUrl',
      'thumbnailUrl',
    ].forEach((key) => collectDriveUploadCandidates(parsed[key], output, depth + 1));
    ['data', 'file', 'result', 'payload', 'response'].forEach((key) => collectDriveUploadCandidates(parsed[key], output, depth + 1));
  }
  return output;
}

function buildDriveUploadPayload(parsed: any) {
  const candidates = collectDriveUploadCandidates(parsed);
  const fileId = candidates.map(extractGoogleDriveFileId).find(Boolean) || '';
  const directUrl = candidates.find((value) => /^https?:\/\//i.test(value)) || '';
  return {
    ...parsed,
    fileId: fileId || parsed?.fileId || parsed?.file_id || '',
    fileProxyPath: fileId ? buildDriveProxyPath(fileId) : parsed?.fileProxyPath || '',
    webViewLink: parsed?.webViewLink || parsed?.web_view_link || parsed?.url || directUrl || '',
  };
}

function uploadErrorMessage(message: string) {
  if (/DriveApp|getFolderById|Required permissions|Authorization|permission/i.test(message)) {
    return 'Google Apps Script ยังไม่ได้รับสิทธิ์ Google Drive สำหรับอัปโหลดไฟล์ โปรด Deploy Apps Script เป็น New version และอนุญาตสิทธิ์ Drive';
  }
  return message;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = DRIVE_SCRIPT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function postToDriveScript(payload: Record<string, unknown>) {
  let response: globalThis.Response;
  try {
    response = await fetchWithTimeout(GOOGLE_AVATAR_UPLOAD_SCRIPT_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Google Apps Script ใช้เวลาตอบกลับนานเกินไป กรุณาลองใหม่อีกครั้ง', { cause: error });
    }
    throw error;
  }
  const text = await response.text();
  if (!response.ok) throw new Error(text || 'Cannot call Google Apps Script');
  if (/script function not found|<!doctype|<html/i.test(text)) {
    throw new Error('Google Apps Script ยังไม่รองรับคำสั่งนี้ โปรดอัปเดต Apps Script แล้ว Deploy เป็น New version');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Google Apps Script ส่งผลลัพธ์กลับมาไม่ถูกต้อง');
  }
}

async function ensureDefaultMenuItems() {
  for (const item of DEFAULT_MEETING_MENU_ITEMS) {
    await pool.query(
      `INSERT INTO menu_items (menu_key, menu_name, menu_type, menu_icon, menu_href, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         menu_name = VALUES(menu_name),
         menu_type = VALUES(menu_type),
         menu_icon = VALUES(menu_icon),
         menu_href = VALUES(menu_href),
         sort_order = VALUES(sort_order),
         is_active = 1`,
      item,
    );
  }

  await pool.query(`
    INSERT INTO group_permissions (group_id, menu_id, can_view)
    SELECT source.group_id, admin_menu.menu_id, 1
    FROM (
      SELECT DISTINCT gp.group_id
      FROM group_permissions gp
      INNER JOIN menu_items m ON m.menu_id = gp.menu_id
      WHERE m.menu_key = 'user_settings' AND gp.can_view = 1
    ) source
    JOIN menu_items admin_menu ON admin_menu.menu_key = 'meeting_reports_admin'
    LEFT JOIN group_permissions existing
      ON existing.group_id = source.group_id AND existing.menu_id = admin_menu.menu_id
    WHERE existing.perm_id IS NULL
  `);
}

async function ensureMeetingReportTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS meeting_reports (
      report_id INT AUTO_INCREMENT PRIMARY KEY,
      section ENUM('office','area') NOT NULL DEFAULT 'office',
      title VARCHAR(255) NOT NULL,
      meeting_date DATE NULL,
      description TEXT NULL,
      status ENUM('draft','published','archived') NOT NULL DEFAULT 'published',
      pdf_url TEXT NULL,
      pdf_file_id VARCHAR(255) DEFAULT '',
      published_at DATETIME NULL,
      view_count INT DEFAULT 0,
      sort_order INT DEFAULT 0,
      created_by_user_id INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_meeting_report_section_status (section, status),
      INDEX idx_meeting_report_published (published_at),
      INDEX idx_meeting_report_sort (sort_order)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS meeting_report_read_logs (
      log_id INT AUTO_INCREMENT PRIMARY KEY,
      report_id INT NOT NULL,
      user_id INT NOT NULL,
      session_id INT NULL,
      start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      end_time DATETIME NULL,
      active_seconds INT DEFAULT 0,
      created_date DATE GENERATED ALWAYS AS (DATE(start_time)) STORED,
      INDEX idx_meeting_read_report (report_id),
      INDEX idx_meeting_read_user (user_id),
      INDEX idx_meeting_read_date (created_date),
      INDEX idx_meeting_read_session (session_id),
      FOREIGN KEY (report_id) REFERENCES meeting_reports(report_id) ON DELETE CASCADE
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS meeting_report_acknowledgements (
      ack_id INT AUTO_INCREMENT PRIMARY KEY,
      report_id INT NOT NULL,
      user_id INT NOT NULL,
      acknowledged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_meeting_ack_user_report (report_id, user_id),
      INDEX idx_meeting_ack_report (report_id),
      INDEX idx_meeting_ack_user (user_id),
      FOREIGN KEY (report_id) REFERENCES meeting_reports(report_id) ON DELETE CASCADE
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS meeting_report_comments (
      comment_id INT AUTO_INCREMENT PRIMARY KEY,
      report_id INT NOT NULL,
      user_id INT NOT NULL,
      page_number INT NOT NULL DEFAULT 1,
      x_percent DECIMAL(6,3) NOT NULL DEFAULT 50,
      y_percent DECIMAL(6,3) NOT NULL DEFAULT 20,
      marker_type ENUM('point','circle','rect') NOT NULL DEFAULT 'point',
      width_percent DECIMAL(6,3) NOT NULL DEFAULT 0,
      height_percent DECIMAL(6,3) NOT NULL DEFAULT 0,
      comment_text TEXT NOT NULL,
      status ENUM('open','resolved') NOT NULL DEFAULT 'open',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_meeting_comment_report (report_id),
      INDEX idx_meeting_comment_user (user_id),
      FOREIGN KEY (report_id) REFERENCES meeting_reports(report_id) ON DELETE CASCADE
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  for (const statement of [
    `ALTER TABLE meeting_report_comments ADD COLUMN marker_type ENUM('point','circle','rect') NOT NULL DEFAULT 'point' AFTER y_percent`,
    `ALTER TABLE meeting_report_comments ADD COLUMN width_percent DECIMAL(6,3) NOT NULL DEFAULT 0 AFTER marker_type`,
    `ALTER TABLE meeting_report_comments ADD COLUMN height_percent DECIMAL(6,3) NOT NULL DEFAULT 0 AFTER width_percent`,
  ]) {
    try {
      await pool.query(statement);
    } catch (error: any) {
      if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }
  await pool.query(`ALTER TABLE meeting_report_comments MODIFY marker_type ENUM('point','circle','rect') NOT NULL DEFAULT 'point'`);
}

async function setup() {
  await ensureMeetingReportTables();
  await ensureDefaultMenuItems();
}

async function userCanAccessMenu(userId: number, menuKey: string) {
  if (!userId || !menuKey) return false;
  await ensureDefaultMenuItems();
  const [userRows]: any = await pool.query('SELECT user_status FROM user WHERE user_id = ? LIMIT 1', [userId]);
  if (userRows.length === 0) return false;
  const groupId = toInt(userRows[0].user_status);
  if (!groupId) return true;
  const [rows]: any = await pool.query(
    `SELECT gp.perm_id
     FROM group_permissions gp
     INNER JOIN menu_items m ON m.menu_id = gp.menu_id
     WHERE gp.group_id = ? AND gp.can_view = 1 AND m.menu_key = ? AND m.is_active = 1
     LIMIT 1`,
    [groupId, menuKey],
  );
  return rows.length > 0;
}

async function requireAccess(res: any, userId: number, section: MeetingReportSection) {
  const allowed = await userCanAccessMenu(userId, SECTION_MENU_KEYS[section]);
  if (!allowed) {
    sendJson(res, 403, { error: 'ไม่มีสิทธิ์เข้าถึงรายงานการประชุมส่วนนี้' });
    return false;
  }
  return true;
}

async function requireAdmin(res: any, userId: number) {
  const allowed = await userCanAccessMenu(userId, 'meeting_reports_admin');
  if (!allowed) {
    sendJson(res, 403, { error: 'ไม่มีสิทธิ์จัดการรายงานการประชุม' });
    return false;
  }
  return true;
}

async function listUserReports(req: any, res: any) {
  await setup();
  const userId = toInt(req.query?.user_id);
  const section = normalizeSection(req.query?.section);
  if (!userId) return sendJson(res, 400, { error: 'ไม่พบรหัสผู้ใช้งาน' });
  if (!(await requireAccess(res, userId, section))) return;
  const [rows]: any = await pool.query(
    `SELECT
       r.report_id, r.section, r.title, r.meeting_date, r.description, r.status,
       r.pdf_url, r.pdf_file_id, r.published_at, r.view_count, r.sort_order, r.updated_at,
       CASE WHEN a.ack_id IS NULL THEN 0 ELSE 1 END AS acknowledged,
       DATE_FORMAT(a.acknowledged_at, '%Y-%m-%dT%H:%i:%s') AS acknowledged_at,
       (SELECT COUNT(*) FROM meeting_report_comments c WHERE c.report_id = r.report_id) AS comment_count
     FROM meeting_reports r
     LEFT JOIN meeting_report_acknowledgements a
       ON a.report_id = r.report_id AND a.user_id = ?
     WHERE r.section = ? AND r.status = 'published'
     ORDER BY r.sort_order ASC, COALESCE(r.published_at, r.updated_at) DESC, r.report_id DESC`,
    [userId, section],
  );
  sendJson(res, 200, rows);
}

async function getUserReport(req: any, res: any, reportId: number) {
  await setup();
  const userId = toInt(req.query?.user_id);
  if (!userId) return sendJson(res, 400, { error: 'ไม่พบรหัสผู้ใช้งาน' });
  const [rows]: any = await pool.query(
    `SELECT
       r.*,
       CASE WHEN a.ack_id IS NULL THEN 0 ELSE 1 END AS acknowledged,
       DATE_FORMAT(a.acknowledged_at, '%Y-%m-%dT%H:%i:%s') AS acknowledged_at
     FROM meeting_reports r
     LEFT JOIN meeting_report_acknowledgements a
       ON a.report_id = r.report_id AND a.user_id = ?
     WHERE r.report_id = ? AND r.status = 'published'
     LIMIT 1`,
    [userId, reportId],
  );
  if (rows.length === 0) return sendJson(res, 404, { error: 'ไม่พบรายงานการประชุม' });
  const report = rows[0];
  const section = normalizeSection(report.section);
  if (!(await requireAccess(res, userId, section))) return;
  const [comments]: any = await pool.query(
    `SELECT
       c.comment_id, c.report_id, c.user_id, c.page_number, c.x_percent, c.y_percent,
       c.marker_type, c.width_percent, c.height_percent,
       c.comment_text, c.status,
       DATE_FORMAT(c.created_at, '%Y-%m-%dT%H:%i:%s') AS created_at,
       u.Name_Surnam AS Name_Surname, u.position, u.Division_Province, u.Department
     FROM meeting_report_comments c
     INNER JOIN user u ON u.user_id = c.user_id
     WHERE c.report_id = ?
     ORDER BY c.page_number ASC, c.created_at ASC, c.comment_id ASC`,
    [reportId],
  );
  sendJson(res, 200, {
    ...report,
    section_label: SECTION_LABELS[section],
    pdf_proxy_url: report.pdf_file_id ? buildDriveProxyPath(report.pdf_file_id) : '',
    comments,
  });
}

async function startRead(body: any, res: any, reportId: number) {
  await setup();
  const userId = toInt(body.user_id);
  const sessionId = toInt(body.session_id);
  if (!userId) return sendJson(res, 400, { error: 'ไม่พบรหัสผู้ใช้งาน' });
  const [reports]: any = await pool.query('SELECT report_id, section FROM meeting_reports WHERE report_id = ? AND status = "published" LIMIT 1', [reportId]);
  if (reports.length === 0) return sendJson(res, 404, { error: 'ไม่พบรายงานการประชุม' });
  const section = normalizeSection(reports[0].section);
  if (!(await requireAccess(res, userId, section))) return;
  const [result]: any = await pool.query(
    'INSERT INTO meeting_report_read_logs (report_id, user_id, session_id, start_time) VALUES (?, ?, ?, NOW())',
    [reportId, userId, sessionId || null],
  );
  await pool.query('UPDATE meeting_reports SET view_count = view_count + 1 WHERE report_id = ?', [reportId]);
  sendJson(res, 200, { message: 'เริ่มบันทึกการอ่านแล้ว', log_id: result.insertId });
}

async function saveReadTime(body: any, res: any, logId: number) {
  await ensureMeetingReportTables();
  const userId = toInt(body.user_id);
  const seconds = Math.max(0, Math.min(toInt(body.seconds), 60));
  if (!logId || seconds <= 0) return sendJson(res, 200, { message: 'ไม่มีเวลาที่ต้องบันทึก' });
  const params = userId ? [seconds, logId, userId] : [seconds, logId];
  const userClause = userId ? 'AND user_id = ?' : '';
  await pool.query(
    `UPDATE meeting_report_read_logs
     SET active_seconds = active_seconds + ?, end_time = NOW()
     WHERE log_id = ? ${userClause}`,
    params,
  );
  sendJson(res, 200, { message: 'บันทึกเวลาอ่านเรียบร้อยแล้ว' });
}

async function acknowledge(body: any, res: any, reportId: number) {
  await setup();
  const userId = toInt(body.user_id);
  if (!userId) return sendJson(res, 400, { error: 'ไม่พบรหัสผู้ใช้งาน' });
  const [reports]: any = await pool.query('SELECT report_id, section FROM meeting_reports WHERE report_id = ? AND status = "published" LIMIT 1', [reportId]);
  if (reports.length === 0) return sendJson(res, 404, { error: 'ไม่พบรายงานการประชุม' });
  const section = normalizeSection(reports[0].section);
  if (!(await requireAccess(res, userId, section))) return;
  await pool.query(
    `INSERT INTO meeting_report_acknowledgements (report_id, user_id)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE acknowledged_at = acknowledged_at`,
    [reportId, userId],
  );
  sendJson(res, 200, { message: 'รับทราบรายงานการประชุมเรียบร้อยแล้ว' });
}

async function addComment(body: any, res: any, reportId: number) {
  await setup();
  const userId = toInt(body.user_id);
  const pageNumber = Math.max(1, toInt(body.page_number, 1));
  const xPercent = Math.max(0, Math.min(Number(body.x_percent ?? 50), 100));
  const yPercent = Math.max(0, Math.min(Number(body.y_percent ?? 20), 100));
  const markerType = normalizeMarkerType(body.marker_type);
  const widthPercent = markerType !== 'point' ? Math.max(1, Math.min(Number(body.width_percent ?? 12), 100)) : 0;
  const heightPercent = markerType !== 'point' ? Math.max(1, Math.min(Number(body.height_percent ?? 8), 100)) : 0;
  const commentText = String(body.comment_text || '').trim();
  if (!userId) return sendJson(res, 400, { error: 'ไม่พบรหัสผู้ใช้งาน' });
  if (!commentText) return sendJson(res, 400, { error: 'กรุณากรอกข้อความแจ้งแก้ไข' });
  const [reports]: any = await pool.query('SELECT report_id, section FROM meeting_reports WHERE report_id = ? AND status = "published" LIMIT 1', [reportId]);
  if (reports.length === 0) return sendJson(res, 404, { error: 'ไม่พบรายงานการประชุม' });
  const section = normalizeSection(reports[0].section);
  if (!(await requireAccess(res, userId, section))) return;
  const [result]: any = await pool.query(
    `INSERT INTO meeting_report_comments (report_id, user_id, page_number, x_percent, y_percent, marker_type, width_percent, height_percent, comment_text)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [reportId, userId, pageNumber, xPercent, yPercent, markerType, widthPercent, heightPercent, commentText],
  );
  const [rows]: any = await pool.query(
    `SELECT
       c.comment_id, c.report_id, c.user_id, c.page_number, c.x_percent, c.y_percent,
       c.marker_type, c.width_percent, c.height_percent,
       c.comment_text, c.status,
       DATE_FORMAT(c.created_at, '%Y-%m-%dT%H:%i:%s') AS created_at,
       u.Name_Surnam AS Name_Surname, u.position, u.Division_Province, u.Department
     FROM meeting_report_comments c
     INNER JOIN user u ON u.user_id = c.user_id
     WHERE c.comment_id = ?
     LIMIT 1`,
    [result.insertId],
  );
  sendJson(res, 200, { message: 'บันทึกข้อความแจ้งแก้ไขเรียบร้อยแล้ว', comment: rows[0] });
}

async function updateComment(body: any, res: any, commentId: number) {
  await setup();
  const userId = toInt(body.user_id);
  const hasCommentText = Object.prototype.hasOwnProperty.call(body, 'comment_text');
  const hasPageNumber = Object.prototype.hasOwnProperty.call(body, 'page_number');
  const hasXPercent = Object.prototype.hasOwnProperty.call(body, 'x_percent');
  const hasYPercent = Object.prototype.hasOwnProperty.call(body, 'y_percent');
  const hasMarkerType = Object.prototype.hasOwnProperty.call(body, 'marker_type');
  const hasWidthPercent = Object.prototype.hasOwnProperty.call(body, 'width_percent');
  const hasHeightPercent = Object.prototype.hasOwnProperty.call(body, 'height_percent');
  const commentText = String(body.comment_text || '').trim();
  if (!userId) return sendJson(res, 400, { error: 'ไม่พบรหัสผู้ใช้งาน' });
  if (!commentId) return sendJson(res, 400, { error: 'ไม่พบรหัสข้อความแจ้งแก้ไข' });
  if (!hasCommentText && !hasPageNumber && !hasXPercent && !hasYPercent && !hasMarkerType && !hasWidthPercent && !hasHeightPercent) return sendJson(res, 400, { error: 'ไม่พบข้อมูลที่ต้องการแก้ไข' });
  if (hasCommentText && !commentText) return sendJson(res, 400, { error: 'กรุณากรอกข้อความแจ้งแก้ไข' });

  const [comments]: any = await pool.query(
    `SELECT c.comment_id, c.user_id, c.report_id, c.page_number, c.x_percent, c.y_percent,
            c.marker_type, c.width_percent, c.height_percent, c.comment_text, r.section
     FROM meeting_report_comments c
     INNER JOIN meeting_reports r ON r.report_id = c.report_id
     WHERE c.comment_id = ?
     LIMIT 1`,
    [commentId],
  );
  if (comments.length === 0) return sendJson(res, 404, { error: 'ไม่พบข้อความแจ้งแก้ไข' });

  const section = normalizeSection(comments[0].section);
  const isOwner = Number(comments[0].user_id) === userId;
  const isAdmin = await userCanAccessMenu(userId, 'meeting_reports_admin');
  if (!isOwner && !isAdmin) return sendJson(res, 403, { error: 'แก้ไขได้เฉพาะข้อความของตนเอง' });
  if (!isAdmin && !(await requireAccess(res, userId, section))) return;

  const nextText = hasCommentText ? commentText : comments[0].comment_text;
  const nextPageNumber = hasPageNumber ? Math.max(1, toInt(body.page_number, 1)) : Number(comments[0].page_number || 1);
  const nextXPercent = hasXPercent ? Math.max(0, Math.min(Number(body.x_percent ?? 50), 100)) : Number(comments[0].x_percent || 0);
  const nextYPercent = hasYPercent ? Math.max(0, Math.min(Number(body.y_percent ?? 20), 100)) : Number(comments[0].y_percent || 0);
  const nextMarkerType = hasMarkerType ? normalizeMarkerType(body.marker_type) : normalizeMarkerType(comments[0].marker_type || 'point');
  const nextWidthPercent = nextMarkerType !== 'point'
    ? (hasWidthPercent ? Math.max(1, Math.min(Number(body.width_percent ?? 12), 100)) : Number(comments[0].width_percent || 12))
    : 0;
  const nextHeightPercent = nextMarkerType !== 'point'
    ? (hasHeightPercent ? Math.max(1, Math.min(Number(body.height_percent ?? 8), 100)) : Number(comments[0].height_percent || 8))
    : 0;

  await pool.query(
    `UPDATE meeting_report_comments
     SET comment_text = ?, page_number = ?, x_percent = ?, y_percent = ?,
         marker_type = ?, width_percent = ?, height_percent = ?, updated_at = CURRENT_TIMESTAMP
     WHERE comment_id = ?`,
    [nextText, nextPageNumber, nextXPercent, nextYPercent, nextMarkerType, nextWidthPercent, nextHeightPercent, commentId],
  );

  const [rows]: any = await pool.query(
    `SELECT
       c.comment_id, c.report_id, c.user_id, c.page_number, c.x_percent, c.y_percent,
       c.marker_type, c.width_percent, c.height_percent,
       c.comment_text, c.status,
       DATE_FORMAT(c.created_at, '%Y-%m-%dT%H:%i:%s') AS created_at,
       u.Name_Surnam AS Name_Surname, u.position, u.Division_Province, u.Department
     FROM meeting_report_comments c
     INNER JOIN user u ON u.user_id = c.user_id
     WHERE c.comment_id = ?
     LIMIT 1`,
    [commentId],
  );
  sendJson(res, 200, { message: hasCommentText ? 'แก้ไขข้อความแจ้งแก้ไขเรียบร้อยแล้ว' : 'ย้ายตำแหน่งข้อความแจ้งแก้ไขเรียบร้อยแล้ว', comment: rows[0] });
}

async function deleteComment(body: any, res: any, commentId: number) {
  await setup();
  const userId = toInt(body.user_id);
  if (!userId) return sendJson(res, 400, { error: 'ไม่พบรหัสผู้ใช้งาน' });
  if (!commentId) return sendJson(res, 400, { error: 'ไม่พบรหัสข้อความแจ้งแก้ไข' });

  const [comments]: any = await pool.query(
    `SELECT c.comment_id, c.user_id, c.report_id, r.section
     FROM meeting_report_comments c
     INNER JOIN meeting_reports r ON r.report_id = c.report_id
     WHERE c.comment_id = ?
     LIMIT 1`,
    [commentId],
  );
  if (comments.length === 0) return sendJson(res, 404, { error: 'ไม่พบข้อความแจ้งแก้ไข' });

  const section = normalizeSection(comments[0].section);
  const isOwner = Number(comments[0].user_id) === userId;
  const isAdmin = await userCanAccessMenu(userId, 'meeting_reports_admin');
  if (!isOwner && !isAdmin) return sendJson(res, 403, { error: 'ลบได้เฉพาะข้อความของตนเอง' });
  if (!isAdmin && !(await requireAccess(res, userId, section))) return;

  await pool.query('DELETE FROM meeting_report_comments WHERE comment_id = ?', [commentId]);
  sendJson(res, 200, { message: 'ลบข้อความแจ้งแก้ไขเรียบร้อยแล้ว' });
}

async function listAdminReports(req: any, res: any) {
  await setup();
  const userId = toInt(req.query?.user_id);
  if (!userId) return sendJson(res, 400, { error: 'ไม่พบรหัสผู้ใช้งาน' });
  if (!(await requireAdmin(res, userId))) return;
  const [rows]: any = await pool.query(`
    SELECT
      r.*,
      (SELECT COUNT(*) FROM meeting_report_read_logs l WHERE l.report_id = r.report_id) AS read_count,
      (SELECT COUNT(DISTINCT l.user_id) FROM meeting_report_read_logs l WHERE l.report_id = r.report_id) AS reader_count,
      (SELECT COUNT(*) FROM meeting_report_acknowledgements a WHERE a.report_id = r.report_id) AS acknowledgement_count,
      (SELECT COUNT(*) FROM meeting_report_comments c WHERE c.report_id = r.report_id) AS comment_count
    FROM meeting_reports r
    ORDER BY r.section ASC, r.sort_order ASC, COALESCE(r.published_at, r.updated_at) DESC, r.report_id DESC
  `);
  sendJson(res, 200, rows);
}

async function createAdminReport(body: any, res: any) {
  await setup();
  const userId = toInt(body.user_id);
  if (!userId) return sendJson(res, 400, { error: 'ไม่พบรหัสผู้ใช้งาน' });
  if (!(await requireAdmin(res, userId))) return;
  const title = String(body.title || '').trim();
  if (!title) return sendJson(res, 400, { error: 'กรุณาระบุชื่อรายงานการประชุม' });
  const section = normalizeSection(body.section);
  const status = normalizeStatus(body.status);
  const pdfUrl = String(body.pdf_url || '').trim();
  const meetingDate = DATE_ONLY_RE.test(String(body.meeting_date || '')) ? String(body.meeting_date) : null;
  const [result]: any = await pool.query(
    `INSERT INTO meeting_reports
     (section, title, meeting_date, description, status, pdf_url, pdf_file_id, published_at, sort_order, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ${status === 'published' ? 'NOW()' : 'NULL'}, ?, ?)`,
    [section, title, meetingDate, String(body.description || '').trim(), status, pdfUrl, String(body.pdf_file_id || extractGoogleDriveFileId(pdfUrl) || '').trim(), toInt(body.sort_order), userId],
  );
  sendJson(res, 200, { message: 'เพิ่มรายงานการประชุมเรียบร้อยแล้ว', report_id: result.insertId });
}

async function updateAdminReport(body: any, res: any, reportId: number) {
  await setup();
  const userId = toInt(body.user_id);
  if (!userId) return sendJson(res, 400, { error: 'ไม่พบรหัสผู้ใช้งาน' });
  if (!(await requireAdmin(res, userId))) return;
  const title = String(body.title || '').trim();
  if (!title) return sendJson(res, 400, { error: 'กรุณาระบุชื่อรายงานการประชุม' });
  const section = normalizeSection(body.section);
  const status = normalizeStatus(body.status);
  const pdfUrl = String(body.pdf_url || '').trim();
  const meetingDate = DATE_ONLY_RE.test(String(body.meeting_date || '')) ? String(body.meeting_date) : null;
  await pool.query(
    `UPDATE meeting_reports SET
       section = ?, title = ?, meeting_date = ?, description = ?, status = ?,
       pdf_url = ?, pdf_file_id = ?, sort_order = ?,
       published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, NOW()) ELSE published_at END
     WHERE report_id = ?`,
    [section, title, meetingDate, String(body.description || '').trim(), status, pdfUrl, String(body.pdf_file_id || extractGoogleDriveFileId(pdfUrl) || '').trim(), toInt(body.sort_order), status, reportId],
  );
  sendJson(res, 200, { message: 'แก้ไขรายงานการประชุมเรียบร้อยแล้ว' });
}

async function deleteAdminReport(req: any, res: any, reportId: number) {
  await setup();
  const userId = toInt(req.query?.user_id);
  if (!userId) return sendJson(res, 400, { error: 'ไม่พบรหัสผู้ใช้งาน' });
  if (!(await requireAdmin(res, userId))) return;
  await pool.query('DELETE FROM meeting_reports WHERE report_id = ?', [reportId]);
  sendJson(res, 200, { message: 'ลบรายงานการประชุมเรียบร้อยแล้ว' });
}

async function uploadPdf(body: any, res: any) {
  await setup();
  const userId = toInt(body.user_id);
  if (!userId) return sendJson(res, 400, { error: 'ไม่พบรหัสผู้ใช้งาน' });
  if (!(await requireAdmin(res, userId))) return;
  if (!body.base64 || typeof body.base64 !== 'string') return sendJson(res, 400, { error: 'ไม่พบไฟล์ PDF ที่ต้องการอัปโหลด' });
  const mimeType = String(body.mime_type || 'application/pdf');
  if (mimeType !== 'application/pdf' && !String(body.file_name || '').toLowerCase().endsWith('.pdf')) {
    return sendJson(res, 400, { error: 'รายงานการประชุมต้องเป็นไฟล์ PDF เท่านั้น' });
  }
  const safeReportName = sanitizeFileName(body.report_title || 'meeting-report', 'meeting-report');
  const safeFileName = sanitizeFileName(body.file_name || `${safeReportName}.pdf`, 'meeting-report.pdf');
  const parsed = await postToDriveScript({
    action: 'uploadAvatar',
    folderId: GOOGLE_DRIVE_FOLDER_ID,
    userId: 'meeting-report-pdf',
    displayName: safeReportName,
    fileName: `${Date.now()}-meeting-report-${safeFileName}`,
    mimeType: 'application/pdf',
    base64: body.base64,
  });
  if (parsed?.ok === false) throw new Error(uploadErrorMessage(parsed.error || 'อัปโหลด PDF ไป Google Drive ไม่สำเร็จ'));
  const uploadPayload = buildDriveUploadPayload(parsed);
  if (!uploadPayload.fileId && !uploadPayload.fileProxyPath && !uploadPayload.webViewLink) {
    throw new Error('Google Apps Script อัปโหลดสำเร็จไม่สมบูรณ์: ไม่พบรหัสไฟล์หรือ URL จาก Google Drive');
  }
  sendJson(res, 200, uploadPayload);
}

async function adminDashboard(req: any, res: any) {
  await setup();
  const userId = toInt(req.query?.user_id);
  if (!userId) return sendJson(res, 400, { error: 'ไม่พบรหัสผู้ใช้งาน' });
  if (!(await requireAdmin(res, userId))) return;
  const [reads]: any = await pool.query(`
    SELECT
      l.report_id, l.user_id, r.section, r.title, r.meeting_date,
      u.Name_Surnam AS Name_Surname, u.position, u.Division_Province, u.Department,
      COUNT(l.log_id) AS read_count,
      COALESCE(SUM(l.active_seconds), 0) AS total_active_seconds,
      MIN(l.start_time) AS first_read_at,
      MAX(COALESCE(l.end_time, l.start_time)) AS last_read_at
    FROM meeting_report_read_logs l
    INNER JOIN meeting_reports r ON r.report_id = l.report_id
    INNER JOIN user u ON u.user_id = l.user_id
    GROUP BY l.report_id, l.user_id, r.section, r.title, r.meeting_date, u.Name_Surnam, u.position, u.Division_Province, u.Department
    ORDER BY last_read_at DESC
  `);
  const [acknowledgements]: any = await pool.query(`
    SELECT
      a.report_id, a.user_id, r.section, r.title, r.meeting_date,
      u.Name_Surnam AS Name_Surname, u.position, u.Division_Province, u.Department,
      DATE_FORMAT(a.acknowledged_at, '%Y-%m-%dT%H:%i:%s') AS acknowledged_at
    FROM meeting_report_acknowledgements a
    INNER JOIN meeting_reports r ON r.report_id = a.report_id
    INNER JOIN user u ON u.user_id = a.user_id
    ORDER BY a.acknowledged_at DESC
  `);
  const [comments]: any = await pool.query(`
    SELECT
      c.comment_id, c.report_id, c.user_id, r.section, r.title, r.meeting_date,
      c.page_number, c.x_percent, c.y_percent, c.marker_type, c.width_percent, c.height_percent,
      c.comment_text, c.status,
      DATE_FORMAT(c.created_at, '%Y-%m-%dT%H:%i:%s') AS created_at,
      u.Name_Surnam AS Name_Surname, u.position, u.Division_Province, u.Department
    FROM meeting_report_comments c
    INNER JOIN meeting_reports r ON r.report_id = c.report_id
    INNER JOIN user u ON u.user_id = c.user_id
    ORDER BY c.created_at DESC
  `);
  sendJson(res, 200, { reads, acknowledgements, comments });
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});

  try {
    const path = getRoutePath(req);
    const body = ['POST', 'PUT', 'DELETE'].includes(req.method) ? await readBody(req) : {};

    if (path === 'setup' && req.method === 'POST') {
      await setup();
      return sendJson(res, 200, { message: 'ตารางรายงานการประชุมถูกสร้างเรียบร้อยแล้ว' });
    }
    if (path === 'admin' && req.method === 'GET') return listAdminReports(req, res);
    if (path === 'admin' && req.method === 'POST') return createAdminReport(body, res);
    if (path === 'admin/report' && req.method === 'GET') return adminDashboard(req, res);
    if (path === 'admin/pdf-drive' && req.method === 'POST') return uploadPdf(body, res);

    const adminIdMatch = path.match(/^admin\/(\d+)$/);
    if (adminIdMatch && req.method === 'PUT') return updateAdminReport(body, res, toInt(adminIdMatch[1]));
    if (adminIdMatch && req.method === 'DELETE') return deleteAdminReport(req, res, toInt(adminIdMatch[1]));

    if (!path && req.method === 'GET') return listUserReports(req, res);

    const readTimeMatch = path.match(/^read-logs\/(\d+)\/time$/);
    if (readTimeMatch && req.method === 'POST') return saveReadTime(body, res, toInt(readTimeMatch[1]));

    const reportIdMatch = path.match(/^(\d+)$/);
    if (reportIdMatch && req.method === 'GET') return getUserReport(req, res, toInt(reportIdMatch[1]));

    const startMatch = path.match(/^(\d+)\/read\/start$/);
    if (startMatch && req.method === 'POST') return startRead(body, res, toInt(startMatch[1]));

    const ackMatch = path.match(/^(\d+)\/acknowledge$/);
    if (ackMatch && req.method === 'POST') return acknowledge(body, res, toInt(ackMatch[1]));

    const commentMatch = path.match(/^(\d+)\/comments$/);
    if (commentMatch && req.method === 'POST') return addComment(body, res, toInt(commentMatch[1]));

    const updateCommentMatch = path.match(/^comments\/(\d+)$/);
    if (updateCommentMatch && req.method === 'PUT') return updateComment(body, res, toInt(updateCommentMatch[1]));
    if (updateCommentMatch && req.method === 'DELETE') return deleteComment(body, res, toInt(updateCommentMatch[1]));

    return sendJson(res, 404, { error: 'ไม่พบ API รายงานการประชุมนี้' });
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'เกิดข้อผิดพลาดใน API รายงานการประชุม',
    });
  }
}
