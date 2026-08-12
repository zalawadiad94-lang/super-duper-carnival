@echo off
REM Double-click launcher for Windows. Starts the analyzer and opens a browser.
REM Keeps the window open on failure so the reason stays readable.

cd /d "%~dp0"
title Chart Analyzer

REM The py launcher ships with python.org installs and picks the newest
REM version; plain python is the Microsoft Store and PATH case. Written with
REM goto rather than nested parentheses, because %PY% inside a block expands
REM when the block is parsed, not when it runs.
set PY=

where py >nul 2>&1
if not errorlevel 1 set PY=py
if not "%PY%"=="" goto haspython

where python >nul 2>&1
if not errorlevel 1 set PY=python
if not "%PY%"=="" goto haspython

goto nopython

:haspython

REM Refuse early on an old interpreter rather than failing on syntax later.
%PY% -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>&1
if errorlevel 1 goto oldpython

echo Starting Chart Analyzer...
echo.
echo Your browser will open at http://127.0.0.1:8000
echo Close this window when you are finished.
echo.
%PY% app.py --open
goto end

:nopython
echo.
echo   Python is not installed.
echo.
echo   1. Go to https://www.python.org/downloads/
echo   2. Download Python for Windows.
echo   3. IMPORTANT: tick "Add python.exe to PATH" on the first screen.
echo   4. Finish the install, then double-click this file again.
echo.
pause
exit /b 1

:oldpython
echo.
echo   Your Python is too old. This needs version 3.10 or newer.
%PY% --version
echo.
echo   Install a current version from https://www.python.org/downloads/
echo   and tick "Add python.exe to PATH" during setup.
echo.
pause
exit /b 1

:end
echo.
echo Chart Analyzer has stopped.
pause
