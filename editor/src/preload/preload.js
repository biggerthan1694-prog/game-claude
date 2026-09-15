'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

/**
 * 렌더러(편집 화면)는 Node API 에 직접 접근하지 않는다.
 * 필요한 기능만 window.api 로 좁게 열어 준다.
 */
contextBridge.exposeInMainWorld('api', {
  dialog: {
    openFolder: () => ipcRenderer.invoke('dialog:open-folder'),
    openFile: () => ipcRenderer.invoke('dialog:open-file'),
    saveAs: (suggestedName) => ipcRenderer.invoke('dialog:save-as', suggestedName),
    message: (options) => ipcRenderer.invoke('dialog:message', options),
  },
  fs: {
    readDir: (dirPath) => ipcRenderer.invoke('fs:read-dir', dirPath),
    readFile: (filePath) => ipcRenderer.invoke('fs:read-file', filePath),
    writeFile: (filePath, content) => ipcRenderer.invoke('fs:write-file', filePath, content),
    create: (targetPath, isDirectory) => ipcRenderer.invoke('fs:create', targetPath, isDirectory),
    rename: (from, to) => ipcRenderer.invoke('fs:rename', from, to),
    remove: (targetPath) => ipcRenderer.invoke('fs:delete', targetPath),
    walk: (rootPath, options) => ipcRenderer.invoke('fs:walk', rootPath, options),
  },
  path: {
    info: (p) => ipcRenderer.invoke('path:info', p),
    join: (...parts) => ipcRenderer.invoke('path:join', ...parts),
  },
  settings: {
    getAll: () => ipcRenderer.invoke('settings:get-all'),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  },
  win: {
    setDirty: (count) => ipcRenderer.invoke('win:set-dirty', count),
    forceClose: () => ipcRenderer.invoke('win:force-close'),
    setTitle: (title) => ipcRenderer.invoke('win:set-title', title),
  },
  app: {
    info: () => ipcRenderer.invoke('app:info'),
    openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
    showItem: (p) => ipcRenderer.invoke('app:show-item', p),
  },
  /** 창에 끌어다 놓은 파일의 실제 경로 (Electron 32+ 에서는 File.path 가 없다) */
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return file && file.path ? file.path : '';
    }
  },
  onCommand: (handler) => {
    ipcRenderer.on('menu:command', (_e, command, payload) => handler(command, payload));
  },
});
