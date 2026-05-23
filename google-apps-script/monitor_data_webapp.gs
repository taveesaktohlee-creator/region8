const SHEET_NAME = 'การตอบแบบฟอร์ม 1';
const DRIVE_AVATAR_FOLDER_ID = '1aaQIZ3nUcr0iDLOq8xENFpM_halgcndE';

function getMonitorSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  return spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.getSheets()[0];
}

function outputJson_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  const sheet = getMonitorSheet_();
  const values = sheet.getDataRange().getDisplayValues();

  if (values.length < 2) {
    return outputJson_([]);
  }

  const headers = values[0].map((header) => String(header).trim());
  const rows = values.slice(1)
    .filter((row) => row.some((cell) => String(cell).trim() !== ''))
    .map((row) => {
      const item = {};
      headers.forEach((header, index) => {
        if (header) item[header] = row[index] || '';
      });
      return item;
    });

  return outputJson_(rows);
}

function doPost(e) {
  try {
    const rawBody = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    const payload = JSON.parse(rawBody);
    const rowData = payload.row && typeof payload.row === 'object' ? payload.row : payload;

    if (rowData.action === 'uploadAvatar' || rowData.action === 'uploadDriveFile') {
      return uploadAvatarToDrive_(rowData);
    }

    if (rowData.action === 'deleteAvatar') {
      return deleteAvatarFromDrive_(rowData);
    }

    if (rowData.action === 'getDriveFile') {
      return getDriveFile_(rowData);
    }

    if (rowData.action === 'sendPasswordResetEmail') {
      return sendPasswordResetEmail_(rowData);
    }

    if (!rowData || Object.keys(rowData).length === 0) {
      return outputJson_({
        ok: false,
        error: 'ไม่พบข้อมูลที่ต้องการบันทึก',
      });
    }

    const sheet = getMonitorSheet_();
    const lastColumn = Math.max(sheet.getLastColumn(), 1);
    const headers = sheet.getRange(1, 1, 1, lastColumn)
      .getDisplayValues()[0]
      .map((header) => String(header).trim());

    const row = headers.map((header) => {
      if (!header) return '';
      const value = rowData[header];
      if (Array.isArray(value)) return value.join(', ');
      if (value === null || value === undefined) return '';
      return value;
    });

    if (payload.mode === 'upsert') {
      const updatedRowNumber = updateExistingMonitorRow_(sheet, headers, rowData, row, payload.upsert || {});
      if (updatedRowNumber) {
        return outputJson_({
          ok: true,
          mode: 'updated',
          message: 'อัปเดตข้อมูลกำกับติดตามครั้งที่ 2 แถวเดิมเรียบร้อยแล้ว',
          rowNumber: updatedRowNumber,
        });
      }
    }

    sheet.appendRow(row);

    return outputJson_({
      ok: true,
      mode: 'created',
      message: 'บันทึกข้อมูลลง Google Sheets เรียบร้อยแล้ว',
      rowNumber: sheet.getLastRow(),
    });
  } catch (error) {
    return outputJson_({
      ok: false,
      error: error && error.message ? error.message : String(error),
    });
  }
}

function sendPasswordResetEmail_(payload) {
  try {
    const email = String(payload.email || '').trim();
    const displayName = String(payload.displayName || payload.display_name || 'ผู้ใช้งาน').trim() || 'ผู้ใช้งาน';
    const resetLink = String(payload.resetLink || payload.reset_link || '').trim();
    const expiresMinutes = Number(payload.expiresMinutes || payload.expires_minutes || 30) || 30;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return outputJson_({
        ok: false,
        error: 'อีเมลสำหรับส่งลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้อง',
      });
    }

    if (!/^https?:\/\//i.test(resetLink)) {
      return outputJson_({
        ok: false,
        error: 'ลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้อง',
      });
    }

    const subject = 'ลิงก์รีเซ็ตรหัสผ่านระบบสารสนเทศ สตท.8';
    const body = [
      'เรียน ' + displayName,
      '',
      'ระบบได้รับคำขอรีเซ็ตรหัสผ่านของคุณ',
      'กรุณาคลิกลิงก์นี้ภายใน ' + expiresMinutes + ' นาที:',
      resetLink,
      '',
      'หากคุณไม่ได้ทำรายการนี้ กรุณาเพิกเฉยต่ออีเมลฉบับนี้',
    ].join('\n');

    const htmlBody =
      '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;">' +
        '<p>เรียน ' + escapeHtml_(displayName) + '</p>' +
        '<p>ระบบได้รับคำขอรีเซ็ตรหัสผ่านของคุณ</p>' +
        '<p><a href="' + escapeHtml_(resetLink) + '" style="display:inline-block;padding:12px 18px;background:#0ea5e9;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:700;">รีเซ็ตรหัสผ่าน</a></p>' +
        '<p>ลิงก์นี้จะหมดอายุภายใน ' + expiresMinutes + ' นาที</p>' +
        '<p style="color:#64748b;">หากคุณไม่ได้ทำรายการนี้ กรุณาเพิกเฉยต่ออีเมลฉบับนี้</p>' +
      '</div>';

    MailApp.sendEmail({
      to: email,
      subject: subject,
      body: body,
      htmlBody: htmlBody,
      name: 'ระบบสารสนเทศ สตท.8',
    });

    return outputJson_({
      ok: true,
      emailSent: true,
      action: 'sendPasswordResetEmail',
      to: email,
      message: 'ส่งลิงก์รีเซ็ตรหัสผ่านไปยังอีเมลเรียบร้อยแล้ว',
    });
  } catch (error) {
    return outputJson_({
      ok: false,
      error: 'ส่งอีเมลรีเซ็ตรหัสผ่านไม่สำเร็จ: ' + error.toString(),
    });
  }
}

function escapeHtml_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function authorizePasswordResetMail() {
  return MailApp.getRemainingDailyQuota();
}

function updateExistingMonitorRow_(sheet, headers, rowData, row, options) {
  const coopKey = options.coopKey || '1. ชื่อสหกรณ์';
  const roundKey = options.roundKey || '1.1 กำกับติดตามครั้งที่';
  const roundValue = normalizeRound_(options.roundValue || rowData[roundKey] || 'ครั้งที่ 2');
  const coopValue = normalizeText_(rowData[coopKey]);

  if (!coopValue || !roundValue) return 0;

  const coopIndex = headers.indexOf(coopKey);
  const roundIndex = headers.indexOf(roundKey);
  if (coopIndex === -1 || roundIndex === -1 || sheet.getLastRow() < 2) return 0;

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getDisplayValues();

  for (let index = 0; index < values.length; index += 1) {
    const currentCoop = normalizeText_(values[index][coopIndex]);
    const currentRound = normalizeRound_(values[index][roundIndex]);

    if (currentCoop === coopValue && currentRound === roundValue) {
      const rowNumber = index + 2;
      sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
      return rowNumber;
    }
  }

  return 0;
}

function normalizeText_(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeRound_(value) {
  const raw = normalizeText_(value);
  const matched = raw.match(/[12]/);
  return matched ? 'ครั้งที่ ' + matched[0] : raw;
}

function uploadAvatarToDrive_(payload) {
  try {
    const folderId = payload.folderId || payload.folder_id || DRIVE_AVATAR_FOLDER_ID;
    const mimeType = payload.mimeType || payload.mime_type || 'image/webp';
    const fileName = sanitizeDriveFileName_(payload.fileName || payload.file_name || 'avatar.webp');
    const base64 = payload.base64 || '';

    if (!base64) {
      return outputJson_({
        ok: false,
        error: 'ไม่พบข้อมูลรูปภาพสำหรับอัปโหลด',
      });
    }

    const folder = DriveApp.getFolderById(folderId);
    const bytes = Utilities.base64Decode(base64);
    const blob = Utilities.newBlob(bytes, mimeType, fileName);
    const file = folder.createFile(blob);
    let sharingWarning = '';

    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (sharingError) {
      sharingWarning = 'สร้างไฟล์สำเร็จ แต่ตั้งค่าแชร์แบบ Anyone with link ไม่ได้: ' + sharingError.toString();
    }

    const fileId = file.getId();

    return outputJson_({
      ok: true,
      message: 'อัปโหลดไฟล์ไปยัง Google Drive เรียบร้อยแล้ว',
      warning: sharingWarning,
      fileId: fileId,
      fileName: file.getName(),
      mimeType: file.getMimeType(),
      webViewLink: file.getUrl(),
      url: 'https://drive.google.com/uc?export=view&id=' + fileId,
      thumbnailUrl: 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w640',
    });
  } catch (error) {
    return outputJson_({
      ok: false,
      error: 'อัปโหลดรูปไป Google Drive ไม่สำเร็จ: ' + error.toString(),
    });
  }
}

function getDriveFile_(payload) {
  try {
    const fileId = extractDriveFileId_(payload.fileId || payload.file_id || payload.url || '');

    if (!fileId) {
      return outputJson_({
        ok: false,
        error: 'ไม่พบรหัสไฟล์ Google Drive',
      });
    }

    const file = DriveApp.getFileById(fileId);
    const blob = file.getBlob();

    return outputJson_({
      ok: true,
      fileId: fileId,
      fileName: file.getName(),
      mimeType: blob.getContentType(),
      base64: Utilities.base64Encode(blob.getBytes()),
    });
  } catch (error) {
    return outputJson_({
      ok: false,
      error: 'ดึงไฟล์จาก Google Drive ไม่สำเร็จ: ' + error.toString(),
    });
  }
}

function deleteAvatarFromDrive_(payload) {
  try {
    const fileId = extractDriveFileId_(payload.fileId || payload.file_id || payload.avatarUrl || payload.avatar_url || '');

    if (!fileId) {
      return outputJson_({
        ok: true,
        skipped: true,
        message: 'ไม่พบรหัสไฟล์ Google Drive สำหรับลบ',
      });
    }

    const file = DriveApp.getFileById(fileId);
    file.setTrashed(true);

    return outputJson_({
      ok: true,
      deleted: true,
      fileId: fileId,
      message: 'ลบรูปประจำตัวเดิมจาก Google Drive เรียบร้อยแล้ว',
    });
  } catch (error) {
    return outputJson_({
      ok: false,
      error: 'ลบรูปจาก Google Drive ไม่สำเร็จ: ' + error.toString(),
    });
  }
}

function authorizeDriveAccess() {
  const folder = DriveApp.getFolderById(DRIVE_AVATAR_FOLDER_ID);
  const blob = Utilities.newBlob('drive permission test', 'text/plain', 'drive-permission-test.txt');
  const file = folder.createFile(blob);
  file.setTrashed(true);
  return 'อนุญาตสิทธิ์ Google Drive เรียบร้อยแล้ว: ' + folder.getName();
}

function sanitizeDriveFileName_(value) {
  return String(value || 'avatar.webp')
    .replace(/[\\/:*?"<>|#%{}~&]/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 140);
}

function extractDriveFileId_(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const idQueryMatch = raw.match(/[?&]id=([^&]+)/);
  if (idQueryMatch && idQueryMatch[1]) {
    return decodeURIComponent(idQueryMatch[1]);
  }

  const filePathMatch = raw.match(/\/file\/d\/([^/]+)/);
  if (filePathMatch && filePathMatch[1]) {
    return filePathMatch[1];
  }

  if (/^[a-zA-Z0-9_-]{20,}$/.test(raw)) {
    return raw;
  }

  return '';
}
