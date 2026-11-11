/**
 * HKL Interfacility Transfer Booking - JSON API (no UI).
 * All calls: POST {action, payload} as text/plain -> {ok, data} | {ok:false, error}.
 * Constants (HKL) come from Constants.js (synced from shared/constants.js).
 */

function doPost(e) {
  let out;
  try {
    if (!e || !e.postData || !e.postData.contents) throw userErr_('Permintaan kosong.');
    let body;
    try { body = JSON.parse(e.postData.contents); } catch (x) { throw userErr_('Format permintaan tidak sah.'); }
    const action = String(body.action || '');
    const fn = Object.prototype.hasOwnProperty.call(ACTION_MAP_, action) ? ACTION_MAP_[action] : null;
    if (!fn) throw userErr_('Tindakan tidak dikenali.');
    out = { ok: true, data: fn(body.payload || {}) };
  } catch (err) {
    if (!err || !err.user) console.error(err && err.stack ? err.stack : err);
    out = { ok: false, error: err && err.user ? err.message : 'Ralat pelayan: ' + (err && err.message ? err.message : err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

// Browser/health check only. NEVER returns data (GET query params are unreliable on Apps Script).
function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, data: { service: 'HKL-KDR API', version: HKL.APP_VERSION } }))
    .setMimeType(ContentService.MimeType.JSON);
}

const ACTION_MAP_ = {
  ping: function () { return { version: HKL.APP_VERSION, serverTime: new Date().toISOString() }; },
  list: actionList_,
  getPhoto: actionGetPhoto_,
  submit: actionSubmit_,
  decide: actionDecide_,
  endorse: actionEndorse_,
  saveClaim: actionSaveClaim_
};

function userErr_(msg) { const e = new Error(msg); e.user = true; return e; }
