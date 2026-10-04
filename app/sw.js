// Service worker веб-версии Мнемы: приложение открывается и работает без интернета.
// Файлы приложения кладутся в кэш при установке (список и версию подставляет web/vite-plugin.ts при сборке).
// Новая версия ждёт, пока человек нажмёт «Обновить» (platform/web.ts), чтобы страница не перезагрузилась посреди конспекта.
const VERSION = '1.27.0-84aaa9b8c4';
const FILES = [
 "assets/App-B4OvQ5Xk.css",
 "assets/App-BACKydYN.js",
 "assets/ErrorBoundary-BAWMez-I.js",
 "assets/FormulaEditor-Bk27eonZ.css",
 "assets/FormulaEditor-RGnYk2yF.js",
 "assets/KaTeX_AMS-Regular-BQhdFMY1.woff2",
 "assets/KaTeX_Caligraphic-Bold-Dq_IR9rO.woff2",
 "assets/KaTeX_Caligraphic-Regular-Di6jR-x-.woff2",
 "assets/KaTeX_Fraktur-Bold-CL6g_b3V.woff2",
 "assets/KaTeX_Fraktur-Regular-CTYiF6lA.woff2",
 "assets/KaTeX_Main-Bold-Cx986IdX.woff2",
 "assets/KaTeX_Main-BoldItalic-DxDJ3AOS.woff2",
 "assets/KaTeX_Main-Italic-NWA7e6Wa.woff2",
 "assets/KaTeX_Main-Regular-B22Nviop.woff2",
 "assets/KaTeX_Math-BoldItalic-CZnvNsCZ.woff2",
 "assets/KaTeX_Math-Italic-t53AETM-.woff2",
 "assets/KaTeX_SansSerif-Bold-D1sUS0GD.woff2",
 "assets/KaTeX_SansSerif-Italic-C3H0VqGB.woff2",
 "assets/KaTeX_SansSerif-Regular-DDBCnlJ7.woff2",
 "assets/KaTeX_Script-Regular-D3wIWfF6.woff2",
 "assets/KaTeX_Size1-Regular-mCD8mA8B.woff2",
 "assets/KaTeX_Size2-Regular-Dy4dx90m.woff2",
 "assets/KaTeX_Size4-Regular-Dl5lxZxV.woff2",
 "assets/KaTeX_Typewriter-Regular-CO6r4hn1.woff2",
 "assets/KnowledgeMap-Bv9Dda6H.css",
 "assets/KnowledgeMap-CpsP66eX.js",
 "assets/Links-DP3XyHnU.js",
 "assets/Markdown-BkR95Ss1.js",
 "assets/TextbookImport-Qwdb-viZ.js",
 "assets/_virtual_sql-wasm-Hsfk3kUE.js",
 "assets/anki-BPp3_Gvx.js",
 "assets/ankiExport-D6UbklcJ.js",
 "assets/ankiSql-Kz3FsW6_.js",
 "assets/browser-BXlMmLo7.js",
 "assets/browser-NM0WNCww.js",
 "assets/cloud-DZ4fl3fj.js",
 "assets/comfortaa-cyrillic-400-normal-D77ZQwhO.woff2",
 "assets/comfortaa-cyrillic-600-normal-CxSmWMj-.woff2",
 "assets/comfortaa-cyrillic-700-normal-BojaBofG.woff2",
 "assets/comfortaa-latin-400-normal-Cs52v-fJ.woff2",
 "assets/comfortaa-latin-600-normal-BgHTI9Cz.woff2",
 "assets/comfortaa-latin-700-normal-DOtxUU44.woff2",
 "assets/cyrillic-400-C73vjnkT.css",
 "assets/cyrillic-400-bjDQgcnd.css",
 "assets/cyrillic-600-C7lzOaO5.css",
 "assets/cyrillic-600-wYZ8SAXh.css",
 "assets/cyrillic-700-BBraEc1F.css",
 "assets/cyrillic-700-Onmbxqfb.css",
 "assets/index-CijflgAZ.css",
 "assets/index-s4ucYUKk.js",
 "assets/jsQR-BA6uQ1sY.js",
 "assets/latin-400-B9NaXjta.css",
 "assets/latin-400-BZzKToFO.css",
 "assets/latin-600--E_1NvAy.css",
 "assets/latin-600-iGgPG_6L.css",
 "assets/latin-700-CjAoY5Iw.css",
 "assets/latin-700-_I76cMGI.css",
 "assets/links-CoUIwYRE.js",
 "assets/literata-cyrillic-500-normal-DQDv4C2e.woff2",
 "assets/literata-cyrillic-600-normal-CJ4BZrBr.woff2",
 "assets/literata-latin-500-normal-Dbph1WrK.woff2",
 "assets/literata-latin-600-normal-A9sHopYh.woff2",
 "assets/nunito-cyrillic-400-normal-xAOo5cBP.woff2",
 "assets/nunito-cyrillic-600-normal-DJGQ2h05.woff2",
 "assets/nunito-cyrillic-700-normal-DP36NgGt.woff2",
 "assets/nunito-latin-400-normal-r8SDr6Up.woff2",
 "assets/nunito-latin-600-normal-Br8yIETf.woff2",
 "assets/nunito-latin-700-normal-Dort48En.woff2",
 "assets/obsidianExport-5fjtBOgp.js",
 "assets/ocrWeb-BnrXBVO9.js",
 "assets/onest-cyrillic-400-normal-BTdD9fLi.woff2",
 "assets/onest-cyrillic-500-normal-CJRUgmys.woff2",
 "assets/onest-cyrillic-600-normal-BZYKVyuq.woff2",
 "assets/onest-latin-400-normal-9AYXx_QC.woff2",
 "assets/onest-latin-500-normal-2-RsuwM3.woff2",
 "assets/onest-latin-600-normal-DM19Lk_j.woff2",
 "assets/rolldown-runtime-C0FnF6B9.js",
 "assets/share-DmGqHiSg.js",
 "assets/sql-wasm-browser-qgzeNjE3.js",
 "assets/src-SuYvKHvm.js",
 "assets/textbook-BpwQ_EmQ.js",
 "assets/ui-CjbbXemR.js",
 "assets/update-Xne8J1w4.js",
 "assets/web-DI8sdkUT.js",
 "assets/webInstall-Dy_nURP6.js",
 "icons/apple-touch-icon.png",
 "icons/icon-192.png",
 "icons/icon-512.png",
 "icons/icon-maskable-512.png",
 "index.html",
 "manifest.webmanifest"
];
const APP = 'mnema-app-' + VERSION;
// Распознавание страниц (ocr/) весит около 17 МБ и от версии к версии не меняется — качается при первом использовании и живёт отдельно.
const OCR = 'mnema-ocr';

const scope = self.registration.scope;
const url = (p) => new URL(p, scope).href;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(APP).then((c) => c.addAll(FILES.map(url))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k.startsWith('mnema-app-') && k !== APP) await caches.delete(k);
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin !== location.origin || !u.href.startsWith(scope)) return;

  // Открытие страницы — всегда из кэша: приложение одностраничное, адреса внутри него не меняются.
  if (req.mode === 'navigate') {
    e.respondWith(caches.match(url('index.html'), { cacheName: APP }).then((r) => r || fetch(req)));
    return;
  }

  const cacheName = u.href.startsWith(url('ocr/')) ? OCR : APP;
  e.respondWith(
    caches.open(cacheName).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone()).catch(() => {});
      return res;
    })
  );
});
