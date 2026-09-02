@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
if not exist ".firebase_data_project_id.txt" (
  echo Ejecuta 01_CONFIGURAR_PROYECTO.bat primero.
  pause
  exit /b 1
)
set /p PROJECT_ID=<".firebase_data_project_id.txt"
where firebase >nul 2>nul || (echo Ejecuta 00_INSTALAR_FIREBASE_CLI.bat primero.& pause & exit /b 1)

echo =====================================================
echo ACTUALIZANDO FIREBASE HOSTING
echo Proyecto: !PROJECT_ID!
echo =====================================================
firebase deploy --only hosting --project "!PROJECT_ID!"
if errorlevel 1 goto :error
echo.
echo PUBLICACION TERMINADA.
if exist ".firebase_site_id.txt" (
  set /p SITE_ID=<".firebase_site_id.txt"
  echo URL: https://!SITE_ID!.web.app
  start "" "https://!SITE_ID!.web.app"
)
pause
exit /b 0
:error
echo.
echo ERROR EN DEPLOY.
pause
exit /b 1
