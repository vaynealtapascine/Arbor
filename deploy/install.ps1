# Arbor - one-time setup (safe to run again; it updates in place).
# Right-click > Run with PowerShell. It asks for administrator rights, then:
#   1. installs or updates the "Arbor" Windows service (NSSM, LocalSystem, starts with Windows)
#   2. adds the site to Caddy (HTTPS via your Cloudflare DNS token) and reloads Caddy
#   3. checks the server answers and tells you if the DNS record is still missing
param(
  [string]$HostName = 'arbor.vayne.garden',
  [int]$Port = 5240
)

$ErrorActionPreference = 'Stop'

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-HostName', $HostName, '-Port', $Port)
  Start-Process powershell.exe -Verb RunAs -ArgumentList $argList
  exit
}

function Done([int]$code) {
  Write-Host ''
  Read-Host 'Press Enter to close' | Out-Null
  exit $code
}
trap {
  Write-Host ''
  Write-Host "FAILED: $_" -ForegroundColor Red
  Done 1
}

$Root = Split-Path -Parent $PSCommandPath
$App = Join-Path $Root 'app'
$Data = Join-Path $Root 'data'
$SelfHost = Split-Path -Parent $Root
$Service = 'Arbor'

if (-not (Test-Path (Join-Path $App 'server\server.mjs'))) {
  throw "No app in $App. Run 'npm run deploy' in the Arbor repo first."
}
New-Item -ItemType Directory -Force $Data | Out-Null

# --- tools
$Node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $Node) { $Node = 'C:\Program Files\nodejs\node.exe' }
if (-not (Test-Path $Node)) { throw 'node.exe not found' }

$Nssm = (Get-Command nssm.exe -ErrorAction SilentlyContinue).Source
if (-not $Nssm) {
  # Reuse the NSSM the other self-hosted services were installed with.
  foreach ($svc in @('memos-remind', 'caddy', 'memos')) {
    $img = (Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\$svc" -ErrorAction SilentlyContinue).ImagePath
    if ($img -and $img -match 'nssm') { $Nssm = $img.Trim('"'); break }
  }
}
if (-not $Nssm -or -not (Test-Path $Nssm)) { throw 'nssm.exe not found (winget install NSSM.NSSM)' }

# --- passcode (kept from the previous install unless you type a new one)
$existing = ''
$exists = [bool](Get-Service $Service -ErrorAction SilentlyContinue)
if ($exists) {
  # Read from the registry: NSSM's own output is UTF-16 and garbles when captured.
  $params = Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\$Service\Parameters" -ErrorAction SilentlyContinue
  foreach ($l in @($params.AppEnvironmentExtra)) { if ($l -like 'ARBOR_PASSCODE=*') { $existing = $l.Substring(15) } }
}
Write-Host ''
Write-Host 'Arbor setup' -ForegroundColor Cyan
Write-Host 'Anyone who can reach your tailnet could open Arbor. A passcode (asked once per device) prevents that.'
if ($existing) { Write-Host 'A passcode is set. Enter a new one to change it, "-" to remove it, or leave empty to keep it.' }
else { Write-Host 'Enter a passcode, or leave empty for none.' }
$entered = Read-Host 'Passcode'
if ($entered -eq '-') { $pass = '' } elseif ($entered) { $pass = $entered } else { $pass = $existing }

# --- service
if ($exists) {
  Write-Host 'Updating the Arbor service...'
  & $Nssm stop $Service | Out-Null
} else {
  Write-Host 'Installing the Arbor service...'
  & $Nssm install $Service $Node | Out-Null
}
$server = Join-Path $App 'server\server.mjs'
& $Nssm set $Service Application $Node | Out-Null
& $Nssm set $Service AppParameters "--disable-warning=ExperimentalWarning `"$server`"" | Out-Null
& $Nssm set $Service AppDirectory $App | Out-Null
& $Nssm set $Service DisplayName 'Arbor' | Out-Null
& $Nssm set $Service Description "Arbor project tracker on http://127.0.0.1:$Port (https://$HostName via Caddy)" | Out-Null
& $Nssm set $Service Start SERVICE_AUTO_START | Out-Null
& $Nssm set $Service AppExit Default Restart | Out-Null
& $Nssm set $Service AppRestartDelay 1000 | Out-Null
& $Nssm set $Service AppStdout (Join-Path $Data 'arbor.log') | Out-Null
& $Nssm set $Service AppStderr (Join-Path $Data 'arbor.log') | Out-Null
& $Nssm set $Service AppRotateFiles 1 | Out-Null
& $Nssm set $Service AppRotateOnline 1 | Out-Null
& $Nssm set $Service AppRotateBytes 1048576 | Out-Null
& $Nssm set $Service AppEnvironmentExtra `
  "ARBOR_PORT=$Port" `
  'ARBOR_HOST=127.0.0.1' `
  "ARBOR_DATA=$Data" `
  "ARBOR_STATIC=$(Join-Path $App 'dist')" `
  'ARBOR_RESTART_ON_CHANGE=1' `
  "ARBOR_PASSCODE=$pass" | Out-Null
& $Nssm start $Service | Out-Null

$healthy = $false
for ($i = 0; $i -lt 20 -and -not $healthy; $i++) {
  Start-Sleep -Milliseconds 500
  try {
    $h = Invoke-RestMethod "http://127.0.0.1:$Port/api/health" -TimeoutSec 2
    $healthy = $true
  } catch { }
}
if ($healthy) { Write-Host "Service running (data revision $($h.rev), passcode $(if ($h.auth) { 'on' } else { 'off' }))." -ForegroundColor Green }
else { throw "The service didn't answer on port $Port. See $Data\arbor.log" }

# --- Caddy
$Caddyfile = Join-Path $SelfHost 'Caddyfile'
$Caddy = Join-Path $SelfHost 'caddy.exe'
if ((Test-Path $Caddyfile) -and (Test-Path $Caddy)) {
  $text = [IO.File]::ReadAllText($Caddyfile)
  if ($text -notmatch "(?m)^\s*$([regex]::Escape($HostName))\s*\{") {
    Write-Host "Adding $HostName to Caddy..."
    Copy-Item $Caddyfile "$Caddyfile.before-arbor" -Force
    $nl = "`r`n"
    if ($text -notmatch "`n$") { $text += $nl }
    $block = "$nl$HostName {$nl`timport common$nl`treverse_proxy 127.0.0.1:$Port$nl}$nl"
    [IO.File]::WriteAllText($Caddyfile, $text + $block)
    & $Caddy reload --config $Caddyfile --adapter caddyfile 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) {
      Copy-Item "$Caddyfile.before-arbor" $Caddyfile -Force
      throw 'Caddy rejected the new config; the Caddyfile was restored unchanged.'
    }
    Write-Host 'Caddy reloaded.' -ForegroundColor Green
  } else {
    Write-Host "Caddy already serves $HostName."
  }
} else {
  Write-Host "No Caddy found in $SelfHost - skipping HTTPS setup." -ForegroundColor Yellow
}

# --- DNS
$tsIp = $null
try { $tsIp = (& 'C:\Program Files\Tailscale\tailscale.exe' ip -4 2>$null | Select-Object -First 1).Trim() } catch { }
$resolved = $null
try { $resolved = (Resolve-DnsName $HostName -Type A -ErrorAction Stop | Where-Object { $_.IPAddress } | Select-Object -First 1).IPAddress } catch { }
Write-Host ''
if ($tsIp -and $resolved -eq $tsIp) {
  Write-Host "All set: open https://$HostName on your phone (Tailscale on), then Chrome menu > Add to Home screen." -ForegroundColor Green
} else {
  Write-Host 'One step left - add this DNS record in Cloudflare (same as memos):' -ForegroundColor Yellow
  Write-Host "   Type A   Name $($HostName.Split('.')[0])   IPv4 $(if ($tsIp) { $tsIp } else { '<this PC''s Tailscale IP>' })   Proxy: DNS only (grey cloud)"
  Write-Host "Then open https://$HostName on your phone and use Chrome menu > Add to Home screen."
  Write-Host "(Caddy fetches the certificate by itself; the first visit can take ~30 s.)"
}
Write-Host ''
Write-Host "On this PC you can already use http://127.0.0.1:$Port"
Done 0
