$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$vsDevCmd = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat"

if (-not (Test-Path -LiteralPath $vsDevCmd)) {
  throw "Visual Studio Build Tools were not found. Install Microsoft C++ Build Tools first."
}

$command = 'call "{0}" -arch=x64 && set "PATH=%USERPROFILE%\.cargo\bin;%PATH%" && set "CARGO_TARGET_DIR=%TEMP%\smol_md-target" && npm run tauri dev' -f $vsDevCmd

Push-Location $projectRoot
try {
  cmd /c $command
} finally {
  Pop-Location
}
