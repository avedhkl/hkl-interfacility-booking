/* HKL Tempahan Kenderaan - frontend (static, Bahasa Malaysia). No build step. */
(function () {
  'use strict';
  var C = HKL, API = window.HKL_CONFIG && window.HKL_CONFIG.API_URL;
  var view = document.getElementById('view');
  var S = { session: null, data: {}, updated: {}, scope: 'active', filter: 'all', mine: false, refreshing: false, view: '' };

  // ---------- utils ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(s, r) { return (r || document).querySelector(s); }
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function isPHC() { return S.session && S.session.role !== C.ROLES.PEMOHON; }

  function banner(msg, info) {
    var b = $('#banner');
    if (!msg) { b.hidden = true; return; }
    b.textContent = msg; b.className = 'banner' + (info ? ' info' : ''); b.hidden = false;
  }

  async function api(action, payload, timeout) {
    var ctrl = new AbortController(), t = setTimeout(function () { ctrl.abort(); }, timeout || 45000);
    try {
      var res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: action, payload: payload || {} }), signal: ctrl.signal });
      var j;
      try { j = await res.json(); } catch (e) { throw new Error('Respons pelayan tidak sah. Cuba lagi.'); }
      if (!j.ok) throw new Error(j.error || 'Ralat tidak diketahui.');
      return j.data;
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('Sambungan terlalu lama. Semak internet dan cuba lagi.');
      if (e instanceof TypeError) throw new Error('Tiada sambungan internet atau pelayan tidak dapat dihubungi.');
      throw e;
    } finally { clearTimeout(t); }
  }
  function authP(extra) { return Object.assign({ role: S.session.role, name: S.session.name, passcode: S.session.passcode || '' }, extra || {}); }

  // Spinner + disable while in flight; always restored (also on error).
  async function busy(btn, fn) {
    if (btn.disabled) return;
    btn.disabled = true; btn.classList.add('busy');
    try { return await fn(); } finally { btn.disabled = false; btn.classList.remove('busy'); }
  }

  function badge(st) {
    var m = {}; m[C.STATUS.MENUNGGU] = 'b-wait'; m[C.STATUS.LULUS] = 'b-ok'; m[C.STATUS.TIDAK_LULUS] = 'b-no'; m[C.STATUS.DIENDORS] = 'b-end';
    return '<span class="badge ' + (m[st] || 'b-wait') + '">' + esc(C.label(st)) + '</span>';
  }

  // ---------- cache (stale-while-revalidate) ----------
  function ckey(scope) { return 'hkl.c1|' + S.session.role + '|' + norm(S.session.name) + '|' + scope; }
  function loadCache(scope) {
    if (S.data[scope]) return;
    var c = store(ckey(scope));
    if (c && c.requests) { S.data[scope] = c.requests; S.updated[scope] = c.at; }
  }

  async function refresh(scope, btn) {
    if (S.refreshing) return;
    S.refreshing = true; paintRefresh();
    try {
      var d = await api('list', authP({ scope: scope }));
      S.data[scope] = d.requests; S.updated[scope] = Date.now();
      store(ckey(scope), { at: S.updated[scope], requests: d.requests });
      if (S.view === 'list' && S.scope === scope) { banner(''); paintList(); }
    } catch (e) {
      if (/Kata laluan|Terlalu banyak/.test(e.message)) { logout(e.message); return; }
      if (S.view === 'list') banner(e.message + (S.data[scope] ? ' (Memaparkan data tersimpan.)' : ''));
    } finally { S.refreshing = false; paintRefresh(); }
  }

  // ---------- router ----------
  function route() {
    window.scrollTo(0, 0);
    if (!S.session) return renderLogin();
    var h = location.hash || '#/';
    if (h.indexOf('#/r/') === 0) return renderDetail(decodeURIComponent(h.slice(4)));
    if (h === '#/baru' && !isPHC()) return renderForm();
    renderList();
  }
  window.addEventListener('hashchange', route);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && S.view === 'list' && S.session && Date.now() - (S.updated[S.scope] || 0) > 60000) refresh(S.scope);
  });

  function paintWho() {
    var w = $('#who');
    if (!S.session) { w.innerHTML = ''; return; }
    w.innerHTML = esc(S.session.name) + '<br><small>' + esc(S.session.role) + '</small><br><button id="logout">Log keluar</button>';
    $('#logout').onclick = function () { logout(); };
  }

  function logout(msg) {
    store('hkl.session', null); S.session = null; S.data = {}; S.updated = {};
    location.hash = '#/'; paintWho(); renderLogin(msg);
  }

  // ---------- login ----------
  function renderLogin(msg) {
    S.view = 'login'; paintWho(); banner(msg || '');
    var last = store('hkl.last') || {};
    var roles = [C.ROLES.PEMOHON, C.ROLES.PHC, C.ROLES.ADMIN];
    view.innerHTML = '<h2>Log masuk</h2><div class="card"><form id="lf" autocomplete="off">' +
      '<label>Peranan</label><div class="seg">' + roles.map(function (r) {
        return '<label><input type="radio" name="role" value="' + esc(r) + '"' + ((last.role || roles[0]) === r ? ' checked' : '') + '><span>' + esc(r) + '</span></label>';
      }).join('') + '</div>' +
      '<label for="lname">Nama</label><input id="lname" type="text" required maxlength="80" value="' + esc(last.name || '') + '" autocomplete="name">' +
      '<div id="pcw"><label for="lpc">Kata laluan PHC</label><input id="lpc" type="password" autocomplete="current-password"></div>' +
      '<p class="hint">Nama dan peranan diingati pada peranti ini.</p>' +
      '<button class="btn block" id="lbtn" type="submit">Masuk</button></form></div>';
    function sync() { $('#pcw').hidden = document.querySelector('input[name=role]:checked').value === C.ROLES.PEMOHON; }
    Array.prototype.forEach.call(view.querySelectorAll('input[name=role]'), function (i) { i.onchange = sync; });
    sync();
    $('#lf').onsubmit = function (ev) {
      ev.preventDefault();
      var role = document.querySelector('input[name=role]:checked').value, name = $('#lname').value.trim(), pc = $('#lpc').value;
      if (!name) return banner('Sila isi nama.');
      if (role !== C.ROLES.PEMOHON && !pc) return banner('Sila isi kata laluan.');
      busy($('#lbtn'), async function () {
        banner('');
        var s = { role: role, name: name, passcode: role === C.ROLES.PEMOHON ? '' : pc };
        S.session = s;
        try {
          var d = await api('list', authP({ scope: 'active' }));
          store('hkl.session', s); store('hkl.last', { role: role, name: name });
          S.data = { active: d.requests }; S.updated = { active: Date.now() };
          store(ckey('active'), { at: S.updated.active, requests: d.requests });
          location.hash = '#/'; route();
        } catch (e) { S.session = null; banner(e.message); }
      });
    };
  }

  // ---------- list ----------
  function renderList() {
    S.view = 'list'; paintWho(); banner('');
    loadCache(S.scope);
    var arch = S.scope === 'archive';
    view.innerHTML = '<div class="stats" id="stats"></div>' +
      '<div class="tools"><button class="btn sm sec" id="rf">Refresh</button>' +
      '<button class="btn sm sec" id="arch">' + (arch ? 'Senarai aktif' : 'Archive') + '</button>' +
      (!isPHC() ? '<label style="margin:0;font-weight:400"><input type="checkbox" id="mine"' + (S.mine ? ' checked' : '') + '> Saya sahaja</label>' : '') +
      '<span id="upd"></span></div>' +
      (arch ? '<p class="hint">Archive: kes Diendors / Tidak Lulus lebih ' + C.ARCHIVE_HOURS + ' jam. Rekod tidak pernah dipadam.</p>' : '') +
      '<div id="items"></div>' +
      (!isPHC() && !arch ? '<a class="btn fab" href="#/baru">+ Permohonan Baru</a>' : '');
    $('#rf').onclick = function () { refresh(S.scope); };
    $('#arch').onclick = function () { S.scope = arch ? 'active' : 'archive'; S.filter = 'all'; renderList(); };
    var m = $('#mine'); if (m) m.onchange = function () { S.mine = m.checked; paintList(); };
    paintList(); paintRefresh();
    refresh(S.scope);
  }

  function paintRefresh() {
    var rf = $('#rf'), u = $('#upd');
    if (rf) { rf.disabled = S.refreshing; rf.classList.toggle('busy', S.refreshing); }
    if (u) {
      var t = S.updated[S.scope];
      u.textContent = S.refreshing ? 'Mengemas kini...' : (t ? 'Dikemas kini ' + new Date(t).toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' }) : '');
    }
  }

  function paintList() {
    var all = S.data[S.scope], st = $('#stats'), items = $('#items');
    if (!st || !items) return;
    if (!all) { st.innerHTML = ''; items.innerHTML = '<div class="empty">Memuatkan senarai...</div>'; return; }
    var count = function (s) { return all.filter(function (r) { return r.status === s; }).length; };
    var cards = [['all', 'Jumlah Tempahan Kenderaan', all.length], [C.STATUS.MENUNGGU, 'Pending Approval', count(C.STATUS.MENUNGGU)], [C.STATUS.LULUS, 'Approved', count(C.STATUS.LULUS)],
      [C.STATUS.TIDAK_LULUS, 'Not Approved', count(C.STATUS.TIDAK_LULUS)], [C.STATUS.DIENDORS, 'Tuntutan Claim Ready', count(C.STATUS.DIENDORS)]];
    st.innerHTML = cards.map(function (c) {
      return '<button class="stat' + (S.filter === c[0] ? ' on' : '') + '" data-f="' + esc(c[0]) + '"><b>' + c[2] + '</b><span>' + esc(c[1]) + '</span></button>';
    }).join('');
    Array.prototype.forEach.call(st.querySelectorAll('.stat'), function (b) { b.onclick = function () { S.filter = b.getAttribute('data-f'); paintList(); }; });
    var rows = all.filter(function (r) { return (S.filter === 'all' || r.status === S.filter) && (!S.mine || r.full); });
    items.innerHTML = rows.length ? rows.map(function (r) {
      return '<button class="item" data-id="' + esc(r.id) + '"><div class="row"><span class="id">' + esc(r.id) + '</span>' + badge(r.status) + '</div>' +
        '<div>' + esc(r.applicantName) + ' &middot; ' + esc(r.bhgUnit) + '</div>' +
        '<div class="sub">' + esc(r.jenis) + ' &middot; ' + esc(r.tarikhPergi) + ' ' + esc(r.masaPergi) + '</div></button>';
    }).join('') : '<div class="empty">Tiada permohonan.</div>';
    Array.prototype.forEach.call(items.querySelectorAll('.item'), function (b) { b.onclick = function () { location.hash = '#/r/' + encodeURIComponent(b.getAttribute('data-id')); }; });
  }

  // ---------- detail (from cached list, no server call) ----------
  function findReq(id) {
    var l = (S.data.active || []).concat(S.data.archive || []);
    return l.filter(function (r) { return r.id === id; })[0];
  }

  function kv(pairs) {
    return '<dl class="kv">' + pairs.filter(function (p) { return p[1] !== '' && p[1] != null; }).map(function (p) {
      return '<dt>' + esc(p[0]) + '</dt><dd>' + esc(p[1]) + '</dd>';
    }).join('') + '</dl>';
  }

  function renderDetail(id) {
    S.view = 'detail'; paintWho(); banner('');
    loadCache('active'); loadCache('archive');
    var r = findReq(id);
    if (!r) { location.hash = '#/'; return; }
    var h = '<a class="back" href="#/">&larr; Senarai</a><div class="card"><div class="row"><b>' + esc(r.id) + '</b>' + badge(r.status) + '</div></div>';
    if (!r.full) {
      h += '<div class="card">' + kv([['Pemohon', r.applicantName], ['Bhg/Unit', r.bhgUnit], ['Jenis Kenderaan', r.jenis], ['Tarikh Pergi', r.tarikhPergi + ' ' + r.masaPergi],
        ['Nama Pesakit', r.amb ? r.amb.namaPesakit : '']]) +
        '<p class="hint">Butiran penuh hanya untuk pemohon dan PHC.</p></div>';
    } else {
      h += '<div class="card"><p class="sec-h">A. Butiran Pemohon</p>' + kv([['Nama', r.applicantName], ['Jawatan', r.jawatan], ['Bhg/Caw./Unit', r.bhgUnit],
        ['Tel. Bimbit', r.telBimbit], ['Tel. Pejabat', r.telPejabat], ['Fax', r.fax], ['Jenis Kenderaan', r.jenis], ['Bil. Penumpang', r.bilPenumpang],
        ['Bil. Kenderaan', r.bilKenderaan], ['Tujuan', r.tujuan], ['Tempat Dituju', r.tempatDituju], ['Tempat Menunggu', r.tempatMenunggu],
        ['Menunggu (balik)', r.tempatMenungguBalik], ['Pergi', r.tarikhPergi + ' ' + r.masaPergi], ['Balik', r.tarikhBalik + ' ' + r.masaBalik],
        ['Dihantar', r.submittedAt]]) + '</div>';
      if (r.amb) {
        h += '<div class="card"><p class="sec-h">B. Permohonan Ambulans</p>' + kv([['Tarikh/Masa', r.amb.tarikhMasaDiperlukan], ['Nama Pesakit', r.amb.namaPesakit],
          ['Peralatan', r.amb.peralatan], ['Rujukan dari', r.amb.kesDari], ['Dirujuk ke', r.amb.kesKe], ['Keterangan', r.amb.keterangan], ['Pegawai Perubatan', r.amb.pegawai]]) + '</div>';
      }
      if (r.phcDecisionAt) {
        h += '<div class="card"><p class="sec-h">C. Kegunaan Pejabat</p>' + kv([['Keputusan', r.status === C.STATUS.TIDAK_LULUS ? C.label(C.STATUS.TIDAK_LULUS) : C.label(C.STATUS.LULUS)],
          ['Oleh', r.phcDecisionBy], ['Pada', r.phcDecisionAt], ['Ulasan', r.phcUlasan], ['Pemandu 1', r.driver1], ['Pemandu 2', r.driver2],
          ['No. Telefon', r.driverPhone], ['No. Kenderaan', r.vehicleNo], ['Diendors oleh', r.endorsedBy], ['Diendors pada', r.endorsedAt]]) + '</div>';
      }
      h += '<div class="card"><p class="sec-h">Gambar Borang (bertandatangan)</p>' + (r.hasPhoto ?
        '<button class="btn sec sm" id="ph">Lihat gambar</button><div id="phbox"></div>' : '<p class="hint">Tiada gambar.</p>') + '</div>';
    }
    h += '<div id="actions"></div>';
    view.innerHTML = h;
    var ph = $('#ph');
    if (ph) ph.onclick = function () {
      busy(ph, async function () {
        banner('');
        try {
          var d = await api('getPhoto', authP({ id: r.id }));
          $('#phbox').innerHTML = '<img class="photo" alt="Gambar borang" src="' + d.dataUrl + '">'; ph.hidden = true;
        } catch (e) { banner(e.message); }
      });
    };
    if (typeof window.renderActions === 'function') window.renderActions(r, $('#actions'), { S: S, api: api, authP: authP, busy: busy, banner: banner, esc: esc, refresh: refresh, updateCached: updateCached, rerender: renderDetail });
  }

  // Replace one request in the in-memory + persisted cache after an action (no full reload needed).
  function updateCached(req) {
    ['active', 'archive'].forEach(function (sc) {
      var l = S.data[sc]; if (!l) return;
      S.data[sc] = l.map(function (x) { return x.id === req.id ? req : x; });
      store(ckey(sc), { at: S.updated[sc] || Date.now(), requests: S.data[sc] });
    });
  }

  // ---------- new request form ----------
  function chips(name, list, checked) {
    return '<div class="chips">' + list.map(function (v) {
      return '<label class="chip"><input type="radio" name="' + name + '" value="' + esc(v) + '"' + (v === checked ? ' checked' : '') + '><span>' + esc(v) + '</span></label>';
    }).join('') + '</div>';
  }
  function fld(id, label, type, extra) { return '<label for="' + id + '">' + label + '</label><input id="' + id + '" type="' + (type || 'text') + '" ' + (extra || '') + '>'; }

  function renderForm() {
    S.view = 'form'; paintWho(); banner('');
    var photo = null;
    view.innerHTML = '<a class="back" href="#/">&larr; Batal</a><h2>Permohonan Penggunaan Kenderaan</h2>' +
      '<p class="hint">Isi borang ini, kemudian muat naik GAMBAR borang kertas yang telah ditandatangani dan dicop oleh Sister/Penyelia wad.</p>' +
      '<form id="f" autocomplete="off" novalidate><div class="card"><p class="sec-h">A. Butiran Pemohon</p>' +
      fld('f_name', 'Nama', 'text', 'required maxlength="80" value="' + esc(S.session.name) + '"') +
      fld('f_jawatan', 'Jawatan', 'text', 'required maxlength="300"') + fld('f_bhg', 'Bhg/Caw./Unit', 'text', 'required maxlength="300"') +
      fld('f_tel', 'No. Telefon Bimbit', 'tel', 'required maxlength="30" inputmode="tel"') +
      '<div class="two"><div>' + fld('f_telp', 'No. Tel. Pejabat / Samb.', 'tel', 'maxlength="30" inputmode="tel"') + '</div><div>' + fld('f_fax', 'No. Fax', 'tel', 'maxlength="30"') + '</div></div>' +
      '<label>Jenis Kenderaan</label>' + chips('jenis', C.JENIS_KENDERAAN, '') +
      '<div class="two"><div>' + fld('f_pen', 'Bil. Penumpang', 'number', 'min="1" max="200" inputmode="numeric"') + '</div><div>' + fld('f_kend', 'Bil. Kenderaan', 'number', 'min="1" max="50" inputmode="numeric" value="1"') + '</div></div>' +
      '<label for="f_tuj">Tujuan</label><textarea id="f_tuj" maxlength="1000"></textarea>' +
      fld('f_tempat', 'Tempat Dituju', 'text', 'maxlength="300"') + fld('f_tunggu', 'Tempat Menunggu', 'text', 'maxlength="300"') +
      fld('f_tungguB', 'Tempat Menunggu Sewaktu Balik <small>(jika berbeza)</small>', 'text', 'maxlength="300"') +
      '<label>Perjalanan Pergi</label><div class="two"><input id="f_dp" type="date" aria-label="Tarikh pergi"><input id="f_tp" type="time" aria-label="Masa pergi"></div>' +
      '<label>Perjalanan Balik</label><div class="two"><input id="f_db" type="date" aria-label="Tarikh balik"></div>' +
      '<label>Masa Balik <small>(jadual berkala kembali ke HKL, tertakluk kepada kekosongan)</small></label>' +
      chips('mb', C.MASA_BALIK.concat([C.MASA_BALIK_LAIN]), '') +
      '<div id="mbw" hidden><label for="f_mbl">Masa lain</label><input id="f_mbl" type="time"></div></div>' +
      '<div class="card" id="ambc" hidden><p class="sec-h">B. Permohonan Ambulans <small>(diisi oleh Pegawai Perubatan)</small></p>' +
      '<label for="a_tm">Tarikh / Masa diperlukan</label><input id="a_tm" type="datetime-local">' +
      fld('a_pes', 'Nama Pesakit', 'text', 'maxlength="300"') + fld('a_per', 'Peralatan yang diperlukan', 'text', 'maxlength="300"') +
      fld('a_dari', 'Kes rujukan dari Hospital', 'text', 'maxlength="300"') + fld('a_ke', 'Kes dirujuk ke Hospital', 'text', 'maxlength="300"') +
      '<label for="a_ket">Keterangan ringkas kes</label><textarea id="a_ket" maxlength="1000"></textarea>' +
      fld('a_peg', 'Nama Pegawai Perubatan', 'text', 'maxlength="80"') + '</div>' +
      '<div class="card"><p class="sec-h">Gambar borang bertandatangan (wajib)</p>' +
      '<input id="f_photo" type="file" accept="image/*"><div class="hint" id="ph_state"></div><img id="ph_prev" class="preview" alt="" hidden></div>' +
      '<div id="ferr" class="banner" hidden></div>' +
      '<button class="btn block" id="fbtn" type="submit">Hantar Permohonan</button></form>';

    function selJenis() { var c = document.querySelector('input[name=jenis]:checked'); return c ? c.value : ''; }
    Array.prototype.forEach.call(view.querySelectorAll('input[name=jenis]'), function (i) { i.onchange = function () { $('#ambc').hidden = selJenis() !== C.AMBULANS; }; });
    Array.prototype.forEach.call(view.querySelectorAll('input[name=mb]'), function (i) { i.onchange = function () { $('#mbw').hidden = document.querySelector('input[name=mb]:checked').value !== C.MASA_BALIK_LAIN; }; });

    $('#f_photo').onchange = async function (ev) {
      var f = ev.target.files[0]; photo = null; $('#ph_prev').hidden = true;
      if (!f) { $('#ph_state').textContent = ''; return; }
      $('#ph_state').textContent = 'Memproses gambar...';
      try {
        var url = await resizeImage(f);
        photo = { mime: 'image/jpeg', data: url.split(',')[1] };
        $('#ph_prev').src = url; $('#ph_prev').hidden = false;
        $('#ph_state').textContent = 'Gambar sedia (' + Math.round(photo.data.length * 0.75 / 1024) + ' KB).';
      } catch (e) { $('#ph_state').textContent = ''; showFormErr('Gambar tidak dapat diproses: ' + e.message); }
    };

    function showFormErr(m) { var e = $('#ferr'); e.textContent = m; e.hidden = !m; if (m) e.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    function v(id) { return $('#' + id).value.trim(); }

    $('#f').onsubmit = function (ev) {
      ev.preventDefault(); showFormErr('');
      var jenis = selJenis(), mbEl = document.querySelector('input[name=mb]:checked');
      var mb = mbEl ? (mbEl.value === C.MASA_BALIK_LAIN ? v('f_mbl') : mbEl.value) : '';
      var req = [[v('f_name'), 'Nama'], [v('f_jawatan'), 'Jawatan'], [v('f_bhg'), 'Bhg/Caw./Unit'], [v('f_tel'), 'No. Telefon Bimbit'], [jenis, 'Jenis Kenderaan'],
        [v('f_pen'), 'Bil. Penumpang'], [v('f_kend'), 'Bil. Kenderaan'], [v('f_tuj'), 'Tujuan'], [v('f_tempat'), 'Tempat Dituju'], [v('f_tunggu'), 'Tempat Menunggu'],
        [v('f_dp'), 'Tarikh Pergi'], [v('f_tp'), 'Masa Pergi'], [v('f_db'), 'Tarikh Balik'], [mb, 'Masa Balik']];
      if (jenis === C.AMBULANS) req = req.concat([[v('a_tm'), 'Tarikh/Masa diperlukan (B)'], [v('a_pes'), 'Nama Pesakit (B)'], [v('a_ket'), 'Keterangan ringkas kes (B)'], [v('a_peg'), 'Nama Pegawai Perubatan (B)']]);
      for (var i = 0; i < req.length; i++) if (!req[i][0]) return showFormErr(req[i][1] + ' diperlukan.');
      if (v('f_db') < v('f_dp')) return showFormErr('Tarikh Balik tidak boleh sebelum Tarikh Pergi.');
      if (!photo) return showFormErr('Gambar borang bertandatangan wajib dimuat naik.');
      var payload = {
        fields: { applicantName: v('f_name'), jawatan: v('f_jawatan'), bhgUnit: v('f_bhg'), telBimbit: v('f_tel'), telPejabat: v('f_telp'), fax: v('f_fax'),
          jenis: jenis, bilPenumpang: v('f_pen'), bilKenderaan: v('f_kend'), tujuan: v('f_tuj'), tempatDituju: v('f_tempat'), tempatMenunggu: v('f_tunggu'),
          tempatMenungguBalik: v('f_tungguB'), tarikhPergi: v('f_dp'), masaPergi: v('f_tp'), tarikhBalik: v('f_db'), masaBalik: mb },
        photo: photo
      };
      if (jenis === C.AMBULANS) {
        var d = v('a_tm'); // yyyy-MM-ddTHH:mm -> dd/MM/yyyy HH:mm
        var m = d.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/);
        payload.amb = { tarikhMasaDiperlukan: m ? m[3] + '/' + m[2] + '/' + m[1] + ' ' + m[4] : d, namaPesakit: v('a_pes'), peralatan: v('a_per'),
          kesDari: v('a_dari'), kesKe: v('a_ke'), keterangan: v('a_ket'), pegawai: v('a_peg') };
      }
      busy($('#fbtn'), async function () {
        try {
          var res = await api('submit', payload, 90000);
          S.session.name = payload.fields.applicantName; store('hkl.session', S.session); store('hkl.last', { role: S.session.role, name: S.session.name });
          S.data.active = null; paintWho();
          view.innerHTML = '<div class="ok-screen"><div class="big">&#10003;</div><h2>Permohonan dihantar</h2><p>No. Permohonan: <b>' + esc(res.id) +
            '</b></p><p class="hint">Status: ' + esc(C.label(C.STATUS.MENUNGGU)) + '</p><a class="btn" href="#/">Kembali ke senarai</a></div>';
          S.view = 'done';
          refresh('active');
        } catch (e) { showFormErr(e.message); }
      });
    };
  }

  // Resize to max 1600px, JPEG ~0.7 (client-side, before upload).
  async function resizeImage(file) {
    var bmp, w, h, cleanup = function () {};
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); w = bmp.width; h = bmp.height; }
    catch (e) {
      var u = URL.createObjectURL(file);
      bmp = await new Promise(function (ok, no) { var im = new Image(); im.onload = function () { ok(im); }; im.onerror = function () { no(new Error('format gambar tidak disokong')); }; im.src = u; });
      w = bmp.naturalWidth; h = bmp.naturalHeight; cleanup = function () { URL.revokeObjectURL(u); };
    }
    var sc = Math.min(1, 1600 / Math.max(w, h)), cv = document.createElement('canvas');
    cv.width = Math.round(w * sc); cv.height = Math.round(h * sc);
    var ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
    cleanup(); if (bmp.close) bmp.close();
    return cv.toDataURL('image/jpeg', 0.7);
  }

  // ---------- boot ----------
  $('#ver').textContent = 'v' + C.APP_VERSION;
  if (!API) { banner('Konfigurasi API_URL tiada (web/config.js).'); }
  S.session = store('hkl.session');
  route();
})();
