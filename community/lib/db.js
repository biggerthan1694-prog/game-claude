/* SQLite 저장소 — 스키마와 질의를 한곳에 모았다.
 *
 * node:sqlite(내장)만 쓴다. npm 의존성이 없으므로 라즈베리파이든 VPS든
 * Node 22.5+ 만 있으면 `node server.js` 한 줄로 뜬다.
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  display_name  TEXT    NOT NULL,
  password_hash TEXT    NOT NULL,
  is_admin      INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS boards (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT    NOT NULL UNIQUE,
  name        TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  position    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS posts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id   INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  title      TEXT    NOT NULL,
  body       TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  views      INTEGER NOT NULL DEFAULT 0,
  is_deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_posts_board ON posts(board_id, is_deleted, id DESC);
CREATE INDEX IF NOT EXISTS idx_posts_user  ON posts(user_id, is_deleted, id DESC);

CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, id);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS login_attempts (
  addr TEXT    NOT NULL,
  ts   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attempts ON login_attempts(addr, ts);
`;

const DEFAULT_BOARDS = [
  ['notice',   '공지사항',      '운영 공지와 업데이트 소식',   10],
  ['free',     '자유게시판',    '주제 상관없이 자유롭게',      20],
  ['qna',      '질문과 답변',   '막히는 부분을 물어보세요',    30],
  ['showcase', '프로젝트 자랑', '직접 만든 것을 보여주세요',   40],
  ['tips',     '팁과 자료',     '설정법, 스크립트, 링크 모음', 50],
];

/* 글 목록/상세에서 매번 함께 끌어오는 컬럼 묶음 */
const POST_COLUMNS = `
  p.id, p.board_id, p.user_id, p.title, p.body, p.created_at, p.updated_at,
  p.views, u.username, u.display_name, b.slug AS board_slug, b.name AS board_name,
  (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.is_deleted = 0) AS comment_count
`;
const POST_FROM = `
  FROM posts p
  JOIN users  u ON u.id = p.user_id
  JOIN boards b ON b.id = p.board_id
`;

let db = null;

export function open(path) {
  const file = resolve(path);
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 15000');
  db.exec(SCHEMA);
  seedDefaultBoards();
  return db;
}

export function openMemory() {
  db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);
  seedDefaultBoards();
  return db;
}

export function close() {
  if (db) { db.close(); db = null; }
}

export function seedDefaultBoards() {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM boards').get();
  if (n > 0) return;
  const insert = db.prepare(
    'INSERT INTO boards (slug, name, description, position) VALUES (?, ?, ?, ?)');
  for (const b of DEFAULT_BOARDS) insert.run(...b);
}

export const now = () => Math.floor(Date.now() / 1000);

/* LIKE 패턴에 들어갈 사용자 입력에서 와일드카드를 죽인다 */
function likeTerm(term) {
  return '%' + term.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
}

/* ------------------------------------------------------------------ 게시판 */

export const boards = () =>
  db.prepare('SELECT * FROM boards ORDER BY position, id').all();

export const boardBySlug = (slug) =>
  db.prepare('SELECT * FROM boards WHERE slug = ?').get(slug);

export const boardById = (id) =>
  db.prepare('SELECT * FROM boards WHERE id = ?').get(id);

export function createBoard(slug, name, description, position) {
  const info = db.prepare(
    'INSERT INTO boards (slug, name, description, position) VALUES (?, ?, ?, ?)'
  ).run(slug, name, description, position);
  return Number(info.lastInsertRowid);
}

export function boardPostCounts() {
  const rows = db.prepare(
    'SELECT board_id, COUNT(*) AS n FROM posts WHERE is_deleted = 0 GROUP BY board_id'
  ).all();
  return new Map(rows.map((r) => [r.board_id, r.n]));
}

/* ------------------------------------------------------------------ 사용자 */

export const userByName = (username) =>
  db.prepare('SELECT * FROM users WHERE username = ?').get(username);

export const userById = (id) =>
  db.prepare('SELECT * FROM users WHERE id = ?').get(id);

export function createUser(username, displayName, passwordHash, isAdmin = 0) {
  const info = db.prepare(
    `INSERT INTO users (username, display_name, password_hash, is_admin, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(username, displayName, passwordHash, isAdmin ? 1 : 0, now());
  return Number(info.lastInsertRowid);
}

export const userCount = () =>
  db.prepare('SELECT COUNT(*) AS n FROM users').get().n;

export function setPassword(userId, passwordHash) {
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
}

/* ---------------------------------------------------------------------- 글 */

export function createPost(boardId, userId, title, body) {
  const ts = now();
  const info = db.prepare(
    `INSERT INTO posts (board_id, user_id, title, body, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(boardId, userId, title, body, ts, ts);
  return Number(info.lastInsertRowid);
}

export const post = (id) =>
  db.prepare(
    `SELECT ${POST_COLUMNS} ${POST_FROM} WHERE p.id = ? AND p.is_deleted = 0`
  ).get(id);

export function updatePost(id, title, body) {
  db.prepare('UPDATE posts SET title = ?, body = ?, updated_at = ? WHERE id = ?')
    .run(title, body, now(), id);
}

export function deletePost(id) {
  db.prepare('UPDATE posts SET is_deleted = 1 WHERE id = ?').run(id);
}

export function bumpViews(id) {
  db.prepare('UPDATE posts SET views = views + 1 WHERE id = ?').run(id);
}

export const postsInBoard = (boardId, offset, limit) =>
  db.prepare(
    `SELECT ${POST_COLUMNS} ${POST_FROM}
     WHERE p.board_id = ? AND p.is_deleted = 0
     ORDER BY p.id DESC LIMIT ? OFFSET ?`
  ).all(boardId, limit, offset);

export const countPostsInBoard = (boardId) =>
  db.prepare('SELECT COUNT(*) AS n FROM posts WHERE board_id = ? AND is_deleted = 0')
    .get(boardId).n;

export const recentPosts = (limit) =>
  db.prepare(
    `SELECT ${POST_COLUMNS} ${POST_FROM} WHERE p.is_deleted = 0 ORDER BY p.id DESC LIMIT ?`
  ).all(limit);

export const postsByUser = (userId, offset, limit) =>
  db.prepare(
    `SELECT ${POST_COLUMNS} ${POST_FROM}
     WHERE p.user_id = ? AND p.is_deleted = 0
     ORDER BY p.id DESC LIMIT ? OFFSET ?`
  ).all(userId, limit, offset);

export const countPostsByUser = (userId) =>
  db.prepare('SELECT COUNT(*) AS n FROM posts WHERE user_id = ? AND is_deleted = 0')
    .get(userId).n;

export const searchPosts = (term, offset, limit) => {
  const like = likeTerm(term);
  return db.prepare(
    `SELECT ${POST_COLUMNS} ${POST_FROM}
     WHERE p.is_deleted = 0
       AND (p.title LIKE ? ESCAPE '\\' OR p.body LIKE ? ESCAPE '\\')
     ORDER BY p.id DESC LIMIT ? OFFSET ?`
  ).all(like, like, limit, offset);
};

export const countSearchPosts = (term) => {
  const like = likeTerm(term);
  return db.prepare(
    `SELECT COUNT(*) AS n FROM posts
     WHERE is_deleted = 0 AND (title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\')`
  ).get(like, like).n;
};

/* -------------------------------------------------------------------- 댓글 */

export function createComment(postId, userId, body) {
  const info = db.prepare(
    'INSERT INTO comments (post_id, user_id, body, created_at) VALUES (?, ?, ?, ?)'
  ).run(postId, userId, body, now());
  return Number(info.lastInsertRowid);
}

export const commentsFor = (postId) =>
  db.prepare(
    `SELECT c.id, c.post_id, c.user_id, c.body, c.created_at, u.username, u.display_name
     FROM comments c JOIN users u ON u.id = c.user_id
     WHERE c.post_id = ? AND c.is_deleted = 0 ORDER BY c.id`
  ).all(postId);

export const comment = (id) =>
  db.prepare('SELECT * FROM comments WHERE id = ? AND is_deleted = 0').get(id);

export function deleteComment(id) {
  db.prepare('UPDATE comments SET is_deleted = 1 WHERE id = ?').run(id);
}

/* ------------------------------------------------------------- 세션/로그인 */

export function insertSession(tokenHash, userId, ttlSeconds) {
  const ts = now();
  db.prepare(
    'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).run(tokenHash, userId, ts, ts + ttlSeconds);
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(ts);
}

export const userBySessionHash = (tokenHash) =>
  db.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`
  ).get(tokenHash, now());

export function deleteSession(tokenHash) {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
}

export function deleteSessionsForUser(userId) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function noteLoginFailure(addr, windowSeconds) {
  db.prepare('INSERT INTO login_attempts (addr, ts) VALUES (?, ?)').run(addr, now());
  db.prepare('DELETE FROM login_attempts WHERE ts < ?').run(now() - windowSeconds);
}

export function clearLoginFailures(addr) {
  db.prepare('DELETE FROM login_attempts WHERE addr = ?').run(addr);
}

export const countLoginFailures = (addr, windowSeconds) =>
  db.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE addr = ? AND ts > ?')
    .get(addr, now() - windowSeconds).n;
