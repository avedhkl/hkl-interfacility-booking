# HKL Tempahan Kenderaan (Interfacility Transfer Booking)

Digital version of the paper form **Borang Permohonan Penggunaan Kenderaan HKL (HKL/TAD(U.K)/09/01)**.
UI language: Bahasa Malaysia. Owned by the AV team account (avedhkl@moh.gov.my).

> **PDPA / data protection:** this system holds patient names and case details (Ambulans, Section B).
> A review with HKL IT / Records Unit is **still required before any real patient data is entered**.
> Until then use dummy data only (names starting with `DUMMY`).

## How it works

```
Phone (GitHub Pages, static)  --fetch POST text/plain-->  Apps Script web app (JSON API)  -->  Google Sheet + private Drive folders
        web/                                                backend/ (clasp)                      owned by avedhkl@moh.gov.my
```

| Role | Login | Can do |
|---|---|---|
| **Pemohon** (ward doctor/nurse) | name only | submit a request with a PHOTO of the signed and stamped paper form; see own requests in full, others masked |
| **Penyelia PHC** | name + passcode | review request + photo, **Lulus / Tidak Lulus**, assign driver(s), phone, vehicle no.; generate claim PDF |
| **Admin PHC** | name + passcode | endorse a Lulus request (**Diendors = ready for driver's claim**); generate claim PDF |

Status flow (strings live in one file, `shared/constants.js`):
`Menunggu Kelulusan Penyelia PHC` -> `Lulus` or `Tidak Lulus` -> `Diendors (Sedia untuk Tuntutan)`.

Diendors and Tidak Lulus requests leave the day-to-day list **48 hours** after they were closed (shown under *Arkib*).
Rows are **never deleted**; they stay in the Sheet forever.

### Claim PDF
On a Diendors request, PHC/Admin tap **Jana PDF Tuntutan**. The browser draws the original form (header, sections A/B/C, ticked boxes,
driver/vehicle fields, No. Keluaran / Pindaan / Tarikh Kuatkuasa, Syarat-Syarat) filled from the Sheet, and appends the signed-form photo as the last page.
A copy is saved to the private Drive folder `HKL-KDR-PDF-Tuntutan (PRIVATE)` (newest copy replaces the previous one).

## Repository layout

```
shared/constants.js     SINGLE source of truth (status strings, roles, options, version)  -> synced to the two copies below
backend/                Apps Script project (clasp). Constants.js is a generated copy.
web/                    Static frontend for GitHub Pages. constants.js is a generated copy.
  config.js             API_URL of the web app deployment
  logo.jpg              KKM / HKL crest (header + PDF)
  vendor/               jsPDF 2.5.2 (vendored; no CDN)
scripts/                sync-shared.ps1, deploy-backend.ps1, serve.js (local dev server), deployment.id
reference/              original form PDF
```

**Never edit** `backend/Constants.js` or `web/constants.js`. Edit `shared/constants.js`, then run `scripts\sync-shared.ps1` (the deploy script does it for you).

## First-time setup (already done for the current deployment)

Prerequisites: Node.js LTS, `npm i -g @google/clasp`, Git, and the Apps Script API switched on at https://script.google.com/home/usersettings (as avedhkl).

1. `clasp login` as **avedhkl@moh.gov.my**.
2. In `backend/`: `clasp create --type sheets --title "HKL-KDR Tempahan Kenderaan"` (creates the Sheet + bound script; writes `backend/.clasp.json`, which is git-ignored).
   In PowerShell/cmd use `cd /d` when changing drive, or clasp writes its files in the wrong folder.
3. `clasp push -f`.
4. Script editor: run **`setupAll`** (creates tabs/headers and the two private Drive folders) and grant permissions.
5. Set passcodes (below).
6. `clasp deploy -d "first"` once. Put the deployment ID in `scripts/deployment.id` and the `/exec` URL in `web/config.js`.
   Web app settings are in `backend/appsscript.json`: **Execute as: Me**, **Who has access: Anyone** (required for GitHub Pages; the backend enforces access itself).
7. Optional dummy data: run **`seedDummy`** (never overwrites; adds rows named `DUMMY ...`).

`setupSheets` / `setupAll` are **idempotent and non-destructive**: they create missing tabs and headers and append new columns only. Safe to re-run after every update.

## Deploying a change

Every backend change needs a **new version of the SAME deployment**, so the URL never changes:

```powershell
powershell -File scripts\deploy-backend.ps1
```

This syncs shared constants, runs `clasp push -f`, then `clasp deploy -i <id from scripts\deployment.id>`.
If the change adds Sheet columns or Drive folders, also run `setupAll` once in the editor.
Check the result: the app header shows `vN.N.N`, and `https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec` returns the same version in JSON.
If the version did not move, the deploy did not land. Do **not** create a new deployment (that changes the URL).

Frontend changes: commit and push to `main`; GitHub Pages publishes in about a minute. Bump `APP_VERSION` in `shared/constants.js` for every release.

## Passcodes

Passcodes exist **only** in Apps Script *Script Properties* (never in the repo or frontend).

1. Open the script editor as avedhkl -> **Project Settings** (gear) -> **Script Properties**.
2. Edit `PASS_PHC` (Penyelia PHC) and `PASS_ADMIN` (Admin PHC). Use two different values. Save.
3. Takes effect immediately (no redeploy). People already logged in are returned to the login screen on their next refresh.

Wrong passcodes are rate-limited: 5 failures per name, or 30 per role, in 15 minutes blocks further attempts for that window.
If a role has no passcode set, that role cannot log in (fails closed).
Change passcodes whenever a PHC staff member leaves.

## Rolling out

1. Run `setupAll` / deploy so the live version matches `shared/constants.js`.
2. Share the GitHub Pages link (see below) in the ward / PHC WhatsApp groups.
3. On the phone: open the link in Chrome (Android) or Safari (iPhone) -> menu -> **Add to Home Screen**.
4. Pemohon: choose *Pemohon*, type your name (the same spelling every time: it is how you see your own requests), then **+ Permohonan Baru**.
   Fill the form, photograph the paper form signed and stamped by the ward Sister, submit.
5. PHC: choose *Penyelia PHC* / *Admin PHC*, enter the passcode. Credentials are remembered on that device; use **Log keluar** on shared phones.

Site URL: **https://avedhkl.github.io/hkl-interfacility-booking/** (repo: https://github.com/avedhkl/hkl-interfacility-booking).
Pages is deployed by `.github/workflows/pages.yml`, which publishes the `web/` folder on every push to `main`.

## Security model (read this)

- The `/exec` URL is public, so **the backend enforces everything**: passcode checked server-side on every PHC/Admin call, including reads.
- Anyone can list requests, but **patient names are masked to initials** and full details are returned only to PHC roles or to the applicant for their own requests.
- Form photos and PDFs live in private Drive folders owned by the AV account (never "anyone with the link") and are served through the API to authorised roles only.
- Photos are validated (JPEG/PNG, size limited). Data columns are plain text, so typed text cannot become a spreadsheet formula.
- Secrets are never committed. `backend/.clasp.json` is git-ignored. `web/config.js` holds only the public API URL.

Known limitations (accepted defaults, tell the maintainer if you want them tightened):
- **Pemohon identity is by name only.** Anyone who types another applicant's exact name sees that person's requests. Option: per-applicant PIN.
- PHC/Admin passcodes are remembered in the phone's browser storage until *Log keluar*.
- Failed-passcode lockout is per name and per role, so a determined attacker could temporarily block PHC logins (it expires in 15 minutes).
- The claim PDF is generated in the browser; the Drive copy is an archive, not the source of truth. Regenerate any time.

## Sheet tabs

- **Requests**: RequestID (`KDR-yymmdd-NNN`, generated under a lock), SubmittedAt, applicant and trip fields, `PhysicalFormPhotoRef` (Drive file id), Status,
  PHCDecisionBy/At, PHCUlasan, DriverName1/2, DriverPhone, VehicleNo, AdminPHCEndorsedBy/At, ClaimPdfRef/At.
- **Ambulance** (only for JenisKenderaan = Ambulans, Section B): RequestID, TarikhMasaDiperlukan, NamaPesakit, PeralatanDiperlukan, KesRujukanDariHospital, KesDirujukKeHospital, KeteranganRingkasKes, NamaPegawaiPerubatan.

Do not rename or delete header cells. Columns are found by name, so adding columns is safe.

## Local development

```powershell
node scripts\serve.js        # http://localhost:5173  (uses the live API in web/config.js, so use DUMMY data)
```

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Header version is old after a deploy | `clasp deploy -i` did not run or failed; re-run `deploy-backend.ps1` and read its output |
| "Tindakan tidak dikenali" | the live deployment is older than the frontend; deploy the backend |
| "Kata laluan ... belum ditetapkan" | `PASS_PHC` / `PASS_ADMIN` missing in Script Properties |
| "PHOTO_FOLDER_ID / PDF_FOLDER_ID belum ditetapkan" | run `setupAll` in the script editor |
| Dates look like ISO strings | should not happen; dates are formatted server-side as dd/MM/yyyy (GMT+8) |
| Request hangs | check internet; the app shows an on-screen error after 45 s and restores the button |

## Credits
PDF generation: [jsPDF](https://github.com/parallax/jsPDF) (MIT), vendored in `web/vendor/`.
