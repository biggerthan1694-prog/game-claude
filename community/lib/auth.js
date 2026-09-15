/* 인증 — 비밀번호 해시, 세션, CSRF 토큰, 로그인 시도 제한.
 *
 * 비밀번호는 scrypt로 저장한다. 세션 토큰은 평문을 쿠키로만 주고 DB에는
 * SHA-256 해시만 남긴다 — DB가 통째로 새도 토큰을 복원하지 못하게.
 */

import { randomBytes, scrypt, createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

import * as db from './db.js';

const scryptAsync = promisify(scrypt);

/* 라즈베리파이 같은 저전력 기기에서도 로그인이 체감될 만큼 느려지지 않는 선 */
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

export const SESSION_TTL = 60 * 60 * 24 * 14;   // 2주
export const LOGIN_WINDOW = 15 * 60;            // 15분
export const LOGIN_MAX_ATTEMPTS = 10;

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

const b64 = (buf) => buf.toString('base64url');

/* ---------------------------------------------------------------- 비밀번호 */

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT.keylen, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${b64(salt)}$${b64(key)}`;
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const N = Number(parts[1]), r = Number(parts[2]), p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  let salt, expected;
  try {
    salt = Buffer.from(parts[4], 'base64url');
    expected = Buffer.from(parts[5], 'base64url');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  let actual;
  try {
    // maxmem을 넉넉히 줘야 저장된 N이 기본값보다 클 때도 검증이 된다
    actual = await scryptAsync(password, salt, expected.length,
      { N, r, p, maxmem: 256 * 1024 * 1024 });
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/* 없는 아이디로 로그인해도 같은 시간을 쓰게 한다.
 * 그러지 않으면 응답 속도만 재도 어떤 아이디가 존재하는지 알아낼 수 있다. */
const DUMMY_HASH =
  'scrypt' + [SCRYPT.N, SCRYPT.r, SCRYPT.p, 'A'.repeat(22), 'A'.repeat(43)]
    .map((part) => '$' + part).join('');

export async function dummyVerify(password) {
  await verifyPassword(password, DUMMY_HASH);
  return false;
}

/** 가입 입력 검증. 문제가 있으면 한국어 메시지를, 없으면 null을 돌려준다. */
export function validateCredentials(username, password) {
  if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) {
    return `아이디는 ${USERNAME_MIN}~${USERNAME_MAX}자여야 합니다.`;
  }
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(username)) {
    return '아이디는 영문자로 시작하고 영문/숫자/_/- 만 쓸 수 있습니다.';
  }
  if (password.length < PASSWORD_MIN) {
    return `비밀번호는 ${PASSWORD_MIN}자 이상이어야 합니다.`;
  }
  if (password.length > PASSWORD_MAX) {
    return '비밀번호가 너무 깁니다.';
  }
  return null;
}

/* ------------------------------------------------------------------- 세션 */

const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

export function startSession(userId) {
  const token = b64(randomBytes(32));
  db.insertSession(tokenHash(token), userId, SESSION_TTL);
  return token;
}

export function sessionUser(token) {
  if (!token) return null;
  return db.userBySessionHash(tokenHash(token)) ?? null;
}

export function endSession(token) {
  if (token) db.deleteSession(tokenHash(token));
}

export function endAllSessions(userId) {
  db.deleteSessionsForUser(userId);
}

/* -------------------------------------------------------------------- CSRF */

/** 세션에 묶인 CSRF 토큰. 세션이 없으면 빈 문자열. */
export function csrfToken(sessionToken, secret) {
  if (!sessionToken) return '';
  return createHmac('sha256', secret).update('csrf:' + sessionToken).digest('hex');
}

export function checkCsrf(sessionToken, secret, submitted) {
  const expected = csrfToken(sessionToken, secret);
  if (!expected || !submitted) return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(submitted), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ------------------------------------------------------- 로그인 시도 제한 */

export const noteLoginFailure = (addr) => db.noteLoginFailure(addr, LOGIN_WINDOW);
export const clearLoginFailures = (addr) => db.clearLoginFailures(addr);
export const loginBlocked = (addr) =>
  db.countLoginFailures(addr, LOGIN_WINDOW) >= LOGIN_MAX_ATTEMPTS;
