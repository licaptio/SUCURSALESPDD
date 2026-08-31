@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title SALIDA PDD - CREAR HOSTING FIREBASE NUEVO
color 0A

echo ==============================================================
echo   SALIDA ABARROTES PDD - CREAR FIREBASE HOSTING NUEVO
echo ==============================================================
echo.
echo Proyecto Firebase de datos: inventariopv-643f1
echo La base Firestore NO se crea de nuevo y NO se borra.
echo Solo se creara una URL nueva de Firebase Hosting.
echo.

where firebase >nul 2>nul
if errorlevel 1 (
  echo Firebase CLI no esta instalado.
  echo Intentando instalar firebase-tools con npm...
  where npm >nul 2>nul
  if errorlevel 1 (
    echo.
    echo ERROR: No se encontro Node.js/npm.
    echo Instala Node.js LTS y vuelve a ejecutar este archivo.
    pause
    exit /b 1
  )
  call npm install -g firebase-tools
  if errorlevel 1 goto :error
)

echo Verificando sesion de Firebase...
call firebase projects:list >nul 2>nul
if errorlevel 1 (
  echo Se abrira el navegador para iniciar sesion en Firebase.
  call firebase login
  if errorlevel 1 goto :error
)

set "PROJECT_ID=inventariopv-643f1"
set "DEFAULT_SITE=inventariopv-salida-pdd"
set "SITE_ID="
set /p SITE_ID=Nombre para la URL nueva [%DEFAULT_SITE%]: 
if "%SITE_ID%"=="" set "SITE_ID=%DEFAULT_SITE%"

:crear
set "SITE_ID=%SITE_ID: =-%"
echo.
echo Creando sitio: %SITE_ID%.web.app
call firebase hosting:sites:create "%SITE_ID%" --project "%PROJECT_ID%"
if errorlevel 1 (
  echo.
  echo No se pudo crear ese nombre. Puede estar ocupado o ya existir.
  set "SITE_ID="
  set /p SITE_ID=Escribe otro nombre unico, solo minusculas y guiones: 
  if "!SITE_ID!"=="" goto :error
  goto :crear
)

echo.
echo Vinculando el sitio al target salidapdd...
call firebase target:apply hosting salidapdd "%SITE_ID%" --project "%PROJECT_ID%"
if errorlevel 1 goto :error

echo %SITE_ID%>".firebase_site_id.txt"

echo.
echo Publicando la aplicacion...
call firebase deploy --only hosting:salidapdd --project "%PROJECT_ID%"
if errorlevel 1 goto :error

echo.
echo ==============================================================
echo   LISTO - HOSTING NUEVO PUBLICADO
echo ==============================================================
echo URL: https://%SITE_ID%.web.app
echo.
echo Esta URL sigue usando Firestore del proyecto inventariopv-643f1.
echo Para futuras versiones usa: 02_ACTUALIZAR_HOSTING.bat
echo.
start "" "https://%SITE_ID%.web.app"
pause
exit /b 0

:error
color 0C
echo.
echo ERROR: No se completo el proceso.
echo Revisa el mensaje de Firebase arriba.
pause
exit /b 1
