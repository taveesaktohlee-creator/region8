const SHEET_NAME = 'Form_Responses';

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
