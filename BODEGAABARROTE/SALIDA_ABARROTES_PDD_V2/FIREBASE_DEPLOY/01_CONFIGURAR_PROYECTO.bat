@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0CONFIGURAR_FIREBASE.ps1"
if errorlevel 1 (
  echo.
  echo ERROR: revisa FIREBASE_NUEVO_CONFIG.txt
  pause
  exit /b 1
)
echo.
echo Proyecto configurado.
pause
