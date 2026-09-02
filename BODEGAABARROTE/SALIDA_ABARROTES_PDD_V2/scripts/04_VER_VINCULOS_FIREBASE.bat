@echo off
setlocal
cd /d "%~dp0.."
title SALIDA PDD - VER VINCULOS FIREBASE
color 0B
echo ==============================================================
echo   VINCULOS LOCALES DE ESTA VERSION
 echo ==============================================================
echo.
type public\assets\firebase-connections.js | findstr /I /C:"ACTIVE_FIREBASE" /C:"projectId:" /C:"label:" /C:"enabled:"
echo.
if exist .firebaserc (echo --- .firebaserc ---&type .firebaserc)
echo.
if exist .firebase_site_id.txt (set /p SITE=<.firebase_site_id.txt&echo Hosting preparado: https://%SITE%.web.app)
pause
