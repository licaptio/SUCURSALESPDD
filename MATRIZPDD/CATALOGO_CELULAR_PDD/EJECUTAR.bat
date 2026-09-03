@echo off
chcp 65001 >nul
cd /d "%~dp0"
title CATALOGO PROVEEDORA - SERVIDOR LOCAL

echo ========================================
echo   CATALOGO PROVEEDORA - PROVSOFT
echo ========================================
echo.

where py >nul 2>&1
if %errorlevel%==0 (
    py server.py
    goto :fin
)

where python >nul 2>&1
if %errorlevel%==0 (
    python server.py
    goto :fin
)

echo ERROR: No se encontro Python instalado o agregado al PATH.
echo Instala Python 3 y vuelve a ejecutar este archivo.
pause
exit /b 1

:fin
if errorlevel 1 (
    echo.
    echo El servidor termino con un error.
    pause
)
