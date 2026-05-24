import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { pool } from './src/lib/dbconnect.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));

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
let activityCalendarTablesReady: Promise<void> | null = null;
let passwordResetTokensReady: Promise<void> | null = null;

const DEFAULT_MENU_ITEMS = [
  ['home', 'หน้าหลัก', 'sidebar', 'Home', '/index', 1],
  ['profile', 'ข้อมูลส่วนตัว', 'sidebar', 'FileText', '/profile', 2],
  ['training', 'ประวัติการอบรม', 'sidebar', 'ListTodo', '/training-history', 3],
  ['change_password', 'เปลี่ยนรหัสผ่าน', 'sidebar', 'KeyRound', '/change-password', 4],
  ['user_settings', 'ตั้งค่าผู้ใช้งาน', 'sidebar', 'Settings', '/user-settings', 5],
  ['monitor_data', 'บันทึกกำกับติดตามกลุ่มเทคฯ', 'sidebar', 'ClipboardEdit', '/monitor-data', 6],
  ['training_admin', 'จัดการระบบอบรม', 'sidebar', 'GraduationCap', '/training-admin', 7],
  ['knowledge_admin', 'จัดการคลังความรู้', 'sidebar', 'LibraryBig', '/knowledge-admin', 8],
  ['report_monitor', 'รายงานการกำกับติดตามฯ', 'content', 'Monitor', '/program-monitoring', 10],
  ['report_course', 'หลักสูตรการอบรม', 'content', 'BookOpen', '/training-courses', 11],
  ['report_usage', 'รายงานการใช้งานระบบ', 'content', 'Users', '/system-usage-report', 12],
  ['report_security', 'รายงานการรักษาความปลอดภัย', 'content', 'ShieldCheck', '/office-security-report', 13],
  ['knowledge', 'คลังความรู้', 'content', 'LibraryBig', '/knowledge', 14],
  ['activity_calendar', 'ตารางกิจกรรม', 'content', 'CalendarDays', '/activity-calendar', 15],
];
const GOOGLE_DRIVE_AVATAR_FOLDER_ID = '1aaQIZ3nUcr0iDLOq8xENFpM_halgcndE';
const GOOGLE_AVATAR_UPLOAD_SCRIPT_URL = process.env.GOOGLE_AVATAR_UPLOAD_SCRIPT_URL || GOOGLE_MONITOR_SCRIPT_URL;
const GOOGLE_PASSWORD_RESET_SCRIPT_URL = process.env.GOOGLE_PASSWORD_RESET_SCRIPT_URL || GOOGLE_AVATAR_UPLOAD_SCRIPT_URL;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RESET_TOKEN_TTL_MINUTES = 30;

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

function isValidAvatarDataUrl(value: unknown) {
  if (value === null || value === undefined || value === '') return true;
  if (typeof value !== 'string') return false;
  if (/^https:\/\/(drive\.google\.com|lh3\.googleusercontent\.com|googleusercontent\.com)\//i.test(value)) return true;
  return /^data:image\/(jpeg|jpg|png|webp|gif|avif|bmp|svg\+xml|tiff|heic|heif);base64,[A-Za-z0-9+/=\s]+$/i.test(value);
}

function sanitizeAvatarFileName(value: unknown, fallbackName = 'avatar') {
  const raw = typeof value === 'string' && value.trim() ? value.trim() : fallbackName;
  return raw.replace(/[\\/:*?"<>|#%{}~&]/g, '-').replace(/\s+/g, '-').slice(0, 120);
}

function extractGoogleDriveFileId(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return '';

  const raw = value.trim();

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

  const response = await fetch(GOOGLE_AVATAR_UPLOAD_SCRIPT_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action: 'deleteAvatar',
      fileId,
    }),
  });

  const text = await response.text();
  if (!response.ok) throw new Error(text || 'Cannot delete avatar from Google Drive');
  if (/script function not found|<!doctype|<html/i.test(text)) {
    throw new Error('Google Apps Script ยังไม่รองรับการลบรูปจาก Google Drive');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Google Apps Script ส่งผลลัพธ์การลบรูปกลับมาไม่ถูกต้อง');
  }

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
  const response = await fetch(GOOGLE_AVATAR_UPLOAD_SCRIPT_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });

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
    let session_id: number | null = null;
    try {
      await ensureUsageTables();
      await pool.query(
        'UPDATE user_sessions SET is_online = 0, logout_time = NOW() WHERE user_id = ? AND is_online = 1',
        [user.user_id]
      );
      const [sResult]: any = await pool.query(
        'INSERT INTO user_sessions (user_id, ip_address, user_agent, last_seen_at) VALUES (?, ?, ?, NOW())',
        [user.user_id, req.ip || '', req.headers['user-agent'] || '']
      );
      session_id = sResult.insertId;
    } catch (_) {
      // ตารางอาจยังไม่มี ข้ามไป
    }

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
    const [rows]: any = await pool.query(
      'SELECT Name_Surnam as Name_Surname, position, type, Division_Province, Department, email, National_ID_number, username, avatar_data_url FROM user WHERE user_id = ?',
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

    if (!mime_type || typeof mime_type !== 'string' || !mime_type.startsWith('image/')) {
      return res.status(400).json({ error: 'ไฟล์ที่อัปโหลดต้องเป็นรูปภาพเท่านั้น' });
    }

    const safeName = sanitizeAvatarFileName(display_name || user_id || 'user');
    const safeFileName = sanitizeAvatarFileName(file_name || `${safeName}-avatar.webp`);
    const response = await fetch(GOOGLE_AVATAR_UPLOAD_SCRIPT_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'uploadAvatar',
        folderId: GOOGLE_DRIVE_AVATAR_FOLDER_ID,
        userId: user_id || '',
        displayName: display_name || '',
        fileName: `${Date.now()}-${safeFileName}`,
        mimeType: mime_type,
        base64,
      }),
    });

    const text = await response.text();
    if (!response.ok) throw new Error(text || 'Cannot upload avatar to Google Drive');
    if (/script function not found|<!doctype|<html/i.test(text)) {
      throw new Error('Google Apps Script ยังไม่รองรับการอัปโหลดรูปไป Google Drive');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('Google Apps Script ส่งผลลัพธ์กลับมาไม่ถูกต้อง');
    }

    if (parsed?.ok === false) {
      throw new Error(getAvatarUploadErrorMessage(parsed.error || 'อัปโหลดรูปไป Google Drive ไม่สำเร็จ'));
    }

    res.json(parsed);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error instanceof Error
        ? error.message
        : 'ไม่สามารถอัปโหลดรูปประจำตัวไปยัง Google Drive ได้',
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
    const allDay = body.all_day ? 1 : 0;
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
        body.all_day ? 1 : 0,
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

    const [result]: any = await pool.query(
      `INSERT INTO training_courses
       (title, category, course_type, status, thumbnail_url, instructor, target_group,
        learning_objectives, learning_topics, content_summary, evaluation_method, description,
        duration_minutes, zoom_url, location, pass_score, certificate_enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        String(body.title || '').trim(),
        String(body.category || '').trim(),
        normalizeCourseType(body.course_type),
        normalizeTrainingStatus(body.status),
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
    await pool.query(
      `UPDATE training_courses SET
       title=?, category=?, course_type=?, status=?, thumbnail_url=?, instructor=?, target_group=?,
       learning_objectives=?, learning_topics=?, content_summary=?, evaluation_method=?, description=?,
       duration_minutes=?, zoom_url=?, location=?, pass_score=?, certificate_enabled=?
       WHERE course_id=?`,
      [
        String(body.title || '').trim(),
        String(body.category || '').trim(),
        normalizeCourseType(body.course_type),
        normalizeTrainingStatus(body.status),
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
