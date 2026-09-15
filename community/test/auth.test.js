/* 비밀번호 해시와 CSRF 토큰 단위 테스트. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as auth from '../lib/auth.js';

test('해시는 왕복하고 틀린 비밀번호는 거절한다', async () => {
  const stored = await auth.hashPassword('correct horse battery staple');
  assert.match(stored, /^scrypt\$16384\$8\$1\$/);
  assert.equal(await auth.verifyPassword('correct horse battery staple', stored), true);
  assert.equal(await auth.verifyPassword('correct horse battery stapl', stored), false);
});

test('같은 비밀번호라도 저장값은 매번 다르다 (salt)', async () => {
  const a = await auth.hashPassword('password123');
  const b = await auth.hashPassword('password123');
  assert.notEqual(a, b);
  assert.equal(await auth.verifyPassword('password123', a), true);
  assert.equal(await auth.verifyPassword('password123', b), true);
});

test('깨진 해시 문자열은 예외 없이 false', async () => {
  for (const broken of ['', 'garbage', 'scrypt$1$2$3', 'md5$1$2$3$4$5', null, undefined]) {
    assert.equal(await auth.verifyPassword('password123', broken), false);
  }
});

test('없는 아이디도 해시 검증만큼 시간을 쓴다', async () => {
  const started = Date.now();
  assert.equal(await auth.dummyVerify('password123'), false);
  assert.ok(Date.now() - started >= 10, '즉시 반환하면 아이디 존재 여부가 새어나간다');
});

test('CSRF 토큰은 세션마다 다르고 세션이 없으면 비어 있다', () => {
  const secret = Buffer.from('secret');
  assert.equal(auth.csrfToken('', secret), '');
  assert.notEqual(auth.csrfToken('session-a', secret), auth.csrfToken('session-b', secret));

  const token = auth.csrfToken('session-a', secret);
  assert.equal(auth.checkCsrf('session-a', secret, token), true);
  assert.equal(auth.checkCsrf('session-b', secret, token), false);
  assert.equal(auth.checkCsrf('session-a', secret, ''), false);
  assert.equal(auth.checkCsrf('', secret, token), false);
});

test('가입 입력 검증', () => {
  assert.equal(auth.validateCredentials('alice', 'password123'), null);
  assert.match(auth.validateCredentials('ab', 'password123'), /3~20자/);
  assert.match(auth.validateCredentials('1alice', 'password123'), /영문자로 시작/);
  assert.match(auth.validateCredentials('al ice', 'password123'), /영문자로 시작/);
  assert.match(auth.validateCredentials('alice', 'short'), /8자 이상/);
  assert.match(auth.validateCredentials('alice', 'x'.repeat(201)), /너무 깁니다/);
});
