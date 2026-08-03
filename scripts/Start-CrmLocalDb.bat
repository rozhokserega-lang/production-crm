@echo off
chcp 65001 >nul
REM Поднять Postgres+API+Realtime; Edge Functions — отдельное окно
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0local-db-up.ps1" -WithFunctions
if errorlevel 1 pause
