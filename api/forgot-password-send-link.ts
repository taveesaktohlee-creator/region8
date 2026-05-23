import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import nodemailer from 'nodemailer';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RESET_TOKEN_TTL_MINUTES = 30;
const GOOGLE_PASSWORD_RESET_SCRIPT_URL =
  process.env.GOOGLE_PASSWORD_RESET_SCRIPT_URL ||
  process.env.GOOGLE_AVATAR_UPLOAD_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbwiK32Dwn80oGfbG4yElZQmKW0IwblvPO85yCW_1ex7LfcCzwd0FtgWMfG45aSqUd3H/exec';

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

function createMailTransporter(mailConfig: ReturnType<typeof getMailConfig>) {
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

  const transporter = createMailTransporter(mailConfig);
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
    if (error instanceof Error && error.message.startsWith('SMTP configuration is incomplete')) {
      sendJson(res, 500, {
        error: `ยังไม่ได้ตั้งค่าอีเมลสำหรับส่งลิงก์รีเซ็ตรหัสผ่าน (${error.message.replace('SMTP configuration is incomplete: ', '')})`
      });
      return;
    }
    if (error instanceof Error && /Google Apps Script|ส่งอีเมลรีเซ็ต|Cannot call Google Apps Script/i.test(error.message)) {
      sendJson(res, 500, { error: error.message });
      return;
    }
    sendJson(res, 500, { error: 'เกิดข้อผิดพลาดในการส่งลิงก์รีเซ็ตรหัสผ่าน' });
  }
}
