const GOOGLE_DRIVE_UPLOAD_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbwiK32Dwn80oGfbG4yElZQmKW0IwblvPO85yCW_1ex7LfcCzwd0FtgWMfG45aSqUd3H/exec';

const GOOGLE_DRIVE_FOLDER_ID = '1aaQIZ3nUcr0iDLOq8xENFpM_halgcndE';

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

function sanitizeDriveFileName(value: unknown, fallbackName = 'training-file') {
  const name = String(value || fallbackName).trim() || fallbackName;
  return name.replace(/[\\/:*?"<>|#{}%~&]/g, '-').replace(/\s+/g, ' ').slice(0, 140) || fallbackName;
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
    const input = body?.row && typeof body.row === 'object' ? body.row : body;
    const base64 = input?.base64;

    if (!base64 || typeof base64 !== 'string') {
      sendJson(res, 400, { error: 'ไม่พบไฟล์ที่ต้องการอัปโหลด' });
      return;
    }

    const fileName = sanitizeDriveFileName(input.fileName || input.file_name || 'training-file');
    const response = await fetch(GOOGLE_DRIVE_UPLOAD_SCRIPT_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'uploadAvatar',
        folderId: input.folderId || input.folder_id || GOOGLE_DRIVE_FOLDER_ID,
        userId: input.userId || input.user_id || 'training-file',
        displayName: input.displayName || input.display_name || 'training-course',
        fileName,
        mimeType: input.mimeType || input.mime_type || 'application/octet-stream',
        base64,
      }),
    });

    const text = await response.text();
    if (!response.ok) throw new Error(text || 'Cannot upload file to Google Drive');
    if (/script function not found|<!doctype|<html/i.test(text)) {
      throw new Error('Google Apps Script ยังไม่รองรับการอัปโหลดไฟล์ไป Google Drive');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('Google Apps Script ส่งผลลัพธ์กลับมาไม่ถูกต้อง');
    }

    if (parsed?.ok === false) {
      throw new Error(parsed.error || 'อัปโหลดไฟล์ไป Google Drive ไม่สำเร็จ');
    }

    sendJson(res, 200, parsed);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, {
      error: error instanceof Error
        ? error.message
        : 'ไม่สามารถอัปโหลดไฟล์ไปยัง Google Drive ได้',
    });
  }
}
