@echo off
setlocal EnableExtensions
cd /d "%~dp0.."
title SALIDA PDD - ACTUALIZAR HOSTING NUEVO
color 0B
if not exist ".firebase_data_project_id.txt" (echo Falta configurar Firebase nuevo.& pause&exit /b 1)
if not exist ".firebase_site_id.txt" (echo Falta preparar Hosting nuevo.& pause&exit /b 1)
set /p PROJECT_ID=<".firebase_data_project_id.txt"
set /p SITE_ID=<".firebase_site_id.txt"
echo Publicando en https://%SITE_ID%.web.app usando proyecto %PROJECT_ID% ...
call firebase deploy --only hosting:salidapdd --project "%PROJECT_ID%"
if errorlevel 1 (color 0C&echo ERROR al publicar.&pause&exit /b 1)
echo LISTO.
start "" "https://%SITE_ID%.web.app"
pause
