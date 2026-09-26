@echo off
setlocal
cd /d "%~dp0"
set "DEST=%LOCALAPPDATA%\Sitekhata"
mkdir "%DEST%" 2>nul
copy /Y "%~dp0Sitekhata.html" "%DEST%\Sitekhata.html" >nul
copy /Y "%~dp0Open Sitekhata.bat" "%DEST%\Open Sitekhata.bat" >nul

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$desk = [Environment]::GetFolderPath('Desktop');" ^
  "$programs = [Environment]::GetFolderPath('Programs');" ^
  "$menu = Join-Path $programs 'Sitekhata';" ^
  "New-Item -ItemType Directory -Force -Path $menu | Out-Null;" ^
  "$shell = New-Object -ComObject WScript.Shell;" ^
  "foreach ($path in @((Join-Path $desk 'Sitekhata.lnk'), (Join-Path $menu 'Sitekhata.lnk'))) {" ^
  "  $sc = $shell.CreateShortcut($path);" ^
  "  $sc.TargetPath = Join-Path $env:LOCALAPPDATA 'Sitekhata\Open Sitekhata.bat';" ^
  "  $sc.WorkingDirectory = Join-Path $env:LOCALAPPDATA 'Sitekhata';" ^
  "  $sc.WindowStyle = 7;" ^
  "  $sc.Description = 'Sitekhata — contractor books';" ^
  "  $sc.Save();" ^
  "}"

echo Sitekhata is installed.
echo A Sitekhata shortcut is on your desktop and in the Start menu.
echo.
start "" "%DEST%\Open Sitekhata.bat"
echo You can close this window.
pause
