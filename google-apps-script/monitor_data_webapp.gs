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

    sheet.appendRow(row);

    return outputJson_({
      ok: true,
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

function uploadAvatarToDrive_(payload) {
  const folderId = payload.folderId || DRIVE_AVATAR_FOLDER_ID;
  const folder = DriveApp.getFolderById(folderId);
  const mimeType = payload.mimeType || 'image/webp';
  const fileName = sanitizeDriveFileName_(payload.fileName || 'avatar.webp');
  const base64 = payload.base64 || '';

  if (!base64) {
    return outputJson_({
      ok: false,
      error: 'ไม่พบข้อมูลรูปภาพสำหรับอัปโหลด',
    });
  }

  const bytes = Utilities.base64Decode(base64);
  const blob = Utilities.newBlob(bytes, mimeType, fileName);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const fileId = file.getId();

  return outputJson_({
    ok: true,
    message: 'อัปโหลดรูปประจำตัวไปยัง Google Drive เรียบร้อยแล้ว',
    fileId: fileId,
    fileName: file.getName(),
    webViewLink: file.getUrl(),
    url: 'https://drive.google.com/uc?export=view&id=' + fileId,
    thumbnailUrl: 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w640',
  });
}

function sanitizeDriveFileName_(value) {
  return String(value || 'avatar.webp')
    .replace(/[\\/:*?"<>|#%{}~&]/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 140);
}
