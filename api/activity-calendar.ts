import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import { sendLineTopicNotification } from '../src/lib/lineGroupNotifications.js';

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

const DEFAULT_ACTIVITY_MENU = ['activity_calendar', 'ตารางกิจกรรม', 'content', 'CalendarDays', '/activity-calendar', 15];

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

function toInt(value: unknown, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBooleanFlag(value: unknown) {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return value === 1 ? 1 : 0;
  const text = String(value ?? '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(text) ? 1 : 0;
}

function pad2(value: number) {
  return String(value).padStart(2, '0');
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

function getAppBaseUrl(req: any) {
  const configured = process.env.APP_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const proto = forwardedProto || 'https';
  const host = forwardedHost || req.headers.host || 'region8.vercel.app';
  return `${proto}://${host}`.replace(/\/+$/, '');
}

function getRoutePath(req: any) {
  const value = req.query?.path;
  const raw = Array.isArray(value) ? value.join('/') : String(value || '');
  return raw.replace(/^\/+|\/+$/g, '');
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
}

async function ensureActivityMenu() {
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
    DEFAULT_ACTIVITY_MENU,
  );

  await pool.query(`
    INSERT INTO group_permissions (group_id, menu_id, can_view)
    SELECT g.group_id, m.menu_id, 1
    FROM user_groups g
    JOIN menu_items m ON m.menu_key = 'activity_calendar'
    LEFT JOIN group_permissions gp ON gp.group_id = g.group_id AND gp.menu_id = m.menu_id
    WHERE gp.perm_id IS NULL
  `);
}

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

async function setupActivityCalendar(res: any) {
  await ensureActivityCalendarTables();
  await ensureActivityMenu();
  return sendJson(res, 200, { message: 'ตารางกิจกรรมถูกสร้างเรียบร้อยแล้ว' });
}

async function listEvents(req: any, res: any) {
  await ensureActivityCalendarTables();
  const userId = toInt(req.query.user_id);
  if (!userId) return sendJson(res, 400, { error: 'ไม่พบรหัสผู้ใช้งาน' });

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

  return sendJson(res, 200, {
    events: attachActivityConflicts(rows, userId),
    google: connections[0] || null,
  });
}

async function createEvent(req: any, res: any) {
  await ensureActivityCalendarTables();
  const body = await readBody(req);
  const userId = toInt(body.user_id);
  const title = String(body.title || '').trim();
  const startAt = toMysqlLocalDateTime(body.start_at);
  const endAt = toMysqlLocalDateTime(body.end_at);
  const allDay = toBooleanFlag(body.all_day);
  if (!userId) return sendJson(res, 400, { error: 'ไม่พบรหัสผู้ใช้งาน' });
  if (!title) return sendJson(res, 400, { error: 'กรุณาระบุชื่อกิจกรรม' });
  if (!startAt || !endAt || Date.parse(`${endAt.replace(' ', 'T')}+07:00`) <= Date.parse(`${startAt.replace(' ', 'T')}+07:00`)) {
    return sendJson(res, 400, { error: 'กรุณาระบุเวลาเริ่มและเวลาสิ้นสุดให้ถูกต้อง' });
  }

  const [users]: any = await pool.query('SELECT Name_Surnam FROM user WHERE user_id = ? LIMIT 1', [userId]);
  if (users.length === 0) return sendJson(res, 404, { error: 'ไม่พบผู้ใช้งาน' });

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
  return sendJson(res, 200, { message: 'เพิ่มกิจกรรมเรียบร้อยแล้ว', event_id: result.insertId });
}

async function updateEvent(req: any, res: any, eventId: number) {
  await ensureActivityCalendarTables();
  const body = await readBody(req);
  const userId = toInt(body.user_id);
  const title = String(body.title || '').trim();
  const startAt = toMysqlLocalDateTime(body.start_at);
  const endAt = toMysqlLocalDateTime(body.end_at);
  if (!eventId || !userId) return sendJson(res, 400, { error: 'ข้อมูลกิจกรรมไม่ครบถ้วน' });
  if (!title) return sendJson(res, 400, { error: 'กรุณาระบุชื่อกิจกรรม' });
  if (!startAt || !endAt || Date.parse(`${endAt.replace(' ', 'T')}+07:00`) <= Date.parse(`${startAt.replace(' ', 'T')}+07:00`)) {
    return sendJson(res, 400, { error: 'กรุณาระบุเวลาเริ่มและเวลาสิ้นสุดให้ถูกต้อง' });
  }

  const [rows]: any = await pool.query(
    'SELECT event_id FROM activity_events WHERE event_id = ? AND created_by_user_id = ? AND source = "system" LIMIT 1',
    [eventId, userId],
  );
  if (rows.length === 0) return sendJson(res, 403, { error: 'แก้ไขได้เฉพาะกิจกรรมที่คุณสร้างเท่านั้น' });

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
  return sendJson(res, 200, { message: 'แก้ไขกิจกรรมเรียบร้อยแล้ว' });
}

async function deleteEvent(req: any, res: any, eventId: number) {
  await ensureActivityCalendarTables();
  const body = req.method === 'DELETE' ? {} : await readBody(req);
  const userId = toInt(req.query.user_id || body.user_id);
  if (!eventId || !userId) return sendJson(res, 400, { error: 'ข้อมูลกิจกรรมไม่ครบถ้วน' });
  const [result]: any = await pool.query(
    'DELETE FROM activity_events WHERE event_id = ? AND created_by_user_id = ? AND source = "system"',
    [eventId, userId],
  );
  if (result.affectedRows === 0) return sendJson(res, 403, { error: 'ลบได้เฉพาะกิจกรรมที่คุณสร้างเท่านั้น' });
  return sendJson(res, 200, { message: 'ลบกิจกรรมเรียบร้อยแล้ว' });
}

async function googleConnectUrl(req: any, res: any) {
  await ensureActivityCalendarTables();
  const userId = toInt(req.query.user_id);
  if (!userId) return sendJson(res, 400, { error: 'ไม่พบรหัสผู้ใช้งาน' });
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
  return sendJson(res, 200, { url: url.toString() });
}

async function googleCallback(req: any, res: any) {
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
    } catch {
      googleEmail = '';
    }

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

    res.statusCode = 302;
    res.setHeader('Location', `${getAppBaseUrl(req)}/activity-calendar?google=connected`);
    res.end();
  } catch (error) {
    console.error(error);
    res.statusCode = 302;
    res.setHeader('Location', `${getAppBaseUrl(req)}/activity-calendar?google=error`);
    res.end();
  }
}

async function googleSync(req: any, res: any) {
  let userId = 0;
  try {
    await ensureActivityCalendarTables();
    const body = await readBody(req);
    userId = toInt(body.user_id);
    if (!userId) return sendJson(res, 400, { error: 'ไม่พบรหัสผู้ใช้งาน' });
    const config = getGoogleCalendarConfig();
    const [connections]: any = await pool.query(
      `SELECT * FROM activity_google_connections WHERE user_id = ? AND sync_enabled = 1 LIMIT 1`,
      [userId],
    );
    if (connections.length === 0) return sendJson(res, 404, { error: 'ยังไม่ได้เชื่อม Google Calendar' });

    const accessToken = await getActivityGoogleAccessToken(connections[0], config);
    const lookbackDays = Math.max(0, toInt(process.env.GOOGLE_CALENDAR_SYNC_LOOKBACK_DAYS, 30));
    const lookaheadDays = Math.max(1, toInt(process.env.GOOGLE_CALENDAR_SYNC_LOOKAHEAD_DAYS, 365));
    const timeMinDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
    const timeMaxDate = new Date(Date.now() + lookaheadDays * 24 * 60 * 60 * 1000);
    const googleEmail = connections[0].google_email || 'Google Calendar';

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
    return sendJson(res, 200, { message: 'ซิงก์ Google Calendar เรียบร้อยแล้ว', synced_count: inserted, calendar_count: calendars.length });
  } catch (error) {
    if (isActivityGoogleReconnectRequired(error)) {
      if (userId) await clearActivityGoogleConnection(userId);
      return sendJson(res, 401, {
        error: error.message,
        reconnect_required: true,
      });
    }
    throw error;
  }
}

async function googleDisconnect(req: any, res: any) {
  await ensureActivityCalendarTables();
  const body = req.method === 'DELETE' ? {} : await readBody(req);
  const userId = toInt(req.query.user_id || body.user_id);
  if (!userId) return sendJson(res, 400, { error: 'ไม่พบรหัสผู้ใช้งาน' });
  await pool.query('DELETE FROM activity_events WHERE created_by_user_id = ? AND source = "google"', [userId]);
  await pool.query('DELETE FROM activity_google_connections WHERE user_id = ?', [userId]);
  return sendJson(res, 200, { message: 'ยกเลิกการเชื่อม Google Calendar แล้ว' });
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const path = getRoutePath(req);

  try {
    if (path === 'setup' && req.method === 'POST') return await setupActivityCalendar(res);
    if (path === 'events' && req.method === 'GET') return await listEvents(req, res);
    if (path === 'events' && req.method === 'POST') return await createEvent(req, res);

    const eventMatch = path.match(/^events\/(\d+)$/);
    if (eventMatch && req.method === 'PUT') return await updateEvent(req, res, toInt(eventMatch[1]));
    if (eventMatch && req.method === 'DELETE') return await deleteEvent(req, res, toInt(eventMatch[1]));

    if (path === 'google/connect-url' && req.method === 'GET') return await googleConnectUrl(req, res);
    if (path === 'google/callback' && req.method === 'GET') return await googleCallback(req, res);
    if (path === 'google/sync' && req.method === 'POST') return await googleSync(req, res);
    if (path === 'google/disconnect' && req.method === 'DELETE') return await googleDisconnect(req, res);

    return sendJson(res, 404, { error: 'ไม่พบ API ตารางกิจกรรม' });
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'ไม่สามารถจัดการตารางกิจกรรมได้',
    });
  }
}
