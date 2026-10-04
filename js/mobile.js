/* Мнема — интерфейс для телефона: вкладки, экраны со стеком, шторка. Включается только в мобильном режиме (см. index.html). */
(function () {
  'use strict';
  if (!window.MNEMA_MOBILE) return;

  var D = mobileData();
  var REPO = 'TryserPy/Mnema';
  var RELEASES = 'https://github.com/' + REPO + '/releases/latest';
  var FALLBACK_VER = '1.26.0';
  var STYLE_SAMPLE = '{\n  "kind": "mnema-mod",\n  "name": "Стикеры + пастельные оценки",\n  "description": "Карточки как жёлтые стикеры",\n  "author": "Я",\n  "where": "при повторении",\n  "css": ".review-card { background: #FFF4A8 !important; color: #2B2610 !important; transform: rotate(-0.6deg); } .grade.good { background: #CFF1DC; color: #1F6B43; }"\n}';

  // документация та же, что на компьютере, но без интерактивных конструкторов
  var DOCS = docsData().map(function (g) {
    return Object.assign({}, g, { items: g.items.map(function (it) {
      var blocks = [];
      it.blocks.forEach(function (b) {
        if (b.lab) { blocks.splice(-2, 2); blocks.push({ code: STYLE_SAMPLE, lang: 'Файл стиля · .mnemamod' }); return; }
        if (b.gen) { blocks.splice(-2, 2); return; }
        blocks.push(b);
      });
      var lead = it.id === 'keys' ? it.lead + ' Работают на компьютере.' : it.lead;
      return Object.assign({}, it, { blocks: blocks, lead: lead });
    }) });
  });
  var DOC_LIST = [];
  DOCS.forEach(function (g) {
    g.items.forEach(function (it) {
      var text = [it.t, it.lead].concat(it.blocks.map(function (b) {
        return [b.h, b.p, b.note, b.code, (b.ul || []).join(' '), (b.steps || []).join(' '),
          (b.table || []).map(function (r) { return r.join(' '); }).join(' '),
          (b.api || []).map(function (r) { return r[0] + ' ' + r[1]; }).join(' ')].filter(Boolean).join(' ');
      })).join(' ');
      DOC_LIST.push(Object.assign({ group: g.t, soon: !!g.soon, text: text.toLowerCase(), words: text.split(/\s+/).length }, it));
    });
  });

  var root = document.getElementById('m-app');
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function docMin(d) { return Math.max(1, Math.round(d.words / 160)); }
  function findDoc(id) { return DOC_LIST.filter(function (d) { return d.id === id; })[0]; }

  // ───── состояние ─────
  var S = {
    tab: 'home', stack: [], popping: false,
    dark: document.documentElement.getAttribute('data-theme') === 'dark',
    motion: lsGet('mnema-motion') !== 'off',
    queue: [0, 1, 2, 3, 4, 5], gone: {}, flips: {}, know: 0, again: 0,
    mins: 1, learned: false,
    gSel: null,
    filter: 'all', query: '', sheet: null,
    reps: [1, 3, 7, 16], methFlip: {},
    plat: /Windows|Win64|Macintosh|X11/.test(navigator.userAgent) && !/Android|iPhone|iPad/.test(navigator.userAgent) ? 'win' : 'android',
    docQ: ''
  };
  var REL = null;
  var A = { drag: null, gdrag: null, cdrag: null, edge: null, sdrag: null, gp: null, gW: 0, ringP: 0, pos: {}, pushed: 0 };
  var E = {};
  function M() { return S.motion && !reduce ? 1 : 0; }

  var ICON = {
    chevR: '<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"></path></svg>',
    chevD: function (size, open, rot) { return '<svg class="chev" style="transform: rotate(' + (open ? rot : 0) + 'deg)" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + (rot === 90 ? 'M9 6l6 6-6 6' : 'M6 9l6 6 6-6') + '"></path></svg>'; },
    dl: function (s) { return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11"></path><path d="M7 10l5 5 5-5"></path><path d="M5 20h14"></path></svg>'; },
    search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>',
    logo: function (cls) { return '<span class="mlogo ' + cls + '" aria-hidden="true"><span class="mlogo-bg"></span><svg viewBox="0 0 32 32"><path d="M8 23 V9.5 L16 18.5 L24 9.5 V23"></path></svg><span class="mlogo-dot"></span></span>'; },
    info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 11v5"></path><path d="M12 7.5v.5"></path></svg>',
    warn: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5l9.5 16.5h-19z"></path><path d="M12 10v4.5"></path><path d="M12 17.5v.5"></path></svg>'
  };

  // ───── адреса: те же, что у версии для компьютера ─────
  var TAB_HASH = { home: '#/', feat: '#/features', sci: '#/science', more: '#/more' };
  function layerHash(it) {
    if (!it) return TAB_HASH[S.tab];
    if (it.k === 'doc') return '#/docs/' + it.id;
    return '#/' + it.k;
  }
  function parseHash() {
    var parts = (location.hash || '').replace(/^#\/?/, '').split('/');
    var p = parts[0] || '';
    if (p === 'features') return { tab: 'feat', stack: [] };
    if (p === 'science') return { tab: 'sci', stack: [] };
    if (p === 'more') return { tab: 'more', stack: [] };
    if (p === 'updates') return { tab: 'home', stack: [{ k: 'updates', from: 'Главная' }] };
    if (p === 'download') return { tab: 'home', stack: [{ k: 'download', from: 'Главная' }] };
    if (p === 'docs') {
      var st = [{ k: 'docs', from: 'Ещё' }];
      if (parts[1] && findDoc(parts[1])) st.push({ k: 'doc', id: parts[1], from: 'Документация' });
      return { tab: 'more', stack: st };
    }
    return { tab: 'home', stack: [] };
  }
  function setHash(h, push) {
    if (location.hash === h || (h === '#/' && !location.hash)) return;
    try { history[push ? 'pushState' : 'replaceState'](null, '', h); } catch (e) {}
  }

  // ───── каркас ─────
  function buildShell() {
    root.innerHTML = '<div class="stage js" data-app><div class="phone" data-phone>' +
      '<div class="scroller" data-scroller></div>' +
      '<header class="bar" data-bar></header>' +
      '<button type="button" class="fab" data-fab data-act="download">' + ICON.dl(20) + 'Скачать</button>' +
      '<nav class="tabs" aria-label="Разделы"><span class="tab-pill" data-tab-pill></span>' +
        D.tabs.map(function (t) {
          return '<button type="button" class="tab" data-tab="' + t[0] + '" data-act="tab" data-arg="' + t[0] + '"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + t[2] + '"></path></svg><span>' + esc(t[1]) + '</span></button>';
        }).join('') +
      '</nav>' +
      '<div data-layers></div><div data-sheet-root></div>' +
      '</div></div>';
    E.stage = $('[data-app]', root); E.sc = $('[data-scroller]', root); E.bar = $('[data-bar]', root); E.fab = $('[data-fab]', root);
    E.layers = $('[data-layers]', root); E.sheetRoot = $('[data-sheet-root]', root);
    applyTheme();
  }

  function applyTheme() {
    var t = S.dark ? 'dark' : 'light';
    E.stage.setAttribute('data-theme', t);
    document.documentElement.setAttribute('data-theme', t);
    E.stage.classList.toggle('motion-off', !S.motion);
    var meta = $('meta[name="theme-color"]:not([media])');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
    meta.content = S.dark ? '#0E0F14' : '#F6F3EC';
  }

  function updateTabs() {
    var idx = Math.max(0, D.tabs.findIndex(function (t) { return t[0] === S.tab; }));
    $('[data-tab-pill]', root).style.transform = 'translateX(' + (idx * 100) + '%)';
    $$('[data-tab]', root).forEach(function (b) {
      var on = b.getAttribute('data-tab') === S.tab;
      b.classList.toggle('on', on && !S.stack.length);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
  }

  function renderBar() {
    E.bar.innerHTML = S.tab === 'home' ?
      '<button class="brand" type="button" data-logo data-act="logo" aria-label="Мнема">' + ICON.logo('play') + '<span>Мнема</span></button>' +
      '<button type="button" class="pill-btn" data-act="download">Скачать</button>' :
      '<span class="bar-title">' + esc(D.barTitles[S.tab]) + '</span>';
    E.fab.style.display = S.tab === 'home' ? '' : 'none';
  }

  // ───── вкладки ─────
  function screenHome() {
    var deck = D.deck.map(function (c, id) {
      return '<button type="button" class="swc" data-swc="' + id + '" aria-label="' + esc(c.q) + '. Нажми, чтобы перевернуть; смахни вправо — помню, влево — снова">' +
        '<span class="flip" style="transform: rotateY(0deg)"><span class="swf"><span style="display: flex; justify-content: space-between; align-items: center"><span class="tag">' + esc(c.subj) + '</span><span class="small mono">' + (id + 1) + ' / ' + D.deck.length + '</span></span>' +
        '<span class="serif swf-q">' + esc(c.q) + '</span><span class="small">Нажми — увидишь ответ</span></span>' +
        '<span class="swf back"><span class="tag">Ответ</span><span class="serif swf-q">' + esc(c.a) + '</span><span class="small">Вправо — помню · влево — снова</span></span></span>' +
        '<span class="stamp stamp-r" data-stamp="r">Помню</span><span class="stamp stamp-l" data-stamp="l">Снова</span></button>';
    }).join('');
    var words = D.words.split(' ').map(function (t, i) { return '<span class="w' + ((i >= 14 && i <= 20) ? ' hl' : '') + '" data-w aria-hidden="true">' + esc(t) + '</span>'; }).join('');
    var mins = D.mins.map(function (m, i) { return '<button type="button" role="tab" data-min="' + i + '" data-act="mins" data-arg="' + i + '">' + esc(m[0]) + '</button>'; }).join('');
    var gEdges = D.gEdges.map(function () { return '<span class="gedge" data-gedge></span>'; }).join('');
    var gNodes = D.gNodes.map(function (n, i) {
      return '<button type="button" class="gnode' + (n.s ? ' subj' : '') + (n.weak ? ' weak' : '') + '" data-gnode="' + i + '" aria-label="' + esc(n.t + (n.weak ? ', слабое место' : '')) + '">' + esc(n.t) + '</button>';
    }).join('');
    var tile = function (cls, feat, ico, icoCls, title, d, anim) {
      return '<button type="button" class="tile' + cls + '" data-act="sheet" data-arg="' + feat + '"><span class="ico' + icoCls + '"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ico + '</svg></span><b>' + title + '</b><span class="d">' + d + '</span>' + anim + '</button>';
    };

    return '<div class="screen">' +
      '<section class="hero">' +
        '<button type="button" class="eyebrow" data-act="push" data-arg="updates"><b>1.26</b><span>Wi-Fi-синхронизация зашифрована</span><span aria-hidden="true">›</span></button>' +
        '<h1 class="serif hero-h">Запоминай больше.<br><span class="accent-text">Учи меньше.</span></h1>' +
        '<p class="hero-p">Параграф → конспект → карточки → повторения по расписанию. Попробуй — смахни карточку.</p>' +
        '<div class="sw-wrap"><div class="sw-area">' + deck + '<div data-deck-done></div></div>' +
          '<div class="sw-btns">' +
            '<button type="button" class="round again" data-act="swipe-again" aria-label="Снова"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7"></path><path d="M4 4v4.5h4.5"></path></svg></button>' +
            '<button type="button" class="round know" data-act="swipe-know" aria-label="Помню"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"></path></svg></button>' +
            '<button type="button" class="round sm" data-act="flip-top" aria-label="Перевернуть"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h18"></path><path d="M7 8l-4 4 4 4"></path><path d="M17 8l4 4-4 4"></path></svg></button>' +
          '</div>' +
          '<div class="counter"><span class="cnt" data-cnt-left></span><span class="cnt" style="color: var(--good)" data-cnt-know></span><span class="cnt" style="color: var(--warm-text)" data-cnt-again></span></div>' +
        '</div>' +
        '<button type="button" class="btn primary wide" data-act="download" style="margin-top: 6px">' + ICON.dl(20) + 'Скачать бесплатно</button>' +
      '</section>' +
      '<div class="hs" style="margin-top: 16px"><span class="fact">Windows и Android</span><span class="fact">Без аккаунта</span><span class="fact">Без рекламы</span><span class="fact">Работает офлайн</span></div>' +

      '<section class="sec" style="padding-top: 90px; padding-bottom: 14px"><p class="words" data-words aria-label="' + esc(D.words) + '">' + words + '</p></section>' +

      '<section class="sec" data-reveal><div class="kicker">Сегодня</div><h2 class="serif sec-h">Одна кнопка. Остальное — расписание.</h2>' +
        '<p class="sec-p">Скажи, сколько у тебя минут, — Мнема наберёт ровно столько карточек.</p>' +
        '<div class="widget"><div class="w-top"><div class="ring" aria-hidden="true"><svg viewBox="0 0 118 118"><circle class="track" cx="59" cy="59" r="52"></circle><circle class="val" data-ring cx="59" cy="59" r="52"></circle></svg>' +
          '<div class="ring-c"><b data-ring-num>0</b><span class="small" style="margin-top: 4px" data-ring-total></span></div></div>' +
          '<div style="display: flex; flex-direction: column; gap: 4px; min-width: 0"><b style="font-size: 19px; letter-spacing: -0.01em" data-w-title></b><span class="small" style="font-size: 14px" data-w-sub></span></div></div>' +
          '<div class="seg" style="grid-template-columns: repeat(4, 1fr)" role="tablist" aria-label="Время на учёбу"><span class="seg-thumb" data-mins-thumb style="width: calc((100% - 4px) / 4)"></span>' + mins + '</div>' +
          '<button type="button" class="btn primary wide" data-act="learn" data-learn></button></div>' +
      '</section>' +

      '<section class="sec" data-reveal><div class="kicker">Как это работает</div><h2 class="serif sec-h">Четыре шага. Листай →</h2>' +
        '<div class="car" data-car style="margin-top: 14px">' +
          '<article class="car-card" data-car-card><div class="il"><div class="pg"><div class="scan"></div><i style="width: 70%; height: 9px; background: #CFC6B3"></i><i></i><i style="width: 92%"></i><i style="width: 84%"></i><i style="width: 60%"></i></div><span class="vf a"></span><span class="vf b"></span><span class="vf c"></span><span class="vf d"></span></div>' +
            '<span class="mono small">01 / 04</span><h3 class="serif">Сфотографируй параграф</h3><p>Мнема распознаёт страницы даже без интернета: находит жирное, рисунки и рамки «Запомните».</p></article>' +
          '<article class="car-card" data-car-card><div class="il"><div class="pg"><i style="width: 60%; height: 9px; background: #CFC6B3"></i><i style="width: 100%"></i><span class="hl" style="width: 70%"></span><i style="width: 90%"></i><span class="hl" style="width: 45%"></span><i style="width: 80%"></i><span class="hl" style="width: 60%"></span></div></div>' +
            '<span class="mono small">02 / 04</span><h3 class="serif">Важное подсветится само</h3><p>Определения, даты, имена и формулы. Пиши как в обычном редакторе — формулы собираются визуально.</p></article>' +
          '<article class="car-card" data-car-card><div class="il"><div class="mc m1">988</div><div class="mc m2">Владимир</div><div class="mc m3">Византия</div></div>' +
            '<span class="mono small">03 / 04</span><h3 class="serif">Из выделенного — в карточку</h3><p>Два действия на карточку или сразу набор из всего конспекта, разложенный по группам.</p></article>' +
          '<article class="car-card" data-car-card><div class="il"><div class="week"><span class="wd">Пн</span><span class="wd due d2">Вт</span><span class="wd">Ср</span><span class="wd due d3">Чт</span><span class="wd">Пт</span><span class="wd">Сб</span><span class="wd due d4">Вс</span></div></div>' +
            '<span class="mono small">04 / 04</span><h3 class="serif">Повторишь ровно вовремя</h3><p>Расписание решает, когда показать карточку, чтобы ты её не забыл. Тебе — одна кнопка «Учиться».</p></article>' +
        '</div><div class="dots"><span class="dot" data-dot></span><span class="dot" data-dot></span><span class="dot" data-dot></span><span class="dot" data-dot></span></div>' +
      '</section>' +

      '<section class="sec" data-reveal><div class="kicker">Всё для учёбы</div><h2 class="serif sec-h">Нажми на плитку.</h2>' +
        '<div class="tiles" style="margin-top: 14px">' +
          tile(' wide', 'photo', '<path d="M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"></path><circle cx="12" cy="12.5" r="3.5"></circle>', '', 'Фото учебника → конспект', 'Работает офлайн', '<span class="anim"><span class="typed"><span style="width: 100%"></span><span style="width: 82%"></span><span style="width: 64%"></span></span></span>') +
          tile('', 'formulas', '<path d="M18 6H7l6 6-6 6h11"></path>', '', 'Формулы', 'LaTeX и от руки', '<span class="anim serif" style="font-size: 22px">I = U / R</span>') +
          tile('', 'anyai', '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"></path>', ' c-ai', 'Любой ИИ', 'Свой ключ или модель', '<span class="anim" style="flex-wrap: wrap"><span class="chip">Claude</span><span class="chip">Gemini</span></span>') +
          tile('', 'poems', '<path d="M5 5h14M5 10h14M5 15h9M5 20h6"></path>', '', 'Стихи наизусть', 'Подсказки тают', '<span class="anim serif" style="font-size: 16px; color: var(--accent-text)">Я п… ч… м…</span>') +
          tile('', 'wifi', '<path d="M3 9a14 14 0 0 1 18 0M6 12.5a9.5 9.5 0 0 1 12 0M9 16a5 5 0 0 1 6 0"></path><path d="M12 19.5h.01"></path>', ' c-data', 'Синхронизация по Wi‑Fi', 'Шифруется кодом', '<span class="anim"><span class="wire"><span class="packet"></span><span class="packet"></span></span></span>') +
          tile(' wide', 'anki', '<path d="M7 7h11l-3-3M17 17H6l3 3"></path>', ' c-data', 'Anki ⇄ Мнема ⇄ Obsidian', 'Данные в открытых форматах — ты не привязан', '<span class="anim" style="flex-wrap: wrap"><span class="chip mono">.apkg</span><span class="chip mono">.md</span><span class="chip mono">.mnema</span></span>') +
        '</div>' +
        '<button type="button" class="pill-btn" style="margin: 14px 16px 0; background: var(--bg2); color: var(--ink); height: 44px; width: calc(100% - 32px)" data-act="tab" data-arg="feat">Все возможности ›</button>' +
      '</section>' +

      '<section class="sec" data-reveal><div class="kicker">Карта знаний</div><h2 class="serif sec-h">Потяни любой узел.</h2>' +
        '<p class="sec-p">Общие понятия связывают темы разных предметов, слабые места подсвечены.</p>' +
        '<div class="graph" data-graph><span class="ghint">Тяни узлы пальцем · нажми — увидишь связи</span>' + gEdges + gNodes + '<div data-ginfo></div></div>' +
        '<button type="button" class="pill-btn" style="margin: 12px 16px 0; background: var(--bg2); color: var(--ink); height: 42px" data-act="shake">Встряхнуть</button>' +
      '</section>' +

      '<section class="sec" data-reveal><div class="cta">' +
        '<button type="button" class="mlogo-big" data-logo data-act="logo" aria-label="Показать анимацию логотипа">' + ICON.logo('auto') + '</button>' +
        '<h2 class="serif" style="font-size: 32px; line-height: 1.06; letter-spacing: -0.03em">Учёба, которая остаётся в голове.</h2>' +
        '<p style="font-size: 16px; opacity: .78">Бесплатно для Windows и Android. Обновляется сама — карточки сохраняются.</p>' +
        '<button type="button" class="btn primary wide" data-act="download" data-arg="android">Скачать для Android</button>' +
        '<button type="button" class="btn ghost wide" data-act="download" data-arg="win">Скачать для Windows</button>' +
      '</div><p class="small" style="text-align: center; padding: 22px 20px 0">© 2026 Мнема · открытый код</p></section>' +
    '</div>';
  }

  function screenFeat() {
    var pills = D.segs.map(function (g) { return '<button type="button" role="tab" class="pill" data-pill="' + g[0] + '" data-act="filter" data-arg="' + g[0] + '">' + esc(g[1]) + '</button>'; }).join('');
    return '<div class="screen"><h1 class="lt">Возможности</h1><p class="lead">В интерфейсе нет «cloze» и «FSRS» — только простые слова.</p>' +
      '<label class="search">' + ICON.search + '<span class="sr-only">Поиск по возможностям</span><input type="search" placeholder="Формулы, Anki, Wi-Fi…" value="' + esc(S.query) + '" data-input="query" enterkeyhint="search"></label>' +
      '<div class="pills" role="tablist" aria-label="Категории">' + pills + '</div>' +
      '<div class="group" data-flist></div><div data-fempty></div>' +
      '<p class="foot">Нажми на строку — расскажем подробнее и покажем, где это в приложении.</p></div>';
  }

  function featList() {
    var qy = (S.query || '').trim().toLowerCase();
    return D.feats.filter(function (f) { return (S.filter === 'all' || f.c === S.filter) && (!qy || (f.t + ' ' + f.d + ' ' + f.more).toLowerCase().indexOf(qy) >= 0); });
  }

  function renderFeats(animate) {
    var list = $('[data-flist]', E.sc); if (!list) return;
    var snap = animate ? snapRects('[data-fid]') : null;
    var fs = featList();
    $$('[data-pill]', E.sc).forEach(function (b) { var on = b.getAttribute('data-pill') === S.filter; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    list.style.display = fs.length ? '' : 'none';
    list.innerHTML = fs.map(function (f, i) {
      return '<button type="button" class="row' + (i ? ' sep' : '') + '" data-fid="' + f.id + '" data-act="sheet" data-arg="' + f.id + '"><span class="ico c-' + f.c + '"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + D.catIcons[f.c] + '"></path></svg></span>' +
        '<span class="rt"><b>' + esc(f.t) + '</b><span class="small">' + esc(f.d) + '</span></span>' + ICON.chevR + '</button>';
    }).join('');
    $('[data-fempty]', E.sc).innerHTML = fs.length ? '' : '<div style="text-align: center; padding: 40px 24px" class="muted"><b style="display: block; font-size: 18px; color: var(--ink)">Ничего не нашлось</b>Попробуй другое слово.<br><button type="button" class="pill-btn" style="margin-top: 14px" data-act="clear-query">Сбросить поиск</button></div>';
    if (snap) playFlip(snap);
  }

  function snapRects(sel) { var s = {}; $$(sel, root).forEach(function (el) { s[el.getAttribute('data-fid')] = el.getBoundingClientRect(); }); return s; }
  function playFlip(snap) {
    if (!M()) return;
    var n = 0;
    $$('[data-fid]', root).forEach(function (el) {
      if (!el.animate) return;
      var old = snap[el.getAttribute('data-fid')], now = el.getBoundingClientRect();
      if (old) { var dy = old.top - now.top; if (Math.abs(dy) > 1) el.animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }], { duration: 600, easing: 'cubic-bezier(.2,.9,.25,1.05)' }); }
      else el.animate([{ opacity: 0, transform: 'translateX(24px)' }, { opacity: 1, transform: 'none' }], { duration: 480, delay: (n++) * 30, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
    });
  }

  function accHtml(cls, open, head, body, rot, extraCls) {
    return '<div class="' + (extraCls || '') + '"><button type="button" class="' + cls + '" data-act="acc" data-rot="' + rot + '" aria-expanded="' + open + '">' + head + '</button>' +
      '<div class="acc" style="grid-template-rows: ' + (open ? '1fr' : '0fr') + '"><div>' + body + '</div></div></div>';
  }

  function screenSci() {
    var methods = D.methods.map(function (m, i) {
      return '<button type="button" class="mcard" data-act="methflip" data-arg="' + i + '" aria-label="' + esc(m.t) + ' — перевернуть"><span class="flip" style="transform: rotateY(0deg)">' +
        '<span class="mface"><span class="ev"><i><b style="width: ' + m.w + '"></b></i>' + esc(m.ev) + '</span><span style="font-size: 21px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.2">' + esc(m.t) + '</span><span class="small">' + esc(m.src) + '</span></span>' +
        '<span class="mface back"><span class="small" style="color: inherit; opacity: .7; font-weight: 600; letter-spacing: .06em; text-transform: uppercase">В Мнеме</span><span style="font-size: 18px; line-height: 1.35; font-weight: 500">' + esc(m.inapp) + '</span><span style="font-size: 12.5px; opacity: .7">Нажми — вернуть</span></span>' +
        '</span></button>';
    }).join('');
    var myths = D.myths.map(function (m, i) {
      return accHtml('acc-q', i === 0, '<span><s>' + esc(m.q) + '</s></span>' + ICON.chevD(20, i === 0, 180), '<p class="acc-a">' + esc(m.a) + '</p>', 180, i ? 'sep-top' : '');
    }).join('');
    var tx = function (x, y, t) { return '<text x="' + x + '" y="' + y + '" font-size="10" style="fill: var(--ink3)">' + t + '</text>'; };
    return '<div class="screen"><h1 class="lt">Наука</h1><p class="lead">Только то, что подтверждено исследованиями: вспоминать без подсказки и повторять с перерывами.</p>' +
      '<div class="curve-card"><div style="display: flex; flex-direction: column; gap: 4px"><b style="font-size: 20px; letter-spacing: -0.015em">Кривая забывания</b><span class="small" style="font-size: 14px; color: var(--ink2)">Коснись графика — добавишь повторение. Число на точке — день; точки можно двигать.</span></div>' +
        '<div class="curve-box" data-curve><svg viewBox="0 0 340 210" preserveAspectRatio="none" aria-hidden="true">' +
          '<line x1="26" y1="10" x2="334" y2="10" style="stroke: var(--line)"></line><line x1="26" y1="90" x2="334" y2="90" style="stroke: var(--line)"></line><line x1="26" y1="170" x2="334" y2="170" style="stroke: var(--line2)"></line>' +
          tx(0, 14, '100%') + tx(4, 94, '50%') + tx(8, 174, '0%') + tx(24, 192, '0') + tx(120, 192, '10 дней') + tx(228, 192, '20 дней') + tx(322, 192, '30') +
          '<path data-c="base" fill="none" stroke-width="2" stroke-dasharray="5 5" style="stroke: var(--warm)"></path><path data-c="area" stroke="none" style="fill: var(--accent-soft)"></path><path data-c="line" fill="none" stroke-width="3" stroke-linejoin="round" style="stroke: var(--accent-text)"></path>' +
        '</svg></div>' +
        '<div class="readout"><div><b class="accent-text" data-c-with></b><span class="small">с повторениями: <span data-c-count></span></span></div><div><b style="color: var(--warm-text)" data-c-without></b><span class="small">без повторений</span></div></div>' +
        '<div style="display: flex; gap: 8px"><button type="button" class="pill-btn" data-act="curve-preset">Как в Мнеме</button><button type="button" class="pill-btn" style="background: var(--bg2); color: var(--ink)" data-act="curve-reset">Сбросить</button></div>' +
        '<p class="small">Модель для наглядности: R = e^(−t/S); каждое повторение увеличивает прочность S. В Мнеме расписание считает алгоритм FSRS.</p></div>' +
      '<div style="padding-top: 40px"><div class="kicker">Приёмы</div><h2 class="serif sec-h" style="margin-bottom: 4px">Каждый — уже в Мнеме.</h2><p class="sec-p" style="margin-bottom: 8px">Нажми карточку — на обороте, где этот приём в приложении.</p><div class="mcar">' + methods + '</div></div>' +
      '<div style="padding-top: 30px"><div class="kicker">Мифов нет</div><h2 class="serif sec-h" style="margin-bottom: 14px">Что не работает.</h2><div class="group" style="margin-bottom: 8px">' + myths + '</div>' +
        '<p class="foot" style="margin-top: 12px">Источники: Dunlosky и др., 2013; Cepeda и др., 2008; Pashler и др., 2008; Rawson и Dunlosky; руководство Anki по FSRS.</p></div>' +
    '</div>';
  }

  var MORE = [
    { t: 'Скачать', d: 'Windows и Android', icon: 'M12 4v11M7 10l5 5 5-5M5 20h14', cls: '', k: 'download' },
    { t: 'Что нового', d: 'Версия ' + FALLBACK_VER, icon: 'M12 3l2.2 5.3L20 9l-4.4 3.8L17 18.5 12 15.6 7 18.5l1.4-5.7L4 9l5.8-.7z', cls: ' c-review', k: 'updates' },
    { t: 'Документация', d: 'От первой карточки до своих модов', icon: 'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19M9 7.5h6M9 11h4', cls: ' c-data', k: 'docs' },
    { t: 'Моды', d: 'Свои экраны и команды — документация на будущее', icon: 'M10 4h4v3a2 2 0 1 0 0 4v0h3v4h-3a2 2 0 1 0 0 4v1h-4v-3a2 2 0 1 0-4 0H3v-4h3a2 2 0 1 0 0-4V4z', cls: ' c-ai', k: 'doc', id: 'mods', soon: true }
  ];

  function screenMore() {
    var rows = MORE.map(function (r, i) {
      return '<button type="button" class="row' + (i ? ' sep' : '') + '" data-act="push" data-arg="' + r.k + '"' + (r.id ? ' data-doc="' + r.id + '"' : '') + '><span class="ico' + r.cls + '"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + r.icon + '"></path></svg></span>' +
        '<span class="rt"><b>' + esc(r.t) + '</b><span class="small"' + (r.k === 'updates' ? ' data-rel-ver-d' : '') + '>' + esc(r.k === 'updates' ? 'Версия ' + relVer() : r.d) + '</span></span>' + (r.soon ? '<span class="soon">скоро</span>' : '') + ICON.chevR + '</button>';
    }).join('');
    return '<div class="screen"><h1 class="lt">Ещё</h1>' +
      '<div class="about"><button type="button" class="mlogo-big" style="width: 60px; height: 60px" data-logo data-act="logo" aria-label="Показать анимацию логотипа">' + ICON.logo('play') + '</button>' +
        '<div style="display: flex; flex-direction: column; gap: 2px"><b style="font-size: 20px">Мнема ' + esc(relVer()) + '</b><span class="small" style="font-size: 14px">Windows и Android · без аккаунта и рекламы</span></div></div>' +
      '<div class="group">' + rows + '</div>' +
      '<div class="gtitle">Вид</div><div class="group">' +
        '<div class="row" style="cursor: default"><span class="rt"><b>Тёмная тема</b></span><button type="button" role="switch" class="switch' + (S.dark ? ' on' : '') + '" aria-checked="' + S.dark + '" aria-label="Тёмная тема" data-act="dark"><span class="knob"></span></button></div>' +
        '<div class="row sep" style="cursor: default"><span class="rt"><b>Анимации</b><span class="small">Выключи, если мешают</span></span><button type="button" role="switch" class="switch' + (S.motion ? ' on' : '') + '" aria-checked="' + S.motion + '" aria-label="Анимации" data-act="motion"><span class="knob"></span></button></div>' +
      '</div>' +
      '<div class="gtitle">Проект</div><div class="group">' +
        '<a class="row" style="text-decoration: none; color: inherit" href="https://github.com/' + REPO + '"><span class="rt"><b>GitHub</b><span class="small">Исходный код</span></span>' + ICON.chevR + '</a>' +
        '<a class="row sep" style="text-decoration: none; color: inherit" href="https://github.com/' + REPO + '/releases"><span class="rt"><b>Выпуски</b><span class="small">Все версии и установщики</span></span>' + ICON.chevR + '</a>' +
      '</div><p class="foot">Вспоминать, а не перечитывать. Данные принадлежат ученику. Простые слова.</p></div>';
  }

  var SCREENS = { home: screenHome, feat: screenFeat, sci: screenSci, more: screenMore };
  var TITLES = { home: 'Мнема — запоминай больше, учи меньше', feat: 'Возможности — Мнема', sci: 'Наука — Мнема', more: 'Ещё — Мнема' };

  function renderTab() {
    E.sc.innerHTML = SCREENS[S.tab]();
    E.sc.scrollTop = A.pos[S.tab] || 0;
    A.gp = null;
    renderBar(); updateTabs();
    if (!S.stack.length) document.title = TITLES[S.tab];
    if (S.tab === 'home') { updateDeck(); updateWidget(); updateGraphSel(); }
    if (S.tab === 'feat') renderFeats(false);
    if (S.tab === 'sci') renderCurve();
    scan();
  }

  // ───── карточки ─────
  function updateDeck() {
    var els = $$('[data-swc]', E.sc); if (!els.length) return;
    els.forEach(function (el) {
      var id = +el.getAttribute('data-swc'), pos = S.queue.indexOf(id), gone = S.gone[id], tf, op = 1, z = 1;
      if (gone === 'right' || (!gone && pos < 0)) { tf = 'translate(130%, -40px) rotate(22deg)'; op = 0; }
      else if (gone === 'left') { tf = 'translate(-130%, -40px) rotate(-22deg)'; op = 0; }
      else { var p = Math.min(pos, 3); tf = 'translate(0px, ' + (p * 14) + 'px) scale(' + (1 - p * 0.055) + ')'; op = pos > 2 ? 0 : 1; z = 50 - pos; }
      var top = pos === 0 && !gone;
      el.style.transform = tf; el.style.opacity = op; el.style.zIndex = z;
      el.style.pointerEvents = top ? 'auto' : 'none'; el.tabIndex = top ? 0 : -1;
      $('.flip', el).style.transform = S.flips[id] ? 'rotateY(180deg)' : 'rotateY(0deg)';
    });
    $('[data-cnt-left]', E.sc).textContent = 'Осталось ' + S.queue.length;
    $('[data-cnt-know]', E.sc).textContent = 'Помню ' + S.know;
    $('[data-cnt-again]', E.sc).textContent = 'Снова ' + S.again;
    var done = $('[data-deck-done]', E.sc), isDone = !S.queue.length;
    if (!!done.firstChild !== isDone) {
      done.innerHTML = isDone ? '<div class="done-card"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="color: var(--good)"><circle cx="12" cy="12" r="10"></circle><path d="M7.5 12.5l3 3 6-6.5"></path></svg>' +
        '<h3 class="serif" style="font-size: 28px">Сессия окончена</h3><div class="stat-row"><div><b style="color: var(--good)">' + S.know + '</b><span class="small">помню</span></div><div><b style="color: var(--warm-text)">' + S.again + '</b><span class="small">доучил</span></div></div>' +
        '<button type="button" class="btn ghost" style="height: 42px; font-size: 15px" data-act="reset-deck">Ещё раз</button></div>' : '';
    }
  }
  function flipCard(id) { S.flips[id] = !S.flips[id]; updateDeck(); }
  function answer(id, kind) {
    if (S.queue[0] !== id) return;
    S.queue = S.queue.slice(1); S.gone[id] = kind === 'know' ? 'right' : 'left';
    if (kind === 'know') { S.know++; updateDeck(); return; }
    S.again++; updateDeck();
    setTimeout(function () { delete S.gone[id]; S.flips[id] = false; S.queue = S.queue.concat([id]); updateDeck(); }, 520);
  }

  // ───── виджет «Сегодня» ─────
  function updateWidget() {
    var mo = D.mins[S.mins];
    var thumb = $('[data-mins-thumb]', E.sc); if (!thumb) return;
    thumb.style.transform = 'translateX(' + (S.mins * 100) + '%)';
    $$('[data-min]', E.sc).forEach(function (b) { var on = +b.getAttribute('data-min') === S.mins; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    $('[data-ring-total]', E.sc).textContent = 'из ' + mo[1];
    $('[data-w-title]', E.sc).textContent = S.learned ? 'Сессия пройдена' : mo[1] + ' карточек на ' + mo[0].toLowerCase();
    $('[data-w-sub]', E.sc).textContent = S.learned ? 'Следующие повторения Мнема уже назначила' : mo[2];
    $('[data-learn]', E.sc).textContent = S.learned ? '✓ Готово — ещё раз' : 'Учиться';
  }

  // ───── карта знаний ─────
  function updateGraphSel() {
    var nodes = $$('[data-gnode]', E.sc); if (!nodes.length) return;
    var sel = S.gSel;
    nodes.forEach(function (el, i) { el.classList.toggle('sel', i === sel); });
    $$('[data-gedge]', E.sc).forEach(function (el, k) { el.classList.toggle('hot', sel != null && (D.gEdges[k][0] === sel || D.gEdges[k][1] === sel)); });
    var box = $('[data-ginfo]', E.sc), n = sel != null ? D.gNodes[sel] : null;
    if (!n) { box.innerHTML = ''; return; }
    var links = D.gEdges.filter(function (e) { return e[0] === sel || e[1] === sel; }).map(function (e) { return D.gNodes[e[0] === sel ? e[1] : e[0]].t; });
    box.innerHTML = '<div class="ginfo"><div class="small">' + esc(n.g) + '</div><b style="font-size: 17px">' + esc(n.t) + '</b>' +
      '<div style="font-size: 14px; font-weight: 500; color: ' + (n.weak ? 'var(--warm-text)' : 'var(--good)') + '">' + (n.weak ? 'Слабое место — стоит повторить' : (n.s ? 'Предмет' : 'Помнишь хорошо')) + '</div>' +
      '<div class="small" style="margin-top: 2px">Связано: ' + esc(links.join(', ')) + '</div></div>';
  }

  // ───── кривая ─────
  function curvePts(reps) {
    var rs = reps.slice().sort(function (a, b) { return a - b; }), pts = [], Sx = 1.5, last = 0, ri = 0;
    for (var tt = 0; tt <= 30.0001; tt += 0.25) {
      while (ri < rs.length && rs[ri] <= tt) { pts.push([rs[ri], Math.exp(-(rs[ri] - last) / Sx)]); Sx *= 2.3; last = rs[ri]; ri++; pts.push([last, 1]); }
      pts.push([tt, Math.exp(-(tt - last) / Sx)]);
    }
    return pts;
  }
  function cX(d) { return 26 + d / 30 * 308; }
  function cY(R) { return 10 + (1 - R) * 160; }
  function fmtDay(d) { return d % 1 ? d.toFixed(1).replace('.', ',') : String(d); }
  function renderCurve() {
    var box = $('[data-curve]', E.sc); if (!box) return;
    var pts = curvePts(S.reps), base = curvePts([]);
    var toD = function (ps) { return ps.map(function (p, i) { return (i ? 'L' : 'M') + cX(p[0]).toFixed(1) + ' ' + cY(p[1]).toFixed(1); }).join(' '); };
    var line = toD(pts);
    $('[data-c="line"]', box).setAttribute('d', line);
    $('[data-c="area"]', box).setAttribute('d', line + ' L334 170 L26 170 Z');
    $('[data-c="base"]', box).setAttribute('d', toD(base));
    var pct = function (r) { return (r < 0.01 ? '≈0' : Math.round(r * 100)) + '%'; };
    $('[data-c-with]', E.sc).textContent = pct(pts[pts.length - 1][1]);
    $('[data-c-without]', E.sc).textContent = pct(base[base.length - 1][1]);
    $('[data-c-count]', E.sc).textContent = S.reps.length;
    var dots = $$('.cdot', box);
    while (dots.length > S.reps.length) dots.pop().remove();
    while (dots.length < S.reps.length) { var b = document.createElement('button'); b.type = 'button'; b.className = 'cdot'; box.appendChild(b); dots.push(b); }
    S.reps.forEach(function (d, i) {
      var el = dots[i];
      el.setAttribute('data-dot', i);
      el.style.left = (cX(d) / 340 * 100).toFixed(3) + '%'; el.style.top = (cY(1) / 210 * 100).toFixed(3) + '%';
      el.textContent = fmtDay(d); el.setAttribute('aria-label', 'Повторение в день ' + fmtDay(d));
    });
  }
  function dayAt(clientX) {
    var r = $('[data-curve]', E.sc).getBoundingClientRect();
    return clamp(Math.round((((clientX - r.left) / r.width * 340 - 26) / 308 * 30) * 2) / 2, 0.5, 29.5);
  }

  // ───── экраны со стеком ─────
  function relVer() { return REL ? REL.ver : FALLBACK_VER; }
  function relFile(kind) {
    if (REL && REL[kind] && REL[kind].name) return REL[kind].name;
    return kind === 'win' ? 'Mnema-Setup-' + relVer() + '.exe' : 'Mnema-' + relVer() + '-Android.apk';
  }
  function relUrl(kind) { return (REL && REL[kind] && REL[kind].url) || RELEASES; }

  function layerTitle(it) {
    if (it.k === 'updates') return 'Что нового';
    if (it.k === 'download') return 'Скачать';
    if (it.k === 'docs') return 'Документация';
    var d = findDoc(it.id); return d ? d.t : 'Документация';
  }

  function layerBody(it) {
    if (it.k === 'updates') {
      return '<div class="lpage"><h1 class="lt">Что нового</h1><p class="lead">Раз в день Мнема сама проверяет выпуски. Карточки и настройки при обновлении сохраняются.</p>' +
        D.versions.map(function (v, i) {
          return '<div class="vcard">' + accHtml('vhead', i === 0, '<span class="vnum">' + esc(v.v) + '</span><span style="flex: 1; font-size: 16px; font-weight: 600; line-height: 1.3">' + esc(v.t) + '</span>' + ICON.chevD(20, i === 0, 180),
            '<ul>' + v.items.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>', 180).replace(/^<div class="">|<\/div>$/g, '') + '</div>';
        }).join('') +
        '<p class="foot" style="margin-top: 14px"><a href="https://github.com/' + REPO + '/releases" style="color: var(--accent-text)">Все выпуски на GitHub ›</a></p></div>';
    }
    if (it.k === 'download') {
      return '<div class="lpage" style="padding-bottom: 0"><h1 class="lt">Скачать</h1><p class="lead" data-dl-lead></p>' +
        '<div class="seg" role="tablist" aria-label="Платформа" style="grid-template-columns: repeat(2, 1fr); margin: 0 16px 6px"><span class="seg-thumb" data-plat-thumb style="width: calc((100% - 4px) / 2)"></span>' +
          '<button type="button" role="tab" data-plat="android" data-act="plat" data-arg="android">Android</button><button type="button" role="tab" data-plat="win" data-act="plat" data-arg="win">Windows</button></div>' +
        '<div class="dev-stage"><div class="device" data-dev><div class="dscreen" data-dscreen>' +
          '<div class="dside" data-dside><span style="width: 80%"></span><span style="width: 60%"></span><span style="width: 70%"></span></div>' +
          '<div class="dmain"><b class="serif" style="font-size: 16px">Сегодня</b><div class="dbtn">Учиться</div><div class="dbar">История<i><b style="width: 72%"></b></i></div><div class="dbar">Физика<i><b style="width: 48%"></b></i></div><div class="dbar">Биология<i><b style="width: 86%"></b></i></div>' +
            '<div class="dtabs" data-dtabs><span style="color: var(--accent)">Учусь</span><span>Знания</span><span>Профиль</span></div></div>' +
        '</div><div class="base" data-dbase></div></div></div>' +
        '<div style="padding: 10px 20px 0"><h2 style="font-size: 22px; font-weight: 600; letter-spacing: -0.02em; margin-bottom: 14px" data-plat-title></h2><div data-plat-steps></div></div>' +
        '<h2 class="serif sec-h" style="font-size: 26px; margin-top: 40px; margin-bottom: 14px">Частые вопросы</h2>' +
        '<div class="group">' + D.faq.map(function (f, i) {
          return accHtml('acc-q', i === 0, '<span>' + esc(f.q) + '</span>' + ICON.chevD(18, i === 0, 90), '<p class="acc-a">' + esc(f.a) + '</p>', 90, i ? 'sep-top' : '');
        }).join('') + '</div>' +
        '<div class="dl-cta"><a class="btn primary wide" data-plat-cta href="' + RELEASES + '"></a></div></div>';
    }
    if (it.k === 'docs') {
      return '<div class="lpage"><h1 class="lt">Документация</h1><p class="lead">От первой карточки до своих модов — простыми словами.</p>' +
        '<label class="search">' + ICON.search + '<span class="sr-only">Поиск по документации</span><input type="search" placeholder="Wi-Fi, формулы, app.data…" value="' + esc(S.docQ) + '" data-input="docq" enterkeyhint="search"></label>' +
        '<div data-doc-groups>' + docGroupsHtml() + '</div></div>';
    }
    return docHtml(it.id);
  }

  function docGroupsHtml() {
    var dq = (S.docQ || '').trim().toLowerCase();
    var html = DOCS.map(function (g) {
      var items = g.items.filter(function (it) { return !dq || findDoc(it.id).text.indexOf(dq) >= 0; });
      if (!items.length) return '';
      return '<div class="gtitle" style="margin-top: 10px"><span>' + esc(g.t) + '</span>' + (g.soon ? '<span class="soon">скоро</span>' : '') + '</div><div class="group">' +
        items.map(function (it, j) {
          return '<button type="button" class="row' + (j ? ' sep' : '') + '" data-act="open-doc" data-arg="' + it.id + '"><span class="rt"><b>' + esc(it.t) + '</b><span class="small">~' + docMin(findDoc(it.id)) + ' мин</span></span>' + ICON.chevR + '</button>';
        }).join('') + '</div>';
    }).join('');
    return html || '<p class="foot">Ничего не нашлось.</p>';
  }

  var codeTexts = {};
  function toks(code) {
    var re = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|('(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`)|\b(export|default|const|let|var|return|async|await|if|else|for|of|new|function|true|false|null|try|catch|throw)\b|(\b\d+(?:\.\d+)?\b)/g;
    var out = '', last = 0, m;
    while ((m = re.exec(code))) {
      if (m.index > last) out += '<span class="tk-p">' + esc(code.slice(last, m.index)) + '</span>';
      out += '<span class="' + (m[1] ? 'tk-c' : m[2] ? 'tk-s' : m[3] ? 'tk-k' : 'tk-n') + '">' + esc(m[0]) + '</span>';
      last = m.index + m[0].length;
    }
    if (last < code.length) out += '<span class="tk-p">' + esc(code.slice(last)) + '</span>';
    return out;
  }
  function codeBlock(id, lang, text) {
    codeTexts[id] = text;
    return '<div class="d-code"><div class="d-code-h"><span>' + esc(lang) + '</span><button type="button" class="d-copy" data-act="copy" data-arg="' + esc(id) + '">Копировать</button></div><pre><code>' + toks(text) + '</code></pre></div>';
  }
  function segs(text) { return String(text).split('`').map(function (t, i) { return i % 2 ? '<code class="ic">' + esc(t) + '</code>' : esc(t); }).join(''); }

  function docHtml(id) {
    var di = Math.max(0, DOC_LIST.findIndex(function (d) { return d.id === id; })), doc = DOC_LIST[di], prev = DOC_LIST[di - 1], next = DOC_LIST[di + 1];
    var blocks = doc.blocks.map(function (b, bi) {
      if (b.h) return '<h3 class="d-h">' + esc(b.h) + '</h3>';
      if (b.p) return '<p class="d-p">' + segs(b.p) + '</p>';
      if (b.ul) return '<ul class="d-ul">' + b.ul.map(function (t) { return '<li>' + segs(t) + '</li>'; }).join('') + '</ul>';
      if (b.steps) return '<ol class="steps d-steps">' + b.steps.map(function (t) { return '<li><span>' + segs(t) + '</span></li>'; }).join('') + '</ol>';
      if (b.note) return '<div class="d-note' + (b.kind === 'warn' ? ' warn' : '') + '" role="note">' + (b.kind === 'warn' ? ICON.warn : ICON.info) + '<p style="margin: 0">' + segs(b.note) + '</p></div>';
      if (b.code) return codeBlock(doc.id + ':' + bi, b.lang, b.code);
      if (b.table) {
        var hasHead = !!(b.head && (b.head[0] || b.head[1]));
        return '<div class="d-table">' + (hasHead ? '<div class="d-tr head"><span>' + esc(b.head[0]) + '</span><span>' + esc(b.head[1]) + '</span></div>' : '') +
          b.table.map(function (r, ri) {
            return '<div class="d-tr' + ((hasHead || ri > 0) ? ' sep' : '') + '"><span class="' + (b.mono === 'a' ? 'ta mono-cell' : 'ta') + '">' + esc(r[0]) + '</span><span class="' + (b.mono === 'b' ? 'tb mono-cell' : 'tb') + '">' + segs(r[1]) + '</span></div>';
          }).join('') + '</div>';
      }
      if (b.api) {
        return '<div class="d-api">' + b.api.map(function (r, ri) {
          return '<div class="d-api-row"><button type="button" class="d-api-q" data-act="acc" data-rot="180" aria-expanded="false"><code>' + esc(r[0]) + '</code>' + ICON.chevD(18, false, 180) + '<span class="small">' + esc(r[1]) + '</span></button>' +
            '<div class="acc" style="grid-template-rows: 0fr"><div>' + (r[2] ? '<div class="d-api-body">' + codeBlock(doc.id + ':' + bi + ':' + ri, 'Пример', r[2]) + '</div>' : '') + '</div></div></div>';
        }).join('') + '</div>';
      }
      return '';
    }).join('');
    return '<div class="lpage"><div class="small" style="padding: 0 20px 8px">' + esc(doc.group) + '</div><h1 class="serif d-title">' + esc(doc.t) + '</h1>' +
      '<p class="d-lead">' + segs(doc.lead) + '</p><div class="d-meta">~' + docMin(doc) + ' мин чтения</div><div class="d-body">' + blocks + '</div>' +
      '<div class="d-pager">' + (next ? '<button type="button" class="d-pg next" data-act="doc-step" data-arg="' + next.id + '"><span class="small">Дальше →</span><b>' + esc(next.t) + '</b></button>' : '') +
        (prev ? '<button type="button" class="d-pg" data-act="doc-step" data-arg="' + prev.id + '"><span class="small">← Назад</span><b>' + esc(prev.t) + '</b></button>' : '') + '</div></div>';
  }

  function layerEl(it, i) {
    var el = document.createElement('section');
    el.className = 'layer';
    el.style.zIndex = 200 + i * 10;
    el.setAttribute('aria-label', layerTitle(it));
    el.innerHTML = '<div class="lbar"><button type="button" class="lback" data-act="back" aria-label="Назад: ' + esc(it.from || 'Назад') + '"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"></path></svg><span>' + esc(it.from || 'Назад') + '</span></button>' +
      '<span class="lbar-title" data-ltitle>' + esc(layerTitle(it)) + '</span><span class="lprog" data-lprog></span></div>' +
      '<div class="lscroll" data-pscroll>' + layerBody(it) + '</div><div class="edge" data-edge></div>';
    return el;
  }

  function afterLayer(el, it) {
    if (it.k === 'download') applyPlat(el, true);
    document.title = layerTitle(it) + ' — Мнема';
  }

  function push(it, noHistory) {
    if (S.popping) return;
    closeSheetNow();
    S.stack.push(it);
    var els = $$('.layer', E.layers);
    if (els.length) els[els.length - 1].classList.add('under');
    var el = layerEl(it, S.stack.length - 1);
    if (!M()) el.style.animation = 'none';
    E.layers.appendChild(el);
    afterLayer(el, it);
    updateTabs();
    if (!noHistory) { setHash(layerHash(it), true); A.pushed++; }
  }

  // снять верхний экран; fromHistory — если «Назад» уже сделал браузер
  function pop(fromHistory) {
    if (S.popping || !S.stack.length) return;
    if (!fromHistory && A.pushed > 0) { history.back(); return; }
    if (fromHistory) A.pushed = Math.max(0, A.pushed - 1);
    S.popping = true;
    var els = $$('.layer', E.layers), top = els[els.length - 1], under = els[els.length - 2];
    if (top) top.classList.add('leave');
    if (under) under.classList.remove('under');
    setTimeout(function () {
      if (top) top.remove();
      S.stack.pop(); S.popping = false;
      updateTabs();
      var it = S.stack[S.stack.length - 1];
      document.title = it ? layerTitle(it) + ' — Мнема' : TITLES[S.tab];
      if (!fromHistory) setHash(layerHash(it), false);
    }, M() ? 340 : 0);
  }

  function clearStack() {
    S.stack = []; S.popping = false; E.layers.innerHTML = '';
  }

  function replaceTopDoc(id) {
    var i = S.stack.length - 1, it = S.stack[i];
    S.stack[i] = { k: 'doc', id: id, from: it.from };
    var el = $$('.layer', E.layers)[i];
    $('[data-ltitle]', el).textContent = layerTitle(S.stack[i]);
    var sc = $('[data-pscroll]', el);
    sc.innerHTML = layerBody(S.stack[i]);
    sc.scrollTop = 0;
    if (sc.animate && M()) sc.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' });
    document.title = layerTitle(S.stack[i]) + ' — Мнема';
    setHash(layerHash(S.stack[i]), false);
  }

  function setTab(id) {
    if (S.stack.length) { clearStack(); A.pushed = 0; }
    if (id === S.tab && E.sc.firstChild) { E.sc.scrollTo({ top: 0, behavior: M() ? 'smooth' : 'auto' }); updateTabs(); setHash(TAB_HASH[id], false); return; }
    A.pos[S.tab] = E.sc.scrollTop;
    S.tab = id; closeSheetNow();
    renderTab();
    setHash(TAB_HASH[id], false);
  }

  // ───── страница «Скачать» ─────
  function applyPlat(el, first) {
    el = el || $$('.layer', E.layers).filter(function (l) { return $('[data-dev]', l); }).pop();
    if (!el) return;
    var win = S.plat === 'win', q = function (s) { return $(s, el); };
    var parts = $$('[data-dev],[data-dscreen],[data-dside],[data-dbase],[data-dtabs]', el);
    if (first) parts.forEach(function (p) { p.style.transition = 'none'; });
    q('[data-dl-lead]').textContent = 'Версия ' + relVer() + '. Бесплатно, без аккаунта и рекламы.';
    q('[data-plat-thumb]').style.transform = 'translateX(' + (win ? 100 : 0) + '%)';
    $$('[data-plat]', el).forEach(function (b) { var on = b.getAttribute('data-plat') === S.plat; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    var dev = q('[data-dev]');
    dev.style.width = win ? '300px' : '170px'; dev.style.height = win ? '196px' : '300px'; dev.style.borderRadius = win ? '14px' : '32px';
    q('[data-dscreen]').style.borderRadius = win ? '8px' : '25px';
    var side = q('[data-dside]'); side.style.width = win ? '58px' : '0px'; side.style.opacity = win ? 1 : 0; side.style.padding = win ? '10px 8px' : '10px 0px';
    var base = q('[data-dbase]'); base.style.width = win ? '116%' : '0%'; base.style.opacity = win ? 1 : 0;
    var tabs = q('[data-dtabs]'); tabs.style.opacity = win ? 0 : 1; tabs.style.transform = win ? 'translateY(30px)' : 'translateY(0px)';
    if (first) { void dev.offsetWidth; parts.forEach(function (p) { p.style.transition = ''; }); }
    q('[data-plat-title]').textContent = win ? 'Для Windows' : 'Для Android';
    q('[data-plat-steps]').innerHTML = win ?
      '<ol class="steps"><li><span><b>Скачай установщик</b><br><span class="muted mono" style="font-size: 13px">' + esc(relFile('win')) + '</span></span></li><li><span><b>Запусти и следуй установщику</b><br><span class="muted">Можно включить автозапуск и значок у часов.</span></span></li><li><span><b>Дальше — само</b><br><span class="muted">Мнема раз в день проверяет выпуски.</span></span></li></ol>' :
      '<ol class="steps"><li><span><b>Скачай APK на телефон</b><br><span class="muted mono" style="font-size: 13px">' + esc(relFile('android')) + '</span></span></li><li><span><b>Открой и разреши установку</b><br><span class="muted">Из этого источника — один раз.</span></span></li><li><span><b>Перенеси карточки с компьютера</b><br><span class="muted">По Wi-Fi: код из 12 знаков или QR.</span></span></li></ol>';
    var cta = q('[data-plat-cta]'); cta.textContent = win ? 'Скачать Mnema-Setup.exe' : 'Скачать APK'; cta.setAttribute('href', relUrl(win ? 'win' : 'android'));
  }

  // ───── шторка ─────
  var sheetT = null, sheetOpener = null;
  function openSheet(id) {
    clearTimeout(sheetT);
    var f = D.feats.filter(function (x) { return x.id === id; })[0]; if (!f) return;
    if (!S.sheet) sheetOpener = document.activeElement;
    S.sheet = id;
    var rel = D.feats.filter(function (x) { return x.c === f.c && x.id !== f.id; }).map(function (x) { return '<button type="button" class="pill" data-act="sheet" data-arg="' + x.id + '">' + esc(x.t) + '</button>'; }).join('');
    E.sheetRoot.innerHTML = '<div class="sheet-layer"><button type="button" class="scrim" aria-label="Закрыть" data-act="close-sheet"></button>' +
      '<div class="sheet" data-sheet role="dialog" aria-modal="true" aria-label="' + esc(f.t) + '"><div class="sheet-grab" data-sheet-grab></div>' +
      '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px"><span class="tag">' + esc(D.cats[f.c]) + '</span><button type="button" class="done-btn" data-act="close-sheet">Готово</button></div>' +
      '<h2 class="serif" style="font-size: 30px; line-height: 1.1; margin-bottom: 12px">' + esc(f.t) + '</h2><p style="font-size: 17px; color: var(--ink2); margin-bottom: 20px">' + esc(f.more) + '</p>' +
      '<div class="ios-group" style="margin-bottom: 18px"><div class="ios-row"><span class="muted">Где в Мнеме</span><b style="text-align: right">' + esc(f.where) + '</b></div><div class="ios-row sep"><span class="muted">Категория</span><b>' + esc(D.cats[f.c]) + '</b></div></div>' +
      '<div class="small" style="margin-bottom: 8px">Рядом в этой категории</div><div style="display: flex; flex-wrap: wrap; gap: 8px">' + rel + '</div></div></div>';
    var done = $('.done-btn', E.sheetRoot); if (done) done.focus({ preventScroll: true });
  }
  function closeSheet() {
    var layer = $('.sheet-layer', E.sheetRoot); if (!layer) return;
    layer.classList.add('closing');
    clearTimeout(sheetT);
    sheetT = setTimeout(function () {
      closeSheetNow();
      if (sheetOpener && sheetOpener.focus && document.contains(sheetOpener)) sheetOpener.focus({ preventScroll: true });
    }, M() ? 320 : 0);
  }
  function closeSheetNow() { clearTimeout(sheetT); S.sheet = null; if (E.sheetRoot) E.sheetRoot.innerHTML = ''; }

  // ───── поиск элементов, появление блоков ─────
  var io = null;
  function scan() {
    if (io) io.disconnect();
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }); }, { root: E.sc, threshold: 0.1, rootMargin: '0px 0px -4% 0px' });
      $$('[data-reveal]:not(.in)', E.sc).forEach(function (el) { io.observe(el); });
    } else $$('[data-reveal]', E.sc).forEach(function (el) { el.classList.add('in'); });
    E.car = $('[data-car]', E.sc); E.carCards = $$('[data-car-card]', E.sc); E.dots = $$('[data-dot]', E.sc);
    E.ring = $('[data-ring]', E.sc); E.ringNum = $('[data-ring-num]', E.sc);
    E.words = $('[data-words]', E.sc); E.wordEls = $$('[data-w]', E.sc);
    E.graph = $('[data-graph]', E.sc); E.gNodes = $$('[data-gnode]', E.sc); E.gEdges = $$('[data-gedge]', E.sc);
  }

  // ───── указатель ─────
  function pointerDown(e) {
    if (e.button != null && e.button > 0) return;
    var t = e.target; if (!t.closest) return;
    var swc = t.closest('.swc');
    if (swc) {
      var id = +swc.getAttribute('data-swc');
      if (S.queue[0] !== id) return;
      A.drag = { id: id, el: swc, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, moved: false, orig: swc.style.transform };
      swc.classList.add('drag');
      try { swc.setPointerCapture(e.pointerId); } catch (err) {}
      return;
    }
    var gn = t.closest('.gnode');
    if (gn) { A.gdrag = { i: +gn.getAttribute('data-gnode'), x0: e.clientX, y0: e.clientY, moved: false }; try { gn.setPointerCapture(e.pointerId); } catch (err) {} return; }
    var dot = t.closest('.cdot');
    if (dot) { A.cdrag = { i: +dot.getAttribute('data-dot') }; try { dot.setPointerCapture(e.pointerId); } catch (err) {} return; }
    if (t.closest('[data-curve]')) { A.cdrag = { i: null, x0: e.clientX, y0: e.clientY, moved: false }; return; }
    var edge = t.closest('[data-edge]');
    if (edge && !S.popping) { var el = edge.parentElement; A.edge = { el: el, x0: e.clientX, dx: 0 }; el.classList.add('dragging'); try { edge.setPointerCapture(e.pointerId); } catch (err) {} return; }
    var grab = t.closest('[data-sheet-grab]');
    if (grab) { var sh = grab.parentElement; A.sdrag = { el: sh, y0: e.clientY, dy: 0 }; sh.classList.add('dragging'); try { grab.setPointerCapture(e.pointerId); } catch (err) {} }
  }

  function pointerMove(e) {
    var dr = A.drag;
    if (dr) {
      dr.dx = e.clientX - dr.x0; dr.dy = e.clientY - dr.y0;
      if (Math.abs(dr.dx) + Math.abs(dr.dy) > 7) dr.moved = true;
      if (dr.moved) {
        dr.el.style.transform = 'translate(' + dr.dx + 'px,' + (dr.dy * 0.3) + 'px) rotate(' + (dr.dx * 0.06) + 'deg)';
        var sr = $('[data-stamp="r"]', dr.el), sl = $('[data-stamp="l"]', dr.el);
        if (sr) sr.style.opacity = clamp(dr.dx / 90, 0, 1);
        if (sl) sl.style.opacity = clamp(-dr.dx / 90, 0, 1);
      }
    }
    var g = A.gdrag;
    if (g && E.graph && A.gp) {
      var r = E.graph.getBoundingClientRect();
      if (Math.abs(e.clientX - g.x0) + Math.abs(e.clientY - g.y0) > 5) g.moved = true;
      var n = A.gp[g.i]; n.x = e.clientX - r.left; n.y = e.clientY - r.top; n.vx = 0; n.vy = 0;
    }
    var c = A.cdrag;
    if (c) {
      if (c.i == null) { if (Math.abs(e.clientX - c.x0) + Math.abs(e.clientY - c.y0) > 8) c.moved = true; }
      else { S.reps[c.i] = dayAt(e.clientX); renderCurve(); }
    }
    var ed = A.edge;
    if (ed) { ed.dx = Math.max(0, e.clientX - ed.x0); ed.el.style.transform = 'translateX(' + ed.dx + 'px)'; }
    var sd = A.sdrag;
    if (sd) { sd.dy = Math.max(0, e.clientY - sd.y0); sd.el.style.transform = 'translateY(' + sd.dy + 'px)'; }
  }

  function pointerUp(e) {
    var cancel = !!(e && e.type === 'pointercancel');
    var dr = A.drag;
    if (dr) {
      A.drag = null; dr.el.classList.remove('drag');
      var sr = $('[data-stamp="r"]', dr.el), sl = $('[data-stamp="l"]', dr.el);
      if (sr) sr.style.opacity = ''; if (sl) sl.style.opacity = '';
      if (!dr.moved) { if (!cancel) flipCard(dr.id); }
      else if (dr.dx > 90) answer(dr.id, 'know');
      else if (dr.dx < -90) answer(dr.id, 'again');
      else dr.el.style.transform = dr.orig;
    }
    var g = A.gdrag;
    if (g) { A.gdrag = null; if (!g.moved && !cancel) { S.gSel = S.gSel === g.i ? null : g.i; updateGraphSel(); } }
    var c = A.cdrag;
    if (c) {
      A.cdrag = null;
      if (c.i == null && !c.moved && !cancel && S.reps.length < 8) {
        var day = dayAt(c.x0);
        if (!S.reps.some(function (d) { return Math.abs(d - day) < 1; })) { S.reps.push(day); renderCurve(); }
      }
    }
    var ed = A.edge;
    if (ed) {
      A.edge = null; ed.el.classList.remove('dragging');
      if (ed.dx > 100 && !cancel) { ed.el.style.setProperty('--dx', ed.dx + 'px'); ed.el.style.transform = ''; pop(false); }
      else ed.el.style.transform = '';
    }
    var sd = A.sdrag;
    if (sd) {
      A.sdrag = null; sd.el.classList.remove('dragging');
      if (sd.dy > 110 && !cancel) { sd.el.style.setProperty('--dy', sd.dy + 'px'); sd.el.style.transform = ''; closeSheet(); }
      else sd.el.style.transform = '';
    }
  }

  // ───── анимации ─────
  function tick(t) {
    requestAnimationFrame(tick);
    try {
      var m = M(), sc = E.sc, y = sc.scrollTop, H = sc.clientHeight;
      E.bar.style.setProperty('--bg-a', Math.min(1, y / 24).toFixed(3));
      E.bar.style.setProperty('--t', clamp((y - 34) / 22, 0, 1).toFixed(3));
      var on = S.tab === 'home' && y > 520 && !S.stack.length;
      if (E.fab.classList.contains('show') !== on) E.fab.classList.toggle('show', on);
      if (!S.stack.length || S.popping) {
        doWords(H); doCarousel(m); doRing(); doGraph(t, m);
      }
      doLayers();
    } catch (err) { /* анимация не должна ронять страницу */ }
  }

  function doWords(H) {
    var el = E.words; if (!el || !E.wordEls.length) return;
    var r = el.getBoundingClientRect(), pr = E.sc.getBoundingClientRect();
    var p = clamp((H * 0.88 - (r.top - pr.top)) / (r.height + H * 0.3), 0, 1), N = E.wordEls.length;
    E.wordEls.forEach(function (w, i) { var o = (0.16 + 0.84 * clamp(p * (N + 6) - i, 0, 1)).toFixed(3); if (w._o !== o) { w._o = o; w.style.opacity = o; } });
  }

  function doCarousel(m) {
    var car = E.car; if (!car || !E.carCards.length) return;
    var cr = car.getBoundingClientRect(), mid = cr.left + cr.width / 2, best = 0, bd = 1e9;
    if (cr.bottom < 0 || cr.top > window.innerHeight) return;
    E.carCards.forEach(function (el, i) {
      var r = el.getBoundingClientRect(), d = (r.left + r.width / 2 - mid) / r.width, ad = Math.min(1, Math.abs(d));
      if (Math.abs(d) < bd) { bd = Math.abs(d); best = i; }
      el.style.transform = 'scale(' + (1 - ad * 0.09 * m).toFixed(3) + ') rotate(' + (d * 2.2 * m).toFixed(2) + 'deg)';
      el.style.opacity = (1 - ad * 0.5).toFixed(3);
    });
    E.dots.forEach(function (el, i) { var on = i === best; if (el.classList.contains('on') !== on) el.classList.toggle('on', on); });
  }

  function doRing() {
    if (!E.ring) return;
    var target = S.learned ? 1 : 0;
    A.ringP += (target - A.ringP) * (M() ? 0.07 : 1);
    if (Math.abs(target - A.ringP) < 0.001) A.ringP = target;
    E.ring.style.strokeDashoffset = (326.7 * (1 - A.ringP)).toFixed(2);
    if (E.ringNum) { var v = String(Math.round(D.mins[S.mins][1] * A.ringP)); if (E.ringNum.textContent !== v) E.ringNum.textContent = v; }
  }

  function doGraph(t, m) {
    var box = E.graph; if (!box || !E.gNodes.length) return;
    var r = box.getBoundingClientRect(), pr = E.sc.getBoundingClientRect();
    if (r.bottom < pr.top || r.top > pr.bottom) return;
    var W = r.width, H = r.height, N = E.gNodes.length, Ed = D.gEdges;
    if (!A.gp || A.gW !== W) {
      A.gW = W;
      A.gp = D.gNodes.map(function (n, i) {
        var a = i / N * Math.PI * 2, rad = n.s ? Math.min(W, H) * 0.2 : Math.min(W, H) * 0.36;
        return { x: W / 2 + Math.cos(a) * rad + (Math.random() - 0.5) * 20, y: H / 2 + Math.sin(a) * rad * 0.9 + (Math.random() - 0.5) * 20, vx: 0, vy: 0, w: E.gNodes[i].offsetWidth, h: E.gNodes[i].offsetHeight };
      });
    }
    var P = A.gp, F = P.map(function () { return [0, 0]; }), i, j;
    for (i = 0; i < N; i++) for (j = i + 1; j < N; j++) {
      var dx = P[j].x - P[i].x, dy = (P[j].y - P[i].y) * 1.3, d2 = dx * dx + dy * dy + 0.01, d = Math.sqrt(d2), f = Math.min(5, 9000 / d2);
      F[i][0] -= dx / d * f; F[i][1] -= dy / d * f; F[j][0] += dx / d * f; F[j][1] += dy / d * f;
    }
    Ed.forEach(function (e) {
      var a = e[0], b = e[1], dx = P[b].x - P[a].x, dy = P[b].y - P[a].y, d = Math.hypot(dx, dy) || 1, k = (d - 92) * 0.012;
      F[a][0] += dx / d * k; F[a][1] += dy / d * k; F[b][0] -= dx / d * k; F[b][1] -= dy / d * k;
    });
    for (i = 0; i < N; i++) {
      var n = P[i];
      F[i][0] += (W / 2 - n.x) * 0.0022; F[i][1] += (H / 2 - n.y) * 0.003;
      F[i][0] += Math.sin(t / 1400 + i * 2.1) * 0.03 * m; F[i][1] += Math.cos(t / 1700 + i) * 0.03 * m;
      if (A.gdrag && A.gdrag.i === i) continue;
      n.vx = (n.vx + F[i][0]) * 0.86; n.vy = (n.vy + F[i][1]) * 0.86; n.x += n.vx; n.y += n.vy;
      var hw = (n.w || 80) / 2 + 6, hh = (n.h || 34) / 2 + 6;
      if (n.x < hw) { n.x = hw; n.vx *= -0.5; } if (n.x > W - hw) { n.x = W - hw; n.vx *= -0.5; }
      if (n.y < hh + 26) { n.y = hh + 26; n.vy *= -0.5; } if (n.y > H - hh) { n.y = H - hh; n.vy *= -0.5; }
    }
    E.gNodes.forEach(function (el, i) { el.style.transform = 'translate(' + (P[i].x - (P[i].w || 0) / 2).toFixed(1) + 'px,' + (P[i].y - (P[i].h || 0) / 2).toFixed(1) + 'px)'; });
    E.gEdges.forEach(function (el, k) {
      var e = Ed[k]; if (!e) return;
      var a = P[e[0]], b = P[e[1]], dx = b.x - a.x, dy = b.y - a.y;
      el.style.width = Math.hypot(dx, dy).toFixed(1) + 'px';
      el.style.transform = 'translate(' + a.x.toFixed(1) + 'px,' + a.y.toFixed(1) + 'px) rotate(' + Math.atan2(dy, dx) + 'rad)';
    });
  }

  function doLayers() {
    $$('.layer', E.layers).forEach(function (l) {
      var sc = $('[data-pscroll]', l), bar = $('[data-lprog]', l); if (!sc || !bar) return;
      var max = sc.scrollHeight - sc.clientHeight, v = (max > 0 ? clamp(sc.scrollTop / max, 0, 1) : 0).toFixed(4);
      if (bar._v !== v) { bar._v = v; bar.style.transform = 'scaleX(' + v + ')'; }
    });
  }

  // ───── действия ─────
  function toggleAcc(btn) {
    var open = btn.getAttribute('aria-expanded') !== 'true', body = btn.nextElementSibling, chev = $('.chev', btn);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (body) body.style.gridTemplateRows = open ? '1fr' : '0fr';
    if (chev) chev.style.transform = 'rotate(' + (open ? btn.getAttribute('data-rot') : 0) + 'deg)';
  }
  function copyCode(btn) {
    var text = codeTexts[btn.getAttribute('data-arg')] || '';
    var set = function (label, ok) { btn.textContent = label; btn.classList.toggle('ok', !!ok); clearTimeout(btn._t); btn._t = setTimeout(function () { btn.textContent = 'Копировать'; btn.classList.remove('ok'); }, 1600); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { set('Скопировано', true); }, function () { set('Выдели вручную'); });
      else set('Выдели вручную');
    } catch (err) { set('Выдели вручную'); }
  }
  function replayLogo(el) {
    if (!el || !el.getAnimations || !M()) return;
    var as = el.getAnimations({ subtree: true });
    if (as.some(function (a) { return a.playState === 'running'; })) return;
    as.forEach(function (a) { a.currentTime = 0; a.play(); });
  }
  function topFrom() { return S.stack.length ? layerTitle(S.stack[S.stack.length - 1]) : D.barTitles[S.tab] === 'Мнема' ? 'Главная' : D.barTitles[S.tab]; }

  var ACT = {
    tab: function (el, a) { setTab(a); },
    push: function (el, a) {
      if (a === 'doc') push({ k: 'doc', id: el.getAttribute('data-doc'), from: topFrom() });
      else push({ k: a, from: topFrom() });
    },
    download: function (el, a) { if (a) S.plat = a; push({ k: 'download', from: topFrom() }); },
    back: function () { pop(false); },
    'open-doc': function (el, a) { push({ k: 'doc', id: a, from: 'Документация' }); },
    'doc-step': function (el, a) { replaceTopDoc(a); },
    logo: function (el) { replayLogo(el); },
    'swipe-know': function () { if (S.queue.length) answer(S.queue[0], 'know'); },
    'swipe-again': function () { if (S.queue.length) answer(S.queue[0], 'again'); },
    'flip-top': function () { if (S.queue.length) flipCard(S.queue[0]); },
    'reset-deck': function () { S.queue = [0, 1, 2, 3, 4, 5]; S.gone = {}; S.flips = {}; S.know = 0; S.again = 0; updateDeck(); },
    mins: function (el, a) { S.mins = +a; S.learned = false; updateWidget(); },
    learn: function () { S.learned = !S.learned; updateWidget(); },
    sheet: function (el, a) { openSheet(a); },
    'close-sheet': function () { closeSheet(); },
    shake: function () { if (A.gp) A.gp.forEach(function (n) { n.vx += (Math.random() - 0.5) * 40; n.vy += (Math.random() - 0.5) * 40; }); },
    filter: function (el, a) { if (a !== S.filter) { S.filter = a; renderFeats(true); } },
    'clear-query': function () { S.query = ''; S.filter = 'all'; var i = $('[data-input="query"]', E.sc); if (i) i.value = ''; renderFeats(true); },
    'curve-preset': function () { S.reps = [1, 3, 7, 16]; renderCurve(); },
    'curve-reset': function () { S.reps = []; renderCurve(); },
    methflip: function (el, a) { S.methFlip[a] = !S.methFlip[a]; $('.flip', el).style.transform = S.methFlip[a] ? 'rotateY(180deg)' : 'rotateY(0deg)'; },
    acc: function (el) { toggleAcc(el); },
    plat: function (el, a) { S.plat = a; applyPlat(null, false); },
    copy: function (el) { copyCode(el); },
    dark: function (el) {
      S.dark = !S.dark; applyTheme(); lsSet('mnema-theme', S.dark ? 'dark' : 'light');
      el.classList.toggle('on', S.dark); el.setAttribute('aria-checked', S.dark ? 'true' : 'false');
    },
    motion: function (el) {
      S.motion = !S.motion; applyTheme(); lsSet('mnema-motion', S.motion ? 'on' : 'off');
      el.classList.toggle('on', S.motion); el.setAttribute('aria-checked', S.motion ? 'true' : 'false');
    }
  };

  function onClick(e) {
    var t = e.target; if (!t.closest) return;
    if (e.detail === 0) { // клавиатура: карточка и узлы графа (мышь и палец идут через pointer-события)
      var swc = t.closest('.swc'); if (swc) { var id = +swc.getAttribute('data-swc'); if (S.queue[0] === id) flipCard(id); return; }
      var gn = t.closest('.gnode'); if (gn) { S.gSel = +gn.getAttribute('data-gnode'); updateGraphSel(); return; }
    }
    var a = t.closest('[data-act]');
    if (a && ACT[a.getAttribute('data-act')]) { if (a.tagName === 'A') e.preventDefault(); ACT[a.getAttribute('data-act')](a, a.getAttribute('data-arg')); }
  }
  function onInput(e) {
    var el = e.target, kind = el.getAttribute && el.getAttribute('data-input');
    if (kind === 'query') { S.query = el.value; renderFeats(true); }
    else if (kind === 'docq') { S.docQ = el.value; var g = $('[data-doc-groups]', el.closest('.layer')); if (g) g.innerHTML = docGroupsHtml(); }
  }
  function onKey(e) {
    if (e.key === 'Escape') { if (S.sheet) closeSheet(); else if (S.stack.length) pop(false); }
  }

  // «Назад» в браузере и жест «назад» на Android и iOS
  function onPopState() {
    if (S.sheet) closeSheetNow();
    var want = parseHash();
    if (S.stack.length > 0 && want.stack.length < S.stack.length) { pop(true); return; }
    A.pushed = 0;
    clearStack();
    if (want.tab !== S.tab) { A.pos[S.tab] = E.sc.scrollTop; S.tab = want.tab; renderTab(); }
    want.stack.forEach(function (it) { push(it, true); });
    updateTabs();
  }

  // ───── выпуск с GitHub ─────
  function loadRelease() {
    if (!window.fetch) return;
    fetch('https://api.github.com/repos/' + REPO + '/releases/latest', { headers: { Accept: 'application/vnd.github+json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.tag_name) return;
        var rel = { ver: String(j.tag_name).replace(/^v/i, '') };
        (j.assets || []).forEach(function (x) {
          if (/\.exe$/i.test(x.name)) rel.win = { name: x.name, url: x.browser_download_url };
          else if (/\.apk$/i.test(x.name)) rel.android = { name: x.name, url: x.browser_download_url };
        });
        REL = rel;
        applyPlat(null, false);
        var v = $('[data-rel-ver-d]', E.sc); if (v) v.textContent = 'Версия ' + relVer();
      })
      .catch(function () {});
  }

  // ───── запуск ─────
  function init() {
    buildShell();
    var r = parseHash();
    S.tab = r.tab;
    renderTab();
    r.stack.forEach(function (it) { push(it, true); });
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('pointerdown', pointerDown);
    window.addEventListener('pointermove', pointerMove, { passive: true });
    window.addEventListener('pointerup', pointerUp);
    window.addEventListener('pointercancel', pointerUp);
    window.addEventListener('keydown', onKey);
    window.addEventListener('popstate', onPopState);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () {
      if (A.gp) A.gp.forEach(function (n, i) { var el = E.gNodes[i]; if (el) { n.w = el.offsetWidth; n.h = el.offsetHeight; } });
    });
    requestAnimationFrame(tick);
    loadRelease();
  }

  init();
})();
