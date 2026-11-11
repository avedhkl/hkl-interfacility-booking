# Push backend and publish a NEW VERSION of the SAME deployment (URL never changes).
# First time:  .\scripts\deploy-backend.ps1 -First        (creates the deployment, saves its id)
# Afterwards:  .\scripts\deploy-backend.ps1                (new version on the saved deployment)
param([switch]$First, [string]$Note = '')
$root = Split-Path -Parent $PSScriptRoot
& (Join-Path $PSScriptRoot 'sync-shared.ps1')
$ver = (Select-String -Path (Join-Path $root 'shared\constants.js') -Pattern "APP_VERSION: '([^']+)'").Matches[0].Groups[1].Value
$idFile = Join-Path $PSScriptRoot 'deployment.id'
Push-Location (Join-Path $root 'backend')
try {
  clasp push -f
  if ($LASTEXITCODE -ne 0) { throw 'clasp push failed' }
  $desc = "v$ver $Note".Trim()
  if ($First -or -not (Test-Path $idFile)) {
    clasp deploy -d $desc
    Write-Host 'Copy the deployment ID (AKfy...) from above into scripts\deployment.id, then the /exec URL into web\config.js'
  } else {
    $id = (Get-Content $idFile -Raw).Trim()
    clasp deploy -i $id -d $desc
    if ($LASTEXITCODE -ne 0) { throw 'clasp deploy failed' }
  }
} finally { Pop-Location }
