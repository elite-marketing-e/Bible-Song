@echo off
title Bible Song Pro - Generer le certificat HTTPS
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js n'est pas installe. Voir start-server.bat.
  echo.
  pause
  exit /b 1
)

node make-cert.js
pause
