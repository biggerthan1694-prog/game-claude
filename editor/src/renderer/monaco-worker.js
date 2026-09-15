/* Monaco 언어 서비스 워커 부트스트랩.
   (blob: 대신 같은 출처의 실제 파일을 써서 CSP 와 충돌하지 않게 한다) */
self.MonacoEnvironment = { baseUrl: 'app://-/monaco/' };
importScripts('app://-/monaco/vs/base/worker/workerMain.js');
