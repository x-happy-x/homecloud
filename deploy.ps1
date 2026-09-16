<#
  Публикует HomeCloud в отдельную VM family-apps.
  Исходники правятся здесь, в VM уезжает копия: /opt/homeapps/homecloud.
#>
param(
    [string]$Target      = 'amagomedsharipov@192.168.99.20',
    [string]$RemotePath  = '/opt/homeapps/homecloud',
    [string]$ComposePath = '/opt/homeapps',
    [string]$IdentityFile = (Join-Path $env:USERPROFILE '.ssh\id_ed25519_pve'),
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
Invoke-Remote "test -f $ComposePath/.env"
Write-Host "-> $Target`:$RemotePath"
& npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci не удался' }
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'npm run build не удался' }

Invoke-Remote "mkdir -p $RemotePath && rm -rf $RemotePath/src $RemotePath/public $RemotePath/dist"
& scp.exe @ssh -q server.js package.json package-lock.json rsbuild.config.ts tsconfig.json Dockerfile .dockerignore "${Target}:$RemotePath/"
if ($LASTEXITCODE -ne 0) { throw 'scp root files не удался' }
& scp.exe @ssh -q -r src public "${Target}:$RemotePath/"
if ($LASTEXITCODE -ne 0) { throw 'scp src/public не удался' }

if ($SkipRestart) { Write-Host 'Файлы обновлены, перезапуск пропущен.'; return }

Invoke-Remote "cd $ComposePath && sudo docker compose up -d --build homecloud"
Invoke-Remote 'curl -fsS http://127.0.0.1:4180/healthz && echo'
Write-Host 'Готово: http://192.168.99.20:4180/'
