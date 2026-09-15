/* 통합 테스트 — 실제 서버를 띄우고 HTTP로 두드린다.
 *
 *   node --test test/
 */

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as db from '../lib/db.js';
import { createApp } from '../server.js';

let server;
let base;
let dir;
let handle;

const config = {
  siteName: 'raspinfo',
  secret: Buffer.from('test-secret-key', 'utf8'),
  trustProxy: false,
  secureCookies: false,
};

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'community-test-'));
  handle = db.open(join(dir, 'test.db'));
  server = createServer(createApp(config));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

/* 테스트 사이에 데이터가 새지 않도록 매번 비운다 */
beforeEach(() => {
  handle.exec('DELETE FROM comments; DELETE FROM posts; DELETE FROM sessions;'
    + ' DELETE FROM login_attempts; DELETE FROM users; DELETE FROM boards;');
  db.seedDefaultBoards();
});

/* --------------------------------------------------------------- 도우미 */

/** 쿠키를 들고 다니는 최소 브라우저. */
class Client {
  constructor() { this.cookies = new Map(); }

  cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  absorb(response) {
    for (const raw of response.headers.getSetCookie()) {
      const [pair] = raw.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (value === '') this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return response;
  }

  async get(path) {
    return this.absorb(await fetch(base + path, {
      headers: { cookie: this.cookieHeader() },
      redirect: 'manual',
    }));
  }

  async post(path, fields) {
    return this.absorb(await fetch(base + path, {
      method: 'POST',
      headers: {
        cookie: this.cookieHeader(),
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(fields).toString(),
      redirect: 'manual',
    }));
  }

  /** 현재 세션의 CSRF 토큰을 아무 페이지에서나 긁어온다. */
  async csrf(path = '/') {
    const body = await (await this.get(path)).text();
    const match = /name="csrf" value="([a-f0-9]+)"/.exec(body);
    assert.ok(match, `CSRF 토큰을 찾지 못했습니다: ${path}`);
    return match[1];
  }

  async signup(username, password = 'password123', displayName = '') {
    return this.post('/signup', {
      username, password, display_name: displayName,
    });
  }

  async login(username, password = 'password123') {
    return this.post('/login', { username, password, next: '/' });
  }

  async write(slug, title, body) {
    const csrf = await this.csrf(`/b/${slug}/write`);
    return this.post(`/b/${slug}/write`, { csrf, title, body });
  }
}

const postIdFrom = (response) => {
  const location = response.headers.get('location');
  const match = /^\/p\/(\d+)/.exec(location || '');
  assert.ok(match, `글 주소로 이동하지 않았습니다: ${location}`);
  return Number(match[1]);
};

/* ----------------------------------------------------------- 기본 동작 */

test('홈에 기본 게시판이 보인다', async () => {
  const response = await new Client().get('/');
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /자유게시판/);
  assert.match(body, /질문과 답변/);
});

test('없는 주소는 404', async () => {
  assert.equal((await new Client().get('/그런거없음')).status, 404);
  assert.equal((await new Client().get('/b/nope')).status, 404);
  assert.equal((await new Client().get('/p/99999')).status, 404);
});

test('healthz는 ok', async () => {
  const response = await fetch(base + '/healthz');
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'ok');
});

/* --------------------------------------------------------------- 가입 */

test('가입하면 로그인 상태가 되고 첫 사용자는 관리자다', async () => {
  const client = new Client();
  const response = await client.signup('alice', 'password123', '앨리스');
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/?m=welcome');

  const home = await (await client.get('/')).text();
  assert.match(home, /앨리스/);
  assert.match(home, /로그아웃/);

  assert.equal((await client.get('/admin/boards')).status, 200);
});

test('두 번째 사용자는 관리자가 아니다', async () => {
  await new Client().signup('alice');

  const bob = new Client();
  await bob.signup('bob');
  assert.equal((await bob.get('/admin/boards')).status, 403);
});

test('짧은 비밀번호와 이상한 아이디는 거절한다', async () => {
  const short = await new Client().signup('alice', 'short');
  assert.equal(short.status, 400);
  assert.match(await short.text(), /8자 이상/);

  const bad = await new Client().signup('1abc', 'password123');
  assert.equal(bad.status, 400);
  assert.match(await bad.text(), /영문자로 시작/);
});

test('중복 아이디는 409', async () => {
  await new Client().signup('alice');
  const again = await new Client().signup('alice');
  assert.equal(again.status, 409);
});

/* ------------------------------------------------------------- 로그인 */

test('로그인과 로그아웃이 왕복한다', async () => {
  await new Client().signup('alice', 'password123');

  const client = new Client();
  const login = await client.login('alice', 'password123');
  assert.equal(login.status, 303);
  assert.match(await (await client.get('/')).text(), /로그아웃/);

  const csrf = await client.csrf('/');
  const logout = await client.post('/logout', { csrf });
  assert.equal(logout.status, 303);
  assert.match(await (await client.get('/')).text(), /가입/);
});

test('틀린 비밀번호는 401이고 세션이 생기지 않는다', async () => {
  await new Client().signup('alice', 'password123');

  const client = new Client();
  const response = await client.login('alice', 'wrong-password');
  assert.equal(response.status, 401);
  assert.equal(client.cookies.has('sid'), false);
});

test('로그인 실패가 쌓이면 잠시 막는다', async () => {
  await new Client().signup('alice', 'password123');

  const client = new Client();
  for (let i = 0; i < 10; i++) await client.login('alice', 'nope');

  const blocked = await client.login('alice', 'password123');
  assert.equal(blocked.status, 429);
  assert.match(await blocked.text(), /너무 많습니다/);
});

/* ----------------------------------------------------------------- 글 */

test('글을 쓰고 읽고 고치고 지운다', async () => {
  const client = new Client();
  await client.signup('alice', 'password123', '앨리스');

  const created = await client.write('free', '첫 글입니다', '내용이에요');
  assert.equal(created.status, 303);
  const id = postIdFrom(created);

  const detail = await (await client.get(`/p/${id}`)).text();
  assert.match(detail, /첫 글입니다/);
  assert.match(detail, /내용이에요/);
  assert.match(detail, /앨리스/);

  const editCsrf = await client.csrf(`/p/${id}/edit`);
  const updated = await client.post(`/p/${id}/edit`, {
    csrf: editCsrf, title: '고친 제목', body: '고친 내용',
  });
  assert.equal(updated.status, 303);
  assert.match(await (await client.get(`/p/${id}`)).text(), /고친 제목/);

  const deleteCsrf = await client.csrf(`/p/${id}`);
  const deleted = await client.post(`/p/${id}/delete`, { csrf: deleteCsrf });
  assert.equal(deleted.status, 303);
  assert.equal((await client.get(`/p/${id}`)).status, 404);
});

test('빈 제목이나 빈 내용은 400', async () => {
  const client = new Client();
  await client.signup('alice');

  const csrf = await client.csrf('/b/free/write');
  const empty = await client.post('/b/free/write', { csrf, title: '  ', body: '내용' });
  assert.equal(empty.status, 400);
  assert.match(await empty.text(), /제목을 입력/);
});

test('비로그인은 글쓰기 화면에서 로그인으로 보낸다', async () => {
  const response = await new Client().get('/b/free/write');
  assert.equal(response.status, 303);
  assert.match(response.headers.get('location'), /^\/login\?m=login-required/);
});

test('남의 글은 고치거나 지울 수 없다', async () => {
  const alice = new Client();
  await alice.signup('alice');
  const id = postIdFrom(await alice.write('free', '앨리스 글', '내용'));

  const bob = new Client();
  await bob.signup('bob');

  assert.equal((await bob.get(`/p/${id}/edit`)).status, 403);

  const csrf = await bob.csrf('/');
  assert.equal((await bob.post(`/p/${id}/delete`, { csrf })).status, 403);
  assert.equal((await bob.get(`/p/${id}`)).status, 200);
});

test('관리자는 남의 글을 지울 수 있다', async () => {
  const admin = new Client();
  await admin.signup('admin');        // 첫 사용자 → 관리자

  const bob = new Client();
  await bob.signup('bob');
  const id = postIdFrom(await bob.write('free', '밥의 글', '내용'));

  const csrf = await admin.csrf('/');
  assert.equal((await admin.post(`/p/${id}/delete`, { csrf })).status, 303);
  assert.equal((await admin.get(`/p/${id}`)).status, 404);
});

test('조회수가 올라간다', async () => {
  const client = new Client();
  await client.signup('alice');
  const id = postIdFrom(await client.write('free', '조회수', '내용'));

  await client.get(`/p/${id}`);
  assert.match(await (await client.get(`/p/${id}`)).text(), /조회 2/);
});

/* --------------------------------------------------------------- 댓글 */

test('댓글을 달고 지운다', async () => {
  const client = new Client();
  await client.signup('alice', 'password123', '앨리스');
  const id = postIdFrom(await client.write('free', '글', '내용'));

  const csrf = await client.csrf(`/p/${id}`);
  assert.equal((await client.post(`/p/${id}/comment`, { csrf, body: '좋은 글이네요' })).status, 303);

  const detail = await (await client.get(`/p/${id}`)).text();
  assert.match(detail, /좋은 글이네요/);
  assert.match(detail, /댓글 1/);

  const commentId = Number(/action="\/c\/(\d+)\/delete"/.exec(detail)[1]);
  const deleteCsrf = await client.csrf(`/p/${id}`);
  assert.equal((await client.post(`/c/${commentId}/delete`, { csrf: deleteCsrf })).status, 303);
  assert.doesNotMatch(await (await client.get(`/p/${id}`)).text(), /좋은 글이네요/);
});

test('남의 댓글은 지울 수 없다', async () => {
  const alice = new Client();
  await alice.signup('alice');
  const id = postIdFrom(await alice.write('free', '글', '내용'));
  await alice.post(`/p/${id}/comment`, { csrf: await alice.csrf(`/p/${id}`), body: '앨리스 댓글' });

  const detail = await (await alice.get(`/p/${id}`)).text();
  const commentId = Number(/action="\/c\/(\d+)\/delete"/.exec(detail)[1]);

  const bob = new Client();
  await bob.signup('bob');
  assert.equal((await bob.post(`/c/${commentId}/delete`, { csrf: await bob.csrf('/') })).status, 403);
});

/* --------------------------------------------------------------- 보안 */

test('CSRF 토큰이 없거나 틀리면 403', async () => {
  const client = new Client();
  await client.signup('alice');

  assert.equal((await client.post('/b/free/write', { title: 'x', body: 'y' })).status, 403);
  assert.equal(
    (await client.post('/b/free/write', { csrf: 'deadbeef', title: 'x', body: 'y' })).status, 403);
});

test('다른 세션의 CSRF 토큰은 통하지 않는다', async () => {
  const alice = new Client();
  await alice.signup('alice');
  const stolen = await alice.csrf('/');

  const bob = new Client();
  await bob.signup('bob');
  assert.equal((await bob.post('/b/free/write', { csrf: stolen, title: 'x', body: 'y' })).status, 403);
});

test('제목과 본문의 HTML은 이스케이프된다', async () => {
  const client = new Client();
  await client.signup('alice');

  const payload = '<script>alert(1)</script>';
  const id = postIdFrom(await client.write('free', payload, `본문 ${payload}`));

  const detail = await (await client.get(`/p/${id}`)).text();
  assert.doesNotMatch(detail, /<script>alert\(1\)<\/script>/);
  assert.match(detail, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('표시 이름의 HTML도 이스케이프된다', async () => {
  const client = new Client();
  await client.signup('alice', 'password123', '<img src=x onerror=alert(1)>');

  const home = await (await client.get('/')).text();
  assert.doesNotMatch(home, /<img src=x onerror/);
  assert.match(home, /&lt;img src=x onerror/);
});

test('본문의 링크는 nofollow가 붙고 코드블록은 그대로 나온다', async () => {
  const client = new Client();
  await client.signup('alice');
  const id = postIdFrom(await client.write(
    'free', '링크', 'https://example.com/a 참고\n```\n<b>코드</b>\n```'));

  const detail = await (await client.get(`/p/${id}`)).text();
  assert.match(detail, /<a href="https:\/\/example\.com\/a" rel="noopener nofollow ugc"/);
  assert.match(detail, /<pre class="code"><code>&lt;b&gt;코드&lt;\/b&gt;/);
});

test('인라인 코드는 링크로 바뀌지 않고 글자 그대로 나온다', async () => {
  const client = new Client();
  await client.signup('alice');
  const id = postIdFrom(await client.write('free', '인라인', '설정은 `https://example.com` 안에 씁니다'));

  const detail = await (await client.get(`/p/${id}`)).text();
  assert.match(detail, /<code class="inline">https:\/\/example\.com<\/code>/);
  assert.doesNotMatch(detail, /<a href="https:\/\/example\.com"/);
});

test('정적 파일 경로를 벗어나려는 시도는 404', async () => {
  for (const path of [
    '/static/../server.js',
    '/static/..%2Fserver.js',
    '/static/%2e%2e%2f%2e%2e%2fetc%2fpasswd',
  ]) {
    const response = await fetch(base + path, { redirect: 'manual' });
    assert.equal(response.status, 404, `${path} 가 404가 아닙니다`);
  }
  assert.equal((await fetch(base + '/static/style.css')).status, 200);
});

test('검색어의 LIKE 와일드카드는 글자 그대로 취급한다', async () => {
  const client = new Client();
  await client.signup('alice');
  await client.write('free', '보통 제목', '내용');
  await client.write('free', '100% 확률', '내용');

  const wildcard = await (await client.get('/search?q=' + encodeURIComponent('%'))).text();
  assert.match(wildcard, /100% 확률|100&#37;/);
  assert.doesNotMatch(wildcard, /보통 제목/);
});

test('로그인 후 이동은 같은 사이트로만 간다', async () => {
  await new Client().signup('alice', 'password123');

  const client = new Client();
  const response = await client.post('/login', {
    username: 'alice', password: 'password123', next: 'https://evil.example/',
  });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/?m=logged-in');
});

test('응답에 보안 헤더가 붙는다', async () => {
  const response = await fetch(base + '/');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.match(response.headers.get('content-security-policy'), /default-src 'self'/);
});

test('세션 쿠키는 HttpOnly + SameSite', async () => {
  const client = new Client();
  const response = await client.signup('alice');
  const cookie = response.headers.getSetCookie().find((c) => c.startsWith('sid='));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
});

/* --------------------------------------------------------- 목록/검색 */

test('검색이 제목과 본문을 모두 훑는다', async () => {
  const client = new Client();
  await client.signup('alice');
  await client.write('free', '라즈베리파이 세팅', '본문');
  await client.write('qna', '다른 제목', '본문에 라즈베리파이 언급');
  await client.write('free', '상관없는 글', '상관없는 내용');

  const results = await (await client.get('/search?q=' + encodeURIComponent('라즈베리파이'))).text();
  assert.match(results, /2건/);
  assert.doesNotMatch(results, /상관없는 글/);
});

test('한 페이지를 넘기면 페이지 이동이 나온다', async () => {
  const client = new Client();
  await client.signup('alice');
  for (let i = 1; i <= 22; i++) await client.write('free', `글 ${i}`, '내용');

  const first = await (await client.get('/b/free')).text();
  assert.match(first, /글 22/);
  assert.doesNotMatch(first, /글 2<\/span>/);
  assert.match(first, /class="pages"/);

  const second = await (await client.get('/b/free?page=2')).text();
  assert.match(second, /글 2</);
});

test('범위를 벗어난 page는 마지막 페이지로 잡아준다', async () => {
  const client = new Client();
  await client.signup('alice');
  await client.write('free', '하나뿐인 글', '내용');

  const response = await client.get('/b/free?page=9999');
  assert.equal(response.status, 200);
  assert.match(await response.text(), /하나뿐인 글/);
});

test('사용자 페이지에 그 사람 글만 나온다', async () => {
  const alice = new Client();
  await alice.signup('alice', 'password123', '앨리스');
  await alice.write('free', '앨리스의 글', '내용');

  const bob = new Client();
  await bob.signup('bob', 'password123', '밥');
  await bob.write('free', '밥의 글', '내용');

  const page = await (await alice.get('/u/alice')).text();
  assert.match(page, /앨리스의 글/);
  assert.doesNotMatch(page, /밥의 글/);
});

/* --------------------------------------------------------------- 관리 */

test('관리자가 게시판을 만든다', async () => {
  const admin = new Client();
  await admin.signup('admin');

  const csrf = await admin.csrf('/admin/boards');
  const created = await admin.post('/admin/boards', {
    csrf, slug: 'hardware', name: '하드웨어', description: '보드와 주변기기', position: '60',
  });
  assert.equal(created.status, 303);

  assert.match(await (await admin.get('/')).text(), /하드웨어/);
  assert.equal((await admin.get('/b/hardware')).status, 200);
});

test('관리자가 아니면 게시판을 못 만든다', async () => {
  await new Client().signup('admin');

  const bob = new Client();
  await bob.signup('bob');
  const response = await bob.post('/admin/boards', {
    csrf: await bob.csrf('/'), slug: 'x', name: 'X', description: '', position: '1',
  });
  assert.equal(response.status, 403);
});

test('이상한 slug는 거절한다', async () => {
  const admin = new Client();
  await admin.signup('admin');

  const response = await admin.post('/admin/boards', {
    csrf: await admin.csrf('/admin/boards'),
    slug: '대문자AND한글', name: '이름', description: '', position: '1',
  });
  assert.equal(response.status, 400);
});
