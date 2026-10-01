@echo off
setlocal
cd /d "%~dp0"
title PROVSOFT - Conteo Fisico OSITO 01102026
cls
echo ==========================================================
echo   PROVSOFT - OSITO INVENTARIO - 01/10/2026
echo ==========================================================
echo.
echo Iniciando servidor local SIN PYTHON...
echo No cierre esta ventana mientras utiliza la aplicacion.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor.ps1"
echo.
echo ==========================================================
echo EL SERVIDOR SE DETUVO.
echo ==========================================================
pause
