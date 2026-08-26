@echo off
cd /d "%~dp0"
title PROVSOFT - Clasificador Reposteria
where python >nul 2>nul
if %errorlevel%==0 (
  python server.py
) else (
  where py >nul 2>nul
  if %errorlevel%==0 (
    py server.py
  ) else (
    echo.
    echo ERROR: Python 3 no esta instalado o no esta en PATH.
    echo.
    pause
  )
)
