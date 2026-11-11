# Copies shared/constants.js to backend/Constants.js and web/constants.js. Run before every push/commit.
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'shared\constants.js'
New-Item -ItemType Directory -Force (Join-Path $root 'web') | Out-Null
Copy-Item $src (Join-Path $root 'backend\Constants.js') -Force
Copy-Item $src (Join-Path $root 'web\constants.js') -Force
Write-Host 'Synced shared/constants.js -> backend/Constants.js, web/constants.js'
