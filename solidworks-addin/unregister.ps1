param(
  [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"
$dll = Join-Path $PSScriptRoot "Spares.SwAddin\bin\x64\$Configuration\Spares.SwAddin.dll"
if (-not (Test-Path $dll)) {
  $dll = Join-Path $PSScriptRoot "Spares.SwAddin\bin\$Configuration\Spares.SwAddin.dll"
}
if (-not (Test-Path $dll)) {
  throw "Missing $dll"
}

$regasm = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\RegAsm.exe"
& $regasm $dll /unregister
Write-Host "Unregistered $dll"
