@echo off
setlocal
cd /d "%~dp0"
title PROVSOFT - INVENTARIO ZAPATA

where python >nul 2>&1
if %errorlevel%==0 (
    python server.py
    goto :fin
)

where py >nul 2>&1
if %errorlevel%==0 (
    py server.py
    goto :fin
)

echo.
echo ============================================================
echo  ERROR: No se encontro Python instalado en este equipo.
echo ============================================================
echo.
echo Instala Python 3 y vuelve a ejecutar este archivo.
echo.
pause

:fin
endlocal
