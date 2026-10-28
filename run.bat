@echo off
setlocal
cd /d "%~dp0"
if not exist ".env" (
  echo Missing .env. Copy the provided configuration and fill in your credentials.
  pause
  exit /b 1
)
if not exist "node_modules\discord.js" (
  echo Installing Dimgur bot dependencies...
  call npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo Registering the /dimgur Activity command...
call npm run register
if errorlevel 1 (
  echo Command registration failed. Read the Discord error above, correct the setup, and try again.
  pause
  exit /b 1
)
echo Starting the Discord bot. Keep this window open while you use Dimgur.
node server.js
pause
