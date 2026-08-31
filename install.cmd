@echo off
setlocal enabledelayedexpansion

:: Qoder CLI Installer for Windows CMD
:: Usage (latest): curl -fsSL https://qoder-ide.oss-accelerate.aliyuncs.com/qodercli/install.cmd -o install.cmd && install.cmd && del install.cmd
:: Usage (specific version): install.cmd --version v1.2.3
::
:: Responsibilities (script layer):
::   - Manifest fetch, download, SHA256 verification, extraction
:: Post-extraction, delegates to binary's `install` subcommand for:
::   - Versioned placement, entry-point, PATH config, marker, verification, telemetry

set "BASE_URL=https://qoder-ide.oss-accelerate.aliyuncs.com/qodercli"
set "BINARY_NAME=qodercli"

call :parse_requested_version %*
if errorlevel 1 exit /b 1

set "NORMALIZED_REQUESTED_VERSION=%REQUESTED_VERSION%"
if /i "%NORMALIZED_REQUESTED_VERSION:~0,1%"=="v" set "NORMALIZED_REQUESTED_VERSION=%NORMALIZED_REQUESTED_VERSION:~1%"
if not "%REQUESTED_VERSION%"=="" (
    set "QODER_REQUESTED_VERSION=%REQUESTED_VERSION%"
    powershell -NoProfile -Command "if ($env:QODER_REQUESTED_VERSION -notmatch '^v?[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z][0-9A-Za-z.-]*)?(\+[0-9A-Za-z][0-9A-Za-z.-]*)?$') { exit 1 }"
    if errorlevel 1 (
        echo Error: Invalid version: %REQUESTED_VERSION%
        exit /b 1
    )
)

:: Check for required tools
where curl >nul 2>&1 || (
    echo Error: curl is required but not found.
    echo Use the PowerShell installer instead:
    echo   irm %BASE_URL%/install.ps1 ^| iex
    exit /b 1
)

:: Create temp directory with exec permission
call :create_exec_tmpdir
if errorlevel 1 (
    echo Error: Cannot create temporary directory with exec permission
    exit /b 1
)

:: 1. Download manifest
set "MANIFEST_URL=%BASE_URL%/channels/manifest.json"
if not "%NORMALIZED_REQUESTED_VERSION%"=="" set "MANIFEST_URL=%BASE_URL%/channels/%NORMALIZED_REQUESTED_VERSION%/manifest.json"
echo ==> Fetching release information...
curl -fsSL "%MANIFEST_URL%" -o "%TEMP_DIR%\manifest.json"
if errorlevel 1 (
    if not "%REQUESTED_VERSION%"=="" (
        echo Error: Failed to fetch requested version %REQUESTED_VERSION%
        goto :cleanup_fail
    )
    echo Error: Failed to download manifest
    goto :cleanup_fail
)

:: 2. Parse version
set "VERSION="
for /f "usebackq tokens=2 delims=:," %%a in (`findstr /c:"\"latest\"" "%TEMP_DIR%\manifest.json"`) do (
    set "VERSION=%%~a"
)
set "VERSION=%VERSION: =%"
set "VERSION=%VERSION:"=%"

if "%VERSION%"=="" (
    echo Error: Failed to parse version from manifest
    goto :cleanup_fail
)
if not "%NORMALIZED_REQUESTED_VERSION%"=="" if /i not "%VERSION%"=="%NORMALIZED_REQUESTED_VERSION%" (
    echo Error: Version manifest mismatch: requested %NORMALIZED_REQUESTED_VERSION%, received %VERSION%
    goto :cleanup_fail
)
echo ==> Bootstrap version: %VERSION%

:: 3. Parse download URL and checksum
set "DOWNLOAD_URL="
set "EXPECTED_SHA256="

powershell -NoProfile -Command "$m = Get-Content '%TEMP_DIR%\manifest.json' | ConvertFrom-Json; $build = [Environment]::OSVersion.Version.Build; $items = @($m.files | Where-Object { $_.os -eq 'windows' -and ($_.arch -eq 'amd64' -or $_.arch -eq 'x64') }); function Test-WindowsAvx2Available { try { $dq = [char]34; $sig = '[System.Runtime.InteropServices.DllImport(' + $dq + 'kernel32.dll' + $dq + ', SetLastError=false)] public static extern bool IsProcessorFeaturePresent(uint ProcessorFeature);'; if (-not ('QoderCli.ProcessorFeature' -as [type])) { Add-Type -Namespace QoderCli -Name ProcessorFeature -MemberDefinition $sig -ErrorAction Stop }; return [QoderCli.ProcessorFeature]::IsProcessorFeaturePresent(40) } catch { return $null } }; $needsLegacyForBuild = $build -gt 0 -and $build -lt 17763; $avx2 = $null; if (-not $needsLegacyForBuild) { $avx2 = Test-WindowsAvx2Available }; $needsLegacy = $needsLegacyForBuild -or ($avx2 -eq $false); function Compat($x, $enforceMax) { if ($build -le 0) { return $true }; if ($x.min_windows_build -and $build -lt [int]$x.min_windows_build) { return $false }; if ($enforceMax -and $x.max_windows_build -and $build -gt [int]$x.max_windows_build) { return $false }; return $true }; $f = $null; if ($needsLegacy) { $f = $items | Where-Object { $_.variant -eq 'legacy' -or $_.runtime -eq 'node-sea' } | Where-Object { Compat $_ $needsLegacyForBuild } | Select-Object -First 1; if (-not $f) { exit 2 } } else { $f = $items | Where-Object { $_.variant -ne 'legacy' -and $_.runtime -ne 'node-sea' } | Where-Object { Compat $_ $true } | Select-Object -First 1; if (-not $f) { $f = $items | Where-Object { Compat $_ $true } | Select-Object -First 1 } }; if (-not $f) { exit 3 }; Set-Content -Path '%TEMP_DIR%\selected.txt' -Value @($f.url, $f.sha256)"
if errorlevel 3 (
    echo Error: No compatible binary for windows/x64
    goto :cleanup_fail
)
if errorlevel 2 (
    echo Error: No legacy Windows binary found for this Windows build/CPU
    goto :cleanup_fail
)

set /a SELECTED_LINE=0
for /f "usebackq delims=" %%l in ("%TEMP_DIR%\selected.txt") do (
    set /a SELECTED_LINE+=1
    if "!SELECTED_LINE!"=="1" set "DOWNLOAD_URL=%%l"
    if "!SELECTED_LINE!"=="2" set "EXPECTED_SHA256=%%l"
)
if "%DOWNLOAD_URL%"=="" (
    echo Error: Failed to parse download URL
    goto :cleanup_fail
)

:: 4. Download
echo ==> Downloading %BINARY_NAME% bootstrap %VERSION%...
echo %DOWNLOAD_URL% | findstr /b /c:"https://" >nul 2>&1
if errorlevel 1 (
    echo Error: Insecure URL rejected ^(must use HTTPS^)
    goto :cleanup_fail
)
curl -fSL --progress-bar "%DOWNLOAD_URL%" -o "%TEMP_DIR%\%BINARY_NAME%.zip"
if errorlevel 1 (
    echo Error: Failed to download binary
    goto :cleanup_fail
)

:: 5. Verify SHA256
if not "%EXPECTED_SHA256%"=="" (
    echo ==> Verifying checksum...
    for /f "usebackq delims=" %%h in (`powershell -NoProfile -Command "(Get-FileHash '%TEMP_DIR%\%BINARY_NAME%.zip' -Algorithm SHA256).Hash.ToLower()"`) do set "ACTUAL_SHA256=%%h"
    if /i not "!ACTUAL_SHA256!"=="%EXPECTED_SHA256%" (
        echo Error: Checksum mismatch
        echo Expected: %EXPECTED_SHA256%
        echo Actual:   !ACTUAL_SHA256!
        goto :cleanup_fail
    )
    echo ==> Checksum verified
)

:: 6. Extract
echo ==> Extracting...
powershell -NoProfile -Command "Expand-Archive -Path '%TEMP_DIR%\%BINARY_NAME%.zip' -DestinationPath '%TEMP_DIR%' -Force"
if errorlevel 1 (
    echo Error: Failed to extract archive
    goto :cleanup_fail
)

if not exist "%TEMP_DIR%\%BINARY_NAME%.exe" (
    echo Error: %BINARY_NAME%.exe not found in archive
    goto :cleanup_fail
)

:: =========================================================================
:: 7. Delegate to binary's install subcommand
:: =========================================================================
echo ==> Installing...
setlocal DisableDelayedExpansion
"%TEMP_DIR%\%BINARY_NAME%.exe" install --force %*
set "INSTALL_EXIT_CODE=%ERRORLEVEL%"
endlocal & set "INSTALL_EXIT_CODE=%INSTALL_EXIT_CODE%"
if not "%INSTALL_EXIT_CODE%"=="0" (
    echo Error: %BINARY_NAME% install failed
    goto :cleanup_fail
)

:cleanup_success
rmdir /s /q "%TEMP_DIR%" 2>nul
echo.
echo %BINARY_NAME% installation completed successfully!
echo.
echo Please restart your terminal, then run: %BINARY_NAME% --help
echo.
exit /b 0

:cleanup_fail
rmdir /s /q "%TEMP_DIR%" 2>nul
exit /b 1

:: =========================================================================
:: parse_requested_version — capture --version while preserving %* for delegate
:: =========================================================================
:parse_requested_version
set "REQUESTED_VERSION="
:parse_requested_version_loop
if "%~1"=="" exit /b 0
if /i "%~1"=="--version" (
    if "%~2"=="" (
        echo Error: Missing value for --version
        exit /b 1
    )
    set "REQUESTED_VERSION=%~2"
    shift
    shift
    goto :parse_requested_version_loop
)
set "CURRENT_ARG=%~1"
if /i "!CURRENT_ARG:~0,10!"=="--version=" (
    set "REQUESTED_VERSION=!CURRENT_ARG:~10!"
    if "!CURRENT_ARG:~10!"=="" echo Error: Missing value for --version
    if "!CURRENT_ARG:~10!"=="" exit /b 1
)
shift
goto :parse_requested_version_loop

:: =========================================================================
:: create_exec_tmpdir — create a temporary working directory
:: =========================================================================
:create_exec_tmpdir
set "TEMP_DIR=%TEMP%\%BINARY_NAME%-install-%RANDOM%"
mkdir "%TEMP_DIR%" 2>nul
if not errorlevel 1 exit /b 0

:: Fallback to user-local dir if TEMP fails
set "FALLBACK_BASE=%USERPROFILE%\.qoder\tmp"
if not exist "%FALLBACK_BASE%" mkdir "%FALLBACK_BASE%" 2>nul
set "TEMP_DIR=%FALLBACK_BASE%\%BINARY_NAME%-install-%RANDOM%"
mkdir "%TEMP_DIR%" 2>nul
if errorlevel 1 exit /b 1
exit /b 0
