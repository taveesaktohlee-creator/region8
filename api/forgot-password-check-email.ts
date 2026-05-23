import mysql from 'mysql2/promise';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const pool = mysql.createPool({
  host: process.env.DB_HOST || '157.85.98.50',
  port: Number(process.env.DB_PORT) || 3307,
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || '041853671',
  database: process.env.DB_NAME || 'isr8',
  timezone: '+07:00',
  dateStrings: true,
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

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
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
    const email = normalizeEmail(body?.email);
    if (!email || !EMAIL_RE.test(email)) {
      sendJson(res, 400, { error: 'กรุณากรอกอีเมลให้ถูกต้อง' });
      return;
    }

    const [users]: any = await pool.query(
      'SELECT user_id FROM user WHERE LOWER(email) = ? LIMIT 1',
      [email]
    );

    sendJson(res, 200, { exists: users.length > 0, email });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: 'เกิดข้อผิดพลาดในการตรวจสอบอีเมล' });
  }
}
