/* Driver (vehicle) screen.
 *  - The driver ticks the patients travelling together (1-5 cases); one big button moves the ticked patients to their next step.
 *  - Taps are applied INSTANTLY on screen and sent from a persistent queue (works through dead spots; keeps the real tap time).
 *  - GPS is read in the background right after a tap (one fix, never blocks the button).
 *  - Optional auto-assist: while the screen is open and a trip is running, the position is checked every ~45 s (low-power fix)
 *    and the app SUGGESTS the next step when the vehicle is at a known place. It never tracks continuously.
 */
(function () {
  'use strict';
  var C = HKL, STEPS = C.MOVE_STEPS, M = C.MOVE, UNDO_MIN = 15, MAX_CASES = 5;
  var D = { base: null, cases: null, places: [], at: 0, loading: false, sel: {}, tsel: {}, queue: [], flushing: false, retry: null, netErr: '', suggest: {}, dismissed: {} };
  var A = { timer: null, fix: null, err: '' };
  var X; // context from app.js

  function esc(s) { return X.esc(s); }
  function $(s) { return X.view.querySelector(s); }
  function creds(extra) { return Object.assign({ vehicle: X.S.session.vehicle, pin: X.S.session.pin }, extra || {}); }
  function cacheKey() { return 'hkl.dc|' + X.S.session.vehicle; }
  function qKey() { return 'hkl.dq|' + X.S.session.vehicle; }
  function uuid() { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'k' + Date.now() + Math.random().toString(16).slice(2); }
  function hhmm(iso) { try { return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: C.TZ }); } catch (e) { return ''; } }
  function isNetErr(e) { return /sambungan|Respons pelayan tidak sah/i.test(e.message); }
  function autoOn() { return M.AUTO_MODE !== 'off' && X.store('hkl.autoLoc') !== false; }

  function authFail(e) {
    if (/PIN salah|Terlalu banyak/.test(e.message)) { X.logout(e.message); return true; }
    return false;
  }

  // One GPS fix. Resolves null when unavailable/denied/timeout; the step is still recorded.
  function getFix(highAcc) {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        function (p) { resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }); },
        function () { resolve(null); },
        { enableHighAccuracy: !!highAcc, timeout: highAcc ? 8000 : 10000, maximumAge: 30000 });
    });
  }

  // ---------- queue + optimistic state ----------
  function saveQ() { X.store(qKey(), D.queue.map(function (o) { return o; })); }

  // What the screen shows = last confirmed server state + every tap still waiting in the queue.
  function effective() {
    var cs = JSON.parse(JSON.stringify(D.base || []));
    D.queue.forEach(function (op) {
      op.ids.forEach(function (id) {
        var c = cs.filter(function (x) { return x.id === id; })[0]; if (!c) return;
        var t = c.trip; if (t.lastStep !== op.step - 1) return; // already confirmed by the server (e.g. reply was lost)
        t.steps.push({ n: op.step, at: op.at, time: hhmm(op.at), lat: op.lat == null || op.lat === '' ? null : op.lat, lng: op.lng == null || op.lng === '' ? null : op.lng,
          acc: null, source: op.source, driver: op.name, pending: true });
        t.lastStep = op.step; t.nextStep = op.step >= 6 ? 0 : op.step + 1; t.state = op.step >= 6 ? 'done' : 'in_progress';
        if (op.step === 1) t.tripId = 'pending:' + op.key;
      });
    });
    return cs;
  }

  function hasPending(ids) { return D.queue.some(function (op) { return op.ids.some(function (i) { return ids.indexOf(i) !== -1; }); }); }

  function mergeBase(list) {
    list.forEach(function (c) { D.base = (D.base || []).map(function (x) { return x.id === c.id ? c : x; }); });
    X.store(cacheKey(), { at: D.at, cases: D.base, places: D.places });
  }

  async function flush() {
    if (D.flushing) return;
    D.flushing = true; var refreshAfter = false;
    try {
      while (D.queue.length) {
        var op = D.queue[0];
        if (!op.ready) break; // still reading GPS for this tap
        try {
          var res = await X.api('driverStep', creds({ ids: op.ids, step: op.step, driverName: op.name, source: op.source, clientKey: op.key, clientAt: op.at,
            lat: op.lat == null ? '' : op.lat, lng: op.lng == null ? '' : op.lng, accuracy: op.acc == null ? '' : op.acc }));
          D.queue.shift(); saveQ(); D.netErr = '';
          mergeBase(res.cases);
        } catch (e) {
          if (authFail(e)) return;
          if (isNetErr(e)) { D.netErr = e.message; scheduleRetry(); break; }
          D.queue.shift(); saveQ(); refreshAfter = true; // the server refused this tap: drop it and show why
          X.banner('Langkah ' + op.step + ' (' + op.ids.join(', ') + ') ditolak: ' + e.message);
        }
      }
    } finally {
      D.flushing = false;
      if (!D.queue.length && D.retry) { clearInterval(D.retry); D.retry = null; }
      if (X.S.view === 'driver') paint();
      if (refreshAfter) refresh();
    }
  }

  function scheduleRetry() {
    if (D.retry) return;
    D.retry = setInterval(function () { if (D.queue.length) flush(); else { clearInterval(D.retry); D.retry = null; } }, 20000);
  }
  window.addEventListener('online', function () { if (X && D.queue.length) flush(); });

  // ---------- screen ----------
  window.renderDriver = function (ctx) {
    X = ctx; X.S.view = 'driver'; X.paintWho(); X.banner('');
    var saved = X.store(cacheKey());
    if (!D.base && saved && saved.cases) { D.base = saved.cases; D.places = saved.places || []; D.at = saved.at || 0; }
    if (!D.queue.length) {
      var q = X.store(qKey());
      if (q && q.length) { D.queue = q; D.queue.forEach(function (o) { o.ready = true; }); } // app was closed mid-GPS: send without a fix
    }
    X.view.innerHTML =
      '<div class="tools"><button class="btn sm sec" id="drf">Refresh</button><span id="dupd"></span></div>' +
      '<div class="card"><label for="dname" style="margin-top:0">Nama pemandu</label>' +
      '<input id="dname" type="text" maxlength="80" autocomplete="name" value="' + esc(X.store('hkl.driverName') || '') + '">' +
      '<p class="hint">Isi nama anda sebelum memulakan perjalanan.</p>' +
      (M.AUTO_MODE !== 'off' ? '<label class="chk"><input type="checkbox" id="autoloc"' + (autoOn() ? ' checked' : '') + '> Cadangan lokasi automatik' +
        '<small>Semak lokasi kira-kira setiap ' + M.AUTO_POLL_SEC + ' saat hanya semasa skrin ini dibuka dan perjalanan sedang berjalan.</small></label>' : '') + '</div>' +
      '<div id="dnet"></div><div id="dcases"></div>';
    $('#dname').onchange = function () { X.store('hkl.driverName', $('#dname').value.trim()); };
    $('#drf').onclick = function () { refresh(); };
    var al = $('#autoloc'); if (al) al.onchange = function () { X.store('hkl.autoLoc', al.checked); D.suggest = {}; ensureWatch(); paint(); };
    paint(); refresh(); if (D.queue.length) flush();
  };

  document.addEventListener('visibilitychange', function () {
    if (!X || !X.S.session || X.S.view !== 'driver') return;
    if (!document.hidden) {
      if (D.queue.length) flush();
      if (Date.now() - D.at > 60000) refresh();
    }
    ensureWatch();
  });

  async function refresh() {
    if (D.loading) return;
    D.loading = true; paintUpd();
    try {
      var d = await X.api('driverCases', creds());
      D.base = d.cases; D.places = d.places; D.at = Date.now();
      X.store(cacheKey(), { at: D.at, cases: D.base, places: D.places });
      if (X.S.view === 'driver') { if (!D.queue.length) X.banner(''); paint(); }
    } catch (e) {
      if (authFail(e)) return;
      if (X.S.view === 'driver') X.banner(e.message + (D.base ? ' (Memaparkan data tersimpan.)' : ''));
    } finally { D.loading = false; paintUpd(); }
  }

  function paintUpd() {
    var rf = $('#drf'), u = $('#dupd');
    if (rf) { rf.disabled = D.loading; rf.classList.toggle('busy', D.loading); }
    if (u) u.textContent = D.loading ? 'Mengemas kini...' : (D.at ? 'Dikemas kini ' + new Date(D.at).toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' }) : '');
  }

  // A trip = all started cases sharing a TripID. Each patient has his own timeline, so one trip can hold
  // patients at different steps (e.g. picked up from different wards, arriving at different times).
  function tripGroups() {
    var g = {}, order = [];
    (D.cases || []).filter(function (c) { return c.trip.state !== 'not_started'; }).forEach(function (c) {
      var k = c.trip.tripId || ('solo:' + c.id);
      if (!g[k]) { g[k] = []; order.push(k); }
      g[k].push(c);
    });
    return order.map(function (k) {
      return { key: k, cases: g[k], open: g[k].some(function (c) { return c.trip.state === 'in_progress'; }) };
    });
  }

  function canUndo(cs) {
    return cs.length && !hasPending(cs.map(function (c) { return c.id; })) && cs.every(function (c) {
      var s = c.trip.steps;
      return s.length && s[s.length - 1].n === cs[0].trip.lastStep && Date.now() - new Date(s[s.length - 1].at).getTime() <= UNDO_MIN * 60000;
    });
  }

  // Ticked patients inside a trip card. Default: the patients furthest behind (the ones who still need the next step).
  function tripSel(g) {
    var cur = D.tsel[g.key];
    if (cur) { var ok = g.cases.filter(function (c) { return cur[c.id]; }); if (ok.length) return ok; }
    var open = g.cases.filter(function (c) { return c.trip.state === 'in_progress'; });
    if (!open.length) return [];
    var min = Math.min.apply(null, open.map(function (c) { return c.trip.lastStep; }));
    return open.filter(function (c) { return c.trip.lastStep === min; });
  }

  // ---------- paint ----------
  function paint() {
    var box = $('#dcases'); if (!box) return;
    paintNet();
    D.cases = effective();
    if (!D.base) { box.innerHTML = '<div class="empty">Memuatkan kes...</div>'; return; }
    if (!D.cases.length) { box.innerHTML = '<div class="empty">Tiada kes ditugaskan kepada kenderaan ini.<br><small>Kes muncul di sini selepas Penyelia PHC meluluskan dan menetapkan no. kenderaan.</small></div>'; return; }

    var waiting = D.cases.filter(function (c) { return c.trip.state === 'not_started'; });
    // forget ticks for cases that are no longer waiting; a lone waiting case is ticked for the driver
    Object.keys(D.sel).forEach(function (id) { if (!waiting.some(function (c) { return c.id === id; })) delete D.sel[id]; });
    if (waiting.length === 1 && !Object.keys(D.sel).length && !D.touched) D.sel[waiting[0].id] = true;

    var h = '';
    var trips = tripGroups(), active = trips.filter(function (g) { return g.open; });
    if (active.length) h += '<h2>Dalam perjalanan</h2>' + active.map(tripCard).join('');
    if (waiting.length) {
      h += '<h2>Kes menunggu</h2><p class="hint" style="margin:0 0 6px">Tandakan pesakit yang akan dibawa dalam satu perjalanan (maks. ' + MAX_CASES + ').</p>' +
        waiting.map(waitCard).join('') + '<div class="derr banner" id="werr" hidden></div>' +
        '<button class="btn block bigbtn" id="startbtn" data-step="1"></button>';
    }
    var done = trips.filter(function (g) { return !g.open; });
    if (done.length) h += '<h2>Selesai</h2>' + done.map(doneCard).join('');
    box.innerHTML = h;
    paintStart();

    Array.prototype.forEach.call(box.querySelectorAll('[data-pick]'), function (cb) {
      cb.onchange = function () {
        D.touched = true;
        var id = cb.getAttribute('data-pick');
        if (cb.checked && Object.keys(D.sel).length >= MAX_CASES) { cb.checked = false; return werr('Maksimum ' + MAX_CASES + ' kes dalam satu perjalanan.'); }
        if (cb.checked) D.sel[id] = true; else delete D.sel[id];
        werr(''); paintStart();
      };
    });
    Array.prototype.forEach.call(box.querySelectorAll('[data-tsel]'), function (cb) {
      cb.onchange = function () {
        var k = cb.getAttribute('data-tsel'), g = tripGroups().filter(function (x) { return x.key === k; })[0];
        var cur = {}; tripSel(g).forEach(function (c) { cur[c.id] = true; });
        if (cb.checked) cur[cb.getAttribute('data-id')] = true; else delete cur[cb.getAttribute('data-id')];
        D.tsel[k] = cur; paint();
      };
    });
    var sb = $('#startbtn');
    if (sb) sb.onclick = function () { doStep(Object.keys(D.sel), 1, 'Manual'); };
    Array.prototype.forEach.call(box.querySelectorAll('[data-ids]'), function (b) {
      b.onclick = function () { doStep(b.getAttribute('data-ids').split(','), parseInt(b.getAttribute('data-step'), 10), 'Manual'); };
    });
    Array.prototype.forEach.call(box.querySelectorAll('[data-sug]'), function (b) {
      b.onclick = function () { var sg = JSON.parse(b.getAttribute('data-sug')); doStep(sg.ids, sg.step, 'Auto'); };
    });
    Array.prototype.forEach.call(box.querySelectorAll('[data-nosug]'), function (b) {
      b.onclick = function () { D.dismissed[b.getAttribute('data-nosug')] = Date.now() + M.SUGGEST_DISMISS_MIN * 60000; delete D.suggest[b.getAttribute('data-trip')]; paint(); };
    });
    Array.prototype.forEach.call(box.querySelectorAll('[data-undo]'), function (b) {
      b.onclick = function () { doUndo(b.getAttribute('data-undo').split(','), b); };
    });
    ensureWatch();
  }

  function paintNet() {
    var n = $('#dnet'); if (!n) return;
    if (!D.queue.length) { n.innerHTML = ''; return; }
    n.innerHTML = '<div class="card qbar"><span>&#9203; ' + D.queue.length + ' langkah belum dihantar' + (D.netErr ? ' &middot; tiada sambungan' : '') + '</span>' +
      '<button class="btn sm sec" id="qsend">Hantar sekarang</button></div>';
    $('#qsend').onclick = function () { flush(); };
  }

  function paintStart() {
    var sb = $('#startbtn'); if (!sb) return;
    var n = Object.keys(D.sel).length;
    sb.disabled = n === 0;
    sb.innerHTML = esc(STEPS[0].label) + '<small>' + (n ? n + ' pesakit dipilih &middot; ' + esc(STEPS[0].hint) : 'Tandakan sekurang-kurangnya satu kes') + '</small>';
  }

  function werr(msg) { var e = $('#werr'); if (e) { e.textContent = msg; e.hidden = !msg; } }

  function details(c) {
    return '<dl class="kv"><dt>Ambil di</dt><dd>' + esc(c.pickup) + '</dd><dt>Destinasi</dt><dd>' + esc(c.dest) + '</dd>' +
      (c.returnTo ? '<dt>Tunggu (balik)</dt><dd>' + esc(c.returnTo) + '</dd>' : '') +
      '<dt>Pemohon</dt><dd>' + esc(c.applicant) + (c.bhgUnit ? ' (' + esc(c.bhgUnit) + ')' : '') + '</dd>' +
      (c.tel ? '<dt>Telefon</dt><dd><a href="tel:' + esc(c.tel.replace(/[^\d+]/g, '')) + '">' + esc(c.tel) + '</a></dd>' : '') +
      (c.amb ? '<dt>Pesakit</dt><dd>' + esc(c.amb.patient) + '</dd>' + (c.amb.equipment ? '<dt>Peralatan</dt><dd>' + esc(c.amb.equipment) + '</dd>' : '') : '') + '</dl>';
  }

  function waitCard(c) {
    return '<label class="card pick' + (D.sel[c.id] ? ' on' : '') + '"><input type="checkbox" data-pick="' + esc(c.id) + '"' + (D.sel[c.id] ? ' checked' : '') + '>' +
      '<div class="pickbody"><div class="row"><b>' + esc(c.id) + '</b><span class="badge b-wait">Belum mula</span></div>' +
      '<div class="hint" style="margin:4px 0 8px">' + esc(c.when) + ' &middot; ' + esc(c.jenis) + '</div>' + details(c) +
      c.trip.flags.map(function (f) { return '<div class="flag">&#9888; ' + esc(f.text) + '</div>'; }).join('') + '</div></label>';
  }

  function stepTxt(s) { return esc(s.time) + (s.pending ? ' &middot; &#9203; menunggu hantar' : (s.lat == null ? ' &middot; tiada GPS' : '')) + (s.source === 'Auto' ? ' &middot; auto' : ''); }

  function stepper(t) {
    var nx = t.nextStep;
    return '<ol class="steps">' + STEPS.map(function (s) {
      var done = t.steps.filter(function (x) { return x.n === s.n; })[0];
      return '<li class="' + (done ? 'done' : (s.n === nx ? 'next' : '')) + '"><span class="dot">' + (done ? '&#10003;' : s.n) + '</span><span>' + esc(s.label) + '</span>' +
        '<em>' + (done ? stepTxt(done) : '') + '</em></li>';
    }).join('') + '</ol>';
  }

  function flagsOf(cs) {
    var seen = {}, h = '';
    cs.forEach(function (c) { c.trip.flags.forEach(function (f) { var k = f.code + f.text; if (!seen[k]) { seen[k] = 1; h += '<div class="flag">&#9888; ' + esc(f.text) + '</div>'; } }); });
    return h;
  }

  function caseLine(c) {
    return '<div class="tcase"><b>' + esc(c.id) + '</b> <span class="hint">' + esc(c.pickup) + ' &rarr; ' + esc(c.dest) +
      (c.amb && c.amb.patient ? ' &middot; ' + esc(c.amb.patient) : '') + '</span></div>';
  }

  function lastLabel(t) {
    var l = t.steps[t.steps.length - 1];
    return l ? esc(STEPS[l.n - 1].label) + ' &middot; ' + stepTxt(l) : '';
  }

  // One patient line in a trip: tick box + where this patient is now.
  function patientRow(g, c, checked) {
    var done = c.trip.state === 'done';
    return '<label class="prow' + (checked ? ' on' : '') + '"><input type="checkbox" data-tsel="' + esc(g.key) + '" data-id="' + esc(c.id) + '"' + (checked ? ' checked' : '') + '>' +
      '<div class="pbody"><div><b>' + esc(c.id) + '</b> <span class="hint">' + (c.amb && c.amb.patient ? esc(c.amb.patient) + ' &middot; ' : '') + esc(c.pickup) + '</span></div>' +
      '<div class="pstat' + (done ? ' ok' : '') + '">' + (done ? '&#10003; ' : '') + lastLabel(c.trip) + '</div></div></label>';
  }

  function tripCard(g) {
    var cs = g.cases, multi = cs.length > 1, sel = tripSel(g), selIds = {};
    sel.forEach(function (c) { selIds[c.id] = true; });
    var steps = sel.map(function (c) { return c.trip.lastStep; }), same = steps.length && steps.every(function (x) { return x === steps[0]; });
    var next = same && sel[0].trip.nextStep, s = next ? STEPS[next - 1] : null;
    var ids = sel.map(function (c) { return c.id; }).join(',');
    var h = '<div class="card dtrip" data-trip="' + esc(g.key) + '"><div class="row"><b>' + (multi ? cs.length + ' pesakit dalam satu perjalanan' : esc(cs[0].id)) +
      '</b><span class="badge b-end">Dalam perjalanan</span></div>';
    if (multi) {
      h += '<p class="hint" style="margin:6px 0">Tandakan pesakit yang sampai / bergerak sekarang. Setiap pesakit ada masa sendiri.</p>' +
        '<div class="prows">' + cs.map(function (c) { return patientRow(g, c, !!selIds[c.id]); }).join('') + '</div>';
    } else {
      h += '<div class="tcases">' + caseLine(cs[0]) + '</div>' + stepper(cs[0].trip);
    }
    h += flagsOf(cs);
    var sg = D.suggest[g.key];
    if (sg && s && sg.step === next) {
      h += '<div class="suggest"><div>&#128205; ' + (sg.place ? 'Anda berada di <b>' + esc(sg.place) + '</b>.' : 'Anda sudah meninggalkan destinasi.') + ' ' + esc(s.label) + '?</div><div class="sbtns">' +
        '<button class="btn sm" data-sug="' + esc(JSON.stringify({ ids: sel.map(function (c) { return c.id; }), step: next })) + '">Ya, rekod</button>' +
        '<button class="btn sm sec" data-nosug="' + esc(g.key + ':' + next) + '" data-trip="' + esc(g.key) + '">Bukan lagi</button></div></div>';
    }
    if (s) {
      h += '<button class="btn block bigbtn" data-ids="' + esc(ids) + '" data-step="' + next + '">' + esc(s.label) +
        '<small>' + (multi ? sel.length + ' pesakit &middot; ' : '') + esc(s.hint) + '</small></button>';
    } else if (multi) {
      h += '<p class="hint" style="margin:8px 0 0">' + (sel.length ? 'Pesakit yang ditandakan berada pada langkah berbeza. Tandakan pesakit pada langkah yang sama.' : 'Tandakan sekurang-kurangnya seorang pesakit.') + '</p>';
    }
    h += '<div class="derr banner" hidden></div>';
    if (sel.length && canUndo(sel)) h += '<button class="linkbtn" data-undo="' + esc(ids) + '">Batalkan langkah terakhir' + (multi ? ' (' + sel.length + ' pesakit)' : '') + '</button>';
    return h + '</div>';
  }

  function doneCard(g) {
    var cs = g.cases, all = cs.map(function (c) { return c.id; }).join(',');
    var firstT = cs.map(function (c) { return c.trip.steps[0]; }).filter(Boolean).sort(function (a, b) { return a.at < b.at ? -1 : 1; })[0];
    var lastT = cs.map(function (c) { return c.trip.steps[c.trip.steps.length - 1]; }).filter(Boolean).sort(function (a, b) { return a.at < b.at ? 1 : -1; })[0];
    var h = '<div class="card dtrip" data-trip="' + esc(g.key) + '"><div class="row"><b>' + (cs.length > 1 ? cs.length + ' pesakit' : esc(cs[0].id)) + '</b><span class="badge b-ok">Selesai</span></div>' +
      '<div class="tcases">' + cs.map(function (c) {
        return caseLine(c) + '<div class="hint" style="margin:0 0 4px 0">&#10003; ' + esc(c.trip.steps[0].time) + ' &ndash; ' + esc(c.trip.steps[c.trip.steps.length - 1].time) +
          (c.trip.mins.total != null ? ' &middot; ' + c.trip.mins.total + ' minit' : '') + (hasPending([c.id]) ? ' &middot; &#9203; menunggu hantar' : '') + '</div>';
      }).join('') + '</div>' +
      '<p class="hint" style="margin:6px 0 0">' + (firstT && lastT ? esc(firstT.time) + ' &ndash; ' + esc(lastT.time) : '') + (firstT && firstT.driver ? ' &middot; ' + esc(firstT.driver) : '') + '</p>' +
      '<div class="derr banner" hidden></div>';
    if (canUndo(cs)) h += '<button class="linkbtn" data-undo="' + esc(all) + '">Batalkan langkah terakhir</button>';
    return h + '</div>';
  }

  function cardErr(ids, msg) {
    var el = null;
    Array.prototype.forEach.call(X.view.querySelectorAll('.dtrip'), function (t) {
      if (!el && ids.some(function (id) { return t.innerHTML.indexOf(id) !== -1; })) el = t.querySelector('.derr');
    });
    if (!el) el = $('#werr');
    if (!el) return X.banner(msg);
    el.textContent = msg; el.hidden = !msg;
  }

  // ---------- actions ----------
  // Instant: the tap goes into the queue and the screen updates at once; GPS and sending happen in the background.
  function doStep(ids, step, source) {
    var name = (($('#dname') || {}).value || '').trim();
    if (!ids.length) return werr('Tandakan sekurang-kurangnya satu kes.');
    if (!name) { var f = ((D.cases || []).filter(function (c) { return c.trip.steps[0] && c.trip.steps[0].driver; })[0] || { trip: { steps: [{}] } }).trip.steps[0].driver; name = f || ''; }
    if (step === 1 && name.length < 2) { cardErr(ids, 'Sila isi nama pemandu dahulu.'); $('#dname').focus(); return; }
    X.store('hkl.driverName', name);
    var op = { ids: ids.slice(), step: step, name: name, source: source === 'Auto' ? 'Auto' : 'Manual', key: uuid(), at: new Date().toISOString(), ready: false };
    D.queue.push(op); saveQ();
    if (step === 1) { D.sel = {}; D.touched = false; }
    D.tsel = {}; D.suggest = {}; X.banner('');
    paint();
    if (op.source === 'Auto' && A.fix) { op.lat = A.fix.lat; op.lng = A.fix.lng; op.acc = A.fix.accuracy; op.ready = true; saveQ(); flush(); return; }
    getFix(true).then(function (fix) {
      if (fix) { op.lat = fix.lat; op.lng = fix.lng; op.acc = fix.accuracy; }
      op.ready = true; saveQ(); flush();
    });
  }

  async function doUndo(ids, btn) {
    if (hasPending(ids)) return cardErr(ids, 'Tunggu langkah dihantar dahulu.');
    if (!window.confirm('Batalkan langkah terakhir (' + ids.join(', ') + ')?')) return;
    await X.busy(btn, async function () {
      try { var res = await X.api('driverUndo', creds({ ids: ids })); D.tsel = {}; D.suggest = {}; mergeBase(res.cases); paint(); }
      catch (e) { if (authFail(e)) return; cardErr(ids, e.message); }
    });
  }

  // ---------- auto-assist (suggest the next step at a known place; foreground only, low-power fixes) ----------
  function dist(a, b) {
    var R = 6371000, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function placeAt(fix, kinds) {
    var best = null;
    (D.places || []).forEach(function (p) {
      var k = String(p.kind || '').toLowerCase();
      var okKind = kinds.some(function (x) { return x === 'destination' ? (k !== 'home' && k !== 'pickup') : k === x; });
      if (!okKind) return;
      var d = dist(fix, p); if (d <= (p.radius || M.GEO_DEFAULT_RADIUS_M) && (!best || d < best.d)) best = { name: p.name, d: d };
    });
    return best;
  }

  function hasOpenTrip() { return (D.cases || []).some(function (c) { return c.trip.state === 'in_progress'; }); }

  function ensureWatch() {
    var want = autoOn() && X && X.S.session && X.S.view === 'driver' && !document.hidden && hasOpenTrip() && !!navigator.geolocation;
    if (want && !A.timer) { pollOnce(); A.timer = setInterval(pollOnce, M.AUTO_POLL_SEC * 1000); }
    if (!want && A.timer) { clearInterval(A.timer); A.timer = null; }
  }

  async function pollOnce() {
    var fix = await getFix(false);
    if (!fix) { A.err = 'lokasi tidak tersedia'; return; }
    A.fix = { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, at: Date.now() }; A.err = '';
    evaluate();
  }

  function evaluate() {
    if (!A.fix || X.S.view !== 'driver' || A.fix.accuracy > M.MAX_FIX_ACCURACY_M) return;
    var changed = false, found = {};
    tripGroups().filter(function (g) { return g.open; }).forEach(function (g) {
      var sel = tripSel(g); if (!sel.length) return;
      var steps = sel.map(function (c) { return c.trip.lastStep; });
      if (!steps.every(function (x) { return x === steps[0]; })) return;
      var next = steps[0] + 1, hit = null;
      if (hasPending(sel.map(function (c) { return c.id; }))) return;
      if (next === 2) hit = placeAt(A.fix, ['pickup']);
      else if (next === 4) hit = placeAt(A.fix, ['destination']);
      else if (next === 6) hit = placeAt(A.fix, ['home']);
      else if (next === 5) { // left the destination: far from where "Arrived at destination" was recorded
        var s4 = sel[0].trip.steps.filter(function (x) { return x.n === 4 && x.lat != null && x.lng != null; })[0];
        if (s4 && dist(A.fix, { lat: s4.lat, lng: s4.lng }) > M.LEAVE_DEST_M) hit = { name: '' };
      }
      if (!hit) return;
      var dk = g.key + ':' + next; if ((D.dismissed[dk] || 0) > Date.now()) return;
      found[g.key] = { step: next, place: hit.name };
      if (M.AUTO_MODE === 'auto') { doStep(sel.map(function (c) { return c.id; }), next, 'Auto'); return; }
      if (!D.suggest[g.key] || D.suggest[g.key].step !== next) changed = true;
    });
    Object.keys(D.suggest).forEach(function (k) { if (!found[k]) changed = true; });
    if (M.AUTO_MODE !== 'auto') D.suggest = found;
    if (changed) paint();
  }
})();
