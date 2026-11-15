/* Driver (vehicle) screen: one big button for the next step. One GPS fix per tap; no continuous tracking. */
(function () {
  'use strict';
  var C = HKL, STEPS = C.MOVE_STEPS, UNDO_MIN = 15;
  var D = { cases: null, places: [], at: 0, loading: false, keys: {} };
  var X; // context from app.js

  function esc(s) { return X.esc(s); }
  function $(s) { return X.view.querySelector(s); }
  function creds(extra) { return Object.assign({ vehicle: X.S.session.vehicle, pin: X.S.session.pin }, extra || {}); }
  function cacheKey() { return 'hkl.dc|' + X.S.session.vehicle; }
  function uuid() { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'k' + Date.now() + Math.random().toString(16).slice(2); }
  function stepOf(n) { return STEPS[n - 1]; }

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
      '<p class="hint">Isi nama anda sebelum menekan "Journey starts".</p></div>' +
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

  function replaceCase(c) {
    D.cases = (D.cases || []).map(function (x) { return x.id === c.id ? c : x; });
    X.store(cacheKey(), { at: D.at, cases: D.cases, places: D.places });
  }

  function canUndo(c) {
    var s = c.trip.steps;
    if (!s.length) return false;
    return Date.now() - new Date(s[s.length - 1].at).getTime() <= UNDO_MIN * 60000;
  }

  function paint() {
    var box = $('#dcases'); if (!box) return;
    if (!D.cases) { box.innerHTML = '<div class="empty">Memuatkan kes...</div>'; return; }
    if (!D.cases.length) { box.innerHTML = '<div class="empty">Tiada kes ditugaskan kepada kenderaan ini.<br><small>Kes muncul di sini selepas Penyelia PHC meluluskan dan menetapkan no. kenderaan.</small></div>'; return; }
    box.innerHTML = D.cases.map(caseCard).join('');
    Array.prototype.forEach.call(box.querySelectorAll('[data-step]'), function (b) {
      b.onclick = function () { doStep(b.getAttribute('data-id'), parseInt(b.getAttribute('data-step'), 10), b); };
    });
    Array.prototype.forEach.call(box.querySelectorAll('[data-undo]'), function (b) {
      b.onclick = function () { doUndo(b.getAttribute('data-undo'), b); };
    });
  }

  function caseCard(c) {
    var t = c.trip, nx = t.nextStep, st = t.state;
    var badge = st === 'done' ? '<span class="badge b-ok">Selesai</span>' : st === 'in_progress' ? '<span class="badge b-end">Dalam perjalanan</span>' : '<span class="badge b-wait">Belum mula</span>';
    var h = '<div class="card dcase" data-case="' + esc(c.id) + '"><div class="row"><b>' + esc(c.id) + '</b>' + badge + '</div>' +
      '<div class="hint" style="margin:4px 0 8px">' + esc(c.when) + ' &middot; ' + esc(c.jenis) + '</div>' +
      '<dl class="kv"><dt>Ambil di</dt><dd>' + esc(c.pickup) + '</dd><dt>Destinasi</dt><dd>' + esc(c.dest) + '</dd>' +
      (c.returnTo ? '<dt>Tunggu (balik)</dt><dd>' + esc(c.returnTo) + '</dd>' : '') +
      '<dt>Pemohon</dt><dd>' + esc(c.applicant) + (c.bhgUnit ? ' (' + esc(c.bhgUnit) + ')' : '') + '</dd>' +
      (c.tel ? '<dt>Telefon</dt><dd><a href="tel:' + esc(c.tel.replace(/[^\d+]/g, '')) + '">' + esc(c.tel) + '</a></dd>' : '') +
      (c.amb ? '<dt>Pesakit</dt><dd>' + esc(c.amb.patient) + '</dd>' + (c.amb.equipment ? '<dt>Peralatan</dt><dd>' + esc(c.amb.equipment) + '</dd>' : '') : '') +
      '</dl>';
    h += '<ol class="steps">' + STEPS.map(function (s) {
      var done = t.steps.filter(function (x) { return x.n === s.n; })[0];
      return '<li class="' + (done ? 'done' : (s.n === nx ? 'next' : '')) + '"><span class="dot">' + (done ? '&#10003;' : s.n) + '</span><span>' + esc(s.label) + '</span>' +
        '<em>' + (done ? esc(done.time) + (done.lat == null ? ' &middot; tiada GPS' : '') : '') + '</em></li>';
    }).join('') + '</ol>';
    t.flags.forEach(function (f) { h += '<div class="flag">&#9888; ' + esc(f.text) + '</div>'; });
    if (nx) {
      var s = stepOf(nx);
      h += '<button class="btn block bigbtn" data-id="' + esc(c.id) + '" data-step="' + nx + '">' + esc(s.label) + '<small>' + esc(s.hint) + '</small></button>';
    } else {
      h += '<p class="hint" style="text-align:center;margin:10px 0 0">&#10003; Perjalanan selesai' + (t.mins.total != null ? ' &middot; ' + t.mins.total + ' minit' : '') + '</p>';
    }
    h += '<div class="derr banner" hidden></div>';
    if (canUndo(c)) h += '<button class="linkbtn" data-undo="' + esc(c.id) + '">Batalkan langkah terakhir</button>';
    return h + '</div>';
  }

  function cardErr(id, msg) {
    var el = X.view.querySelector('.dcase[data-case="' + id + '"] .derr');
    if (!el) return X.banner(msg);
    el.textContent = msg; el.hidden = !msg;
  }

  async function doStep(id, step, btn) {
    var name = ($('#dname').value || '').trim();
    cardErr(id, '');
    if (step === 1 && name.length < 2) { cardErr(id, 'Sila isi nama pemandu dahulu.'); $('#dname').focus(); return; }
    X.store('hkl.driverName', name);
    await X.busy(btn, async function () {
      var key = D.keys[id + ':' + step] || (D.keys[id + ':' + step] = uuid()); // same key on retry => server never records twice
      var fix = await getFix();
      try {
        var res = await X.api('driverStep', creds({ id: id, step: step, driverName: name, source: 'Manual', clientKey: key,
          lat: fix ? fix.lat : '', lng: fix ? fix.lng : '', accuracy: fix ? fix.accuracy : '' }));
        delete D.keys[id + ':' + step];
        replaceCase(res.case); paint();
      } catch (e) {
        if (authFail(e)) return;
        if (/sudah direkodkan/.test(e.message)) { delete D.keys[id + ':' + step]; refresh(); }
        cardErr(id, e.message);
      }
    });
  }

  async function doUndo(id, btn) {
    if (!window.confirm('Batalkan langkah terakhir untuk ' + id + '?')) return;
    await X.busy(btn, async function () {
      try { var res = await X.api('driverUndo', creds({ id: id })); replaceCase(res.case); paint(); }
      catch (e) { if (authFail(e)) return; cardErr(id, e.message); }
    });
  }
})();
