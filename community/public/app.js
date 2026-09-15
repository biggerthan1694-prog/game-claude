/* 진행형 향상 — 자바스크립트가 꺼져 있어도 모든 기능은 동작한다. */

/* data-confirm이 붙은 폼은 제출 전에 한 번 묻는다 (삭제류) */
document.addEventListener('submit', (event) => {
  const message = event.target.dataset?.confirm;
  if (message && !window.confirm(message)) event.preventDefault();
});

/* 글쓰기 textarea에서 Ctrl/Cmd+Enter 로 제출 */
document.addEventListener('keydown', (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.key !== 'Enter') return;
  const field = event.target;
  if (field.tagName !== 'TEXTAREA') return;
  field.form?.requestSubmit();
});
