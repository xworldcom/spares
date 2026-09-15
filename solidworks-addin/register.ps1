# Register the Spares SolidWorks add-in (run from an elevated x64 Developer PowerShell).
# Close SolidWorks first.
param(
  [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"
$dll = Join-Path $PSScriptRoot "Spares.SwAddin\bin\x64\$Configuration\Spares.SwAddin.dll"
if (-not (Test-Path $dll)) {
  $dll = Join-Path $PSScriptRoot "Spares.SwAddin\bin\$Configuration\Spares.SwAddin.dll"
}
if (-not (Test-Path $dll)) {
  throw "Build the x64 project first. Missing $dll"
}

$regasm = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\RegAsm.exe"
if (-not (Test-Path $regasm)) {
  throw "RegAsm.exe not found at $regasm"
}

& $regasm $dll /codebase /tlb
Write-Host "Registered $dll"
Write-Host "Open SolidWorks → Tools → Add-Ins → enable Spares."
