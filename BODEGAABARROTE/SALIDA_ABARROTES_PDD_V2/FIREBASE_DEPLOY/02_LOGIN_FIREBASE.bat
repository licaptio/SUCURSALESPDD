@echo off
cd /d "%~dp0"
where firebase >nul 2>nul || (echo Ejecuta 00_INSTALAR_FIREBASE_CLI.bat primero.& pause & exit /b 1)
firebase login
pause
