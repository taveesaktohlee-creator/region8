import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || '157.85.98.50',
  port: Number(process.env.DB_PORT) || 3307,
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'isr8',
  timezone: '+07:00',
  dateStrings: true,
  waitForConnections: true,
  connectionLimit: 2,
  queueLimit: 0,
});

function sendJson(res: any, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(JSON.stringify(payload));
}

async function readBody(req: any) {
  if (req.body) return req.body;

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

function getClientIp(req: any) {
  const forwardedFor = req.headers?.['x-forwarded-for'];
  const value = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  return String(value || '').split(',')[0].trim();
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

async function getUserByUsername(username: string) {
  try {
    const [users]: any = await pool.query(
      `SELECT user_id, username, password, Name_Surnam, position, Division_Province, avatar_data_url
       FROM user
       WHERE username = ?
       LIMIT 1`,
      [username]
    );
    return users;
  } catch (error: any) {
    if (error?.code !== 'ER_BAD_FIELD_ERROR' || !String(error?.message || '').includes('avatar_data_url')) {
      throw error;
    }

    const [users]: any = await pool.query(
      `SELECT user_id, username, password, Name_Surnam, position, Division_Province
       FROM user
       WHERE username = ?
       LIMIT 1`,
      [username]
    );
    return users.map((user: any) => ({ ...user, avatar_data_url: null }));
  }
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
    const username = String(body?.username || '').trim();
    const password = String(body?.password || '');

    if (!username || !password) {
      sendJson(res, 400, { error: 'กรุณากรอกชื่อผู้ใช้งานและรหัสผ่าน' });
      return;
    }

    const users = await getUserByUsername(username);
    if (users.length === 0) {
      sendJson(res, 401, { error: 'ชื่อผู้ใช้งานไม่ถูกต้อง', field: 'username' });
      return;
    }

    const user = users[0];
    const isMatch = await bcrypt.compare(password, String(user.password || ''));
    if (!isMatch) {
      sendJson(res, 401, { error: 'รหัสผ่านไม่ถูกต้อง', field: 'password' });
      return;
    }

    let session_id: number | null = null;
    try {
      await ensureUsageTables();
      await pool.query(
        'UPDATE user_sessions SET is_online = 0, logout_time = NOW() WHERE user_id = ? AND is_online = 1',
        [user.user_id]
      );
      const [sessionResult]: any = await pool.query(
        'INSERT INTO user_sessions (user_id, ip_address, user_agent, last_seen_at) VALUES (?, ?, ?, NOW())',
        [user.user_id, getClientIp(req), String(req.headers?.['user-agent'] || '')]
      );
      session_id = Number(sessionResult?.insertId) || null;
    } catch (error) {
      console.error('Cannot create usage session', error);
    }

    sendJson(res, 200, {
      message: 'เข้าสู่ระบบสำเร็จ',
      user: {
        user_id: user.user_id,
        Name_Surname: user.Name_Surnam,
        position: user.position,
        Division_Province: user.Division_Province,
        avatar_data_url: user.avatar_data_url || null,
      },
      session_id,
    });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ' });
  }
}
