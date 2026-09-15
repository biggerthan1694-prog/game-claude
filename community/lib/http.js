/* HTTP 잡일 — 쿠키/폼 파싱, 응답 헬퍼, 정적 파일 서빙. */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';

export const MAX_BODY_BYTES = 256 * 1024;   // 폼 본문 상한

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': [
    "default-src 'self'",
    "img-src 'self' data:",
    "style-src 'self'",
    "script-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
  ].join('; '),
};

/* ------------------------------------------------------------------ 요청 */

export function parseCookies(header) {
  const out = new Map();
  if (!header) return out;
  for (const piece of header.split(';')) {
    const eq = piece.indexOf('=');
    if (eq < 0) continue;
    const name = piece.slice(0, eq).trim();
    if (!name) continue;
    let value = piece.slice(eq + 1).trim();
    try { value = decodeURIComponent(value); } catch { /* 깨진 쿠키는 원문대로 */ }
    out.set(name, value);
  }
  return out;
}

/** 폼 본문을 URLSearchParams로. 상한을 넘으면 413으로 끊는다. */
export function readForm(req) {
  return new Promise((resolve, reject) => {
    const type = (req.headers['content-type'] || '').split(';')[0].trim();
    if (type !== 'application/x-www-form-urlencoded') {
      const err = new Error('지원하지 않는 형식입니다.');
      err.statusCode = 415;
      return reject(err);
    }
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        const err = new Error('본문이 너무 큽니다.');
        err.statusCode = 413;
        req.destroy();
        return reject(err);
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(new URLSearchParams(Buffer.concat(chunks).toString('utf8')));
      } catch (err) {
        err.statusCode = 400;
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

/** 프록시 뒤라면 X-Forwarded-For의 첫 주소를, 아니면 소켓 주소를 쓴다. */
export function clientAddress(req, trustProxy) {
  if (trustProxy) {
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd.length > 0) {
      const first = fwd.split(',')[0].trim();
      if (first) return first;
    }
  }
  return req.socket.remoteAddress || 'unknown';
}

/* ------------------------------------------------------------------ 응답 */

export function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' ? Buffer.from(body, 'utf8') : body;
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Length': payload ? payload.length : 0,
    ...headers,
  });
  if (res.req && res.req.method === 'HEAD') return res.end();
  res.end(payload);
}

export const html = (res, status, markup, headers = {}) =>
  send(res, status, markup, { 'Content-Type': 'text/html; charset=utf-8', ...headers });

export const text = (res, status, message, headers = {}) =>
  send(res, status, message, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });

export const redirect = (res, location, headers = {}) =>
  send(res, 303, '', { Location: location, ...headers });

export function cookie(name, value, { maxAge, secure, httpOnly = true, sameSite = 'Lax' } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', `SameSite=${sameSite}`];
  if (httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');
  if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
  return parts.join('; ');
}

/* ------------------------------------------------------------ 정적 파일 */

const MIME = new Map(Object.entries({
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
}));

/**
 * publicDir 밖으로 새지 않도록 정규화한 뒤에만 연다.
 * 성공하면 true, 파일이 없거나 경로가 수상하면 false.
 */
export async function serveStatic(req, res, publicDir, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return false;
  }
  if (decoded.includes('\0')) return false;

  const relative = normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = join(publicDir, relative);
  if (filePath !== publicDir && !filePath.startsWith(publicDir + sep)) return false;

  let info;
  try {
    info = await stat(filePath);
  } catch {
    return false;
  }
  if (!info.isFile()) return false;

  const etag = `W/"${info.size}-${Math.floor(info.mtimeMs)}"`;
  const headers = {
    ...SECURITY_HEADERS,
    'Content-Type': MIME.get(extname(filePath).toLowerCase()) || 'application/octet-stream',
    'Cache-Control': 'public, max-age=3600',
    ETag: etag,
  };

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    res.end();
    return true;
  }

  headers['Content-Length'] = info.size;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
    return true;
  }
  createReadStream(filePath).pipe(res);
  return true;
}
