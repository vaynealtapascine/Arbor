@echo off
rem Removes the Arbor service (your data stays). Double-click this file.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1" %*
