import crypto from 'node:crypto';
import { pool } from '../src/lib/dbconnect.js';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

async function ensureUsageTables() {
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
}

async function createLoginSession(userId: number, req: any) {
  let sessionId: number | null = null;

  try {
    await ensureUsageTables();
    await pool.query(
      'UPDATE user_sessions SET is_online = 0, logout_time = NOW() WHERE user_id = ? AND is_online = 1',
      [userId],
    );
    const [sessionResult]: any = await pool.query(
      'INSERT INTO user_sessions (user_id, ip_address, user_agent, last_seen_at) VALUES (?, ?, ?, NOW())',
      [userId, req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '', req.headers['user-agent'] || ''],
    );
    sessionId = sessionResult.insertId;
  } catch (_) {
    // ตาราง session ไม่ควรทำให้ LINE login ล้มเหลว
  }

  return sessionId;
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

async function consumeLineOAuthState(state: string) {
  const stateHash = hashLineState(state);
  const [rows]: any = await pool.query(
    `SELECT state_id, mode, user_id
     FROM line_oauth_states
     WHERE state_hash = ? AND used_at IS NULL AND expires_at > NOW()
     LIMIT 1`,
    [stateHash],
  );

  if (rows.length === 0) {
    throw new Error('LINE login state หมดอายุหรือไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง');
  }

  await pool.query('UPDATE line_oauth_states SET used_at = NOW() WHERE state_id = ?', [rows[0].state_id]);
  return rows[0] as { state_id: number; mode: 'login' | 'link'; user_id: number | null };
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

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(renderLineMessagePage('Method not allowed', 'LINE callback รองรับเฉพาะ GET เท่านั้น'));
    return;
  }

  try {
    await ensureLineLoginSchema();

    const oauthError = typeof req.query?.error === 'string' ? req.query.error : '';
    if (oauthError) {
      const description = typeof req.query?.error_description === 'string'
        ? req.query.error_description
        : 'ผู้ใช้ยกเลิกหรือ LINE ปฏิเสธการอนุญาต';
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(renderLineMessagePage('LINE Login ไม่สำเร็จ', description));
      return;
    }

    const code = typeof req.query?.code === 'string' ? req.query.code : '';
    const state = typeof req.query?.state === 'string' ? req.query.state : '';
    if (!code || !state) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(renderLineMessagePage('LINE Login ไม่สำเร็จ', 'ข้อมูล callback จาก LINE ไม่ครบถ้วน กรุณาลองใหม่อีกครั้ง'));
      return;
    }

    const stateRecord = await consumeLineOAuthState(state);
    const token = await exchangeLineCodeForToken(code, getLineConfig(req));
    const lineProfile = await fetchLineProfile(token.access_token);

    if (stateRecord.mode === 'link') {
      if (!stateRecord.user_id) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(renderLineMessagePage('เชื่อมบัญชี LINE ไม่สำเร็จ', 'ไม่พบรหัสผู้ใช้สำหรับเชื่อมบัญชี LINE กรุณาเข้าสู่ระบบแล้วลองใหม่'));
        return;
      }

      const [linkedUsers]: any = await pool.query(
        'SELECT user_id FROM user WHERE line_user_id = ? AND user_id != ? LIMIT 1',
        [lineProfile.userId, stateRecord.user_id],
      );
      if (linkedUsers.length > 0) {
        res.statusCode = 409;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(renderLineMessagePage('เชื่อมบัญชี LINE ไม่สำเร็จ', 'บัญชี LINE นี้ถูกเชื่อมกับสมาชิกคนอื่นแล้ว'));
        return;
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
        ],
      );

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(renderLineRedirectPage('/profile?line_linked=1', 'เชื่อมบัญชี LINE เรียบร้อยแล้ว'));
      return;
    }

    const [users]: any = await pool.query(
      `SELECT user_id, Name_Surnam, position, Division_Province, avatar_data_url
       FROM user
       WHERE line_user_id = ?
       LIMIT 1`,
      [lineProfile.userId],
    );

    if (users.length === 0) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(renderLineMessagePage(
        'ยังไม่ได้เชื่อมบัญชี LINE',
        'กรุณาเข้าสู่ระบบด้วยชื่อผู้ใช้งานและรหัสผ่านก่อน แล้วกด “เชื่อมบัญชี LINE” ที่หน้าโปรไฟล์',
      ));
      return;
    }

    const user = users[0];
    await pool.query(
      'UPDATE user SET line_display_name = ?, line_picture_url = ? WHERE user_id = ?',
      [lineProfile.displayName || null, lineProfile.pictureUrl || null, user.user_id],
    );

    const sessionId = await createLoginSession(user.user_id, req);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(renderLineLoginSuccessPage({
      user_id: user.user_id,
      Name_Surname: user.Name_Surnam,
      position: user.position,
      Division_Province: user.Division_Province,
      avatar_data_url: user.avatar_data_url || null,
    }, sessionId));
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(renderLineMessagePage(
      'LINE Login ไม่สำเร็จ',
      error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการทำรายการ LINE Login',
    ));
  }
}
