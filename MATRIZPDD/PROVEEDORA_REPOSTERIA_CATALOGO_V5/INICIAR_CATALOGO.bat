@echo off
chcp 65001 >nul
cd /d "%~dp0"
title La Proveedora - Catalogo Reposteria
where py >nul 2>&1
if %errorlevel%==0 (
  py -3 server.py
) else (
  where python >nul 2>&1
  if %errorlevel%==0 (
    python server.py
  ) else (
    echo.
    echo ERROR: No se encontro Python instalado.
    echo Instala Python 3 y vuelve a ejecutar este archivo.
    echo.
    pause
  )
)
