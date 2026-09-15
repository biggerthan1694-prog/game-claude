# 친절한 코드 에디터 (KindCode)

VS Code 와 **똑같은 편집 엔진(Monaco Editor)** 을 쓰는, 가볍고 한국어로 친절한 코드 에디터입니다.
Windows 용 설치 마법사(`.exe`)와 설치 없이 실행하는 포터블(`.exe`) 을 만들 수 있습니다.

> 빌드 방법만 빨리 보고 싶다면 → **[BUILD-WINDOWS.md](BUILD-WINDOWS.md)** (또는 `build-windows.bat` 더블클릭)

---

## 무엇이 되나요

### 자동 완성 (VS Code 수준)
- **JavaScript / TypeScript / HTML / CSS / SCSS / JSON**: 문맥을 이해하는 지능형 완성.
  객체의 멤버, 함수 매개변수 힌트, 마우스를 올리면 뜨는 설명, 문법 오류 표시까지 그대로 동작합니다.
  (VS Code 가 쓰는 것과 같은 언어 서비스를 웹 워커로 띄웁니다.)
- **한국어 설명이 붙은 스니펫**: `for`, `fn`, `try`, `fetch`, `html5`, `flex`, `media` 처럼 짧게 치고
  <kbd>Tab</kbd> 을 누르면 코드 틀이 통째로 들어갑니다.
- **그 밖의 모든 언어**: 열려 있는 문서 안의 단어로 완성됩니다.
- 문자열 안에서 `./` 를 치면 **같은 폴더의 파일 이름**을 제안합니다.
- 목록이 안 보이면 언제든 <kbd>Ctrl</kbd>+<kbd>Space</kbd>.

### 편집기
문법 강조 50여 종 · 괄호 짝 색칠 · 여러 커서(<kbd>Alt</kbd>+클릭) · 이름 일괄 변경(<kbd>F2</kbd>) ·
코드 접기 · 서식 정리(<kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>F</kbd>) · 찾기/바꾸기 · 미니맵 · 명령 팔레트(<kbd>F1</kbd>)

### 친절한 부분
- 메뉴·대화상자·오류 메시지가 **전부 한국어**입니다.
  ("접근 권한이 없습니다. 다른 위치에 저장하거나 관리자 권한으로 실행해 보세요." 처럼 다음 할 일을 알려 줍니다.)
- 처음 열면 **시작 화면**에서 자동 완성 사용법과 단축키를 안내합니다.
- 저장 안 한 파일이 있는 채로 창을 닫으면 **저장하고 닫기 / 저장 안 함 / 취소** 를 물어봅니다.
- 마지막에 연 폴더·테마·글자 크기·창 위치를 **기억**합니다.
- 파일을 지우면 **휴지통**으로 보냅니다(복구 가능).
- 설치 마법사가 오른쪽 클릭 메뉴에 **"친절한 코드 에디터로 열기"** 를 넣어 줍니다.

### 탐색기 · 파일
폴더 열기(<kbd>Ctrl</kbd>+<kbd>K</kbd> → <kbd>Ctrl</kbd>+<kbd>O</kbd>) · 트리 탐색 · 새 파일/폴더 ·
탭 여러 개 · 창에 파일 끌어다 놓기 · **빠른 파일 열기**(<kbd>Ctrl</kbd>+<kbd>P</kbd>, 이름 일부만 쳐도 찾음)

---

## 바로 실행해 보기 (개발 모드)

```bash
npm install
npm start
```

Windows 라면 `run-dev.bat` 을 더블클릭해도 됩니다.

## 설치 파일 만들기

```bash
npm run dist          # 설치 마법사 + 포터블 둘 다
npm run dist:installer  # 설치 마법사만
npm run dist:portable   # 포터블만
```

결과물은 `dist\` 폴더에 생깁니다.

| 파일 | 설명 |
| --- | --- |
| `KindCode-Setup-1.0.0.exe` | 설치 마법사. 사용 조건 → 설치 위치 선택 → 바로 가기 → 설치 → 실행 |
| `KindCode-Portable-1.0.0.exe` | 설치 없이 더블클릭하면 바로 뜨는 실행 파일 (USB 에 넣어도 됨) |

> ⚠️ **Windows PC 에서 빌드해야 합니다.** 리눅스/맥에서 Windows 설치 마법사를 만들려면 Wine 이 필요합니다.
> 자세한 안내는 [BUILD-WINDOWS.md](BUILD-WINDOWS.md) 를 보세요.

### 실행하려는데 Windows 가 막는다면

서명하지 않은 프로그램이라 그렇습니다. Electron 앱의 본체부터 서명이 없어서 생기는,
KindCode 만의 문제가 아닌 일반적인 현상입니다.

- **SmartScreen**(파란 창): [추가 정보] → [실행] 으로 넘어갑니다.
- **스마트 앱 컨트롤**(Windows 11 새로 설치한 PC): 우회 버튼이 없습니다.
  `fix-smart-app-control.ps1` 을 오른쪽 클릭 → PowerShell에서 실행 하면 원인을 알려 줍니다.
  해결책(다른 PC 에서 쓰기 / 코드 서명 / 기능 끄기)은
  [BUILD-WINDOWS.md 4번](BUILD-WINDOWS.md#4-실행하려니-windows-가-막을-때) 에 정리해 두었습니다.

---

## 폴더 구조

```
editor/
├─ build-windows.bat        더블클릭 한 번으로 설치 파일까지 만드는 스크립트
├─ run-dev.bat              개발 모드로 바로 실행
├─ fix-smart-app-control.ps1  Windows 가 실행을 막을 때 원인을 알려 주는 진단 도구
├─ electron-builder.yml     설치 마법사(NSIS) 설정
├─ build/
│  ├─ icon.ico              앱·설치 마법사 아이콘 (16~256px)
│  ├─ make_icon.py          아이콘을 다시 만드는 스크립트 (표준 라이브러리만 사용)
│  ├─ installer.nsh         오른쪽 클릭 메뉴 등록 (NSIS 매크로)
│  └─ license_ko.txt        마법사에 표시되는 사용 조건
└─ src/
   ├─ main/                 Electron 메인 프로세스
   │  ├─ main.js            창·프로토콜·파일 입출력(IPC)
   │  ├─ menu.js            한국어 메뉴 막대
   │  └─ settings.js        설정 저장 (userData/settings.json)
   ├─ preload/preload.js    화면에 열어 주는 안전한 API 목록
   └─ renderer/
      ├─ index.html         화면 구조 + 시작 화면
      ├─ styles.css         밝은/어두운 테마
      ├─ app.js             탭·탐색기·명령·상태 표시줄
      ├─ completions.js     자동 완성 설정과 한국어 스니펫
      └─ monaco-worker.js   언어 서비스 워커 부트스트랩
```

## 안전 설계

- 화면(렌더러)에는 Node.js 를 열어 주지 않습니다 (`contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`).
  파일 읽기/쓰기는 `preload.js` 가 정해 둔 통로로만 메인 프로세스에 요청합니다.
- `file://` 대신 앱 전용 `app://` 프로토콜로 화면을 띄웁니다. Monaco 의 언어 서비스 워커가
  정상 동작하고, 외부 네트워크 요청은 CSP 로 모두 막습니다. **인터넷 연결 없이 동작합니다.**

## 설정 파일 위치

`%APPDATA%\KindCode\settings.json`
(메뉴 → 도움말 → "설정 파일이 저장된 폴더 열기" 로도 갈 수 있습니다.)

## 라이선스

MIT. Monaco Editor(Microsoft, MIT) 와 Electron(MIT) 을 사용합니다.
