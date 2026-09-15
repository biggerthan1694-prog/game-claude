# Windows 설치 파일(.exe) 만들기 — 따라 하기

컴퓨터를 잘 모르셔도 따라 할 수 있게 하나씩 적었습니다. **Windows PC 에서** 진행해 주세요.

---

## 0. 준비물 (한 번만)

### Node.js 설치
1. https://nodejs.org 접속
2. 왼쪽의 **LTS** 버튼(예: `22.x.x LTS`) 클릭 → 내려받은 `.msi` 실행
3. 계속 [다음] 을 누르면 됩니다. 옵션은 기본값 그대로 두세요.
4. 설치가 끝나면 **컴퓨터를 한 번 재시작**하거나, 열려 있던 명령 프롬프트를 모두 닫았다 여세요.

확인: 시작 메뉴에 `cmd` 입력 → 명령 프롬프트에서

```
node -v
```

`v22.x.x` 같은 게 나오면 준비 끝입니다.

> 파이썬은 필요 없습니다. (아이콘을 새로 만들 때만 씁니다.)

---

## 1. 소스 내려받기

이 저장소를 내려받아 압축을 풉니다. 그 안의 **`editor`** 폴더가 에디터 프로젝트입니다.

```
C:\...\game-claude\editor\
```

---

## 2. 빌드 — 가장 쉬운 방법

`editor` 폴더 안의 **`build-windows.bat` 를 더블클릭**하세요.

창이 뜨고 이런 순서로 알아서 진행됩니다.

```
[1/3] Node.js v22.x.x 확인 완료.
[2/3] 필요한 파일을 내려받는 중입니다. 처음 한 번은 5~10분 걸릴 수 있어요...
[3/3] 설치 마법사(.exe)와 포터블(.exe)을 만드는 중입니다...
```

끝나면 `dist` 폴더가 저절로 열립니다.

| 파일 | 뭐 하는 건가요 |
| --- | --- |
| **`KindCode-Setup-1.0.0.exe`** | 설치 마법사. 다른 사람에게 이 파일 하나만 주면 됩니다. |
| **`KindCode-Portable-1.0.0.exe`** | 설치 없이 더블클릭하면 바로 실행. USB 에 넣고 다녀도 됩니다. |
| `win-unpacked\` | 포장 전 원본 폴더 (신경 쓰지 않아도 됩니다) |

### 명령으로 하고 싶다면

```cmd
cd /d C:\...\game-claude\editor
npm install
npm run dist
```

---

## 3. 설치 마법사는 이렇게 생겼습니다

`KindCode-Setup-1.0.0.exe` 를 실행하면 순서대로 나옵니다.

1. **사용 조건** — `build/license_ko.txt` 내용이 한국어로 표시됩니다. [동의함]
2. **설치 대상** — "나만 사용" (권한 필요 없음) 또는 "이 컴퓨터의 모든 사용자" (관리자 권한)
3. **설치 위치 선택** — 원하는 폴더로 바꿀 수 있습니다.
4. **설치 진행** — 바탕화면 바로 가기와 시작 메뉴 항목("친절한 코드 에디터")이 생깁니다.
5. **완료** — [마침] 을 누르면 에디터가 바로 실행됩니다.

설치하면 덤으로:
- 폴더를 **오른쪽 클릭** → "친절한 코드 에디터로 열기"
- 파일을 **오른쪽 클릭** → "친절한 코드 에디터로 열기"
- `.js` `.ts` `.json` `.css` `.md` 파일이 "연결 프로그램" 목록에 등록됩니다.

**제거**는 Windows 설정 → 앱 → "친절한 코드 에디터 1.0.0" → 제거.
(설정 파일은 남겨 두므로, 다시 설치하면 테마·최근 폴더가 그대로입니다.)

---

## 4. 실행하려니 Windows 가 막을 때

막는 주체가 **둘**이고, 성격이 완전히 다릅니다. 먼저 어느 쪽인지 구분하세요.

`fix-smart-app-control.ps1` 을 오른쪽 클릭 → **PowerShell에서 실행** 하면
어느 쪽인지, 왜 막혔는지 한국어로 알려 줍니다. (설정을 바꾸지 않고 읽기만 합니다.)

### (A) SmartScreen — 파란 창, 넘어갈 수 있음

> **Windows의 PC 보호** — Microsoft Defender SmartScreen에서 인식할 수 없는 앱의 시작을 차단했습니다.

**[추가 정보] → [실행]** 을 누르면 실행됩니다. 서명 안 된 모든 프로그램에 뜨는 정상적인 화면입니다.

### (B) 스마트 앱 컨트롤 — "그래도 실행" 버튼이 없음

> **스마트 앱 컨트롤이 위험한 파일 확장자를 가진 앱을 차단했습니다.**

Windows 11 을 **새로 설치한** PC 에만 있는 기능입니다. SmartScreen 과 달리

- "그래도 실행" 같은 우회 버튼이 **없고**,
- 프로그램 하나만 예외로 허용하는 기능도 **없습니다**.

**왜 막히나요?** 스마트 앱 컨트롤은 *신뢰할 수 있는 인증서로 서명된* 프로그램만 통과시킵니다.
Electron 으로 만든 프로그램의 본체(`electron.exe`)는 배포처에서부터 서명이 되어 있지 않고,
여기서 만든 `KindCode.exe` 와 설치 마법사도 마찬가지로 서명이 없습니다. 그래서 막힙니다.
KindCode 만의 문제가 아니라, 서명 없이 만든 모든 프로그램이 똑같이 막힙니다.

**해결책 세 가지**

| 방법 | 비용 | 참고 |
| --- | --- | --- |
| **다른 PC 에서 쓰기** | 0원 | 업그레이드로 올린 Windows 11 이나 Windows 10 에는 이 기능 자체가 없습니다. 회사/학교 PC 도 대개 꺼져 있습니다. |
| **코드 서명 인증서로 서명** | 월 1만원 ~ 연 40만원 | 제대로 된 해결책. 아래 참고. |
| **스마트 앱 컨트롤 끄기** | 0원 | Windows 보안 → 앱 및 브라우저 컨트롤 → 스마트 앱 컨트롤 설정 → 끄기.<br>**⚠️ 한 번 끄면 Windows 를 다시 설치하기 전에는 다시 켤 수 없습니다.** |

가끔은 **"웹에서 받은 파일" 표시(Mark of the Web)** 때문에 막히기도 합니다.
이건 공짜로 해결됩니다 — `build-windows.bat` 이 빌드 끝에 자동으로 지우고,
이미 만든 파일은 `fix-smart-app-control.ps1` 이 지워 줍니다.
(수동으로 하려면: 파일 오른쪽 클릭 → 속성 → 아래쪽 **[차단 해제]** 체크 → 확인)

### 코드 서명

`electron-builder.yml` 의 `win:` 아래에 주석으로 설정 자리를 만들어 두었습니다. 주석만 풀면 됩니다.

| 인증서 | 대략 비용 | 스마트 앱 컨트롤 통과 |
| --- | --- | --- |
| **Microsoft Trusted Signing** | 월 10달러 수준 | 가장 잘 통합니다. Microsoft 가 직접 운영하며, 개인/사업자 확인 절차가 필요합니다. |
| **EV 코드 서명 인증서** | 연 40만원대 | 발급 즉시 평판이 인정됩니다. USB 토큰이나 HSM 으로 받습니다. |
| **OV(일반) 코드 서명 인증서** | 연 20만원대 | 처음엔 여전히 경고가 뜰 수 있고, 내려받은 수가 쌓여야 잦아듭니다. |
| **직접 만든 자체 서명 인증서** | 0원 | **통하지 않습니다.** SmartScreen 도 스마트 앱 컨트롤도 인정하지 않습니다. |

```yaml
# electron-builder.yml — Microsoft Trusted Signing 예시
win:
  azureSignOptions:
    endpoint: https://eus.codesigning.azure.net
    codeSigningAccountName: 내-서명-계정-이름
    certificateProfileName: 내-인증서-프로필-이름
```

```cmd
rem 빌드 전에 인증 정보를 환경 변수로 넘깁니다
set AZURE_TENANT_ID=...
set AZURE_CLIENT_ID=...
set AZURE_CLIENT_SECRET=...
npm run dist
```

.pfx 파일이 있다면:

```yaml
win:
  certificateFile: C:\경로\인증서.pfx
  rfc3161TimeStampServer: http://timestamp.digicert.com
```

```cmd
set CSC_KEY_PASSWORD=인증서비밀번호
npm run dist
```

> 비밀번호는 `electron-builder.yml` 에 적지 마세요. 파일째로 공유되면 인증서가 통째로 털립니다.

---

## 5. 자주 나는 문제

| 증상 | 해결 |
| --- | --- |
| `'npm'은(는) 내부 또는 외부 명령...' ` | Node.js 설치 후 명령 프롬프트를 새로 여세요. 그래도 안 되면 재부팅. |
| `npm install` 이 자꾸 실패 | 회사·학교 네트워크의 프록시 때문일 수 있습니다. `npm config set registry https://registry.npmjs.org/` 후 재시도. |
| Electron 내려받기가 멈춤 | 잠시 후 다시 `npm install`. 캐시가 남아 이어받습니다. |
| 백신이 빌드를 막음 | `dist` 폴더를 검사 예외로 추가하거나 잠시 실시간 검사를 끄고 다시 빌드하세요. (NSIS 로 만든 설치 파일은 오탐이 잦습니다.) |
| 빌드는 됐는데 실행하면 흰 화면 | `node_modules\monaco-editor` 가 빠진 경우입니다. `node_modules` 폴더를 지우고 `npm install` 을 다시 하세요. |
| 창은 뜨는데 자동 완성이 안 뜸 | <kbd>Ctrl</kbd>+<kbd>Space</kbd> 를 눌러 보세요. 한/영 전환키와 겹치면 <kbd>F1</kbd> → "자동 완성" 검색으로도 됩니다. |
| 다시 빌드하면 파일이 잠겼다고 나옴 | 이전에 실행한 KindCode 창을 모두 닫고 `dist` 폴더를 지운 뒤 다시 빌드하세요. |
| 스마트 앱 컨트롤이 차단 | 위 4번 (B) 를 보세요. `fix-smart-app-control.ps1` 이 원인을 알려 줍니다. |

---

## 6. 리눅스·맥에서 만들려면

`.exe` 는 Windows 에서 만드는 게 가장 확실합니다. 꼭 다른 OS 에서 만들어야 한다면 **Wine** 이 필요합니다.

```bash
# Ubuntu/Debian 기준
sudo apt install wine64
npm run dist:portable   # 포터블은 비교적 잘 만들어짐
npm run dist            # NSIS 설치 마법사는 Wine 상태에 따라 실패할 수 있음
```

Docker 를 쓰면 더 안정적입니다.

```bash
docker run --rm -it -v "$PWD":/project electronuserland/builder:wine \
  /bin/bash -c "cd /project && npm install && npm run dist"
```

---

## 7. 이름·버전·아이콘 바꾸기

| 바꿀 것 | 어디 |
| --- | --- |
| 버전 번호 | `package.json` 의 `version` |
| 실행 파일 이름 | `electron-builder.yml` 의 `win.executableName` |
| 바로 가기 이름 | `electron-builder.yml` 의 `nsis.shortcutName` |
| 창 제목 | `src/main/main.js` 의 `title`, `src/renderer/app.js` 의 `syncDirty()` |
| 아이콘 | `build/icon.ico` 를 교체하거나, `build/make_icon.py` 의 색·모양을 고친 뒤 `python build/make_icon.py` |
| 파일 연결 목록 | `electron-builder.yml` 의 `win.fileAssociations` (필요 없으면 통째로 삭제) |
| 오른쪽 클릭 메뉴 | `build/installer.nsh` |
