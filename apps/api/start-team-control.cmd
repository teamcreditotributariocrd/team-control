@echo off
setlocal

cd /d "%~dp0"

if not exist "logs" mkdir "logs"

set NODE_ENV=production
set PORT=3001

echo [%date% %time%] Starting Team Control API on port %PORT% >> "logs\team-control-server.log"
node dist\server.js >> "logs\team-control-server.log" 2>&1
