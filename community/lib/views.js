/* HTML 렌더링.
 *
 * 규칙 하나: 사용자 입력은 예외 없이 escape()를 거친 뒤에만 문자열에 들어간다.
 * 본문 서식(코드블록/링크/줄바꿈)도 escape 이후에 붙인다.
 */

export function escape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/* ------------------------------------------------------------------ 시간 */

const KST = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
});

export function formatTime(epochSeconds) {
  return KST.format(new Date(epochSeconds * 1000));
}

/** 하루 안쪽이면 "3분 전", 그 밖은 절대 시각. */
export function relativeTime(epochSeconds) {
  const diff = Math.floor(Date.now() / 1000) - epochSeconds;
  if (diff < 60) return '방금';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return formatTime(epochSeconds);
}

/* ------------------------------------------------------------- 본문 서식 */

function autolink(escaped) {
  return escaped.replace(/https?:\/\/[^\s<]+/g, (match) => {
    // 문장 끝 문장부호는 링크에서 떼어낸다
    const trimmed = match.replace(/[.,;:!?)\]}]+$/, '');
    const tail = match.slice(trimmed.length);
    return `<a href="${trimmed}" rel="noopener nofollow ugc" target="_blank">${trimmed}</a>${tail}`;
  });
}

/** escape → 코드블록 → 인라인코드 → 링크 → 줄바꿈 순서로 처리한다. */
export function renderBody(raw) {
  const segments = escape(raw).split('```');
  return segments
    .map((segment, index) => {
      if (index % 2 === 1) {
        return `<pre class="code"><code>${segment.replace(/^\n/, '').replace(/\n$/, '')}</code></pre>`;
      }
      // 코드블록에 붙은 줄바꿈까지 <br>로 만들면 위아래로 빈 줄이 생긴다
      let text = segment;
      if (index > 0) text = text.replace(/^\n/, '');
      if (index < segments.length - 1) text = text.replace(/\n$/, '');
      return inlineFormat(text);
    })
    .join('');
}

/** 인라인 코드(`...`)는 링크 변환에서 빼고 글자 그대로 보여준다. */
function inlineFormat(text) {
  return text
    .split(/(`[^`\n]+`)/g)
    .map((chunk) =>
      chunk.length > 2 && chunk.startsWith('`') && chunk.endsWith('`')
        ? `<code class="inline">${chunk.slice(1, -1)}</code>`
        : autolink(chunk).replaceAll('\n', '<br>'))
    .join('');
}

export function excerpt(raw, limit = 120) {
  const flat = String(raw ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > limit ? flat.slice(0, limit) + '…' : flat;
}

/* ------------------------------------------------------------------ 레이아웃 */

function nav(ctx) {
  const boardLinks = ctx.boards
    .map((b) => `<a href="/b/${escape(b.slug)}"${ctx.activeBoard === b.slug ? ' class="on"' : ''}>${escape(b.name)}</a>`)
    .join('');

  const account = ctx.user
    ? `<span class="who"><a href="/u/${escape(ctx.user.username)}">${escape(ctx.user.display_name)}</a></span>
       ${ctx.user.is_admin ? '<a href="/admin/boards">관리</a>' : ''}
       <form method="post" action="/logout" class="inline">
         <input type="hidden" name="csrf" value="${escape(ctx.csrf)}">
         <button type="submit" class="linkish">로그아웃</button>
       </form>`
    : `<a href="/login">로그인</a><a href="/signup" class="cta">가입</a>`;

  return `
<header class="top">
  <div class="wrap">
    <a href="/" class="brand">${escape(ctx.siteName)}</a>
    <nav class="boards">${boardLinks}</nav>
    <form method="get" action="/search" class="search" role="search">
      <input type="search" name="q" placeholder="검색" value="${escape(ctx.searchQuery || '')}" maxlength="80" aria-label="검색어">
    </form>
    <div class="account">${account}</div>
  </div>
</header>`;
}

export function layout(ctx, { title, body }) {
  const pageTitle = title ? `${escape(title)} · ${escape(ctx.siteName)}` : escape(ctx.siteName);
  const notice = ctx.notice
    ? `<p class="flash ok">${escape(ctx.notice)}</p>`
    : '';
  const error = ctx.error
    ? `<p class="flash bad">${escape(ctx.error)}</p>`
    : '';
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${pageTitle}</title>
<link rel="stylesheet" href="/static/style.css">
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
</head>
<body>
${nav(ctx)}
<main class="wrap">
${error}${notice}
${body}
</main>
<footer class="foot"><div class="wrap">${escape(ctx.siteName)} 커뮤니티</div></footer>
<script src="/static/app.js" defer></script>
</body>
</html>`;
}

/* -------------------------------------------------------------- 공용 조각 */

function postRow(p) {
  const comments = p.comment_count > 0
    ? `<span class="cnt">${p.comment_count}</span>`
    : '';
  return `
<li class="row">
  <a class="row-main" href="/p/${p.id}">
    <span class="row-title">${escape(p.title)}${comments}</span>
    <span class="row-sub">${escape(p.board_name)} · ${escape(p.display_name)} · ${escape(relativeTime(p.created_at))}</span>
  </a>
</li>`;
}

export function pagination(baseUrl, page, totalPages) {
  if (totalPages <= 1) return '';
  const join = baseUrl.includes('?') ? '&' : '?';
  const link = (n, label, disabled) =>
    disabled
      ? `<span class="pg off">${escape(label)}</span>`
      : `<a class="pg" href="${escape(baseUrl + join + 'page=' + n)}">${escape(label)}</a>`;

  const windowed = [];
  for (let n = Math.max(1, page - 2); n <= Math.min(totalPages, page + 2); n++) {
    windowed.push(n === page
      ? `<span class="pg now">${n}</span>`
      : `<a class="pg" href="${escape(baseUrl + join + 'page=' + n)}">${n}</a>`);
  }

  return `<nav class="pages">
    ${link(page - 1, '이전', page <= 1)}
    ${windowed.join('')}
    ${link(page + 1, '다음', page >= totalPages)}
  </nav>`;
}

function emptyState(message) {
  return `<p class="empty">${escape(message)}</p>`;
}

/* ------------------------------------------------------------------ 페이지 */

export function homePage(ctx, { boardsWithCounts, recent }) {
  const cards = boardsWithCounts.map((b) => `
    <a class="card" href="/b/${escape(b.slug)}">
      <span class="card-name">${escape(b.name)}</span>
      <span class="card-desc">${escape(b.description)}</span>
      <span class="card-count">글 ${b.count}</span>
    </a>`).join('');

  const list = recent.length
    ? `<ul class="rows">${recent.map(postRow).join('')}</ul>`
    : emptyState('아직 글이 없습니다. 첫 글을 남겨보세요.');

  return layout(ctx, {
    title: null,
    body: `
<section class="cards">${cards}</section>
<section>
  <h2 class="sec">최근 글</h2>
  ${list}
</section>`,
  });
}

export function boardPage(ctx, { board, posts, page, totalPages, total }) {
  const list = posts.length
    ? `<ul class="rows">${posts.map(postRow).join('')}</ul>`
    : emptyState('이 게시판에는 아직 글이 없습니다.');

  const writeButton = ctx.user
    ? `<a class="btn" href="/b/${escape(board.slug)}/write">글쓰기</a>`
    : `<a class="btn" href="/login?next=${encodeURIComponent('/b/' + board.slug + '/write')}">로그인하고 쓰기</a>`;

  return layout(ctx, {
    title: board.name,
    body: `
<div class="head">
  <div>
    <h1>${escape(board.name)}</h1>
    <p class="desc">${escape(board.description)} <span class="muted">· 글 ${total}</span></p>
  </div>
  ${writeButton}
</div>
${list}
${pagination('/b/' + encodeURIComponent(board.slug), page, totalPages)}`,
  });
}

export function postPage(ctx, { post, comments, canEdit }) {
  const edited = post.updated_at > post.created_at
    ? ` <span class="muted">(수정됨 ${escape(formatTime(post.updated_at))})</span>`
    : '';

  const controls = canEdit ? `
<div class="controls">
  <a class="btn ghost" href="/p/${post.id}/edit">수정</a>
  <form method="post" action="/p/${post.id}/delete" class="inline" data-confirm="이 글을 삭제할까요?">
    <input type="hidden" name="csrf" value="${escape(ctx.csrf)}">
    <button type="submit" class="btn ghost danger">삭제</button>
  </form>
</div>` : '';

  const commentItems = comments.map((c) => {
    const mine = ctx.user && (ctx.user.id === c.user_id || ctx.user.is_admin);
    const del = mine ? `
      <form method="post" action="/c/${c.id}/delete" class="inline" data-confirm="댓글을 삭제할까요?">
        <input type="hidden" name="csrf" value="${escape(ctx.csrf)}">
        <button type="submit" class="linkish danger">삭제</button>
      </form>` : '';
    return `
<li class="comment">
  <div class="comment-meta">
    <a href="/u/${escape(c.username)}">${escape(c.display_name)}</a>
    <span class="muted">${escape(relativeTime(c.created_at))}</span>
    ${del}
  </div>
  <div class="comment-body">${renderBody(c.body)}</div>
</li>`;
  }).join('');

  const commentForm = ctx.user ? `
<form method="post" action="/p/${post.id}/comment" class="stack">
  <input type="hidden" name="csrf" value="${escape(ctx.csrf)}">
  <textarea name="body" rows="3" maxlength="5000" placeholder="댓글을 남겨보세요" required></textarea>
  <div class="right"><button type="submit" class="btn">댓글 등록</button></div>
</form>` : `<p class="empty"><a href="/login?next=${encodeURIComponent('/p/' + post.id)}">로그인</a> 후 댓글을 쓸 수 있습니다.</p>`;

  return layout(ctx, {
    title: post.title,
    body: `
<article class="post">
  <p class="crumb"><a href="/b/${escape(post.board_slug)}">${escape(post.board_name)}</a></p>
  <h1>${escape(post.title)}</h1>
  <p class="meta">
    <a href="/u/${escape(post.username)}">${escape(post.display_name)}</a>
    · ${escape(formatTime(post.created_at))}${edited}
    · 조회 ${post.views}
  </p>
  <div class="body">${renderBody(post.body)}</div>
  ${controls}
</article>

<section class="comments">
  <h2 class="sec">댓글 ${comments.length}</h2>
  ${comments.length ? `<ul class="comment-list">${commentItems}</ul>` : emptyState('첫 댓글을 남겨보세요.')}
  ${commentForm}
</section>`,
  });
}

export function postFormPage(ctx, { board, post, action, heading }) {
  return layout(ctx, {
    title: heading,
    body: `
<h1>${escape(heading)}</h1>
<p class="desc">${escape(board.name)}</p>
<form method="post" action="${escape(action)}" class="stack">
  <input type="hidden" name="csrf" value="${escape(ctx.csrf)}">
  <label>제목
    <input type="text" name="title" maxlength="150" required value="${escape(post?.title ?? '')}">
  </label>
  <label>내용
    <textarea name="body" rows="16" maxlength="40000" required>${escape(post?.body ?? '')}</textarea>
  </label>
  <p class="hint">코드는 백틱 세 개(\`\`\`)로 감싸면 그대로 보입니다.</p>
  <div class="right">
    <a class="btn ghost" href="${post ? '/p/' + post.id : '/b/' + escape(board.slug)}">취소</a>
    <button type="submit" class="btn">저장</button>
  </div>
</form>`,
  });
}

export function loginPage(ctx, { next, username }) {
  return layout(ctx, {
    title: '로그인',
    body: `
<div class="narrow">
  <h1>로그인</h1>
  <form method="post" action="/login" class="stack">
    <input type="hidden" name="next" value="${escape(next || '')}">
    <label>아이디
      <input type="text" name="username" autocomplete="username" required maxlength="20" value="${escape(username || '')}">
    </label>
    <label>비밀번호
      <input type="password" name="password" autocomplete="current-password" required maxlength="200">
    </label>
    <button type="submit" class="btn full">로그인</button>
  </form>
  <p class="hint">계정이 없으신가요? <a href="/signup">가입하기</a></p>
</div>`,
  });
}

export function signupPage(ctx, { username, displayName }) {
  return layout(ctx, {
    title: '가입',
    body: `
<div class="narrow">
  <h1>가입</h1>
  <form method="post" action="/signup" class="stack">
    <label>아이디
      <input type="text" name="username" autocomplete="username" required minlength="3" maxlength="20" value="${escape(username || '')}">
    </label>
    <label>표시 이름
      <input type="text" name="display_name" autocomplete="nickname" maxlength="30" value="${escape(displayName || '')}" placeholder="비워두면 아이디를 씁니다">
    </label>
    <label>비밀번호
      <input type="password" name="password" autocomplete="new-password" required minlength="8" maxlength="200">
    </label>
    <button type="submit" class="btn full">가입</button>
  </form>
  <p class="hint">이미 계정이 있으신가요? <a href="/login">로그인</a></p>
</div>`,
  });
}

export function userPage(ctx, { profile, posts, page, totalPages, total }) {
  const list = posts.length
    ? `<ul class="rows">${posts.map(postRow).join('')}</ul>`
    : emptyState('아직 쓴 글이 없습니다.');
  return layout(ctx, {
    title: profile.display_name,
    body: `
<div class="head">
  <div>
    <h1>${escape(profile.display_name)}</h1>
    <p class="desc">@${escape(profile.username)} · 가입 ${escape(formatTime(profile.created_at))} · 글 ${total}</p>
  </div>
</div>
${list}
${pagination('/u/' + encodeURIComponent(profile.username), page, totalPages)}`,
  });
}

export function searchPage(ctx, { query, posts, page, totalPages, total }) {
  const list = posts.length
    ? `<ul class="rows">${posts.map(postRow).join('')}</ul>`
    : emptyState(query ? '검색 결과가 없습니다.' : '검색어를 입력하세요.');
  return layout(ctx, {
    title: `검색: ${query}`,
    body: `
<h1>검색</h1>
<p class="desc">${escape(query)} — ${total}건</p>
${list}
${pagination('/search?q=' + encodeURIComponent(query), page, totalPages)}`,
  });
}

export function adminBoardsPage(ctx, { boardsWithCounts }) {
  const rows = boardsWithCounts.map((b) => `
    <li class="row">
      <span class="row-main">
        <span class="row-title">${escape(b.name)}</span>
        <span class="row-sub">/b/${escape(b.slug)} · 글 ${b.count} · 순서 ${b.position}</span>
      </span>
    </li>`).join('');

  return layout(ctx, {
    title: '게시판 관리',
    body: `
<h1>게시판 관리</h1>
<ul class="rows">${rows}</ul>
<h2 class="sec">새 게시판</h2>
<form method="post" action="/admin/boards" class="stack">
  <input type="hidden" name="csrf" value="${escape(ctx.csrf)}">
  <label>주소 (slug)
    <input type="text" name="slug" required maxlength="30" pattern="[a-z0-9-]+" placeholder="hardware">
  </label>
  <label>이름
    <input type="text" name="name" required maxlength="30" placeholder="하드웨어">
  </label>
  <label>설명
    <input type="text" name="description" maxlength="120">
  </label>
  <label>정렬 순서
    <input type="number" name="position" value="60" min="0" max="9999">
  </label>
  <div class="right"><button type="submit" class="btn">만들기</button></div>
</form>`,
  });
}

export function errorPage(ctx, { status, message }) {
  return layout(ctx, {
    title: String(status),
    body: `
<div class="narrow center">
  <h1 class="big">${status}</h1>
  <p class="desc">${escape(message)}</p>
  <p><a class="btn" href="/">홈으로</a></p>
</div>`,
  });
}
