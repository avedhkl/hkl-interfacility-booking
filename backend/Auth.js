/**
 * Auth: passcodes live ONLY in Script Properties (PASS_PHC, PASS_ADMIN).
 * Checked server-side on every PHC/Admin call, including reads.
 * Pemohon = name only (no passcode) and can only see full details of their own requests.
 */

const RL_MAX_PER_USER_ = 5;
const RL_MAX_PER_ROLE_ = 30;
const RL_WINDOW_SEC_ = 900;

function authenticate_(p) {
  const role = String(p.role || '');
  const name = clean_(p.name, 80);
  if (!name) throw userErr_('Nama diperlukan.');
  if (role === HKL.ROLES.PEMOHON) return { role: role, name: name };
  if (role !== HKL.ROLES.PHC && role !== HKL.ROLES.ADMIN) throw userErr_('Peranan tidak sah.');

  const rlUser = rlKey_(role, name), rlRole = rlKey_(role, '*');
  const cache = CacheService.getScriptCache();
  if (num_(cache.get(rlUser)) >= RL_MAX_PER_USER_ || num_(cache.get(rlRole)) >= RL_MAX_PER_ROLE_) {
    throw userErr_('Terlalu banyak cubaan gagal. Cuba lagi dalam 15 minit.');
  }
  const prop = PropertiesService.getScriptProperties().getProperty(role === HKL.ROLES.PHC ? 'PASS_PHC' : 'PASS_ADMIN');
  if (!prop) throw userErr_('Kata laluan peranan ini belum ditetapkan oleh pentadbir sistem.');
  if (!safeEq_(String(p.passcode || ''), String(prop))) {
    cache.put(rlUser, String(num_(cache.get(rlUser)) + 1), RL_WINDOW_SEC_);
    cache.put(rlRole, String(num_(cache.get(rlRole)) + 1), RL_WINDOW_SEC_);
    throw userErr_('Kata laluan salah.');
  }
  cache.remove(rlUser);
  return { role: role, name: name };
}

function isPHC_(a) { return a.role === HKL.ROLES.PHC || a.role === HKL.ROLES.ADMIN; }

function rlKey_(role, name) {
  const d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'rl|' + role + '|' + name.toLowerCase());
  return 'rl' + Utilities.base64EncodeWebSafe(d).substring(0, 40);
}

function num_(v) { const n = parseInt(v, 10); return isNaN(n) ? 0 : n; }

// Constant-time-ish comparison.
function safeEq_(a, b) {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function normName_(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

// Initials only, e.g. "Ahmad bin Ali" -> "A. B. A."
function maskName_(s) {
  const parts = String(s || '').trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts.map(function (w) { return w.charAt(0).toUpperCase() + '.'; }).join(' ') : '';
}

// Trim and cap length. Formula injection is prevented by formatting every data column
// as plain text ('@') in setupSheets, so "=..." is stored as text and never evaluated.
function clean_(v, max) {
  let s = String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim();
  if (s.length > max) s = s.substring(0, max);
  return s;
}
