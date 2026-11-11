/*
 * Claim PDF = reproduction of "Borang Permohonan Penggunaan Kenderaan HKL" (HKL/TAD(U.K)/09/01),
 * filled from the request, with the signed-form photo appended as the last page.
 * Generated in the browser with jsPDF (vector text, small files). Coordinates are in mm on A4,
 * measured from the original form. Optional logo: place web/logo.png (crest) and it is used automatically.
 */
(function () {
  'use strict';
  var C = HKL;
  var INK = [10, 30, 90], BLACK = [0, 0, 0], GREY = [110, 110, 110];

  function fmtTime(s) {
    var m = String(s || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return String(s || '');
    var h = +m[1], h12 = h % 12 || 12;
    return h12 + '.' + m[2] + ' ' + (h < 12 ? 'pagi' : h === 12 ? 'tengah hari' : h < 19 ? 'petang' : 'malam');
  }

  function setF(doc, style, size, color) {
    doc.setFont('helvetica', style || 'normal'); doc.setFontSize(size || 9); doc.setTextColor.apply(doc, color || BLACK);
  }
  function T(doc, txt, x, y, o) {
    o = o || {}; setF(doc, o.style, o.size, o.color);
    doc.text(String(txt), x, y, { align: o.align || 'left' });
    if (o.underline) {
      var w = doc.getTextWidth(String(txt)), x0 = o.align === 'center' ? x - w / 2 : (o.align === 'right' ? x - w : x);
      doc.setDrawColor(0); doc.setLineWidth(0.2); doc.line(x0, y + 0.6, x0 + w, y + 0.6);
    }
    return doc.getTextWidth(String(txt));
  }
  // Filled-in value: ink colour, shrinks to fit maxW (down to 6pt), optionally centered.
  function V(doc, txt, x, y, maxW, o) {
    o = o || {}; txt = String(txt == null ? '' : txt); if (!txt) return;
    var size = o.size || 9;
    setF(doc, o.style || 'normal', size, INK);
    while (size > 6 && maxW && doc.getTextWidth(txt) > maxW) { size -= 0.5; doc.setFontSize(size); }
    if (maxW && doc.getTextWidth(txt) > maxW) {
      while (txt.length > 4 && doc.getTextWidth(txt + '...') > maxW) txt = txt.slice(0, -1);
      txt += '...';
    }
    doc.text(txt, x, y, { align: o.align || 'left' });
  }
  // Multi-line filled value; shrinks font until it fits maxLines.
  function VL(doc, txt, x, ys, maxW, size) {
    txt = String(txt || ''); if (!txt) return;
    var s = size || 8.5, lines;
    for (;;) {
      setF(doc, 'normal', s, INK); lines = doc.splitTextToSize(txt, maxW);
      if (lines.length <= ys.length || s <= 5.5) break; s -= 0.5;
    }
    if (lines.length > ys.length) { lines = lines.slice(0, ys.length); lines[ys.length - 1] = lines[ys.length - 1].replace(/.{3}$/, '...'); }
    for (var i = 0; i < lines.length; i++) doc.text(lines[i], x, ys[i]);
  }
  function box(doc, x, y, w, h, ticked) {
    doc.setDrawColor(0); doc.setLineWidth(0.25); doc.rect(x, y, w, h);
    if (ticked) {
      doc.setDrawColor.apply(doc, INK); doc.setLineWidth(0.8);
      doc.line(x + w * 0.2, y + h * 0.55, x + w * 0.42, y + h * 0.8); doc.line(x + w * 0.42, y + h * 0.8, x + w * 0.82, y + h * 0.2);
      doc.setDrawColor(0);
    }
  }
  function ln(doc, x1, y1, x2, y2, w) { doc.setDrawColor(0); doc.setLineWidth(w || 0.25); doc.line(x1, y1, x2, y2); }

  // Word-wrapped paragraph with mixed bold segments: segs = [[text, bold], ...]. Returns number of lines.
  function rich(doc, segs, x, y, width, lh, size) {
    var toks = [];
    segs.forEach(function (sg) { sg[0].split(' ').forEach(function (w) { if (w) toks.push({ w: w, b: !!sg[1] }); }); });
    setF(doc, 'normal', size); var sp = doc.getTextWidth(' '), cx = x, n = 1, cy = y;
    toks.forEach(function (t) {
      setF(doc, t.b ? 'bold' : 'normal', size); var w = doc.getTextWidth(t.w);
      if (cx > x && cx + w > x + width) { cx = x; cy += lh; n++; }
      doc.text(t.w, cx, cy); cx += w + sp;
    });
    return n;
  }

  var SYARAT = [
    [['Borang permohonan mesti diserahkan ke Unit Kenderaan selewat-lewatnya 3 hari sebelum tarikh penggunaan kecuali kes-kes segera. (Waktu urusan mengikut waktu pejabat).']],
    [['Borang ini hendaklah diisi dengan lengkap dan jelas serta disahkan oleh Ketua Bahagian / Ketua Cawangan / Ketua Unit.']],
    [['Borang permohonan yang tidak lengkap dan permohonan melalui telefon tidak akan dipertimbangkan.']],
    [['Permohonan hendaklah disertakan dengan surat kelulusan program / aktiviti daripada pihak berkaitan.']],
    [['Setiap permohonan tertakluk kepada kekosongan kenderaan.']],
    [['Sebarang perubahan/pembatalan hendaklah dimaklumkan '], ['selewat-lewatnya satu (1) hari sebelum tarikh penggunaan.', 1]],
    [['Pengguna perlu menepati masa dan berada ditempat menunggu yang dimohon. '], ['Tempahan akan TERBATAL dengan sendirinya sekiranya pemohon tidak tiba dalam 10 minit dari masa yang dimohon.', 1]],
    [['Bahagian ini boleh membatalkan mana-mana tempahan kenderaan yang telah diluluskan sekiranya terdapat keperluan tugas yang lebih mendesak.']],
    [['Pegawai yang menggunakan kenderaan jabatan tidak layak membuat tuntutan perjalanan tersebut.']],
    [['Penggunaan kenderaan adalah secara gunasama (carpool).']],
    [['Pengguna adalah digalakkan menggunakan kenderaan sendiri secara berkumpulan atas kekangan kekurangan kenderaan dan pemandu.']]
  ];

  function page1(doc, r, logo) {
    var cx = 106.5;
    T(doc, C.FORM.KOD, 185.5, 12, { align: 'right', size: 9 });
    if (logo) {
      try {
        var lp = doc.getImageProperties(logo), lw = 36, lh = lw * lp.height / lp.width;
        doc.addImage(logo, /png/i.test(lp.fileType) ? 'PNG' : 'JPEG', 24, 9, lw, lh);
      } catch (e) { /* ignore unreadable logo */ }
    }
    T(doc, 'UNIT KENDERAAN', cx, 18.9, { align: 'center', style: 'bold', size: 11 });
    T(doc, 'HOSPITAL KUALA LUMPUR', cx, 23.0, { align: 'center', style: 'bold', size: 11 });
    T(doc, 'TEL : 03-26156388  SAMB. : 6388 / 7592', cx, 27.2, { align: 'center', style: 'bold', size: 11 });
    T(doc, 'FAX : 03-26156414', cx, 31.2, { align: 'center', style: 'bold', size: 11 });
    ln(doc, 27, 33.8, 186, 33.8, 0.3);
    T(doc, 'BORANG PERMOHONAN PENGGUNAAN KENDERAAN HKL', cx, 39.6, { align: 'center', style: 'bold', size: 10.5 });
    T(doc, 'A.', 27.4, 46.7, { style: 'bold', size: 8.5 }); T(doc, 'BUTIRAN PENGGUNA', 40.2, 46.7, { style: 'bold', size: 8.5 });

    // grid
    doc.setDrawColor(0); doc.setLineWidth(0.25); doc.rect(27.6, 47.7, 157.7, 203);
    [50.7, 100.5, 110.4, 120.2, 137.8, 144.2, 151.5, 200.6, 217].forEach(function (y) { ln(doc, 27.6, y, 185.3, y); });
    ln(doc, 100.3, 50.7, 100.3, 100.5); ln(doc, 145.6, 50.7, 145.6, 100.5);
    ln(doc, 70.6, 137.8, 70.6, 200.6); ln(doc, 115.4, 137.8, 115.4, 200.6);
    T(doc, 'BUTIRAN PENGGUNA / PEMOHON', cx, 50.0, { align: 'center', style: 'bold', size: 7.5 });

    // left column
    var L = function (label, y, val, maxW) { var w = T(doc, label, 29.3, y + 1.1, { size: 8.5 }); V(doc, val, 29.3 + w + 1.2, y + 1.1, maxW || (98.5 - 29.3 - w)); };
    L('1. Nama :', 55.5, r.applicantName); L('2. Jawatan :', 62.4, r.jawatan); L('3. Bhg/Caw./Unit :', 69.0, r.bhgUnit);
    L('4. No.Telefon Bimbit :', 75.2, r.telBimbit);
    var w2 = T(doc, 'No. Telefon Pejabat / Samb :', 33.0, 79.7, { size: 8.5 }); V(doc, r.telPejabat, 33.0 + w2 + 1.2, 79.7, 98.5 - 33 - w2);
    L('5. No. Fax :', 85.7, r.fax);

    // jenis kenderaan
    T(doc, '6. Jenis Kenderaan :', 102, 56.6, { size: 8.5 });
    C.JENIS_KENDERAAN.forEach(function (j, i) {
      var y0 = 59.4 + 6.65 * i;
      T(doc, j, 104.5, y0 + 3.2, { size: 8.5 });
      box(doc, 130, y0, 13.5, 6.65, r.jenis === j);
    });

    // right column
    T(doc, '7. Bilangan Penumpang', 147, 57.3, { size: 8.5 });
    var dots = '.................'; var dw = T(doc, dots, 151, 63.9, { size: 8.5 }); T(doc, 'orang.', 151 + dw + 1, 63.9, { size: 8.5 });
    V(doc, r.bilPenumpang, 151 + dw / 2, 63.4, null, { align: 'center' });
    T(doc, '8. Bil. Kenderaan', 147, 80.1, { size: 8.5 });
    dw = T(doc, dots, 151, 90.0, { size: 8.5 }); T(doc, 'buah.', 151 + dw + 1, 90.0, { size: 8.5 });
    V(doc, r.bilKenderaan, 151 + dw / 2, 89.5, null, { align: 'center' });

    // 9-11
    var w9 = T(doc, '9. Tujuan :', 29.3, 107.2, { size: 8.5 }); VL(doc, r.tujuan, 29.3 + w9 + 1.5, [105.9, 109.2], 185 - 29.3 - w9 - 3, 8.5);
    var w10 = T(doc, '10. Tempat Dituju :', 29.3, 116.7, { size: 8.5 }); VL(doc, r.tempatDituju, 29.3 + w10 + 1.5, [115.4, 118.7], 185 - 29.3 - w10 - 3, 8.5);
    var w11 = T(doc, '11. Tempat menunggu :', 29.3, 125.8, { size: 8.5 }); V(doc, r.tempatMenunggu, 29.3 + w11 + 1.5, 125.8, 185 - 29.3 - w11 - 3);
    var w11b = T(doc, 'Tempat menunggu sewaktu balik :', 34.5, 133.2, { size: 8.5 }); V(doc, r.tempatMenungguBalik, 34.5 + w11b + 1.5, 133.2, 185 - 34.5 - w11b - 3);

    // Perjalanan
    T(doc, 'Perjalanan', 49.1, 141.8, { align: 'center', style: 'bold', size: 8.5 });
    T(doc, 'Tarikh', 93.0, 141.8, { align: 'center', style: 'bold', size: 8.5 });
    T(doc, 'Masa', 150.35, 141.8, { align: 'center', style: 'bold', size: 8.5 });
    T(doc, 'Pergi', 49.1, 148.9, { align: 'center', size: 8.5 });
    V(doc, r.tarikhPergi, 93.0, 148.9, 40, { align: 'center' }); V(doc, fmtTime(r.masaPergi), 150.35, 148.9, 65, { align: 'center' });
    T(doc, 'Balik', 49.1, 177.0, { align: 'center', size: 8.5 });
    V(doc, r.tarikhBalik, 93.0, 177.0, 40, { align: 'center' });
    var mb = fmtTime(r.masaBalik), slots = C.MASA_BALIK, slotIdx = slots.indexOf(mb);
    if (slotIdx === -1 && mb) { V(doc, 'Masa: ' + mb, 93.0, 183.0, 40, { align: 'center', size: 8 }); }

    var hd = ['Tertakluk kepada kekosongan kenderaan dan', 'pemandu, jadual berkala kembali ke HKL seperti', 'berikut :-'];
    hd.forEach(function (t, i) { T(doc, t, 116.6, 154.8 + i * 3.4, { style: 'bold', size: 7.5, underline: true }); });
    var rom = ['i.', 'ii.', 'iii.'], ys = [163.4, 173.2, 182.8];
    slots.forEach(function (s, i) {
      T(doc, rom[i] + '  ' + s, 118.0, ys[i] + 4.2, { size: 8.5 });
      box(doc, 148.8, ys[i], 7.5, 7, i === slotIdx);
    });
    T(doc, 'Nota:', 116.6, 193.2, { style: 'bold', size: 7.5, underline: true });
    T(doc, 'Waktu kembali ke Pejabat adalah berjadual', 183.8, 196.5, { style: 'bold', size: 7.5, align: 'right' });
    T(doc, 'seperti di atas. Sila pilih waktu yang sesuai.', 183.8, 199.6, { style: 'bold', size: 7.5, align: 'right' });

    // pengesahan + perakuan (kept blank: signed on paper form, attached as last page)
    T(doc, 'Pengesahan dan Sokongan Ketua Bahagian / Cawangan / Unit', 29.3, 203.6, { size: 8.5 });
    T(doc, 'Tandatangan & Cop :', 29.8, 213.4, { size: 8.5 }); T(doc, 'Tarikh :', 146.7, 213.4, { size: 8.5 });
    T(doc, 'Saya memperakukan bahawa segala keterangan di atas adalah benar dan Saya faham bahawa kebenaran menggunakan', 29.8, 219.9, { size: 8 });
    T(doc, 'Kenderaan Jabatan tertakluk kepada peraturan yang sedang dikuatkuasakan.', 29.8, 223.1, { size: 8 });
    T(doc, 'Nota: Tempahan akan TERBATAL dengan sendirinya sekiranya pemohon tidak tiba dalam masa 10 minit dari', 29.8, 226.3, { style: 'bold', size: 8 });
    T(doc, 'masa yang dimohon.', 29.8, 229.5, { style: 'bold', size: 8 });
    T(doc, 'Tandatangan Pemohon :', 29.8, 239.9, { size: 8.5 }); T(doc, 'Tarikh :', 146.7, 239.9, { size: 8.5 });
    T(doc, 'Tandatangan dan cop asal: sila rujuk gambar borang bertandatangan pada muka surat akhir.', 27.6, 256, { size: 7, color: GREY, style: 'italic' });
  }

  function page2(doc, r) {
    var a = r.amb;
    T(doc, 'B. UNTUK DIISI OLEH PEGAWAI PERUBATAN BAGI PERMOHONAN AMBULANS (Jika Berkenaan)', 27.4, 9.6, { style: 'bold', size: 8.5 });
    doc.setDrawColor(0); doc.setLineWidth(0.25); doc.rect(27.6, 12.6, 154.4, 69);
    var labels = ['1. Tarikh / Masa diperlukan', '2. Nama Pesakit', '3. Peralatan yang diperlukan', '4. Tempat dituju', '5. Kes Rujukan dari Hospital', '6. Kes dirujuk ke Hospital',
      '7. Keterangan Ringkas Kes', '8. Nama Pegawai Perubatan', '9. Tandatangan / Cop Jabatan'];
    var base = [19.0, 25.3, 31.6, 37.9, 44.2, 50.5, 56.8, 71.0, 77.3];
    var vals = a ? [a.tarikhMasaDiperlukan, a.namaPesakit, a.peralatan, r.tempatDituju, a.kesDari, a.kesKe, null, a.pegawai, ''] : [];
    labels.forEach(function (l, i) {
      T(doc, l, 29.7, base[i], { style: 'bold', size: 8 }); T(doc, ':', 70.3, base[i], { style: 'bold', size: 8 });
      ln(doc, 72, base[i] + 1.1, 181.5, base[i] + 1.1, 0.25);
      if (a && vals[i]) V(doc, vals[i], 73, base[i] - 0.2, 107);
    });
    ln(doc, 72, 65.1, 181.5, 65.1, 0.25);
    if (a) VL(doc, a.keterangan, 73, [56.6, 64.0], 107, 8.5);

    T(doc, 'C. UNTUK KEGUNAAN PEJABAT', 27.4, 90.0, { style: 'bold', size: 8.5 });
    doc.setDrawColor(0); doc.setLineWidth(0.25); doc.rect(27.6, 91.4, 157.7, 61.5);
    ln(doc, 106.5, 91.4, 106.5, 152.9); ln(doc, 106.5, 127.3, 185.3, 127.3); ln(doc, 106.5, 137.3, 185.3, 137.3);
    var lulus = r.status === C.STATUS.LULUS || r.status === C.STATUS.DIENDORS, tl = r.status === C.STATUS.TIDAK_LULUS;
    T(doc, 'Lulus', 34.3, 98.0, { size: 8.5 }); box(doc, 53.9, 93.9, 7.6, 6.6, lulus);
    T(doc, 'Tidak Lulus', 68.1, 98.0, { size: 8.5 }); box(doc, 85.2, 93.9, 7.4, 6.6, tl);
    var wu = T(doc, 'Ulasan :', 29.7, 107.1, { size: 8.5 }); ln(doc, 28.8, 113.6, 99.2, 113.6, 0.25);
    if (r.phcUlasan) {
      setF(doc, 'normal', 8, INK); var first = doc.splitTextToSize(r.phcUlasan, 99 - (29.7 + wu + 1.5));
      VL(doc, r.phcUlasan, 29.7 + wu + 1.5, [107.1, 112.4], 99 - (29.7 + wu + 1.5), 8); first = null;
    }
    var wt = T(doc, 'Tarikh :', 29.7, 123.4, { size: 8.5 }); V(doc, (r.phcDecisionAt || '').slice(0, 10), 29.7 + wt + 1.5, 123.4, 40);
    var wp = T(doc, 'Tarikh Pegawai & Cop :', 29.7, 129.5, { size: 8.5 }); V(doc, (r.endorsedAt || '').slice(0, 10), 29.7 + wp + 1.5, 129.5, 30);
    if (r.phcDecisionBy) T(doc, 'Keputusan oleh: ' + r.phcDecisionBy + (r.phcDecisionAt ? ' (' + r.phcDecisionAt + ')' : ''), 29.7, 141.0, { size: 6.5, color: GREY });
    if (r.endorsedBy) T(doc, 'Diendors oleh: ' + r.endorsedBy + (r.endorsedAt ? ' (' + r.endorsedAt + ')' : ''), 29.7, 144.2, { size: 6.5, color: GREY });

    var dots = '..........................................';
    var w1 = T(doc, '1. Nama Pemandu 1 :', 108.7, 101.0, { size: 8.5 }); T(doc, dots, 108.7 + w1 + 1, 101.0, { size: 8.5 }); V(doc, r.driver1, 108.7 + w1 + 2, 100.6, 185 - 108.7 - w1 - 3);
    var w2 = T(doc, 'Nama Pemandu 2 :', 111.5, 110.8, { size: 8.5 }); T(doc, dots, 111.5 + w2 + 1, 110.8, { size: 8.5 }); V(doc, r.driver2, 111.5 + w2 + 2, 110.4, 185 - 111.5 - w2 - 3);
    var w3 = T(doc, '2. No. Telefon :', 108.7, 120.8, { size: 8.5 }); T(doc, '..................................', 108.7 + w3 + 1, 120.8, { size: 8.5 }); V(doc, r.driverPhone, 108.7 + w3 + 2, 120.4, 185 - 108.7 - w3 - 3);
    var w4 = T(doc, 'No. Kenderaan:', 108.7, 133.9, { size: 8.5 }); V(doc, r.vehicleNo, 108.7 + w4 + 2, 133.9, 185 - 108.7 - w4 - 3, { size: 9.5, style: 'bold' });
    T(doc, 'KESELAMATAN DIUTAMAKAN !', 145.9, 146.5, { align: 'center', style: 'bolditalic', size: 11 });

    [['No. Keluaran', C.FORM.NO_KELUARAN], ['No. Pindaan', C.FORM.NO_PINDAAN], ['Tarikh Kuatkuasa', C.FORM.TARIKH_KUATKUASA], ['Dikemaskini', C.FORM.DIKEMASKINI]].forEach(function (p, i) {
      var y = [158.5, 162.1, 165.8, 170.1][i];
      T(doc, p[0], 27.6, y, { size: 7.5 }); T(doc, ':', 57.0, y, { size: 7.5 }); T(doc, p[1], 60.0, y, { size: 7.5 });
    });

    T(doc, 'SYARAT-SYARAT', 27.4, 184.2, { style: 'bold', size: 9.5, underline: true });
    var y = 190.0;
    SYARAT.forEach(function (it, i) {
      var bold = i === 6;
      T(doc, (i + 1) + '.', 25.8, y, { size: 8.7, style: bold ? 'bold' : 'normal' });
      var segs = it.map(function (s) { return [s[0], s[1] || (bold && s[1] ? 1 : 0)]; });
      var n = rich(doc, segs, 34.3, y, 150.8, 3.7, 8.7);
      y += n * 3.7 + 0.5;
    });
  }

  function pagePhoto(doc, r, photo) {
    doc.addPage();
    T(doc, 'LAMPIRAN: Borang bertandatangan dan bercop (' + r.id + ')', 105, 12, { align: 'center', style: 'bold', size: 10 });
    if (!photo) { T(doc, '(Gambar borang tiada)', 105, 40, { align: 'center', size: 10, color: GREY }); return; }
    var p = doc.getImageProperties(photo), maxW = 186, maxH = 262, s = Math.min(maxW / p.width, maxH / p.height), w = p.width * s, h = p.height * s;
    doc.addImage(photo, /png/i.test(p.fileType) ? 'PNG' : 'JPEG', (210 - w) / 2, 18, w, h, undefined, 'FAST');
  }

  /** Build the claim PDF. r = full request (from list), photo = data URL (or null), logo = PNG data URL (optional). Returns jsPDF doc. */
  window.buildClaimPdf = function (r, photo, logo) {
    var J = window.jspdf.jsPDF, doc = new J({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    doc.setProperties({ title: 'Borang Tuntutan ' + r.id, subject: C.FORM.KOD });
    page1(doc, r, logo);
    doc.addPage(); page2(doc, r);
    pagePhoto(doc, r, photo);
    var n = doc.getNumberOfPages(), stamp = r.id + '  |  ' + C.FORM.KOD + '  |  App v' + C.APP_VERSION;
    for (var i = 1; i <= n; i++) { doc.setPage(i); T(doc, stamp + '  |  ms ' + i + '/' + n, 105, 291, { align: 'center', size: 6.5, color: GREY }); }
    return doc;
  };
  window.claimFileName = function (r) { return 'Borang Tuntutan ' + r.id + '.pdf'; };
})();
