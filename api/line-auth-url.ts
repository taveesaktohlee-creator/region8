import crypto from 'node:crypto';
import { pool } from '../src/lib/dbconnect.js';

const LINE_OAUTH_STATE_TTL_MINUTES = 10;

function sendJson(res: any, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
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

async function ensureColumn(tableName: string, columnName: string, definition: string) {
  const [rows]: any = await pool.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName],
  );

  if (rows.length === 0) {
    try {
      await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    } catch (error: any) {
      if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }
}

async function ensureLineLoginSchema() {
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
}

function getAppBaseUrl(req: any) {
  const configured = process.env.APP_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');

  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const proto = forwardedProto || 'https';
  const host = forwardedHost || req.headers.host;
  return `${proto}://${host}`.replace(/\/+$/, '');
}

function getLineConfig(req: any) {
  const channelId = process.env.LINE_CHANNEL_ID?.trim();
  const channelSecret = process.env.LINE_CHANNEL_SECRET?.trim();
  const redirectUri = process.env.LINE_REDIRECT_URI?.trim() || `${getAppBaseUrl(req)}/api/line/callback`;

  if (!channelId || !channelSecret) {
    throw new Error('ยังไม่ได้ตั้งค่า LINE_CHANNEL_ID และ LINE_CHANNEL_SECRET บนเซิร์ฟเวอร์');
  }

  return { channelId, redirectUri };
}

function hashLineState(state: string) {
  return crypto.createHash('sha256').update(state).digest('hex');
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const body = await readBody(req);
    const mode = body?.mode === 'link' ? 'link' : body?.mode === 'login' ? 'login' : '';
    const userId = Number(body?.user_id);

    if (!mode) {
      sendJson(res, 400, { error: 'LINE login mode ไม่ถูกต้อง' });
      return;
    }
    if (mode === 'link' && (!Number.isFinite(userId) || userId <= 0)) {
      sendJson(res, 400, { error: 'ไม่พบรหัสผู้ใช้สำหรับเชื่อมบัญชี LINE' });
      return;
    }

    await ensureLineLoginSchema();
    const config = getLineConfig(req);

    if (mode === 'link') {
      const [users]: any = await pool.query('SELECT user_id FROM user WHERE user_id = ? LIMIT 1', [userId]);
      if (users.length === 0) {
        sendJson(res, 404, { error: 'ไม่พบข้อมูลผู้ใช้สำหรับเชื่อมบัญชี LINE' });
        return;
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
        req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '',
        req.headers['user-agent'] || '',
      ],
    );

    const authUrl = new URL('https://access.line.me/oauth2/v2.1/authorize');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', config.channelId);
    authUrl.searchParams.set('redirect_uri', config.redirectUri);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('scope', 'profile');

    sendJson(res, 200, { authUrl: authUrl.toString() });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'ไม่สามารถเริ่ม LINE Login ได้',
    });
  }
}
