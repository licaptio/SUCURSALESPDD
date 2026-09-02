@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js no esta instalado.
  echo Instala Node.js LTS y vuelve a ejecutar.
  pause
  exit /b 1
)
where firebase >nul 2>nul
if errorlevel 1 (
  call npm install -g firebase-tools
  if errorlevel 1 goto :error
)
firebase --version
echo Firebase CLI listo.
pause
exit /b 0
:error
echo Error instalando Firebase CLI.
pause
exit /b 1
