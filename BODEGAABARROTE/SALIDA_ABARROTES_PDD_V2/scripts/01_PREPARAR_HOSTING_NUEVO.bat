@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0.."
title SALIDA PDD - PREPARAR HOSTING NUEVO
color 0A
if not exist ".firebase_data_project_id.txt" (
  echo Primero ejecuta 00_CONFIGURAR_FIREBASE_NUEVO.bat
  pause & exit /b 1
)
set /p PROJECT_ID=<".firebase_data_project_id.txt"
echo ==============================================================
echo   PREPARAR HOSTING EN FIREBASE NUEVO: !PROJECT_ID!
echo ==============================================================
echo.
where firebase >nul 2>nul
if errorlevel 1 (
  where npm >nul 2>nul || (echo ERROR: instala Node.js LTS primero.& pause & exit /b 1)
  echo Instalando Firebase CLI...
  call npm install -g firebase-tools || goto :error
)
call firebase projects:list >nul 2>nul
if errorlevel 1 call firebase login || goto :error

echo.
echo Verificando acceso al proyecto...
call firebase projects:list | findstr /I /C:"!PROJECT_ID!" >nul
if errorlevel 1 (
  echo ERROR: tu cuenta no muestra el proyecto !PROJECT_ID!.
  pause & exit /b 1
)
set "DEFAULT_SITE=!PROJECT_ID!-salida-pdd"
set "SITE_ID="
set /p SITE_ID=SITE ID para Hosting [!DEFAULT_SITE!]: 
if "!SITE_ID!"=="" set "SITE_ID=!DEFAULT_SITE!"
set "SITE_ID=!SITE_ID: =-!"

echo.
echo Intentando crear !SITE_ID!.web.app ...
call firebase hosting:sites:create "!SITE_ID!" --project "!PROJECT_ID!"
if errorlevel 1 (
  echo El sitio puede existir ya. Intentaremos vincularlo sin eliminar nada.
)
call firebase target:apply hosting salidapdd "!SITE_ID!" --project "!PROJECT_ID!" || goto :error
echo !SITE_ID!>".firebase_site_id.txt"
echo.
echo Publicando V31...
call firebase deploy --only hosting:salidapdd --project "!PROJECT_ID!" || goto :error
echo.
echo LISTO: https://!SITE_ID!.web.app
start "" "https://!SITE_ID!.web.app"
pause
exit /b 0
:error
color 0C
echo ERROR: revisa el mensaje anterior. No se borro Firebase viejo.
pause
exit /b 1
