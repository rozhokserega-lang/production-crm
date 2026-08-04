@echo off
chcp 65001 >nul
cd /d "%~dp0.."
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0local-db-gui.ps1"
if errorlevel 1 (
  echo.
  echo Oshibka zapuska. Proverte scripts\local-db-gui.ps1
  pause
)
