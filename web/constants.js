/*
 * SHARED CONSTANTS - single source of truth for backend (Apps Script) and frontend.
 * Edit ONLY this file. scripts/sync-shared.ps1 copies it to:
 *   backend/Constants.js   and   web/constants.js
 */
var HKL = {
  APP_VERSION: '0.3.3',
  TZ: 'Asia/Kuala_Lumpur',
  ID_PREFIX: 'KDR',
  ARCHIVE_HOURS: 48,

  STATUS: {
    MENUNGGU: 'Menunggu Kelulusan Penyelia PHC',
    LULUS: 'Lulus',
    TIDAK_LULUS: 'Tidak Lulus',
    DIENDORS: 'Diendors (Sedia untuk Tuntutan)'
  },

  ROLES: {
    PEMOHON: 'Pemohon',
    PHC: 'Penyelia PHC',
    ADMIN: 'Admin PHC'
  },

  JENIS_KENDERAAN: ['Kereta', 'Van', 'Lori', 'Bas', 'Ambulans', 'Lain-lain'],
  AMBULANS: 'Ambulans',

  // Jadual berkala kembali ke HKL (borang HKL/TAD(U.K)/09/01). "Lain-lain" = masa bebas.
  MASA_BALIK: ['2.00 petang', '3.30 petang', '5.30 petang'],
  MASA_BALIK_LAIN: 'Lain-lain',

  ACTIONS: ['ping', 'list', 'getPhoto', 'submit', 'decide', 'endorse', 'saveClaim'],

  LIMITS: { text: 300, long: 1000, photoBase64: 4000000, pdfBase64: 8000000 },

  FORM: {
    NO_KELUARAN: '01',
    NO_PINDAAN: '01',
    TARIKH_KUATKUASA: '1 November 2019',
    DIKEMASKINI: '16 April 2026',
    KOD: 'HKL/TAD(U.K)/09/01'
  }
};

// DISPLAY-ONLY labels. Stored/API status strings above never change.
HKL.STATUS_LABEL = {};
HKL.STATUS_LABEL[HKL.STATUS.MENUNGGU] = 'Pending Approval';
HKL.STATUS_LABEL[HKL.STATUS.LULUS] = 'Approved';
HKL.STATUS_LABEL[HKL.STATUS.TIDAK_LULUS] = 'Not Approved';
HKL.STATUS_LABEL[HKL.STATUS.DIENDORS] = 'Tuntutan Claim Ready';
HKL.label = function (s) { return HKL.STATUS_LABEL[s] || s; };

if (typeof module !== 'undefined' && module.exports) { module.exports = HKL; }
