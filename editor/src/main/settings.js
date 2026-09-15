'use strict';

/** 사용자 설정을 userData/settings.json 에 저장한다. */
const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = {
  theme: 'dark',
  fontSize: 14,
  tabSize: 2,
  wordWrap: false,
  minimap: true,
  sidebarVisible: true,
  autoSuggest: true,
  recentFolders: [],
  recentFiles: [],
  window: {},
  seenWelcome: false,
};

let filePath = null;
let data = { ...DEFAULTS };
let saveTimer = null;

function init(userDataDir) {
  filePath = path.join(userDataDir, 'settings.json');
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    data = { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    data = { ...DEFAULTS };
  }
}

function flush() {
  if (!filePath) return;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch {
    /* 설정 저장 실패는 조용히 무시 (에디터 사용에는 지장 없음) */
  }
}

function scheduleFlush() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 250);
}

function get(key, fallback) {
  const value = data[key];
  return value === undefined ? fallback : value;
}

function set(key, value) {
  data[key] = value;
  scheduleFlush();
}

function all() {
  return { ...data };
}

module.exports = { init, get, set, all, flush, DEFAULTS };
