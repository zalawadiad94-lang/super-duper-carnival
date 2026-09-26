@echo off
setlocal
cd /d "%~dp0"
set "HTML=%~dp0Sitekhata.html"
set "URL=file:///%HTML:\=/%"
set "PROFILE=%APPDATA%\SitekhataProfile"

set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
set "CHROME86=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
set "EDGE86=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"

if exist "%CHROME%" goto chrome
if exist "%CHROME86%" set "CHROME=%CHROME86%" & goto chrome
if exist "%EDGE%" goto edge
if exist "%EDGE86%" set "EDGE=%EDGE86%" & goto edge
start "" "%HTML%"
goto :eof

:chrome
start "" "%CHROME%" --app="%URL%" --user-data-dir="%PROFILE%"
goto :eof

:edge
start "" "%EDGE%" --app="%URL%" --user-data-dir="%PROFILE%"
goto :eof
