import { pool } from '../src/lib/dbconnect.js';

function sendJson(res: any, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(JSON.stringify(payload));
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
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const userId = Number(req.query?.user_id || req.query?.userId);
    if (!Number.isFinite(userId) || userId <= 0) {
      sendJson(res, 400, { error: 'ไม่พบรหัสผู้ใช้สำหรับตรวจสอบบัญชี LINE' });
      return;
    }

    const [rows]: any = await pool.query(
      `SELECT line_user_id, line_display_name, line_picture_url, line_linked_at
       FROM user
       WHERE user_id = ?
       LIMIT 1`,
      [userId],
    );

    if (rows.length === 0) {
      sendJson(res, 404, { error: 'ไม่พบข้อมูลผู้ใช้' });
      return;
    }

    sendJson(res, 200, rows[0]);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: 'ไม่สามารถตรวจสอบสถานะบัญชี LINE ได้' });
  }
}
