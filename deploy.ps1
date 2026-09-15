<#
  Публикует HomeCloud на хост Proxmox рядом с bigfam.
  Исходники правятся здесь, на pve уезжает копия: /opt/homecloud.
#>
param(
    [string]$Target      = 'root@192.168.99.10',
    [string]$RemotePath  = '/opt/homecloud',
    [string]$IdentityFile = (Join-Path $env:USERPROFILE '.ssh\id_ed25519_pve'),
    [string]$BackendUrl  = 'http://192.168.1.10:18311',
    [string]$TokenFile   = 'F:\services\homecloud-core\backend-token.txt',
    [switch]$SkipRestart
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$ssh = @('-i', $IdentityFile, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new')
function Invoke-Remote([string]$Command) {
    & ssh.exe @ssh $Target $Command
    if ($LASTEXITCODE -ne 0) { throw "Удалённая команда завершилась с кодом ${LASTEXITCODE}: $Command" }
}

if (!(Test-Path -LiteralPath $IdentityFile)) { throw "Нет ключа $IdentityFile" }
if (!(Test-Path -LiteralPath $TokenFile)) { throw "Нет токена $TokenFile (запустите backend.ps1 один раз)" }
$token = (Get-Content -LiteralPath $TokenFile -Raw).Trim()
if (-not $token) { throw "Пустой токен в $TokenFile" }

Write-Host "-> $Target`:$RemotePath"
& npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci не удался' }
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'npm run build не удался' }

Invoke-Remote "rm -rf $RemotePath/dist && mkdir -p $RemotePath/dist"
& scp.exe @ssh -q server.js package.json package-lock.json "${Target}:$RemotePath/"
if ($LASTEXITCODE -ne 0) { throw 'scp server.js не удался' }
& scp.exe @ssh -q -r (Get-ChildItem dist | ForEach-Object FullName) "${Target}:$RemotePath/dist/"
if ($LASTEXITCODE -ne 0) { throw 'scp dist не удался' }
& scp.exe @ssh -q systemd/homecloud.service "${Target}:/etc/systemd/system/homecloud.service"
if ($LASTEXITCODE -ne 0) { throw 'scp unit не удался' }

# Токен и адрес бэкенда лежат отдельно от кода, файл читает только root.
Invoke-Remote "umask 077; cat > /etc/homecloud.env <<'PHOTOENV'
PHOTO_BACKEND=$BackendUrl
PHOTO_TOKEN=$token
PHOTOENV
chmod 600 /etc/homecloud.env"

if ($SkipRestart) { Write-Host 'Файлы обновлены, перезапуск пропущен.'; return }

Invoke-Remote 'systemctl daemon-reload && systemctl enable homecloud.service >/dev/null && systemctl restart homecloud.service && sleep 1 && systemctl is-active homecloud.service'
Invoke-Remote 'curl -fsS http://127.0.0.1:4180/healthz && echo'
Write-Host 'Готово: http://192.168.99.10:4180/'
