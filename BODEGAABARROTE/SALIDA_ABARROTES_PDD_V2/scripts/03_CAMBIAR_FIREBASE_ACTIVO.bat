@echo off
setlocal
cd /d "%~dp0.."
title SALIDA PDD - CAMBIAR FIREBASE ACTIVO
color 0E
echo 1. NUEVO ^(normal para avanzar^)
echo 2. VIEJO ^(respaldo temporal^)
echo.
set /p OPCION=Seleccion: 
if "%OPCION%"=="1" set PERFIL=nuevo
if "%OPCION%"=="2" set PERFIL=viejo
if not defined PERFIL (echo Opcion invalida.&pause&exit /b 1)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts_switch_firebase.ps1" -Active %PERFIL%
if errorlevel 1 (color 0C&pause&exit /b 1)
echo.
echo IMPORTANTE: despues publica con 02_ACTUALIZAR_HOSTING.bat para que Hosting use ese perfil.
pause
