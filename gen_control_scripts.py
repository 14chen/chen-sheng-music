from pathlib import Path

root = Path(r"D:\work\music-app")

ps1 = r'''param(
  [Parameter(Mandatory=$true)]
  [ValidateSet('start','stop','status')]
  [string]$Action
)

$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$Root      = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServerDir = Join-Path $Root 'server'
$LogDir    = Join-Path $Root 'logs'
$CfExe     = 'F:\devbox\bin\cloudflared.exe'
$NodeExe   = 'D:\nodejs\node.exe'
$Port      = 18080

function Get-PidFile($name) {
  $f = Join-Path $LogDir "$name.pid"
  if (Test-Path $f) {
    $v = (Get-Content $f -Raw).Trim()
    if ($v -match '^\d+$') { return [int]$v }
  }
  return $null
}

function Set-PidFile($name, $id) {
  Set-Content -Path (Join-Path $LogDir "$name.pid") -Value ([string]$id) -Encoding ASCII
}

function Remove-PidFile($name) {
  $f = Join-Path $LogDir "$name.pid"
  if (Test-Path $f) { Remove-Item $f -Force }
}

function Test-PidAlive($id) {
  if (-not $id) { return $false }
  return [bool](Get-Process -Id $id -ErrorAction SilentlyContinue)
}

function Get-TunnelUrl {
  $log = Join-Path $LogDir 'tunnel.err.log'
  if (-not (Test-Path $log)) { return $null }
  $m = Select-String -Path $log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1
  if ($m) { return $m.Matches[0].Value }
  return $null
}

function Test-LocalApi {
  try {
    $r = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 5
    return ($r.ok -eq $true)
  } catch { return $false }
}

function Invoke-Start {
  Write-Host '============================================================'
  Write-Host '  橙声君服务器 一键启动（本地 + 公网）'
  Write-Host '============================================================'
  Write-Host ''

  if (-not (Test-Path $ServerDir)) {
    Write-Host "错误: 找不到 $ServerDir" -ForegroundColor Red
    return
  }
  if (-not (Test-Path (Join-Path $ServerDir 'node_modules'))) {
    Write-Host '首次运行，安装依赖...' -ForegroundColor Yellow
    Push-Location $ServerDir
    & npm install --loglevel=error
    Pop-Location
  }

  New-Item -ItemType Directory -Force $LogDir | Out-Null

  $srvPid = Get-PidFile 'server'
  if ((Test-PidAlive $srvPid) -and (Test-LocalApi)) {
    Write-Host "服务器已在运行 (PID $srvPid)，跳过启动" -ForegroundColor Green
  } else {
    $p = Start-Process -FilePath $NodeExe -ArgumentList 'src\supervisor.js' -WorkingDirectory $ServerDir `
           -RedirectStandardOutput (Join-Path $LogDir 'server.out.log') `
           -RedirectStandardError (Join-Path $LogDir 'server.err.log') `
           -WindowStyle Hidden -PassThru
    Set-PidFile 'server' $p.Id
    Write-Host "服务器已启动 (PID $($p.Id))" -ForegroundColor Green
  }

  if (Test-Path $CfExe) {
    $tunPid = Get-PidFile 'tunnel'
    $tunUrl = Get-TunnelUrl
    if ((Test-PidAlive $tunPid) -and $tunUrl) {
      Write-Host "公网隧道已在运行 (PID $tunPid)，跳过启动" -ForegroundColor Green
    } else {
      $errLog = Join-Path $LogDir 'tunnel.err.log'
      if (Test-Path $errLog) { Remove-Item $errLog -Force }
      $p2 = Start-Process -FilePath $CfExe `
              -ArgumentList @('tunnel','--url',"http://127.0.0.1:$Port",'--no-autoupdate') `
              -WorkingDirectory $LogDir `
              -RedirectStandardOutput (Join-Path $LogDir 'tunnel.out.log') `
              -RedirectStandardError $errLog `
              -WindowStyle Hidden -PassThru
      Set-PidFile 'tunnel' $p2.Id
      Write-Host "公网隧道已启动 (PID $($p2.Id))" -ForegroundColor Green
    }
  } else {
    Write-Host '未找到 cloudflared，跳过公网隧道' -ForegroundColor Yellow
  }

  Write-Host ''
  Write-Host '正在等待服务就绪（最多 40 秒）...' -ForegroundColor Cyan
  $deadline = (Get-Date).AddSeconds(40)
  $url = $null
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 2
    if (-not $url) { $url = Get-TunnelUrl }
    if ((Test-LocalApi) -and $url) { break }
  }

  Write-Host ''
  Write-Host '============================================================'
  if (Test-LocalApi) {
    Write-Host '[OK] 本地服务器: 正常' -ForegroundColor Green
  } else {
    Write-Host '[X] 本地服务器: 启动失败，查看 logs\server.err.log' -ForegroundColor Red
  }
  Write-Host "     局域网地址: http://192.168.1.15:$Port"
  Write-Host "     模拟器地址: http://10.0.2.2:$Port"
  if ($url) {
    Write-Host ''
    Write-Host "[OK] 公网地址: $url" -ForegroundColor Green
    Write-Host '     手机用这个，任何网络都能连；每次重启会变'
  } else {
    Write-Host ''
    Write-Host '[!] 公网隧道未就绪，运行「查看状态.cmd」查看' -ForegroundColor Yellow
  }
  Write-Host ''
  Write-Host '管理: 查看状态.cmd  /  停止服务器.cmd'
  Write-Host '============================================================'
}

function Invoke-Stop {
  Write-Host '正在停止本项目的服务器和公网隧道...'
  $srvPid = Get-PidFile 'server'
  if (Test-PidAlive $srvPid) {
    Stop-Process -Id $srvPid -Force
    Write-Host "  已停止服务器 PID $srvPid"
  } else { Write-Host '  服务器未在运行' }
  Remove-PidFile 'server'

  $tunPid = Get-PidFile 'tunnel'
  if (Test-PidAlive $tunPid) {
    Stop-Process -Id $tunPid -Force
    Write-Host "  已停止隧道 PID $tunPid"
  } else { Write-Host '  公网隧道未在运行' }
  Remove-PidFile 'tunnel'

  Write-Host '完成。其他 node 服务和 cloudflared 隧道未受影响。'
}

function Show-Status {
  Write-Host '============================================================'
  Write-Host '  橙声君 - 运行状态'
  Write-Host '============================================================'
  Write-Host ''

  Write-Host '---- 进程 ----'
  $srvPid = Get-PidFile 'server'
  if (Test-PidAlive $srvPid) {
    Write-Host "  服务器 PID $srvPid" -ForegroundColor Green
  } else { Write-Host '  服务器: 未运行' -ForegroundColor Red }
  $tunPid = Get-PidFile 'tunnel'
  if (Test-PidAlive $tunPid) {
    Write-Host "  隧道 PID $tunPid" -ForegroundColor Green
  } else { Write-Host '  公网隧道: 未运行' -ForegroundColor Yellow }

  Write-Host ''
  Write-Host '---- 端口 ----'
  $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if ($conn) { Write-Host "  :$Port 监听中 (PID $($conn.OwningProcess))" -ForegroundColor Green }
  else { Write-Host "  :$Port 未监听" -ForegroundColor Red }

  Write-Host ''
  Write-Host '---- 本机 API ----'
  # P0 修复后所有 API 都需口令，从 .env 读取（与 App 用同一个）
  $keyHeader = @{}
  $envFile = Join-Path $ServerDir '.env'
  if (Test-Path $envFile) {
    $ak = (Select-String -Path $envFile -Pattern '^ACCESS_KEY=(.+)$' | Select-Object -First 1).Matches[0].Groups[1].Value.Trim()
    if ($ak) { $keyHeader = @{ 'X-Access-Key' = $ak } }
  }
  if (Test-LocalApi) {
    Write-Host '  health: OK' -ForegroundColor Green
    try {
      $sources = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/sources" -Headers $keyHeader -TimeoutSec 5
      $enabled = ($sources.sources | Where-Object { $_.enabled } | ForEach-Object { $_.id }) -join ', '
      Write-Host "  音源: $enabled"
      $tracks = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/tracks?source=local" -Headers $keyHeader -TimeoutSec 5
      Write-Host "  本地曲目: $($tracks.total)"
    } catch { Write-Host "  音源/曲目读取失败: $($_.Exception.Message)" -ForegroundColor Yellow }
  } else { Write-Host '  health: 连接失败' -ForegroundColor Red }

  Write-Host ''
  Write-Host '---- 局域网 IP ----'
  $ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -like '192.168.*' }
  if ($ips) {
    $ips | ForEach-Object { Write-Host "  http://$($_.IPAddress):$Port  [$($_.InterfaceAlias)]" }
  } else { Write-Host '  未发现 192.168.* 地址' }

  Write-Host ''
  Write-Host '---- 公网隧道 ----'
  $url = Get-TunnelUrl
  if ($url) {
    Write-Host "  地址: $url" -ForegroundColor Green
    try {
      $h = Invoke-RestMethod -Uri "$url/api/health" -TimeoutSec 20
      if ($h.ok) { Write-Host '  公网连通: OK' -ForegroundColor Green }
      else { Write-Host '  公网连通: 异常' -ForegroundColor Yellow }
    } catch { Write-Host "  公网连通: 失败 ($($_.Exception.Message))" -ForegroundColor Yellow }
  } else { Write-Host '  未获取到公网地址' -ForegroundColor Yellow }

  Write-Host ''
  Write-Host '---- 提示 ----'
  Write-Host '  真机同WiFi: http://192.168.1.15:18080'
  Write-Host '  任何网络: 用上面的公网地址（重启会变，变了要在 App 里重填）'
  Write-Host '============================================================'
}

switch ($Action) {
  'start'  { Invoke-Start }
  'stop'   { Invoke-Stop }
  'status' { Show-Status }
}
'''

# .cmd 启动器必须纯 ASCII，避免 UTF-8 中文在 cmd 里解析错乱
launchers = {
    "启动服务器.cmd": "start",
    "查看状态.cmd": "status",
    "停止服务器.cmd": "stop",
}

# PowerShell 5.1 读取无 BOM 的 UTF-8 会把中文当 ANSI，所以写 UTF-8 with BOM
ps_path = root / "music-server.ps1"
ps_path.write_text(ps1, encoding="utf-8-sig")
print("写入", ps_path, ps_path.stat().st_size, "bytes (UTF-8 BOM)")

for name, action in launchers.items():
    content = (
        "@echo off\r\n"
        f'powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0music-server.ps1" -Action {action}\r\n'
        "echo.\r\n"
        "pause\r\n"
    )
    p = root / name
    p.write_bytes(content.encode("ascii"))
    print("写入", p, p.stat().st_size, "bytes (ASCII)")
