/* eslint-disable no-undef */
'use strict';

/* ================================================================
 * 친절한 코드 에디터 — 화면(렌더러) 쪽 전체 로직
 * 탭 관리 · 탐색기 · 편집기 · 상태 표시줄 · 단축키
 * ================================================================ */

/* contextBridge 가 만든 window.api 는 전역의 고정 속성이라,
   같은 이름으로 전역 const 를 선언하면 SyntaxError 가 난다.
   전체를 즉시 실행 함수로 감싸 전역을 건드리지 않는다. */
(function () {
  'use strict';

const api = window.api;
const $ = (id) => document.getElementById(id);

const state = {
  settings: {},
  monaco: null,
  editor: null,
  folder: null,
  tabs: [],
  activeId: null,
  seq: 0,
  fileIndex: [],
  quick: { items: [], sel: 0 },
};

/* ---------------- 경로 도우미 (Windows \ 와 / 모두 대응) ---------------- */
const baseName = (p) => String(p).split(/[\\/]/).filter(Boolean).pop() || String(p);
const dirName = (p) => {
  const s = String(p);
  const i = Math.max(s.lastIndexOf('\\'), s.lastIndexOf('/'));
  return i <= 0 ? s : s.slice(0, i);
};
const extOf = (p) => {
  const b = baseName(p);
  const i = b.lastIndexOf('.');
  return i > 0 ? b.slice(i + 1).toLowerCase() : '';
};
const samePath = (a, b) => !!a && !!b && String(a).toLowerCase() === String(b).toLowerCase();

/* ---------------- 언어 / 아이콘 ---------------- */
const LANG_BY_EXT = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript', json: 'json', jsonc: 'json',
  html: 'html', htm: 'html', vue: 'html', css: 'css', scss: 'scss', less: 'less',
  md: 'markdown', markdown: 'markdown', py: 'python', java: 'java',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp', cs: 'csharp',
  go: 'go', rs: 'rust', php: 'php', rb: 'ruby', swift: 'swift', kt: 'kotlin',
  sh: 'shell', bash: 'shell', zsh: 'shell', bat: 'bat', cmd: 'bat', ps1: 'powershell',
  sql: 'sql', xml: 'xml', svg: 'xml', yml: 'yaml', yaml: 'yaml',
  ini: 'ini', cfg: 'ini', toml: 'ini', env: 'ini',
  txt: 'plaintext', log: 'plaintext',
};
const LANG_LABEL = {
  javascript: 'JavaScript', typescript: 'TypeScript', json: 'JSON', html: 'HTML',
  css: 'CSS', scss: 'SCSS', less: 'Less', markdown: 'Markdown', python: 'Python',
  java: 'Java', c: 'C', cpp: 'C++', csharp: 'C#', go: 'Go', rust: 'Rust',
  php: 'PHP', ruby: 'Ruby', shell: '셸 스크립트', bat: '배치 파일',
  powershell: 'PowerShell', sql: 'SQL', xml: 'XML', yaml: 'YAML', ini: 'INI',
  plaintext: '일반 텍스트',
};
const ICON_BY_LANG = {
  javascript: '🟨', typescript: '🟦', json: '🟫', html: '🟧', css: '🎨', scss: '🎨',
  markdown: '📝', python: '🐍', java: '☕', cpp: '⚙️', c: '⚙️', csharp: '⚙️',
  go: '🐹', rust: '🦀', php: '🐘', ruby: '💎', shell: '🐚', bat: '🖥️',
  powershell: '🖥️', sql: '🗄️', xml: '📰', yaml: '📋', ini: '🔧', plaintext: '📄',
};

function languageOf(filePath) {
  const name = baseName(filePath).toLowerCase();
  if (name === 'dockerfile') return 'dockerfile';
  if (name === 'makefile') return 'makefile';
  if (name.startsWith('.')) return LANG_BY_EXT[name.slice(1)] || 'plaintext';
  return LANG_BY_EXT[extOf(filePath)] || 'plaintext';
}
const iconOf = (filePath) => ICON_BY_LANG[languageOf(filePath)] || '📄';

/* ---------------- 알림 토스트 ---------------- */
function toast(message, kind = 'info', ms = 3200) {
  const el = document.createElement('div');
  el.className = `kc-toast kc-${kind}`;
  el.textContent = message;
  $('toastHost').appendChild(el);
  setTimeout(() => el.remove(), ms);
}

/* ---------------- 설정 ---------------- */
function setSetting(key, value) {
  state.settings[key] = value;
  api.settings.set(key, value);
}

function applyTheme() {
  const dark = state.settings.theme !== 'light';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('statusTheme').textContent = dark ? '🌙 어둡게' : '☀️ 밝게';
  if (state.monaco) state.monaco.editor.setTheme(dark ? 'vs-dark' : 'vs');
}

function applySidebar() {
  document.body.classList.toggle('kc-sidebar-hidden', state.settings.sidebarVisible === false);
}

function editorOptions() {
  return {
    fontSize: state.settings.fontSize || 14,
    tabSize: state.settings.tabSize || 2,
    wordWrap: state.settings.wordWrap ? 'on' : 'off',
    minimap: { enabled: state.settings.minimap !== false },
  };
}

/* ---------------- Monaco 불러오기 ---------------- */
function loadMonaco() {
  window.MonacoEnvironment = { getWorkerUrl: () => 'app://-/monaco-worker.js' };
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line no-undef
    require.config({ paths: { vs: 'app://-/monaco/vs' } });
    // eslint-disable-next-line no-undef
    require(['vs/editor/editor.main'], () => resolve(window.monaco), reject);
  });
}

function createEditor() {
  const monaco = state.monaco;
  state.editor = monaco.editor.create($('editor'), {
    theme: state.settings.theme === 'light' ? 'vs' : 'vs-dark',
    automaticLayout: true,
    fontFamily: "'Cascadia Mono', Consolas, 'D2Coding', 'Malgun Gothic', monospace",
    fontLigatures: true,
    ...editorOptions(),

    /* --- 자동 완성 관련 (VS Code 기본값에 맞춤) --- */
    quickSuggestions: { other: true, comments: false, strings: true },
    quickSuggestionsDelay: 10,
    suggestOnTriggerCharacters: true,
    acceptSuggestionOnEnter: 'on',
    tabCompletion: 'on',
    snippetSuggestions: 'inline', // VS Code 기본값: 스니펫을 일반 후보와 함께 순위 매김
    wordBasedSuggestions: 'allDocuments',
    suggestSelection: 'first',
    parameterHints: { enabled: true },
    suggest: {
      showIcons: true,
      showStatusBar: true,
      preview: true,
      insertMode: 'insert',
      localityBonus: true,
      shareSuggestSelections: true,
    },
    inlineSuggest: { enabled: true },
    hover: { enabled: true, delay: 250 },

    /* --- 편집 편의 --- */
    autoClosingBrackets: 'languageDefined',
    autoClosingQuotes: 'languageDefined',
    autoIndent: 'full',
    formatOnPaste: true,
    linkedEditing: true,
    bracketPairColorization: { enabled: true },
    guides: { bracketPairs: true, indentation: true },
    renderLineHighlight: 'all',
    renderWhitespace: 'selection',
    cursorBlinking: 'smooth',
    cursorSmoothCaretAnimation: 'on',
    smoothScrolling: true,
    scrollBeyondLastLine: false,
    mouseWheelZoom: true,
    fixedOverflowWidgets: true,
    padding: { top: 8, bottom: 40 },
    'semanticHighlighting.enabled': true,
  });

  state.editor.onDidChangeCursorPosition(updateStatus);
  state.editor.onDidChangeModelLanguage(updateStatus);

  // 편집기 안에서도 F1 팔레트에 한국어 명령이 보이도록 등록
  const palette = [
    ['app.openFolder', '폴더 열기', 'open-folder'],
    ['app.openFile', '파일 열기', 'open-file'],
    ['app.newFile', '새 파일', 'new-file'],
    ['app.save', '저장', 'save'],
    ['app.saveAs', '다른 이름으로 저장', 'save-as'],
    ['app.saveAll', '모두 저장', 'save-all'],
    ['app.closeTab', '현재 탭 닫기', 'close-tab'],
    ['app.quickOpen', '빠른 파일 열기', 'quick-open'],
    ['app.toggleTheme', '테마 바꾸기 (밝게/어둡게)', 'toggle-theme'],
    ['app.toggleSidebar', '탐색기 보이기/숨기기', 'toggle-sidebar'],
    ['app.toggleWrap', '자동 줄바꿈 켜기/끄기', 'toggle-wrap'],
    ['app.shortcuts', '단축키 목록 보기', 'show-shortcuts'],
    ['app.welcome', '시작 화면 보기', 'show-welcome'],
  ];
  palette.forEach(([id, label, command]) => {
    state.editor.addAction({ id, label, run: () => handleCommand(command) });
  });

  // 메뉴 단축키와 겹치지 않는 편집기 내부 단축키
  const KeyMod = state.monaco.KeyMod;
  const KeyCode = state.monaco.KeyCode;
  state.editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyP, () => handleCommand('quick-open'));
}

/* ---------------- 탭 ---------------- */
function activeTab() {
  return state.tabs.find((t) => t.id === state.activeId) || null;
}

function syncDirty() {
  const count = state.tabs.filter((t) => t.dirty).length;
  api.win.setDirty(count);
  const tab = activeTab();
  const parts = [];
  if (tab) parts.push((tab.dirty ? '● ' : '') + tab.name);
  if (state.folder) parts.push(baseName(state.folder));
  parts.push('친절한 코드 에디터');
  api.win.setTitle(parts.join(' — '));
}

function renderTabs() {
  const bar = $('tabbar');
  bar.textContent = '';
  state.tabs.forEach((tab) => {
    const el = document.createElement('div');
    el.className = 'kc-tab' + (tab.id === state.activeId ? ' kc-active' : '') + (tab.dirty ? ' kc-dirty' : '');
    el.title = tab.path || '아직 저장하지 않은 파일';

    const icon = document.createElement('span');
    icon.textContent = tab.path ? iconOf(tab.path) : '📄';
    const name = document.createElement('span');
    name.className = 'kc-tab-name';
    name.textContent = tab.name;
    const close = document.createElement('button');
    close.className = 'kc-tab-close';
    close.title = '닫기 (Ctrl+W)';

    el.append(icon, name, close);
    el.addEventListener('click', (e) => {
      if (e.target === close) return;
      activateTab(tab.id);
    });
    el.addEventListener('auxclick', (e) => {
      if (e.button === 1) closeTab(tab.id); // 가운데 버튼으로 닫기
    });
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(tab.id);
    });
    bar.appendChild(el);
  });
  updateWelcomeVisibility();
}

function updateWelcomeVisibility() {
  const empty = state.tabs.length === 0;
  $('welcome').hidden = !empty;
  $('editor').style.visibility = empty ? 'hidden' : 'visible';
}

function activateTab(id) {
  const tab = state.tabs.find((t) => t.id === id);
  if (!tab) return;
  const current = activeTab();
  if (current && current !== tab && state.editor) {
    current.viewState = state.editor.saveViewState();
  }
  state.activeId = id;
  state.editor.setModel(tab.model);
  if (tab.viewState) state.editor.restoreViewState(tab.viewState);
  state.editor.focus();
  renderTabs();
  markTreeActive();
  updateStatus();
  syncDirty();
}

function attachModelWatcher(tab) {
  tab.model.onDidChangeContent(() => {
    const dirty = tab.model.getAlternativeVersionId() !== tab.savedVersionId;
    if (dirty !== tab.dirty) {
      tab.dirty = dirty;
      renderTabs();
      syncDirty();
    }
  });
}

function makeModel(content, language, uri) {
  const monaco = state.monaco;
  const existing = uri && monaco.editor.getModel(uri);
  if (existing) {
    existing.setValue(content);
    monaco.editor.setModelLanguage(existing, language);
    return existing;
  }
  return monaco.editor.createModel(content, language, uri);
}

async function openPath(filePath) {
  const found = state.tabs.find((t) => samePath(t.path, filePath));
  if (found) {
    activateTab(found.id);
    return found;
  }
  const res = await api.fs.readFile(filePath);
  if (!res.ok) {
    toast(res.error, 'error', 5000);
    return null;
  }
  const language = languageOf(filePath);
  const uri = state.monaco.Uri.file(filePath);
  const tab = {
    id: ++state.seq,
    path: filePath,
    name: baseName(filePath),
    language,
    model: makeModel(res.content, language, uri),
    viewState: null,
    dirty: false,
    savedVersionId: 0,
    mtimeMs: res.mtimeMs,
  };
  tab.savedVersionId = tab.model.getAlternativeVersionId();
  attachModelWatcher(tab);
  state.tabs.push(tab);
  activateTab(tab.id);
  rememberRecentFile(filePath);
  return tab;
}

function newFile() {
  const n = state.tabs.filter((t) => !t.path).length + 1;
  const name = `제목 없음-${n}`;
  const tab = {
    id: ++state.seq,
    path: null,
    name,
    language: 'plaintext',
    model: makeModel('', 'plaintext', state.monaco.Uri.parse(`untitled:/untitled-${state.seq + 1}-${Date.now()}`)),
    viewState: null,
    dirty: false,
    savedVersionId: 0,
  };
  tab.savedVersionId = tab.model.getAlternativeVersionId();
  attachModelWatcher(tab);
  state.tabs.push(tab);
  activateTab(tab.id);
  toast('새 파일을 만들었습니다. Ctrl+S 로 저장하면 확장자에 맞춰 문법 강조가 켜져요.', 'info', 4200);
}

/** 저장 후 경로가 생기면 모델을 새 URI 로 옮긴다(언어 서비스가 파일을 인식하도록). */
function retargetModel(tab, newPath) {
  const monaco = state.monaco;
  const language = languageOf(newPath);
  const content = tab.model.getValue();
  const old = tab.model;
  tab.model = makeModel(content, language, monaco.Uri.file(newPath));
  tab.language = language;
  tab.path = newPath;
  tab.name = baseName(newPath);
  tab.savedVersionId = tab.model.getAlternativeVersionId();
  tab.dirty = false;
  attachModelWatcher(tab);
  if (old !== tab.model) old.dispose();
  if (tab.id === state.activeId) {
    state.editor.setModel(tab.model);
    state.editor.focus();
  }
}

async function saveTab(tab, { asNew = false } = {}) {
  if (!tab) return false;
  let target = tab.path;
  if (!target || asNew) {
    const suggestion = tab.path || `${tab.name}.txt`;
    const res = await api.dialog.saveAs(suggestion);
    if (!res.ok) return false;
    target = res.path;
  }
  const result = await api.fs.writeFile(target, tab.model.getValue());
  if (!result.ok) {
    toast(`저장하지 못했습니다: ${result.error}`, 'error', 6000);
    return false;
  }
  tab.mtimeMs = result.mtimeMs;
  if (!samePath(tab.path, target)) {
    retargetModel(tab, target);
    if (state.folder) refreshTree();
    rememberRecentFile(target);
  } else {
    tab.savedVersionId = tab.model.getAlternativeVersionId();
    tab.dirty = false;
  }
  renderTabs();
  syncDirty();
  updateStatus();
  toast(`저장했습니다: ${tab.name}`, 'ok', 1800);
  return true;
}

async function closeTab(id, { force = false } = {}) {
  const index = state.tabs.findIndex((t) => t.id === id);
  if (index < 0) return true;
  const tab = state.tabs[index];

  if (tab.dirty && !force) {
    const { response } = await api.dialog.message({
      type: 'warning',
      title: '저장하지 않은 변경 내용',
      message: `'${tab.name}' 의 변경 내용을 저장할까요?`,
      detail: '저장하지 않으면 변경한 내용이 사라집니다.',
      buttons: ['저장', '저장 안 함', '취소'],
      defaultId: 0,
      cancelId: 2,
    });
    if (response === 2) return false;
    if (response === 0) {
      const saved = await saveTab(tab);
      if (!saved) return false;
    }
  }

  state.tabs.splice(index, 1);
  tab.model.dispose();
  if (state.activeId === id) {
    const next = state.tabs[index] || state.tabs[index - 1];
    if (next) {
      activateTab(next.id);
    } else {
      state.activeId = null;
      state.editor.setModel(null);
      renderTabs();
      updateStatus();
      syncDirty();
    }
  } else {
    renderTabs();
    syncDirty();
  }
  return true;
}

async function saveAll() {
  let count = 0;
  for (const tab of [...state.tabs]) {
    if (!tab.dirty) continue;
    // 저장 대화상자가 필요한 파일은 어떤 파일인지 보여 주고 저장
    if (!tab.path) activateTab(tab.id);
    if (await saveTab(tab)) count += 1;
  }
  if (count) toast(`${count}개 파일을 저장했습니다.`, 'ok');
  else toast('저장할 변경 내용이 없습니다.');
  return state.tabs.every((t) => !t.dirty);
}

/* ---------------- 탐색기(트리) ---------------- */
function rowElement(item, depth) {
  const row = document.createElement('div');
  row.className = 'kc-tree-row';
  row.style.paddingLeft = `${6 + depth * 12}px`;
  row.dataset.path = item.path;
  row.dataset.dir = item.isDirectory ? '1' : '0';

  const twist = document.createElement('span');
  twist.className = 'kc-twist';
  twist.textContent = item.isDirectory ? '▶' : '';
  const icon = document.createElement('span');
  icon.className = 'kc-icon';
  icon.textContent = item.isDirectory ? '📁' : iconOf(item.path);
  const label = document.createElement('span');
  label.className = 'kc-label';
  label.textContent = item.name;

  row.append(twist, icon, label);
  row.title = item.path;
  return row;
}

async function fillChildren(container, dirPath, depth) {
  const res = await api.fs.readDir(dirPath);
  container.textContent = '';
  if (!res.ok) {
    toast(res.error, 'error');
    return;
  }
  for (const item of res.items) {
    const row = rowElement(item, depth);
    container.appendChild(row);
    if (item.isDirectory) {
      const kids = document.createElement('div');
      kids.className = 'kc-tree-children';
      kids.dataset.loaded = '0';
      container.appendChild(kids);
      row.addEventListener('click', async () => {
        const open = kids.classList.toggle('kc-open');
        row.querySelector('.kc-twist').textContent = open ? '▼' : '▶';
        row.querySelector('.kc-icon').textContent = open ? '📂' : '📁';
        if (open && kids.dataset.loaded === '0') {
          kids.dataset.loaded = '1';
          kids.textContent = '';
          await fillChildren(kids, item.path, depth + 1);
        }
      });
    } else {
      row.addEventListener('click', () => openPath(item.path));
    }
  }
}

async function refreshTree() {
  if (!state.folder) return;
  await fillChildren($('tree'), state.folder, 0);
  markTreeActive();
}

function markTreeActive() {
  const tab = activeTab();
  document.querySelectorAll('.kc-tree-row').forEach((row) => {
    row.classList.toggle('kc-active', !!tab && samePath(row.dataset.path, tab.path));
  });
}

async function openFolder(folderPath) {
  state.folder = folderPath;
  $('sidebar').classList.add('kc-has-folder');
  $('folderName').textContent = baseName(folderPath);
  $('folderName').title = folderPath;
  await refreshTree();
  setSetting('lastFolder', folderPath);
  rememberRecentFolder(folderPath);
  syncDirty();
  indexFiles();
}

function closeFolder() {
  state.folder = null;
  state.fileIndex = [];
  $('sidebar').classList.remove('kc-has-folder');
  $('folderName').textContent = '탐색기';
  $('tree').textContent = '';
  setSetting('lastFolder', null);
  syncDirty();
}

async function indexFiles() {
  if (!state.folder) return;
  const res = await api.fs.walk(state.folder, { maxFiles: 4000, maxDepth: 10 });
  state.fileIndex = res.ok ? res.files : [];
}

/* ---------------- 최근 항목 ---------------- */
function rememberRecentFolder(folderPath) {
  const list = [folderPath, ...(state.settings.recentFolders || []).filter((p) => !samePath(p, folderPath))];
  setSetting('recentFolders', list.slice(0, 8));
  renderRecent();
}
function rememberRecentFile(filePath) {
  const list = [filePath, ...(state.settings.recentFiles || []).filter((p) => !samePath(p, filePath))];
  setSetting('recentFiles', list.slice(0, 12));
}
function renderRecent() {
  const host = $('recentList');
  const list = state.settings.recentFolders || [];
  host.textContent = '';
  if (!list.length) {
    const p = document.createElement('p');
    p.className = 'kc-hint';
    p.textContent = '아직 연 폴더가 없습니다.';
    host.appendChild(p);
    return;
  }
  list.forEach((folderPath) => {
    const btn = document.createElement('button');
    btn.className = 'kc-link-btn';
    btn.textContent = baseName(folderPath);
    const small = document.createElement('small');
    small.textContent = folderPath;
    btn.appendChild(small);
    btn.addEventListener('click', () => openFolder(folderPath));
    host.appendChild(btn);
  });
}

/* ---------------- 상태 표시줄 ---------------- */
function updateStatus() {
  const tab = activeTab();
  const model = tab && tab.model;
  $('statusFile').textContent = tab
    ? (tab.path || '저장되지 않음') + (tab.dirty ? '  •  저장 안 됨' : '')
    : '파일이 열려 있지 않습니다';
  const pos = state.editor && state.editor.getPosition();
  $('statusPos').textContent = pos ? `줄 ${pos.lineNumber}, 열 ${pos.column}` : '줄 1, 열 1';
  const lang = model ? model.getLanguageId() : 'plaintext';
  $('statusLang').textContent = LANG_LABEL[lang] || lang;
  $('statusIndent').textContent = `공백: ${state.settings.tabSize || 2}`;
}

/* ---------------- 오버레이: 빠른 열기 / 입력 ---------------- */
function fuzzyScore(query, text) {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let score = 0;
  let ti = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found < 0) return -1;
    score += found === ti ? 3 : 1;
    ti = found + 1;
  }
  if (t.includes(q)) score += 25;
  if (baseName(t).startsWith(q)) score += 40;
  return score;
}

function renderQuickList() {
  const host = $('quickList');
  host.textContent = '';
  if (!state.quick.items.length) {
    const empty = document.createElement('div');
    empty.className = 'kc-quick-empty';
    empty.textContent = state.folder
      ? '일치하는 파일이 없습니다.'
      : '먼저 폴더를 열어 주세요 (Ctrl+K, Ctrl+O).';
    host.appendChild(empty);
    return;
  }
  state.quick.items.forEach((file, i) => {
    const row = document.createElement('div');
    row.className = 'kc-quick-item' + (i === state.quick.sel ? ' kc-sel' : '');
    const name = document.createElement('span');
    name.textContent = `${iconOf(file.path)} ${file.name}`;
    const rel = document.createElement('small');
    rel.textContent = file.rel;
    row.append(name, rel);
    row.addEventListener('click', () => {
      closeOverlays();
      openPath(file.path);
    });
    host.appendChild(row);
  });
}

function filterQuick(query) {
  const scored = [];
  for (const file of state.fileIndex) {
    const score = query ? fuzzyScore(query, file.rel) : 0;
    if (score >= 0) scored.push({ file, score });
    if (!query && scored.length >= 50) break;
  }
  scored.sort((a, b) => b.score - a.score);
  state.quick.items = scored.slice(0, 50).map((s) => s.file);
  state.quick.sel = 0;
  renderQuickList();
}

function openQuickOpen() {
  if (!state.folder) {
    toast('먼저 폴더를 열어 주세요. (Ctrl+K 다음 Ctrl+O)', 'info');
    return;
  }
  $('quickOpen').hidden = false;
  $('quickInput').value = '';
  filterQuick('');
  $('quickInput').focus();
}

function closeOverlays() {
  $('quickOpen').hidden = true;
  $('shortcuts').hidden = true;
  if (!$('promptBox').hidden) {
    $('promptBox').hidden = true;
    if (state.promptReject) state.promptReject();
  }
  if (state.editor) state.editor.focus();
}

function promptUser(label, initial = '') {
  return new Promise((resolve) => {
    const box = $('promptBox');
    const input = $('promptInput');
    $('promptLabel').textContent = label;
    input.value = initial;
    box.hidden = false;
    input.focus();
    input.select();

    const finish = (value) => {
      box.hidden = true;
      input.onkeydown = null;
      $('promptOk').onclick = null;
      $('promptCancel').onclick = null;
      state.promptReject = null;
      resolve(value);
    };
    state.promptReject = () => finish(null);
    $('promptOk').onclick = () => finish(input.value.trim() || null);
    $('promptCancel').onclick = () => finish(null);
    input.onkeydown = (e) => {
      if (e.key === 'Enter') finish(input.value.trim() || null);
      if (e.key === 'Escape') finish(null);
    };
  });
}

/* ---------------- 단축키 도움말 ---------------- */
const SHORTCUTS = [
  ['파일', [
    ['새 파일', 'Ctrl + N'],
    ['파일 열기', 'Ctrl + O'],
    ['폴더 열기', 'Ctrl + K → Ctrl + O'],
    ['저장', 'Ctrl + S'],
    ['다른 이름으로 저장', 'Ctrl + Shift + S'],
    ['모두 저장', 'Ctrl + Alt + S'],
    ['탭 닫기', 'Ctrl + W'],
    ['빠른 파일 열기', 'Ctrl + P'],
  ]],
  ['자동 완성 · 편집', [
    ['자동 완성 목록 열기', 'Ctrl + Space'],
    ['완성 항목 넣기', 'Tab 또는 Enter'],
    ['매개변수 도움말', 'Ctrl + Shift + Space'],
    ['코드 서식 정리', 'Shift + Alt + F'],
    ['주석 토글', 'Ctrl + /'],
    ['줄 복제', 'Shift + Alt + ↓'],
    ['줄 이동', 'Alt + ↑ / ↓'],
    ['같은 단어 여러 개 선택', 'Ctrl + D'],
    ['커서 여러 개 놓기', 'Alt + 클릭'],
    ['이름 한번에 바꾸기', 'F2'],
  ]],
  ['찾기 · 이동', [
    ['찾기', 'Ctrl + F'],
    ['바꾸기', 'Ctrl + H'],
    ['줄 번호로 이동', 'Ctrl + G'],
    ['정의로 이동', 'F12'],
    ['명령 팔레트', 'F1'],
  ]],
  ['화면', [
    ['탐색기 열기/닫기', 'Ctrl + B'],
    ['테마 바꾸기', 'Ctrl + K → Ctrl + T'],
    ['글자 크게 / 작게', 'Ctrl + = / Ctrl + -'],
    ['글자 크기 초기화', 'Ctrl + 0'],
    ['자동 줄바꿈', 'Alt + Z'],
    ['전체 화면', 'F11'],
  ]],
];

function renderShortcuts() {
  const body = $('shortcutsBody');
  body.textContent = '';
  SHORTCUTS.forEach(([group, rows]) => {
    const h = document.createElement('h3');
    h.textContent = group;
    const table = document.createElement('table');
    rows.forEach(([what, keys]) => {
      const tr = document.createElement('tr');
      const td1 = document.createElement('td');
      td1.textContent = what;
      const td2 = document.createElement('td');
      keys.split(' ').forEach((part) => {
        if (part === '+' || part === '→' || part === '또는' || part === '/') {
          td2.append(document.createTextNode(` ${part} `));
        } else {
          const k = document.createElement('kbd');
          k.textContent = part;
          td2.appendChild(k);
        }
      });
      tr.append(td1, td2);
      table.appendChild(tr);
    });
    body.append(h, table);
  });
  $('shortcuts').hidden = false;
}

/* ---------------- 명령 처리 ---------------- */
async function handleCommand(command, payload) {
  const editor = state.editor;
  const tab = activeTab();
  const action = (id) => editor && editor.getAction(id) && editor.getAction(id).run();

  switch (command) {
    case 'new-file': return newFile();
    case 'open-file': {
      const res = await api.dialog.openFile();
      if (res.ok) for (const p of res.paths) await openPath(p);
      return;
    }
    case 'open-folder': {
      const res = await api.dialog.openFolder();
      if (res.ok) await openFolder(res.path);
      return;
    }
    case 'open-paths': {
      for (const p of payload || []) await openPath(p);
      return;
    }
    case 'close-folder': return closeFolder();
    case 'save': return void saveTab(tab);
    case 'save-as': return void saveTab(tab, { asNew: true });
    case 'save-all': return void saveAll();
    case 'save-all-and-close': {
      const allSaved = await saveAll();
      if (allSaved) api.win.forceClose();
      return;
    }
    case 'close-tab': return void (tab && closeTab(tab.id));
    case 'next-tab':
    case 'prev-tab': {
      if (state.tabs.length < 2) return;
      const i = state.tabs.findIndex((t) => t.id === state.activeId);
      const step = command === 'next-tab' ? 1 : -1;
      const next = state.tabs[(i + step + state.tabs.length) % state.tabs.length];
      return activateTab(next.id);
    }
    case 'find': return action('actions.find');
    case 'replace': return action('editor.action.startFindReplaceAction');
    case 'goto-line': return action('editor.action.gotoLine');
    case 'trigger-suggest': return action('editor.action.triggerSuggest');
    case 'format': return action('editor.action.formatDocument');
    case 'toggle-comment': return action('editor.action.commentLine');
    case 'command-palette': return action('editor.action.quickCommand');
    case 'quick-open': return openQuickOpen();
    case 'toggle-sidebar': {
      setSetting('sidebarVisible', state.settings.sidebarVisible === false);
      applySidebar();
      return;
    }
    case 'toggle-theme': {
      setSetting('theme', state.settings.theme === 'light' ? 'dark' : 'light');
      applyTheme();
      return;
    }
    case 'font-bigger':
    case 'font-smaller':
    case 'font-reset': {
      const current = state.settings.fontSize || 14;
      const size =
        command === 'font-reset' ? 14 : Math.min(40, Math.max(8, current + (command === 'font-bigger' ? 1 : -1)));
      setSetting('fontSize', size);
      editor.updateOptions({ fontSize: size });
      toast(`글자 크기: ${size}px`, 'info', 1200);
      return;
    }
    case 'toggle-wrap': {
      setSetting('wordWrap', !state.settings.wordWrap);
      editor.updateOptions({ wordWrap: state.settings.wordWrap ? 'on' : 'off' });
      toast(state.settings.wordWrap ? '자동 줄바꿈 켬' : '자동 줄바꿈 끔', 'info', 1400);
      return;
    }
    case 'toggle-minimap': {
      setSetting('minimap', state.settings.minimap === false);
      editor.updateOptions({ minimap: { enabled: state.settings.minimap } });
      return;
    }
    case 'show-welcome': {
      state.activeId = null;
      if (state.editor) state.editor.setModel(null);
      renderTabs();
      $('welcome').hidden = false;
      $('editor').style.visibility = 'hidden';
      return;
    }
    case 'show-shortcuts': return renderShortcuts();
    default:
      return;
  }
}

/* ---------------- UI 연결 ---------------- */
function wireUi() {
  $('btnOpenFolderSide').addEventListener('click', () => handleCommand('open-folder'));
  $('btnRefresh').addEventListener('click', () => {
    refreshTree();
    indexFiles();
    toast('탐색기를 새로 고쳤습니다.', 'ok', 1200);
  });
  $('btnCloseFolder').addEventListener('click', () => handleCommand('close-folder'));

  $('btnNewFile').addEventListener('click', async () => {
    if (!state.folder) return newFile();
    const name = await promptUser('만들 파일 이름을 입력하세요 (예: index.html)', '');
    if (!name) return;
    const target = await api.path.join(state.folder, name);
    const res = await api.fs.create(target, false);
    if (!res.ok) return toast(res.error, 'error');
    await refreshTree();
    await openPath(target);
    indexFiles();
  });

  $('btnNewFolder').addEventListener('click', async () => {
    if (!state.folder) return toast('먼저 폴더를 열어 주세요.', 'info');
    const name = await promptUser('만들 폴더 이름을 입력하세요', '');
    if (!name) return;
    const target = await api.path.join(state.folder, name);
    const res = await api.fs.create(target, true);
    if (!res.ok) return toast(res.error, 'error');
    await refreshTree();
  });

  document.querySelectorAll('[data-command]').forEach((el) => {
    el.addEventListener('click', () => handleCommand(el.dataset.command));
  });

  $('statusTheme').addEventListener('click', () => handleCommand('toggle-theme'));
  $('statusPos').addEventListener('click', () => handleCommand('goto-line'));
  $('statusLang').addEventListener('click', () => handleCommand('command-palette'));
  $('statusIndent').addEventListener('click', async () => {
    const value = await promptUser('들여쓰기 칸 수 (1~8)', String(state.settings.tabSize || 2));
    if (value === null) return;
    const size = Math.min(8, Math.max(1, parseInt(value, 10) || 2));
    setSetting('tabSize', size);
    state.tabs.forEach((t) => t.model.updateOptions({ tabSize: size }));
    state.editor.updateOptions({ tabSize: size });
    updateStatus();
  });

  $('shortcutsClose').addEventListener('click', closeOverlays);
  $('quickOpen').addEventListener('click', (e) => {
    if (e.target === $('quickOpen')) closeOverlays();
  });
  $('shortcuts').addEventListener('click', (e) => {
    if (e.target === $('shortcuts')) closeOverlays();
  });

  $('quickInput').addEventListener('input', (e) => filterQuick(e.target.value.trim()));
  $('quickInput').addEventListener('keydown', (e) => {
    const max = state.quick.items.length - 1;
    if (e.key === 'ArrowDown') {
      state.quick.sel = Math.min(max, state.quick.sel + 1);
      renderQuickList();
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      state.quick.sel = Math.max(0, state.quick.sel - 1);
      renderQuickList();
      e.preventDefault();
    } else if (e.key === 'Enter') {
      const file = state.quick.items[state.quick.sel];
      closeOverlays();
      if (file) openPath(file.path);
    } else if (e.key === 'Escape') {
      closeOverlays();
    }
  });

  // 탐색기 너비 조절
  const resizer = $('resizer');
  let dragging = false;
  resizer.addEventListener('mousedown', () => {
    dragging = true;
    resizer.classList.add('kc-dragging');
    document.body.style.cursor = 'col-resize';
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const width = Math.min(560, Math.max(150, e.clientX));
    $('sidebar').style.width = `${width}px`;
  });
  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    resizer.classList.remove('kc-dragging');
    document.body.style.cursor = '';
    setSetting('sidebarWidth', $('sidebar').offsetWidth);
  });

  // 파일을 창에 끌어다 놓아 열기
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    const paths = [...e.dataTransfer.files].map((f) => api.getPathForFile(f)).filter(Boolean);
    for (const p of paths) await openPath(p);
  });

  /* Ctrl+K 로 시작하는 두 단계 단축키(화음).
     Electron 메뉴는 화음 단축키를 지원하지 않아 여기서 직접 처리한다.
     Monaco 도 Ctrl+K 조합을 쓰므로 캡처 단계에서 먼저 가로챈다. */
  let chordTimer = null;
  let chordPending = false;
  const endChord = () => {
    chordPending = false;
    clearTimeout(chordTimer);
  };
  document.addEventListener(
    'keydown',
    (e) => {
      const key = (e.key || '').toLowerCase();
      if (['control', 'shift', 'alt', 'meta'].includes(key)) return;

      if (chordPending) {
        e.preventDefault();
        e.stopPropagation();
        endChord();
        const table = { o: 'open-folder', t: 'toggle-theme', s: 'show-shortcuts', f: 'close-folder' };
        if (table[key]) handleCommand(table[key]);
        else toast('Ctrl+K 다음에는 O(폴더 열기), Ctrl+T(테마), Ctrl+S(단축키), F(폴더 닫기) 를 누르세요.', 'info', 2600);
        return;
      }

      if (e.ctrlKey && !e.altKey && key === 'k') {
        e.preventDefault();
        e.stopPropagation();
        chordPending = true;
        clearTimeout(chordTimer);
        chordTimer = setTimeout(endChord, 2500);
        toast('Ctrl+K … 다음 키: O 폴더 열기 · Ctrl+T 테마 · Ctrl+S 단축키 · F 폴더 닫기', 'info', 2400);
      }
    },
    true,
  );

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('quickOpen').hidden || !$('shortcuts').hidden || !$('promptBox').hidden) {
        closeOverlays();
      }
      return;
    }
    if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      openQuickOpen();
    }
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      handleCommand('command-palette');
    }
  });
}

/* 문자열 안 경로 자동 완성에 쓰일 자료 제공 */
window.__pathCompletionSource = async (prefix) => {
  const tab = activeTab();
  if (!tab || !tab.path) return [];
  const rel = prefix.replace(/[^/\\]*$/, '');
  const base = await api.path.join(dirName(tab.path), rel || '.');
  const res = await api.fs.readDir(base);
  return res.ok ? res.items : [];
};

/* ---------------- 시작 ---------------- */
async function boot() {
  state.settings = await api.settings.getAll();
  applyTheme();
  applySidebar();
  if (state.settings.sidebarWidth) $('sidebar').style.width = `${state.settings.sidebarWidth}px`;
  renderRecent();

  try {
    state.monaco = await loadMonaco();
  } catch (err) {
    $('loading').innerHTML =
      '<p style="max-width:460px;text-align:center;line-height:1.7">편집기 엔진을 불러오지 못했습니다.<br>' +
      'node_modules 의 monaco-editor 가 빠졌을 수 있어요. <code>npm install</code> 을 다시 실행해 주세요.</p>';
    console.error(err);
    return;
  }

  createEditor();
  window.setupIntelliSense(state.monaco);
  wireUi();
  api.onCommand(handleCommand);

  const info = await api.app.info();
  if (state.settings.lastFolder) {
    await openFolder(state.settings.lastFolder).catch(() => closeFolder());
  }
  for (const filePath of info.pendingFiles || []) await openPath(filePath);

  updateStatus();
  updateWelcomeVisibility();
  syncDirty();
  $('loading').hidden = true;

  if (!state.settings.seenWelcome) {
    setSetting('seenWelcome', true);
    toast('처음 오셨네요! 왼쪽 위 "폴더 열기" 부터 시작해 보세요. 도움말은 Ctrl+K, Ctrl+S 입니다.', 'info', 7000);
  }
}

boot();
})();
