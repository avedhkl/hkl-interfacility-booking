/* Role/status-dependent action cards (Penyelia PHC decision, Admin PHC endorsement). */
(function () {
  'use strict';
  var C = HKL, logoP = null;

  // Crest at web/logo.jpg (used on the claim PDF); silently skipped if absent.
  function loadLogo() {
    if (!logoP) logoP = fetch('logo.jpg').then(function (res) {
      if (!res.ok) return null;
      return res.blob().then(function (b) { return new Promise(function (ok) { var fr = new FileReader(); fr.onload = function () { ok(fr.result); }; fr.onerror = function () { ok(null); }; fr.readAsDataURL(b); }); });
    }).catch(function () { return null; });
    return logoP;
  }

  window.renderActions = function (r, el, ctx) {
    var role = ctx.S.session.role, esc = ctx.esc;
    if (!r.full) { el.innerHTML = ''; return; }
    var $ = function (s) { return el.querySelector(s); };

    function errBox(m) { var e = $('.aerr'); e.textContent = m; e.hidden = !m; if (m) e.scrollIntoView({ behavior: 'smooth', block: 'center' }); }

    function done(res) { ctx.updateCached(res.request); ctx.rerender(r.id); }

    if (role === C.ROLES.PHC && r.status === C.STATUS.MENUNGGU) {
      el.innerHTML = '<div class="card"><p class="sec-h">Keputusan Penyelia PHC</p>' +
        '<div class="seg"><label><input type="radio" name="dec" value="' + esc(C.STATUS.LULUS) + '"><span>' + esc(C.label(C.STATUS.LULUS)) + '</span></label>' +
        '<label><input type="radio" name="dec" value="' + esc(C.STATUS.TIDAK_LULUS) + '"><span>' + esc(C.label(C.STATUS.TIDAK_LULUS)) + '</span></label></div>' +
        '<div id="dr" hidden>' +
        '<label for="d1">Nama Pemandu 1</label><input id="d1" type="text" maxlength="80">' +
        '<label for="d2">Nama Pemandu 2 <small>(jika ada)</small></label><input id="d2" type="text" maxlength="80">' +
        '<label for="dph">No. Telefon pemandu</label><input id="dph" type="tel" maxlength="30" inputmode="tel">' +
        '<label for="dv">No. Kenderaan</label><input id="dv" type="text" maxlength="30"></div>' +
        '<label for="dul">Ulasan <small id="dulh">(pilihan)</small></label><textarea id="dul" maxlength="1000"></textarea>' +
        '<div class="banner aerr" hidden></div>' +
        '<button class="btn block" id="dbtn" style="margin-top:12px">Hantar Keputusan</button></div>';
      var radios = el.querySelectorAll('input[name=dec]');
      Array.prototype.forEach.call(radios, function (i) {
        i.onchange = function () {
          var lulus = i.value === C.STATUS.LULUS && i.checked;
          $('#dr').hidden = !lulus; $('#dulh').textContent = lulus ? '(pilihan)' : '(wajib)';
        };
      });
      $('#dbtn').onclick = function () {
        var sel = el.querySelector('input[name=dec]:checked'), v = function (id) { return $('#' + id).value.trim(); };
        errBox('');
        if (!sel) return errBox('Pilih ' + C.label(C.STATUS.LULUS) + ' atau ' + C.label(C.STATUS.TIDAK_LULUS) + '.');
        var lulus = sel.value === C.STATUS.LULUS;
        if (lulus && (!v('d1') || !v('dph') || !v('dv'))) return errBox('Nama Pemandu 1, No. Telefon dan No. Kenderaan diperlukan.');
        if (!lulus && !v('dul')) return errBox('Ulasan diperlukan untuk ' + C.label(C.STATUS.TIDAK_LULUS) + '.');
        if (!window.confirm('Sahkan keputusan: ' + C.label(sel.value) + ' untuk ' + r.id + '?')) return;
        ctx.busy($('#dbtn'), async function () {
          try {
            done(await ctx.api('decide', ctx.authP({ id: r.id, decision: sel.value, ulasan: v('dul'), driver1: v('d1'), driver2: v('d2'), driverPhone: v('dph'), vehicleNo: v('dv') })));
          } catch (e) { errBox(e.message); }
        });
      };
    } else if (role === C.ROLES.ADMIN && r.status === C.STATUS.LULUS) {
      el.innerHTML = '<div class="card"><p class="sec-h">Endorsan Admin PHC</p>' +
        '<p class="hint" style="margin:0 0 10px">Endors untuk menjadikan permohonan ini sedia untuk tuntutan pemandu.</p>' +
        '<div class="banner aerr" hidden></div><button class="btn block" id="ebtn">Endors (Sedia untuk Tuntutan)</button></div>';
      $('#ebtn').onclick = function () {
        errBox('');
        if (!window.confirm('Endors ' + r.id + '?')) return;
        ctx.busy($('#ebtn'), async function () {
          try { done(await ctx.api('endorse', ctx.authP({ id: r.id }))); } catch (e) { errBox(e.message); }
        });
      };
    } else if (r.status === C.STATUS.DIENDORS && role !== C.ROLES.PEMOHON) {
      el.innerHTML = '<div class="card"><p class="sec-h">PDF Tuntutan</p>' +
        '<p class="hint" style="margin:0 0 10px">Borang ' + esc(C.FORM.KOD) + ' yang telah diisi, dengan gambar borang bertandatangan sebagai muka surat akhir. Salinan turut disimpan dalam Drive peribadi AV.' +
        (r.claimSavedAt ? ' Salinan Drive terakhir: ' + esc(r.claimSavedAt) + '.' : '') + '</p>' +
        '<div class="banner aerr" hidden></div><button class="btn block" id="cbtn">Jana PDF Tuntutan</button><div id="cres" style="margin-top:10px"></div></div>';
      $('#cbtn').onclick = function () {
        errBox(''); $('#cres').innerHTML = '';
        ctx.busy($('#cbtn'), async function () {
          var blob;
          try {
            var photo = r.hasPhoto ? (await ctx.api('getPhoto', ctx.authP({ id: r.id }))).dataUrl : null;
            blob = window.buildClaimPdf(r, photo, await loadLogo()).output('blob');
          } catch (e) { return errBox('PDF gagal dijana: ' + e.message); }
          var url = URL.createObjectURL(blob), name = window.claimFileName(r);
          $('#cres').innerHTML = '<div class="row" style="gap:8px;flex-wrap:wrap"><a class="btn sec sm" href="' + url + '" download="' + esc(name) + '">Muat turun PDF</a>' +
            '<a class="btn sec sm" href="' + url + '" target="_blank" rel="noopener">Buka PDF</a></div><p class="hint" id="csave">Menyimpan salinan ke Drive...</p>';
          try {
            var b64 = await new Promise(function (ok, no) { var fr = new FileReader(); fr.onload = function () { ok(String(fr.result).split(',')[1]); }; fr.onerror = function () { no(new Error('baca fail')); }; fr.readAsDataURL(blob); });
            var res = await ctx.api('saveClaim', ctx.authP({ id: r.id, pdf: b64 }), 90000);
            ctx.updateCached(Object.assign({}, r, { claimSavedAt: res.savedAt }));
            $('#csave').textContent = 'Salinan disimpan ke Drive (' + res.savedAt + ').';
          } catch (e) { $('#csave').textContent = ''; errBox('PDF telah dijana, tetapi salinan Drive gagal disimpan: ' + e.message); }
        });
      };
    } else if (r.status === C.STATUS.MENUNGGU) {
      el.innerHTML = '<div class="card hint">Pending Approval: menunggu keputusan Penyelia PHC.</div>';
    } else if (r.status === C.STATUS.LULUS) {
      el.innerHTML = '<div class="card hint">Approved. Menunggu endorsan Admin PHC.</div>';
    } else {
      el.innerHTML = '';
    }
  };
})();
