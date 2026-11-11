/** DUMMY DATA ONLY. Run manually from the editor. Skips if dummy rows already exist. Never overwrites. */
function seedDummy() {
  const rt = readTable_('Requests');
  if (rt.rows.some(function (r) { return String(r.ApplicantName).indexOf('DUMMY') === 0; })) { Logger.log('Dummy data already present.'); return; }
  const at = readTable_('Ambulance');
  const now = new Date(), hAgo = function (h) { return new Date(now.getTime() - h * 3600000); };
  const base = {
    Jawatan: 'Pegawai Perubatan', BhgUnit: 'Wad DUMMY', TelBimbit: '0123456789', TelPejabat: '6388', Fax: '',
    JenisKenderaan: 'Van', BilPenumpang: 3, BilKenderaan: 1, Tujuan: 'DUMMY - lawatan', TempatDituju: 'Hospital DUMMY',
    TempatMenunggu: 'Lobi HKL', TempatMenungguBalik: 'Lobi Hospital DUMMY', TarikhPergi: '2026-12-01', MasaPergi: '8.00 pagi',
    TarikhBalik: '2026-12-01', MasaBalik: '2.00 petang', PhysicalFormPhotoRef: ''
  };
  const mk = function (n, over) { return Object.assign({}, base, { RequestID: 'KDR-261101-00' + n, SubmittedAt: hAgo(100 - n) }, over); };
  const rows = [
    mk(1, { ApplicantName: 'DUMMY Ali bin Abu', Status: HKL.STATUS.MENUNGGU }),
    mk(2, { ApplicantName: 'DUMMY Siti Aminah', JenisKenderaan: 'Ambulans', Status: HKL.STATUS.MENUNGGU }),
    mk(3, { ApplicantName: 'DUMMY Lee Wei', Status: HKL.STATUS.LULUS, PHCDecisionBy: 'DUMMY Penyelia', PHCDecisionAt: hAgo(5),
      DriverName1: 'DUMMY Pemandu A', DriverPhone: '0111111111', VehicleNo: 'WXX 1234' }),
    mk(4, { ApplicantName: 'DUMMY Ravi Kumar', Status: HKL.STATUS.TIDAK_LULUS, PHCDecisionBy: 'DUMMY Penyelia', PHCDecisionAt: hAgo(10), PHCUlasan: 'Tiada kenderaan' }),
    mk(5, { ApplicantName: 'DUMMY Nor Aini', Status: HKL.STATUS.DIENDORS, PHCDecisionBy: 'DUMMY Penyelia', PHCDecisionAt: hAgo(30),
      DriverName1: 'DUMMY Pemandu B', DriverPhone: '0122222222', VehicleNo: 'WXX 5678', AdminPHCEndorsedBy: 'DUMMY Admin', AdminPHCEndorsedAt: hAgo(20) }),
    mk(6, { ApplicantName: 'DUMMY Lama (arkib)', Status: HKL.STATUS.DIENDORS, PHCDecisionBy: 'DUMMY Penyelia', PHCDecisionAt: hAgo(80),
      DriverName1: 'DUMMY Pemandu C', DriverPhone: '0133333333', VehicleNo: 'WXX 9999', AdminPHCEndorsedBy: 'DUMMY Admin', AdminPHCEndorsedAt: hAgo(60) })
  ];
  rows.forEach(function (r) { appendObj_(rt, r); });
  appendObj_(at, { RequestID: 'KDR-261101-002', TarikhMasaDiperlukan: '01/12/2026 09:00', NamaPesakit: 'DUMMY Pesakit Ahmad bin Ali',
    PeralatanDiperlukan: 'Ventilator, monitor', KesRujukanDariHospital: 'HKL', KesDirujukKeHospital: 'Hospital DUMMY',
    KeteranganRingkasKes: 'DUMMY kes', NamaPegawaiPerubatan: 'DUMMY Dr. Siti' });
  Logger.log('Dummy rows added: ' + rows.length);
}
