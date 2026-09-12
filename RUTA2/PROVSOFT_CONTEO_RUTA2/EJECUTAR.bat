@echo off
setlocal
cd /d "%~dp0"
title PROVSOFT - Conteo Fisico RUTA 2

echo ============================================================
echo   PROVSOFT - CONTEO FISICO RUTA 2 - 12/09/2026
echo ============================================================
echo.

where py >nul 2>nul
if %errorlevel%==0 (
    py -3 server.py
    goto :fin
)

where python >nul 2>nul
if %errorlevel%==0 (
    python server.py
    goto :fin
)

echo ERROR: No se encontro Python instalado.
echo Instala Python 3 y marca la opcion "Add Python to PATH".
echo.
pause

:fin
endlocal
