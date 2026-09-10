@echo off
setlocal
cd /d "%~dp0"
title PROVSOFT - INVENTARIO PROVI LEON

where py >nul 2>nul
if not errorlevel 1 (
    py -3 server.py
    goto :fin
)

where python >nul 2>nul
if not errorlevel 1 (
    python server.py
    goto :fin
)

echo.
echo ERROR: No se encontro Python instalado en este equipo.
echo Instala Python 3 y marca la opcion "Add Python to PATH".

:fin
if errorlevel 1 (
    echo.
    echo No fue posible iniciar INVENTARIO PROVI LEON.
    pause
)
endlocal
