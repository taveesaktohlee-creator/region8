import express, { type NextFunction, type Request, type Response as ExpressResponse } from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { pool } from './src/lib/dbconnect.js';
import {
  assertLineGroupId,
  ensureLineNotificationTables,
  getLineMessagingConfigStatus,
  seedLineNotificationTopics,
  sendLineTestToGroup,
  sendLineTopicNotification,
  verifyLineGroup,
} from './src/lib/lineGroupNotifications.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use((err: unknown, _req: Request, res: ExpressResponse, next: NextFunction) => {
  const bodyError = err as { status?: number; type?: string; body?: unknown } | undefined;

  if (bodyError?.type === 'entity.too.large' || bodyError?.status === 413) {
    return res.status(413).json({
      error: 'ไฟล์หรือข้อมูลที่ส่งมามีขนาดใหญ่เกินไป กรุณาลดขนาดไฟล์แล้วลองใหม่',
    });
  }

  if (err instanceof SyntaxError && bodyError && 'body' in bodyError) {
    return res.status(400).json({
      error: 'รูปแบบ JSON ไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง',
    });
  }

  return next(err);
});

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const GOOGLE_MONITOR_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwiK32Dwn80oGfbG4yElZQmKW0IwblvPO85yCW_1ex7LfcCzwd0FtgWMfG45aSqUd3H/exec';
const USAGE_REPORT_RESET_AT = process.env.USAGE_REPORT_RESET_AT || '2026-05-18 09:57:34';

function getDateRange(query: { from?: unknown; to?: unknown }) {
  const { from, to } = query;
  if (typeof from !== 'string' || typeof to !== 'string') return null;
  if (!DATE_ONLY_RE.test(from) || !DATE_ONLY_RE.test(to)) return null;
  return { from, to };
}

let usageTablesReady: Promise<void> | null = null;
let profileAvatarReady: Promise<void> | null = null;
let monitorRecordsReady: Promise<void> | null = null;
let trainingTablesReady: Promise<void> | null = null;
let knowledgeTablesReady: Promise<void> | null = null;
let meetingReportTablesReady: Promise<void> | null = null;
let activityCalendarTablesReady: Promise<void> | null = null;
let notificationTablesReady: Promise<void> | null = null;
let passwordResetTokensReady: Promise<void> | null = null;
let lineLoginSchemaReady: Promise<void> | null = null;
let lineNotificationSchemaReady: Promise<void> | null = null;

const DEFAULT_MENU_ITEMS = [
  ['home', 'หน้าหลัก', 'sidebar', 'Home', '/index', 1],
  ['profile', 'ข้อมูลส่วนตัว', 'sidebar', 'FileText', '/profile', 2],
  ['training', 'ประวัติการอบรม', 'sidebar', 'ListTodo', '/training-history', 3],
  ['change_password', 'เปลี่ยนรหัสผ่าน', 'sidebar', 'KeyRound', '/change-password', 4],
  ['user_settings', 'ตั้งค่าผู้ใช้งาน', 'sidebar', 'Settings', '/user-settings', 5],
  ['monitor_data', 'บันทึกกำกับติดตามกลุ่มเทคฯ', 'sidebar', 'ClipboardEdit', '/monitor-data', 6],
  ['training_admin', 'จัดการระบบอบรม', 'sidebar', 'GraduationCap', '/training-admin', 7],
  ['knowledge_admin', 'จัดการคลังความรู้', 'sidebar', 'LibraryBig', '/knowledge-admin', 8],
  ['meeting_reports_admin', 'จัดการรายงานการประชุม', 'sidebar', 'FileStack', '/meeting-reports-admin', 9],
  ['report_monitor', 'รายงานการกำกับติดตามฯ', 'content', 'Monitor', '/program-monitoring', 10],
  ['report_course', 'หลักสูตรการอบรม', 'content', 'BookOpen', '/training-courses', 11],
  ['report_usage', 'รายงานการใช้งานระบบ', 'content', 'Users', '/system-usage-report', 12],
  ['report_security', 'รายงานการรักษาความปลอดภัย', 'content', 'ShieldCheck', '/office-security-report', 13],
  ['knowledge', 'คลังความรู้', 'content', 'LibraryBig', '/knowledge', 14],
  ['activity_calendar', 'ตารางกิจกรรม', 'content', 'CalendarDays', '/activity-calendar', 15],
  ['meeting_reports_office', 'รายงานการประชุมสำนักงาน', 'content', 'ClipboardList', '/meeting-reports/office', 16],
  ['meeting_reports_area', 'รายงานการประชุมสำนักงานในพื้นที่', 'content', 'MapPinned', '/meeting-reports/area', 17],
];
const GOOGLE_DRIVE_AVATAR_FOLDER_ID = '1aaQIZ3nUcr0iDLOq8xENFpM_halgcndE';
const GOOGLE_AVATAR_UPLOAD_SCRIPT_URL = process.env.GOOGLE_AVATAR_UPLOAD_SCRIPT_URL || GOOGLE_MONITOR_SCRIPT_URL;
const GOOGLE_PASSWORD_RESET_SCRIPT_URL = process.env.GOOGLE_PASSWORD_RESET_SCRIPT_URL || GOOGLE_AVATAR_UPLOAD_SCRIPT_URL;
const DRIVE_SCRIPT_TIMEOUT_MS = 45_000;
const PROFILE_AVATAR_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
const PROFILE_AVATAR_UPLOAD_MAX_BASE64_LENGTH = Math.ceil((PROFILE_AVATAR_UPLOAD_MAX_BYTES * 4) / 3) + 128;
const SUPPORTED_AVATAR_MIME_RE = /^image\/(jpeg|jpg|png|webp|gif|avif|bmp|svg\+xml|tiff|heic|heif)$/i;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RESET_TOKEN_TTL_MINUTES = 30;
const LINE_OAUTH_STATE_TTL_MINUTES = 10;

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function hashResetToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getAppBaseUrl(req: express.Request) {
  const configured = process.env.APP_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  const forwardedProto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim();
  const forwardedHost = String(req.get('x-forwarded-host') || '').split(',')[0].trim();
  const proto = forwardedProto || req.protocol;
  const host = forwardedHost || req.get('host');
  return `${proto}://${host}`.replace(/\/+$/, '');
}

function inferSmtpDefaults(user?: string) {
  const domain = String(user || '').split('@').pop()?.toLowerCase() || '';
  if (domain === 'gmail.com') return { host: 'smtp.gmail.com', port: 465 };
  if (['outlook.com', 'hotmail.com', 'live.com', 'msn.com'].includes(domain)) {
    return { host: 'smtp.office365.com', port: 587 };
  }
  if (domain === 'cad.go.th' || domain === 'mail.cad.go.th') {
    return { host: 'mail.cad.go.th', port: 587 };
  }
  return { host: '', port: 587 };
}

function getMailConfig() {
  const user =
    process.env.SMTP_USER?.trim() ||
    process.env.GMAIL_USER?.trim() ||
    process.env.OUTLOOK_USER?.trim() ||
    process.env.HOTMAIL_USER?.trim() ||
    process.env.CAD_MAIL_USER?.trim() ||
    process.env.EMAIL_USER?.trim();
  const pass =
    process.env.SMTP_PASSWORD ||
    process.env.GMAIL_APP_PASSWORD ||
    process.env.OUTLOOK_PASSWORD ||
    process.env.HOTMAIL_PASSWORD ||
    process.env.CAD_MAIL_PASSWORD ||
    process.env.EMAIL_PASSWORD;
  const inferred = inferSmtpDefaults(user);
  const host = process.env.SMTP_HOST?.trim() || inferred.host;
  const port = Number(process.env.SMTP_PORT || inferred.port);
  const missing = [
    !user ? 'SMTP_USER, GMAIL_USER, OUTLOOK_USER, HOTMAIL_USER หรือ CAD_MAIL_USER' : '',
    !pass ? 'SMTP_PASSWORD, GMAIL_APP_PASSWORD, OUTLOOK_PASSWORD, HOTMAIL_PASSWORD หรือ CAD_MAIL_PASSWORD' : '',
    !host ? 'SMTP_HOST' : '',
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`SMTP configuration is incomplete: ${missing.join(', ')}`);
  }

  return {
    host,
    port,
    secure: port === 465,
    user,
    pass,
    from: process.env.SMTP_FROM?.trim() || user,
  };
}

async function ensurePasswordResetTokensTable() {
  if (!passwordResetTokensReady) {
    passwordResetTokensReady = pool.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        token_id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token_hash CHAR(64) NOT NULL,
        expires_at DATETIME NOT NULL,
        used_at DATETIME NULL,
        request_ip VARCHAR(50) NULL,
        user_agent VARCHAR(500) NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_password_reset_token_hash (token_hash),
        INDEX idx_password_reset_user (user_id),
        INDEX idx_password_reset_expires (expires_at),
        INDEX idx_password_reset_used (used_at)
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `).then(() => undefined).catch((error) => {
      passwordResetTokensReady = null;
      throw error;
    });
  }

  return passwordResetTokensReady;
}

async function createMailTransporter(mailConfig: ReturnType<typeof getMailConfig>) {
  let nodemailer;
  try {
    nodemailer = await import('nodemailer');
  } catch {
    throw new Error('Nodemailer package is not installed');
  }

  return nodemailer.createTransport({
    host: mailConfig.host,
    port: mailConfig.port,
    secure: mailConfig.secure,
    auth: { user: mailConfig.user, pass: mailConfig.pass },
  });
}

async function sendPasswordResetEmailViaAppsScript(email: string, displayName: string | null, resetLink: string) {
  const response = await fetch(GOOGLE_PASSWORD_RESET_SCRIPT_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action: 'sendPasswordResetEmail',
      email,
      displayName,
      resetLink,
      expiresMinutes: PASSWORD_RESET_TOKEN_TTL_MINUTES,
    }),
  });

  const text = await response.text();
  if (!response.ok) throw new Error(text || 'Cannot call Google Apps Script for password reset email');
  if (/script function not found|<!doctype|<html/i.test(text)) {
    throw new Error('Google Apps Script ยังไม่รองรับการส่งอีเมลรีเซ็ตรหัสผ่าน โปรดอัปเดตไฟล์ google-apps-script/monitor_data_webapp.gs แล้ว Deploy เป็น New version');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Google Apps Script ส่งผลลัพธ์การส่งอีเมลกลับมาไม่ถูกต้อง');
  }

  if (parsed?.ok === false) {
    throw new Error(parsed.error || 'Google Apps Script ส่งอีเมลรีเซ็ตรหัสผ่านไม่สำเร็จ');
  }
  if (parsed?.emailSent !== true) {
    throw new Error('Google Apps Script ยังไม่ได้รัน action ส่งอีเมลรีเซ็ตรหัสผ่านจริง โปรด Deploy web app เป็น New version แล้วตรวจว่า GOOGLE_PASSWORD_RESET_SCRIPT_URL ชี้ไป deployment ล่าสุด');
  }
}

async function sendPasswordResetEmail(email: string, displayName: string | null, resetLink: string) {
  let mailConfig: ReturnType<typeof getMailConfig>;
  try {
    mailConfig = getMailConfig();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('SMTP configuration is incomplete')) {
      await sendPasswordResetEmailViaAppsScript(email, displayName, resetLink);
      return;
    }
    throw error;
  }

  const transporter = await createMailTransporter(mailConfig);
  const recipientName = displayName || 'ผู้ใช้งาน';
  const safeRecipientName = escapeHtml(recipientName);
  const safeResetLink = escapeHtml(resetLink);

  await transporter.sendMail({
    from: mailConfig.from,
    to: email,
    subject: 'ลิงก์รีเซ็ตรหัสผ่านระบบสารสนเทศ สตท.8',
    text: [
      `เรียน ${recipientName}`,
      '',
      'ระบบได้รับคำขอรีเซ็ตรหัสผ่านของคุณ',
      `กรุณาคลิกลิงก์นี้ภายใน ${PASSWORD_RESET_TOKEN_TTL_MINUTES} นาที:`,
      resetLink,
      '',
      'หากคุณไม่ได้ทำรายการนี้ กรุณาเพิกเฉยต่ออีเมลฉบับนี้',
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
        <p>เรียน ${safeRecipientName}</p>
        <p>ระบบได้รับคำขอรีเซ็ตรหัสผ่านของคุณ</p>
        <p>
          <a href="${safeResetLink}" style="display:inline-block;padding:12px 18px;background:#0ea5e9;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:700;">
            รีเซ็ตรหัสผ่าน
          </a>
        </p>
        <p>ลิงก์นี้จะหมดอายุภายใน ${PASSWORD_RESET_TOKEN_TTL_MINUTES} นาที</p>
        <p style="color:#64748b;">หากคุณไม่ได้ทำรายการนี้ กรุณาเพิกเฉยต่ออีเมลฉบับนี้</p>
      </div>
    `,
  });
}

async function ensureColumn(tableName: string, columnName: string, definition: string) {
  const [rows]: any = await pool.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  if (rows.length === 0) {
    await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

async function ensureTrainingSchemaColumns() {
  await ensureColumn('training_quizzes', 'time_limit_minutes', 'INT DEFAULT 0');
}

async function ensureProfileAvatarColumn() {
  if (!profileAvatarReady) {
    profileAvatarReady = ensureColumn('user', 'avatar_data_url', 'LONGTEXT NULL').catch((error) => {
      profileAvatarReady = null;
      throw error;
    });
  }

  return profileAvatarReady;
}

async function ensureLineLoginSchema() {
  if (!lineLoginSchemaReady) {
    lineLoginSchemaReady = (async () => {
      await ensureColumn('user', 'line_user_id', 'VARCHAR(80) NULL UNIQUE');
      await ensureColumn('user', 'line_display_name', 'VARCHAR(255) NULL');
      await ensureColumn('user', 'line_picture_url', 'TEXT NULL');
      await ensureColumn('user', 'line_linked_at', 'DATETIME NULL');

      await pool.query(`
        CREATE TABLE IF NOT EXISTS line_oauth_states (
          state_id INT AUTO_INCREMENT PRIMARY KEY,
          state_hash CHAR(64) NOT NULL,
          mode ENUM('login','link') NOT NULL,
          user_id INT NULL,
          expires_at DATETIME NOT NULL,
          used_at DATETIME NULL,
          request_ip VARCHAR(50) NULL,
          user_agent VARCHAR(500) NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_line_oauth_state_hash (state_hash),
          INDEX idx_line_oauth_state_lookup (state_hash, used_at, expires_at)
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
      `);
    })().catch((error) => {
      lineLoginSchemaReady = null;
      throw error;
    });
  }

  return lineLoginSchemaReady;
}

async function ensureLineNotificationSchema() {
  if (!lineNotificationSchemaReady) {
    lineNotificationSchemaReady = (async () => {
      await ensureLineNotificationTables(pool);
      await seedLineNotificationTopics(pool);
    })().catch((error) => {
      lineNotificationSchemaReady = null;
      throw error;
    });
  }

  return lineNotificationSchemaReady;
}

async function ensureDefaultMenuItems() {
  for (const item of DEFAULT_MENU_ITEMS) {
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
      item
    );
  }

  await pool.query(`
    INSERT INTO group_permissions (group_id, menu_id, can_view)
    SELECT g.group_id, m.menu_id, 1
    FROM user_groups g
    JOIN menu_items m ON m.menu_key = 'monitor_data'
    LEFT JOIN group_permissions gp ON gp.group_id = g.group_id AND gp.menu_id = m.menu_id
    WHERE gp.perm_id IS NULL
  `);

  await pool.query(`
    INSERT INTO group_permissions (group_id, menu_id, can_view)
    SELECT g.group_id, m.menu_id, 1
    FROM user_groups g
    JOIN menu_items m ON m.menu_key = 'training_admin'
    LEFT JOIN group_permissions gp ON gp.group_id = g.group_id AND gp.menu_id = m.menu_id
    WHERE gp.perm_id IS NULL
  `);

  await pool.query(`
    INSERT INTO group_permissions (group_id, menu_id, can_view)
    SELECT g.group_id, m.menu_id, 1
    FROM user_groups g
    JOIN menu_items m ON m.menu_key = 'knowledge'
    LEFT JOIN group_permissions gp ON gp.group_id = g.group_id AND gp.menu_id = m.menu_id
    WHERE gp.perm_id IS NULL
  `);

  await pool.query(`
    INSERT INTO group_permissions (group_id, menu_id, can_view)
    SELECT g.group_id, m.menu_id, 1
    FROM user_groups g
    JOIN menu_items m ON m.menu_key = 'activity_calendar'
    LEFT JOIN group_permissions gp ON gp.group_id = g.group_id AND gp.menu_id = m.menu_id
    WHERE gp.perm_id IS NULL
  `);

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

async function ensureMonitorRecordsTable() {
  if (!monitorRecordsReady) {
    monitorRecordsReady = pool.query(`
      CREATE TABLE IF NOT EXISTS monitor_records (
        record_id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NULL,
        payload LONGTEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_monitor_user (user_id),
        INDEX idx_monitor_updated (updated_at)
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `).then(() => undefined).catch((error) => {
      monitorRecordsReady = null;
      throw error;
    });
  }

  return monitorRecordsReady;
}

function toInt(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.round(numberValue) : fallback;
}

function toBooleanFlag(value: unknown) {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return value === 1 ? 1 : 0;
  const text = String(value ?? '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(text) ? 1 : 0;
}

function normalizeCourseType(value: unknown) {
  const text = String(value || '').trim();
  if (['online', 'zoom', 'onsite'].includes(text)) return text;
  return 'online';
}

function normalizeTrainingStatus(value: unknown) {
  const text = String(value || '').trim();
  if (['draft', 'open', 'closed'].includes(text)) return text;
  return 'open';
}

function normalizeEvaluationQuestionType(value: unknown) {
  const text = String(value || '').trim();
  if (['rating', 'single_choice', 'multiple_choice', 'text'].includes(text)) return text;
  return 'rating';
}

function normalizeKnowledgeStatus(value: unknown) {
  const text = String(value || '').trim();
  if (['draft', 'published', 'archived'].includes(text)) return text;
  return 'published';
}

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function toMysqlLocalDateTime(value: unknown) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text} 00:00:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) return `${text.replace('T', ' ')}:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(text)) return text.replace('T', ' ');
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(text)) {
    return text.length === 16 ? `${text}:00` : text;
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return '';
  return formatBangkokDateTime(parsed);
}

function formatBangkokDateTime(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '00';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

function addDaysToDateString(dateText: string, days: number) {
  const date = new Date(`${dateText}T00:00:00+07:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return formatBangkokDateTime(date).slice(0, 10);
}

function normalizeGoogleCalendarColor(value: unknown) {
  const color = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#22c55e';
}

function buildGoogleEventRange(event: any) {
  const startDate = event.start?.date;
  const endDate = event.end?.date;
  const startDateTime = event.start?.dateTime;
  const endDateTime = event.end?.dateTime;
  const allDay = Boolean(startDate && endDate);
  const startAt = allDay
    ? `${startDate} 00:00:00`
    : formatBangkokDateTime(new Date(startDateTime));
  const endAt = allDay
    ? `${endDate || addDaysToDateString(startDate, 1)} 00:00:00`
    : formatBangkokDateTime(new Date(endDateTime || startDateTime));
  return { allDay, startAt, endAt };
}

function getGoogleCalendarConfig() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim();
  const tokenSecret = process.env.GOOGLE_CALENDAR_TOKEN_SECRET?.trim();
  const missing = [
    !clientId ? 'GOOGLE_CALENDAR_CLIENT_ID' : '',
    !clientSecret ? 'GOOGLE_CALENDAR_CLIENT_SECRET' : '',
    !redirectUri ? 'GOOGLE_CALENDAR_REDIRECT_URI' : '',
    !tokenSecret ? 'GOOGLE_CALENDAR_TOKEN_SECRET' : '',
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(`ยังไม่ได้ตั้งค่า Google Calendar OAuth: ${missing.join(', ')}`);
  }
  return { clientId, clientSecret, redirectUri, tokenSecret };
}

function getActivityCryptoKey(secret: string) {
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptActivityToken(value: string, secret: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getActivityCryptoKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

function decryptActivityToken(value: string, secret: string) {
  const raw = Buffer.from(value, 'base64url');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', getActivityCryptoKey(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function signActivityState(payload: { userId: number; ts: number }, secret: string) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyActivityState(state: string, secret: string) {
  const [body, sig] = String(state || '').split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { userId?: number; ts?: number };
  if (!payload.userId || !payload.ts || Date.now() - payload.ts > 15 * 60 * 1000) return null;
  return { userId: payload.userId };
}

async function ensureActivityCalendarTables() {
  if (!activityCalendarTablesReady) {
    activityCalendarTablesReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS activity_events (
          event_id INT AUTO_INCREMENT PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          description TEXT NULL,
          location VARCHAR(255) DEFAULT '',
          start_at DATETIME NOT NULL,
          end_at DATETIME NOT NULL,
          all_day TINYINT(1) DEFAULT 0,
          color VARCHAR(32) DEFAULT '#3b82f6',
          source ENUM('system','google') NOT NULL DEFAULT 'system',
          visibility ENUM('org','private') NOT NULL DEFAULT 'org',
          created_by_user_id INT NOT NULL,
          created_by_name VARCHAR(255) DEFAULT '',
          google_calendar_id VARCHAR(255) DEFAULT NULL,
          google_event_id VARCHAR(255) DEFAULT NULL,
          google_html_link TEXT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_activity_google_event (created_by_user_id, google_calendar_id, google_event_id),
          INDEX idx_activity_range (start_at, end_at),
          INDEX idx_activity_owner (created_by_user_id),
          INDEX idx_activity_source (source),
          INDEX idx_activity_visibility (visibility)
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS activity_google_connections (
          connection_id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL UNIQUE,
          google_email VARCHAR(255) DEFAULT '',
          access_token_encrypted LONGTEXT NULL,
          refresh_token_encrypted LONGTEXT NOT NULL,
          token_expires_at DATETIME NULL,
          sync_enabled TINYINT(1) DEFAULT 1,
          last_synced_at DATETIME NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_activity_google_user (user_id),
          FOREIGN KEY (user_id) REFERENCES user(user_id) ON DELETE CASCADE
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
      `);
    })().catch((error) => {
      activityCalendarTablesReady = null;
      throw error;
    });
  }

  return activityCalendarTablesReady;
}

async function ensureKnowledgeTables() {
  if (!knowledgeTablesReady) {
    knowledgeTablesReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS knowledge_items (
          item_id INT AUTO_INCREMENT PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          category VARCHAR(160) DEFAULT '',
          description TEXT NULL,
          status ENUM('draft','published','archived') NOT NULL DEFAULT 'published',
          cover_url TEXT NULL,
          cover_file_id VARCHAR(255) DEFAULT '',
          pdf_url TEXT NULL,
          pdf_file_id VARCHAR(255) DEFAULT '',
          published_at DATETIME NULL,
          view_count INT DEFAULT 0,
          sort_order INT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_knowledge_status (status),
          INDEX idx_knowledge_published (published_at),
          INDEX idx_knowledge_sort (sort_order)
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS knowledge_reading_logs (
          log_id INT AUTO_INCREMENT PRIMARY KEY,
          item_id INT NOT NULL,
          user_id INT NOT NULL,
          session_id INT NULL,
          start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
          end_time DATETIME NULL,
          active_seconds INT DEFAULT 0,
          created_date DATE GENERATED ALWAYS AS (DATE(start_time)) STORED,
          INDEX idx_knowledge_log_item (item_id),
          INDEX idx_knowledge_log_user (user_id),
          INDEX idx_knowledge_log_date (created_date),
          INDEX idx_knowledge_log_session (session_id),
          FOREIGN KEY (item_id) REFERENCES knowledge_items(item_id) ON DELETE CASCADE
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
      `);
    })().catch((error) => {
      knowledgeTablesReady = null;
      throw error;
    });
  }

  return knowledgeTablesReady;
}

type MeetingReportSection = 'office' | 'area';
type MeetingReportMarkerType = 'point' | 'circle' | 'rect';

const MEETING_REPORT_SECTION_LABELS: Record<MeetingReportSection, string> = {
  office: 'สำนักงาน',
  area: 'สำนักงานในพื้นที่',
};

const MEETING_REPORT_SECTION_MENU_KEYS: Record<MeetingReportSection, string> = {
  office: 'meeting_reports_office',
  area: 'meeting_reports_area',
};

function normalizeMeetingReportSection(value: unknown): MeetingReportSection {
  return String(value || '').trim() === 'area' ? 'area' : 'office';
}

function normalizeMeetingReportStatus(value: unknown) {
  const text = String(value || '').trim();
  if (['draft', 'published', 'archived'].includes(text)) return text;
  return 'published';
}

function normalizeMeetingReportMarkerType(value: unknown): MeetingReportMarkerType {
  const text = String(value || '').trim();
  if (text === 'circle' || text === 'rect') return text;
  return 'point';
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

async function requireMeetingReportAccess(res: ExpressResponse, userId: number, section: MeetingReportSection) {
  const allowed = await userCanAccessMenu(userId, MEETING_REPORT_SECTION_MENU_KEYS[section]);
  if (!allowed) {
    res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึงรายงานการประชุมส่วนนี้' });
    return false;
  }
  return true;
}

async function requireMeetingReportAdmin(res: ExpressResponse, userId: number) {
  const allowed = await userCanAccessMenu(userId, 'meeting_reports_admin');
  if (!allowed) {
    res.status(403).json({ error: 'ไม่มีสิทธิ์จัดการรายงานการประชุม' });
    return false;
  }
  return true;
}

async function ensureMeetingReportTables() {
  if (!meetingReportTablesReady) {
    meetingReportTablesReady = (async () => {
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
    })().catch((error) => {
      meetingReportTablesReady = null;
      throw error;
    });
  }

  return meetingReportTablesReady;
}

async function ensureNotificationTables() {
  if (!notificationTablesReady) {
    notificationTablesReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS user_notification_reads (
          read_id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          notification_type ENUM('knowledge','activity','meeting_report') NOT NULL,
          source_id INT NOT NULL,
          read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_user_notification_read (user_id, notification_type, source_id),
          INDEX idx_user_notification_user (user_id),
          INDEX idx_user_notification_source (notification_type, source_id),
          FOREIGN KEY (user_id) REFERENCES user(user_id) ON DELETE CASCADE
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
      `);
      await pool.query(`
        ALTER TABLE user_notification_reads
        MODIFY notification_type ENUM('knowledge','activity','meeting_report') NOT NULL
      `);
    })().catch((error) => {
      notificationTablesReady = null;
      throw error;
    });
  }

  return notificationTablesReady;
}

async function seedTrainingSampleData() {
  const [rows]: any = await pool.query('SELECT COUNT(*) AS count FROM training_courses');
  if ((rows[0]?.count || 0) > 0) return;

  const [courseResult]: any = await pool.query(
    `INSERT INTO training_courses
     (title, category, course_type, status, thumbnail_url, instructor, target_group,
      learning_objectives, learning_topics, content_summary, evaluation_method, description,
      duration_minutes, pass_score, certificate_enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'Digital Literacy: ความฉลาดทางดิจิทัล (Digital Intelligence)',
      'Digital Literacy',
      'online',
      'open',
      'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80',
      'อาจารย์สมมติ วิทยากรดิจิทัล',
      'บุคลากรสำนักงานตรวจบัญชีสหกรณ์ที่ 8',
      'เข้าใจทักษะดิจิทัลที่จำเป็น ใช้งานเทคโนโลยีอย่างปลอดภัย และประยุกต์ใช้กับงานราชการ',
      'Digital Identity\nDigital Use\nDigital Security\nDigital Literacy\nDigital Communication',
      'หลักสูตรออนไลน์สำหรับพัฒนาความรู้พื้นฐานด้านดิจิทัลและความปลอดภัยในการใช้งานระบบสารสนเทศ',
      'ทำแบบทดสอบก่อนเรียน เรียนบทเรียนออนไลน์ ทำแบบทดสอบหลังเรียนให้ได้อย่างน้อย 70% และประเมินหลักสูตร',
      'หลักสูตรนี้ออกแบบให้ผู้เรียนสามารถเรียนรู้ด้วยตนเองผ่านวิดีโอและเอกสารประกอบจาก Google Drive',
      90,
      70,
      1,
    ],
  );

  const courseId = courseResult.insertId;
  await pool.query(
    'INSERT INTO training_lessons (course_id, title, lesson_type, youtube_url, content, duration_seconds, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      courseId,
      'บทนำความฉลาดทางดิจิทัล',
      'video',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'เรียนรู้ภาพรวมทักษะดิจิทัลที่จำเป็นสำหรับบุคลากรภาครัฐ',
      900,
      1,
    ],
  );
  await pool.query(
    'INSERT INTO training_materials (course_id, title, drive_url, sort_order) VALUES (?, ?, ?, ?)',
    [courseId, 'เอกสารประกอบหลักสูตร Digital Literacy', 'https://drive.google.com/drive/folders/' + GOOGLE_DRIVE_AVATAR_FOLDER_ID, 1],
  );

  for (const quizType of ['pre', 'post']) {
    const [quizResult]: any = await pool.query(
      'INSERT INTO training_quizzes (course_id, quiz_type, title, pass_score, time_limit_minutes) VALUES (?, ?, ?, ?, ?)',
      [courseId, quizType, quizType === 'pre' ? 'แบบทดสอบก่อนเรียน' : 'แบบทดสอบหลังเรียน', 70, 30],
    );
    const [questionResult]: any = await pool.query(
      'INSERT INTO training_questions (quiz_id, question_text, sort_order) VALUES (?, ?, ?)',
      [quizResult.insertId, 'ข้อใดเป็นพฤติกรรมที่ช่วยเพิ่มความปลอดภัยในการใช้งานระบบสารสนเทศ', 1],
    );
    await pool.query(
      'INSERT INTO training_choices (question_id, choice_text, is_correct, sort_order) VALUES ?',
      [[
        [questionResult.insertId, 'ใช้รหัสผ่านเดียวกันทุกระบบ', 0, 1],
        [questionResult.insertId, 'เปิดเผยรหัสผ่านให้เพื่อนร่วมงาน', 0, 2],
        [questionResult.insertId, 'ตั้งรหัสผ่านรัดกุมและไม่เปิดเผยให้ผู้อื่น', 1, 3],
        [questionResult.insertId, 'บันทึกรหัสผ่านไว้ในกระดาษบนโต๊ะ', 0, 4],
      ]],
    );
  }
}

async function ensureTrainingTables() {
  if (!trainingTablesReady) {
    trainingTablesReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS training_courses (
          course_id INT AUTO_INCREMENT PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          category VARCHAR(120) DEFAULT '',
          course_type ENUM('online','zoom','onsite') NOT NULL DEFAULT 'online',
          status ENUM('draft','open','closed') NOT NULL DEFAULT 'open',
          thumbnail_url TEXT NULL,
          instructor VARCHAR(255) DEFAULT '',
          target_group TEXT NULL,
          learning_objectives TEXT NULL,
          learning_topics TEXT NULL,
          content_summary TEXT NULL,
          evaluation_method TEXT NULL,
          description TEXT NULL,
          duration_minutes INT DEFAULT 0,
          zoom_url TEXT NULL,
          location VARCHAR(255) DEFAULT '',
          pass_score INT DEFAULT 70,
          certificate_enabled TINYINT(1) DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_training_status (status),
          INDEX idx_training_type (course_type)
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS training_lessons (
          lesson_id INT AUTO_INCREMENT PRIMARY KEY,
          course_id INT NOT NULL,
          title VARCHAR(255) NOT NULL,
          lesson_type ENUM('video','document','text') DEFAULT 'video',
          youtube_url TEXT NULL,
          content TEXT NULL,
          duration_seconds INT DEFAULT 0,
          sort_order INT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (course_id) REFERENCES training_courses(course_id) ON DELETE CASCADE
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS training_materials (
          material_id INT AUTO_INCREMENT PRIMARY KEY,
          course_id INT NOT NULL,
          title VARCHAR(255) NOT NULL,
          drive_url TEXT NOT NULL,
          drive_file_id VARCHAR(255) DEFAULT '',
          sort_order INT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (course_id) REFERENCES training_courses(course_id) ON DELETE CASCADE
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS training_quizzes (
          quiz_id INT AUTO_INCREMENT PRIMARY KEY,
          course_id INT NOT NULL,
          quiz_type ENUM('pre','post') NOT NULL,
          title VARCHAR(255) NOT NULL,
          pass_score INT DEFAULT 70,
          time_limit_minutes INT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_training_quiz_type (course_id, quiz_type),
          FOREIGN KEY (course_id) REFERENCES training_courses(course_id) ON DELETE CASCADE
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
      `);
      await ensureTrainingSchemaColumns();

      await pool.query(`
        CREATE TABLE IF NOT EXISTS training_questions (
          question_id INT AUTO_INCREMENT PRIMARY KEY,
          quiz_id INT NOT NULL,
          question_text TEXT NOT NULL,
          sort_order INT DEFAULT 0,
          FOREIGN KEY (quiz_id) REFERENCES training_quizzes(quiz_id) ON DELETE CASCADE
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS training_choices (
          choice_id INT AUTO_INCREMENT PRIMARY KEY,
          question_id INT NOT NULL,
          choice_text TEXT NOT NULL,
          is_correct TINYINT(1) DEFAULT 0,
          sort_order INT DEFAULT 0,
          FOREIGN KEY (question_id) REFERENCES training_questions(question_id) ON DELETE CASCADE
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS training_enrollments (
          enrollment_id INT AUTO_INCREMENT PRIMARY KEY,
          course_id INT NOT NULL,
          user_id INT NOT NULL,
          status ENUM('registered','in_progress','completed') DEFAULT 'registered',
          pre_score DECIMAL(5,2) NULL,
          pre_total INT DEFAULT 0,
          post_score DECIMAL(5,2) NULL,
          post_total INT DEFAULT 0,
          attended_seconds INT DEFAULT 0,
          attendance_confirmed TINYINT(1) DEFAULT 0,
          evaluated TINYINT(1) DEFAULT 0,
          certificate_code VARCHAR(80) DEFAULT '',
          registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_started_at DATETIME NULL,
          completed_at DATETIME NULL,
          UNIQUE KEY uq_training_user_course (course_id, user_id),
          INDEX idx_training_enroll_user (user_id),
          FOREIGN KEY (course_id) REFERENCES training_courses(course_id) ON DELETE CASCADE
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS training_attendance_logs (
          log_id INT AUTO_INCREMENT PRIMARY KEY,
          enrollment_id INT NOT NULL,
          start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
          end_time DATETIME NULL,
          active_seconds INT DEFAULT 0,
          FOREIGN KEY (enrollment_id) REFERENCES training_enrollments(enrollment_id) ON DELETE CASCADE
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS training_quiz_attempts (
          attempt_id INT AUTO_INCREMENT PRIMARY KEY,
          enrollment_id INT NOT NULL,
          quiz_id INT NOT NULL,
          quiz_type ENUM('pre','post') NOT NULL,
          score DECIMAL(5,2) DEFAULT 0,
          total_questions INT DEFAULT 0,
          answers LONGTEXT NULL,
          submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_training_attempt (enrollment_id, quiz_type),
          FOREIGN KEY (enrollment_id) REFERENCES training_enrollments(enrollment_id) ON DELETE CASCADE,
          FOREIGN KEY (quiz_id) REFERENCES training_quizzes(quiz_id) ON DELETE CASCADE
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
      `);

      await pool.query(`
        UPDATE training_enrollments e
        LEFT JOIN (
          SELECT enrollment_id, MAX(submitted_at) AS submitted_at
          FROM training_quiz_attempts
          WHERE quiz_type = 'post'
          GROUP BY enrollment_id
        ) post_attempt ON post_attempt.enrollment_id = e.enrollment_id
        SET e.status = 'completed',
            e.completed_at = COALESCE(e.completed_at, post_attempt.submitted_at, NOW())
        WHERE e.post_score IS NOT NULL
          AND e.status <> 'completed'
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS training_evaluations (
          evaluation_id INT AUTO_INCREMENT PRIMARY KEY,
          enrollment_id INT NOT NULL UNIQUE,
          rating_content INT DEFAULT 0,
          rating_instructor INT DEFAULT 0,
          rating_overall INT DEFAULT 0,
          comment TEXT NULL,
          submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (enrollment_id) REFERENCES training_enrollments(enrollment_id) ON DELETE CASCADE
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS training_evaluation_questions (
          question_id INT AUTO_INCREMENT PRIMARY KEY,
          course_id INT NOT NULL,
          question_text TEXT NOT NULL,
          question_type ENUM('rating','single_choice','multiple_choice','text') NOT NULL DEFAULT 'rating',
          is_required TINYINT(1) DEFAULT 1,
          sort_order INT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (course_id) REFERENCES training_courses(course_id) ON DELETE CASCADE,
          INDEX idx_training_eval_question_course (course_id)
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS training_evaluation_options (
          option_id INT AUTO_INCREMENT PRIMARY KEY,
          question_id INT NOT NULL,
          option_text TEXT NOT NULL,
          sort_order INT DEFAULT 0,
          FOREIGN KEY (question_id) REFERENCES training_evaluation_questions(question_id) ON DELETE CASCADE
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS training_evaluation_responses (
          response_id INT AUTO_INCREMENT PRIMARY KEY,
          enrollment_id INT NOT NULL UNIQUE,
          course_id INT NOT NULL,
          user_id INT NOT NULL,
          submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (enrollment_id) REFERENCES training_enrollments(enrollment_id) ON DELETE CASCADE,
          FOREIGN KEY (course_id) REFERENCES training_courses(course_id) ON DELETE CASCADE,
          INDEX idx_training_eval_response_course (course_id),
          INDEX idx_training_eval_response_user (user_id)
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS training_evaluation_answers (
          answer_id INT AUTO_INCREMENT PRIMARY KEY,
          response_id INT NOT NULL,
          question_id INT NOT NULL,
          answer_value LONGTEXT NULL,
          FOREIGN KEY (response_id) REFERENCES training_evaluation_responses(response_id) ON DELETE CASCADE,
          FOREIGN KEY (question_id) REFERENCES training_evaluation_questions(question_id) ON DELETE CASCADE,
          UNIQUE KEY uq_training_eval_answer (response_id, question_id)
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
      `);

      await seedTrainingSampleData();
    })().catch((error) => {
      trainingTablesReady = null;
      throw error;
    });
  }

  return trainingTablesReady;
}

function getYouTubeEmbedUrl(url?: string | null) {
  if (!url) return '';
  const raw = String(url).trim();
  const watchMatch = raw.match(/[?&]v=([^&]+)/);
  const shortMatch = raw.match(/youtu\.be\/([^?&/]+)/);
  const embedMatch = raw.match(/youtube\.com\/embed\/([^?&/]+)/);
  const id = watchMatch?.[1] || shortMatch?.[1] || embedMatch?.[1];
  return id ? `https://www.youtube.com/embed/${id}` : raw;
}

function truncateExternalMessage(value: unknown, fallback = 'ไม่สามารถเชื่อมต่อบริการภายนอกได้') {
  const raw = typeof value === 'string' ? value : value instanceof Error ? value.message : '';
  const withoutHtml = raw
    .replace(/<!doctype[\s\S]*$/i, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return (withoutHtml || fallback).slice(0, 240);
}

function normalizeBase64Payload(value: string) {
  const raw = value.includes(',') ? value.split(',').pop() || '' : value;
  return raw.replace(/\s+/g, '');
}

function getBase64DecodedByteLength(value: string) {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((value.length * 3) / 4) - padding);
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

function isValidAvatarDataUrl(value: unknown) {
  if (value === null || value === undefined || value === '') return true;
  if (typeof value !== 'string') return false;
  if (/^https:\/\/(drive\.google\.com|lh3\.googleusercontent\.com|googleusercontent\.com)\//i.test(value)) return true;
  if (/^\/api\/google-drive\/files\/[a-zA-Z0-9_-]+/i.test(value)) return true;
  return /^data:image\/(jpeg|jpg|png|webp|gif|avif|bmp|svg\+xml|tiff|heic|heif);base64,[A-Za-z0-9+/=\s]+$/i.test(value);
}

function sanitizeAvatarFileName(value: unknown, fallbackName = 'avatar') {
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

    const foldersMatch = url.pathname.match(/\/folders\/([^/]+)/);
    if (foldersMatch?.[1]) return foldersMatch[1];
  } catch {
    // Plain Drive IDs can still be passed from older saved values.
  }

  const ucMatch = raw.match(/[?&]id=([^&]+)/);
  if (ucMatch?.[1]) return decodeURIComponent(ucMatch[1]);

  if (/^[a-zA-Z0-9_-]{20,}$/.test(raw)) return raw;

  return '';
}

function getAvatarUploadErrorMessage(message: string) {
  if (/DriveApp|getFolderById|Required permissions|Authorization|permission/i.test(message)) {
    return 'Google Apps Script ยังไม่ได้รับสิทธิ์ Google Drive สำหรับอัปโหลดรูป โปรดอัปเดต appsscript.json จากโฟลเดอร์ google-apps-script แล้ว Deploy เป็น New version โดยตั้ง Execute as: Me และ Who has access: Anyone จากนั้นกดอนุญาตสิทธิ์ Drive';
  }
  return message;
}

async function deleteAvatarFromGoogleDrive(avatarUrlOrFileId: unknown) {
  const fileId = extractGoogleDriveFileId(avatarUrlOrFileId);
  if (!fileId) return { skipped: true, reason: 'ไม่พบ Google Drive fileId' };

  const parsed = await postToDriveScript({
    action: 'deleteAvatar',
    fileId,
  });

  if (parsed?.ok === false) {
    throw new Error(getAvatarUploadErrorMessage(parsed.error || 'ลบรูปจาก Google Drive ไม่สำเร็จ'));
  }

  return parsed;
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
    parsed.forEach(item => collectDriveUploadCandidates(item, output, depth + 1));
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

    ['data', 'file', 'result', 'payload', 'response'].forEach((key) => {
      collectDriveUploadCandidates(parsed[key], output, depth + 1);
    });
  }

  return output;
}

function getDriveUploadFileId(parsed: any) {
  return collectDriveUploadCandidates(parsed).map(extractGoogleDriveFileId).find(Boolean) || '';
}

function buildDriveUploadPayload(parsed: any) {
  const fileId = getDriveUploadFileId(parsed);
  const candidates = collectDriveUploadCandidates(parsed);
  const directUrl = candidates.find(value => /^https?:\/\//i.test(value)) || '';
  return {
    ...parsed,
    fileId: fileId || parsed?.fileId || parsed?.file_id || '',
    fileProxyPath: fileId ? buildDriveProxyPath(fileId) : parsed?.fileProxyPath || '',
    webViewLink: parsed?.webViewLink || parsed?.web_view_link || parsed?.url || directUrl || '',
  };
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
  if (!response.ok) {
    throw new Error(truncateExternalMessage(text, 'Cannot call Google Apps Script'));
  }
  if (/script function not found|<!doctype|<html/i.test(text)) {
    throw new Error('Google Apps Script ยังไม่รองรับคำสั่งนี้ โปรดอัปเดต Apps Script แล้ว Deploy เป็น New version');
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Google Apps Script ส่งผลลัพธ์กลับมาไม่ถูกต้อง');
  }
}

async function ensureUsageTables() {
  if (!usageTablesReady) {
    usageTablesReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS user_sessions (
          session_id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
          logout_time DATETIME NULL,
          last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          is_online TINYINT(1) DEFAULT 1,
          ip_address VARCHAR(50),
          user_agent VARCHAR(500),
          INDEX idx_user_online (user_id, is_online),
          INDEX idx_login_time (login_time)
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
      `);

      await ensureColumn('user_sessions', 'last_seen_at', 'DATETIME NULL DEFAULT CURRENT_TIMESTAMP');
      await pool.query(`
        UPDATE user_sessions
        SET last_seen_at = COALESCE(last_seen_at, logout_time, login_time)
        WHERE last_seen_at IS NULL
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS user_activity_log (
          log_id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          session_id INT,
          menu_key VARCHAR(100) NOT NULL,
          menu_name VARCHAR(200) NOT NULL,
          start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
          end_time DATETIME NULL,
          active_seconds INT DEFAULT 0,
          created_date DATE GENERATED ALWAYS AS (DATE(start_time)) STORED,
          INDEX idx_user_date (user_id, created_date),
          INDEX idx_session (session_id)
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
      `);
    })().catch((error) => {
      usageTablesReady = null;
      throw error;
    });
  }

  return usageTablesReady;
}

async function createLoginSession(userId: number, req: Request) {
  let sessionId: number | null = null;

  try {
    await ensureUsageTables();
    await pool.query(
      'UPDATE user_sessions SET is_online = 0, logout_time = NOW() WHERE user_id = ? AND is_online = 1',
      [userId]
    );
    const [sessionResult]: any = await pool.query(
      'INSERT INTO user_sessions (user_id, ip_address, user_agent, last_seen_at) VALUES (?, ?, ?, NOW())',
      [userId, req.ip || '', req.headers['user-agent'] || '']
    );
    sessionId = sessionResult.insertId;
  } catch (_) {
    // ตารางอาจยังไม่มี ข้ามไปเพื่อไม่ให้การ login ล้มเหลว
  }

  return sessionId;
}

function getLineConfig(req: Request) {
  const channelId = process.env.LINE_CHANNEL_ID?.trim();
  const channelSecret = process.env.LINE_CHANNEL_SECRET?.trim();
  const redirectUri = process.env.LINE_REDIRECT_URI?.trim() || `${getAppBaseUrl(req)}/api/line/callback`;

  if (!channelId || !channelSecret) {
    throw new Error('ยังไม่ได้ตั้งค่า LINE_CHANNEL_ID และ LINE_CHANNEL_SECRET บนเซิร์ฟเวอร์');
  }

  return { channelId, channelSecret, redirectUri };
}

function hashLineState(state: string) {
  return crypto.createHash('sha256').update(state).digest('hex');
}

function getSafeScriptJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function renderLineRedirectPage(targetPath: string, message = 'กำลังนำคุณกลับเข้าสู่ระบบ...') {
  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>LINE Login</title>
  <style>
    body{font-family:Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#f8fafc;color:#0f172a}
    main{text-align:center;padding:24px}
    p{color:#64748b;font-weight:600}
  </style>
</head>
<body>
  <main>
    <h1>LINE Login</h1>
    <p>${escapeHtml(message)}</p>
  </main>
  <script>
    window.location.replace(${getSafeScriptJson(targetPath)});
  </script>
</body>
</html>`;
}

function renderLineLoginSuccessPage(user: Record<string, unknown>, sessionId: number | null) {
  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>LINE Login</title>
  <style>
    body{font-family:Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#f8fafc;color:#0f172a}
    main{text-align:center;padding:24px}
    p{color:#64748b;font-weight:600}
  </style>
</head>
<body>
  <main>
    <h1>เข้าสู่ระบบสำเร็จ</h1>
    <p>กำลังนำคุณเข้าสู่ระบบ...</p>
  </main>
  <script>
    localStorage.setItem('user', ${getSafeScriptJson(JSON.stringify(user))});
    ${sessionId ? `localStorage.setItem('usage_session_id', ${getSafeScriptJson(String(sessionId))});` : ''}
    window.location.replace('/index');
  </script>
</body>
</html>`;
}

function renderLineMessagePage(title: string, message: string, targetPath = '/') {
  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body{font-family:Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#f8fafc;color:#0f172a}
    main{width:min(440px,calc(100vw - 32px));border:1px solid #e2e8f0;border-radius:18px;background:#fff;padding:28px;text-align:center;box-shadow:0 20px 45px rgba(15,23,42,.08)}
    p{color:#64748b;font-weight:600;line-height:1.7}
    a{display:inline-flex;margin-top:12px;border-radius:12px;background:#06c755;color:white;padding:12px 18px;text-decoration:none;font-weight:800}
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    <a href="${escapeHtml(targetPath)}">กลับเข้าสู่ระบบ</a>
  </main>
</body>
</html>`;
}

async function exchangeLineCodeForToken(code: string, config: ReturnType<typeof getLineConfig>) {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
    client_id: config.channelId,
    client_secret: config.channelSecret,
  });

  const response = await fetch('https://api.line.me/oauth2/v2.1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  const text = await response.text();
  let parsed: any = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { error_description: text };
  }

  if (!response.ok || !parsed.access_token) {
    throw new Error(parsed.error_description || parsed.error || 'ไม่สามารถแลก LINE authorization code ได้');
  }

  return parsed as { access_token: string };
}

async function fetchLineProfile(accessToken: string) {
  const response = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const text = await response.text();
  let parsed: any = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { message: text };
  }

  if (!response.ok || !parsed.userId) {
    throw new Error(parsed.message || 'ไม่สามารถดึงข้อมูลโปรไฟล์ LINE ได้');
  }

  return parsed as { userId: string; displayName?: string; pictureUrl?: string };
}

async function consumeLineOAuthState(state: string) {
  const stateHash = hashLineState(state);
  const [rows]: any = await pool.query(
    `SELECT state_id, mode, user_id
     FROM line_oauth_states
     WHERE state_hash = ? AND used_at IS NULL AND expires_at > NOW()
     LIMIT 1`,
    [stateHash]
  );

  if (rows.length === 0) {
    throw new Error('LINE login state หมดอายุหรือไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง');
  }

  await pool.query('UPDATE line_oauth_states SET used_at = NOW() WHERE state_id = ?', [rows[0].state_id]);
  return rows[0] as { state_id: number; mode: 'login' | 'link'; user_id: number | null };
}

async function closeStaleUsageSessions() {
  await pool.query(
    `UPDATE user_sessions
     SET is_online = 0, logout_time = COALESCE(logout_time, last_seen_at, login_time, NOW())
     WHERE is_online = 1
       AND (
         logout_time IS NOT NULL
         OR COALESCE(last_seen_at, login_time) < DATE_SUB(NOW(), INTERVAL 2 MINUTE)
         OR COALESCE(last_seen_at, login_time) > DATE_ADD(NOW(), INTERVAL 30 SECOND)
       )`
  );
}

// หน้าแรกสำหรับตรวจสอบสถานะ Server
app.get('/', (req, res) => {
  res.send('Region 8 API Server is running!');
});

// ตรวจสอบสุขภาพระบบและการเชื่อมต่อฐานข้อมูล
app.get('/api/health', async (req, res) => {
  try {
    const [rows]: any = await pool.query('SELECT 1 as connected');
    res.json({ 
      status: 'OK', 
      database: rows[0].connected === 1 ? 'Connected' : 'Error',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({ 
      status: 'Error', 
      database: 'Disconnected', 
      error: error.message 
    });
  }
});

// ค้นหาชื่อ-นามสกุลจาก user_confirm
app.get('/api/users/search-confirm', async (req, res) => {
  try {
    const q = req.query.q || '';
    const [rows] = await pool.query(
      'SELECT id, Name_Surname, position, type, Division_Province, Department FROM user_confirm WHERE Name_Surname LIKE ? LIMIT 10',
      [`%${q}%`]
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ตรวจสอบข้อมูลซ้ำ และลงทะเบียน
app.post('/api/users/register', async (req, res) => {
  try {
    const { 
      Name_Surname, position, type, Division_Province, Department, 
      email, username, password 
    } = req.body;

    // 1. เช็คชื่อนามสกุลซ้ำ
    const [nameCheck]: any = await pool.query(
      'SELECT user_id FROM user WHERE Name_Surnam = ?', 
      [Name_Surname]
    );
    if (nameCheck.length > 0) {
      return res.status(400).json({ error: 'ท่านลงทะเบียนใช้งานแล้ว' });
    }

    // 2. เช็คอีเมลซ้ำ
    const [emailCheck]: any = await pool.query(
      'SELECT user_id FROM user WHERE email = ?', 
      [email]
    );
    if (emailCheck.length > 0) {
      return res.status(400).json({ error: 'อีเมลนี้ถูกใช้งานแล้ว' });
    }

    // 3. เช็ค username ซ้ำ
    const [usernameCheck]: any = await pool.query(
      'SELECT user_id FROM user WHERE username = ?', 
      [username]
    );
    if (usernameCheck.length > 0) {
      return res.status(400).json({ error: 'ชื่อผู้ใช้งานนี้ถูกใช้งานแล้ว' });
    }

    // 4. Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 5. หากลุ่ม "ผู้ใช้งานทั่วไป" — สร้างถ้ายังไม่มี
    let defaultGroupId: number | null = null;
    try {
      const [gRows]: any = await pool.query(
        "SELECT group_id FROM user_groups WHERE group_name = 'ผู้ใช้งานทั่วไป' LIMIT 1"
      );
      if (gRows.length > 0) {
        defaultGroupId = gRows[0].group_id;
      } else {
        const [gRes]: any = await pool.query(
          "INSERT INTO user_groups (group_name, group_description) VALUES ('ผู้ใช้งานทั่วไป', 'กลุ่มผู้ใช้งานเริ่มต้นสำหรับสมาชิกใหม่')"
        );
        defaultGroupId = gRes.insertId;
      }
    } catch (_) {
      // user_groups อาจยังไม่ถูกสร้าง ใช้ null แทน
    }

    // 6. บันทึกลงตาราง user
    await pool.query(
      `INSERT INTO user 
       (Name_Surnam, position, type, Division_Province, Department, email, username, password, registration_date, active_users, user_status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), '1', ?)`,
      [Name_Surname, position, type, Division_Province, Department, email, username, hashedPassword, defaultGroupId]
    );

    res.json({ message: 'ลงทะเบียนเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการลงทะเบียน' });
  }
});

// เข้าสู่ระบบ
app.post('/api/users/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // ค้นหาผู้ใช้ด้วย username
    await ensureProfileAvatarColumn();
    const [users]: any = await pool.query(
      'SELECT user_id, username, password, Name_Surnam, position, Division_Province, avatar_data_url FROM user WHERE username = ?',
      [username]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'ชื่อผู้ใช้งานไม่ถูกต้อง', field: 'username' });
    }

    const user = users[0];

    // ตรวจสอบรหัสผ่าน
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง', field: 'password' });
    }

    // สร้าง session อัตโนมัติ (ปิด session เก่าก่อน)
    const session_id = await createLoginSession(user.user_id, req);

    // ล็อกอินสำเร็จ
    res.json({ 
      message: 'เข้าสู่ระบบสำเร็จ', 
      user: {
        user_id: user.user_id,
        Name_Surname: user.Name_Surnam,
        position: user.position,
        Division_Province: user.Division_Province,
        avatar_data_url: user.avatar_data_url || null
      },
      session_id
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ' });
  }
});

// เริ่ม LINE OAuth สำหรับ login หรือผูกบัญชีกับสมาชิกเดิม
app.post('/api/line/auth-url', async (req, res) => {
  try {
    const mode = req.body?.mode === 'link' ? 'link' : req.body?.mode === 'login' ? 'login' : '';
    const userId = Number(req.body?.user_id);

    if (!mode) {
      return res.status(400).json({ error: 'LINE login mode ไม่ถูกต้อง' });
    }
    if (mode === 'link' && (!Number.isFinite(userId) || userId <= 0)) {
      return res.status(400).json({ error: 'ไม่พบรหัสผู้ใช้สำหรับเชื่อมบัญชี LINE' });
    }

    await ensureLineLoginSchema();
    const config = getLineConfig(req);

    if (mode === 'link') {
      const [users]: any = await pool.query('SELECT user_id FROM user WHERE user_id = ? LIMIT 1', [userId]);
      if (users.length === 0) {
        return res.status(404).json({ error: 'ไม่พบข้อมูลผู้ใช้สำหรับเชื่อมบัญชี LINE' });
      }
    }

    const state = crypto.randomBytes(24).toString('hex');
    await pool.query(
      `INSERT INTO line_oauth_states
       (state_hash, mode, user_id, expires_at, request_ip, user_agent)
       VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), ?, ?)`,
      [
        hashLineState(state),
        mode,
        mode === 'link' ? userId : null,
        LINE_OAUTH_STATE_TTL_MINUTES,
        req.ip || '',
        req.headers['user-agent'] || '',
      ]
    );

    const authUrl = new URL('https://access.line.me/oauth2/v2.1/authorize');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', config.channelId);
    authUrl.searchParams.set('redirect_uri', config.redirectUri);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('scope', 'profile');

    res.json({ authUrl: authUrl.toString() });
  } catch (error) {
    console.error('Create LINE auth URL failed:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'ไม่สามารถเริ่ม LINE Login ได้',
    });
  }
});

// รับ callback จาก LINE Login
app.get('/api/line/callback', async (req, res) => {
  try {
    await ensureLineLoginSchema();

    const oauthError = typeof req.query.error === 'string' ? req.query.error : '';
    if (oauthError) {
      const description = typeof req.query.error_description === 'string'
        ? req.query.error_description
        : 'ผู้ใช้ยกเลิกหรือ LINE ปฏิเสธการอนุญาต';
      return res.type('html').send(renderLineMessagePage('LINE Login ไม่สำเร็จ', description));
    }

    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    if (!code || !state) {
      return res.type('html').status(400).send(renderLineMessagePage(
        'LINE Login ไม่สำเร็จ',
        'ข้อมูล callback จาก LINE ไม่ครบถ้วน กรุณาลองใหม่อีกครั้ง'
      ));
    }

    const stateRecord = await consumeLineOAuthState(state);
    const config = getLineConfig(req);
    const token = await exchangeLineCodeForToken(code, config);
    const lineProfile = await fetchLineProfile(token.access_token);

    if (stateRecord.mode === 'link') {
      if (!stateRecord.user_id) {
        return res.type('html').status(400).send(renderLineMessagePage(
          'เชื่อมบัญชี LINE ไม่สำเร็จ',
          'ไม่พบรหัสผู้ใช้สำหรับเชื่อมบัญชี LINE กรุณาเข้าสู่ระบบแล้วลองใหม่'
        ));
      }

      const [linkedUsers]: any = await pool.query(
        'SELECT user_id FROM user WHERE line_user_id = ? AND user_id != ? LIMIT 1',
        [lineProfile.userId, stateRecord.user_id]
      );
      if (linkedUsers.length > 0) {
        return res.type('html').status(409).send(renderLineMessagePage(
          'เชื่อมบัญชี LINE ไม่สำเร็จ',
          'บัญชี LINE นี้ถูกเชื่อมกับสมาชิกคนอื่นแล้ว'
        ));
      }

      await pool.query(
        `UPDATE user
         SET line_user_id = ?, line_display_name = ?, line_picture_url = ?, line_linked_at = NOW()
         WHERE user_id = ?`,
        [
          lineProfile.userId,
          lineProfile.displayName || null,
          lineProfile.pictureUrl || null,
          stateRecord.user_id,
        ]
      );

      return res.type('html').send(renderLineRedirectPage('/profile?line_linked=1', 'เชื่อมบัญชี LINE เรียบร้อยแล้ว'));
    }

    const [users]: any = await pool.query(
      `SELECT user_id, Name_Surnam, position, Division_Province, avatar_data_url
       FROM user
       WHERE line_user_id = ?
       LIMIT 1`,
      [lineProfile.userId]
    );

    if (users.length === 0) {
      return res.type('html').status(404).send(renderLineMessagePage(
        'ยังไม่ได้เชื่อมบัญชี LINE',
        'กรุณาเข้าสู่ระบบด้วยชื่อผู้ใช้งานและรหัสผ่านก่อน แล้วกด “เชื่อมบัญชี LINE” ที่หน้าโปรไฟล์'
      ));
    }

    const user = users[0];
    await pool.query(
      'UPDATE user SET line_display_name = ?, line_picture_url = ? WHERE user_id = ?',
      [lineProfile.displayName || null, lineProfile.pictureUrl || null, user.user_id]
    );

    const sessionId = await createLoginSession(user.user_id, req);
    return res.type('html').send(renderLineLoginSuccessPage({
      user_id: user.user_id,
      Name_Surname: user.Name_Surnam,
      position: user.position,
      Division_Province: user.Division_Province,
      avatar_data_url: user.avatar_data_url || null,
    }, sessionId));
  } catch (error) {
    console.error('LINE callback failed:', error);
    return res.type('html').status(500).send(renderLineMessagePage(
      'LINE Login ไม่สำเร็จ',
      error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการทำรายการ LINE Login'
    ));
  }
});

app.get('/api/admin/line-notification-settings', async (_req, res) => {
  try {
    await ensureDefaultMenuItems();
    await ensureLineNotificationSchema();

    const [topicRows]: any = await pool.query(`
      SELECT
        m.menu_id, m.menu_key, m.menu_name, m.menu_icon, m.menu_href, m.sort_order, m.is_active,
        t.topic_id,
        COALESCE(t.is_enabled, 0) AS is_enabled,
        DATE_FORMAT(t.updated_at, '%Y-%m-%dT%H:%i:%s') AS updated_at
      FROM menu_items m
      LEFT JOIN line_notification_topics t ON t.menu_key = m.menu_key
      WHERE m.menu_type = 'content'
      ORDER BY m.sort_order ASC, m.menu_name ASC
    `);
    const [groups]: any = await pool.query(`
      SELECT group_ref_id, group_name, group_id, is_active,
             DATE_FORMAT(last_verified_at, '%Y-%m-%dT%H:%i:%s') AS last_verified_at,
             last_error
      FROM line_notification_groups
      ORDER BY is_active DESC, group_name ASC
    `);
    const [links]: any = await pool.query(`
      SELECT t.menu_key, tg.group_ref_id
      FROM line_notification_topic_groups tg
      INNER JOIN line_notification_topics t ON t.topic_id = tg.topic_id
    `);

    const groupIdsByTopic = new Map<string, number[]>();
    for (const link of links) {
      const key = String(link.menu_key || '');
      const next = groupIdsByTopic.get(key) || [];
      next.push(Number(link.group_ref_id));
      groupIdsByTopic.set(key, next);
    }

    res.json({
      line_config: getLineMessagingConfigStatus(),
      topics: topicRows.map((topic: any) => ({
        ...topic,
        is_enabled: Number(topic.is_enabled) === 1,
        group_ref_ids: groupIdsByTopic.get(String(topic.menu_key)) || [],
      })),
      groups: groups.map((group: any) => ({
        ...group,
        is_active: Number(group.is_active) === 1,
      })),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'ไม่สามารถดึงตั้งค่าแจ้งเตือน LINE ได้' });
  }
});

app.put('/api/admin/line-notification-settings', async (req, res) => {
  try {
    await ensureDefaultMenuItems();
    await ensureLineNotificationSchema();
    const topics = Array.isArray(req.body?.topics) ? req.body.topics : [];
    const userId = Number(req.body?.user_id) || null;

    const [menus]: any = await pool.query(
      "SELECT menu_key FROM menu_items WHERE menu_type = 'content' AND is_active = 1",
    );
    const allowedKeys = new Set(menus.map((menu: any) => String(menu.menu_key)));

    for (const topic of topics) {
      const menuKey = String(topic?.menu_key || '').trim();
      if (!allowedKeys.has(menuKey)) continue;

      await pool.query(
        `INSERT INTO line_notification_topics (menu_key, is_enabled, updated_by_user_id)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           is_enabled = VALUES(is_enabled),
           updated_by_user_id = VALUES(updated_by_user_id)`,
        [menuKey, topic?.is_enabled ? 1 : 0, userId],
      );

      const [topicRows]: any = await pool.query(
        'SELECT topic_id FROM line_notification_topics WHERE menu_key = ? LIMIT 1',
        [menuKey],
      );
      const topicId = Number(topicRows[0]?.topic_id);
      if (!topicId) continue;

      await pool.query('DELETE FROM line_notification_topic_groups WHERE topic_id = ?', [topicId]);
      const groupIds = Array.isArray(topic?.group_ref_ids)
        ? [...new Set(topic.group_ref_ids.map((value: unknown) => Number(value)).filter((value: number) => Number.isFinite(value) && value > 0))]
        : [];
      if (groupIds.length > 0) {
        const [validGroups]: any = await pool.query(
          'SELECT group_ref_id FROM line_notification_groups WHERE group_ref_id IN (?)',
          [groupIds],
        );
        const values = validGroups.map((group: any) => [topicId, Number(group.group_ref_id)]);
        if (values.length > 0) {
          await pool.query(
            'INSERT IGNORE INTO line_notification_topic_groups (topic_id, group_ref_id) VALUES ?',
            [values],
          );
        }
      }
    }

    res.json({ message: 'บันทึกตั้งค่าแจ้งเตือน LINE เรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'บันทึกตั้งค่าแจ้งเตือน LINE ไม่สำเร็จ' });
  }
});

app.post('/api/admin/line-notification-groups', async (req, res) => {
  try {
    await ensureLineNotificationSchema();
    const groupId = assertLineGroupId(req.body?.group_id);
    const verified = await verifyLineGroup(groupId);
    const groupName = String(req.body?.group_name || verified.groupName || groupId).trim();

    const [result]: any = await pool.query(
      `INSERT INTO line_notification_groups
         (group_name, group_id, is_active, last_verified_at, last_error)
       VALUES (?, ?, 1, NOW(), NULL)
       ON DUPLICATE KEY UPDATE
         group_name = VALUES(group_name),
         is_active = 1,
         last_verified_at = NOW(),
         last_error = NULL`,
      [groupName, verified.groupId],
    );

    res.json({
      message: 'เพิ่ม LINE group เรียบร้อยแล้ว',
      group_ref_id: result.insertId || null,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'เพิ่ม LINE group ไม่สำเร็จ' });
  }
});

app.put('/api/admin/line-notification-groups/:id', async (req, res) => {
  try {
    await ensureLineNotificationSchema();
    const groupRefId = toInt(req.params.id);
    if (!groupRefId) return res.status(400).json({ error: 'ไม่พบรหัส LINE group' });

    const groupId = req.body?.group_id ? assertLineGroupId(req.body.group_id) : '';
    let verified: { groupId: string; groupName: string } | null = null;
    if (groupId) verified = await verifyLineGroup(groupId);

    const groupName = String(req.body?.group_name || verified?.groupName || '').trim();
    const isActive = toBooleanFlag(req.body?.is_active);

    if (groupId) {
      await pool.query(
        `UPDATE line_notification_groups
         SET group_name = COALESCE(NULLIF(?, ''), group_name),
             group_id = ?,
             is_active = ?,
             last_verified_at = NOW(),
             last_error = NULL
         WHERE group_ref_id = ?`,
        [groupName, verified?.groupId || groupId, isActive, groupRefId],
      );
    } else {
      await pool.query(
        `UPDATE line_notification_groups
         SET group_name = COALESCE(NULLIF(?, ''), group_name),
             is_active = ?
         WHERE group_ref_id = ?`,
        [groupName, isActive, groupRefId],
      );
    }

    res.json({ message: 'บันทึก LINE group เรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'บันทึก LINE group ไม่สำเร็จ' });
  }
});

app.delete('/api/admin/line-notification-groups/:id', async (req, res) => {
  try {
    await ensureLineNotificationSchema();
    const groupRefId = toInt(req.params.id);
    if (!groupRefId) return res.status(400).json({ error: 'ไม่พบรหัส LINE group' });
    await pool.query('DELETE FROM line_notification_groups WHERE group_ref_id = ?', [groupRefId]);
    res.json({ message: 'ลบ LINE group เรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'ลบ LINE group ไม่สำเร็จ' });
  }
});

app.post('/api/admin/line-notifications/test', async (req, res) => {
  try {
    const groupRefId = toInt(req.body?.group_ref_id);
    if (!groupRefId) return res.status(400).json({ error: 'กรุณาเลือก LINE group ที่ต้องการทดสอบ' });
    const result = await sendLineTestToGroup(pool, {
      groupRefId,
      menuKey: String(req.body?.menu_key || 'line_test').trim(),
      message: String(req.body?.message || '').trim(),
    });
    res.json({ message: `ส่งข้อความทดสอบไปยัง ${result.group_name} เรียบร้อยแล้ว` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'ส่งข้อความทดสอบ LINE ไม่สำเร็จ' });
  }
});

// ตรวจสอบอีเมลสำหรับขอรีเซ็ตรหัสผ่าน
app.post('/api/users/forgot-password/check-email', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'กรุณากรอกอีเมลให้ถูกต้อง' });
    }

    const [users]: any = await pool.query(
      'SELECT user_id FROM user WHERE LOWER(email) = ? LIMIT 1',
      [email]
    );

    res.json({ exists: users.length > 0, email });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการตรวจสอบอีเมล' });
  }
});

// ส่งลิงก์รีเซ็ตรหัสผ่านไปยังอีเมลที่ลงทะเบียนไว้
app.post('/api/users/forgot-password/send-link', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'กรุณากรอกอีเมลให้ถูกต้อง' });
    }

    const [users]: any = await pool.query(
      'SELECT user_id, Name_Surnam, email FROM user WHERE LOWER(email) = ? LIMIT 1',
      [email]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'ไม่พบอีเมลนี้ในระบบ' });
    }

    await ensurePasswordResetTokensTable();

    const user = users[0];
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashResetToken(token);
    const resetLink = `${getAppBaseUrl(req)}/reset-password?token=${encodeURIComponent(token)}`;

    await pool.query(
      'UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL',
      [user.user_id]
    );
    await pool.query(
      `INSERT INTO password_reset_tokens
       (user_id, token_hash, expires_at, request_ip, user_agent)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), ?, ?)`,
      [
        user.user_id,
        tokenHash,
        PASSWORD_RESET_TOKEN_TTL_MINUTES,
        req.ip || '',
        String(req.headers['user-agent'] || '').slice(0, 500),
      ]
    );

    await sendPasswordResetEmail(user.email, user.Name_Surnam || null, resetLink);

    res.json({ message: 'ส่งลิงก์รีเซ็ตรหัสผ่านไปยังอีเมลเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    if (error instanceof Error && error.message.startsWith('SMTP configuration is incomplete')) {
      return res.status(500).json({
        error: `ยังไม่ได้ตั้งค่าอีเมลสำหรับส่งลิงก์รีเซ็ตรหัสผ่าน (${error.message.replace('SMTP configuration is incomplete: ', '')})`
      });
    }
    if (error instanceof Error && error.message === 'Nodemailer package is not installed') {
      return res.status(500).json({ error: 'ยังไม่ได้ติดตั้งแพ็กเกจ nodemailer ในฝั่งเซิร์ฟเวอร์' });
    }
    if (error instanceof Error && /Google Apps Script|ส่งอีเมลรีเซ็ต|Cannot call Google Apps Script/i.test(error.message)) {
      return res.status(500).json({ error: error.message });
    }
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการส่งลิงก์รีเซ็ตรหัสผ่าน' });
  }
});

// รีเซ็ตรหัสผ่านด้วย token จากอีเมล
app.post('/api/users/reset-password', async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    const newPassword = String(req.body?.newPassword || '');

    if (!token) {
      return res.status(400).json({ error: 'ไม่พบโทเคนสำหรับรีเซ็ตรหัสผ่าน' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'รหัสผ่านใหม่ควรมีความยาวอย่างน้อย 6 ตัวอักษร' });
    }

    await ensurePasswordResetTokensTable();

    const tokenHash = hashResetToken(token);
    const [tokens]: any = await pool.query(
      `SELECT token_id, user_id
       FROM password_reset_tokens
       WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );

    if (tokens.length === 0) {
      return res.status(400).json({ error: 'ลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้องหรือหมดอายุแล้ว' });
    }

    const resetToken = tokens[0];
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await pool.query('UPDATE user SET password = ? WHERE user_id = ?', [hashedPassword, resetToken.user_id]);
    await pool.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE token_id = ?', [resetToken.token_id]);

    res.json({ message: 'ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการรีเซ็ตรหัสผ่าน' });
  }
});

// ดึงข้อมูลโปรไฟล์ผู้ใช้
app.get('/api/users/profile/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await ensureProfileAvatarColumn();
    await ensureLineLoginSchema();
    const [rows]: any = await pool.query(
      `SELECT Name_Surnam as Name_Surname, position, type, Division_Province, Department,
              email, National_ID_number, username, avatar_data_url,
              line_user_id, line_display_name, line_picture_url, line_linked_at
       FROM user
       WHERE user_id = ?`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบข้อมูลผู้ใช้' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// อัปโหลดรูปประจำตัวไปยัง Google Drive ผ่าน Apps Script
app.post('/api/users/profile/avatar-drive', async (req, res) => {
  try {
    const {
      user_id,
      display_name,
      file_name,
      mime_type,
      base64,
    } = req.body || {};

    if (!base64 || typeof base64 !== 'string') {
      return res.status(400).json({ error: 'ไม่พบไฟล์รูปภาพที่ต้องการอัปโหลด' });
    }

    if (!mime_type || typeof mime_type !== 'string' || !SUPPORTED_AVATAR_MIME_RE.test(mime_type)) {
      return res.status(400).json({ error: 'ไฟล์ที่อัปโหลดต้องเป็นรูปภาพที่รองรับเท่านั้น' });
    }

    const normalizedBase64 = normalizeBase64Payload(base64);
    if (!normalizedBase64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalizedBase64)) {
      return res.status(400).json({ error: 'ข้อมูลรูปภาพไม่ถูกต้อง กรุณาเลือกรูปใหม่' });
    }

    const decodedBytes = getBase64DecodedByteLength(normalizedBase64);
    if (
      normalizedBase64.length > PROFILE_AVATAR_UPLOAD_MAX_BASE64_LENGTH ||
      decodedBytes > PROFILE_AVATAR_UPLOAD_MAX_BYTES
    ) {
      return res.status(413).json({ error: 'รูปประจำตัวมีขนาดใหญ่เกินไป กรุณาเลือกรูปใหม่หรือครอปรูปให้เล็กลง' });
    }

    const safeName = sanitizeAvatarFileName(display_name || user_id || 'user');
    const safeFileName = sanitizeAvatarFileName(file_name || `${safeName}-avatar.webp`);
    const parsed = await postToDriveScript({
      action: 'uploadAvatar',
      folderId: GOOGLE_DRIVE_AVATAR_FOLDER_ID,
      userId: user_id || '',
      displayName: display_name || '',
      fileName: `${Date.now()}-${safeFileName}`,
      mimeType: mime_type,
      base64: normalizedBase64,
    });

    if (parsed?.ok === false) {
      throw new Error(getAvatarUploadErrorMessage(parsed.error || 'อัปโหลดรูปไป Google Drive ไม่สำเร็จ'));
    }

    const uploadPayload = buildDriveUploadPayload(parsed);
    const avatarUrl =
      uploadPayload.fileProxyPath ||
      uploadPayload.thumbnailUrl ||
      uploadPayload.url ||
      uploadPayload.webViewLink ||
      uploadPayload.webContentLink;

    if (!avatarUrl && !uploadPayload.fileId) {
      throw new Error('Google Drive อัปโหลดสำเร็จไม่สมบูรณ์: ไม่พบ URL หรือรหัสไฟล์รูปประจำตัวกลับมา');
    }

    res.json({
      ok: true,
      ...uploadPayload,
      thumbnailUrl: avatarUrl || uploadPayload.thumbnailUrl || '',
      url: avatarUrl || uploadPayload.url || '',
    });
  } catch (error) {
    console.error('Upload avatar to Google Drive failed:', error);
    const message = error instanceof Error
      ? error.message
      : 'ไม่สามารถอัปโหลดรูปประจำตัวไปยัง Google Drive ได้';
    res.status(500).json({
      error: getAvatarUploadErrorMessage(truncateExternalMessage(message)),
    });
  }
});

// แสดงไฟล์จาก Google Drive ผ่าน backend เพื่อแก้กรณี thumbnail public ของ Drive ไม่แสดง
app.get('/api/google-drive/files/:fileId', async (req, res) => {
  try {
    const fileId = extractGoogleDriveFileId(req.params.fileId);
    if (!fileId) return res.status(400).send('Invalid Google Drive file id');

    const parsed = await postToDriveScript({
      action: 'getDriveFile',
      fileId,
    });

    if (parsed?.ok === false) {
      return res.status(404).send(parsed.error || 'Cannot load Google Drive file');
    }

    const mimeType = String(parsed.mimeType || 'application/octet-stream');
    const base64 = String(parsed.base64 || '');
    if (!base64) return res.status(404).send('Google Drive file is empty');

    const bytes = Buffer.from(base64, 'base64');
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Content-Length', bytes.length);
    res.send(bytes);
  } catch (error) {
    console.error(error);
    res.status(500).send(error instanceof Error ? error.message : 'Cannot load Google Drive file');
  }
});

// อัปโหลดรูปปกหลักสูตรไปยัง Google Drive ผ่าน Apps Script
app.post('/api/admin/training/cover-drive', async (req, res) => {
  try {
    const {
      course_title,
      file_name,
      mime_type,
      base64,
    } = req.body || {};

    if (!base64 || typeof base64 !== 'string') {
      return res.status(400).json({ error: 'ไม่พบไฟล์รูปปกที่ต้องการอัปโหลด' });
    }

    if (!mime_type || typeof mime_type !== 'string' || !mime_type.startsWith('image/')) {
      return res.status(400).json({ error: 'ไฟล์รูปปกต้องเป็นรูปภาพเท่านั้น' });
    }

    const safeCourseName = sanitizeAvatarFileName(course_title || 'training-course', 'training-course');
    const safeFileName = sanitizeAvatarFileName(file_name || `${safeCourseName}-cover.webp`, 'training-cover.webp');
    const parsed = await postToDriveScript({
      action: 'uploadAvatar',
      folderId: GOOGLE_DRIVE_AVATAR_FOLDER_ID,
      userId: 'training-cover',
      displayName: safeCourseName,
      fileName: `${Date.now()}-course-cover-${safeFileName}`,
      mimeType: mime_type,
      base64,
    });

    if (parsed?.ok === false) {
      throw new Error(getAvatarUploadErrorMessage(parsed.error || 'อัปโหลดรูปปกไป Google Drive ไม่สำเร็จ'));
    }

    const uploadPayload = buildDriveUploadPayload(parsed);
    if (!uploadPayload.fileId && !uploadPayload.fileProxyPath && !uploadPayload.webViewLink) {
      throw new Error('Google Apps Script อัปโหลดสำเร็จไม่สมบูรณ์: ไม่พบรหัสไฟล์หรือ URL จาก Google Drive กรุณา Deploy Apps Script เวอร์ชันล่าสุด');
    }

    res.json(uploadPayload);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error instanceof Error
        ? error.message
        : 'ไม่สามารถอัปโหลดรูปปกหลักสูตรไปยัง Google Drive ได้',
    });
  }
});

// อัปโหลดเอกสารประกอบหลักสูตรไปยัง Google Drive ผ่าน Apps Script
app.post('/api/admin/training/material-drive', async (req, res) => {
  try {
    const {
      course_title,
      file_name,
      mime_type,
      base64,
    } = req.body || {};

    if (!base64 || typeof base64 !== 'string') {
      return res.status(400).json({ error: 'ไม่พบไฟล์เอกสารที่ต้องการอัปโหลด' });
    }

    const safeCourseName = sanitizeAvatarFileName(course_title || 'training-course', 'training-course');
    const safeFileName = sanitizeAvatarFileName(file_name || `${safeCourseName}-material`, 'training-material');
    const parsed = await postToDriveScript({
      action: 'uploadAvatar',
      folderId: GOOGLE_DRIVE_AVATAR_FOLDER_ID,
      userId: 'training-material',
      displayName: safeCourseName,
      fileName: `${Date.now()}-course-material-${safeFileName}`,
      mimeType: String(mime_type || 'application/octet-stream'),
      base64,
    });

    if (parsed?.ok === false) {
      throw new Error(getAvatarUploadErrorMessage(parsed.error || 'อัปโหลดเอกสารไป Google Drive ไม่สำเร็จ'));
    }

    const uploadPayload = buildDriveUploadPayload(parsed);
    if (!uploadPayload.fileId && !uploadPayload.fileProxyPath && !uploadPayload.webViewLink) {
      throw new Error('Google Apps Script อัปโหลดสำเร็จไม่สมบูรณ์: ไม่พบรหัสไฟล์หรือ URL จาก Google Drive กรุณา Deploy Apps Script เวอร์ชันล่าสุด');
    }

    res.json(uploadPayload);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error instanceof Error
        ? error.message
        : 'ไม่สามารถอัปโหลดเอกสารประกอบไปยัง Google Drive ได้',
    });
  }
});

// ลบรูปประจำตัวเดิมออกจาก Google Drive
app.post('/api/users/profile/avatar-drive/delete', async (req, res) => {
  try {
    const { file_id, fileId, avatar_url, avatarUrl } = req.body || {};
    const target = file_id || fileId || avatar_url || avatarUrl;
    const result = await deleteAvatarFromGoogleDrive(target);
    res.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      ok: false,
      error: error instanceof Error
        ? error.message
        : 'ไม่สามารถลบรูปประจำตัวเดิมจาก Google Drive ได้',
    });
  }
});

// อัปเดตข้อมูลโปรไฟล์ผู้ใช้
app.put('/api/users/profile/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      Name_Surname, position, type, Division_Province, Department, email, National_ID_number, avatar_data_url
    } = req.body;

    if (!isValidAvatarDataUrl(avatar_data_url)) {
      return res.status(400).json({ error: 'รูปประจำตัวต้องเป็นไฟล์รูปภาพที่รองรับเท่านั้น' });
    }

    await ensureProfileAvatarColumn();
    await pool.query(
      `UPDATE user SET 
       Name_Surnam = ?, position = ?, type = ?, Division_Province = ?, 
       Department = ?, email = ?, National_ID_number = ?, avatar_data_url = ? 
       WHERE user_id = ?`,
      [Name_Surname, position, type, Division_Province, Department, email, National_ID_number, avatar_data_url || null, id]
    );

    res.json({ message: 'บันทึกข้อมูลเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
  }
});

// บันทึกข้อมูลกำกับติดตามการใช้งานโปรแกรมฯ
app.get('/api/monitor-records', async (req, res) => {
  try {
    await ensureMonitorRecordsTable();
    const userId = typeof req.query.user_id === 'string' ? Number(req.query.user_id) : null;
    const params: any[] = [];
    let where = '';
    if (userId && Number.isFinite(userId)) {
      where = 'WHERE user_id = ?';
      params.push(userId);
    }

    const [rows]: any = await pool.query(
      `SELECT record_id, user_id, payload, created_at, updated_at
       FROM monitor_records
       ${where}
       ORDER BY updated_at DESC, record_id DESC
       LIMIT 100`,
      params
    );

    res.json(rows.map((row: any) => ({
      record_id: row.record_id,
      user_id: row.user_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      payload: (() => {
        try { return JSON.parse(row.payload); } catch { return {}; }
      })(),
    })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลกำกับติดตาม' });
  }
});

app.post('/api/monitor-records', async (req, res) => {
  try {
    await ensureMonitorRecordsTable();
    const { user_id, payload } = req.body;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'ไม่พบข้อมูลที่ต้องการบันทึก' });
    }

    const [result]: any = await pool.query(
      'INSERT INTO monitor_records (user_id, payload) VALUES (?, ?)',
      [user_id || null, JSON.stringify(payload)]
    );
    res.json({ message: 'บันทึกข้อมูลกำกับติดตามเรียบร้อยแล้ว', record_id: result.insertId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการบันทึกข้อมูลกำกับติดตาม' });
  }
});

app.put('/api/monitor-records/:id', async (req, res) => {
  try {
    await ensureMonitorRecordsTable();
    const { id } = req.params;
    const { payload } = req.body;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'ไม่พบข้อมูลที่ต้องการแก้ไข' });
    }

    const [result]: any = await pool.query(
      'UPDATE monitor_records SET payload = ? WHERE record_id = ?',
      [JSON.stringify(payload), id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'ไม่พบรายการที่ต้องการแก้ไข' });
    res.json({ message: 'แก้ไขข้อมูลกำกับติดตามเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการแก้ไขข้อมูลกำกับติดตาม' });
  }
});

// Proxy ข้อมูล Google Sheets สำหรับหน้าบันทึกกำกับติดตามกลุ่มเทคฯ
app.get('/api/google-monitor-data', async (_req, res) => {
  try {
    const response = await fetch(GOOGLE_MONITOR_SCRIPT_URL, { method: 'GET', redirect: 'follow' });
    const text = await response.text();
    if (!response.ok) throw new Error(text || 'Cannot fetch Google Sheets data');
    res.type('application/json').send(text);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'ไม่สามารถดึงข้อมูลจาก Google Sheets ได้' });
  }
});

app.post('/api/google-monitor-data', async (req, res) => {
  try {
    const { row } = req.body;
    if (!row || typeof row !== 'object') {
      return res.status(400).json({ error: 'ไม่พบข้อมูลที่ต้องการบันทึกลง Google Sheets' });
    }

    const response = await fetch(GOOGLE_MONITOR_SCRIPT_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(req.body),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(text || 'Cannot write Google Sheets data');
    if (/script function not found|<!doctype|<html/i.test(text)) {
      throw new Error('Google Apps Script ยังไม่รองรับการบันทึกแบบ POST');
    }

    try {
      const parsed = JSON.parse(text);
      if (parsed?.ok === false) {
        throw new Error(parsed.error || 'Google Apps Script บันทึกข้อมูลไม่สำเร็จ');
      }
      res.json(parsed);
    } catch (parseOrScriptError) {
      if (parseOrScriptError instanceof Error && text.trim().startsWith('{')) {
        throw parseOrScriptError;
      }
      res.json({ message: 'บันทึกข้อมูลลง Google Sheets เรียบร้อยแล้ว', response: text });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error instanceof Error
        ? error.message
        : 'Google Apps Script ยังไม่มี doPost(e) สำหรับบันทึกข้อมูล กรุณาอัปเดตและ Deploy Apps Script ใหม่',
    });
  }
});

// ====== ACTIVITY CALENDAR ======

function activityEventToRange(row: any) {
  const start = Date.parse(`${String(row.start_at).replace(' ', 'T')}+07:00`);
  const end = Date.parse(`${String(row.end_at).replace(' ', 'T')}+07:00`);
  return {
    ...row,
    event_id: Number(row.event_id),
    created_by_user_id: Number(row.created_by_user_id),
    all_day: Number(row.all_day || 0),
    startMs: Number.isFinite(start) ? start : 0,
    endMs: Number.isFinite(end) ? end : 0,
  };
}

function attachActivityConflicts(rows: any[], currentUserId: number) {
  const events = rows.map(activityEventToRange);
  return events.map((event, index) => {
    const conflicts = events
      .filter((other, otherIndex) => (
        otherIndex !== index &&
        event.startMs < other.endMs &&
        event.endMs > other.startMs
      ))
      .map((other) => ({
        event_id: other.event_id,
        title: other.title,
        created_by_name: other.created_by_name,
      }));

    const { startMs: _startMs, endMs: _endMs, ...publicEvent } = event;
    return {
      ...publicEvent,
      has_conflict: conflicts.length > 0,
      conflicts,
      can_edit: event.source === 'system' && event.created_by_user_id === currentUserId,
    };
  });
}

const ACTIVITY_GOOGLE_RECONNECT_MESSAGE =
  'การเชื่อม Google Calendar หมดอายุหรือใช้ไม่ได้แล้ว กรุณากด "Google Calendar" เพื่อเชื่อมใหม่อีกครั้ง';

class ActivityGoogleReconnectRequiredError extends Error {
  constructor(message = ACTIVITY_GOOGLE_RECONNECT_MESSAGE) {
    super(message);
    this.name = 'ActivityGoogleReconnectRequiredError';
  }
}

function isActivityGoogleReconnectRequired(error: unknown) {
  return error instanceof ActivityGoogleReconnectRequiredError;
}

function getGoogleApiErrorMessage(payload: any, fallback: string) {
  return String(payload?.error?.message || payload?.error_description || payload?.error || fallback || '');
}

function isGoogleCalendarAuthFailure(status: number, payload: any) {
  const message = getGoogleApiErrorMessage(payload, '').toLowerCase();
  return (
    status === 401 ||
    message.includes('invalid authentication') ||
    message.includes('invalid credentials') ||
    message.includes('invalid_grant') ||
    message.includes('invalid_client') ||
    message.includes('unauthorized')
  );
}

async function clearActivityGoogleConnection(userId: number) {
  await pool.query("DELETE FROM activity_events WHERE created_by_user_id = ? AND source = 'google'", [userId]);
  await pool.query('DELETE FROM activity_google_connections WHERE user_id = ?', [userId]);
}

async function getActivityGoogleAccessToken(connection: any, config: ReturnType<typeof getGoogleCalendarConfig>) {
  const now = Date.now();
  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0;
  if (connection.access_token_encrypted && expiresAt - now > 60_000) {
    return decryptActivityToken(connection.access_token_encrypted, config.tokenSecret);
  }

  const refreshToken = decryptActivityToken(connection.refresh_token_encrypted, config.tokenSecret);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const tokenData: any = await response.json();
  if (!response.ok || !tokenData.access_token) {
    if (isGoogleCalendarAuthFailure(response.status, tokenData)) {
      throw new ActivityGoogleReconnectRequiredError();
    }
    throw new Error(getGoogleApiErrorMessage(tokenData, 'ไม่สามารถต่ออายุ Google Calendar token ได้'));
  }

  const expiresIn = Math.max(60, toInt(tokenData.expires_in, 3600));
  const tokenExpiresAt = formatBangkokDateTime(new Date(Date.now() + expiresIn * 1000));
  await pool.query(
    `UPDATE activity_google_connections
     SET access_token_encrypted = ?, token_expires_at = ?
     WHERE connection_id = ?`,
    [
      encryptActivityToken(tokenData.access_token, config.tokenSecret),
      tokenExpiresAt,
      connection.connection_id,
    ],
  );
  return tokenData.access_token;
}

app.post('/api/admin/setup-activity-calendar-tables', async (_req, res) => {
  try {
    await ensureActivityCalendarTables();
    await ensureDefaultMenuItems();
    res.json({ message: 'ตารางกิจกรรมถูกสร้างเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการสร้างตารางกิจกรรม' });
  }
});

app.get('/api/activity-calendar/events', async (req, res) => {
  try {
    await ensureActivityCalendarTables();
    const userId = toInt(req.query.user_id);
    if (!userId) return res.status(400).json({ error: 'ไม่พบรหัสผู้ใช้งาน' });

    const now = new Date();
    const defaultStart = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01 00:00:00`;
    const defaultEndDate = new Date(now.getFullYear(), now.getMonth() + 2, 1);
    const defaultEnd = `${defaultEndDate.getFullYear()}-${pad2(defaultEndDate.getMonth() + 1)}-01 00:00:00`;
    const startAt = toMysqlLocalDateTime(req.query.start) || defaultStart;
    const endAt = toMysqlLocalDateTime(req.query.end) || defaultEnd;

    const [rows]: any = await pool.query(
      `SELECT
         e.event_id, e.title, e.description, e.location,
         DATE_FORMAT(e.start_at, '%Y-%m-%dT%H:%i:%s') AS start_at,
         DATE_FORMAT(e.end_at, '%Y-%m-%dT%H:%i:%s') AS end_at,
         e.all_day, e.color, e.source, e.visibility,
         e.created_by_user_id,
         COALESCE(NULLIF(e.created_by_name, ''), u.Name_Surnam, '') AS created_by_name,
         e.google_html_link,
         DATE_FORMAT(e.created_at, '%Y-%m-%dT%H:%i:%s') AS created_at,
         DATE_FORMAT(e.updated_at, '%Y-%m-%dT%H:%i:%s') AS updated_at
       FROM activity_events e
       LEFT JOIN user u ON u.user_id = e.created_by_user_id
       WHERE e.end_at > ?
         AND e.start_at < ?
         AND (e.visibility = 'org' OR e.created_by_user_id = ?)
       ORDER BY e.start_at ASC, e.end_at ASC, e.event_id ASC`,
      [startAt, endAt, userId],
    );

    const [connections]: any = await pool.query(
      `SELECT connection_id, google_email, sync_enabled,
              DATE_FORMAT(last_synced_at, '%Y-%m-%dT%H:%i:%s') AS last_synced_at
       FROM activity_google_connections
       WHERE user_id = ?
       LIMIT 1`,
      [userId],
    );

    res.json({
      events: attachActivityConflicts(rows, userId),
      google: connections[0] || null,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'ไม่สามารถดึงตารางกิจกรรมได้' });
  }
});

app.post('/api/activity-calendar/events', async (req, res) => {
  try {
    await ensureActivityCalendarTables();
    const body = req.body || {};
    const userId = toInt(body.user_id);
    const title = String(body.title || '').trim();
    const startAt = toMysqlLocalDateTime(body.start_at);
    const endAt = toMysqlLocalDateTime(body.end_at);
    const allDay = toBooleanFlag(body.all_day);
    if (!userId) return res.status(400).json({ error: 'ไม่พบรหัสผู้ใช้งาน' });
    if (!title) return res.status(400).json({ error: 'กรุณาระบุชื่อกิจกรรม' });
    if (!startAt || !endAt || Date.parse(`${endAt.replace(' ', 'T')}+07:00`) <= Date.parse(`${startAt.replace(' ', 'T')}+07:00`)) {
      return res.status(400).json({ error: 'กรุณาระบุเวลาเริ่มและเวลาสิ้นสุดให้ถูกต้อง' });
    }

    const [users]: any = await pool.query('SELECT Name_Surnam FROM user WHERE user_id = ? LIMIT 1', [userId]);
    if (users.length === 0) return res.status(404).json({ error: 'ไม่พบผู้ใช้งาน' });

    const [result]: any = await pool.query(
      `INSERT INTO activity_events
       (title, description, location, start_at, end_at, all_day, color,
        source, visibility, created_by_user_id, created_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'system', 'org', ?, ?)`,
      [
        title,
        String(body.description || '').trim(),
        String(body.location || '').trim(),
        startAt,
        endAt,
        allDay,
        String(body.color || '#3b82f6').trim() || '#3b82f6',
        userId,
        String(users[0].Name_Surnam || '').trim(),
      ],
    );
    await sendLineTopicNotification(pool, {
      menuKey: 'activity_calendar',
      sourceType: 'activity_event',
      sourceId: result.insertId,
      title,
      description: String(body.description || '').trim(),
      href: `/activity-calendar?date=${startAt.slice(0, 10)}&event=${result.insertId}`,
    });
    res.json({ message: 'เพิ่มกิจกรรมเรียบร้อยแล้ว', event_id: result.insertId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เพิ่มกิจกรรมไม่สำเร็จ' });
  }
});

app.put('/api/activity-calendar/events/:id', async (req, res) => {
  try {
    await ensureActivityCalendarTables();
    const eventId = toInt(req.params.id);
    const body = req.body || {};
    const userId = toInt(body.user_id);
    const title = String(body.title || '').trim();
    const startAt = toMysqlLocalDateTime(body.start_at);
    const endAt = toMysqlLocalDateTime(body.end_at);
    if (!eventId || !userId) return res.status(400).json({ error: 'ข้อมูลกิจกรรมไม่ครบถ้วน' });
    if (!title) return res.status(400).json({ error: 'กรุณาระบุชื่อกิจกรรม' });
    if (!startAt || !endAt || Date.parse(`${endAt.replace(' ', 'T')}+07:00`) <= Date.parse(`${startAt.replace(' ', 'T')}+07:00`)) {
      return res.status(400).json({ error: 'กรุณาระบุเวลาเริ่มและเวลาสิ้นสุดให้ถูกต้อง' });
    }

    const [rows]: any = await pool.query(
      'SELECT event_id FROM activity_events WHERE event_id = ? AND created_by_user_id = ? AND source = "system" LIMIT 1',
      [eventId, userId],
    );
    if (rows.length === 0) return res.status(403).json({ error: 'แก้ไขได้เฉพาะกิจกรรมที่คุณสร้างเท่านั้น' });

    await pool.query(
      `UPDATE activity_events SET
       title = ?, description = ?, location = ?, start_at = ?, end_at = ?,
       all_day = ?, color = ?
       WHERE event_id = ?`,
      [
        title,
        String(body.description || '').trim(),
        String(body.location || '').trim(),
        startAt,
        endAt,
        toBooleanFlag(body.all_day),
        String(body.color || '#3b82f6').trim() || '#3b82f6',
        eventId,
      ],
    );
    res.json({ message: 'แก้ไขกิจกรรมเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'แก้ไขกิจกรรมไม่สำเร็จ' });
  }
});

app.delete('/api/activity-calendar/events/:id', async (req, res) => {
  try {
    await ensureActivityCalendarTables();
    const eventId = toInt(req.params.id);
    const userId = toInt(req.query.user_id || req.body?.user_id);
    if (!eventId || !userId) return res.status(400).json({ error: 'ข้อมูลกิจกรรมไม่ครบถ้วน' });
    const [result]: any = await pool.query(
      'DELETE FROM activity_events WHERE event_id = ? AND created_by_user_id = ? AND source = "system"',
      [eventId, userId],
    );
    if (result.affectedRows === 0) return res.status(403).json({ error: 'ลบได้เฉพาะกิจกรรมที่คุณสร้างเท่านั้น' });
    res.json({ message: 'ลบกิจกรรมเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'ลบกิจกรรมไม่สำเร็จ' });
  }
});

app.get('/api/activity-calendar/google/connect-url', async (req, res) => {
  try {
    await ensureActivityCalendarTables();
    const userId = toInt(req.query.user_id);
    if (!userId) return res.status(400).json({ error: 'ไม่พบรหัสผู้ใช้งาน' });
    const config = getGoogleCalendarConfig();
    const state = signActivityState({ userId, ts: Date.now() }, config.tokenSecret);
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', config.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'https://www.googleapis.com/auth/calendar.readonly');
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('state', state);
    res.json({ url: url.toString() });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'สร้างลิงก์เชื่อม Google Calendar ไม่สำเร็จ' });
  }
});

app.get('/api/activity-calendar/google/callback', async (req, res) => {
  try {
    await ensureActivityCalendarTables();
    const code = String(req.query.code || '');
    const state = String(req.query.state || '');
    const config = getGoogleCalendarConfig();
    const statePayload = verifyActivityState(state, config.tokenSecret);
    if (!code || !statePayload) throw new Error('Google OAuth state ไม่ถูกต้องหรือหมดอายุ');

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData: any = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) {
      throw new Error(tokenData.error_description || tokenData.error || 'เชื่อม Google Calendar ไม่สำเร็จ');
    }

    const [existingRows]: any = await pool.query(
      'SELECT refresh_token_encrypted FROM activity_google_connections WHERE user_id = ? LIMIT 1',
      [statePayload.userId],
    );
    const refreshToken = tokenData.refresh_token
      ? String(tokenData.refresh_token)
      : existingRows[0]?.refresh_token_encrypted
        ? decryptActivityToken(existingRows[0].refresh_token_encrypted, config.tokenSecret)
        : '';
    if (!refreshToken) throw new Error('Google ไม่ส่ง refresh token กลับมา กรุณาลองเชื่อมใหม่อีกครั้ง');

    let googleEmail = '';
    try {
      const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const profile: any = await profileResponse.json();
      googleEmail = String(profile.email || '');
    } catch { /* ignore profile lookup */ }

    const expiresIn = Math.max(60, toInt(tokenData.expires_in, 3600));
    await pool.query(
      `INSERT INTO activity_google_connections
       (user_id, google_email, access_token_encrypted, refresh_token_encrypted, token_expires_at, sync_enabled)
       VALUES (?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         google_email = VALUES(google_email),
         access_token_encrypted = VALUES(access_token_encrypted),
         refresh_token_encrypted = VALUES(refresh_token_encrypted),
         token_expires_at = VALUES(token_expires_at),
         sync_enabled = 1`,
      [
        statePayload.userId,
        googleEmail,
        encryptActivityToken(String(tokenData.access_token), config.tokenSecret),
        encryptActivityToken(refreshToken, config.tokenSecret),
        formatBangkokDateTime(new Date(Date.now() + expiresIn * 1000)),
      ],
    );

    res.redirect(`${getAppBaseUrl(req)}/activity-calendar?google=connected`);
  } catch (error) {
    console.error(error);
    res.redirect(`${getAppBaseUrl(req)}/activity-calendar?google=error`);
  }
});

app.post('/api/activity-calendar/google/sync', async (req, res) => {
  let userId = 0;
  try {
    await ensureActivityCalendarTables();
    userId = toInt(req.body?.user_id);
    if (!userId) return res.status(400).json({ error: 'ไม่พบรหัสผู้ใช้งาน' });
    const config = getGoogleCalendarConfig();
    const [connections]: any = await pool.query(
      `SELECT * FROM activity_google_connections WHERE user_id = ? AND sync_enabled = 1 LIMIT 1`,
      [userId],
    );
    if (connections.length === 0) return res.status(404).json({ error: 'ยังไม่ได้เชื่อม Google Calendar' });

    const accessToken = await getActivityGoogleAccessToken(connections[0], config);
    const lookbackDays = Math.max(0, toInt(process.env.GOOGLE_CALENDAR_SYNC_LOOKBACK_DAYS, 30));
    const lookaheadDays = Math.max(1, toInt(process.env.GOOGLE_CALENDAR_SYNC_LOOKAHEAD_DAYS, 365));
    const timeMinDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
    const timeMaxDate = new Date(Date.now() + lookaheadDays * 24 * 60 * 60 * 1000);
    const calendarListResponse = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const calendarListData: any = await calendarListResponse.json();
    if (!calendarListResponse.ok) {
      if (isGoogleCalendarAuthFailure(calendarListResponse.status, calendarListData)) {
        throw new ActivityGoogleReconnectRequiredError();
      }
      throw new Error(getGoogleApiErrorMessage(calendarListData, 'ดึงรายการ Google Calendar ไม่สำเร็จ'));
    }

    const googleEmail = connections[0].google_email || 'Google Calendar';
    const calendars = (calendarListData.items || [])
      .filter((calendar: any) => calendar.selected !== false && calendar.hidden !== true)
      .map((calendar: any) => ({
        id: String(calendar.id || 'primary'),
        summary: String(calendar.summary || calendar.id || 'Google Calendar'),
        color: normalizeGoogleCalendarColor(calendar.backgroundColor),
        primary: Boolean(calendar.primary),
      }));

    if (!calendars.some((calendar: any) => calendar.primary || calendar.id === 'primary')) {
      calendars.unshift({ id: 'primary', summary: googleEmail, color: '#22c55e', primary: true });
    }

    const startWindow = formatBangkokDateTime(timeMinDate);
    const endWindow = formatBangkokDateTime(timeMaxDate);
    await pool.query(
      `DELETE FROM activity_events
       WHERE created_by_user_id = ? AND source = 'google' AND start_at < ? AND end_at > ?`,
      [userId, endWindow, startWindow],
    );

    let inserted = 0;
    for (const calendar of calendars) {
      const eventsUrl = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events`);
      eventsUrl.searchParams.set('timeMin', timeMinDate.toISOString());
      eventsUrl.searchParams.set('timeMax', timeMaxDate.toISOString());
      eventsUrl.searchParams.set('singleEvents', 'true');
      eventsUrl.searchParams.set('orderBy', 'startTime');
      eventsUrl.searchParams.set('maxResults', '2500');
      const calendarResponse = await fetch(eventsUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const calendarData: any = await calendarResponse.json();
      if (!calendarResponse.ok) {
        console.warn('Google Calendar sync skipped calendar', calendar.id, calendarData.error?.message || calendarData.error);
        continue;
      }

      for (const event of calendarData.items || []) {
        if (event.status === 'cancelled') continue;
        const { allDay, startAt, endAt } = buildGoogleEventRange(event);
        if (!event.id || !startAt || !endAt) continue;

        await pool.query(
          `INSERT INTO activity_events
           (title, description, location, start_at, end_at, all_day, color,
            source, visibility, created_by_user_id, created_by_name,
            google_calendar_id, google_event_id, google_html_link)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'google', 'private', ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             title = VALUES(title),
             description = VALUES(description),
             location = VALUES(location),
             start_at = VALUES(start_at),
             end_at = VALUES(end_at),
             all_day = VALUES(all_day),
             color = VALUES(color),
             created_by_name = VALUES(created_by_name),
             google_html_link = VALUES(google_html_link)`,
          [
            String(event.summary || '(ไม่มีชื่อกิจกรรม)').trim(),
            String(event.description || '').trim(),
            String(event.location || '').trim(),
            startAt,
            endAt,
            allDay ? 1 : 0,
            calendar.color,
            userId,
            calendar.summary || googleEmail,
            calendar.id,
            String(event.id),
            String(event.htmlLink || ''),
          ],
        );
        inserted += 1;
      }
    }

    await pool.query('UPDATE activity_google_connections SET last_synced_at = NOW() WHERE user_id = ?', [userId]);
    res.json({ message: 'ซิงก์ Google Calendar เรียบร้อยแล้ว', synced_count: inserted, calendar_count: calendars.length });
  } catch (error) {
    console.error(error);
    if (isActivityGoogleReconnectRequired(error)) {
      if (userId) await clearActivityGoogleConnection(userId);
      return res.status(401).json({
        error: error.message,
        reconnect_required: true,
      });
    }
    res.status(500).json({ error: error instanceof Error ? error.message : 'ซิงก์ Google Calendar ไม่สำเร็จ' });
  }
});

app.delete('/api/activity-calendar/google/disconnect', async (req, res) => {
  try {
    await ensureActivityCalendarTables();
    const userId = toInt(req.query.user_id || req.body?.user_id);
    if (!userId) return res.status(400).json({ error: 'ไม่พบรหัสผู้ใช้งาน' });
    await pool.query('DELETE FROM activity_events WHERE created_by_user_id = ? AND source = "google"', [userId]);
    await pool.query('DELETE FROM activity_google_connections WHERE user_id = ?', [userId]);
    res.json({ message: 'ยกเลิกการเชื่อม Google Calendar แล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'ยกเลิกการเชื่อม Google Calendar ไม่สำเร็จ' });
  }
});

// ====== KNOWLEDGE BASE ======

app.post('/api/admin/setup-knowledge-tables', async (_req, res) => {
  try {
    await ensureKnowledgeTables();
    await ensureDefaultMenuItems();
    res.json({ message: 'ตารางคลังความรู้ถูกสร้างเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการสร้างตารางคลังความรู้' });
  }
});

app.get('/api/notifications', async (req, res) => {
  try {
    await ensureKnowledgeTables();
    await ensureActivityCalendarTables();
    await ensureMeetingReportTables();
    await ensureNotificationTables();

    const userId = toInt(req.query.user_id);
    if (!userId) return res.status(400).json({ error: 'ไม่พบรหัสผู้ใช้งาน' });

    const [knowledgeRows]: any = await pool.query(
      `SELECT
         'knowledge' AS notification_type,
         i.item_id AS source_id,
         i.title AS title,
         COALESCE(NULLIF(i.category, ''), 'คลังความรู้') AS subtitle,
         CONCAT('/knowledge/', i.item_id) AS href,
         DATE_FORMAT(COALESCE(i.published_at, i.created_at), '%Y-%m-%dT%H:%i:%s') AS sort_at,
         DATE_FORMAT(COALESCE(i.published_at, i.created_at), '%Y-%m-%dT%H:%i:%s') AS created_at
       FROM knowledge_items i
       LEFT JOIN user_notification_reads r
         ON r.user_id = ?
        AND r.notification_type = 'knowledge'
        AND r.source_id = i.item_id
       LEFT JOIN knowledge_reading_logs l
         ON l.user_id = ?
        AND l.item_id = i.item_id
       WHERE i.status = 'published'
         AND r.read_id IS NULL
         AND l.log_id IS NULL
       ORDER BY COALESCE(i.published_at, i.created_at) DESC
       LIMIT 40`,
      [userId, userId],
    );

    const [activityRows]: any = await pool.query(
      `SELECT
         'activity' AS notification_type,
         e.event_id AS source_id,
         e.title AS title,
         CONCAT(
           CASE
             WHEN e.all_day = 1 THEN 'ทั้งวัน'
             ELSE DATE_FORMAT(e.start_at, '%H:%i')
           END,
           ' · เพิ่มโดย ',
           COALESCE(NULLIF(e.created_by_name, ''), u.Name_Surnam, 'ไม่ระบุ')
         ) AS subtitle,
         CONCAT('/activity-calendar?date=', DATE_FORMAT(e.start_at, '%Y-%m-%d'), '&event=', e.event_id) AS href,
         DATE_FORMAT(e.created_at, '%Y-%m-%dT%H:%i:%s') AS sort_at,
         DATE_FORMAT(e.created_at, '%Y-%m-%dT%H:%i:%s') AS created_at
       FROM activity_events e
       LEFT JOIN user u ON u.user_id = e.created_by_user_id
       LEFT JOIN user_notification_reads r
         ON r.user_id = ?
        AND r.notification_type = 'activity'
        AND r.source_id = e.event_id
       WHERE e.source = 'system'
         AND e.visibility = 'org'
         AND r.read_id IS NULL
       ORDER BY e.created_at DESC
       LIMIT 40`,
      [userId],
    );

    const [meetingReportRows]: any = await pool.query(
      `SELECT
         'meeting_report' AS notification_type,
         mr.report_id AS source_id,
         mr.title AS title,
         CONCAT('รายงานการประชุม', CASE WHEN mr.section = 'area' THEN 'สำนักงานในพื้นที่' ELSE 'สำนักงาน' END) AS subtitle,
         CONCAT('/meeting-reports/', mr.report_id) AS href,
         DATE_FORMAT(COALESCE(mr.published_at, mr.updated_at), '%Y-%m-%dT%H:%i:%s') AS sort_at,
         DATE_FORMAT(COALESCE(mr.published_at, mr.updated_at), '%Y-%m-%dT%H:%i:%s') AS created_at
       FROM meeting_reports mr
       LEFT JOIN user_notification_reads r
         ON r.user_id = ?
        AND r.notification_type = 'meeting_report'
        AND r.source_id = mr.report_id
       LEFT JOIN meeting_report_read_logs l
         ON l.user_id = ?
        AND l.report_id = mr.report_id
       WHERE mr.status = 'published'
         AND r.read_id IS NULL
         AND l.log_id IS NULL
         AND EXISTS (
           SELECT 1
           FROM user u
           INNER JOIN group_permissions gp ON gp.group_id = u.user_status AND gp.can_view = 1
           INNER JOIN menu_items m ON m.menu_id = gp.menu_id AND m.is_active = 1
           WHERE u.user_id = ?
             AND m.menu_key = CASE WHEN mr.section = 'area' THEN 'meeting_reports_area' ELSE 'meeting_reports_office' END
           LIMIT 1
         )
       ORDER BY COALESCE(mr.published_at, mr.updated_at) DESC
       LIMIT 40`,
      [userId, userId, userId],
    );

    const rows = [...knowledgeRows, ...activityRows, ...meetingReportRows]
      .sort((a: any, b: any) => {
        const aTime = Date.parse(String(a.sort_at || a.created_at || '').replace(' ', 'T'));
        const bTime = Date.parse(String(b.sort_at || b.created_at || '').replace(' ', 'T'));
        return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
      })
      .slice(0, 40);

    res.json(rows.map((row: any) => ({
      id: `${row.notification_type}:${row.source_id}`,
      type: row.notification_type,
      source_id: Number(row.source_id),
      title: row.title || '',
      subtitle: row.subtitle || '',
      href: row.href || '/index',
      created_at: row.created_at || '',
    })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'ไม่สามารถดึงข้อมูลแจ้งเตือนได้' });
  }
});

app.post('/api/notifications/read', async (req, res) => {
  try {
    await ensureNotificationTables();
    const userId = toInt(req.body.user_id);
    const sourceId = toInt(req.body.source_id);
    const notificationType = String(req.body.notification_type || '').trim();
    if (!userId || !sourceId || !['knowledge', 'activity', 'meeting_report'].includes(notificationType)) {
      return res.status(400).json({ error: 'ข้อมูลแจ้งเตือนไม่ครบถ้วน' });
    }

    await pool.query(
      `INSERT INTO user_notification_reads (user_id, notification_type, source_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE read_at = CURRENT_TIMESTAMP`,
      [userId, notificationType, sourceId],
    );
    res.json({ message: 'อ่านแจ้งเตือนแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'บันทึกสถานะแจ้งเตือนไม่สำเร็จ' });
  }
});

app.get('/api/knowledge/items', async (_req, res) => {
  try {
    await ensureKnowledgeTables();
    const [rows]: any = await pool.query(`
      SELECT item_id, title, category, description, cover_url, cover_file_id,
             published_at, view_count, sort_order, updated_at
      FROM knowledge_items
      WHERE status = 'published'
      ORDER BY sort_order ASC, COALESCE(published_at, updated_at) DESC, item_id DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'ไม่สามารถดึงข้อมูลคลังความรู้ได้' });
  }
});

app.get('/api/knowledge/items/:id', async (req, res) => {
  try {
    await ensureKnowledgeTables();
    const itemId = toInt(req.params.id);
    const [rows]: any = await pool.query(
      `SELECT item_id, title, category, description, cover_url, cover_file_id,
              pdf_url, pdf_file_id, published_at, view_count, sort_order, updated_at
       FROM knowledge_items
       WHERE item_id = ? AND status = 'published'
       LIMIT 1`,
      [itemId],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'ไม่พบเรื่องในคลังความรู้' });
    const item = rows[0];
    res.json({
      ...item,
      pdf_proxy_url: item.pdf_file_id ? buildDriveProxyPath(item.pdf_file_id) : '',
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'ไม่สามารถดึงรายละเอียดคลังความรู้ได้' });
  }
});

app.post('/api/knowledge/items/:id/read/start', async (req, res) => {
  try {
    await ensureKnowledgeTables();
    const itemId = toInt(req.params.id);
    const userId = toInt(req.body.user_id);
    const sessionId = toInt(req.body.session_id);
    if (!userId) return res.status(400).json({ error: 'ไม่พบรหัสผู้ใช้งาน' });

    const [items]: any = await pool.query(
      'SELECT item_id FROM knowledge_items WHERE item_id = ? AND status = "published" LIMIT 1',
      [itemId],
    );
    if (items.length === 0) return res.status(404).json({ error: 'ไม่พบเรื่องในคลังความรู้' });

    const [result]: any = await pool.query(
      'INSERT INTO knowledge_reading_logs (item_id, user_id, session_id, start_time) VALUES (?, ?, ?, NOW())',
      [itemId, userId, sessionId || null],
    );
    await pool.query('UPDATE knowledge_items SET view_count = view_count + 1 WHERE item_id = ?', [itemId]);
    res.json({ message: 'เริ่มบันทึกการอ่านแล้ว', log_id: result.insertId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เริ่มบันทึกการอ่านไม่สำเร็จ' });
  }
});

app.post('/api/knowledge/read-logs/:logId/time', async (req, res) => {
  try {
    await ensureKnowledgeTables();
    const logId = toInt(req.params.logId);
    const userId = toInt(req.body.user_id);
    const seconds = Math.max(0, Math.min(toInt(req.body.seconds), 60));
    if (!logId || seconds <= 0) return res.json({ message: 'ไม่มีเวลาที่ต้องบันทึก' });

    const params = userId
      ? [seconds, logId, userId]
      : [seconds, logId];
    const userClause = userId ? 'AND user_id = ?' : '';
    await pool.query(
      `UPDATE knowledge_reading_logs
       SET active_seconds = active_seconds + ?, end_time = NOW()
       WHERE log_id = ? ${userClause}`,
      params,
    );
    res.json({ message: 'บันทึกเวลาอ่านเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'บันทึกเวลาอ่านไม่สำเร็จ' });
  }
});

app.get('/api/admin/knowledge/items', async (_req, res) => {
  try {
    await ensureKnowledgeTables();
    const [rows]: any = await pool.query(`
      SELECT *
      FROM knowledge_items
      ORDER BY sort_order ASC, updated_at DESC, item_id DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'ไม่สามารถดึงข้อมูลคลังความรู้ได้' });
  }
});

app.post('/api/admin/knowledge/items', async (req, res) => {
  try {
    await ensureKnowledgeTables();
    const body = req.body || {};
    const title = String(body.title || '').trim();
    if (!title) return res.status(400).json({ error: 'กรุณาระบุชื่อเรื่อง' });
    const status = normalizeKnowledgeStatus(body.status);
    const coverUrl = String(body.cover_url || '').trim();
    const pdfUrl = String(body.pdf_url || '').trim();

    const [result]: any = await pool.query(
      `INSERT INTO knowledge_items
       (title, category, description, status, cover_url, cover_file_id, pdf_url, pdf_file_id,
        published_at, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${status === 'published' ? 'NOW()' : 'NULL'}, ?)`,
      [
        title,
        String(body.category || '').trim(),
        String(body.description || '').trim(),
        status,
        coverUrl,
        String(body.cover_file_id || extractGoogleDriveFileId(coverUrl) || '').trim(),
        pdfUrl,
        String(body.pdf_file_id || extractGoogleDriveFileId(pdfUrl) || '').trim(),
        toInt(body.sort_order),
      ],
    );
    if (status === 'published') {
      await sendLineTopicNotification(pool, {
        menuKey: 'knowledge',
        sourceType: 'knowledge_item',
        sourceId: result.insertId,
        title,
        description: String(body.description || '').trim(),
        href: `/knowledge/${result.insertId}`,
      });
    }
    res.json({ message: 'เพิ่มเรื่องในคลังความรู้เรียบร้อยแล้ว', item_id: result.insertId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เพิ่มเรื่องในคลังความรู้ไม่สำเร็จ' });
  }
});

app.put('/api/admin/knowledge/items/:id', async (req, res) => {
  try {
    await ensureKnowledgeTables();
    const itemId = toInt(req.params.id);
    const body = req.body || {};
    const title = String(body.title || '').trim();
    if (!title) return res.status(400).json({ error: 'กรุณาระบุชื่อเรื่อง' });
    const status = normalizeKnowledgeStatus(body.status);
    const coverUrl = String(body.cover_url || '').trim();
    const pdfUrl = String(body.pdf_url || '').trim();

    const [existing]: any = await pool.query(
      'SELECT status FROM knowledge_items WHERE item_id = ? LIMIT 1',
      [itemId],
    );
    const wasPublished = existing[0]?.status === 'published';

    await pool.query(
      `UPDATE knowledge_items SET
       title = ?, category = ?, description = ?, status = ?,
       cover_url = ?, cover_file_id = ?, pdf_url = ?, pdf_file_id = ?,
       sort_order = ?,
       published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, NOW()) ELSE published_at END
       WHERE item_id = ?`,
      [
        title,
        String(body.category || '').trim(),
        String(body.description || '').trim(),
        status,
        coverUrl,
        String(body.cover_file_id || extractGoogleDriveFileId(coverUrl) || '').trim(),
        pdfUrl,
        String(body.pdf_file_id || extractGoogleDriveFileId(pdfUrl) || '').trim(),
        toInt(body.sort_order),
        status,
        itemId,
      ],
    );
    if (!wasPublished && status === 'published') {
      await sendLineTopicNotification(pool, {
        menuKey: 'knowledge',
        sourceType: 'knowledge_item',
        sourceId: itemId,
        title,
        description: String(body.description || '').trim(),
        href: `/knowledge/${itemId}`,
      });
    }
    res.json({ message: 'แก้ไขเรื่องในคลังความรู้เรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'แก้ไขเรื่องในคลังความรู้ไม่สำเร็จ' });
  }
});

app.delete('/api/admin/knowledge/items/:id', async (req, res) => {
  try {
    await ensureKnowledgeTables();
    await pool.query('DELETE FROM knowledge_items WHERE item_id = ?', [req.params.id]);
    res.json({ message: 'ลบเรื่องในคลังความรู้เรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'ลบเรื่องในคลังความรู้ไม่สำเร็จ' });
  }
});

app.post('/api/admin/knowledge/cover-drive', async (req, res) => {
  try {
    const { item_title, file_name, mime_type, base64 } = req.body || {};
    if (!base64 || typeof base64 !== 'string') {
      return res.status(400).json({ error: 'ไม่พบไฟล์รูปปกที่ต้องการอัปโหลด' });
    }
    if (!mime_type || typeof mime_type !== 'string' || !mime_type.startsWith('image/')) {
      return res.status(400).json({ error: 'ไฟล์รูปปกต้องเป็นรูปภาพเท่านั้น' });
    }

    const safeItemName = sanitizeAvatarFileName(item_title || 'knowledge-item', 'knowledge-item');
    const safeFileName = sanitizeAvatarFileName(file_name || `${safeItemName}-cover.webp`, 'knowledge-cover.webp');
    const parsed = await postToDriveScript({
      action: 'uploadAvatar',
      folderId: GOOGLE_DRIVE_AVATAR_FOLDER_ID,
      userId: 'knowledge-cover',
      displayName: safeItemName,
      fileName: `${Date.now()}-knowledge-cover-${safeFileName}`,
      mimeType: mime_type,
      base64,
    });

    if (parsed?.ok === false) {
      throw new Error(getAvatarUploadErrorMessage(parsed.error || 'อัปโหลดรูปปกไป Google Drive ไม่สำเร็จ'));
    }

    const uploadPayload = buildDriveUploadPayload(parsed);
    if (!uploadPayload.fileId && !uploadPayload.fileProxyPath && !uploadPayload.webViewLink) {
      throw new Error('Google Apps Script อัปโหลดสำเร็จไม่สมบูรณ์: ไม่พบรหัสไฟล์หรือ URL จาก Google Drive กรุณา Deploy Apps Script เวอร์ชันล่าสุด');
    }

    res.json(uploadPayload);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error instanceof Error
        ? error.message
        : 'ไม่สามารถอัปโหลดรูปปกคลังความรู้ไปยัง Google Drive ได้',
    });
  }
});

app.post('/api/admin/knowledge/pdf-drive', async (req, res) => {
  try {
    const { item_title, file_name, mime_type, base64 } = req.body || {};
    if (!base64 || typeof base64 !== 'string') {
      return res.status(400).json({ error: 'ไม่พบไฟล์ PDF ที่ต้องการอัปโหลด' });
    }
    const safeMimeType = String(mime_type || 'application/pdf');
    if (safeMimeType !== 'application/pdf' && !String(file_name || '').toLowerCase().endsWith('.pdf')) {
      return res.status(400).json({ error: 'เอกสารคลังความรู้ต้องเป็นไฟล์ PDF เท่านั้น' });
    }

    const safeItemName = sanitizeAvatarFileName(item_title || 'knowledge-item', 'knowledge-item');
    const safeFileName = sanitizeAvatarFileName(file_name || `${safeItemName}.pdf`, 'knowledge.pdf');
    const parsed = await postToDriveScript({
      action: 'uploadAvatar',
      folderId: GOOGLE_DRIVE_AVATAR_FOLDER_ID,
      userId: 'knowledge-pdf',
      displayName: safeItemName,
      fileName: `${Date.now()}-knowledge-pdf-${safeFileName}`,
      mimeType: 'application/pdf',
      base64,
    });

    if (parsed?.ok === false) {
      throw new Error(getAvatarUploadErrorMessage(parsed.error || 'อัปโหลด PDF ไป Google Drive ไม่สำเร็จ'));
    }

    const uploadPayload = buildDriveUploadPayload(parsed);
    if (!uploadPayload.fileId && !uploadPayload.fileProxyPath && !uploadPayload.webViewLink) {
      throw new Error('Google Apps Script อัปโหลดสำเร็จไม่สมบูรณ์: ไม่พบรหัสไฟล์หรือ URL จาก Google Drive กรุณา Deploy Apps Script เวอร์ชันล่าสุด');
    }

    res.json(uploadPayload);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error instanceof Error
        ? error.message
        : 'ไม่สามารถอัปโหลด PDF คลังความรู้ไปยัง Google Drive ได้',
    });
  }
});

app.get('/api/admin/knowledge/report', async (_req, res) => {
  try {
    await ensureKnowledgeTables();
    const [rows]: any = await pool.query(`
      SELECT
        l.item_id,
        l.user_id,
        i.title,
        i.category,
        u.Name_Surnam AS Name_Surname,
        u.position,
        u.Division_Province,
        u.Department,
        COUNT(l.log_id) AS read_count,
        COALESCE(SUM(l.active_seconds), 0) AS total_active_seconds,
        MIN(l.start_time) AS first_read_at,
        MAX(COALESCE(l.end_time, l.start_time)) AS last_read_at
      FROM knowledge_reading_logs l
      INNER JOIN knowledge_items i ON i.item_id = l.item_id
      INNER JOIN user u ON u.user_id = l.user_id
      GROUP BY l.item_id, l.user_id, i.title, i.category, u.Name_Surnam, u.position, u.Division_Province, u.Department
      ORDER BY last_read_at DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'ไม่สามารถดึงรายงานคลังความรู้ได้' });
  }
});

// ====== MEETING REPORT CIRCULATION ======

app.post('/api/admin/setup-meeting-report-tables', async (_req, res) => {
  try {
    await ensureMeetingReportTables();
    await ensureDefaultMenuItems();
    res.json({ message: 'ตารางรายงานการประชุมถูกสร้างเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการสร้างตารางรายงานการประชุม' });
  }
});

app.get('/api/meeting-reports', async (req, res) => {
  try {
    await ensureMeetingReportTables();
    const userId = toInt(req.query.user_id);
    const section = normalizeMeetingReportSection(req.query.section);
    if (!userId) return res.status(400).json({ error: 'ไม่พบรหัสผู้ใช้งาน' });
    if (!(await requireMeetingReportAccess(res, userId, section))) return;

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
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'ไม่สามารถดึงรายงานการประชุมได้' });
  }
});

app.get('/api/meeting-reports/:id', async (req, res) => {
  try {
    await ensureMeetingReportTables();
    const reportId = toInt(req.params.id);
    const userId = toInt(req.query.user_id);
    if (!userId) return res.status(400).json({ error: 'ไม่พบรหัสผู้ใช้งาน' });

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
    if (rows.length === 0) return res.status(404).json({ error: 'ไม่พบรายงานการประชุม' });
    const report = rows[0];
    const section = normalizeMeetingReportSection(report.section);
    if (!(await requireMeetingReportAccess(res, userId, section))) return;

    const [commentRows]: any = await pool.query(
      `SELECT
         c.comment_id, c.report_id, c.user_id, c.page_number, c.x_percent, c.y_percent,
         c.marker_type, c.width_percent, c.height_percent,
         c.comment_text, c.status,
         DATE_FORMAT(c.created_at, '%Y-%m-%dT%H:%i:%s') AS created_at,
         u.Name_Surnam AS Name_Surname,
         u.position,
         u.Division_Province,
         u.Department
       FROM meeting_report_comments c
       INNER JOIN user u ON u.user_id = c.user_id
       WHERE c.report_id = ?
       ORDER BY c.page_number ASC, c.created_at ASC, c.comment_id ASC`,
      [reportId],
    );

    res.json({
      ...report,
      section_label: MEETING_REPORT_SECTION_LABELS[section],
      pdf_proxy_url: report.pdf_file_id ? buildDriveProxyPath(report.pdf_file_id) : '',
      comments: commentRows,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'ไม่สามารถดึงรายละเอียดรายงานการประชุมได้' });
  }
});

app.post('/api/meeting-reports/:id/read/start', async (req, res) => {
  try {
    await ensureMeetingReportTables();
    const reportId = toInt(req.params.id);
    const userId = toInt(req.body.user_id);
    const sessionId = toInt(req.body.session_id);
    if (!userId) return res.status(400).json({ error: 'ไม่พบรหัสผู้ใช้งาน' });

    const [reports]: any = await pool.query(
      'SELECT report_id, section FROM meeting_reports WHERE report_id = ? AND status = "published" LIMIT 1',
      [reportId],
    );
    if (reports.length === 0) return res.status(404).json({ error: 'ไม่พบรายงานการประชุม' });
    const section = normalizeMeetingReportSection(reports[0].section);
    if (!(await requireMeetingReportAccess(res, userId, section))) return;

    const [result]: any = await pool.query(
      'INSERT INTO meeting_report_read_logs (report_id, user_id, session_id, start_time) VALUES (?, ?, ?, NOW())',
      [reportId, userId, sessionId || null],
    );
    await pool.query('UPDATE meeting_reports SET view_count = view_count + 1 WHERE report_id = ?', [reportId]);
    res.json({ message: 'เริ่มบันทึกการอ่านแล้ว', log_id: result.insertId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เริ่มบันทึกเวลาอ่านไม่สำเร็จ' });
  }
});

app.post('/api/meeting-reports/read-logs/:logId/time', async (req, res) => {
  try {
    await ensureMeetingReportTables();
    const logId = toInt(req.params.logId);
    const userId = toInt(req.body.user_id);
    const seconds = Math.max(0, Math.min(toInt(req.body.seconds), 60));
    if (!logId || seconds <= 0) return res.json({ message: 'ไม่มีเวลาที่ต้องบันทึก' });

    const params = userId ? [seconds, logId, userId] : [seconds, logId];
    const userClause = userId ? 'AND user_id = ?' : '';
    await pool.query(
      `UPDATE meeting_report_read_logs
       SET active_seconds = active_seconds + ?, end_time = NOW()
       WHERE log_id = ? ${userClause}`,
      params,
    );
    res.json({ message: 'บันทึกเวลาอ่านเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'บันทึกเวลาอ่านไม่สำเร็จ' });
  }
});

app.post('/api/meeting-reports/:id/acknowledge', async (req, res) => {
  try {
    await ensureMeetingReportTables();
    const reportId = toInt(req.params.id);
    const userId = toInt(req.body.user_id);
    if (!userId) return res.status(400).json({ error: 'ไม่พบรหัสผู้ใช้งาน' });

    const [reports]: any = await pool.query(
      'SELECT report_id, section FROM meeting_reports WHERE report_id = ? AND status = "published" LIMIT 1',
      [reportId],
    );
    if (reports.length === 0) return res.status(404).json({ error: 'ไม่พบรายงานการประชุม' });
    const section = normalizeMeetingReportSection(reports[0].section);
    if (!(await requireMeetingReportAccess(res, userId, section))) return;

    await pool.query(
      `INSERT INTO meeting_report_acknowledgements (report_id, user_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE acknowledged_at = acknowledged_at`,
      [reportId, userId],
    );
    res.json({ message: 'รับทราบรายงานการประชุมเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'บันทึกรับทราบไม่สำเร็จ' });
  }
});

app.post('/api/meeting-reports/:id/comments', async (req, res) => {
  try {
    await ensureMeetingReportTables();
    const reportId = toInt(req.params.id);
    const userId = toInt(req.body.user_id);
    const pageNumber = Math.max(1, toInt(req.body.page_number, 1));
    const xPercent = Math.max(0, Math.min(Number(req.body.x_percent ?? 50), 100));
    const yPercent = Math.max(0, Math.min(Number(req.body.y_percent ?? 20), 100));
    const markerType = normalizeMeetingReportMarkerType(req.body.marker_type);
    const widthPercent = markerType !== 'point' ? Math.max(1, Math.min(Number(req.body.width_percent ?? 12), 100)) : 0;
    const heightPercent = markerType !== 'point' ? Math.max(1, Math.min(Number(req.body.height_percent ?? 8), 100)) : 0;
    const commentText = String(req.body.comment_text || '').trim();
    if (!userId) return res.status(400).json({ error: 'ไม่พบรหัสผู้ใช้งาน' });
    if (!commentText) return res.status(400).json({ error: 'กรุณากรอกข้อความแจ้งแก้ไข' });

    const [reports]: any = await pool.query(
      'SELECT report_id, section FROM meeting_reports WHERE report_id = ? AND status = "published" LIMIT 1',
      [reportId],
    );
    if (reports.length === 0) return res.status(404).json({ error: 'ไม่พบรายงานการประชุม' });
    const section = normalizeMeetingReportSection(reports[0].section);
    if (!(await requireMeetingReportAccess(res, userId, section))) return;

    const [result]: any = await pool.query(
      `INSERT INTO meeting_report_comments
       (report_id, user_id, page_number, x_percent, y_percent, marker_type, width_percent, height_percent, comment_text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [reportId, userId, pageNumber, xPercent, yPercent, markerType, widthPercent, heightPercent, commentText],
    );
    const [rows]: any = await pool.query(
      `SELECT
         c.comment_id, c.report_id, c.user_id, c.page_number, c.x_percent, c.y_percent,
         c.marker_type, c.width_percent, c.height_percent,
         c.comment_text, c.status,
         DATE_FORMAT(c.created_at, '%Y-%m-%dT%H:%i:%s') AS created_at,
         u.Name_Surnam AS Name_Surname,
         u.position,
         u.Division_Province,
         u.Department
       FROM meeting_report_comments c
       INNER JOIN user u ON u.user_id = c.user_id
       WHERE c.comment_id = ?
       LIMIT 1`,
      [result.insertId],
    );
    res.json({ message: 'บันทึกข้อความแจ้งแก้ไขเรียบร้อยแล้ว', comment: rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'บันทึกข้อความแจ้งแก้ไขไม่สำเร็จ' });
  }
});

app.put('/api/meeting-reports/comments/:commentId', async (req, res) => {
  try {
    await ensureMeetingReportTables();
    const commentId = toInt(req.params.commentId);
    const userId = toInt(req.body.user_id);
    const hasCommentText = Object.prototype.hasOwnProperty.call(req.body, 'comment_text');
    const hasPageNumber = Object.prototype.hasOwnProperty.call(req.body, 'page_number');
    const hasXPercent = Object.prototype.hasOwnProperty.call(req.body, 'x_percent');
    const hasYPercent = Object.prototype.hasOwnProperty.call(req.body, 'y_percent');
    const hasMarkerType = Object.prototype.hasOwnProperty.call(req.body, 'marker_type');
    const hasWidthPercent = Object.prototype.hasOwnProperty.call(req.body, 'width_percent');
    const hasHeightPercent = Object.prototype.hasOwnProperty.call(req.body, 'height_percent');
    const commentText = String(req.body.comment_text || '').trim();
    if (!userId) return res.status(400).json({ error: 'ไม่พบรหัสผู้ใช้งาน' });
    if (!commentId) return res.status(400).json({ error: 'ไม่พบรหัสข้อความแจ้งแก้ไข' });
    if (!hasCommentText && !hasPageNumber && !hasXPercent && !hasYPercent && !hasMarkerType && !hasWidthPercent && !hasHeightPercent) return res.status(400).json({ error: 'ไม่พบข้อมูลที่ต้องการแก้ไข' });
    if (hasCommentText && !commentText) return res.status(400).json({ error: 'กรุณากรอกข้อความแจ้งแก้ไข' });

    const [comments]: any = await pool.query(
      `SELECT c.comment_id, c.user_id, c.report_id, c.page_number, c.x_percent, c.y_percent,
              c.marker_type, c.width_percent, c.height_percent, c.comment_text, r.section
       FROM meeting_report_comments c
       INNER JOIN meeting_reports r ON r.report_id = c.report_id
       WHERE c.comment_id = ?
       LIMIT 1`,
      [commentId],
    );
    if (comments.length === 0) return res.status(404).json({ error: 'ไม่พบข้อความแจ้งแก้ไข' });

    const section = normalizeMeetingReportSection(comments[0].section);
    const isOwner = Number(comments[0].user_id) === userId;
    const isAdmin = await userCanAccessMenu(userId, 'meeting_reports_admin');
    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'แก้ไขได้เฉพาะข้อความของตนเอง' });
    if (!isAdmin && !(await requireMeetingReportAccess(res, userId, section))) return;

    const nextText = hasCommentText ? commentText : comments[0].comment_text;
    const nextPageNumber = hasPageNumber ? Math.max(1, toInt(req.body.page_number, 1)) : Number(comments[0].page_number || 1);
    const nextXPercent = hasXPercent ? Math.max(0, Math.min(Number(req.body.x_percent ?? 50), 100)) : Number(comments[0].x_percent || 0);
    const nextYPercent = hasYPercent ? Math.max(0, Math.min(Number(req.body.y_percent ?? 20), 100)) : Number(comments[0].y_percent || 0);
    const nextMarkerType = hasMarkerType ? normalizeMeetingReportMarkerType(req.body.marker_type) : normalizeMeetingReportMarkerType(comments[0].marker_type || 'point');
    const nextWidthPercent = nextMarkerType !== 'point'
      ? (hasWidthPercent ? Math.max(1, Math.min(Number(req.body.width_percent ?? 12), 100)) : Number(comments[0].width_percent || 12))
      : 0;
    const nextHeightPercent = nextMarkerType !== 'point'
      ? (hasHeightPercent ? Math.max(1, Math.min(Number(req.body.height_percent ?? 8), 100)) : Number(comments[0].height_percent || 8))
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
         u.Name_Surnam AS Name_Surname,
         u.position,
         u.Division_Province,
         u.Department
       FROM meeting_report_comments c
       INNER JOIN user u ON u.user_id = c.user_id
       WHERE c.comment_id = ?
       LIMIT 1`,
      [commentId],
    );
    res.json({ message: hasCommentText ? 'แก้ไขข้อความแจ้งแก้ไขเรียบร้อยแล้ว' : 'ย้ายตำแหน่งข้อความแจ้งแก้ไขเรียบร้อยแล้ว', comment: rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'แก้ไขข้อความแจ้งแก้ไขไม่สำเร็จ' });
  }
});

app.delete('/api/meeting-reports/comments/:commentId', async (req, res) => {
  try {
    await ensureMeetingReportTables();
    const commentId = toInt(req.params.commentId);
    const userId = toInt(req.body.user_id);
    if (!userId) return res.status(400).json({ error: 'ไม่พบรหัสผู้ใช้งาน' });
    if (!commentId) return res.status(400).json({ error: 'ไม่พบรหัสข้อความแจ้งแก้ไข' });

    const [comments]: any = await pool.query(
      `SELECT c.comment_id, c.user_id, c.report_id, r.section
       FROM meeting_report_comments c
       INNER JOIN meeting_reports r ON r.report_id = c.report_id
       WHERE c.comment_id = ?
       LIMIT 1`,
      [commentId],
    );
    if (comments.length === 0) return res.status(404).json({ error: 'ไม่พบข้อความแจ้งแก้ไข' });

    const section = normalizeMeetingReportSection(comments[0].section);
    const isOwner = Number(comments[0].user_id) === userId;
    const isAdmin = await userCanAccessMenu(userId, 'meeting_reports_admin');
    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'ลบได้เฉพาะข้อความของตนเอง' });
    if (!isAdmin && !(await requireMeetingReportAccess(res, userId, section))) return;

    await pool.query('DELETE FROM meeting_report_comments WHERE comment_id = ?', [commentId]);
    res.json({ message: 'ลบข้อความแจ้งแก้ไขเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'ลบข้อความแจ้งแก้ไขไม่สำเร็จ' });
  }
});

app.get('/api/admin/meeting-reports', async (req, res) => {
  try {
    await ensureMeetingReportTables();
    const userId = toInt(req.query.user_id);
    if (!userId) return res.status(400).json({ error: 'ไม่พบรหัสผู้ใช้งาน' });
    if (!(await requireMeetingReportAdmin(res, userId))) return;

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
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'ไม่สามารถดึงรายการรายงานการประชุมได้' });
  }
});

app.post('/api/admin/meeting-reports', async (req, res) => {
  try {
    await ensureMeetingReportTables();
    const body = req.body || {};
    const userId = toInt(body.user_id);
    if (!userId) return res.status(400).json({ error: 'ไม่พบรหัสผู้ใช้งาน' });
    if (!(await requireMeetingReportAdmin(res, userId))) return;

    const title = String(body.title || '').trim();
    if (!title) return res.status(400).json({ error: 'กรุณาระบุชื่อรายงานการประชุม' });
    const section = normalizeMeetingReportSection(body.section);
    const status = normalizeMeetingReportStatus(body.status);
    const pdfUrl = String(body.pdf_url || '').trim();
    const meetingDate = DATE_ONLY_RE.test(String(body.meeting_date || '')) ? String(body.meeting_date) : null;

    const [result]: any = await pool.query(
      `INSERT INTO meeting_reports
       (section, title, meeting_date, description, status, pdf_url, pdf_file_id,
        published_at, sort_order, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ${status === 'published' ? 'NOW()' : 'NULL'}, ?, ?)`,
      [
        section,
        title,
        meetingDate,
        String(body.description || '').trim(),
        status,
        pdfUrl,
        String(body.pdf_file_id || extractGoogleDriveFileId(pdfUrl) || '').trim(),
        toInt(body.sort_order),
        userId,
      ],
    );
    if (status === 'published') {
      await sendLineTopicNotification(pool, {
        menuKey: section === 'area' ? 'meeting_reports_area' : 'meeting_reports_office',
        sourceType: 'meeting_report',
        sourceId: result.insertId,
        title,
        description: String(body.description || '').trim(),
        href: `/meeting-reports/${result.insertId}`,
      });
    }
    res.json({ message: 'เพิ่มรายงานการประชุมเรียบร้อยแล้ว', report_id: result.insertId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เพิ่มรายงานการประชุมไม่สำเร็จ' });
  }
});

app.put('/api/admin/meeting-reports/:id', async (req, res) => {
  try {
    await ensureMeetingReportTables();
    const reportId = toInt(req.params.id);
    const body = req.body || {};
    const userId = toInt(body.user_id);
    if (!userId) return res.status(400).json({ error: 'ไม่พบรหัสผู้ใช้งาน' });
    if (!(await requireMeetingReportAdmin(res, userId))) return;

    const title = String(body.title || '').trim();
    if (!title) return res.status(400).json({ error: 'กรุณาระบุชื่อรายงานการประชุม' });
    const section = normalizeMeetingReportSection(body.section);
    const status = normalizeMeetingReportStatus(body.status);
    const pdfUrl = String(body.pdf_url || '').trim();
    const meetingDate = DATE_ONLY_RE.test(String(body.meeting_date || '')) ? String(body.meeting_date) : null;

    const [existing]: any = await pool.query(
      'SELECT status FROM meeting_reports WHERE report_id = ? LIMIT 1',
      [reportId],
    );
    const wasPublished = existing[0]?.status === 'published';

    await pool.query(
      `UPDATE meeting_reports SET
         section = ?, title = ?, meeting_date = ?, description = ?, status = ?,
         pdf_url = ?, pdf_file_id = ?, sort_order = ?,
         published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, NOW()) ELSE published_at END
       WHERE report_id = ?`,
      [
        section,
        title,
        meetingDate,
        String(body.description || '').trim(),
        status,
        pdfUrl,
        String(body.pdf_file_id || extractGoogleDriveFileId(pdfUrl) || '').trim(),
        toInt(body.sort_order),
        status,
        reportId,
      ],
    );
    if (!wasPublished && status === 'published') {
      await sendLineTopicNotification(pool, {
        menuKey: section === 'area' ? 'meeting_reports_area' : 'meeting_reports_office',
        sourceType: 'meeting_report',
        sourceId: reportId,
        title,
        description: String(body.description || '').trim(),
        href: `/meeting-reports/${reportId}`,
      });
    }
    res.json({ message: 'แก้ไขรายงานการประชุมเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'แก้ไขรายงานการประชุมไม่สำเร็จ' });
  }
});

app.delete('/api/admin/meeting-reports/:id', async (req, res) => {
  try {
    await ensureMeetingReportTables();
    const userId = toInt(req.query.user_id);
    if (!userId) return res.status(400).json({ error: 'ไม่พบรหัสผู้ใช้งาน' });
    if (!(await requireMeetingReportAdmin(res, userId))) return;
    await pool.query('DELETE FROM meeting_reports WHERE report_id = ?', [toInt(req.params.id)]);
    res.json({ message: 'ลบรายงานการประชุมเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'ลบรายงานการประชุมไม่สำเร็จ' });
  }
});

app.post('/api/admin/meeting-reports/pdf-drive', async (req, res) => {
  try {
    const { user_id, report_title, file_name, mime_type, base64 } = req.body || {};
    const userId = toInt(user_id);
    if (!userId) return res.status(400).json({ error: 'ไม่พบรหัสผู้ใช้งาน' });
    if (!(await requireMeetingReportAdmin(res, userId))) return;
    if (!base64 || typeof base64 !== 'string') {
      return res.status(400).json({ error: 'ไม่พบไฟล์ PDF ที่ต้องการอัปโหลด' });
    }
    const safeMimeType = String(mime_type || 'application/pdf');
    if (safeMimeType !== 'application/pdf' && !String(file_name || '').toLowerCase().endsWith('.pdf')) {
      return res.status(400).json({ error: 'รายงานการประชุมต้องเป็นไฟล์ PDF เท่านั้น' });
    }

    const safeReportName = sanitizeAvatarFileName(report_title || 'meeting-report', 'meeting-report');
    const safeFileName = sanitizeAvatarFileName(file_name || `${safeReportName}.pdf`, 'meeting-report.pdf');
    const parsed = await postToDriveScript({
      action: 'uploadAvatar',
      folderId: GOOGLE_DRIVE_AVATAR_FOLDER_ID,
      userId: 'meeting-report-pdf',
      displayName: safeReportName,
      fileName: `${Date.now()}-meeting-report-${safeFileName}`,
      mimeType: 'application/pdf',
      base64,
    });

    if (parsed?.ok === false) {
      throw new Error(getAvatarUploadErrorMessage(parsed.error || 'อัปโหลด PDF ไป Google Drive ไม่สำเร็จ'));
    }

    const uploadPayload = buildDriveUploadPayload(parsed);
    if (!uploadPayload.fileId && !uploadPayload.fileProxyPath && !uploadPayload.webViewLink) {
      throw new Error('Google Apps Script อัปโหลดสำเร็จไม่สมบูรณ์: ไม่พบรหัสไฟล์หรือ URL จาก Google Drive กรุณา Deploy Apps Script เวอร์ชันล่าสุด');
    }

    res.json(uploadPayload);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error instanceof Error
        ? error.message
        : 'ไม่สามารถอัปโหลด PDF รายงานการประชุมไปยัง Google Drive ได้',
    });
  }
});

app.get('/api/admin/meeting-reports/report', async (req, res) => {
  try {
    await ensureMeetingReportTables();
    const userId = toInt(req.query.user_id);
    if (!userId) return res.status(400).json({ error: 'ไม่พบรหัสผู้ใช้งาน' });
    if (!(await requireMeetingReportAdmin(res, userId))) return;

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

    res.json({ reads, acknowledgements, comments });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'ไม่สามารถดึงรายงานหลังบ้านได้' });
  }
});

// ====== TRAINING / E-LEARNING ======

app.post('/api/admin/setup-training-tables', async (_req, res) => {
  try {
    await ensureTrainingTables();
    await ensureDefaultMenuItems();
    res.json({ message: 'ตารางระบบอบรมถูกสร้างเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการสร้างตารางระบบอบรม' });
  }
});

app.get('/api/training/courses', async (req, res) => {
  try {
    await ensureTrainingTables();
    const userId = toInt(req.query.user_id, 0);
    const params: any[] = [];
    let enrollmentSelect = 'NULL AS enrollment_id, NULL AS enrollment_status, 0 AS attended_seconds, NULL AS pre_score, NULL AS post_score, 0 AS evaluated';
    let enrollmentJoin = '';

    if (userId > 0) {
      enrollmentSelect = 'e.enrollment_id, e.status AS enrollment_status, e.attended_seconds, e.pre_score, e.post_score, e.evaluated';
      enrollmentJoin = 'LEFT JOIN training_enrollments e ON e.course_id = c.course_id AND e.user_id = ?';
      params.push(userId);
    }

    const [rows]: any = await pool.query(`
      SELECT c.*,
             ${enrollmentSelect},
             (SELECT COUNT(*) FROM training_enrollments WHERE course_id = c.course_id) AS enrolled_count,
             (SELECT COUNT(*) FROM training_lessons WHERE course_id = c.course_id) AS lesson_count,
             (SELECT COUNT(*) FROM training_materials WHERE course_id = c.course_id) AS material_count
      FROM training_courses c
      ${enrollmentJoin}
      WHERE c.status <> 'draft'
      ORDER BY c.updated_at DESC, c.course_id DESC
    `, params);

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'ไม่สามารถดึงหลักสูตรได้' });
  }
});

app.get('/api/training/courses/:id', async (req, res) => {
  try {
    await ensureTrainingTables();
    const courseId = toInt(req.params.id);
    const userId = toInt(req.query.user_id, 0);

    const [courses]: any = await pool.query('SELECT * FROM training_courses WHERE course_id = ?', [courseId]);
    if (courses.length === 0) return res.status(404).json({ error: 'ไม่พบหลักสูตร' });

    const [lessons]: any = await pool.query(
      'SELECT *, ? AS embed_url FROM training_lessons WHERE course_id = ? ORDER BY sort_order, lesson_id',
      ['', courseId],
    );
    const [materials]: any = await pool.query(
      'SELECT * FROM training_materials WHERE course_id = ? ORDER BY sort_order, material_id',
      [courseId],
    );
    const [quizzes]: any = await pool.query(
      'SELECT quiz_id, course_id, quiz_type, title, pass_score, time_limit_minutes FROM training_quizzes WHERE course_id = ? ORDER BY FIELD(quiz_type, "pre", "post")',
      [courseId],
    );

    const enrollmentRows = userId > 0
      ? await pool.query('SELECT * FROM training_enrollments WHERE course_id = ? AND user_id = ? LIMIT 1', [courseId, userId])
      : [[]];
    const enrollment = (enrollmentRows[0] as any[])[0] || null;

    res.json({
      course: courses[0],
      lessons: lessons.map((lesson: any) => ({ ...lesson, embed_url: getYouTubeEmbedUrl(lesson.youtube_url) })),
      materials,
      quizzes,
      enrollment,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'ไม่สามารถดึงรายละเอียดหลักสูตรได้' });
  }
});

app.post('/api/training/courses/:id/enroll', async (req, res) => {
  try {
    await ensureTrainingTables();
    const courseId = toInt(req.params.id);
    const userId = toInt(req.body.user_id);
    if (!userId) return res.status(400).json({ error: 'ไม่พบรหัสผู้ใช้งาน' });

    await pool.query(
      `INSERT INTO training_enrollments (course_id, user_id, status)
       VALUES (?, ?, 'registered')
       ON DUPLICATE KEY UPDATE enrollment_id = LAST_INSERT_ID(enrollment_id)`,
      [courseId, userId],
    );
    const [rows]: any = await pool.query('SELECT * FROM training_enrollments WHERE course_id = ? AND user_id = ? LIMIT 1', [courseId, userId]);
    res.json({ message: 'ลงทะเบียนหลักสูตรเรียบร้อยแล้ว', enrollment: rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'ลงทะเบียนหลักสูตรไม่สำเร็จ' });
  }
});

app.post('/api/training/enrollments/:id/start', async (req, res) => {
  try {
    await ensureTrainingTables();
    const enrollmentId = toInt(req.params.id);
    await pool.query(
      `UPDATE training_enrollments
       SET status = IF(status = 'completed', status, 'in_progress'), last_started_at = NOW()
       WHERE enrollment_id = ?`,
      [enrollmentId],
    );
    const [result]: any = await pool.query(
      'INSERT INTO training_attendance_logs (enrollment_id, start_time) VALUES (?, NOW())',
      [enrollmentId],
    );
    res.json({ message: 'เริ่มนับเวลาเข้าอบรมแล้ว', log_id: result.insertId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เริ่มนับเวลาไม่สำเร็จ' });
  }
});

app.post('/api/training/enrollments/:id/time', async (req, res) => {
  try {
    await ensureTrainingTables();
    const enrollmentId = toInt(req.params.id);
    const seconds = Math.max(0, Math.min(toInt(req.body.seconds), 3600));
    if (seconds <= 0) return res.json({ message: 'ไม่มีเวลาที่ต้องบันทึก' });

    await pool.query(
      'UPDATE training_enrollments SET attended_seconds = attended_seconds + ? WHERE enrollment_id = ?',
      [seconds, enrollmentId],
    );
    if (req.body.log_id) {
      await pool.query(
        'UPDATE training_attendance_logs SET active_seconds = active_seconds + ?, end_time = NOW() WHERE log_id = ? AND enrollment_id = ?',
        [seconds, req.body.log_id, enrollmentId],
      );
    } else {
      await pool.query(
        'INSERT INTO training_attendance_logs (enrollment_id, start_time, end_time, active_seconds) VALUES (?, NOW(), NOW(), ?)',
        [enrollmentId, seconds],
      );
    }
    res.json({ message: 'บันทึกเวลาเข้าอบรมเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'บันทึกเวลาเข้าอบรมไม่สำเร็จ' });
  }
});

app.get('/api/training/quizzes/:id', async (req, res) => {
  try {
    await ensureTrainingTables();
    const quizId = toInt(req.params.id);
    const [quizzes]: any = await pool.query('SELECT quiz_id, course_id, quiz_type, title, pass_score, time_limit_minutes FROM training_quizzes WHERE quiz_id = ?', [quizId]);
    if (quizzes.length === 0) return res.status(404).json({ error: 'ไม่พบแบบทดสอบ' });

    const [questions]: any = await pool.query(
      'SELECT question_id, question_text, sort_order FROM training_questions WHERE quiz_id = ? ORDER BY sort_order, question_id',
      [quizId],
    );
    const [choices]: any = await pool.query(
      `SELECT c.choice_id, c.question_id, c.choice_text, c.sort_order
       FROM training_choices c
       INNER JOIN training_questions q ON q.question_id = c.question_id
       WHERE q.quiz_id = ?
       ORDER BY q.sort_order, c.sort_order, c.choice_id`,
      [quizId],
    );

    res.json({
      quiz: quizzes[0],
      questions: questions.map((question: any) => ({
        ...question,
        choices: choices.filter((choice: any) => choice.question_id === question.question_id),
      })),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'ไม่สามารถดึงแบบทดสอบได้' });
  }
});

app.post('/api/training/quizzes/:id/submit', async (req, res) => {
  try {
    await ensureTrainingTables();
    const quizId = toInt(req.params.id);
    const userId = toInt(req.body.user_id);
    const answers = req.body.answers && typeof req.body.answers === 'object' ? req.body.answers : {};
    if (!userId) return res.status(400).json({ error: 'ไม่พบรหัสผู้ใช้งาน' });

    const [quizzes]: any = await pool.query('SELECT * FROM training_quizzes WHERE quiz_id = ?', [quizId]);
    if (quizzes.length === 0) return res.status(404).json({ error: 'ไม่พบแบบทดสอบ' });
    const quiz = quizzes[0];
    const timeLimitMinutes = Math.max(0, toInt(quiz.time_limit_minutes));
    const elapsedSeconds = Math.max(0, toInt(req.body.elapsed_seconds));
    if (timeLimitMinutes > 0 && elapsedSeconds > (timeLimitMinutes * 60) + 5) {
      return res.status(400).json({ error: 'หมดเวลาทำแบบทดสอบแล้ว ไม่สามารถส่งคำตอบได้' });
    }

    const [enrollments]: any = await pool.query(
      'SELECT * FROM training_enrollments WHERE course_id = ? AND user_id = ?',
      [quiz.course_id, userId],
    );
    if (enrollments.length === 0) return res.status(400).json({ error: 'กรุณาลงทะเบียนหลักสูตรก่อนทำแบบทดสอบ' });
    const enrollment = enrollments[0];
    if (quiz.quiz_type === 'pre' && enrollment.pre_score !== null && enrollment.pre_score !== undefined) {
      return res.status(400).json({ error: `แบบทดสอบก่อนเรียนทำได้เพียงครั้งเดียว คะแนนเดิม ${enrollment.pre_score}%` });
    }
    if (quiz.quiz_type === 'post' && enrollment.post_score !== null && enrollment.post_score !== undefined) {
      return res.status(400).json({ error: `แบบทดสอบหลังเรียนทำได้เพียงครั้งเดียว คะแนนเดิม ${enrollment.post_score}%` });
    }

    const [attempts]: any = await pool.query(
      'SELECT attempt_id, score FROM training_quiz_attempts WHERE enrollment_id = ? AND quiz_type = ? LIMIT 1',
      [enrollment.enrollment_id, quiz.quiz_type],
    );
    if (attempts.length > 0) {
      return res.status(400).json({
        error: `${quiz.quiz_type === 'pre' ? 'แบบทดสอบก่อนเรียน' : 'แบบทดสอบหลังเรียน'}ทำได้เพียงครั้งเดียว คะแนนเดิม ${attempts[0].score}%`,
      });
    }

    const [questions]: any = await pool.query('SELECT question_id FROM training_questions WHERE quiz_id = ?', [quizId]);
    if (questions.length === 0) return res.status(400).json({ error: 'แบบทดสอบนี้ยังไม่มีคำถาม' });

    const questionIds = questions.map((question: any) => question.question_id);
    const [correctChoices]: any = await pool.query(
      'SELECT question_id, choice_id FROM training_choices WHERE is_correct = 1 AND question_id IN (?)',
      [questionIds],
    );
    const correctByQuestion = new Map(correctChoices.map((choice: any) => [String(choice.question_id), Number(choice.choice_id)]));
    let correctCount = 0;
    for (const questionId of questionIds) {
      if (Number(answers[String(questionId)]) === correctByQuestion.get(String(questionId))) correctCount += 1;
    }
    const total = questionIds.length;
    const score = Number(((correctCount / total) * 100).toFixed(2));

    await pool.query(
      `INSERT INTO training_quiz_attempts (enrollment_id, quiz_id, quiz_type, score, total_questions, answers)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [enrollment.enrollment_id, quizId, quiz.quiz_type, score, total, JSON.stringify(answers)],
    );

    const [courseRows]: any = await pool.query('SELECT course_type, pass_score FROM training_courses WHERE course_id = ?', [quiz.course_id]);
    const course = courseRows[0];
    const passScore = Number(course?.pass_score || quiz.pass_score || 70);
    const passed = score >= passScore;

    if (quiz.quiz_type === 'pre') {
      await pool.query(
        'UPDATE training_enrollments SET pre_score = ?, pre_total = ? WHERE enrollment_id = ?',
        [score, total, enrollment.enrollment_id],
      );
    } else {
      const certificateCode = passed && (course?.course_type === 'online' || enrollment.attendance_confirmed)
        ? `TR-${quiz.course_id}-${enrollment.user_id}-${Date.now().toString(36).toUpperCase()}`
        : '';
      await pool.query(
        `UPDATE training_enrollments
         SET post_score = ?,
             post_total = ?,
             status = 'completed',
             completed_at = COALESCE(completed_at, NOW()),
             certificate_code = IF(? <> '' AND certificate_code = '', ?, certificate_code)
         WHERE enrollment_id = ?`,
        [score, total, certificateCode, certificateCode, enrollment.enrollment_id],
      );
    }

    res.json({
      message: quiz.quiz_type === 'post' && passed
        ? 'ส่งแบบทดสอบเรียบร้อยแล้ว คะแนนผ่านเกณฑ์'
        : 'ส่งแบบทดสอบเรียบร้อยแล้ว',
      score,
      total,
      correct: correctCount,
      passed,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'ส่งแบบทดสอบไม่สำเร็จ' });
  }
});

app.get('/api/training/courses/:id/evaluation-form', async (req, res) => {
  try {
    await ensureTrainingTables();
    const courseId = toInt(req.params.id);
    const [questions]: any = await pool.query(
      `SELECT question_id, course_id, question_text, question_type, is_required, sort_order
       FROM training_evaluation_questions
       WHERE course_id = ?
       ORDER BY sort_order, question_id`,
      [courseId],
    );
    const questionIds = questions.map((question: any) => question.question_id);
    const [options]: any = questionIds.length > 0
      ? await pool.query(
          `SELECT option_id, question_id, option_text, sort_order
           FROM training_evaluation_options
           WHERE question_id IN (?)
           ORDER BY question_id, sort_order, option_id`,
          [questionIds],
        )
      : [[]];

    res.json(questions.map((question: any) => ({
      ...question,
      options: options.filter((option: any) => option.question_id === question.question_id),
    })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'ไม่สามารถดึงแบบประเมินได้' });
  }
});

app.post('/api/training/enrollments/:id/evaluation', async (req, res) => {
  try {
    await ensureTrainingTables();
    const enrollmentId = toInt(req.params.id);
    const answers = req.body.answers && typeof req.body.answers === 'object' ? req.body.answers : {};

    const [enrollments]: any = await pool.query('SELECT * FROM training_enrollments WHERE enrollment_id = ? LIMIT 1', [enrollmentId]);
    if (enrollments.length === 0) return res.status(404).json({ error: 'ไม่พบข้อมูลการลงทะเบียน' });
    const enrollment = enrollments[0];
    if (enrollment.status !== 'completed') {
      return res.status(400).json({ error: 'สามารถส่งแบบประเมินได้หลังจบการอบรมเท่านั้น' });
    }

    const [questions]: any = await pool.query(
      `SELECT question_id, question_text, question_type, is_required
       FROM training_evaluation_questions
       WHERE course_id = ?
       ORDER BY sort_order, question_id`,
      [enrollment.course_id],
    );
    if (questions.length === 0) return res.status(400).json({ error: 'หลักสูตรนี้ยังไม่ได้ตั้งค่าแบบประเมิน' });

    const questionIds = questions.map((question: any) => question.question_id);
    const [options]: any = await pool.query(
      'SELECT option_id, question_id, option_text FROM training_evaluation_options WHERE question_id IN (?)',
      [questionIds],
    );
    const optionsByQuestion = new Map<string, any[]>();
    for (const option of options) {
      const key = String(option.question_id);
      optionsByQuestion.set(key, [...(optionsByQuestion.get(key) || []), option]);
    }

    const normalizedAnswers: Array<[number, string]> = [];
    for (const question of questions) {
      const key = String(question.question_id);
      const value = answers[key];
      const isRequired = Number(question.is_required) === 1;
      const questionOptions = optionsByQuestion.get(key) || [];

      if ((value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) && isRequired) {
        return res.status(400).json({ error: `กรุณาตอบ: ${question.question_text}` });
      }

      if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
        normalizedAnswers.push([question.question_id, '']);
        continue;
      }

      if (question.question_type === 'rating') {
        const rating = Math.max(1, Math.min(toInt(value, 0), 5));
        if (!rating && isRequired) return res.status(400).json({ error: `กรุณาให้คะแนน: ${question.question_text}` });
        normalizedAnswers.push([question.question_id, String(rating)]);
      } else if (question.question_type === 'single_choice') {
        const selected = questionOptions.find((option) => Number(option.option_id) === Number(value));
        if (!selected) return res.status(400).json({ error: `ตัวเลือกไม่ถูกต้อง: ${question.question_text}` });
        normalizedAnswers.push([question.question_id, selected.option_text]);
      } else if (question.question_type === 'multiple_choice') {
        const selectedIds = Array.isArray(value) ? value.map(Number) : [Number(value)];
        const selectedTexts = selectedIds
          .map((id) => questionOptions.find((option) => Number(option.option_id) === id)?.option_text)
          .filter(Boolean);
        if (selectedTexts.length === 0 && isRequired) return res.status(400).json({ error: `กรุณาเลือกคำตอบ: ${question.question_text}` });
        normalizedAnswers.push([question.question_id, JSON.stringify(selectedTexts)]);
      } else {
        normalizedAnswers.push([question.question_id, String(value || '').trim().slice(0, 4000)]);
      }
    }

    await pool.query(
      `INSERT INTO training_evaluation_responses (enrollment_id, course_id, user_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE submitted_at = CURRENT_TIMESTAMP`,
      [enrollmentId, enrollment.course_id, enrollment.user_id],
    );
    const [responseRows]: any = await pool.query('SELECT response_id FROM training_evaluation_responses WHERE enrollment_id = ? LIMIT 1', [enrollmentId]);
    const responseId = responseRows[0].response_id;
    await pool.query('DELETE FROM training_evaluation_answers WHERE response_id = ?', [responseId]);
    await pool.query(
      'INSERT INTO training_evaluation_answers (response_id, question_id, answer_value) VALUES ?',
      [normalizedAnswers.map(([questionId, answerValue]) => [responseId, questionId, answerValue])],
    );
    await pool.query(
      `UPDATE training_enrollments
       SET evaluated = 1,
           status = 'completed',
           completed_at = COALESCE(completed_at, NOW())
       WHERE enrollment_id = ?`,
      [enrollmentId],
    );
    res.json({ message: 'บันทึกแบบประเมินหลักสูตรเรียบร้อยแล้ว', status: 'completed', evaluated: 1 });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'บันทึกแบบประเมินไม่สำเร็จ' });
  }
});

app.get('/api/training/users/:userId/history', async (req, res) => {
  try {
    await ensureTrainingTables();
    const userId = toInt(req.params.userId);
    const [rows]: any = await pool.query(`
      SELECT e.*, c.title, c.category, c.course_type, c.thumbnail_url, c.instructor, c.pass_score,
             c.duration_minutes, c.certificate_enabled
      FROM training_enrollments e
      INNER JOIN training_courses c ON c.course_id = e.course_id
      WHERE e.user_id = ?
      ORDER BY e.registered_at DESC
    `, [userId]);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'ไม่สามารถดึงประวัติการอบรมได้' });
  }
});

app.get('/api/admin/training/courses', async (_req, res) => {
  try {
    await ensureTrainingTables();
    const [rows]: any = await pool.query(`
      SELECT c.*,
             (SELECT COUNT(*) FROM training_enrollments WHERE course_id = c.course_id) AS enrolled_count,
             (SELECT COUNT(*) FROM training_lessons WHERE course_id = c.course_id) AS lesson_count,
             (SELECT COUNT(*) FROM training_materials WHERE course_id = c.course_id) AS material_count
      FROM training_courses c
      ORDER BY c.updated_at DESC, c.course_id DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'ไม่สามารถดึงข้อมูลหลักสูตรได้' });
  }
});

app.post('/api/admin/training/courses', async (req, res) => {
  try {
    await ensureTrainingTables();
    const body = req.body || {};
    if (!String(body.title || '').trim()) return res.status(400).json({ error: 'กรุณาระบุชื่อหลักสูตร' });
    const title = String(body.title || '').trim();
    const status = normalizeTrainingStatus(body.status);

    const [result]: any = await pool.query(
      `INSERT INTO training_courses
       (title, category, course_type, status, thumbnail_url, instructor, target_group,
        learning_objectives, learning_topics, content_summary, evaluation_method, description,
        duration_minutes, zoom_url, location, pass_score, certificate_enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        String(body.category || '').trim(),
        normalizeCourseType(body.course_type),
        status,
        String(body.thumbnail_url || '').trim(),
        String(body.instructor || '').trim(),
        String(body.target_group || '').trim(),
        String(body.learning_objectives || '').trim(),
        String(body.learning_topics || '').trim(),
        String(body.content_summary || '').trim(),
        String(body.evaluation_method || '').trim(),
        String(body.description || '').trim(),
        toInt(body.duration_minutes),
        String(body.zoom_url || '').trim(),
        String(body.location || '').trim(),
        toInt(body.pass_score, 70),
        body.certificate_enabled === false ? 0 : 1,
      ],
    );
    if (status === 'open') {
      await sendLineTopicNotification(pool, {
        menuKey: 'report_course',
        sourceType: 'training_course',
        sourceId: result.insertId,
        title,
        description: String(body.description || body.content_summary || '').trim(),
        href: `/training-courses/${result.insertId}`,
      });
    }
    res.json({ message: 'เพิ่มหลักสูตรเรียบร้อยแล้ว', course_id: result.insertId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เพิ่มหลักสูตรไม่สำเร็จ' });
  }
});

app.put('/api/admin/training/courses/:id', async (req, res) => {
  try {
    await ensureTrainingTables();
    const courseId = toInt(req.params.id);
    const body = req.body || {};
    const title = String(body.title || '').trim();
    const status = normalizeTrainingStatus(body.status);
    const [existing]: any = await pool.query(
      'SELECT status FROM training_courses WHERE course_id = ? LIMIT 1',
      [courseId],
    );
    const wasOpen = existing[0]?.status === 'open';
    await pool.query(
      `UPDATE training_courses SET
       title=?, category=?, course_type=?, status=?, thumbnail_url=?, instructor=?, target_group=?,
       learning_objectives=?, learning_topics=?, content_summary=?, evaluation_method=?, description=?,
       duration_minutes=?, zoom_url=?, location=?, pass_score=?, certificate_enabled=?
       WHERE course_id=?`,
      [
        title,
        String(body.category || '').trim(),
        normalizeCourseType(body.course_type),
        status,
        String(body.thumbnail_url || '').trim(),
        String(body.instructor || '').trim(),
        String(body.target_group || '').trim(),
        String(body.learning_objectives || '').trim(),
        String(body.learning_topics || '').trim(),
        String(body.content_summary || '').trim(),
        String(body.evaluation_method || '').trim(),
        String(body.description || '').trim(),
        toInt(body.duration_minutes),
        String(body.zoom_url || '').trim(),
        String(body.location || '').trim(),
        toInt(body.pass_score, 70),
        body.certificate_enabled === false ? 0 : 1,
        courseId,
      ],
    );
    if (!wasOpen && status === 'open') {
      await sendLineTopicNotification(pool, {
        menuKey: 'report_course',
        sourceType: 'training_course',
        sourceId: courseId,
        title,
        description: String(body.description || body.content_summary || '').trim(),
        href: `/training-courses/${courseId}`,
      });
    }
    res.json({ message: 'แก้ไขหลักสูตรเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'แก้ไขหลักสูตรไม่สำเร็จ' });
  }
});

app.delete('/api/admin/training/courses/:id', async (req, res) => {
  try {
    await ensureTrainingTables();
    await pool.query('DELETE FROM training_courses WHERE course_id = ?', [req.params.id]);
    res.json({ message: 'ลบหลักสูตรเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'ลบหลักสูตรไม่สำเร็จ' });
  }
});

app.post('/api/admin/training/courses/:id/lessons', async (req, res) => {
  try {
    await ensureTrainingTables();
    const courseId = toInt(req.params.id);
    const [result]: any = await pool.query(
      'INSERT INTO training_lessons (course_id, title, lesson_type, youtube_url, content, duration_seconds, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        courseId,
        String(req.body.title || 'บทเรียนใหม่').trim(),
        ['video', 'document', 'text'].includes(req.body.lesson_type) ? req.body.lesson_type : 'video',
        String(req.body.youtube_url || '').trim(),
        String(req.body.content || '').trim(),
        toInt(req.body.duration_seconds),
        toInt(req.body.sort_order),
      ],
    );
    res.json({ message: 'เพิ่มบทเรียนเรียบร้อยแล้ว', lesson_id: result.insertId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เพิ่มบทเรียนไม่สำเร็จ' });
  }
});

app.post('/api/admin/training/courses/:id/materials', async (req, res) => {
  try {
    await ensureTrainingTables();
    const courseId = toInt(req.params.id);
    const driveUrl = String(req.body.drive_url || '').trim();
    if (!driveUrl) return res.status(400).json({ error: 'กรุณาระบุลิงก์ Google Drive' });
    const [result]: any = await pool.query(
      'INSERT INTO training_materials (course_id, title, drive_url, drive_file_id, sort_order) VALUES (?, ?, ?, ?, ?)',
      [
        courseId,
        String(req.body.title || 'เอกสารประกอบ').trim(),
        driveUrl,
        extractGoogleDriveFileId(driveUrl),
        toInt(req.body.sort_order),
      ],
    );
    res.json({ message: 'เพิ่มเอกสารเรียบร้อยแล้ว', material_id: result.insertId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เพิ่มเอกสารไม่สำเร็จ' });
  }
});

app.get('/api/admin/training/courses/:id/quizzes', async (req, res) => {
  try {
    await ensureTrainingTables();
    const courseId = toInt(req.params.id);
    const [quizzes]: any = await pool.query(
      'SELECT quiz_id, course_id, quiz_type, title, pass_score, time_limit_minutes FROM training_quizzes WHERE course_id = ? ORDER BY FIELD(quiz_type, "pre", "post")',
      [courseId],
    );
    if (quizzes.length === 0) return res.json([]);

    const quizIds = quizzes.map((quiz: any) => quiz.quiz_id);
    const [questions]: any = await pool.query(
      'SELECT question_id, quiz_id, question_text, sort_order FROM training_questions WHERE quiz_id IN (?) ORDER BY quiz_id, sort_order, question_id',
      [quizIds],
    );
    const questionIds = questions.map((question: any) => question.question_id);
    const [choices]: any = questionIds.length > 0
      ? await pool.query(
          `SELECT choice_id, question_id, choice_text, is_correct, sort_order
           FROM training_choices
           WHERE question_id IN (?)
           ORDER BY question_id, sort_order, choice_id`,
          [questionIds],
        )
      : [[]];

    res.json(quizzes.map((quiz: any) => ({
      ...quiz,
      questions: questions
        .filter((question: any) => question.quiz_id === quiz.quiz_id)
        .map((question: any) => ({
          ...question,
          choices: choices.filter((choice: any) => choice.question_id === question.question_id),
        })),
    })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'ไม่สามารถดึงตัวอย่างแบบทดสอบได้' });
  }
});

app.put('/api/admin/training/courses/:id/quizzes/:quizType/settings', async (req, res) => {
  try {
    await ensureTrainingTables();
    const courseId = toInt(req.params.id);
    const quizType = req.params.quizType === 'pre' ? 'pre' : 'post';
    const passScore = Math.max(0, Math.min(toInt(req.body.pass_score, 70), 100));
    const timeLimitMinutes = Math.max(0, Math.min(toInt(req.body.time_limit_minutes), 24 * 60));
    const title = quizType === 'pre' ? 'แบบทดสอบก่อนเรียน' : 'แบบทดสอบหลังเรียน';

    await pool.query(
      `INSERT INTO training_quizzes (course_id, quiz_type, title, pass_score, time_limit_minutes)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         title = VALUES(title),
         pass_score = VALUES(pass_score),
         time_limit_minutes = VALUES(time_limit_minutes)`,
      [courseId, quizType, title, passScore, timeLimitMinutes],
    );

    res.json({ message: 'บันทึกการตั้งค่าแบบทดสอบเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'บันทึกการตั้งค่าแบบทดสอบไม่สำเร็จ' });
  }
});

app.post('/api/admin/training/courses/:id/questions', async (req, res) => {
  try {
    await ensureTrainingTables();
    const courseId = toInt(req.params.id);
    const quizType = req.body.quiz_type === 'pre' ? 'pre' : 'post';
    const questionText = String(req.body.question_text || '').trim();
    const choices = Array.isArray(req.body.choices) ? req.body.choices : [];
    const correctIndex = toInt(req.body.correct_index);
    if (!questionText || choices.length < 2) return res.status(400).json({ error: 'กรุณาระบุคำถามและตัวเลือกอย่างน้อย 2 ตัวเลือก' });

    await pool.query(
      `INSERT INTO training_quizzes (course_id, quiz_type, title, pass_score)
       VALUES (?, ?, ?, 70)
       ON DUPLICATE KEY UPDATE quiz_id = LAST_INSERT_ID(quiz_id)`,
      [courseId, quizType, quizType === 'pre' ? 'แบบทดสอบก่อนเรียน' : 'แบบทดสอบหลังเรียน'],
    );
    const [quizRows]: any = await pool.query('SELECT quiz_id FROM training_quizzes WHERE quiz_id = LAST_INSERT_ID()');
    const quizId = quizRows[0].quiz_id;
    const [questionResult]: any = await pool.query(
      'INSERT INTO training_questions (quiz_id, question_text, sort_order) VALUES (?, ?, ?)',
      [quizId, questionText, toInt(req.body.sort_order)],
    );
    await pool.query(
      'INSERT INTO training_choices (question_id, choice_text, is_correct, sort_order) VALUES ?',
      [choices.map((choice: string, index: number) => [questionResult.insertId, String(choice || '').trim(), index === correctIndex ? 1 : 0, index + 1])],
    );
    res.json({ message: 'เพิ่มข้อสอบเรียบร้อยแล้ว', question_id: questionResult.insertId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เพิ่มข้อสอบไม่สำเร็จ' });
  }
});

app.get('/api/admin/training/courses/:id/evaluation-questions', async (req, res) => {
  try {
    await ensureTrainingTables();
    const courseId = toInt(req.params.id);
    const [questions]: any = await pool.query(
      `SELECT question_id, course_id, question_text, question_type, is_required, sort_order
       FROM training_evaluation_questions
       WHERE course_id = ?
       ORDER BY sort_order, question_id`,
      [courseId],
    );
    const questionIds = questions.map((question: any) => question.question_id);
    const [options]: any = questionIds.length > 0
      ? await pool.query(
          `SELECT option_id, question_id, option_text, sort_order
           FROM training_evaluation_options
           WHERE question_id IN (?)
           ORDER BY question_id, sort_order, option_id`,
          [questionIds],
        )
      : [[]];

    res.json(questions.map((question: any) => ({
      ...question,
      options: options.filter((option: any) => option.question_id === question.question_id),
    })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'ไม่สามารถดึงหัวข้อประเมินได้' });
  }
});

app.post('/api/admin/training/courses/:id/evaluation-questions', async (req, res) => {
  try {
    await ensureTrainingTables();
    const courseId = toInt(req.params.id);
    const questionText = String(req.body.question_text || '').trim();
    const questionType = normalizeEvaluationQuestionType(req.body.question_type);
    const options = Array.isArray(req.body.options) ? req.body.options.map((option: unknown) => String(option || '').trim()).filter(Boolean) : [];
    if (!questionText) return res.status(400).json({ error: 'กรุณาระบุหัวข้อการประเมิน' });
    if (['single_choice', 'multiple_choice'].includes(questionType) && options.length < 2) {
      return res.status(400).json({ error: 'คำถามแบบตัวเลือกต้องมีตัวเลือกอย่างน้อย 2 รายการ' });
    }

    const [result]: any = await pool.query(
      `INSERT INTO training_evaluation_questions
       (course_id, question_text, question_type, is_required, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
      [courseId, questionText, questionType, req.body.is_required === false ? 0 : 1, toInt(req.body.sort_order)],
    );
    if (options.length > 0) {
      await pool.query(
        'INSERT INTO training_evaluation_options (question_id, option_text, sort_order) VALUES ?',
        [options.map((option: string, index: number) => [result.insertId, option, index + 1])],
      );
    }
    res.json({ message: 'เพิ่มหัวข้อการประเมินเรียบร้อยแล้ว', question_id: result.insertId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เพิ่มหัวข้อการประเมินไม่สำเร็จ' });
  }
});

app.delete('/api/admin/training/evaluation-questions/:questionId', async (req, res) => {
  try {
    await ensureTrainingTables();
    await pool.query('DELETE FROM training_evaluation_questions WHERE question_id = ?', [req.params.questionId]);
    res.json({ message: 'ลบหัวข้อการประเมินเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'ลบหัวข้อการประเมินไม่สำเร็จ' });
  }
});

app.get('/api/admin/training/courses/:id/evaluation-report', async (req, res) => {
  try {
    await ensureTrainingTables();
    const courseId = toInt(req.params.id);
    const [questions]: any = await pool.query(
      `SELECT question_id, course_id, question_text, question_type, is_required, sort_order
       FROM training_evaluation_questions
       WHERE course_id = ?
       ORDER BY sort_order, question_id`,
      [courseId],
    );
    const [responses]: any = await pool.query(
      `SELECT r.response_id, r.enrollment_id, r.user_id,
              DATE_FORMAT(r.submitted_at, '%Y-%m-%d %H:%i:%s') AS submitted_at,
              u.Name_Surnam AS Name_Surname, u.position, u.Division_Province
       FROM training_evaluation_responses r
       INNER JOIN user u ON u.user_id = r.user_id
       WHERE r.course_id = ?
       ORDER BY r.submitted_at DESC`,
      [courseId],
    );
    const responseIds = responses.map((response: any) => response.response_id);
    const [answers]: any = responseIds.length > 0
      ? await pool.query(
          `SELECT a.response_id, a.question_id, a.answer_value
           FROM training_evaluation_answers a
           WHERE a.response_id IN (?)`,
          [responseIds],
        )
      : [[]];

    const summaries = questions.map((question: any) => {
      const questionAnswers = answers.filter((answer: any) => answer.question_id === question.question_id);
      if (question.question_type === 'rating') {
        const ratings = questionAnswers.map((answer: any) => Number(answer.answer_value)).filter((value: number) => Number.isFinite(value) && value > 0);
        return {
          ...question,
          total_answers: ratings.length,
          average_rating: ratings.length > 0 ? Number((ratings.reduce((sum: number, value: number) => sum + value, 0) / ratings.length).toFixed(2)) : null,
        };
      }

      if (question.question_type === 'single_choice' || question.question_type === 'multiple_choice') {
        const counts: Record<string, number> = {};
        questionAnswers.forEach((answer: any) => {
          let values: string[] = [];
          if (question.question_type === 'multiple_choice') {
            try { values = JSON.parse(answer.answer_value || '[]'); } catch { values = []; }
          } else if (answer.answer_value) {
            values = [String(answer.answer_value)];
          }
          values.forEach((value) => { counts[value] = (counts[value] || 0) + 1; });
        });
        return { ...question, total_answers: questionAnswers.length, option_counts: counts };
      }

      return {
        ...question,
        total_answers: questionAnswers.filter((answer: any) => String(answer.answer_value || '').trim()).length,
        text_answers: questionAnswers.map((answer: any) => String(answer.answer_value || '').trim()).filter(Boolean).slice(0, 30),
      };
    });

    res.json({
      response_count: responses.length,
      questions: summaries,
      responses: responses.map((response: any) => ({
        ...response,
        answers: answers
          .filter((answer: any) => answer.response_id === response.response_id)
          .map((answer: any) => ({ question_id: answer.question_id, answer_value: answer.answer_value })),
      })),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'ไม่สามารถดึงรายงานการประเมินได้' });
  }
});

app.get('/api/admin/training/report', async (_req, res) => {
  try {
    await ensureTrainingTables();
    const [rows]: any = await pool.query(`
      SELECT e.*, c.title, c.course_type, c.category, c.pass_score,
             u.Name_Surnam AS Name_Surname, u.position, u.Division_Province, u.Department
      FROM training_enrollments e
      INNER JOIN training_courses c ON c.course_id = e.course_id
      INNER JOIN user u ON u.user_id = e.user_id
      ORDER BY e.registered_at DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'ไม่สามารถดึงรายงานอบรมได้' });
  }
});

app.put('/api/admin/training/enrollments/:id/confirm', async (req, res) => {
  try {
    await ensureTrainingTables();
    const enrollmentId = toInt(req.params.id);
    const confirmed = req.body.confirmed === false ? 0 : 1;
    await pool.query(
      'UPDATE training_enrollments SET attendance_confirmed = ? WHERE enrollment_id = ?',
      [confirmed, enrollmentId],
    );
    res.json({ message: confirmed ? 'ยืนยันการเข้าอบรมเรียบร้อยแล้ว' : 'ยกเลิกการยืนยันเข้าอบรมแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'อัปเดตสถานะเข้าอบรมไม่สำเร็จ' });
  }
});

// ดึงสิทธิ์เมนูของผู้ใช้ตาม group (user_status)
app.get('/api/users/:id/menu-permissions', async (req, res) => {
  try {
    const { id } = req.params;
    await ensureDefaultMenuItems();

    // ดึง user_status (group_id) ของ user
    const [userRows]: any = await pool.query(
      'SELECT user_status FROM user WHERE user_id = ?', [id]
    );
    if (userRows.length === 0) return res.status(404).json({ error: 'ไม่พบผู้ใช้งาน' });

    const groupId = userRows[0].user_status;

    // ถ้าไม่มีกลุ่ม หรือตาราง group_permissions ยังไม่มีข้อมูล → คืน array เปล่า (แสดงทุกเมนู)
    if (!groupId) return res.json({ allowed: null }); // null = ไม่จำกัด

    // ดึงเมนูที่กลุ่มนี้มีสิทธิ์มองเห็น
    const [rows]: any = await pool.query(
      `SELECT m.menu_key
       FROM menu_items m
       INNER JOIN group_permissions gp ON m.menu_id = gp.menu_id
       WHERE gp.group_id = ? AND gp.can_view = 1 AND m.is_active = 1`,
      [groupId]
    );

    const allowed = rows.map((r: any) => r.menu_key);
    res.json({ allowed });
  } catch (error) {
    console.error(error);
    // ถ้าตารางยังไม่มี ให้คืน null (ไม่จำกัดสิทธิ์)
    res.json({ allowed: null });
  }
});

// ดึงรายการเมนูที่ผู้ใช้มองเห็นได้ พร้อมรายละเอียดสำหรับ sidebar / หน้าหลัก
app.get('/api/users/:id/menus', async (req, res) => {
  try {
    const { id } = req.params;
    await ensureDefaultMenuItems();

    const [userRows]: any = await pool.query(
      'SELECT user_status FROM user WHERE user_id = ?',
      [id]
    );
    if (userRows.length === 0) return res.status(404).json({ error: 'ไม่พบผู้ใช้งาน' });

    const groupId = userRows[0].user_status;
    if (!groupId) {
      const [rows]: any = await pool.query(
        `SELECT menu_id, menu_key, menu_name, menu_type, menu_icon, menu_href, sort_order, is_active
         FROM menu_items
         WHERE is_active = 1
         ORDER BY menu_type, sort_order, menu_name`
      );
      return res.json(rows);
    }

    const [rows]: any = await pool.query(
      `SELECT m.menu_id, m.menu_key, m.menu_name, m.menu_type, m.menu_icon, m.menu_href, m.sort_order, m.is_active
       FROM menu_items m
       INNER JOIN group_permissions gp ON m.menu_id = gp.menu_id
       WHERE gp.group_id = ? AND gp.can_view = 1 AND m.is_active = 1
       ORDER BY m.menu_type, m.sort_order, m.menu_name`,
      [groupId]
    );

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงรายการเมนู' });
  }
});

// เปลี่ยนรหัสผ่าน
app.post('/api/users/change-password', async (req, res) => {
  try {
    const { user_id, oldPassword, newPassword } = req.body;

    // 1. ค้นหาผู้ใช้
    const [users]: any = await pool.query(
      'SELECT password FROM user WHERE user_id = ?',
      [user_id]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'ไม่พบผู้ใช้งาน' });
    }

    const user = users[0];

    // 2. ตรวจสอบรหัสผ่านเดิม
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'รหัสผ่านเดิมไม่ถูกต้อง' });
    }

    // 3. Hash รหัสผ่านใหม่
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // 4. อัปเดตรหัสผ่านในฐานข้อมูล
    await pool.query(
      'UPDATE user SET password = ? WHERE user_id = ?',
      [hashedPassword, user_id]
    );

    res.json({ message: 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน' });
  }
});

// ====== USER SETTINGS: GROUPS & PERMISSIONS ======

// สร้างตาราง user_groups, menu_items, group_permissions (รัน 1 ครั้งหรือใช้ร่วมกับ migration)
app.post('/api/admin/setup-tables', async (_req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_groups (
        group_id INT AUTO_INCREMENT PRIMARY KEY,
        group_name VARCHAR(100) NOT NULL,
        group_description VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS menu_items (
        menu_id INT AUTO_INCREMENT PRIMARY KEY,
        menu_key VARCHAR(100) NOT NULL UNIQUE,
        menu_name VARCHAR(150) NOT NULL,
        menu_type ENUM('sidebar','content') NOT NULL DEFAULT 'sidebar',
        menu_icon VARCHAR(100),
        menu_href VARCHAR(255),
        sort_order INT DEFAULT 0,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS group_permissions (
        perm_id INT AUTO_INCREMENT PRIMARY KEY,
        group_id INT NOT NULL,
        menu_id INT NOT NULL,
        can_view TINYINT(1) DEFAULT 0,
        UNIQUE KEY uq_group_menu (group_id, menu_id),
        FOREIGN KEY (group_id) REFERENCES user_groups(group_id) ON DELETE CASCADE,
        FOREIGN KEY (menu_id) REFERENCES menu_items(menu_id) ON DELETE CASCADE
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);

    // Seed default menu items if empty
    const [existing]: any = await pool.query('SELECT COUNT(*) as cnt FROM menu_items');
    if (existing[0].cnt === 0) {
      await pool.query(`
        INSERT INTO menu_items (menu_key, menu_name, menu_type, menu_icon, menu_href, sort_order) VALUES
        ('home',            'หน้าหลัก',                   'sidebar',  'Home',        '/index',           1),
        ('profile',         'ข้อมูลส่วนตัว',               'sidebar',  'FileText',    '/profile',         2),
        ('training',        'ประวัติการอบรม',               'sidebar',  'ListTodo',    '/training-history', 3),
        ('change_password', 'เปลี่ยนรหัสผ่าน',             'sidebar',  'KeyRound',    '/change-password', 4),
        ('user_settings',   'ตั้งค่าผู้ใช้งาน',            'sidebar',  'Settings',    '/user-settings',   5),
        ('training_admin',  'จัดการระบบอบรม',             'sidebar',  'GraduationCap','/training-admin',  7),
        ('knowledge_admin', 'จัดการคลังความรู้',           'sidebar',  'LibraryBig',   '/knowledge-admin', 8),
        ('report_monitor',  'รายงานการกำกับติดตามฯ',        'content',  'Monitor',     '/program-monitoring', 10),
        ('report_course',   'หลักสูตรการอบรม',              'content',  'BookOpen',    '/training-courses', 11),
        ('report_usage',    'รายงานการใช้งานระบบ',          'content',  'Users',       '/system-usage-report', 12),
        ('report_security', 'รายงานการรักษาความปลอดภัย',   'content',  'ShieldCheck', '/office-security-report', 13),
        ('knowledge',       'คลังความรู้',                   'content',  'LibraryBig',   '/knowledge',       14),
        ('activity_calendar','ตารางกิจกรรม',                 'content',  'CalendarDays', '/activity-calendar', 15)
      `);
    } else {
      await pool.query(`
        UPDATE menu_items
        SET menu_href = CASE menu_key
          WHEN 'training' THEN '/training-history'
          WHEN 'report_monitor' THEN '/program-monitoring'
          WHEN 'report_course' THEN '/training-courses'
          WHEN 'report_usage' THEN '/system-usage-report'
          WHEN 'report_security' THEN '/office-security-report'
          WHEN 'knowledge_admin' THEN '/knowledge-admin'
          WHEN 'knowledge' THEN '/knowledge'
          WHEN 'activity_calendar' THEN '/activity-calendar'
          ELSE menu_href
        END
        WHERE menu_key IN ('training', 'report_monitor', 'report_course', 'report_usage', 'report_security', 'knowledge_admin', 'knowledge', 'activity_calendar')
          AND (menu_href IS NULL OR menu_href = '' OR menu_href = '#')
      `);
    }

    await ensureDefaultMenuItems();

    res.json({ message: 'ตารางถูกสร้างและตั้งค่าเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการสร้างตาราง' });
  }
});

// ดึงรายการกลุ่มผู้ใช้งานทั้งหมด
app.get('/api/admin/groups', async (_req, res) => {
  try {
    const [rows]: any = await pool.query(
      'SELECT * FROM user_groups ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// สร้างกลุ่มผู้ใช้งาน
app.post('/api/admin/groups', async (req, res) => {
  try {
    const { group_name, group_description } = req.body;
    if (!group_name?.trim()) return res.status(400).json({ error: 'กรุณาระบุชื่อกลุ่ม' });

    const [existing]: any = await pool.query(
      'SELECT group_id FROM user_groups WHERE LOWER(group_name) = LOWER(?)',
      [group_name.trim()]
    );
    if (existing.length > 0) {
      return res.status(400).json({ error: 'ชื่อกลุ่มนี้ถูกใช้งานแล้ว' });
    }

    const [result]: any = await pool.query(
      'INSERT INTO user_groups (group_name, group_description) VALUES (?, ?)',
      [group_name.trim(), group_description || '']
    );
    res.json({ message: 'สร้างกลุ่มเรียบร้อยแล้ว', group_id: result.insertId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการสร้างกลุ่ม' });
  }
});

// แก้ไขกลุ่มผู้ใช้งาน
app.put('/api/admin/groups/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { group_name, group_description } = req.body;
    if (!group_name?.trim()) return res.status(400).json({ error: 'กรุณาระบุชื่อกลุ่ม' });

    const [existing]: any = await pool.query(
      'SELECT group_id FROM user_groups WHERE LOWER(group_name) = LOWER(?) AND group_id != ?',
      [group_name.trim(), id]
    );
    if (existing.length > 0) {
      return res.status(400).json({ error: 'ชื่อกลุ่มนี้ถูกใช้งานแล้ว' });
    }

    await pool.query(
      'UPDATE user_groups SET group_name = ?, group_description = ? WHERE group_id = ?',
      [group_name.trim(), group_description || '', id]
    );
    res.json({ message: 'แก้ไขกลุ่มเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการแก้ไขกลุ่ม' });
  }
});

// ลบกลุ่มผู้ใช้งาน
app.delete('/api/admin/groups/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM user_groups WHERE group_id = ?', [id]);
    res.json({ message: 'ลบกลุ่มเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการลบกลุ่ม' });
  }
});

// ดึงรายการเมนูทั้งหมด
app.get('/api/admin/menus', async (_req, res) => {
  try {
    await ensureDefaultMenuItems();
    const [rows]: any = await pool.query(
      'SELECT * FROM menu_items ORDER BY menu_type, sort_order'
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// เพิ่มเมนูใหม่
app.post('/api/admin/menus', async (req, res) => {
  try {
    const { menu_key, menu_name, menu_type, menu_icon, menu_href, sort_order, is_active } = req.body;
    if (!menu_key?.trim() || !menu_name?.trim()) {
      return res.status(400).json({ error: 'กรุณากรอกชื่อเมนูและ Key' });
    }

    const [existing]: any = await pool.query(
      'SELECT menu_id FROM menu_items WHERE menu_key = ?',
      [menu_key.trim()]
    );
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Key เมนูนี้ถูกใช้งานแล้ว' });
    }

    const [result]: any = await pool.query(
      'INSERT INTO menu_items (menu_key, menu_name, menu_type, menu_icon, menu_href, sort_order, is_active) VALUES (?,?,?,?,?,?,?)',
      [menu_key.trim(), menu_name.trim(), menu_type || 'sidebar', menu_icon || '', menu_href || '#', sort_order || 0, is_active ?? 1]
    );
    res.json({ message: 'เพิ่มเมนูเรียบร้อยแล้ว', menu_id: result.insertId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเพิ่มเมนู' });
  }
});

// ดึงสิทธิ์ของกลุ่ม
app.get('/api/admin/groups/:id/permissions', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows]: any = await pool.query(
      `SELECT m.*, COALESCE(gp.can_view, 0) as can_view
       FROM menu_items m
       LEFT JOIN group_permissions gp ON m.menu_id = gp.menu_id AND gp.group_id = ?
       ORDER BY m.menu_type, m.sort_order`,
      [id]
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// บันทึกสิทธิ์ของกลุ่ม
app.post('/api/admin/groups/:id/permissions', async (req, res) => {
  try {
    const { id } = req.params;
    const { permissions } = req.body; // [{ menu_id, can_view }]

    // ลบสิทธิ์เดิมทั้งหมดของกลุ่มนี้
    await pool.query('DELETE FROM group_permissions WHERE group_id = ?', [id]);

    // เพิ่มสิทธิ์ใหม่
    if (permissions && permissions.length > 0) {
      const values = permissions.map((p: any) => [id, p.menu_id, p.can_view ? 1 : 0]);
      await pool.query(
        'INSERT INTO group_permissions (group_id, menu_id, can_view) VALUES ?',
        [values]
      );
    }

    res.json({ message: 'บันทึกสิทธิ์เรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการบันทึกสิทธิ์' });
  }
});

// แก้ไขเมนู
app.put('/api/admin/menus/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { menu_key, menu_name, menu_type, menu_icon, menu_href, sort_order, is_active } = req.body;
    if (!menu_key?.trim() || !menu_name?.trim()) {
      return res.status(400).json({ error: 'กรุณากรอกชื่อเมนูและ Key' });
    }

    const [existing]: any = await pool.query(
      'SELECT menu_id FROM menu_items WHERE menu_key = ? AND menu_id != ?',
      [menu_key.trim(), id]
    );
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Key เมนูนี้ถูกใช้งานแล้ว' });
    }

    await pool.query(
      'UPDATE menu_items SET menu_key=?, menu_name=?, menu_type=?, menu_icon=?, menu_href=?, sort_order=?, is_active=? WHERE menu_id=?',
      [menu_key.trim(), menu_name.trim(), menu_type || 'sidebar', menu_icon || '', menu_href || '#', sort_order || 0, is_active ?? 1, id]
    );
    res.json({ message: 'แก้ไขเมนูเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการแก้ไขเมนู' });
  }
});

// ลบเมนู
app.delete('/api/admin/menus/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM menu_items WHERE menu_id = ?', [id]);
    res.json({ message: 'ลบเมนูเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการลบเมนู' });
  }
});

// ดึงรายชื่อ user ทั้งหมดพร้อมกลุ่ม
app.get('/api/admin/users', async (_req, res) => {
  try {
    await ensureProfileAvatarColumn();
    const [rows]: any = await pool.query(
      `SELECT u.user_id, u.Name_Surnam AS Name_Surname, u.username, u.email, u.position,
              u.Division_Province, u.type, u.Department, u.National_ID_number, u.user_status,
              u.avatar_data_url,
              ug.group_name
       FROM user u
       LEFT JOIN user_groups ug ON u.user_status = ug.group_id
       ORDER BY u.Name_Surnam`
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// อัปเดตกลุ่มของ user (user_status = group_id)
app.put('/api/admin/users/:id/group', async (req, res) => {
  try {
    const { id } = req.params;
    const { group_id } = req.body;
    await pool.query(
      'UPDATE user SET user_status = ? WHERE user_id = ?',
      [group_id, id]
    );
    res.json({ message: 'อัปเดตกลุ่มผู้ใช้งานเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการอัปเดตกลุ่ม' });
  }
});

// เพิ่มผู้ใช้งานใหม่โดย Admin
app.post('/api/admin/users', async (req, res) => {
  try {
    const {
      Name_Surname, position, type, Division_Province, Department,
      email, National_ID_number, username, password, user_status
    } = req.body;

    // เช็ค username ซ้ำ
    const [usernameCheck]: any = await pool.query('SELECT user_id FROM user WHERE username = ?', [username]);
    if (usernameCheck.length > 0) return res.status(400).json({ error: 'ชื่อผู้ใช้งาน (username) นี้ถูกใช้งานแล้ว' });

    // เช็ค email ซ้ำ
    if (email) {
      const [emailCheck]: any = await pool.query('SELECT user_id FROM user WHERE email = ?', [email]);
      if (emailCheck.length > 0) return res.status(400).json({ error: 'อีเมลนี้ถูกใช้งานแล้ว' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    await pool.query(
      `INSERT INTO user 
       (Name_Surnam, position, type, Division_Province, Department, email, National_ID_number, username, password, registration_date, active_users, user_status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), '1', ?)`,
      [Name_Surname, position, type, Division_Province, Department, email || null, National_ID_number || null, username, hashedPassword, user_status || null]
    );

    res.json({ message: 'เพิ่มผู้ใช้งานเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการเพิ่มผู้ใช้งาน' });
  }
});

// แก้ไขข้อมูลผู้ใช้งานโดย Admin
app.put('/api/admin/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      Name_Surname, position, type, Division_Province, Department,
      email, National_ID_number, username, password, user_status
    } = req.body;

    // เช็ค username ซ้ำ (ยกเว้นตัวเอง)
    const [usernameCheck]: any = await pool.query('SELECT user_id FROM user WHERE username = ? AND user_id != ?', [username, id]);
    if (usernameCheck.length > 0) return res.status(400).json({ error: 'ชื่อผู้ใช้งาน (username) นี้ถูกใช้งานแล้ว' });

    // เช็ค email ซ้ำ (ยกเว้นตัวเอง)
    if (email) {
      const [emailCheck]: any = await pool.query('SELECT user_id FROM user WHERE email = ? AND user_id != ?', [email, id]);
      if (emailCheck.length > 0) return res.status(400).json({ error: 'อีเมลนี้ถูกใช้งานแล้ว' });
    }

    if (password) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      await pool.query(
        `UPDATE user SET 
         Name_Surnam=?, position=?, type=?, Division_Province=?, Department=?, email=?, National_ID_number=?, username=?, password=?, user_status=?
         WHERE user_id=?`,
        [Name_Surname, position, type, Division_Province, Department, email || null, National_ID_number || null, username, hashedPassword, user_status || null, id]
      );
    } else {
      await pool.query(
        `UPDATE user SET 
         Name_Surnam=?, position=?, type=?, Division_Province=?, Department=?, email=?, National_ID_number=?, username=?, user_status=?
         WHERE user_id=?`,
        [Name_Surname, position, type, Division_Province, Department, email || null, National_ID_number || null, username, user_status || null, id]
      );
    }

    res.json({ message: 'แก้ไขข้อมูลผู้ใช้งานเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการแก้ไขข้อมูลผู้ใช้งาน' });
  }
});

// ====== SYSTEM USAGE REPORT ======

// สร้างตาราง activity tracking
app.post('/api/admin/setup-usage-tables', async (_req, res) => {
  try {
    await ensureUsageTables();
    res.json({ message: 'ตาราง usage tracking ถูกสร้างเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
  }
});

// บันทึก login session
app.post('/api/usage/login-session', async (req, res) => {
  try {
    const { user_id, ip_address, user_agent } = req.body;
    await ensureUsageTables();
    // ปิด session เก่าที่ยังค้างอยู่
    await pool.query(
      'UPDATE user_sessions SET is_online = 0, logout_time = NOW() WHERE user_id = ? AND is_online = 1',
      [user_id]
    );
    const [result]: any = await pool.query(
      'INSERT INTO user_sessions (user_id, ip_address, user_agent, last_seen_at) VALUES (?, ?, ?, NOW())',
      [user_id, ip_address || '', user_agent || '']
    );
    res.json({ session_id: result.insertId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// บันทึก logout
app.post('/api/usage/logout-session', async (req, res) => {
  try {
    const { session_id, user_id } = req.body;
    await ensureUsageTables();
    if (session_id) {
      await pool.query(
        'UPDATE user_sessions SET is_online = 0, logout_time = NOW(), last_seen_at = NOW() WHERE session_id = ?',
        [session_id]
      );
    } else if (user_id) {
      await pool.query(
        'UPDATE user_sessions SET is_online = 0, logout_time = NOW(), last_seen_at = NOW() WHERE user_id = ? AND is_online = 1',
        [user_id]
      );
    }
    res.json({ message: 'ok' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// บันทึก activity log (เข้าเมนู)
app.post('/api/usage/log-activity', async (req, res) => {
  try {
    const { user_id, session_id, menu_key, menu_name, active_seconds } = req.body;
    await ensureUsageTables();
    if (active_seconds && active_seconds > 0) {
      // อัปเดต record ที่มีอยู่แล้ว (end_time)
      const sessionClause = session_id ? 'session_id = ?' : 'session_id IS NULL';
      const params = session_id
        ? [active_seconds, user_id, menu_key, session_id]
        : [active_seconds, user_id, menu_key];
      const [result]: any = await pool.query(
        `UPDATE user_activity_log SET end_time = NOW(), active_seconds = active_seconds + ?
         WHERE log_id = (
           SELECT log_id FROM (
             SELECT log_id FROM user_activity_log
             WHERE user_id = ? AND menu_key = ? AND ${sessionClause}
             ORDER BY start_time DESC LIMIT 1
           ) AS t
         )`,
        params
      );
      if (result.affectedRows === 0) {
        await pool.query(
          `INSERT INTO user_activity_log (user_id, session_id, menu_key, menu_name, end_time, active_seconds)
           VALUES (?, ?, ?, ?, NOW(), ?)`,
          [user_id, session_id || null, menu_key, menu_name, active_seconds]
        );
      }
      return res.json({ message: 'updated' });
    }
    const [result]: any = await pool.query(
      'INSERT INTO user_activity_log (user_id, session_id, menu_key, menu_name) VALUES (?, ?, ?, ?)',
      [user_id, session_id || null, menu_key, menu_name]
    );
    res.json({ log_id: result.insertId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Heartbeat - อัปเดตสถานะ online
app.post('/api/usage/heartbeat', async (req, res) => {
  try {
    const { session_id } = req.body;
    await ensureUsageTables();
    if (session_id) {
      const [result]: any = await pool.query(
        'UPDATE user_sessions SET is_online = 1, logout_time = NULL, last_seen_at = NOW() WHERE session_id = ?',
        [session_id]
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ ok: false, error: 'Session not found' });
      }
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ดึงสรุปข้อมูลรายงานการใช้งาน (รองรับ ?from=YYYY-MM-DD&to=YYYY-MM-DD)
app.get('/api/usage/summary', async (req, res) => {
  try {
    await ensureUsageTables();
    await closeStaleUsageSessions();
    const range = getDateRange(req.query);

    // จำนวนผู้ลงทะเบียนทั้งหมด (ไม่กรองตามช่วงเวลา)
    const [totalUsers]: any = await pool.query('SELECT COUNT(*) as count FROM user');

    // จำนวน unique users ที่ login ในช่วงเวลาที่เลือก
    let totalLogins = [{ count: 0 }];
    try {
      if (range) {
        const [r]: any = await pool.query(
          'SELECT COUNT(DISTINCT user_id) as count FROM user_sessions WHERE login_time >= ? AND DATE(login_time) >= ? AND DATE(login_time) <= ?',
          [USAGE_REPORT_RESET_AT, range.from, range.to]
        );
        totalLogins = r;
      } else {
        const [r]: any = await pool.query(
          'SELECT COUNT(DISTINCT user_id) as count FROM user_sessions WHERE login_time >= ?',
          [USAGE_REPORT_RESET_AT]
        );
        totalLogins = r;
      }
    } catch (_) { /* table may not exist */ }

    // จำนวนประเภทข้าราชการ
    const [govOfficers]: any = await pool.query("SELECT COUNT(*) as count FROM user WHERE type = 'ข้าราชการ'");
    // จำนวนประเภทพนักงานราชการ
    const [govEmployees]: any = await pool.query("SELECT COUNT(*) as count FROM user WHERE type = 'พนักงานราชการ'");

    res.json({
      totalRegistered: totalUsers[0]?.count || 0,
      totalLogins: totalLogins[0]?.count || 0,
      totalGovOfficers: govOfficers[0]?.count || 0,
      totalGovEmployees: govEmployees[0]?.count || 0,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ดึงตารางการใช้งานระบบพร้อมสถานะออนไลน์ (รองรับ ?from=YYYY-MM-DD&to=YYYY-MM-DD)
app.get('/api/usage/users-table', async (req, res) => {
  try {
    await ensureUsageTables();
    const range = getDateRange(req.query);

    try { await closeStaleUsageSessions(); } catch (_) { /* ignore */ }

    // สร้าง sub-query สำหรับกรองตามช่วงเวลา
    const sessionFilter = range
      ? 'AND login_time >= ? AND DATE(login_time) >= ? AND DATE(login_time) <= ?'
      : 'AND login_time >= ?';
    const activityFilter = range
      ? 'AND start_time >= ? AND DATE(start_time) >= ? AND DATE(start_time) <= ?'
      : 'AND start_time >= ?';
    const lastLoginFilter = range
      ? 'AND login_time >= ? AND DATE(login_time) >= ? AND DATE(login_time) <= ?'
      : 'AND login_time >= ?';
    const rangeParams = range
      ? [
          USAGE_REPORT_RESET_AT, range.from, range.to,
          USAGE_REPORT_RESET_AT, range.from, range.to,
          USAGE_REPORT_RESET_AT, range.from, range.to,
        ]
      : [USAGE_REPORT_RESET_AT, USAGE_REPORT_RESET_AT, USAGE_REPORT_RESET_AT];

    const [rows]: any = await pool.query(`
      SELECT 
        u.user_id, u.Name_Surnam AS Name_Surname, u.username, u.position, u.type,
        u.Division_Province,
        DATE_FORMAT(u.registration_date, '%Y-%m-%d %H:%i:%s') AS registration_date,
        CASE WHEN MAX(s_online.session_id) IS NULL THEN 0 ELSE 1 END AS is_online,
        DATE_FORMAT(MAX(s_online.last_seen_at), '%Y-%m-%d %H:%i:%s') AS last_seen_at,
        (SELECT DATE_FORMAT(MAX(COALESCE(last_seen_at, login_time)), '%Y-%m-%d %H:%i:%s') FROM user_sessions WHERE user_id = u.user_id ${lastLoginFilter}) AS last_login,
        (SELECT COUNT(*) FROM user_sessions WHERE user_id = u.user_id ${sessionFilter}) AS total_logins,
        (SELECT COALESCE(SUM(active_seconds), 0) FROM user_activity_log WHERE user_id = u.user_id ${activityFilter}) AS total_active_seconds
      FROM user u
      LEFT JOIN user_sessions s_online
        ON u.user_id = s_online.user_id
       AND s_online.is_online = 1
       AND s_online.logout_time IS NULL
       AND COALESCE(s_online.last_seen_at, s_online.login_time) BETWEEN DATE_SUB(NOW(), INTERVAL 2 MINUTE) AND DATE_ADD(NOW(), INTERVAL 30 SECOND)
      GROUP BY u.user_id
      ORDER BY CASE WHEN MAX(s_online.session_id) IS NULL THEN 0 ELSE 1 END DESC, u.Name_Surnam
    `, rangeParams);
    res.json(rows);
  } catch (error) {
    console.error(error);
    // fallback ถ้า table ยังไม่มี
    try {
      const [rows]: any = await pool.query(`
        SELECT u.user_id, u.Name_Surnam AS Name_Surname, u.username, u.position, u.type,
               u.Division_Province, u.registration_date,
               0 AS is_online, NULL AS last_login, 0 AS total_logins, 0 AS total_active_seconds
        FROM user u ORDER BY u.Name_Surnam
      `);
      res.json(rows);
    } catch (e2) {
      console.error(e2);
      res.status(500).json({ error: 'Server error' });
    }
  }
});

// ดึงรายละเอียดประวัติการใช้งานของ user (รองรับ ?from=YYYY-MM-DD&to=YYYY-MM-DD)
app.get('/api/usage/user-history/:userId', async (req, res) => {
  try {
    await ensureUsageTables();
    const { userId } = req.params;
    const range = getDateRange(req.query);

    const dateFilter = range
      ? 'AND start_time >= ? AND DATE(start_time) >= ? AND DATE(start_time) <= ?'
      : 'AND start_time >= ?';
    const params = range
      ? [userId, USAGE_REPORT_RESET_AT, range.from, range.to]
      : [userId, USAGE_REPORT_RESET_AT];

    const [rows]: any = await pool.query(`
      SELECT 
        created_date AS date,
        menu_key, menu_name,
        SUM(active_seconds) AS total_seconds,
        COUNT(*) AS visit_count,
        DATE_FORMAT(MIN(start_time), '%Y-%m-%d %H:%i:%s') AS first_visit,
        DATE_FORMAT(MAX(COALESCE(end_time, start_time)), '%Y-%m-%d %H:%i:%s') AS last_visit
      FROM user_activity_log
      WHERE user_id = ? ${dateFilter}
      GROUP BY created_date, menu_key, menu_name
      ORDER BY created_date DESC, menu_name
    `, params);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.json([]);
  }
});

const PORT = process.env.PORT || 3001;
app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT} (accessible from LAN)`);
});
