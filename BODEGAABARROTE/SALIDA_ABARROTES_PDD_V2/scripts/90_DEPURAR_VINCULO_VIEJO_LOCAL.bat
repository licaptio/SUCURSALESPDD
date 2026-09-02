@echo off
setlocal
cd /d "%~dp0.."
title SALIDA PDD - DEPURAR VINCULO VIEJO LOCAL
color 0E
echo ==============================================================
echo   DEPURAR SOLO LA REFERENCIA VIEJA DE ESTA COPIA
 echo ==============================================================
echo.
echo Esto NO borra Firestore, Storage, Authentication ni el proyecto Firebase viejo.
echo Solo deshabilitara el perfil viejo dentro de esta V31.
echo Hazlo unicamente cuando el Firebase nuevo ya este comprobado.
echo.
set /p C=Escribe DEPURAR para continuar: 
if /I not "%C%"=="DEPURAR" (echo Cancelado.&pause&exit /b 0)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p='public/assets/firebase-connections.js';$s=Get-Content $p -Raw;$s=[regex]::Replace($s,'(viejo:\s*\{[\s\S]*?enabled:\s*)true','$1false',1);Set-Content $p $s -Encoding UTF8"
echo Perfil viejo deshabilitado LOCALMENTE. El proyecto viejo sigue intacto en Firebase.
pause
