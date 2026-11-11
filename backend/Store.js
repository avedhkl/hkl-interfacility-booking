/**
 * Sheet access + idempotent, NON-DESTRUCTIVE setup.
 * The script is bound to the new Sheet (clasp create --type sheets), so SpreadsheetApp.getActive() is used.
 * Columns are always addressed by header name, never by position.
 */

const COLS_ = {
  Requests: ['RequestID', 'SubmittedAt', 'ApplicantName', 'Jawatan', 'BhgUnit', 'TelBimbit', 'TelPejabat', 'Fax',
    'JenisKenderaan', 'BilPenumpang', 'BilKenderaan', 'Tujuan', 'TempatDituju', 'TempatMenunggu', 'TempatMenungguBalik',
    'TarikhPergi', 'MasaPergi', 'TarikhBalik', 'MasaBalik', 'PhysicalFormPhotoRef', 'Status',
    'PHCDecisionBy', 'PHCDecisionAt', 'PHCUlasan', 'DriverName1', 'DriverName2', 'DriverPhone', 'VehicleNo',
    'AdminPHCEndorsedBy', 'AdminPHCEndorsedAt', 'ClaimPdfRef', 'ClaimPdfAt'],
  Ambulance: ['RequestID', 'TarikhMasaDiperlukan', 'NamaPesakit', 'PeralatanDiperlukan', 'KesRujukanDariHospital',
    'KesDirujukKeHospital', 'KeteranganRingkasKes', 'NamaPegawaiPerubatan']
};
// Real date-time cells; everything else is plain text.
const DATETIME_COLS_ = { Requests: ['SubmittedAt', 'PHCDecisionAt', 'AdminPHCEndorsedAt', 'ClaimPdfAt'], Ambulance: [] };

/** Safe to run any number of times: creates missing tabs/headers only; never clears or reorders data. */
function setupSheets() {
  const ss = SpreadsheetApp.getActive();
  Object.keys(COLS_).forEach(function (name) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    const want = COLS_[name];
    const lastCol = sh.getLastColumn();
    const have = lastCol > 0 ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];
    let headers = have.slice();
    want.forEach(function (h) {
      if (headers.indexOf(h) === -1) { headers.push(h); sh.getRange(1, headers.length).setValue(h); } // migration: append only
    });
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#e8eef7');
    sh.setFrozenRows(1);
    if (sh.getMaxRows() < 5000) sh.insertRowsAfter(sh.getMaxRows(), 5000 - sh.getMaxRows()); // keep text format on future rows
    const rows = Math.max(sh.getMaxRows() - 1, 1);
    headers.forEach(function (h, i) {
      const dt = DATETIME_COLS_[name].indexOf(h) !== -1;
      sh.getRange(2, i + 1, rows, 1).setNumberFormat(dt ? 'dd/MM/yyyy HH:mm' : '@');
    });
  });
  const dflt = ss.getSheetByName('Sheet1') || ss.getSheetByName('Sheet 1') || ss.getSheetByName('Helaian1');
  if (dflt && ss.getSheets().length > 2 && dflt.getLastRow() === 0) ss.deleteSheet(dflt); // only if empty
  Logger.log('setupSheets OK');
}

/** Creates the private Drive folder for form photos (owned by the account running this). Idempotent. */
function setupDrive() {
  ensureFolder_('PHOTO_FOLDER_ID', 'HKL-KDR-Foto-Borang (PRIVATE)');
  ensureFolder_('PDF_FOLDER_ID', 'HKL-KDR-PDF-Tuntutan (PRIVATE)');
}

function ensureFolder_(prop, name) {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(prop);
  if (id) { try { DriveApp.getFolderById(id); Logger.log(prop + ' exists: ' + id); return id; } catch (e) { /* recreate */ } }
  const f = DriveApp.createFolder(name); // private by default: owner (AV account) only
  props.setProperty(prop, f.getId());
  Logger.log(prop + ' created: ' + f.getId());
  return f.getId();
}

/** Run once from the editor: sheets + folder + config check. */
function setupAll() {
  setupSheets();
  setupDrive();
  checkConfig();
}

function checkConfig() {
  const p = PropertiesService.getScriptProperties();
  ['PASS_PHC', 'PASS_ADMIN', 'PHOTO_FOLDER_ID', 'PDF_FOLDER_ID'].forEach(function (k) {
    Logger.log(k + ': ' + (p.getProperty(k) ? 'SET' : 'MISSING  <-- set in Project Settings > Script Properties'));
  });
}

// ---------- table helpers ----------

function readTable_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('Tab "' + name + '" tiada. Jalankan setupAll() dari editor.');
  const lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (lastRow < 1 || lastCol < 1) throw new Error('Tab "' + name + '" kosong. Jalankan setupAll().');
  const vals = sh.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = vals[0].map(String);
  const rows = [];
  for (let i = 1; i < vals.length; i++) {
    if (!vals[i][0]) continue;
    const o = { _row: i + 1 };
    for (let c = 0; c < headers.length; c++) o[headers[c]] = vals[i][c];
    rows.push(o);
  }
  return { sh: sh, headers: headers, rows: rows };
}

function appendObj_(t, obj) {
  const row = t.headers.map(function (h) { return obj[h] == null ? '' : obj[h]; });
  t.sh.getRange(t.sh.getLastRow() + 1, 1, 1, row.length).setValues([row]);
}

function updateObj_(t, rowNum, obj) {
  Object.keys(obj).forEach(function (k) {
    const c = t.headers.indexOf(k);
    if (c !== -1) t.sh.getRange(rowNum, c + 1).setValue(obj[k]);
  });
}

// ---------- formatting (server-side, Asia/Kuala_Lumpur) ----------

function toDate_(v) {
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function fmtDate_(v) {
  if (v === '' || v == null) return '';
  if (v instanceof Date) return Utilities.formatDate(v, HKL.TZ, 'dd/MM/yyyy');
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[3] + '/' + m[2] + '/' + m[1] : String(v);
}

function fmtDateTime_(v) {
  const d = v ? toDate_(v) : null;
  return d ? Utilities.formatDate(d, HKL.TZ, 'dd/MM/yyyy HH:mm') : '';
}
