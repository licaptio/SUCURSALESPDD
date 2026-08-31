@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title SALIDA PDD - ACTUALIZAR FIREBASE
color 0B

echo ==============================================================
echo   SALIDA ABARROTES PDD - ACTUALIZAR HOSTING
echo ==============================================================
echo.

where firebase >nul 2>nul
if errorlevel 1 (
  echo ERROR: Firebase CLI no esta instalado.
  echo Ejecuta primero 01_CREAR_HOSTING_NUEVO.bat
  pause
  exit /b 1
)

if not exist ".firebase_site_id.txt" (
  echo ERROR: No se encontro la configuracion del sitio nuevo.
  echo Ejecuta primero 01_CREAR_HOSTING_NUEVO.bat
  pause
  exit /b 1
)

set /p SITE_ID=<".firebase_site_id.txt"
echo Publicando cambios en https://%SITE_ID%.web.app ...
echo.
call firebase deploy --only hosting:salidapdd --project inventariopv-643f1
if errorlevel 1 (
  color 0C
  echo.
  echo ERROR al publicar.
  pause
  exit /b 1
)

echo.
echo LISTO. Version publicada.
echo URL: https://%SITE_ID%.web.app
start "" "https://%SITE_ID%.web.app"
pause
