const GOOGLE_MONITOR_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbwiK32Dwn80oGfbG4yElZQmKW0IwblvPO85yCW_1ex7LfcCzwd0FtgWMfG45aSqUd3H/exec';

function sendJson(res: any, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
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

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === 'GET') {
    try {
      const response = await fetch(GOOGLE_MONITOR_SCRIPT_URL, { method: 'GET', redirect: 'follow' });
      const text = await response.text();
      if (!response.ok) throw new Error(text || 'Cannot fetch Google Sheets data');

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(text);
    } catch (error) {
      console.error(error);
      sendJson(res, 500, { error: 'ไม่สามารถดึงข้อมูลจาก Google Sheets ได้' });
    }
    return;
  }

  if (req.method === 'POST') {
    try {
      const body = await readBody(req);
      const row = body?.row;
      if (!row || typeof row !== 'object') {
        sendJson(res, 400, { error: 'ไม่พบข้อมูลที่ต้องการบันทึกลง Google Sheets' });
        return;
      }

      const response = await fetch(GOOGLE_MONITOR_SCRIPT_URL, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
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
        sendJson(res, 200, parsed);
      } catch (parseOrScriptError) {
        if (parseOrScriptError instanceof Error && text.trim().startsWith('{')) {
          throw parseOrScriptError;
        }
        sendJson(res, 200, { message: 'บันทึกข้อมูลลง Google Sheets เรียบร้อยแล้ว', response: text });
      }
    } catch (error) {
      console.error(error);
      sendJson(res, 500, {
        error: error instanceof Error
          ? error.message
          : 'Google Apps Script ยังไม่มี doPost(e) สำหรับบันทึกข้อมูล กรุณาอัปเดตและ Deploy Apps Script ใหม่',
      });
    }
    return;
  }

  sendJson(res, 405, { error: 'Method not allowed' });
}
