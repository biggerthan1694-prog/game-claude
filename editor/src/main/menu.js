'use strict';

const { Menu, app, shell, dialog } = require('electron');

/**
 * 한국어 메뉴 막대를 만든다. 대부분의 항목은 렌더러에 명령만 보내고,
 * 실제 동작은 renderer/app.js 의 commands 표에서 처리한다.
 */
module.exports = function buildMenu(send, settings) {
  const item = (label, accelerator, command, extra = {}) => ({
    label,
    accelerator,
    click: () => send(command),
    ...extra,
  });

  const template = [
    {
      label: '파일(&F)',
      submenu: [
        item('새 파일', 'CmdOrCtrl+N', 'new-file'),
        item('파일 열기...', 'CmdOrCtrl+O', 'open-file'),
        item('빠른 파일 열기...', 'CmdOrCtrl+P', 'quick-open'),
        item('폴더 열기...   (Ctrl+K, Ctrl+O)', null, 'open-folder'),
        { type: 'separator' },
        item('저장', 'CmdOrCtrl+S', 'save'),
        item('다른 이름으로 저장...', 'CmdOrCtrl+Shift+S', 'save-as'),
        item('모두 저장', 'CmdOrCtrl+Alt+S', 'save-all'),
        { type: 'separator' },
        item('탭 닫기', 'CmdOrCtrl+W', 'close-tab'),
        item('폴더 닫기   (Ctrl+K, F)', null, 'close-folder'),
        { type: 'separator' },
        { label: '끝내기', accelerator: 'Alt+F4', role: 'quit' },
      ],
    },
    {
      label: '편집(&E)',
      submenu: [
        { label: '실행 취소', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: '다시 실행', accelerator: 'CmdOrCtrl+Y', role: 'redo' },
        { type: 'separator' },
        { label: '잘라내기', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: '복사', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: '붙여넣기', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: '모두 선택', accelerator: 'CmdOrCtrl+A', role: 'selectAll' },
        { type: 'separator' },
        item('찾기', 'CmdOrCtrl+F', 'find'),
        item('바꾸기', 'CmdOrCtrl+H', 'replace'),
        item('줄로 이동', 'CmdOrCtrl+G', 'goto-line'),
        { type: 'separator' },
        item('자동 완성 보기', 'Ctrl+Space', 'trigger-suggest'),
        item('코드 서식 정리', 'Shift+Alt+F', 'format'),
        item('주석 토글', 'CmdOrCtrl+/', 'toggle-comment'),
      ],
    },
    {
      label: '보기(&V)',
      submenu: [
        item('탐색기 보이기/숨기기', 'CmdOrCtrl+B', 'toggle-sidebar'),
        item('명령 팔레트', 'F1', 'command-palette'),
        { type: 'separator' },
        item('테마 바꾸기 (밝게/어둡게)   (Ctrl+K, Ctrl+T)', null, 'toggle-theme'),
        item('글자 크게', 'CmdOrCtrl+=', 'font-bigger'),
        item('글자 작게', 'CmdOrCtrl+-', 'font-smaller'),
        item('글자 크기 초기화', 'CmdOrCtrl+0', 'font-reset'),
        { type: 'separator' },
        item('자동 줄바꿈', 'Alt+Z', 'toggle-wrap'),
        item('미니맵 보이기/숨기기', null, 'toggle-minimap'),
        { type: 'separator' },
        { label: '전체 화면', accelerator: 'F11', role: 'togglefullscreen' },
        { label: '개발자 도구', accelerator: 'Ctrl+Shift+I', role: 'toggleDevTools' },
      ],
    },
    {
      label: '이동(&G)',
      submenu: [
        item('다음 탭', 'Ctrl+Tab', 'next-tab'),
        item('이전 탭', 'Ctrl+Shift+Tab', 'prev-tab'),
      ],
    },
    {
      label: '도움말(&H)',
      submenu: [
        item('시작 화면 / 사용법', null, 'show-welcome'),
        item('단축키 목록   (Ctrl+K, Ctrl+S)', null, 'show-shortcuts'),
        { type: 'separator' },
        {
          label: '프로그램 정보',
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: '프로그램 정보',
              message: `${app.getName()} ${app.getVersion()}`,
              detail:
                'VSCode 스타일 자동 완성을 갖춘 가벼운 코드 에디터입니다.\n\n' +
                `Electron ${process.versions.electron} · Chromium ${process.versions.chrome} · Node ${process.versions.node}\n` +
                '편집기 엔진: Monaco Editor (VS Code 와 동일)',
              buttons: ['확인'],
              noLink: true,
            });
          },
        },
        {
          label: '설정 파일이 저장된 폴더 열기',
          click: () => shell.openPath(app.getPath('userData')),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  return menu;
};
