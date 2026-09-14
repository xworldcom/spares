#Requires -RunAsAdministrator
# Double-click Install.cmd, or:
#   powershell -ExecutionPolicy Bypass -File Install.ps1
param(
  [string]$SourceDir = $PSScriptRoot
)

$ErrorActionPreference = "Stop"
$Guid = "{B7E2C4A1-9D3F-4E18-8A6B-2C5F91D0E7A4}"
$Title = "Spares"
$Description = "Publish a machine assembly to oee360"
$Dest = Join-Path $env:ProgramFiles "Spares\SolidWorks Add-in"
$DllName = "Spares.SwAddin.dll"
$RegAsm = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\RegAsm.exe"

$src = Join-Path $SourceDir $DllName
if (-not (Test-Path $src)) {
  throw "Missing $src. Put this script next to $DllName (the downloaded package)."
}
if (-not (Test-Path $RegAsm)) {
  throw ".NET Framework 4.8 x64 RegAsm was not found. Install the .NET Framework 4.8 runtime and retry."
}

Write-Host "Installing Spares SolidWorks add-in to $Dest"
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
Copy-Item -Force $src (Join-Path $Dest $DllName)
$tlb = Join-Path $SourceDir "Spares.SwAddin.tlb"
if (Test-Path $tlb) {
  Copy-Item -Force $tlb (Join-Path $Dest "Spares.SwAddin.tlb")
}

$installed = Join-Path $Dest $DllName
& $RegAsm $installed /codebase | Out-Host
if ($LASTEXITCODE -ne 0) {
  throw "RegAsm failed with exit code $LASTEXITCODE"
}

$addinKey = "HKLM:\SOFTWARE\SOLIDWORKS\AddIns\$Guid"
New-Item -Path $addinKey -Force | Out-Null
Set-ItemProperty -Path $addinKey -Name "(default)" -Value 1
Set-ItemProperty -Path $addinKey -Name "Title" -Value $Title
Set-ItemProperty -Path $addinKey -Name "Description" -Value $Description

$startupKey = "HKCU:\Software\SolidWorks\AddInsStartup\$Guid"
New-Item -Path $startupKey -Force | Out-Null
Set-ItemProperty -Path $startupKey -Name "(default)" -Value 1 -Type DWord

Write-Host ""
Write-Host "Installed."
Write-Host "1. Close SolidWorks if it is open."
Write-Host "2. Open SolidWorks → Tools → Add-Ins → enable Spares."
Write-Host "3. Sign in with your oee360 staff account in the Task Pane, then Upload."
Write-Host ""
Write-Host "The add-in publishes as that staff user. Do not share staff passwords across companies."
