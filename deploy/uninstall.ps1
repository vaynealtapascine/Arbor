# Arbor - removes the Windows service. Your data folder and the Caddy site block are left alone.
# Right-click > Run with PowerShell (asks for administrator rights).
$ErrorActionPreference = 'Stop'
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Start-Process powershell.exe -Verb RunAs -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"")
  exit
}
$svc = Get-Service Arbor -ErrorAction SilentlyContinue
if ($svc) {
  if ($svc.Status -ne 'Stopped') { Stop-Service Arbor -Force }
  sc.exe delete Arbor | Out-Host
  Write-Host 'Arbor service removed.'
} else {
  Write-Host 'No Arbor service installed.'
}
Write-Host "Data is still in $(Join-Path (Split-Path -Parent $PSCommandPath) 'data')."
Write-Host 'To stop serving the site, delete the arbor block from the Caddyfile and reload Caddy.'
Read-Host 'Press Enter to close' | Out-Null
