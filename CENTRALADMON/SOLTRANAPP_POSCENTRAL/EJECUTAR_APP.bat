@echo off
cd /d "%~dp0"
title PROVSOFT - CENTRAL - SOLICITUD TRANSFERENCIA POS
where py >nul 2>nul
if %errorlevel%==0 (
  py server.py
) else (
  python server.py
)
pause
