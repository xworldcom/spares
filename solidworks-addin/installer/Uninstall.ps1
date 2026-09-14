#Requires -RunAsAdministrator
param(
  [string]$SourceDir = $PSScriptRoot
)

$ErrorActionPreference = "Stop"
$Guid = "{B7E2C4A1-9D3F-4E18-8A6B-2C5F91D0E7A4}"
$Dest = Join-Path $env:ProgramFiles "Spares\SolidWorks Add-in"
$Installed = Join-Path $Dest "Spares.SwAddin.dll"
$RegAsm = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\RegAsm.exe"

if (Test-Path $Installed) {
  if (Test-Path $RegAsm) {
    & $RegAsm $Installed /unregister | Out-Host
  }
}

Remove-Item -Recurse -Force $Dest -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "HKLM:\SOFTWARE\SOLIDWORKS\AddIns\$Guid" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "HKCU:\Software\SolidWorks\AddInsStartup\$Guid" -ErrorAction SilentlyContinue

Write-Host "Spares SolidWorks add-in removed. Restart SolidWorks if it is open."
