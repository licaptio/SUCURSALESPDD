@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title SALIDA PDD - ELIMINAR HOSTING VIEJO
color 0E

echo ==============================================================
echo   ELIMINAR HOSTING VIEJO - SOLO DESPUES DE PROBAR EL NUEVO
echo ==============================================================
echo.
echo ATENCION: esto elimina UN SITIO DE HOSTING, no Firestore.
echo No ejecutes esto hasta comprobar que la URL nueva funciona.
echo.
set "OLD_SITE="
set /p OLD_SITE=Escribe exactamente el SITE ID viejo que quieres eliminar: 
if "%OLD_SITE%"=="" (
  echo Cancelado.
  pause
  exit /b 0
)
echo.
echo Vas a eliminar el Hosting: %OLD_SITE%.web.app
set "CONFIRM="
set /p CONFIRM=Escribe ELIMINAR para confirmar: 
if /I not "%CONFIRM%"=="ELIMINAR" (
  echo Cancelado.
  pause
  exit /b 0
)
call firebase hosting:sites:delete "%OLD_SITE%" --project inventariopv-643f1
if errorlevel 1 (
  color 0C
  echo No se pudo eliminar. Revisa el mensaje anterior.
) else (
  echo Hosting viejo eliminado.
)
pause
