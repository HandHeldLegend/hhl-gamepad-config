@echo off
:: HHL factory station setup: double-click to run. Asks for administrator rights.
:: Chinese: shuang ji yun xing (double-click), then allow administrator access.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-windows.ps1" %*
