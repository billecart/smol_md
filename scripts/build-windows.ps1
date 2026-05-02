$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$vsDevCmd = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat"
$releaseDir = Join-Path $projectRoot "release"
$version = "1.0.0"

if (-not (Test-Path -LiteralPath $vsDevCmd)) {
  throw "Visual Studio Build Tools were not found. Install Microsoft C++ Build Tools first."
}

$command = 'call "{0}" -arch=x64 && set "PATH=%USERPROFILE%\.cargo\bin;%PATH%" && set "CARGO_TARGET_DIR=%TEMP%\smol_md-build-target" && npm run tauri build' -f $vsDevCmd

Push-Location $projectRoot
try {
  cmd /c $command
  if ($LASTEXITCODE -ne 0) {
    throw "Windows release build failed with exit code $LASTEXITCODE."
  }

  New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null

  $target = Join-Path $env:TEMP "smol_md-build-target\release"
  Copy-Item -LiteralPath (Join-Path $target "smol_md.exe") -Destination (Join-Path $releaseDir "smol_md.exe") -Force
  Copy-Item -LiteralPath (Join-Path $target "smol_md.exe") -Destination (Join-Path $releaseDir "smol_md_${version}_portable.exe") -Force
  Copy-Item -LiteralPath (Join-Path $target "bundle\msi\smol_md_${version}_x64_en-US.msi") -Destination (Join-Path $releaseDir "smol_md_${version}_x64_en-US.msi") -Force
  Copy-Item -LiteralPath (Join-Path $target "bundle\nsis\smol_md_${version}_x64-setup.exe") -Destination (Join-Path $releaseDir "smol_md_${version}_x64-setup.exe") -Force

  Write-Host ""
  Write-Host "Built files copied to:"
  Write-Host $releaseDir
} finally {
  Pop-Location
}
