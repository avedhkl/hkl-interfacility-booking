/**
 * Request actions. Role gating happens here, server-side:
 *  - Pemohon/anyone: list with masked/minimal rows; full detail only for OWN requests.
 *  - Penyelia PHC / Admin PHC (passcode): full detail + photo.
 */

// ---------- helpers ----------

function closedAt_(r) {
  if (r.Status === HKL.STATUS.DIENDORS) return toDate_(r.AdminPHCEndorsedAt);
  if (r.Status === HKL.STATUS.TIDAK_LULUS) return toDate_(r.PHCDecisionAt);
  return null;
}

function isArchived_(r, now) {
  const c = closedAt_(r);
  return !!c && (now - c.getTime()) > HKL.ARCHIVE_HOURS * 3600 * 1000;
}

function canSeeFull_(auth, r) {
  return isPHC_(auth) || normName_(r.ApplicantName) === normName_(auth.name);
}

function ambView_(a, full) {
  if (!a) return null;
  if (!full) return { namaPesakit: maskName_(a.NamaPesakit) };
  return {
    tarikhMasaDiperlukan: String(a.TarikhMasaDiperlukan || ''),
    namaPesakit: String(a.NamaPesakit || ''),
    peralatan: String(a.PeralatanDiperlukan || ''),
    kesDari: String(a.KesRujukanDariHospital || ''),
    kesKe: String(a.KesDirujukKeHospital || ''),
    keterangan: String(a.KeteranganRingkasKes || ''),
    pegawai: String(a.NamaPegawaiPerubatan || '')
  };
}

function reqView_(r, amb, full) {
  const base = {
    id: r.RequestID,
    status: r.Status,
    applicantName: String(r.ApplicantName || ''),
    bhgUnit: String(r.BhgUnit || ''),
    jenis: String(r.JenisKenderaan || ''),
    tarikhPergi: fmtDate_(r.TarikhPergi),
    masaPergi: String(r.MasaPergi || ''),
    full: full
  };
  if (amb) base.amb = ambView_(amb, full);
  if (!full) return base;
  return Object.assign(base, {
    submittedAt: fmtDateTime_(r.SubmittedAt),
    jawatan: String(r.Jawatan || ''),
    telBimbit: String(r.TelBimbit || ''),
    telPejabat: String(r.TelPejabat || ''),
    fax: String(r.Fax || ''),
    bilPenumpang: String(r.BilPenumpang || ''),
    bilKenderaan: String(r.BilKenderaan || ''),
    tujuan: String(r.Tujuan || ''),
    tempatDituju: String(r.TempatDituju || ''),
    tempatMenunggu: String(r.TempatMenunggu || ''),
    tempatMenungguBalik: String(r.TempatMenungguBalik || ''),
    tarikhBalik: fmtDate_(r.TarikhBalik),
    masaBalik: String(r.MasaBalik || ''),
    hasPhoto: !!r.PhysicalFormPhotoRef,
    phcDecisionBy: String(r.PHCDecisionBy || ''),
    phcDecisionAt: fmtDateTime_(r.PHCDecisionAt),
    phcUlasan: String(r.PHCUlasan || ''),
    driver1: String(r.DriverName1 || ''),
    driver2: String(r.DriverName2 || ''),
    driverPhone: String(r.DriverPhone || ''),
    vehicleNo: String(r.VehicleNo || ''),
    endorsedBy: String(r.AdminPHCEndorsedBy || ''),
    endorsedAt: fmtDateTime_(r.AdminPHCEndorsedAt),
    claimSavedAt: r.ClaimPdfRef ? fmtDateTime_(r.ClaimPdfAt) : ''
  });
}

function ambMap_() {
  const m = {};
  readTable_('Ambulance').rows.forEach(function (a) { m[a.RequestID] = a; });
  return m;
}

function findReq_(t, id) {
  const r = t.rows.filter(function (x) { return x.RequestID === id; })[0];
  if (!r) throw userErr_('Permohonan tidak dijumpai.');
  return r;
}

// ---------- list (ONE call: requests + ambulance details) ----------

function actionList_(p) {
  const auth = authenticate_(p);
  const archive = p.scope === 'archive';
  const now = Date.now();
  const t = readTable_('Requests');
  const amb = ambMap_();
  const rows = t.rows.filter(function (r) { return isArchived_(r, now) === archive; });
  rows.sort(function (a, b) { return (toDate_(b.SubmittedAt) || 0) - (toDate_(a.SubmittedAt) || 0); });
  return {
    version: HKL.APP_VERSION,
    serverTime: new Date().toISOString(),
    role: auth.role,
    requests: rows.map(function (r) { return reqView_(r, amb[r.RequestID], canSeeFull_(auth, r)); })
  };
}

// ---------- photo (private Drive file, served through the API) ----------

function actionGetPhoto_(p) {
  const auth = authenticate_(p);
  const r = findReq_(readTable_('Requests'), String(p.id || ''));
  if (!canSeeFull_(auth, r)) throw userErr_('Tiada akses kepada gambar ini.');
  if (!r.PhysicalFormPhotoRef) throw userErr_('Tiada gambar borang.');
  const blob = DriveApp.getFileById(String(r.PhysicalFormPhotoRef)).getBlob();
  return { dataUrl: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes()) };
}

// ---------- submit ----------

function actionSubmit_(p) {
  const cache = CacheService.getScriptCache();
  const n = num_(cache.get('submitRate')) + 1;
  if (n > 30) throw userErr_('Terlalu banyak permohonan dalam masa singkat. Cuba sebentar lagi.');
  cache.put('submitRate', String(n), 600);

  const L = HKL.LIMITS, f = p.fields || {};
  const req = function (key, label, max) {
    const v = clean_(f[key], max || L.text);
    if (!v) throw userErr_(label + ' diperlukan.');
    return v;
  };
  const isDate = function (s) { return /^\d{4}-\d{2}-\d{2}$/.test(s); };

  const jenis = req('jenis', 'Jenis Kenderaan');
  if (HKL.JENIS_KENDERAAN.indexOf(jenis) === -1) throw userErr_('Jenis Kenderaan tidak sah.');
  const bilP = parseInt(f.bilPenumpang, 10), bilK = parseInt(f.bilKenderaan, 10);
  if (!(bilP >= 1 && bilP <= 200)) throw userErr_('Bilangan Penumpang tidak sah.');
  if (!(bilK >= 1 && bilK <= 50)) throw userErr_('Bil. Kenderaan tidak sah.');
  const tarikhPergi = req('tarikhPergi', 'Tarikh Pergi'), tarikhBalik = req('tarikhBalik', 'Tarikh Balik');
  if (!isDate(tarikhPergi) || !isDate(tarikhBalik)) throw userErr_('Format tarikh tidak sah.');

  const row = {
    ApplicantName: req('applicantName', 'Nama', 80),
    Jawatan: req('jawatan', 'Jawatan'),
    BhgUnit: req('bhgUnit', 'Bhg/Caw./Unit'),
    TelBimbit: req('telBimbit', 'No. Telefon Bimbit', 30),
    TelPejabat: clean_(f.telPejabat, 30),
    Fax: clean_(f.fax, 30),
    JenisKenderaan: jenis,
    BilPenumpang: bilP,
    BilKenderaan: bilK,
    Tujuan: req('tujuan', 'Tujuan', L.long),
    TempatDituju: req('tempatDituju', 'Tempat Dituju'),
    TempatMenunggu: req('tempatMenunggu', 'Tempat Menunggu'),
    TempatMenungguBalik: clean_(f.tempatMenungguBalik, L.text),
    TarikhPergi: tarikhPergi,
    MasaPergi: req('masaPergi', 'Masa Pergi', 30),
    TarikhBalik: tarikhBalik,
    MasaBalik: req('masaBalik', 'Masa Balik', 30)
  };

  let ambRow = null;
  if (jenis === HKL.AMBULANS) {
    const a = p.amb || {};
    const ra = function (key, label, max) {
      const v = clean_(a[key], max || L.text);
      if (!v) throw userErr_(label + ' (Bahagian B) diperlukan.');
      return v;
    };
    ambRow = {
      TarikhMasaDiperlukan: ra('tarikhMasaDiperlukan', 'Tarikh / Masa diperlukan'),
      NamaPesakit: ra('namaPesakit', 'Nama Pesakit'),
      PeralatanDiperlukan: clean_(a.peralatan, L.long),
      KesRujukanDariHospital: clean_(a.kesDari, L.text),
      KesDirujukKeHospital: clean_(a.kesKe, L.text),
      KeteranganRingkasKes: ra('keterangan', 'Keterangan Ringkas Kes', L.long),
      NamaPegawaiPerubatan: ra('pegawai', 'Nama Pegawai Perubatan', 80)
    };
  }

  const ph = p.photo || {};
  const mime = String(ph.mime || '');
  if (['image/jpeg', 'image/png'].indexOf(mime) === -1) throw userErr_('Gambar borang (JPEG/PNG) wajib dimuat naik.');
  const b64 = String(ph.data || '');
  if (!b64) throw userErr_('Gambar borang wajib dimuat naik.');
  if (b64.length > L.photoBase64) throw userErr_('Gambar terlalu besar.');
  const bytes = Utilities.base64Decode(b64);

  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  let file = null;
  try {
    const rt = readTable_('Requests');
    const now = new Date();
    const prefix = HKL.ID_PREFIX + '-' + Utilities.formatDate(now, HKL.TZ, 'yyMMdd') + '-';
    let max = 0;
    rt.rows.forEach(function (r) {
      const id = String(r.RequestID);
      if (id.indexOf(prefix) === 0) max = Math.max(max, parseInt(id.substring(prefix.length), 10) || 0);
    });
    const id = prefix + ('00' + (max + 1)).slice(-3);

    const folderId = PropertiesService.getScriptProperties().getProperty('PHOTO_FOLDER_ID');
    if (!folderId) throw new Error('PHOTO_FOLDER_ID belum ditetapkan. Jalankan setupAll().');
    const ext = mime === 'image/png' ? '.png' : '.jpg';
    file = DriveApp.getFolderById(folderId).createFile(Utilities.newBlob(bytes, mime, id + ext));

    row.RequestID = id;
    row.SubmittedAt = now;
    row.PhysicalFormPhotoRef = file.getId();
    row.Status = HKL.STATUS.MENUNGGU;
    appendObj_(rt, row);
    if (ambRow) { ambRow.RequestID = id; appendObj_(readTable_('Ambulance'), ambRow); }
    return { id: id };
  } catch (err) {
    if (file) { try { file.setTrashed(true); } catch (e) { /* ignore */ } }
    throw err;
  } finally {
    lock.releaseLock();
  }
}

// ---------- PHC decision ----------

function actionDecide_(p) {
  const auth = authenticate_(p);
  if (auth.role !== HKL.ROLES.PHC) throw userErr_('Hanya Penyelia PHC boleh membuat keputusan.');
  const decision = String(p.decision || '');
  if (decision !== HKL.STATUS.LULUS && decision !== HKL.STATUS.TIDAK_LULUS) throw userErr_('Keputusan tidak sah.');
  const upd = {
    Status: decision,
    PHCDecisionBy: auth.name,
    PHCDecisionAt: new Date(),
    PHCUlasan: clean_(p.ulasan, HKL.LIMITS.long)
  };
  if (decision === HKL.STATUS.LULUS) {
    upd.DriverName1 = clean_(p.driver1, 80);
    upd.DriverName2 = clean_(p.driver2, 80);
    upd.DriverPhone = clean_(p.driverPhone, 30);
    upd.VehicleNo = clean_(p.vehicleNo, 30);
    if (!upd.DriverName1) throw userErr_('Nama Pemandu 1 diperlukan.');
    if (!upd.DriverPhone) throw userErr_('No. Telefon pemandu diperlukan.');
    if (!upd.VehicleNo) throw userErr_('No. Kenderaan diperlukan.');
  } else if (!upd.PHCUlasan) {
    throw userErr_('Ulasan diperlukan untuk Tidak Lulus.');
  }
  return transition_(String(p.id || ''), HKL.STATUS.MENUNGGU, upd);
}

// ---------- Admin endorsement ----------

function actionEndorse_(p) {
  const auth = authenticate_(p);
  if (auth.role !== HKL.ROLES.ADMIN) throw userErr_('Hanya Admin PHC boleh mengendors.');
  return transition_(String(p.id || ''), HKL.STATUS.LULUS, {
    Status: HKL.STATUS.DIENDORS,
    AdminPHCEndorsedBy: auth.name,
    AdminPHCEndorsedAt: new Date()
  });
}

// ---------- Claim PDF archive copy (private Drive folder, PHC/Admin only) ----------

function actionSaveClaim_(p) {
  const auth = authenticate_(p);
  if (!isPHC_(auth)) throw userErr_('Hanya PHC boleh menyimpan PDF tuntutan.');
  const b64 = String(p.pdf || '');
  if (!b64 || b64.length > HKL.LIMITS.pdfBase64) throw userErr_('PDF tidak sah atau terlalu besar.');
  const bytes = Utilities.base64Decode(b64);
  if (!(bytes.length > 4 && bytes[0] === 37 && bytes[1] === 80 && bytes[2] === 68 && bytes[3] === 70)) throw userErr_('Fail bukan PDF.');
  const folderId = PropertiesService.getScriptProperties().getProperty('PDF_FOLDER_ID');
  if (!folderId) throw new Error('PDF_FOLDER_ID belum ditetapkan. Jalankan setupAll().');

  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const t = readTable_('Requests');
    const r = findReq_(t, String(p.id || ''));
    if (r.Status !== HKL.STATUS.DIENDORS) throw userErr_('PDF tuntutan hanya untuk permohonan yang telah Diendors.');
    const file = DriveApp.getFolderById(folderId).createFile(Utilities.newBlob(bytes, 'application/pdf', 'Borang Tuntutan ' + r.RequestID + '.pdf'));
    if (r.ClaimPdfRef) { try { DriveApp.getFileById(String(r.ClaimPdfRef)).setTrashed(true); } catch (e) { /* old copy already gone */ } }
    const upd = { ClaimPdfRef: file.getId(), ClaimPdfAt: new Date() };
    updateObj_(t, r._row, upd);
    return { savedAt: fmtDateTime_(upd.ClaimPdfAt) };
  } finally {
    lock.releaseLock();
  }
}

function transition_(id, fromStatus, upd) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const t = readTable_('Requests');
    const r = findReq_(t, id);
    if (r.Status !== fromStatus) throw userErr_('Status permohonan telah berubah (' + r.Status + '). Muat semula senarai.');
    updateObj_(t, r._row, upd);
    Object.keys(upd).forEach(function (k) { r[k] = upd[k]; });
    return { request: reqView_(r, ambMap_()[id], true) };
  } finally {
    lock.releaseLock();
  }
}
