<#
  스마트 앱 컨트롤 / SmartScreen 차단 진단 도구
  ------------------------------------------------------------
  실행 방법 (둘 중 하나)
    1) 이 파일을 마우스 오른쪽 클릭 → "PowerShell에서 실행"
    2) 명령 프롬프트에서:
       powershell -ExecutionPolicy Bypass -File .\fix-smart-app-control.ps1

  이 스크립트가 하는 일 (셋 다 안전하고 되돌릴 수 있는 작업입니다)
    · 스마트 앱 컨트롤이 켜져 있는지 읽어서 알려 줍니다 (설정을 바꾸지는 않습니다)
    · 빌드한 파일에 붙은 "웹에서 받은 파일" 표시를 지웁니다
    · 만든 exe 가 서명되어 있는지 확인하고, 다음에 할 일을 알려 줍니다

  ※ 스마트 앱 컨트롤을 끄는 동작은 일부러 넣지 않았습니다.
     한 번 끄면 Windows 를 다시 설치해야 되돌릴 수 있어서,
     반드시 사용자가 직접 Windows 보안 화면에서 판단해야 합니다.
#>

$ErrorActionPreference = 'SilentlyContinue'
$root = $PSScriptRoot
if (-not $root) { $root = (Get-Location).Path }

function Write-Head($text) {
    Write-Host ''
    Write-Host ('=' * 64) -ForegroundColor DarkGray
    Write-Host "  $text" -ForegroundColor Cyan
    Write-Host ('=' * 64) -ForegroundColor DarkGray
}

Write-Head '1. 스마트 앱 컨트롤 상태'

$state = $null
try {
    $key = Get-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy' -ErrorAction Stop
    $state = $key.VerifiedAndReputablePolicyState
} catch {
    $state = $null
}

switch ($state) {
    0 {
        Write-Host '  꺼짐 — 스마트 앱 컨트롤은 이 PC 를 차단하지 않습니다.' -ForegroundColor Green
        Write-Host '  (차단 메시지가 떴다면 SmartScreen 쪽입니다. [추가 정보] → [실행] 으로 넘어갈 수 있어요.)'
    }
    1 {
        Write-Host '  켜짐 — 서명되지 않은 프로그램은 실행이 막힙니다.' -ForegroundColor Yellow
        Write-Host '  KindCode 처럼 코드 서명 인증서가 없는 프로그램은 그대로는 실행되지 않습니다.'
    }
    2 {
        Write-Host '  평가 모드 — Windows 가 이 PC 에 켤지 말지 지켜보는 중입니다.' -ForegroundColor Yellow
        Write-Host '  이 상태에서도 일부 프로그램이 차단될 수 있습니다.'
    }
    default {
        Write-Host '  이 PC 에는 스마트 앱 컨트롤이 없습니다.' -ForegroundColor Green
        Write-Host '  (Windows 10 이거나, 업그레이드로 설치한 Windows 11 은 이 기능이 없습니다.)'
    }
}

Write-Head '2. "웹에서 받은 파일" 표시 지우기'

$targets = @(
    $root,
    (Join-Path $env:LOCALAPPDATA 'electron\Cache'),
    (Join-Path $env:LOCALAPPDATA 'electron-builder\Cache')
)

$cleared = 0
foreach ($t in $targets) {
    if (-not (Test-Path $t)) { continue }
    Write-Host "  검사: $t"
    $files = Get-ChildItem -Path $t -Recurse -File -Force -ErrorAction SilentlyContinue
    foreach ($f in $files) {
        $zone = Get-Item -Path $f.FullName -Stream 'Zone.Identifier' -ErrorAction SilentlyContinue
        if ($zone) {
            Unblock-File -Path $f.FullName -ErrorAction SilentlyContinue
            $cleared = $cleared + 1
        }
    }
}
Write-Host "  표시를 지운 파일: $cleared 개" -ForegroundColor Green
if ($cleared -gt 0) {
    Write-Host '  → 이것 때문에 막힌 것이었다면 이제 실행됩니다. 다시 한번 실행해 보세요.'
} else {
    Write-Host '  → 표시가 붙은 파일이 없었습니다. 차단 원인은 "서명 없음" 쪽입니다.'
}

Write-Head '3. 만들어진 파일의 서명 상태'

$dist = Join-Path $root 'dist'
if (Test-Path $dist) {
    $exes = Get-ChildItem -Path $dist -Filter '*.exe' -Recurse -ErrorAction SilentlyContinue
    if ($exes.Count -eq 0) {
        Write-Host '  dist 폴더에 exe 가 없습니다. 먼저 build-windows.bat 으로 빌드해 주세요.'
    }
    foreach ($e in $exes) {
        $sig = Get-AuthenticodeSignature -FilePath $e.FullName
        $name = $e.Name
        if ($sig.Status -eq 'Valid') {
            Write-Host "  [서명됨] $name — $($sig.SignerCertificate.Subject)" -ForegroundColor Green
        } elseif ($sig.Status -eq 'NotSigned') {
            Write-Host "  [서명 없음] $name" -ForegroundColor Yellow
        } else {
            Write-Host "  [$($sig.Status)] $name" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host '  아직 dist 폴더가 없습니다. build-windows.bat 을 먼저 실행하세요.'
}

Write-Head '4. 다음에 할 수 있는 일'

Write-Host @'
  스마트 앱 컨트롤은 SmartScreen 과 달리 "그래도 실행" 버튼이 없고,
  프로그램 하나만 예외로 허용하는 기능도 없습니다. 선택지는 셋입니다.

  (1) 다른 PC 에서 쓰기 - 가장 간단
      스마트 앱 컨트롤은 Windows 11 을 새로 설치한 PC 에서만 켜집니다.
      업그레이드로 올린 Windows 11 이나 Windows 10 PC 에서는 그냥 실행됩니다.

  (2) 코드 서명 인증서로 서명하기 - 제대로 된 해결책
      · Microsoft Trusted Signing : 월 10달러 수준, SmartScreen/스마트 앱 컨트롤에
        가장 잘 먹힙니다. 개인/사업자 확인 절차가 필요합니다.
      · EV 코드 서명 인증서 : 연 40만원대. 발급 즉시 평판이 인정됩니다.
      · OV(일반) 코드 서명 인증서 : 연 20만원대. 처음엔 여전히 경고가 뜰 수 있습니다.
      · 직접 만든(자체 서명) 인증서는 스마트 앱 컨트롤에 통하지 않습니다.
      설정 방법은 BUILD-WINDOWS.md 의 "코드 서명" 부분에 적어 두었습니다.

  (3) 스마트 앱 컨트롤 끄기 - 되돌릴 수 없으니 신중히
      Windows 보안 → 앱 및 브라우저 컨트롤 → 스마트 앱 컨트롤 설정 → 끄기
      ※ 한 번 끄면 Windows 를 다시 설치하기 전에는 다시 켤 수 없습니다.
        이 PC 로 다른 프로그램도 많이 받는다면 권하지 않습니다.
'@

Write-Host ''
Read-Host '엔터를 누르면 창이 닫힙니다'
