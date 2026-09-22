@echo off
cd /d "%~dp0"
title PROVSOFT - MONITOR LIQUIDO 22-09-2026
cls
echo ============================================================
echo   PROVSOFT - MONITOR CONTEO LIQUIDO - 22/09/2026
echo ============================================================
echo.
echo Iniciando monitor...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0SERVIDOR.ps1"
echo.
echo El servidor se detuvo o se produjo un error.
pause
