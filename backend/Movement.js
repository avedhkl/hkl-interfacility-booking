/**
 * Phase 2: vehicle movement tracking.
 *  - Login is per VEHICLE (one PIN per plate, stored only as a salted hash in the Vehicles tab). The driver types his name at "Journey starts".
 *  - One row per step in Movements (6 steps). GPS is a single fix per tap; there is no continuous tracking.
 *  - Rows are never deleted: Undo marks the row Voided = Y.
 *  - PHC / Admin read everything through `fleet` (passcode-gated like the other PHC reads).
 */

const STEPS_ = HKL.MOVE_STEPS;
const UNDO_WINDOW_MIN_ = 15;

// ---------- helpers ----------

function normPlate_(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

function fmtTime_(d) { return d ? Utilities.formatDate(d, HKL.TZ, 'HH:mm') : ''; }
function dayKey_(d) { return d ? Utilities.formatDate(d, HKL.TZ, 'yyyy-MM-dd') : ''; }
function minutes_(a, b) { return (a && b) ? Math.round((b.getTime() - a.getTime()) / 60000) : null; }

function pinSalt_() {
  const props = PropertiesService.getScriptProperties();
  let s = props.getProperty('PIN_SALT');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('PIN_SALT', s); }
  return s;
}

function hashPin_(plate, pin) {
  const d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pinSalt_() + '|' + plate + '|' + pin);
  return Utilities.base64EncodeWebSafe(d);
}

/**
 * Run from the sheet menu (TransferLink > Apply vehicle PINs) or the editor.
 * For every Vehicles row with a value in NewPin: validates it (4-8 digits), stores the hash, clears NewPin.
 */
function applyVehiclePins() {
  const t = readTable_('Vehicles');
  let done = 0, bad = [];
  t.rows.forEach(function (r) {
    const pin = String(r.NewPin || '').trim();
    if (!pin) return;
    if (!/^\d{4,8}$/.test(pin)) { bad.push(r.VehicleNo); return; }
    updateObj_(t, r._row, { PinHash: hashPin_(normPlate_(r.VehicleNo), pin), NewPin: '', Active: String(r.Active || '').trim() ? r.Active : 'Y' });
    done++;
  });
  const msg = 'PINs applied: ' + done + (bad.length ? '. Skipped (PIN must be 4-8 digits): ' + bad.join(', ') : '');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* run from editor: no UI */ }
}

// ---------- auth (vehicle) ----------

function authDriver_(p) {
  const plate = normPlate_(p.vehicle);
  if (!plate) throw userErr_('No. kenderaan diperlukan.');
  const cache = CacheService.getScriptCache();
  const kV = rlKey_(HKL.ROLES.DRIVER, plate), kR = rlKey_(HKL.ROLES.DRIVER, '*');
  if (num_(cache.get(kV)) >= RL_MAX_PER_USER_ || num_(cache.get(kR)) >= RL_MAX_PER_ROLE_ * 3) {
    throw userErr_('Terlalu banyak cubaan gagal. Cuba lagi dalam 15 minit.');
  }
  const v = readTable_('Vehicles').rows.filter(function (r) { return normPlate_(r.VehicleNo) === plate; })[0];
  const active = v && String(v.Active || 'Y').trim().toUpperCase() !== 'N';
  const ok = v && active && v.PinHash && safeEq_(hashPin_(plate, String(p.pin || '')), String(v.PinHash));
  if (!ok) {
    cache.put(kV, String(num_(cache.get(kV)) + 1), RL_WINDOW_SEC_);
    cache.put(kR, String(num_(cache.get(kR)) + 1), RL_WINDOW_SEC_);
    throw userErr_('No. kenderaan atau PIN salah.');
  }
  cache.remove(kV);
  return { role: HKL.ROLES.DRIVER, plate: plate, vehicleNo: String(v.VehicleNo).trim() };
}

// ---------- places ----------

function placesView_() {
  const t = readTable_Safe_('Places');
  if (!t) return [];
  return t.rows.map(function (r) {
    return { name: String(r.PlaceName || ''), lat: parseFloat(r.Lat), lng: parseFloat(r.Lng),
      radius: parseFloat(r.RadiusM) || HKL.MOVE.GEO_DEFAULT_RADIUS_M, kind: String(r.Kind || '') };
  }).filter(function (x) { return x.name && isFinite(x.lat) && isFinite(x.lng); });
}

// ---------- schedule + trip computation ----------

function scheduledAt_(r, amb) {
  if (amb && amb.TarikhMasaDiperlukan) {
    const m = String(amb.TarikhMasaDiperlukan).match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
    if (m) return new Date(m[3] + '-' + m[2] + '-' + m[1] + 'T' + ('0' + m[4]).slice(-2) + ':' + m[5] + ':00+08:00');
  }
  const d = String(r.TarikhPergi instanceof Date ? Utilities.formatDate(r.TarikhPergi, HKL.TZ, 'yyyy-MM-dd') : r.TarikhPergi || '');
  const t = String(r.MasaPergi || '').match(/^(\d{1,2}):(\d{2})/);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d) && t) return new Date(d + 'T' + ('0' + t[1]).slice(-2) + ':' + t[2] + ':00+08:00');
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return new Date(d + 'T00:00:00+08:00');
  return null;
}

/** All non-voided movements grouped by RequestID, sorted by step. */
function movesByReq_() {
  const m = {};
  readTable_('Movements').rows.forEach(function (x) {
    if (String(x.Voided || '').toUpperCase() === 'Y') return;
    (m[x.RequestID] = m[x.RequestID] || []).push(x);
  });
  Object.keys(m).forEach(function (k) { m[k].sort(function (a, b) { return num_(a.Step) - num_(b.Step); }); });
  return m;
}

function tripView_(moves, r, amb, now) {
  moves = moves || [];
  const byStep = {};
  moves.forEach(function (x) { byStep[num_(x.Step)] = x; });
  const at = function (n) { return byStep[n] ? toDate_(byStep[n].At) : null; };
  const last = moves.length ? num_(moves[moves.length - 1].Step) : 0;
  const sched = scheduledAt_(r, amb);
  const M = HKL.MOVE, nowD = new Date(now);
  const steps = moves.map(function (x) {
    const lat = parseFloat(x.Lat), lng = parseFloat(x.Lng);
    return { n: num_(x.Step), at: toDate_(x.At) ? toDate_(x.At).toISOString() : '', time: fmtTime_(toDate_(x.At)),
      lat: isFinite(lat) ? lat : null, lng: isFinite(lng) ? lng : null, acc: parseFloat(x.AccuracyM) || null,
      source: String(x.Source || ''), driver: String(x.DriverName || '') };
  });
  const state = last === 0 ? 'not_started' : (last >= 6 ? 'done' : 'in_progress');
  const flags = [];
  const okStatus = r.Status === HKL.STATUS.LULUS || r.Status === HKL.STATUS.DIENDORS;
  if (sched && okStatus) {
    if (at(1)) {
      const late = minutes_(sched, at(1));
      if (late > M.START_GRACE_MIN) flags.push({ code: 'LATE_START', text: 'Started ' + late + ' min after the requested time' });
    } else if (nowD.getTime() - sched.getTime() > M.START_GRACE_MIN * 60000) {
      flags.push({ code: 'NOT_STARTED', text: 'Not started, ' + minutes_(sched, nowD) + ' min past the requested time' });
    }
  }
  if (at(2) && last <= 2) {
    const w = minutes_(at(2), nowD);
    if (w > M.LONG_WAIT_MIN) flags.push({ code: 'LONG_WAIT', text: 'Waiting at pickup for ' + w + ' min' });
  } else if (at(2) && at(3)) {
    const w = minutes_(at(2), at(3));
    if (w > M.LONG_WAIT_MIN) flags.push({ code: 'LONG_WAIT', text: 'Waited ' + w + ' min at pickup' });
  }
  if (state === 'in_progress') {
    const lastAt = toDate_(moves[moves.length - 1].At);
    const idle = minutes_(lastAt, nowD);
    if (idle > M.STALL_MIN) flags.push({ code: 'STALLED', text: 'No update for ' + idle + ' min' });
  }
  return {
    state: state, lastStep: last,
    nextStep: last >= 6 ? 0 : last + 1,
    scheduledAt: sched ? sched.toISOString() : '', scheduledTime: sched ? fmtDateTime_(sched) : '',
    steps: steps,
    mins: { toPickup: minutes_(at(1), at(2)), wait: minutes_(at(2), at(3)), outbound: minutes_(at(3), at(4)),
      atDest: minutes_(at(4), at(5)), back: minutes_(at(5), at(6)), total: minutes_(at(1), at(6)) },
    flags: flags
  };
}

function caseView_(r, amb, trip) {
  const o = {
    id: r.RequestID, status: r.Status, jenis: String(r.JenisKenderaan || ''),
    when: fmtDate_(r.TarikhPergi) + ' ' + String(r.MasaPergi || ''),
    pickup: String(r.TempatMenunggu || ''), dest: String(r.TempatDituju || ''), returnTo: String(r.TempatMenungguBalik || ''),
    applicant: String(r.ApplicantName || ''), tel: String(r.TelBimbit || ''), pax: String(r.BilPenumpang || ''),
    tujuan: String(r.Tujuan || ''), bhgUnit: String(r.BhgUnit || ''),
    vehicleNo: String(r.VehicleNo || ''), driver1: String(r.DriverName1 || ''), driver2: String(r.DriverName2 || ''),
    trip: trip
  };
  if (amb) o.amb = { patient: maskName_(amb.NamaPesakit), equipment: String(amb.PeralatanDiperlukan || ''), from: String(amb.KesRujukanDariHospital || ''), to: String(amb.KesDirujukKeHospital || '') };
  return o;
}

// ---------- actions ----------

function actionDriverLogin_(p) {
  const a = authDriver_(p);
  return { vehicleNo: a.vehicleNo, version: HKL.APP_VERSION, serverTime: new Date().toISOString(), places: placesView_() };
}

function actionDriverCases_(p) {
  const a = authDriver_(p);
  const now = Date.now();
  const amb = ambMap_(), mv = movesByReq_();
  const out = [];
  readTable_('Requests').rows.forEach(function (r) {
    if (normPlate_(r.VehicleNo) !== a.plate) return;
    if (r.Status !== HKL.STATUS.LULUS && r.Status !== HKL.STATUS.DIENDORS) return;
    const trip = tripView_(mv[r.RequestID], r, amb[r.RequestID], now);
    const sched = scheduledAt_(r, amb[r.RequestID]);
    if (trip.state === 'done') {
      const e = toDate_(trip.steps[trip.steps.length - 1].at);
      if (e && now - e.getTime() > 24 * 3600000) return;
    } else if (trip.state === 'not_started' && sched && now - sched.getTime() > 48 * 3600000) return;
    out.push(caseView_(r, amb[r.RequestID], trip));
  });
  const rank = function (c) { return c.trip.state === 'in_progress' ? 0 : c.trip.state === 'not_started' ? 1 : 2; };
  out.sort(function (x, y) { return rank(x) - rank(y) || String(x.trip.scheduledAt).localeCompare(String(y.trip.scheduledAt)); });
  return { vehicleNo: a.vehicleNo, serverTime: new Date(now).toISOString(), places: placesView_(), cases: out };
}

function actionDriverStep_(p) {
  const a = authDriver_(p);
  const step = parseInt(p.step, 10);
  if (!(step >= 1 && step <= 6)) throw userErr_('Langkah tidak sah.');
  const ck = clean_(p.clientKey, 60);
  const lat = parseFloat(p.lat), lng = parseFloat(p.lng);
  const hasGps = isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const acc = parseFloat(p.accuracy);
  const source = String(p.source) === 'Auto' ? 'Auto' : 'Manual';

  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const rt = readTable_('Requests');
    const r = findReq_(rt, String(p.id || ''));
    if (normPlate_(r.VehicleNo) !== a.plate) throw userErr_('Kes ini tidak ditugaskan kepada kenderaan anda.');
    if (r.Status !== HKL.STATUS.LULUS && r.Status !== HKL.STATUS.DIENDORS) throw userErr_('Kes ini belum diluluskan.');

    const mt = readTable_('Movements');
    const now = new Date();
    const mine = mt.rows.filter(function (x) { return x.RequestID === r.RequestID; });
    // Idempotent: the same tap re-sent after a flaky connection returns the current state.
    if (ck && mine.some(function (x) { return String(x.ClientKey) === ck; })) {
      return finishStep_(r, now);
    }
    const live = mine.filter(function (x) { return String(x.Voided || '').toUpperCase() !== 'Y'; })
      .sort(function (x, y) { return num_(x.Step) - num_(y.Step); });
    const last = live.length ? num_(live[live.length - 1].Step) : 0;
    if (step !== last + 1) {
      throw userErr_(step <= last ? 'Langkah ini sudah direkodkan. Muat semula.' : 'Sila rekod langkah sebelumnya dahulu.');
    }
    let driver = clean_(p.driverName, 80);
    if (step === 1) {
      if (driver.length < 2) throw userErr_('Nama pemandu diperlukan untuk memulakan perjalanan.');
    } else {
      driver = String(live[0].DriverName || driver);
    }
    // Event time: the tap time. Offline taps may carry their original time (bounded, never in the future, never before the previous step).
    let at = now;
    const ca = p.clientAt ? new Date(p.clientAt) : null;
    if (ca && !isNaN(ca.getTime()) && ca.getTime() <= now.getTime() + 120000 && now.getTime() - ca.getTime() <= HKL.MOVE.BACKFILL_MAX_HOURS * 3600000) at = ca;
    if (last) { const prev = toDate_(live[live.length - 1].At); if (prev && at.getTime() < prev.getTime()) at = prev; }

    appendObj_(mt, {
      RequestID: r.RequestID, Step: step, StepCode: STEPS_[step - 1].code, At: at, ReceivedAt: now,
      VehicleNo: a.vehicleNo, DriverName: driver,
      Lat: hasGps ? lat.toFixed(6) : '', Lng: hasGps ? lng.toFixed(6) : '', AccuracyM: hasGps && isFinite(acc) ? Math.round(acc) : '',
      Source: source, ClientKey: ck, Voided: '', VoidedAt: ''
    });
    return finishStep_(r, now);
  } finally {
    lock.releaseLock();
  }
}

function finishStep_(r, now) {
  const amb = ambMap_()[r.RequestID];
  return { case: caseView_(r, amb, tripView_(movesByReq_()[r.RequestID], r, amb, now.getTime ? now.getTime() : now)) };
}

function actionDriverUndo_(p) {
  const a = authDriver_(p);
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const rt = readTable_('Requests');
    const r = findReq_(rt, String(p.id || ''));
    if (normPlate_(r.VehicleNo) !== a.plate) throw userErr_('Kes ini tidak ditugaskan kepada kenderaan anda.');
    const mt = readTable_('Movements');
    const live = mt.rows.filter(function (x) { return x.RequestID === r.RequestID && String(x.Voided || '').toUpperCase() !== 'Y'; })
      .sort(function (x, y) { return num_(x.Step) - num_(y.Step); });
    if (!live.length) throw userErr_('Tiada langkah untuk dibatalkan.');
    const lastRow = live[live.length - 1];
    const recv = toDate_(lastRow.ReceivedAt);
    if (!recv || Date.now() - recv.getTime() > UNDO_WINDOW_MIN_ * 60000) throw userErr_('Langkah hanya boleh dibatalkan dalam ' + UNDO_WINDOW_MIN_ + ' minit. Hubungi PHC.');
    const now = new Date();
    updateObj_(mt, lastRow._row, { Voided: 'Y', VoidedAt: now });
    return finishStep_(r, now);
  } finally {
    lock.releaseLock();
  }
}

/** PHC / Admin: every vehicle's day. p.date = yyyy-MM-dd (default today, Asia/Kuala_Lumpur). */
function actionFleet_(p) {
  const auth = authenticate_(p);
  if (!isPHC_(auth)) throw userErr_('Hanya PHC boleh melihat pemantauan kenderaan.');
  const nowMs = Date.now();
  const today = dayKey_(new Date(nowMs));
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(p.date || '')) ? String(p.date) : today;
  const amb = ambMap_(), mv = movesByReq_();

  const vehicles = {};   // plate -> {vehicleNo, cases: []}
  const ensureV = function (display) {
    const k = normPlate_(display) || '-';
    return vehicles[k] = vehicles[k] || { vehicleNo: String(display || '').trim() || '(no vehicle)', cases: [] };
  };
  readTable_('Vehicles').rows.forEach(function (v) { if (String(v.Active || 'Y').trim().toUpperCase() !== 'N') ensureV(v.VehicleNo); });

  readTable_('Requests').rows.forEach(function (r) {
    if (r.Status !== HKL.STATUS.LULUS && r.Status !== HKL.STATUS.DIENDORS) return;
    const a = amb[r.RequestID], trip = tripView_(mv[r.RequestID], r, a, nowMs);
    const sched = scheduledAt_(r, a);
    const startedOn = trip.steps.length ? dayKey_(toDate_(trip.steps[0].at)) : '';
    const inScope = (sched && dayKey_(sched) === date) || startedOn === date || (date === today && trip.state === 'in_progress');
    if (!inScope) return;
    ensureV(r.VehicleNo).cases.push(caseView_(r, a, trip));
  });

  const sum = { total: 0, done: 0, inProgress: 0, notStarted: 0, delayed: 0 };
  const list = Object.keys(vehicles).sort().map(function (k) {
    const v = vehicles[k];
    v.cases.sort(function (x, y) { return String(x.trip.scheduledAt).localeCompare(String(y.trip.scheduledAt)); });
    let lastPos = null;
    v.cases.forEach(function (c) {
      sum.total++;
      if (c.trip.state === 'done') sum.done++; else if (c.trip.state === 'in_progress') sum.inProgress++; else sum.notStarted++;
      if (c.trip.flags.length) sum.delayed++;
      c.trip.steps.forEach(function (s) { if (s.lat != null && (!lastPos || s.at > lastPos.at)) lastPos = { lat: s.lat, lng: s.lng, at: s.at, time: s.time, case: c.id }; });
    });
    return { vehicleNo: v.vehicleNo, cases: v.cases, lastPos: lastPos };
  });
  return { date: date, today: today, serverTime: new Date(nowMs).toISOString(), summary: sum, vehicles: list };
}
