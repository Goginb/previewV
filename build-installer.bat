@echo off
setlocal
cd /d "%~dp0"
title PreviewV Installer Build
echo.
echo  Building PreviewV installer...
echo.

where node >nul 2>nul
if errorlevel 1 goto no_node

where npm >nul 2>nul
if errorlevel 1 goto no_npm

if not exist package.json goto no_package

if not exist node_modules (
  echo  Dependencies not found. Running npm ci...
  echo.
  call npm.cmd ci
  if errorlevel 1 goto install_failed
)

call npm.cmd run build:win
if errorlevel 1 goto build_failed

echo.
echo  Installer created in the release folder.
echo.
pause
exit /b 0

:no_node
echo  Node.js is not installed or is not in PATH.
echo  Install Node.js LTS from https://nodejs.org/ and run this file again.
goto fail

:no_npm
echo  npm is not available in PATH.
echo  Reinstall Node.js LTS from https://nodejs.org/ and run this file again.
goto fail

:no_package
echo  package.json was not found.
echo  Run build-installer.bat from the root of the PreviewV repository.
goto fail

:install_failed
echo.
echo  npm ci failed. Check the error messages above.
goto fail

:build_failed
echo.
echo  Installer build failed. Check the error messages above.
goto fail

:fail
echo.
pause
exit /b 1
