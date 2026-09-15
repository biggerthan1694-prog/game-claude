@echo off
chcp 65001 > nul
title 친절한 코드 에디터 - 바로 실행(개발용)
cd /d "%~dp0"
if not exist node_modules (
  echo 처음 실행이라 필요한 파일을 내려받습니다...
  call npm install || (pause & exit /b 1)
)
call npm start
