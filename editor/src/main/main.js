'use strict';

const { app, BrowserWindow, dialog, ipcMain, protocol, shell } = require('electron');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');

const settings = require('./settings');
const buildMenu = require('./menu');

/** asar 안/밖 모두에서 editor/ 폴더를 가리킨다. */
const APP_ROOT = path.join(__dirname, '..', '..');
const RENDERER_DIR = path.join(APP_ROOT, 'src', 'renderer');
const MONACO_DIR = path.join(APP_ROOT, 'node_modules', 'monaco-editor', 'min');

const isDev = process.argv.includes('--dev') || !app.isPackaged;

/** @type {BrowserWindow|null} */
let mainWindow = null;
let dirtyCount = 0;
let forceClose = false;

/* ------------------------------------------------------------------ *
 * app:// 커스텀 프로토콜
 * file:// 대신 쓰는 이유: Monaco 의 언어 서비스가 웹 워커를 띄우는데,
 * file:// 출처에서는 워커/importScripts 가 막히는 경우가 있다.
 * ------------------------------------------------------------------ */
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

function resolveAppUrl(pathname) {
  // pathname 예: "/index.html", "/monaco/vs/loader.js"
  const clean = decodeURIComponent(pathname).replace(/^\/+/, '');
  const parts = clean.split('/').filter((p) => p && p !== '.' && p !== '..');
  if (parts[0] === 'monaco') {
    return path.join(MONACO_DIR, ...parts.slice(1));
  }
  return path.join(RENDERER_DIR, ...(parts.length ? parts : ['index.html']));
}

function registerAppProtocol() {
  protocol.handle('app', async (request) => {
    try {
      const filePath = resolveAppUrl(new URL(request.url).pathname);
      const data = await fs.readFile(filePath); // asar 내부 경로도 그대로 읽힌다
      const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      return new Response(data, { headers: { 'content-type': type } });
    } catch (err) {
      return new Response(`Not found: ${request.url}\n${err.message}`, {
        status: 404,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
  });
}

/* ------------------------------------------------------------------ *
 * 창
 * ------------------------------------------------------------------ */
function createWindow() {
  const saved = settings.get('window', {});
  const win = new BrowserWindow({
    width: saved.width || 1280,
    height: saved.height || 800,
    x: Number.isInteger(saved.x) ? saved.x : undefined,
    y: Number.isInteger(saved.y) ? saved.y : undefined,
    minWidth: 900,
    minHeight: 560,
    show: false,
    backgroundColor: settings.get('theme', 'dark') === 'light' ? '#ffffff' : '#1e1e1e',
    title: '친절한 코드 에디터',
    icon: path.join(APP_ROOT, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(APP_ROOT, 'src', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  if (saved.maximized) win.maximize();
  win.loadURL('app://-/index.html');

  win.once('ready-to-show', () => {
    win.show();
    if (isDev) win.webContents.openDevTools({ mode: 'detach' });
  });

  const rememberBounds = () => {
    if (!win || win.isDestroyed()) return;
    const maximized = win.isMaximized();
    const bounds = maximized ? win.getNormalBounds() : win.getBounds();
    settings.set('window', { ...bounds, maximized });
  };
  win.on('resize', rememberBounds);
  win.on('move', rememberBounds);
  win.on('maximize', rememberBounds);
  win.on('unmaximize', rememberBounds);

  win.on('close', (event) => {
    if (forceClose || dirtyCount === 0) return;
    event.preventDefault();
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      buttons: ['저장하고 닫기', '저장하지 않고 닫기', '취소'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
      title: '저장하지 않은 변경 내용',
      message: `저장하지 않은 파일이 ${dirtyCount}개 있습니다.`,
      detail: '지금 닫으면 변경 내용이 사라집니다. 어떻게 할까요?',
    });
    if (choice === 0) {
      win.webContents.send('menu:command', 'save-all-and-close');
    } else if (choice === 1) {
      forceClose = true;
      win.close();
    }
  });

  // 외부 링크는 기본 브라우저로
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow = win;
  return win;
}

function send(command, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('menu:command', command, payload);
  }
}

/** 실행 인자로 넘어온 파일 경로들 ("연결 프로그램으로 열기" 지원) */
function filesFromArgv(argv) {
  return argv
    .slice(app.isPackaged ? 1 : 2)
    .filter((a) => !a.startsWith('-'))
    .filter((a) => {
      try {
        return fsSync.statSync(a).isFile();
      } catch {
        return false;
      }
    })
    .map((a) => path.resolve(a));
}

/* ------------------------------------------------------------------ *
 * IPC
 * ------------------------------------------------------------------ */
const MAX_FILE_BYTES = 16 * 1024 * 1024;

function friendlyError(err) {
  switch (err && err.code) {
    case 'ENOENT':
      return '파일이나 폴더를 찾을 수 없습니다. 이동되었거나 삭제되었을 수 있어요.';
    case 'EACCES':
    case 'EPERM':
      return '접근 권한이 없습니다. 다른 위치에 저장하거나 관리자 권한으로 실행해 보세요.';
    case 'EBUSY':
      return '다른 프로그램이 파일을 사용 중입니다. 해당 프로그램을 닫고 다시 시도해 주세요.';
    case 'EISDIR':
      return '파일이 아니라 폴더입니다.';
    case 'ENOSPC':
      return '디스크 공간이 부족합니다.';
    default:
      return (err && err.message) || '알 수 없는 오류가 발생했습니다.';
  }
}

function ok(value) {
  return { ok: true, ...value };
}
function fail(err) {
  return { ok: false, error: friendlyError(err) };
}

function registerIpc() {
  ipcMain.handle('dialog:open-folder', async () => {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: '폴더 열기',
      buttonLabel: '폴더 열기',
      properties: ['openDirectory'],
    });
    return res.canceled ? { ok: false } : ok({ path: res.filePaths[0] });
  });

  ipcMain.handle('dialog:open-file', async () => {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: '파일 열기',
      buttonLabel: '열기',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '모든 파일', extensions: ['*'] },
        { name: '코드 파일', extensions: ['js', 'ts', 'jsx', 'tsx', 'json', 'html', 'css', 'scss', 'py', 'java', 'c', 'cpp', 'cs', 'go', 'rs', 'php', 'rb', 'sh', 'sql', 'xml', 'yaml', 'yml'] },
        { name: '텍스트 파일', extensions: ['txt', 'md', 'log', 'ini', 'cfg'] },
      ],
    });
    return res.canceled ? { ok: false } : ok({ paths: res.filePaths });
  });

  ipcMain.handle('dialog:save-as', async (_e, suggestedName) => {
    const res = await dialog.showSaveDialog(mainWindow, {
      title: '다른 이름으로 저장',
      buttonLabel: '저장',
      defaultPath: suggestedName || '제목 없음.txt',
      filters: [{ name: '모든 파일', extensions: ['*'] }],
    });
    return res.canceled ? { ok: false } : ok({ path: res.filePath });
  });

  ipcMain.handle('dialog:message', async (_e, options) => {
    const res = await dialog.showMessageBox(mainWindow, {
      type: options.type || 'info',
      title: options.title || '알림',
      message: options.message || '',
      detail: options.detail,
      buttons: options.buttons || ['확인'],
      defaultId: options.defaultId || 0,
      cancelId: typeof options.cancelId === 'number' ? options.cancelId : undefined,
      noLink: true,
    });
    return { response: res.response };
  });

  ipcMain.handle('fs:read-dir', async (_e, dirPath) => {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const items = entries
        .map((e) => ({
          name: e.name,
          path: path.join(dirPath, e.name),
          isDirectory: e.isDirectory(),
        }));
      // node_modules / .git 은 목록에는 남기되 맨 뒤로 보낸다
      const heavy = new Set(['node_modules', '.git', 'dist', 'out', '.cache']);
      items.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        const ha = heavy.has(a.name) ? 1 : 0;
        const hb = heavy.has(b.name) ? 1 : 0;
        if (ha !== hb) return ha - hb;
        return a.name.localeCompare(b.name, 'ko');
      });
      return ok({ items });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('fs:read-file', async (_e, filePath) => {
    try {
      const stat = await fs.stat(filePath);
      if (stat.isDirectory()) return { ok: false, error: '폴더는 편집기에서 열 수 없습니다.' };
      if (stat.size > MAX_FILE_BYTES) {
        return {
          ok: false,
          error: `파일이 너무 큽니다 (${(stat.size / 1024 / 1024).toFixed(1)}MB). 16MB 이하 파일만 열 수 있어요.`,
        };
      }
      const buf = await fs.readFile(filePath);
      const probe = buf.subarray(0, 8000);
      if (probe.includes(0)) {
        return { ok: false, error: '텍스트 파일이 아닙니다 (이미지·실행 파일 등은 열 수 없어요).' };
      }
      return ok({ content: buf.toString('utf8'), mtimeMs: stat.mtimeMs });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('fs:write-file', async (_e, filePath, content) => {
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, 'utf8');
      const stat = await fs.stat(filePath);
      return ok({ mtimeMs: stat.mtimeMs });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('fs:create', async (_e, targetPath, isDirectory) => {
    try {
      if (isDirectory) {
        await fs.mkdir(targetPath, { recursive: true });
      } else {
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.writeFile(targetPath, '', { flag: 'wx' });
      }
      return ok({ path: targetPath });
    } catch (err) {
      if (err && err.code === 'EEXIST') return { ok: false, error: '같은 이름이 이미 있습니다.' };
      return fail(err);
    }
  });

  ipcMain.handle('fs:rename', async (_e, from, to) => {
    try {
      await fs.rename(from, to);
      return ok({ path: to });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('fs:delete', async (_e, targetPath) => {
    try {
      await shell.trashItem(targetPath); // 휴지통으로 (복구 가능)
      return ok({});
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('fs:walk', async (_e, rootPath, options = {}) => {
    const maxFiles = options.maxFiles || 4000;
    const maxDepth = options.maxDepth || 10;
    const skip = new Set([
      'node_modules', '.git', '.svn', '.hg', 'dist', 'build', 'out',
      '.next', '.nuxt', '.cache', '__pycache__', 'venv', '.venv', 'target',
    ]);
    const files = [];
    let truncated = false;

    async function walk(dir, depth) {
      if (truncated || depth > maxDepth) return;
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return; // 권한 없는 폴더는 조용히 건너뛴다
      }
      for (const entry of entries) {
        if (files.length >= maxFiles) {
          truncated = true;
          return;
        }
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (skip.has(entry.name)) continue;
          await walk(full, depth + 1);
        } else if (entry.isFile()) {
          files.push({ name: entry.name, path: full, rel: path.relative(rootPath, full) });
        }
      }
    }

    try {
      await walk(rootPath, 0);
      return ok({ files, truncated });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('path:info', async (_e, p) => ({
    dirname: path.dirname(p),
    basename: path.basename(p),
    extname: path.extname(p),
    sep: path.sep,
  }));

  ipcMain.handle('path:join', async (_e, ...parts) => path.join(...parts));

  ipcMain.handle('settings:get-all', async () => settings.all());
  ipcMain.handle('settings:set', async (_e, key, value) => {
    settings.set(key, value);
    return { ok: true };
  });

  ipcMain.handle('win:set-dirty', async (_e, count) => {
    dirtyCount = Number(count) || 0;
    return { ok: true };
  });

  ipcMain.handle('win:force-close', async () => {
    forceClose = true;
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
    return { ok: true };
  });

  ipcMain.handle('win:set-title', async (_e, title) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setTitle(title);
    return { ok: true };
  });

  ipcMain.handle('app:info', async () => ({
    name: app.getName(),
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    isPackaged: app.isPackaged,
    userData: app.getPath('userData'),
    pendingFiles: filesFromArgv(process.argv),
  }));

  ipcMain.handle('app:open-external', async (_e, url) => {
    if (/^https?:/.test(url)) await shell.openExternal(url);
    return { ok: true };
  });

  ipcMain.handle('app:show-item', async (_e, p) => {
    shell.showItemInFolder(p);
    return { ok: true };
  });
}

/* ------------------------------------------------------------------ *
 * 시작
 * ------------------------------------------------------------------ */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    const files = filesFromArgv(argv);
    if (files.length) send('open-paths', files);
  });

  app.whenReady().then(() => {
    settings.init(app.getPath('userData'));
    registerAppProtocol();
    registerIpc();
    const win = createWindow();
    buildMenu(send, settings);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
    return win;
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
