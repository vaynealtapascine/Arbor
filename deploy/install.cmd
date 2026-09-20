@echo off
rem Sets Arbor up (asks for administrator rights). Double-click this file.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
