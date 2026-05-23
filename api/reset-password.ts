import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';

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

function hashResetToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
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
    const token = String(body?.token || '').trim();
    const newPassword = String(body?.newPassword || '');

    if (!token) {
      sendJson(res, 400, { error: 'ไม่พบโทเคนสำหรับรีเซ็ตรหัสผ่าน' });
      return;
    }
    if (newPassword.length < 6) {
      sendJson(res, 400, { error: 'รหัสผ่านใหม่ควรมีความยาวอย่างน้อย 6 ตัวอักษร' });
      return;
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
      sendJson(res, 400, { error: 'ลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้องหรือหมดอายุแล้ว' });
      return;
    }

    const resetToken = tokens[0];
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await pool.query('UPDATE user SET password = ? WHERE user_id = ?', [hashedPassword, resetToken.user_id]);
    await pool.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE token_id = ?', [resetToken.token_id]);

    sendJson(res, 200, { message: 'ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว' });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: 'เกิดข้อผิดพลาดในการรีเซ็ตรหัสผ่าน' });
  }
}
