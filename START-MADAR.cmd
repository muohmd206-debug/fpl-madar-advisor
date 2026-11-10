@echo off
setlocal
cd /d "%~dp0"
title Madar - FPL Advisor
if exist "%~dp0runtime\node.exe" (
  "%~dp0runtime\node.exe" "%~dp0start.mjs"
) else (
  where node >nul 2>nul
  if errorlevel 1 (
    echo Download the ready-to-run Windows ZIP from:
    echo https://github.com/muohmd206-debug/fpl-madar-advisor/releases/latest
    echo Extract All, then open START-MADAR.cmd from the extracted folder.
    pause
    exit /b 1
  )
  node "%~dp0start.mjs"
)
if errorlevel 1 pause
