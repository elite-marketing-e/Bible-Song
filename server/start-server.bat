@echo off
title Bible Song Pro - Serveur reseau
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js n'est pas installe sur ce PC.
  echo.
  echo  1. Telechargez-le ici : https://nodejs.org  ^(bouton vert "LTS"^)
  echo  2. Installez-le en cliquant Suivant partout ^(5 minutes^)
  echo  3. Relancez ce fichier start-server.bat
  echo.
  pause
  exit /b 1
)

node bsp-server.js
pause
