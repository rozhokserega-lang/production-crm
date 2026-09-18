@echo off
chcp 65001 >nul
title Material calc / Raschet materialov
setlocal EnableDelayedExpansion

set "REPO=D:\Crm\production-crm-crm\fronted"
set "INPUT=%~1"

if not "!INPUT!"=="" goto run
echo.
echo  ============================================================
echo   MATERIAL CALCULATION FOR PRODUCTION PLAN
echo   (Raschet materialov po planu proizvodstva)
echo  ============================================================
echo.
echo   Drop the plan .xlsx onto this file  OR  paste the full path:
echo.
set /p "INPUT=Path to plan: "

:run
set "INPUT=!INPUT:"=!"
if "!INPUT!"=="" (
  echo.
  echo  No file specified.
  pause
  exit /b 1
)
if not exist "!INPUT!" (
  echo.
  echo  File not found: !INPUT!
  pause
  exit /b 1
)
if not exist "%REPO%" (
  echo.
  echo  Project not found: %REPO%
  pause
  exit /b 1
)

cd /d "%REPO%"
echo.
echo  Calculating materials for: !INPUT!
echo  (first run may take up to a minute)
echo.
call npx vite-node scripts/calc-plan-materials.mjs "!INPUT!"
set "RC=%ERRORLEVEL%"

echo.
if "%RC%"=="0" (
  echo  ============================================================
  echo   DONE. Result file is next to the plan:
  echo   ^<plan name^> - materialy.xlsx
  echo   Columns: sheets / decor / edging  +  sheets "Itogo" and "Bez normy"
  echo  ============================================================
  start "" "%~dp1"
) else (
  echo  ERROR, exit code %RC% (see text above)
)
echo.
pause
endlocal
