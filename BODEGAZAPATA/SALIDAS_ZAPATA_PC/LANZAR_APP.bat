@echo off
setlocal
cd /d "%~dp0"
title SALIDAS ZAPATA PC

where py >nul 2>nul
if %errorlevel%==0 (
    set "PYTHON=py"
) else (
    where python >nul 2>nul
    if %errorlevel%==0 (
        set "PYTHON=python"
    ) else (
        echo.
        echo ========================================================
        echo  NO SE ENCONTRO PYTHON EN ESTE EQUIPO
        echo ========================================================
        echo  Instala Python 3 y marca "Add Python to PATH".
        echo.
        pause
        exit /b 1
    )
)

echo.
echo Iniciando SALIDAS ZAPATA PC...
echo Direccion: http://localhost:8000
echo.

start "" http://localhost:8000
%PYTHON% server.py

if errorlevel 1 (
    echo.
    echo El servidor termino con un error.
    pause
)
endlocal
