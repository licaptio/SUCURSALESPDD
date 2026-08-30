@echo off
cd /d "%~dp0"
title Reporte Ventas Producto PDD
where py >nul 2>nul
if %errorlevel%==0 (
  py server.py
) else (
  python server.py
)
pause
