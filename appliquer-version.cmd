@echo off
cd /d "%~dp0"
node scripts\sync-version.cjs
if errorlevel 1 (
  echo La version n'a pas pu etre appliquee.
  pause
  exit /b 1
)
pause
