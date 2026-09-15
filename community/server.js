/* raspinfo 커뮤니티 서버 — 진입점과 라우팅.
 *
 * 외부 의존성 없음. Node 22.5 이상이면 `node server.js` 로 바로 뜬다.
 */

import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import * as db from './lib/db.js';
import * as auth from './lib/auth.js';
import * as views from './lib/views.js';
import {
  parseCookies, readForm, clientAddress, html, text, redirect, cookie, serveStatic,
} from './lib/http.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(HERE, 'public');

const PAGE_SIZE = 20;
const RECENT_ON_HOME = 15;
const SESSION_COOKIE = 'sid';

const TITLE_MAX = 150;
const BODY_MAX = 40000;
const COMMENT_MAX = 5000;
const DISPLAY_NAME_MAX = 30;

/* 리다이렉트로 넘기는 안내 문구는 키로만 주고받는다 (임의 문자열 주입 방지) */
const FLASH = {
  welcome: '가입이 완료됐습니다. 환영합니다.',
  'logged-in': '로그인했습니다.',
  'logged-out': '로그아웃했습니다.',
  'post-created': '글을 등록했습니다.',
  'post-updated': '글을 수정했습니다.',
  'post-deleted': '글을 삭제했습니다.',
  'comment-created': '댓글을 등록했습니다.',
  'comment-deleted': '댓글을 삭제했습니다.',
  'board-created': '게시판을 만들었습니다.',
  'login-required': '로그인이 필요합니다.',
};

/* ------------------------------------------------------------------ 설정 */

export function loadConfig(env = process.env) {
  const trustProxy = env.TRUST_PROXY === '1';
  let secret = env.SESSION_SECRET;
  if (!secret) {
    secret = randomBytes(32).toString('hex');
    console.warn(
      '[경고] SESSION_SECRET이 없어 임시 값을 만들었습니다. 재시작하면 작성 중이던 폼이 한 번 거부됩니다.\n' +
      '        운영에서는 SESSION_SECRET을 고정해 주세요: openssl rand -hex 32');
  }
  return {
    host: env.HOST || '0.0.0.0',
    port: Number(env.PORT || 8080),
    dbPath: env.COMMUNITY_DB || join(process.cwd(), 'data', 'community.db'),
    siteName: env.SITE_NAME || 'raspinfo',
    secret: Buffer.from(secret, 'utf8'),
    trustProxy,
    // HTTPS 종단이 앞단(nginx 등)이라면 Secure 쿠키를 켠다
    secureCookies: env.SECURE_COOKIES ? env.SECURE_COOKIES === '1' : trustProxy,
  };
}

/* ------------------------------------------------------------- 요청 문맥 */

function buildContext(req, url, config) {
  const cookies = parseCookies(req.headers.cookie);
  const sessionToken = cookies.get(SESSION_COOKIE) || '';
  const user = auth.sessionUser(sessionToken);
  const flashKey = url.searchParams.get('m');
  return {
    req,
    url,
    config,
    sessionToken: user ? sessionToken : '',
    user,
    csrf: user ? auth.csrfToken(sessionToken, config.secret) : '',
    boards: db.boards(),
    siteName: config.siteName,
    activeBoard: null,
    searchQuery: '',
    notice: flashKey && Object.hasOwn(FLASH, flashKey) ? FLASH[flashKey] : '',
    error: '',
  };
}

const pageNumber = (url) => {
  const raw = Number(url.searchParams.get('page'));
  return Number.isInteger(raw) && raw > 0 ? raw : 1;
};

const totalPages = (total) => Math.max(1, Math.ceil(total / PAGE_SIZE));

function fail(res, ctx, status, message) {
  html(res, status, views.errorPage(ctx, { status, message }));
}

/** 로그인이 필요한 화면. 비로그인이면 로그인 페이지로 보낸다. */
function requireUser(res, ctx) {
  if (ctx.user) return true;
  const next = ctx.url.pathname + ctx.url.search;
  redirect(res, `/login?m=login-required&next=${encodeURIComponent(next)}`);
  return false;
}

/** POST 공통 검사: 로그인 + CSRF. 통과하면 폼을, 아니면 null을 돌려준다. */
async function guardedForm(req, res, ctx) {
  if (!ctx.user) {
    fail(res, ctx, 401, '로그인이 필요합니다.');
    return null;
  }
  const form = await readForm(req);
  if (!auth.checkCsrf(ctx.sessionToken, ctx.config.secret, form.get('csrf'))) {
    fail(res, ctx, 403, '요청이 만료됐습니다. 새로고침 후 다시 시도해 주세요.');
    return null;
  }
  return form;
}

/** 열린 리다이렉트 차단: 같은 사이트의 절대경로만 허용한다. */
function safeNext(value) {
  if (typeof value !== 'string') return '/';
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

/* ------------------------------------------------------------------ 핸들러 */

function handleHome(req, res, ctx) {
  const counts = db.boardPostCounts();
  const boardsWithCounts = ctx.boards.map((b) => ({ ...b, count: counts.get(b.id) ?? 0 }));
  html(res, 200, views.homePage(ctx, {
    boardsWithCounts,
    recent: db.recentPosts(RECENT_ON_HOME),
  }));
}

function handleBoard(req, res, ctx, [slug]) {
  const board = db.boardBySlug(slug);
  if (!board) return fail(res, ctx, 404, '없는 게시판입니다.');

  ctx.activeBoard = board.slug;
  const total = db.countPostsInBoard(board.id);
  const pages = totalPages(total);
  const page = Math.min(pageNumber(ctx.url), pages);

  html(res, 200, views.boardPage(ctx, {
    board,
    posts: db.postsInBoard(board.id, (page - 1) * PAGE_SIZE, PAGE_SIZE),
    page,
    totalPages: pages,
    total,
  }));
}

function handleWriteForm(req, res, ctx, [slug]) {
  if (!requireUser(res, ctx)) return;
  const board = db.boardBySlug(slug);
  if (!board) return fail(res, ctx, 404, '없는 게시판입니다.');

  ctx.activeBoard = board.slug;
  html(res, 200, views.postFormPage(ctx, {
    board, post: null, action: `/b/${encodeURIComponent(board.slug)}/write`, heading: '새 글',
  }));
}

async function handleCreatePost(req, res, ctx, [slug]) {
  const form = await guardedForm(req, res, ctx);
  if (!form) return;

  const board = db.boardBySlug(slug);
  if (!board) return fail(res, ctx, 404, '없는 게시판입니다.');

  const title = (form.get('title') || '').trim();
  const body = (form.get('body') || '').trim();
  ctx.activeBoard = board.slug;

  const problem = validatePost(title, body);
  if (problem) {
    ctx.error = problem;
    return html(res, 400, views.postFormPage(ctx, {
      board, post: { title, body }, action: `/b/${encodeURIComponent(board.slug)}/write`, heading: '새 글',
    }));
  }

  const id = db.createPost(board.id, ctx.user.id, title, body);
  redirect(res, `/p/${id}?m=post-created`);
}

function validatePost(title, body) {
  if (!title) return '제목을 입력하세요.';
  if (title.length > TITLE_MAX) return `제목은 ${TITLE_MAX}자 이내여야 합니다.`;
  if (!body) return '내용을 입력하세요.';
  if (body.length > BODY_MAX) return `내용은 ${BODY_MAX}자 이내여야 합니다.`;
  return null;
}

function handlePost(req, res, ctx, [rawId]) {
  const post = db.post(Number(rawId));
  if (!post) return fail(res, ctx, 404, '없는 글입니다.');

  db.bumpViews(post.id);
  ctx.activeBoard = post.board_slug;
  const canEdit = Boolean(ctx.user && (ctx.user.id === post.user_id || ctx.user.is_admin));

  html(res, 200, views.postPage(ctx, {
    post: { ...post, views: post.views + 1 },
    comments: db.commentsFor(post.id),
    canEdit,
  }));
}

function handleEditForm(req, res, ctx, [rawId]) {
  if (!requireUser(res, ctx)) return;
  const post = db.post(Number(rawId));
  if (!post) return fail(res, ctx, 404, '없는 글입니다.');
  if (ctx.user.id !== post.user_id && !ctx.user.is_admin) {
    return fail(res, ctx, 403, '이 글을 수정할 권한이 없습니다.');
  }

  ctx.activeBoard = post.board_slug;
  html(res, 200, views.postFormPage(ctx, {
    board: db.boardById(post.board_id),
    post,
    action: `/p/${post.id}/edit`,
    heading: '글 수정',
  }));
}

async function handleUpdatePost(req, res, ctx, [rawId]) {
  const form = await guardedForm(req, res, ctx);
  if (!form) return;

  const post = db.post(Number(rawId));
  if (!post) return fail(res, ctx, 404, '없는 글입니다.');
  if (ctx.user.id !== post.user_id && !ctx.user.is_admin) {
    return fail(res, ctx, 403, '이 글을 수정할 권한이 없습니다.');
  }

  const title = (form.get('title') || '').trim();
  const body = (form.get('body') || '').trim();
  const problem = validatePost(title, body);
  if (problem) {
    ctx.error = problem;
    ctx.activeBoard = post.board_slug;
    return html(res, 400, views.postFormPage(ctx, {
      board: db.boardById(post.board_id),
      post: { ...post, title, body },
      action: `/p/${post.id}/edit`,
      heading: '글 수정',
    }));
  }

  db.updatePost(post.id, title, body);
  redirect(res, `/p/${post.id}?m=post-updated`);
}

async function handleDeletePost(req, res, ctx, [rawId]) {
  const form = await guardedForm(req, res, ctx);
  if (!form) return;

  const post = db.post(Number(rawId));
  if (!post) return fail(res, ctx, 404, '없는 글입니다.');
  if (ctx.user.id !== post.user_id && !ctx.user.is_admin) {
    return fail(res, ctx, 403, '이 글을 삭제할 권한이 없습니다.');
  }

  db.deletePost(post.id);
  redirect(res, `/b/${encodeURIComponent(post.board_slug)}?m=post-deleted`);
}

async function handleCreateComment(req, res, ctx, [rawId]) {
  const form = await guardedForm(req, res, ctx);
  if (!form) return;

  const post = db.post(Number(rawId));
  if (!post) return fail(res, ctx, 404, '없는 글입니다.');

  const body = (form.get('body') || '').trim();
  if (!body || body.length > COMMENT_MAX) {
    return fail(res, ctx, 400, `댓글은 1~${COMMENT_MAX}자여야 합니다.`);
  }

  db.createComment(post.id, ctx.user.id, body);
  redirect(res, `/p/${post.id}?m=comment-created#comments`);
}

async function handleDeleteComment(req, res, ctx, [rawId]) {
  const form = await guardedForm(req, res, ctx);
  if (!form) return;

  const comment = db.comment(Number(rawId));
  if (!comment) return fail(res, ctx, 404, '없는 댓글입니다.');
  if (ctx.user.id !== comment.user_id && !ctx.user.is_admin) {
    return fail(res, ctx, 403, '이 댓글을 삭제할 권한이 없습니다.');
  }

  db.deleteComment(comment.id);
  redirect(res, `/p/${comment.post_id}?m=comment-deleted`);
}

function handleLoginForm(req, res, ctx) {
  if (ctx.user) return redirect(res, '/');
  html(res, 200, views.loginPage(ctx, { next: safeNext(ctx.url.searchParams.get('next')) }));
}

async function handleLogin(req, res, ctx) {
  const form = await readForm(req);
  const username = (form.get('username') || '').trim();
  const password = form.get('password') || '';
  const next = safeNext(form.get('next'));
  const addr = clientAddress(req, ctx.config.trustProxy);

  if (auth.loginBlocked(addr)) {
    ctx.error = '로그인 시도가 너무 많습니다. 15분 뒤에 다시 시도해 주세요.';
    return html(res, 429, views.loginPage(ctx, { next, username }));
  }

  const user = db.userByName(username);
  const ok = user
    ? await auth.verifyPassword(password, user.password_hash)
    : await auth.dummyVerify(password);
  if (!ok) {
    auth.noteLoginFailure(addr);
    ctx.error = '아이디 또는 비밀번호가 맞지 않습니다.';
    return html(res, 401, views.loginPage(ctx, { next, username }));
  }

  auth.clearLoginFailures(addr);
  const token = auth.startSession(user.id);
  redirect(res, appendFlash(next, 'logged-in'), {
    'Set-Cookie': cookie(SESSION_COOKIE, token, {
      maxAge: auth.SESSION_TTL, secure: ctx.config.secureCookies,
    }),
  });
}

function appendFlash(path, key) {
  return path + (path.includes('?') ? '&' : '?') + 'm=' + key;
}

function handleSignupForm(req, res, ctx) {
  if (ctx.user) return redirect(res, '/');
  html(res, 200, views.signupPage(ctx, {}));
}

async function handleSignup(req, res, ctx) {
  const form = await readForm(req);
  const username = (form.get('username') || '').trim();
  const password = form.get('password') || '';
  let displayName = (form.get('display_name') || '').trim() || username;
  if (displayName.length > DISPLAY_NAME_MAX) displayName = displayName.slice(0, DISPLAY_NAME_MAX);

  const problem = auth.validateCredentials(username, password);
  if (problem) {
    ctx.error = problem;
    return html(res, 400, views.signupPage(ctx, { username, displayName }));
  }
  if (db.userByName(username)) {
    ctx.error = '이미 쓰이고 있는 아이디입니다.';
    return html(res, 409, views.signupPage(ctx, { username, displayName }));
  }

  // 첫 가입자가 관리자가 된다 (설치 직후 게시판을 만들 수 있게)
  const isAdmin = db.userCount() === 0 ? 1 : 0;
  const hash = await auth.hashPassword(password);
  const id = db.createUser(username, displayName, hash, isAdmin);
  const token = auth.startSession(id);

  redirect(res, '/?m=welcome', {
    'Set-Cookie': cookie(SESSION_COOKIE, token, {
      maxAge: auth.SESSION_TTL, secure: ctx.config.secureCookies,
    }),
  });
}

async function handleLogout(req, res, ctx) {
  const form = await guardedForm(req, res, ctx);
  if (!form) return;

  auth.endSession(ctx.sessionToken);
  redirect(res, '/?m=logged-out', {
    'Set-Cookie': cookie(SESSION_COOKIE, '', { maxAge: 0, secure: ctx.config.secureCookies }),
  });
}

function handleSearch(req, res, ctx) {
  const query = (ctx.url.searchParams.get('q') || '').trim().slice(0, 80);
  ctx.searchQuery = query;

  if (!query) {
    return html(res, 200, views.searchPage(ctx, {
      query, posts: [], page: 1, totalPages: 1, total: 0,
    }));
  }

  const total = db.countSearchPosts(query);
  const pages = totalPages(total);
  const page = Math.min(pageNumber(ctx.url), pages);

  html(res, 200, views.searchPage(ctx, {
    query,
    posts: db.searchPosts(query, (page - 1) * PAGE_SIZE, PAGE_SIZE),
    page,
    totalPages: pages,
    total,
  }));
}

function handleUser(req, res, ctx, [username]) {
  const profile = db.userByName(username);
  if (!profile) return fail(res, ctx, 404, '없는 사용자입니다.');

  const total = db.countPostsByUser(profile.id);
  const pages = totalPages(total);
  const page = Math.min(pageNumber(ctx.url), pages);

  html(res, 200, views.userPage(ctx, {
    profile,
    posts: db.postsByUser(profile.id, (page - 1) * PAGE_SIZE, PAGE_SIZE),
    page,
    totalPages: pages,
    total,
  }));
}

function handleAdminBoards(req, res, ctx) {
  if (!requireUser(res, ctx)) return;
  if (!ctx.user.is_admin) return fail(res, ctx, 403, '관리자만 볼 수 있습니다.');

  const counts = db.boardPostCounts();
  html(res, 200, views.adminBoardsPage(ctx, {
    boardsWithCounts: ctx.boards.map((b) => ({ ...b, count: counts.get(b.id) ?? 0 })),
  }));
}

async function handleCreateBoard(req, res, ctx) {
  const form = await guardedForm(req, res, ctx);
  if (!form) return;
  if (!ctx.user.is_admin) return fail(res, ctx, 403, '관리자만 할 수 있습니다.');

  const slug = (form.get('slug') || '').trim().toLowerCase();
  const name = (form.get('name') || '').trim();
  const description = (form.get('description') || '').trim().slice(0, 120);
  const position = Number(form.get('position'));

  if (!/^[a-z0-9-]{1,30}$/.test(slug)) {
    return fail(res, ctx, 400, '주소(slug)는 영소문자/숫자/- 로 1~30자여야 합니다.');
  }
  if (!name || name.length > 30) {
    return fail(res, ctx, 400, '이름은 1~30자여야 합니다.');
  }
  if (db.boardBySlug(slug)) {
    return fail(res, ctx, 409, '이미 있는 주소입니다.');
  }

  db.createBoard(slug, name, description, Number.isInteger(position) ? position : 100);
  redirect(res, '/admin/boards?m=board-created');
}

/* ------------------------------------------------------------------ 라우팅 */

const ROUTES = [
  ['GET',  /^\/$/,                          handleHome],
  ['GET',  /^\/b\/([\w-]{1,30})$/,          handleBoard],
  ['GET',  /^\/b\/([\w-]{1,30})\/write$/,   handleWriteForm],
  ['POST', /^\/b\/([\w-]{1,30})\/write$/,   handleCreatePost],
  ['GET',  /^\/p\/(\d{1,12})$/,             handlePost],
  ['GET',  /^\/p\/(\d{1,12})\/edit$/,       handleEditForm],
  ['POST', /^\/p\/(\d{1,12})\/edit$/,       handleUpdatePost],
  ['POST', /^\/p\/(\d{1,12})\/delete$/,     handleDeletePost],
  ['POST', /^\/p\/(\d{1,12})\/comment$/,    handleCreateComment],
  ['POST', /^\/c\/(\d{1,12})\/delete$/,     handleDeleteComment],
  ['GET',  /^\/login$/,                     handleLoginForm],
  ['POST', /^\/login$/,                     handleLogin],
  ['GET',  /^\/signup$/,                    handleSignupForm],
  ['POST', /^\/signup$/,                    handleSignup],
  ['POST', /^\/logout$/,                    handleLogout],
  ['GET',  /^\/search$/,                    handleSearch],
  ['GET',  /^\/u\/([\w-]{1,20})$/,          handleUser],
  ['GET',  /^\/admin\/boards$/,             handleAdminBoards],
  ['POST', /^\/admin\/boards$/,             handleCreateBoard],
];

export function createApp(config) {
  return async function handle(req, res) {
    const method = req.method === 'HEAD' ? 'GET' : req.method;
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      return text(res, 400, '잘못된 요청입니다.');
    }

    if (url.pathname === '/healthz') return text(res, 200, 'ok');

    if (method === 'GET' && url.pathname.startsWith('/static/')) {
      const served = await serveStatic(req, res, PUBLIC_DIR, url.pathname.slice('/static/'.length));
      if (served) return;
      return text(res, 404, '없는 파일입니다.');
    }

    let ctx;
    try {
      ctx = buildContext(req, url, config);
    } catch (err) {
      console.error('context 생성 실패:', err);
      return text(res, 500, '서버 오류');
    }

    // 경로가 맞는 라우트를 먼저 모은 뒤에 방식을 본다.
    // (같은 경로에 GET/POST가 따로 있으므로 먼저 걸린 쪽으로 405를 내면 안 된다)
    let pathMatched = false;
    for (const [routeMethod, pattern, handler] of ROUTES) {
      const match = pattern.exec(url.pathname);
      if (!match) continue;
      pathMatched = true;
      if (routeMethod !== method) continue;
      try {
        return await handler(req, res, ctx, match.slice(1));
      } catch (err) {
        if (err && err.statusCode) {
          return fail(res, ctx, err.statusCode, err.message);
        }
        console.error(`${req.method} ${url.pathname} 처리 중 오류:`, err);
        return fail(res, ctx, 500, '서버에서 문제가 생겼습니다.');
      }
    }

    if (pathMatched) return fail(res, ctx, 405, '허용되지 않은 방식입니다.');
    fail(res, ctx, 404, '없는 주소입니다.');
  };
}

/* ------------------------------------------------------------------ 기동 */

export function start(config = loadConfig()) {
  db.open(config.dbPath);
  const server = createServer(createApp(config));
  server.listen(config.port, config.host, () => {
    console.log(`${config.siteName} 커뮤니티 → http://${config.host}:${config.port}`);
    console.log(`DB: ${config.dbPath}`);
  });

  const shutdown = (signal) => {
    console.log(`\n${signal} 수신, 종료합니다.`);
    server.close(() => { db.close(); process.exit(0); });
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) start();
