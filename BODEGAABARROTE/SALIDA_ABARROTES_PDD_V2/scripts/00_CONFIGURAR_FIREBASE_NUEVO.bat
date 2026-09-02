@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0.."
title PROVSOFT - CONFIGURAR FIREBASE NUEVO
color 0A

echo ==============================================================
echo   V32 - CONFIGURAR FIREBASE NUEVO DESDE ARCHIVO
echo ==============================================================
echo.
echo Leyendo:
echo   config\FIREBASE_NUEVO_CONFIG.txt
echo.
echo No se pediran datos en pantalla.
echo No se borra el Firebase anterior.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts_configure_firebase.ps1"
if errorlevel 1 goto :error

echo.
echo LISTO.
echo Firebase NUEVO quedo como perfil activo.
echo Ahora puedes ejecutar:
echo   scripts\01_PREPARAR_HOSTING_NUEVO.bat
echo.
pause
exit /b 0

:error
color 0C
echo.
echo ERROR: revisa config\FIREBASE_NUEVO_CONFIG.txt
echo No se continuo con la configuracion.
pause
exit /b 1
