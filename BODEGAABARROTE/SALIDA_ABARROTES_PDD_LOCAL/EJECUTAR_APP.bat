@echo off
title SALIDA DE ABARROTES PDD - SERVIDOR LOCAL
cd /d "%~dp0"

echo =======================================================
echo       SALIDA DE ABARROTES PDD - SERVIDOR LOCAL
echo =======================================================
echo.

where py >nul 2>nul
if %errorlevel%==0 (
    py server.py
    goto :fin
)

where python >nul 2>nul
if %errorlevel%==0 (
    python server.py
    goto :fin
)

echo ERROR: No se encontro Python instalado.
echo Instala Python 3 y vuelve a ejecutar este archivo.
echo.
pause

:fin
