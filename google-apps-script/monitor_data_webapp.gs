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

    if (rowData.action === 'uploadAvatar') {
      return uploadAvatarToDrive_(rowData);
    }

    if (rowData.action === 'deleteAvatar') {
      return deleteAvatarFromDrive_(rowData);
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
      message: 'อัปโหลดรูปประจำตัวไปยัง Google Drive เรียบร้อยแล้ว',
      warning: sharingWarning,
      fileId: fileId,
      fileName: file.getName(),
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
