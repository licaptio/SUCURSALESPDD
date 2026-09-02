@echo off
cd /d "%~dp0"
py server.py 2>nul || python server.py
