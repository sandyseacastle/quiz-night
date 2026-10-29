@echo off
REM Double-click to start Quiz Night Slides (Windows)
cd /d "%~dp0"
if not exist node_modules (echo First run: installing... & call npm install)
call npm start
pause
