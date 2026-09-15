; ---------------------------------------------------------------
;  설치 마법사 추가 동작
;  - 폴더/파일 마우스 오른쪽 버튼 메뉴에 "친절한 코드 에디터로 열기" 추가
;  (이 파일은 UTF-8 BOM 으로 저장되어야 한국어가 깨지지 않습니다)
; ---------------------------------------------------------------

!macro customInstall
  ; 폴더를 오른쪽 클릭했을 때
  WriteRegStr HKCU "Software\Classes\Directory\shell\KindCode" "" "친절한 코드 에디터로 열기"
  WriteRegStr HKCU "Software\Classes\Directory\shell\KindCode" "Icon" "$INSTDIR\KindCode.exe"
  WriteRegStr HKCU "Software\Classes\Directory\shell\KindCode\command" "" '"$INSTDIR\KindCode.exe" "%V"'

  ; 폴더 안 빈 공간을 오른쪽 클릭했을 때
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\KindCode" "" "이 폴더를 코드 에디터로 열기"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\KindCode" "Icon" "$INSTDIR\KindCode.exe"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\KindCode\command" "" '"$INSTDIR\KindCode.exe" "%V"'

  ; 아무 파일이나 오른쪽 클릭했을 때
  WriteRegStr HKCU "Software\Classes\*\shell\KindCode" "" "친절한 코드 에디터로 열기"
  WriteRegStr HKCU "Software\Classes\*\shell\KindCode" "Icon" "$INSTDIR\KindCode.exe"
  WriteRegStr HKCU "Software\Classes\*\shell\KindCode\command" "" '"$INSTDIR\KindCode.exe" "%1"'
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\Directory\shell\KindCode"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\KindCode"
  DeleteRegKey HKCU "Software\Classes\*\shell\KindCode"
!macroend
