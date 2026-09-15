# raspinfo 커뮤니티

raspinfo.com에 붙일 게시판(커뮤니티) 서버입니다.
**npm 의존성이 하나도 없습니다.** Node 22.5 이상이면 `node server.js` 한 줄로 뜹니다.

- 저장소: SQLite (`node:sqlite` 내장 모듈)
- 화면: 서버 사이드 렌더링 HTML + CSS 한 장 (자바스크립트가 꺼져 있어도 모든 기능 동작)
- 빌드 단계 없음, 설정 파일 없음, 환경변수만 있으면 됨

## 빠르게 띄우기

```bash
cd community
node server.js
# → http://0.0.0.0:8080
```

처음 가입하는 계정이 자동으로 **관리자**가 됩니다. 서버를 올리자마자 본인 계정부터 만드세요.

## 기능

| 영역 | 내용 |
|---|---|
| 게시판 | 공지 / 자유 / 질문답변 / 프로젝트 자랑 / 팁·자료 (기본 5개, 관리자가 추가 가능) |
| 글 | 작성·수정·삭제(soft delete), 조회수, 페이지 넘김(20개 단위) |
| 댓글 | 작성·삭제 |
| 검색 | 제목 + 본문 |
| 계정 | 가입, 로그인, 로그아웃, 사용자별 글 목록 |
| 관리 | 게시판 생성, 모든 글·댓글 삭제 권한 |
| 본문 서식 | 자동 링크, ``` 로 감싼 코드블록, 줄바꿈 보존 |

## 환경변수

| 이름 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `8080` | 수신 포트 |
| `HOST` | `0.0.0.0` | 수신 주소. 리버스 프록시 뒤라면 `127.0.0.1` 권장 |
| `COMMUNITY_DB` | `./data/community.db` | SQLite 파일 경로 |
| `SITE_NAME` | `raspinfo` | 상단바와 제목에 쓰이는 이름 |
| `SESSION_SECRET` | (임시 생성) | CSRF 토큰 서명 키. **운영에서는 반드시 고정** |
| `TRUST_PROXY` | `0` | `1`이면 `X-Forwarded-For`를 접속 IP로 신뢰 |
| `SECURE_COOKIES` | `TRUST_PROXY`와 동일 | `1`이면 쿠키에 `Secure` 플래그 |

`SESSION_SECRET`은 이렇게 만드세요:

```bash
openssl rand -hex 32
```

고정하지 않으면 재시작할 때마다 CSRF 토큰이 무효가 되어, 그 순간 폼을 쓰고 있던 사람이 한 번 거부당합니다.

## 테스트

```bash
node --test "test/*.test.js"
```

테스트 42개. 그 중 36개는 실제 서버를 띄워 HTTP로 검증합니다 — 권한, CSRF, XSS 이스케이프,
경로 탈출, 열린 리다이렉트, 로그인 시도 제한까지 포함합니다.

## 운영 배포

`deploy/` 에 systemd 유닛과 nginx 설정 예시가 있습니다.

```bash
sudo cp deploy/raspinfo-community.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now raspinfo-community
```

nginx로 TLS를 종단하고 `TRUST_PROXY=1`을 켜세요. 그래야 접속 IP가 제대로 잡히고
(로그인 시도 제한이 의미 있어집니다) 쿠키에 `Secure`가 붙습니다.

## 보안 관련 메모

- 비밀번호는 **scrypt**(N=16384)로 저장합니다. 평문도 복호화 가능한 형태도 남지 않습니다.
- 세션 토큰은 쿠키에만 평문으로 주고, DB에는 SHA-256 해시만 저장합니다.
- 모든 POST는 세션에 묶인 CSRF 토큰을 요구합니다.
- 쿠키는 `HttpOnly` + `SameSite=Lax`.
- 출력은 전부 이스케이프하며, CSP로 인라인 스크립트를 막아 두었습니다.
- 로그인 실패가 15분 안에 10번 쌓이면 해당 IP를 잠급니다.
- 없는 아이디로 로그인해도 응답 시간이 같습니다 (아이디 존재 여부가 새지 않게).
- SQL은 전부 바인딩 파라미터를 씁니다. 검색어의 `%` `_` 와일드카드도 escape 처리합니다.

## 백업

SQLite 파일 하나만 챙기면 됩니다. WAL 모드라 실행 중 복사할 때는 `.backup`을 쓰세요.

```bash
sqlite3 data/community.db ".backup '/backup/community-$(date +%F).db'"
```

## 구조

```
community/
  server.js           라우팅과 핸들러
  lib/db.js           스키마와 질의
  lib/auth.js         비밀번호·세션·CSRF·시도 제한
  lib/http.js         쿠키/폼 파싱, 응답 헬퍼, 정적 파일
  lib/views.js        HTML 렌더링 (이스케이프는 여기서 일괄 처리)
  public/             style.css, app.js, favicon.svg
  test/               통합 테스트 + 인증 단위 테스트
  deploy/             systemd, nginx 예시
```
