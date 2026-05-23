import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import nodemailer from 'nodemailer';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RESET_TOKEN_TTL_MINUTES = 30;

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

function getAppBaseUrl(req: any) {
  const configured = process.env.APP_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');

  const protocol = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = req.headers.host;
  return `${protocol}://${host}`.replace(/\/+$/, '');
}

async function ensurePasswordResetTokensTable() {
  await pool.query(`
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
  `);
}

function createMailTransporter() {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASSWORD;

  if (!host || !user || !pass) {
    throw new Error('SMTP configuration is incomplete');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

async function sendPasswordResetEmail(email: string, displayName: string | null, resetLink: string) {
  const transporter = createMailTransporter();
  const from = process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim();
  const recipientName = displayName || 'ผู้ใช้งาน';
  const safeRecipientName = escapeHtml(recipientName);
  const safeResetLink = escapeHtml(resetLink);

  await transporter.sendMail({
    from,
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
      'SELECT user_id, Name_Surnam, email FROM user WHERE LOWER(email) = ? LIMIT 1',
      [email]
    );

    if (users.length === 0) {
      sendJson(res, 404, { error: 'ไม่พบอีเมลนี้ในระบบ' });
      return;
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
        String(req.headers['x-forwarded-for'] || '').split(',')[0].trim(),
        String(req.headers['user-agent'] || '').slice(0, 500),
      ]
    );

    await sendPasswordResetEmail(user.email, user.Name_Surnam || null, resetLink);

    sendJson(res, 200, { message: 'ส่งลิงก์รีเซ็ตรหัสผ่านไปยังอีเมลเรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    if (error instanceof Error && error.message === 'SMTP configuration is incomplete') {
      sendJson(res, 500, { error: 'ยังไม่ได้ตั้งค่า SMTP สำหรับส่งอีเมล' });
      return;
    }
    sendJson(res, 500, { error: 'เกิดข้อผิดพลาดในการส่งลิงก์รีเซ็ตรหัสผ่าน' });
  }
}
