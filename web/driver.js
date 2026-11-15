/* Driver (vehicle) screen. The driver ticks the patients travelling together (1-5 cases), then one big button
 * moves the whole trip to its next step. One GPS fix per tap; no continuous tracking. */
(function () {
  'use strict';
  var C = HKL, STEPS = C.MOVE_STEPS, UNDO_MIN = 15, MAX_CASES = 5;
  var D = { cases: null, places: [], at: 0, loading: false, keys: {}, sel: {}, tsel: {} };
  var X; // context from app.js

  function esc(s) { return X.esc(s); }
  function $(s) { return X.view.querySelector(s); }
  function creds(extra) { return Object.assign({ vehicle: X.S.session.vehicle, pin: X.S.session.pin }, extra || {}); }
  function cacheKey() { return 'hkl.dc|' + X.S.session.vehicle; }
  function uuid() { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'k' + Date.now() + Math.random().toString(16).slice(2); }

  function authFail(e) {
    if (/PIN salah|Terlalu banyak/.test(e.message)) { X.logout(e.message); return true; }
    return false;
  }

  // One GPS fix (cheap). Resolves null when unavailable/denied/timeout; the step is still recorded.
  function getFix() {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        function (p) { resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }); },
        function () { resolve(null); },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 });
    });
  }

  window.renderDriver = function (ctx) {
    X = ctx; X.S.view = 'driver'; X.paintWho(); X.banner('');
    var saved = X.store(cacheKey());
    if (!D.cases && saved && saved.cases) { D.cases = saved.cases; D.places = saved.places || []; D.at = saved.at || 0; }
    X.view.innerHTML =
      '<div class="tools"><button class="btn sm sec" id="drf">Refresh</button><span id="dupd"></span></div>' +
      '<div class="card"><label for="dname" style="margin-top:0">Nama pemandu</label>' +
      '<input id="dname" type="text" maxlength="80" autocomplete="name" value="' + esc(X.store('hkl.driverName') || '') + '">' +
      '<p class="hint">Isi nama anda sebelum memulakan perjalanan.</p></div>' +
      '<div id="dcases"></div>';
    $('#dname').onchange = function () { X.store('hkl.driverName', $('#dname').value.trim()); };
    $('#drf').onclick = function () { refresh(); };
    paint(); refresh();
  };

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && X && X.S.session && X.S.view === 'driver' && Date.now() - D.at > 60000) refresh();
  });

  async function refresh() {
    if (D.loading) return;
    D.loading = true; paintUpd();
    try {
      var d = await X.api('driverCases', creds());
      D.cases = d.cases; D.places = d.places; D.at = Date.now();
      X.store(cacheKey(), { at: D.at, cases: D.cases, places: D.places });
      if (X.S.view === 'driver') { X.banner(''); paint(); }
    } catch (e) {
      if (authFail(e)) return;
      if (X.S.view === 'driver') X.banner(e.message + (D.cases ? ' (Memaparkan data tersimpan.)' : ''));
    } finally { D.loading = false; paintUpd(); }
  }

  function paintUpd() {
    var rf = $('#drf'), u = $('#dupd');
    if (rf) { rf.disabled = D.loading; rf.classList.toggle('busy', D.loading); }
    if (u) u.textContent = D.loading ? 'Mengemas kini...' : (D.at ? 'Dikemas kini ' + new Date(D.at).toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' }) : '');
  }

  function replaceCases(list) {
    list.forEach(function (c) { D.cases = (D.cases || []).map(function (x) { return x.id === c.id ? c : x; }); });
    X.store(cacheKey(), { at: D.at, cases: D.cases, places: D.places });
  }

  // Group cases of one state by TripID (cases without a TripID, e.g. old data, stand alone).
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
    return cs.length && cs.every(function (c) {
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
    if (!D.cases) { box.innerHTML = '<div class="empty">Memuatkan kes...</div>'; return; }
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
    if (sb) sb.onclick = function () { doStep(Object.keys(D.sel), 1, sb); };
    Array.prototype.forEach.call(box.querySelectorAll('[data-ids]'), function (b) {
      b.onclick = function () { doStep(b.getAttribute('data-ids').split(','), parseInt(b.getAttribute('data-step'), 10), b); };
    });
    Array.prototype.forEach.call(box.querySelectorAll('[data-undo]'), function (b) {
      b.onclick = function () { doUndo(b.getAttribute('data-undo').split(','), b); };
    });
  }

  function paintStart() {
    var sb = $('#startbtn'); if (!sb) return;
    var n = Object.keys(D.sel).length;
    sb.disabled = sb.classList.contains('busy') ? true : n === 0;
    sb.innerHTML = esc(STEPS[0].label) + '<small>' + (n ? n + (n > 1 ? ' pesakit dipilih' : ' pesakit dipilih') + ' &middot; ' + esc(STEPS[0].hint) : 'Tandakan sekurang-kurangnya satu kes') + '</small>';
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

  function stepper(t) {
    var nx = t.nextStep;
    return '<ol class="steps">' + STEPS.map(function (s) {
      var done = t.steps.filter(function (x) { return x.n === s.n; })[0];
      return '<li class="' + (done ? 'done' : (s.n === nx ? 'next' : '')) + '"><span class="dot">' + (done ? '&#10003;' : s.n) + '</span><span>' + esc(s.label) + '</span>' +
        '<em>' + (done ? esc(done.time) + (done.lat == null ? ' &middot; tiada GPS' : '') : '') + '</em></li>';
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
    return l ? STEPS[l.n - 1].label + ' &middot; ' + esc(l.time) + (l.lat == null ? ' &middot; tiada GPS' : '') : '';
  }

  // One patient line in a trip: tick box + where this patient is now.
  function patientRow(g, c, checked) {
    var done = c.trip.state === 'done';
    return '<label class="prow' + (checked ? ' on' : '') + '"><input type="checkbox" data-tsel="' + esc(g.key) + '" data-id="' + esc(c.id) + '"' + (checked ? ' checked' : '') + '>' +
      '<div class="pbody"><div><b>' + esc(c.id) + '</b> <span class="hint">' + esc(c.amb && c.amb.patient ? c.amb.patient + ' &middot; ' : '') + esc(c.pickup) + '</span></div>' +
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
          (c.trip.mins.total != null ? ' &middot; ' + c.trip.mins.total + ' minit' : '') + '</div>';
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
  async function doStep(ids, step, btn) {
    var name = ($('#dname').value || '').trim();
    cardErr(ids, '');
    if (!ids.length) return werr('Tandakan sekurang-kurangnya satu kes.');
    if (step === 1 && name.length < 2) { cardErr(ids, 'Sila isi nama pemandu dahulu.'); $('#dname').focus(); return; }
    X.store('hkl.driverName', name);
    await X.busy(btn, async function () {
      var kk = ids.slice().sort().join(',') + ':' + step;
      var key = D.keys[kk] || (D.keys[kk] = uuid()); // same key on retry => server never records twice
      var fix = await getFix();
      try {
        var res = await X.api('driverStep', creds({ ids: ids, step: step, driverName: name, source: 'Manual', clientKey: key,
          lat: fix ? fix.lat : '', lng: fix ? fix.lng : '', accuracy: fix ? fix.accuracy : '' }));
        delete D.keys[kk];
        if (step === 1) { D.sel = {}; D.touched = false; }
        D.tsel = {};
        replaceCases(res.cases); paint();
      } catch (e) {
        if (authFail(e)) return;
        if (/sudah direkodkan|bukan dalam perjalanan/.test(e.message)) { delete D.keys[kk]; refresh(); }
        cardErr(ids, e.message);
      }
    });
  }

  async function doUndo(ids, btn) {
    if (!window.confirm('Batalkan langkah terakhir (' + ids.join(', ') + ')?')) return;
    await X.busy(btn, async function () {
      try { var res = await X.api('driverUndo', creds({ ids: ids })); D.tsel = {}; replaceCases(res.cases); paint(); }
      catch (e) { if (authFail(e)) return; cardErr(ids, e.message); }
    });
  }
})();
