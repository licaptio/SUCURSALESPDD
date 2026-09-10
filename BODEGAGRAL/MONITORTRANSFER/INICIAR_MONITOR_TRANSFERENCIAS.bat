@echo off
setlocal
cd /d "%~dp0"
title PROVSOFT Monitor Transferencias
where python >nul 2>nul
if %errorlevel%==0 (
  python server.py
) else (
  where py >nul 2>nul
  if %errorlevel%==0 (
    py server.py
  ) else (
    echo.
    echo ERROR: Python no esta instalado o no esta en PATH.
    echo Instala Python 3 y vuelve a ejecutar este archivo.
    echo.
    pause
  )
)
endlocal
