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

echo Proyecto: !PROJECT_ID!
set "SITE_ID="
set /p SITE_ID=Nombre del sitio Hosting [!PROJECT_ID!-salida-pdd]: 
if "!SITE_ID!"=="" set "SITE_ID=!PROJECT_ID!-salida-pdd"
set "SITE_ID=!SITE_ID: =-!"

firebase hosting:sites:create "!SITE_ID!" --project "!PROJECT_ID!"
firebase target:apply hosting salidapdd "!SITE_ID!" --project "!PROJECT_ID!"
echo !SITE_ID!>.firebase_site_id.txt
echo.
echo Hosting vinculado: !SITE_ID!
pause
