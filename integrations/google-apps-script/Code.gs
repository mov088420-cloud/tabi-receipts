/** 旅のレシート帳: optional, private Google Sheets write bridge. No image/OCR upload. */
const TABI_HEADERS = ['レシートID','取引日付','取引時刻','店舗名','住所','金額','通貨','小計','割引','税額','税区分','サービス料','チップ','支払者','利用者','支払方法','カードブランド','カード下4桁','取引番号','メモ','撮影日時','撮影日時の取得方法','取り込み日時','登録日時','更新番号','更新ID'];
const TABI_ITEM_HEADERS = ['レシートID','商品名','数量','単価','金額'];

// Run once in the Apps Script editor. Credentials stay in Script Properties, never in logs or public files.
function setup() {
  const properties = PropertiesService.getScriptProperties();
  const id = properties.getProperty('TABI_SHEET_ID');
  const book = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.create('旅のレシート帳');
  if (!id) properties.setProperty('TABI_SHEET_ID', book.getId());
  if (!properties.getProperty('TABI_KEY')) properties.setProperty('TABI_KEY', (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''));
  prepareSheet_(book, 'レシート一覧', TABI_HEADERS);
  prepareSheet_(book, '商品明細', TABI_ITEM_HEADERS);
  // Inspect TABI_KEY and TABI_SHEET_ID in Project Settings → Script Properties.
}
function prepareSheet_(book, name, headers) {
  const sheet = book.getSheetByName(name) || book.insertSheet(name);
  if (!sheet.getLastRow()) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#164b42').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, headers.length, 140);
  }
  const actual = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  if (JSON.stringify(actual) !== JSON.stringify(headers)) throw new Error('Unexpected headers');
  return sheet;
}
function reply_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function doGet() { return reply_({ok:false}); }
function sameKey_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !/^[a-f0-9]{64}$/.test(a) || b.length !== 64) return false;
  let different = 0; for (let i = 0; i < 64; i++) different |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return different === 0;
}
function safeCell_(value) {
  if (typeof value !== 'string' || value.length > 2000) throw new Error('Invalid cell');
  const normalized = value.normalize('NFKC').replace(/[‐‑–—−]/g, '-');
  if (/(?:\d[\s-]?){13,19}/.test(normalized) || /(?:\b(?:cvv|cvc|cid|expiry|expires|exp\.?\s*date)\b|有効期限|セキュリティコード)\s*[:#]?\s*\d/i.test(normalized)) throw new Error('Sensitive field');
  return /^[\s\u0000-\u001f\u007f-\u009f]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value) ? "'" + value : value;
}
function validateJob_(job) {
  if (!job || !/^[\w-]{1,80}$/.test(job.id) || !/^[\w-]{1,80}$/.test(job.revision) || !Number.isSafeInteger(job.version) || job.version < 1 || job.version > 8640000000000000) throw new Error('Invalid job');
  if (!Array.isArray(job.row) || job.row.length !== 24 || job.row[0] !== job.id || !Array.isArray(job.items) || job.items.length > 500) throw new Error('Invalid rows');
  if (job.row[17] && !/^末尾 \d{4}$/.test(job.row[17])) throw new Error('Invalid card');
  return {id:job.id, revision:job.revision, version:job.version, row:job.row.map(safeCell_), items:job.items.map(function(row) {
    if (!Array.isArray(row) || row.length !== 5 || row[0] !== job.id) throw new Error('Invalid item');
    return row.map(safeCell_);
  })};
}
function ensureRows_(sheet, end) { if (end > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), end - sheet.getMaxRows()); }
function numericCell_(value) {
  const plain = value.startsWith("'") ? value.slice(1) : value;
  return /^-?\d{1,12}(?:\.\d{1,3})?$/.test(plain) ? Number(plain) : value;
}
function doPost(event) {
  let lock;
  try {
    const body = event && event.postData && event.postData.contents;
    if (typeof body !== 'string' || body.length > 1500000) return reply_({ok:false});
    const request = JSON.parse(body), properties = PropertiesService.getScriptProperties();
    if (!sameKey_(request.key, properties.getProperty('TABI_KEY'))) return reply_({ok:false});
    if (request.action !== 'ping' && request.action !== 'save') return reply_({ok:false});
    const book = SpreadsheetApp.openById(properties.getProperty('TABI_SHEET_ID'));
    const sheetUrl = 'https://docs.google.com/spreadsheets/d/' + book.getId();
    if (request.action === 'ping') return reply_({ok:true, sheetUrl:sheetUrl});
    const job = validateJob_(request.job);
    lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) return reply_({ok:false});
    const receipts = prepareSheet_(book, 'レシート一覧', TABI_HEADERS), items = prepareSheet_(book, '商品明細', TABI_ITEM_HEADERS);
    const match = receipts.getLastRow() > 1 ? receipts.getRange(2,1,receipts.getLastRow()-1,1).createTextFinder(job.id).matchEntireCell(true).useRegularExpression(false).findNext() : null;
    const row = match ? match.getRow() : receipts.getLastRow()+1;
    if (match) {
      const saved = receipts.getRange(row,25,1,2).getValues()[0];
      if (Number(saved[0]) > job.version || Number(saved[0]) === job.version && saved[1] !== job.revision) return reply_({ok:false, conflict:true});
    }
    if (row > 10001 || items.getLastRow() + job.items.length > 50001) return reply_({ok:false});
    // Idempotent repair on retry: rebuild this receipt's items before committing its receipt row.
    if (items.getLastRow() > 1) {
      const ids = items.getRange(2,1,items.getLastRow()-1,1).getValues();
      for (let i=ids.length-1;i>=0;i--) if (ids[i][0] === job.id) items.deleteRow(i+2);
    }
    if (job.items.length) {
      const first = items.getLastRow()+1; ensureRows_(items,first+job.items.length-1);
      const itemValues = job.items.map(function(value) { return value.map(function(cell,index) { return index >= 2 ? numericCell_(cell) : cell; }); });
      items.getRange(first,1,job.items.length,5).setNumberFormat('@').setValues(itemValues);
      items.getRange(first,3,job.items.length,1).setNumberFormat('0.###');
      items.getRange(first,4,job.items.length,2).setNumberFormat(job.row[6] === 'JPY' ? '0' : '0.00');
    }
    ensureRows_(receipts,row);
    const values = job.row.concat([String(job.version),job.revision]), amounts = [5,7,8,9,11,12];
    amounts.forEach(function(index) { values[index] = numericCell_(values[index]); });
    receipts.getRange(row,1,1,26).setNumberFormat('@').setValues([values]);
    amounts.forEach(function(index) { receipts.getRange(row,index+1,1,1).setNumberFormat(job.row[6] === 'JPY' ? '0' : '0.00'); });
    SpreadsheetApp.flush();
    return reply_({ok:true,id:job.id,revision:job.revision,sheetUrl:sheetUrl});
  } catch (error) { return reply_({ok:false}); }
  finally { if (lock) lock.releaseLock(); }
}
