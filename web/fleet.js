/* HKL - Vehicle movement monitor for Penyelia PHC / Admin PHC (phase 2, step 4). Read-only. */
(function () {
  'use strict';
  var C = HKL, F = { date: '', data: null, only: false, timer: null, loading: false, err: '' };

  function todayKey() { // yyyy-MM-dd in Kuala Lumpur
    var p = new Date(Date.now() + 8 * 3600000); return p.toISOString().slice(0, 10);
  }
  function shift(key, d) { var t = new Date(key + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); }
  function niceDate(key) {
    var t = new Date(key + 'T00:00:00Z');
    return t.toLocaleDateString('ms-MY', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
  function fmin(m) { if (m == null) return ''; return m >= 60 ? Math.floor(m / 60) + 'j ' + (m % 60) + 'm' : m + ' min'; }

  window.renderFleet = function (ctx) {
    var esc = ctx.esc, view = ctx.view, $ = function (s) { return view.querySelector(s); };
    ctx.S.view = 'fleet'; ctx.paintWho(); ctx.banner('');
    if (!F.date) F.date = todayKey();
    if (F.timer) clearInterval(F.timer);

    view.innerHTML = '<a class="back" href="#/">&larr; Senarai tempahan</a>' +
      '<h2>Vehicle Movement Monitor</h2>' +
      '<div class="tools fdate"><button class="btn sm sec" id="fprev" aria-label="Previous day">&lsaquo;</button>' +
      '<input type="date" id="fdate" value="' + esc(F.date) + '" style="width:auto">' +
      '<button class="btn sm sec" id="fnext" aria-label="Next day">&rsaquo;</button>' +
      '<button class="btn sm sec" id="ftoday">Today</button>' +
      '<button class="btn sm sec" id="frf">Refresh</button><span id="fupd"></span></div>' +
      '<div id="fbody"></div>';

    function go(d) { F.date = d; F.data = null; paint(); load(); }
    $('#fprev').onclick = function () { go(shift(F.date, -1)); };
    $('#fnext').onclick = function () { go(shift(F.date, 1)); };
    $('#ftoday').onclick = function () { go(todayKey()); };
    $('#fdate').onchange = function () { if (/^\d{4}-\d{2}-\d{2}$/.test(this.value)) go(this.value); };
    $('#frf').onclick = function () { load(); };

    async function load() {
      if (F.loading) return;
      F.loading = true; F.err = ''; paint();
      try {
        var d = await ctx.api('fleet', ctx.authP({ date: F.date }));
        if (d.date === F.date) { F.data = d; F.stamp = Date.now(); }
      } catch (e) {
        if (/Kata laluan|Terlalu banyak/.test(e.message)) { ctx.logout(e.message); return; }
        F.err = e.message;
      } finally { F.loading = false; }
      if (ctx.S.view === 'fleet') paint();
    }

    function paint() {
      var body = $('#fbody'), upd = $('#fupd'), rf = $('#frf');
      if (!body) return;
      rf.disabled = F.loading; rf.classList.toggle('busy', F.loading);
      upd.textContent = F.loading ? 'Mengemas kini...' : (F.stamp ? 'Dikemas kini ' + new Date(F.stamp).toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' }) : '');
      var h = F.err ? '<div class="banner">' + esc(F.err) + '</div>' : '';
      var d = F.data;
      if (!d) { body.innerHTML = h + (F.loading ? '<div class="empty">Memuatkan...</div>' : ''); return; }
      var s = d.summary;
      h += '<div class="fsum">' +
        stat('Requests', s.total, '') + stat('Fulfilled', s.done, 'ok') + stat('In progress', s.inProgress, 'info') +
        stat('Not started', s.notStarted, '') + '<button class="fstat bad' + (F.only ? ' on' : '') + '" id="fdel"><b>' + s.delayed + '</b><span>Delayed</span></button></div>';
      var vs = d.vehicles.filter(function (v) { return !F.only || v.cases.some(function (c) { return c.trip.flags.length; }); });
      if (!vs.length) h += '<div class="empty">' + (F.only ? 'No delayed cases.' : 'No vehicle activity for this date.') + '</div>';
      h += vs.map(function (v) { return vehicle(v); }).join('');
      body.innerHTML = h;
      var b = $('#fdel'); if (b) b.onclick = function () { F.only = !F.only; paint(); };
    }

    function stat(label, n, cls) { return '<div class="fstat ' + cls + '"><b>' + n + '</b><span>' + esc(label) + '</span></div>'; }

    function vehicle(v) {
      var done = 0, prog = 0, wait = 0, del = 0;
      v.cases.forEach(function (c) {
        if (c.trip.state === 'done') done++; else if (c.trip.state === 'in_progress') prog++; else wait++;
        if (c.trip.flags.length) del++;
      });
      var cases = v.cases.filter(function (c) { return !F.only || c.trip.flags.length; });
      // group patients that travelled together
      var groups = [], idx = {};
      cases.forEach(function (c) {
        var k = c.trip.tripId;
        if (k) { if (idx[k] == null) { idx[k] = groups.length; groups.push({ tripId: k, cases: [] }); } groups[idx[k]].cases.push(c); }
        else groups.push({ tripId: '', cases: [c] });
      });
      var pos = v.lastPos ? '<a href="https://www.google.com/maps?q=' + v.lastPos.lat + ',' + v.lastPos.lng + '" target="_blank" rel="noopener">Last position ' + esc(v.lastPos.time) + ' &#8599;</a>' : '<span>No GPS point yet</span>';
      return '<div class="card fveh"><div class="row"><b class="fplate">' + esc(v.vehicleNo) + '</b>' +
        '<span class="fcnt">' + (v.cases.length ? done + '/' + v.cases.length + ' done' : 'idle') + (prog ? ' &middot; ' + prog + ' on the road' : '') + (wait ? ' &middot; ' + wait + ' waiting' : '') + (del ? ' &middot; <span class="fbad">' + del + ' delayed</span>' : '') + '</span></div>' +
        '<div class="hint">' + pos + '</div>' +
        (groups.length ? groups.map(tripBlock).join('') : '<div class="hint">No requests for this date.</div>') + '</div>';
    }

    function tripBlock(g) {
      var c0 = g.cases[0], t0 = c0.trip, multi = g.cases.length > 1;
      var hdr = g.tripId ? '<div class="ftrip">Trip ' + esc(g.tripId) + (t0.steps[0] && t0.steps[0].driver ? ' &middot; ' + esc(t0.steps[0].driver) : '') + (multi ? ' &middot; ' + g.cases.length + ' patients' : '') + '</div>' : '';
      return '<div class="fgroup">' + hdr + g.cases.map(caseRow).join('') + '</div>';
    }

    function caseRow(c) {
      var t = c.trip, st;
      if (t.state === 'done') st = '<span class="badge b-ok">Fulfilled</span>';
      else if (t.state === 'in_progress') st = '<span class="badge b-end">' + esc(C.MOVE_STEPS[t.lastStep - 1].label) + '</span>';
      else st = '<span class="badge b-wait">Not started</span>';
      var line = C.MOVE_STEPS.map(function (m) {
        var s = t.steps.filter(function (x) { return x.n === m.n; })[0];
        return '<li class="' + (s ? 'on' : '') + '" title="' + esc(m.label) + '"><i>' + m.n + '</i><span>' + (s ? esc(s.time) + (s.source === 'Auto' ? '<sup>A</sup>' : '') : '&ndash;') + '</span></li>';
      }).join('');
      var mn = t.mins, dur = [];
      if (mn.wait != null) dur.push('waited ' + fmin(mn.wait));
      if (mn.outbound != null) dur.push('outbound ' + fmin(mn.outbound));
      if (mn.atDest != null) dur.push('at destination ' + fmin(mn.atDest));
      if (mn.total != null) dur.push('total ' + fmin(mn.total));
      var pt = c.amb ? esc(c.amb.patient) : esc(c.applicant);
      return '<div class="fcase"><div class="row"><span><b>' + esc(c.id) + '</b> ' + pt + '</span>' + st + '</div>' +
        '<div class="hint">' + esc(c.pickup) + ' &rarr; ' + esc(c.dest) + ' &middot; requested ' + esc(t.scheduledTime || c.when) + '</div>' +
        '<ol class="ftl">' + line + '</ol>' +
        (dur.length ? '<div class="hint">' + esc(dur.join(' · ')) + '</div>' : '') +
        t.flags.map(function (f) { return '<div class="flag">' + esc(f.text) + '</div>'; }).join('') + '</div>';
    }

    paint(); load();
    // Auto-refresh while open (today only, tab visible, every 60 s).
    F.timer = setInterval(function () {
      if (ctx.S.view !== 'fleet') { clearInterval(F.timer); return; }
      if (!document.hidden && F.date === todayKey()) load();
    }, 60000);
  };
})();
