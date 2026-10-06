@echo off
cd /d "%~dp0"
where node >nul 2>nul || (echo Instale o Node.js em https://nodejs.org e tente de novo. & pause & exit /b)
if not exist node_modules\electron (
  echo Preparando na primeira vez, aguarde...
  call npm install --no-audit --no-fund
  call "%~dp0CRIAR-ATALHO.bat"
)
start "" wscript.exe "%~dp0abrir.vbs"
