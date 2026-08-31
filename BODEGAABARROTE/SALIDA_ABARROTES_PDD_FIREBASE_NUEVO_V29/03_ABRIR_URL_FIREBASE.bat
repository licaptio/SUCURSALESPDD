@echo off
cd /d "%~dp0"
if not exist ".firebase_site_id.txt" (
  echo Primero ejecuta 01_CREAR_HOSTING_NUEVO.bat
  pause
  exit /b 1
)
set /p SITE_ID=<".firebase_site_id.txt"
start "" "https://%SITE_ID%.web.app"
