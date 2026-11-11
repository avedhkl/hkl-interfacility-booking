# Copies shared/constants.js to backend/Constants.js and web/constants.js, and stamps the version
# into web/index.html asset URLs (?v=x.y.z) so phones fetch fresh files after a release
# (GitHub Pages caches files for 10 minutes). Run before every push/commit.
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'shared\constants.js'
New-Item -ItemType Directory -Force (Join-Path $root 'web') | Out-Null
Copy-Item $src (Join-Path $root 'backend\Constants.js') -Force
Copy-Item $src (Join-Path $root 'web\constants.js') -Force
$ver = (Select-String -Path $src -Pattern "APP_VERSION: '([^']+)'").Matches[0].Groups[1].Value
$idx = Join-Path $root 'web\index.html'
$html = [IO.File]::ReadAllText($idx)
$html = [regex]::Replace($html, '(?<=(?:src|href)=")((?:config|constants|app|actions|claim)\.js|style\.css|vendor/jspdf\.umd\.min\.js)(\?v=[^"]*)?(?=")', ('$1?v=' + $ver))
[IO.File]::WriteAllText($idx, $html)
Write-Host "Synced shared/constants.js (v$ver) -> backend/Constants.js, web/constants.js; stamped web/index.html"
