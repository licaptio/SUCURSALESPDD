@echo off
setlocal
cd /d "%~dp0"
title INVENTARIO ABARROTES - PROVSOFT

if exist "PROVSOFT_ABARROTES_SERVER.exe" (
    PROVSOFT_ABARROTES_SERVER.exe
    goto :fin
)

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

echo ERROR: No se encontro el ejecutable ni Python.
pause

:fin
endlocal
