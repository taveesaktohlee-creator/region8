const GOOGLE_DRIVE_UPLOAD_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbwiK32Dwn80oGfbG4yElZQmKW0IwblvPO85yCW_1ex7LfcCzwd0FtgWMfG45aSqUd3H/exec';

const GOOGLE_DRIVE_FOLDER_ID = '1aaQIZ3nUcr0iDLOq8xENFpM_halgcndE';
const DRIVE_UPLOAD_TIMEOUT_MS = 45_000;
const DRIVE_UPLOAD_MAX_BYTES = 18 * 1024 * 1024;

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
  let totalBytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > 25 * 1024 * 1024) {
      const error = new Error('ไฟล์หรือข้อมูลที่ส่งมามีขนาดใหญ่เกินไป') as Error & { status?: number };
      error.status = 413;
      throw error;
    }
    chunks.push(buffer);
  }

  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function truncateExternalMessage(value: unknown, fallback = 'ไม่สามารถเชื่อมต่อบริการภายนอกได้') {
  const raw = typeof value === 'string' ? value : value instanceof Error ? value.message : '';
  if (/^\s*<!doctype|^\s*<html|<body|service unavailable|temporarily unavailable|502 bad gateway|503 service unavailable/i.test(raw)) {
    return fallback;
  }
  return (raw.replace(/<!doctype[\s\S]*$/i, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || fallback).slice(0, 240);
}

function normalizeBase64Payload(value: string) {
  const raw = value.includes(',') ? value.split(',').pop() || '' : value;
  return raw.replace(/\s+/g, '');
}

function getBase64DecodedByteLength(value: string) {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((value.length * 3) / 4) - padding);
}

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DRIVE_UPLOAD_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
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
    const normalizedBase64 = normalizeBase64Payload(base64);
    if (!normalizedBase64 || normalizedBase64.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalizedBase64)) {
      sendJson(res, 400, { error: 'ข้อมูลไฟล์ไม่ถูกต้อง กรุณาเลือกไฟล์ใหม่' });
      return;
    }
    if (getBase64DecodedByteLength(normalizedBase64) > DRIVE_UPLOAD_MAX_BYTES) {
      sendJson(res, 413, { error: 'ไฟล์มีขนาดใหญ่เกินไป กรุณาลดขนาดไฟล์แล้วลองใหม่' });
      return;
    }

    const fileName = sanitizeDriveFileName(input.fileName || input.file_name || 'training-file');
    const response = await fetchWithTimeout(GOOGLE_DRIVE_UPLOAD_SCRIPT_URL, {
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
        base64: normalizedBase64,
      }),
    });

    const text = await response.text();
    if (!response.ok) throw new Error(truncateExternalMessage(text, 'Google Apps Script ไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง'));
    if (/script function not found|<!doctype|<html|service unavailable|temporarily unavailable/i.test(text)) {
      throw new Error('Google Apps Script ตอบกลับไม่ถูกต้องหรือไม่พร้อมใช้งาน กรุณาตรวจสอบการ Deploy แล้วลองใหม่อีกครั้ง');
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
    const status = Number((error as { status?: unknown })?.status) || 500;
    sendJson(res, status, {
      error: error instanceof Error && error.name === 'AbortError'
        ? 'Google Apps Script ใช้เวลาตอบกลับนานเกินไป กรุณาลองใหม่อีกครั้ง'
        : error instanceof Error
        ? truncateExternalMessage(error.message, 'ไม่สามารถอัปโหลดไฟล์ไปยัง Google Drive ได้')
        : 'ไม่สามารถอัปโหลดไฟล์ไปยัง Google Drive ได้',
    });
  }
}
