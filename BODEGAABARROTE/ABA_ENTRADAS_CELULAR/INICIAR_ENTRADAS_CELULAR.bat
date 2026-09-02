@echo off
cd /d "%~dp0"
title PROVSOFT - Entradas para celular
where py >nul 2>&1
if %errorlevel%==0 (
  py server_entradas_celular.py
) else (
  python server_entradas_celular.py
)
pause
