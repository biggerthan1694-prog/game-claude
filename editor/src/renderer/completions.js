/* eslint-disable no-undef */
'use strict';

/**
 * VS Code 스타일 자동 완성 설정.
 *
 * 1) JavaScript/TypeScript/HTML/CSS/JSON 은 Monaco 에 내장된 언어 서비스가
 *    문맥을 이해하는 지능형 완성(IntelliSense)을 제공한다. 여기서는 그 동작을
 *    켜 주고 거슬리는 부분만 다듬는다.
 * 2) 그 위에 자주 쓰는 코드 틀(스니펫)을 한국어 설명과 함께 얹는다.
 * 3) 언어 서비스가 없는 파일도 문서 안의 단어로 완성이 되도록 한다.
 */

(function () {

const SNIPPETS = {
  javascript: [
    ['log', 'console.log(${1:값});', '콘솔에 값 출력'],
    ['fn', 'function ${1:이름}(${2:매개변수}) {\n\t$0\n}', '일반 함수 선언'],
    ['afn', 'const ${1:이름} = (${2:매개변수}) => {\n\t$0\n};', '화살표 함수'],
    ['iife', '(function () {\n\t$0\n})();', '즉시 실행 함수'],
    ['for', 'for (let ${1:i} = 0; ${1:i} < ${2:배열}.length; ${1:i}++) {\n\t$0\n}', '인덱스 for 문'],
    ['forof', 'for (const ${1:항목} of ${2:배열}) {\n\t$0\n}', 'for...of 반복'],
    ['forin', 'for (const ${1:키} in ${2:객체}) {\n\t$0\n}', 'for...in 반복'],
    ['map', 'const ${1:결과} = ${2:배열}.map((${3:항목}) => ${4:항목});', '배열 map'],
    ['filter', 'const ${1:결과} = ${2:배열}.filter((${3:항목}) => ${4:조건});', '배열 filter'],
    ['reduce', 'const ${1:합계} = ${2:배열}.reduce((acc, ${3:항목}) => acc + ${3:항목}, 0);', '배열 reduce'],
    ['try', 'try {\n\t$1\n} catch (err) {\n\tconsole.error(err);\n}', 'try...catch'],
    ['async', 'async function ${1:이름}(${2:매개변수}) {\n\t$0\n}', 'async 함수'],
    ['await', 'const ${1:결과} = await ${2:약속};', 'await 호출'],
    ['prom', 'new Promise((resolve, reject) => {\n\t$0\n});', 'Promise 생성'],
    ['fetch', "const res = await fetch('${1:주소}');\nconst data = await res.json();\n$0", 'fetch 로 JSON 받기'],
    ['cls', 'class ${1:이름} {\n\tconstructor(${2:매개변수}) {\n\t\t$0\n\t}\n}', '클래스 선언'],
    ['imp', "import ${1:모듈} from '${2:경로}';", 'import 문'],
    ['exp', 'export default ${1:값};', 'export default'],
    ['ted', "document.addEventListener('${1:click}', (event) => {\n\t$0\n});", '이벤트 리스너'],
    ['qs', "document.querySelector('${1:선택자}')", '요소 하나 찾기'],
    ['qsa', "document.querySelectorAll('${1:선택자}')", '요소 모두 찾기'],
    ['setint', 'setInterval(() => {\n\t$0\n}, ${1:1000});', '반복 타이머'],
    ['settime', 'setTimeout(() => {\n\t$0\n}, ${1:1000});', '지연 실행'],
    ['json', 'JSON.stringify(${1:값}, null, 2)', '보기 좋은 JSON 문자열'],
  ],
  html: [
    [
      'html5',
      '<!doctype html>\n<html lang="ko">\n<head>\n\t<meta charset="utf-8">\n\t<meta name="viewport" content="width=device-width, initial-scale=1">\n\t<title>${1:제목}</title>\n</head>\n<body>\n\t$0\n</body>\n</html>',
      'HTML5 기본 문서 틀',
    ],
    ['div', '<div class="${1:클래스}">$0</div>', 'div 요소'],
    ['a', '<a href="${1:#}">${2:링크 글자}</a>', '링크'],
    ['img', '<img src="${1:경로}" alt="${2:설명}">', '이미지'],
    ['ul', '<ul>\n\t<li>${1:항목}</li>\n</ul>', '목록'],
    ['table', '<table>\n\t<thead>\n\t\t<tr><th>${1:머리}</th></tr>\n\t</thead>\n\t<tbody>\n\t\t<tr><td>${2:내용}</td></tr>\n\t</tbody>\n</table>', '표'],
    ['form', '<form action="${1:#}" method="post">\n\t$0\n</form>', '폼'],
    ['input', '<input type="${1:text}" name="${2:이름}" placeholder="${3:안내}">', '입력칸'],
    ['btn', '<button type="button">${1:버튼}</button>', '버튼'],
    ['script', '<script src="${1:app.js}"></script>', '스크립트 연결'],
    ['link', '<link rel="stylesheet" href="${1:styles.css}">', 'CSS 연결'],
  ],
  css: [
    ['flex', 'display: flex;\nalign-items: ${1:center};\njustify-content: ${2:center};', '플렉스 정렬'],
    ['grid', 'display: grid;\ngrid-template-columns: repeat(${1:3}, 1fr);\ngap: ${2:12px};', '그리드 배치'],
    ['center', 'position: absolute;\ntop: 50%;\nleft: 50%;\ntransform: translate(-50%, -50%);', '정중앙 배치'],
    ['media', '@media (max-width: ${1:768px}) {\n\t$0\n}', '반응형 미디어 쿼리'],
    ['var', 'var(--${1:이름})', 'CSS 변수 사용'],
    ['anim', '@keyframes ${1:이름} {\n\tfrom { $2 }\n\tto { $3 }\n}', '애니메이션 정의'],
    ['shadow', 'box-shadow: 0 ${1:4px} ${2:12px} rgba(0, 0, 0, ${3:0.2});', '그림자'],
    ['trans', 'transition: ${1:all} ${2:0.2s} ${3:ease};', '전환 효과'],
  ],
  python: [
    ['def', 'def ${1:이름}(${2:매개변수}):\n\t$0', '함수 정의'],
    ['cls', 'class ${1:이름}:\n\tdef __init__(self${2:, 인자}):\n\t\t$0', '클래스 정의'],
    ['main', "if __name__ == '__main__':\n\t$0", '메인 진입점'],
    ['for', 'for ${1:항목} in ${2:대상}:\n\t$0', 'for 반복'],
    ['try', 'try:\n\t$1\nexcept ${2:Exception} as err:\n\tprint(err)', '예외 처리'],
    ['with', "with open('${1:파일}', encoding='utf-8') as f:\n\t$0", '파일 열기'],
    ['print', "print(f'${1:내용}')", 'f-문자열 출력'],
  ],
  markdown: [
    ['table', '| ${1:머리} | ${2:머리} |\n| --- | --- |\n| ${3:내용} | ${4:내용} |', '표 만들기'],
    ['code', '```${1:js}\n$0\n```', '코드 블록'],
    ['link', '[${1:글자}](${2:주소})', '링크'],
    ['img', '![${1:설명}](${2:경로})', '이미지'],
  ],
  json: [],
};

SNIPPETS.typescript = SNIPPETS.javascript;
SNIPPETS.javascriptreact = SNIPPETS.javascript;
SNIPPETS.typescriptreact = SNIPPETS.javascript;
SNIPPETS.scss = SNIPPETS.css;
SNIPPETS.less = SNIPPETS.css;

/** 스니펫이 없는 언어에서도 쓸 수 있는 공통 항목 */
const COMMON = [
  ['todo', 'TODO: ${1:할 일}', '할 일 메모'],
  ['날짜', new Date().toISOString().slice(0, 10), '오늘 날짜 넣기'],
];

function setupIntelliSense(monaco) {
  /* ---- 1. 내장 언어 서비스 다듬기 ---- */
  const ts = monaco.languages.typescript;
  if (ts) {
    const compilerOptions = {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      allowNonTsExtensions: true,
      allowJs: true,
      checkJs: false,
      lib: ['esnext', 'dom', 'dom.iterable'],
    };
    ts.javascriptDefaults.setCompilerOptions(compilerOptions);
    ts.typescriptDefaults.setCompilerOptions(compilerOptions);

    // 순수 JS 파일에서 타입 오류로 빨간 줄이 도배되지 않도록 (VS Code 기본과 동일)
    ts.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: false,
    });
    ts.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
    });
    ts.javascriptDefaults.setEagerModelSync(true);
    ts.typescriptDefaults.setEagerModelSync(true);
  }

  if (monaco.languages.json) {
    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      allowComments: true,
      schemaValidation: 'warning',
    });
  }
  if (monaco.languages.css) {
    const cssOpts = { validate: true, lint: { compatibleVendorPrefixes: 'ignore' } };
    monaco.languages.css.cssDefaults.setOptions(cssOpts);
    monaco.languages.css.scssDefaults.setOptions(cssOpts);
    monaco.languages.css.lessDefaults.setOptions(cssOpts);
  }
  if (monaco.languages.html) {
    monaco.languages.html.htmlDefaults.setOptions({
      format: { tabSize: 2, insertSpaces: true, wrapLineLength: 120 },
      suggest: { html5: true },
    });
  }

  /* ---- 2. 스니펫 등록 ---- */
  const registered = new Set();

  const toSuggestions = (list, range) =>
    list.map(([label, body, doc]) => ({
      label: { label, description: '스니펫' },
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: body,
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      documentation: { value: `**${doc}**\n\n\`\`\`\n${body.replace(/\$\{\d+:?([^}]*)\}/g, '$1').replace(/\$0/g, '')}\n\`\`\`` },
      detail: doc,
      range,
    }));

  const registerFor = (languageId) => {
    if (registered.has(languageId)) return;
    registered.add(languageId);
    monaco.languages.registerCompletionItemProvider(languageId, {
      provideCompletionItems(model, position) {
        const word = model.getWordUntilPosition(position);
        const before = model.getLineContent(position.lineNumber).slice(0, word.startColumn - 1);

        // 멤버 접근(console. 처럼 점 뒤) 자리에서는 스니펫을 내지 않는다.
        // 여기서 스니펫을 끼워 넣으면 진짜 멤버 목록(log, warn ...)을 가려 버린다.
        if (/[.:>]\s*$/.test(before)) return { suggestions: [] };

        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        const list = (SNIPPETS[languageId] || []).concat(COMMON);
        return { suggestions: toSuggestions(list, range) };
      },
    });
  };

  Object.keys(SNIPPETS).forEach(registerFor);
  ['plaintext', 'shell', 'bat', 'powershell', 'yaml', 'xml', 'sql', 'java', 'c', 'cpp', 'csharp', 'go', 'rust', 'php', 'ruby'].forEach(
    registerFor,
  );

  /* ---- 3. 파일 경로 완성: 문자열 안에서 ./ 를 치면 형제 파일을 제안 ---- */
  monaco.languages.registerCompletionItemProvider(['javascript', 'typescript', 'html', 'css'], {
    triggerCharacters: ['/', '.'],
    async provideCompletionItems(model, position) {
      if (!window.__pathCompletionSource) return { suggestions: [] };
      const line = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
      const m = /['"`]([^'"`]*)$/.exec(line);
      if (!m || !m[1].startsWith('.')) return { suggestions: [] };
      const files = await window.__pathCompletionSource(m[1]);
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      return {
        suggestions: files.map((f) => ({
          label: f.name,
          kind: f.isDirectory
            ? monaco.languages.CompletionItemKind.Folder
            : monaco.languages.CompletionItemKind.File,
          insertText: f.name,
          detail: f.isDirectory ? '폴더' : '파일',
          range,
        })),
      };
    },
  });
}

window.setupIntelliSense = setupIntelliSense;

})();
