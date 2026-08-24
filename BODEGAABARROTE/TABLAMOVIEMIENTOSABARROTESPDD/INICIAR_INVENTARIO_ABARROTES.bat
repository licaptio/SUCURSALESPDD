@echo off
setlocal
cd /d "%~dp0"
title INVENTARIO ABARROTES - PROVSOFT

echo ==============================================
echo   INVENTARIO ABARROTES - SERVIDOR LOCAL
echo ==============================================
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

echo.
echo ERROR: No se encontro Python instalado en este equipo.
echo Instala Python o agrega Python al PATH y vuelve a ejecutar.
echo.
pause

:fin
endlocal
