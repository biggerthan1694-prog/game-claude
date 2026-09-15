@echo off
chcp 65001 > nul
title 친절한 코드 에디터 - Windows 설치 파일 만들기
setlocal

echo.
echo ==========================================================
echo   친절한 코드 에디터 - Windows 설치 파일 만들기
echo ==========================================================
echo.

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [!] Node.js 가 설치되어 있지 않습니다.
  echo     https://nodejs.org 에서 LTS 버전을 설치한 뒤 이 파일을 다시 실행해 주세요.
  echo.
  pause
  exit /b 1
)

for /f "delims=" %%v in ('node -v') do set NODEVER=%%v
echo [1/4] Node.js %NODEVER% 확인 완료.
echo.

if not exist node_modules (
  echo [2/4] 필요한 파일을 내려받는 중입니다. 처음 한 번은 5~10분 걸릴 수 있어요...
) else (
  echo [2/4] 의존성 확인 중...
)
call npm install
if errorlevel 1 (
  echo.
  echo [!] 내려받기에 실패했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.
  pause
  exit /b 1
)
echo.

echo [3/4] 설치 마법사(.exe)와 포터블(.exe)을 만드는 중입니다...
call npm run dist
if errorlevel 1 (
  echo.
  echo [!] 빌드에 실패했습니다. 위에 나온 메시지를 확인해 주세요.
  pause
  exit /b 1
)

echo.
echo [4/4] 만든 파일에서 "웹에서 받은 파일" 표시를 지우는 중...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Path '%~dp0dist' -Recurse -File -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue" 2>nul
echo.
echo ==========================================================
echo   완료!  dist 폴더를 확인하세요.
echo     - KindCode-Setup-1.0.0.exe      (설치 마법사)
echo     - KindCode-Portable-1.0.0.exe   (설치 없이 바로 실행)
echo ==========================================================
echo.
echo   실행했더니 "스마트 앱 컨트롤이 차단했습니다" 라고 뜬다면
echo   fix-smart-app-control.ps1 을 오른쪽 클릭 - PowerShell에서 실행 하세요.
echo   (원인을 알려 주고, 자세한 해결책은 BUILD-WINDOWS.md 에 있습니다.)
echo.
start "" "%~dp0dist"
pause
