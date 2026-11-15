/*
 * SHARED CONSTANTS - single source of truth for backend (Apps Script) and frontend.
 * Edit ONLY this file. scripts/sync-shared.ps1 copies it to:
 *   backend/Constants.js   and   web/constants.js
 */
var HKL = {
  APP_VERSION: '0.4.0',
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
    ADMIN: 'Admin PHC',
    DRIVER: 'Pemandu'      // vehicle login: one PIN per vehicle plate (phase 2, movement tracking)
  },

  // Phase 2: ambulance/vehicle movement tracking. One GPS fix per tap, never continuous tracking.
  MOVE_STEPS: [
    { n: 1, code: 'START',         label: 'Journey starts',            hint: 'Leaving for the pickup point' },
    { n: 2, code: 'ARRIVE_PICKUP', label: 'Arrived at waiting area',   hint: 'At the lobby / pickup point' },
    { n: 3, code: 'DEPART_PICKUP', label: 'Departed with patient',     hint: 'Leaving for the destination' },
    { n: 4, code: 'ARRIVE_DEST',   label: 'Arrived at destination',    hint: 'At the destination' },
    { n: 5, code: 'DEPART_DEST',   label: 'Departed destination',      hint: 'Returning to the ward' },
    { n: 6, code: 'ARRIVE_BACK',   label: 'Arrived back at ward/HKL',  hint: 'Trip completed' }
  ],
  MOVE: {
    START_GRACE_MIN: 15,     // late if journey starts >15 min after the requested time
    LONG_WAIT_MIN: 45,       // waiting area -> departed with patient longer than this is flagged
    STALL_MIN: 90,           // no update for this long while a trip is in progress is flagged
    BACKFILL_MAX_HOURS: 12,  // offline taps older than this are rejected
    GEO_DEFAULT_RADIUS_M: 300
  },

  JENIS_KENDERAAN: ['Kereta', 'Van', 'Lori', 'Bas', 'Ambulans', 'Lain-lain'],
  AMBULANS: 'Ambulans',

  // Jadual berkala kembali ke HKL (borang HKL/TAD(U.K)/09/01). "Lain-lain" = masa bebas.
  MASA_BALIK: ['2.00 petang', '3.30 petang', '5.30 petang'],
  MASA_BALIK_LAIN: 'Lain-lain',

  ACTIONS: ['ping', 'list', 'getPhoto', 'submit', 'decide', 'endorse', 'saveClaim',
    'driverLogin', 'driverCases', 'driverStep', 'driverUndo', 'fleet'],

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
HKL.STATUS_LABEL[HKL.STATUS.DIENDORS] = 'Endorsed for Claim';
HKL.label = function (s) { return HKL.STATUS_LABEL[s] || s; };

if (typeof module !== 'undefined' && module.exports) { module.exports = HKL; }
