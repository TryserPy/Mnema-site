/* Сайт Мнемы: маршруты по hash (#/features, #/docs/sync …), страницы и анимации без сборки и зависимостей. */
(function () {
  'use strict';
  if (window.MNEMA_MOBILE) return; // на телефоне работает js/mobile.js

  var D = siteData();
  var DOCS = docsData();
  var REPO = 'TryserPy/Mnema';
  var RELEASES = 'https://github.com/' + REPO + '/releases/latest';
  var FALLBACK_VER = '1.26.0';

  var site = document.getElementById('site');
  var app = document.getElementById('app');
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var MOTION = reduce ? 0 : 1;

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  // ───── состояние ─────
  var S = {
    page: 'home', doc: 'install',
    dark: document.documentElement.getAttribute('data-theme') === 'dark',
    heroFlip: {},
    queue: [0, 1, 2, 3, 4, 5], gone: {}, flips: {}, know: 0, again: 0,
    gSel: 5,
    filter: 'all', query: '', sheet: null,
    reps: [1, 3, 7, 16],
    methFlip: {},
    plat: 'win',
    docQ: '', docNavOpen: false,
    lab: { sticky: true, pastel: true, big: false, glow: false },
    gen: { id: 'my-mod', name: 'Мой мод', version: '1.0', author: 'Я', desc: 'Что делает мод' }
  };
  var REL = null; // последний выпуск с GitHub, если удалось получить

  // анимационное состояние
  var A = {
    mx: 0, my: 0, tmx: 0, tmy: 0, px: -9999, py: -9999,
    sp: 0, vel: 0, mq: 0, mqDir: 1, lastSy: null,
    drag: null, gdrag: null, cdrag: null, gp: null, gW: 0, k: null, dp: null
  };
  var E = {}; // найденные на странице элементы

  // ───── маленькие SVG ─────
  var SVG = {
    chevDown: '<svg class="chev" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>',
    chevDownSm: '<svg class="chev" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>',
    chevDownXs: '<svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>',
    chevRight: '<svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>',
    download: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11"></path><path d="M7 10l5 5 5-5"></path><path d="M5 20h14"></path></svg>',
    search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>',
    info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 11v5"></path><path d="M12 7.5v.5"></path></svg>',
    warn: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5l9.5 16.5h-19z"></path><path d="M12 10v4.5"></path><path d="M12 17.5v.5"></path></svg>'
  };
  var NAV_LABEL_SHORT = { updates: 'Новое', features: 'Функции', docs: 'Доки' };

  // ───── маршруты ─────
  function pageHref(id) { return id === 'home' ? '#/' : '#/' + id; }

  function parseRoute() {
    var h = (location.hash || '').replace(/^#\/?/, '');
    var parts = h.split('/');
    var page = parts[0] || 'home';
    var known = D.pages.some(function (p) { return p[0] === page; });
    if (!known) page = 'home';
    var doc = null;
    if (page === 'docs' && parts[1] && DOC_LIST.some(function (d) { return d.id === parts[1]; })) doc = parts[1];
    return { page: page, doc: doc };
  }

  function navigate(hash) {
    if (location.hash === hash || (hash === '#/' && (location.hash === '' || location.hash === '#'))) {
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
      return;
    }
    location.hash = hash;
  }

  var DOC_LIST = [];
  DOCS.forEach(function (g) {
    g.items.forEach(function (it) {
      var text = [it.t, it.lead].concat(it.blocks.map(function (b) {
        return [b.h, b.p, b.note, b.code, (b.ul || []).join(' '), (b.steps || []).join(' '),
          (b.table || []).map(function (r) { return r.join(' '); }).join(' '),
          (b.api || []).map(function (r) { return r[0] + ' ' + r[1]; }).join(' ')].filter(Boolean).join(' ');
      })).join(' ');
      DOC_LIST.push(Object.assign({ group: g.t, text: text.toLowerCase(), words: text.split(/\s+/).length }, it));
    });
  });

  function onRoute() {
    var r = parseRoute();
    var samePage = (r.page === S.page) && app.firstChild;
    if (r.page === 'docs') S.doc = r.doc || 'install';
    if (samePage && r.page === 'docs') {
      S.docNavOpen = false;
      renderDocNav();
      renderDocArticle(true);
      return;
    }
    if (samePage) return;
    S.page = r.page;
    S.sheet = null; renderSheet();
    renderPage();
  }

  // ───── навигация, тема ─────
  function buildNav() {
    var links = D.pages.map(function (p) {
      return '<a class="navlink" data-navlink href="' + pageHref(p[0]) + '" data-page="' + p[0] + '">' + esc(p[1]) + '</a>';
    }).join('');
    $('#navlinks').insertAdjacentHTML('beforeend', links);
    $('#footer-nav').insertAdjacentHTML('beforeend', D.pages.map(function (p) {
      return '<a class="flink" href="' + pageHref(p[0]) + '">' + esc(p[1]) + '</a>';
    }).join(''));
    $('#tabbar').innerHTML = D.pages.map(function (p) {
      return '<a class="tab" href="' + pageHref(p[0]) + '" data-page="' + p[0] + '"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + D.icons[p[0]] + '"></path></svg><span>' + esc(NAV_LABEL_SHORT[p[0]] || p[1]) + '</span></a>';
    }).join('');
  }

  function updateNav() {
    $$('[data-page]').forEach(function (el) {
      var on = el.getAttribute('data-page') === S.page;
      el.classList.toggle('on', on);
      if (on) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
    });
    placePills();
  }

  function applyTheme() {
    var t = S.dark ? 'dark' : 'light';
    site.setAttribute('data-theme', t);
    document.documentElement.setAttribute('data-theme', t);
    var sw = $('#dark-switch');
    sw.classList.toggle('on', S.dark);
    sw.setAttribute('aria-checked', S.dark ? 'true' : 'false');
  }

  function placePill(pill, btn, inset) {
    if (!pill || !btn) return;
    var pr = pill.parentElement.getBoundingClientRect(), br = btn.getBoundingClientRect();
    if (!br.width) return;
    pill.style.width = br.width + 'px';
    pill.style.transform = 'translateX(' + (br.left - pr.left - inset) + 'px)';
  }

  function placePills() {
    var navI = Math.max(0, D.pages.findIndex(function (p) { return p[0] === S.page; }));
    placePill($('[data-navpill]'), $$('[data-navlink]')[navI], 0);
    var thumb = $('[data-seg-thumb]');
    if (thumb) {
      var segI = Math.max(0, D.segs.findIndex(function (s) { return s[0] === S.filter; }));
      placePill(thumb, $$('[data-seg]')[segI], 2);
    }
  }

  // ───── общие куски разметки ─────
  function acc(open) { return { rows: open ? '1fr' : '0fr', exp: open ? 'true' : 'false' }; }

  function segs(text) {
    return String(text).split('`').map(function (t, i) {
      return i % 2 ? '<code class="ic">' + esc(t) + '</code>' : esc(t);
    }).join('');
  }

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

  var codeTexts = {};
  function codeBlock(id, lang, text) {
    codeTexts[id] = text;
    return '<div class="d-code" data-code="' + esc(id) + '"><div class="d-code-h"><span>' + esc(lang) + '</span>' +
      '<button type="button" class="d-copy" data-act="copy" data-arg="' + esc(id) + '">Копировать</button></div>' +
      '<pre><code>' + toks(text) + '</code></pre></div>';
  }

  function accordion(opts) {
    // opts: head (html внутри кнопки), cls, body (html), open, rot
    var a = acc(opts.open);
    return '<button type="button" class="' + opts.cls + '"' + (opts.style ? ' style="' + opts.style + '"' : '') + ' data-act="acc" data-rot="' + opts.rot + '" aria-expanded="' + a.exp + '">' + opts.head + '</button>' +
      '<div class="acc" style="grid-template-rows: ' + a.rows + '"><div>' + opts.body + '</div></div>';
  }

  function toggleAcc(btn) {
    var open = btn.getAttribute('aria-expanded') !== 'true';
    var body = btn.nextElementSibling;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (body) body.style.gridTemplateRows = open ? '1fr' : '0fr';
    var chev = $('.chev', btn);
    if (chev) chev.style.transform = 'rotate(' + (open ? btn.getAttribute('data-rot') : 0) + 'deg)';
  }

  function chevStyle(open, rot) { return 'transform: rotate(' + (open ? rot : 0) + 'deg)'; }
  function withChev(svg, open, rot) { return svg.replace('class="chev"', 'class="chev" style="' + chevStyle(open, rot) + '"'); }

  // ───── страница: главная ─────
  function pageHome() {
    var hero = D.hero.map(function (c, i) {
      return '<button type="button" class="hcard" data-hero-card data-act="heroflip" data-arg="' + i + '" aria-label="' + esc(c.q) + ' — перевернуть карточку">' +
        '<span class="hcard-lift"><span class="flip" style="transform: rotateY(0deg)">' +
        '<span class="face"><span class="tag">' + esc(c.subj) + '</span><span class="serif" style="font-size: 30px; line-height: 1.12">' + esc(c.q) + '</span><span class="small">Нажми — перевернётся</span></span>' +
        '<span class="face back"><span class="tag">Ответ</span><span class="serif" style="font-size: 38px; line-height: 1.05">' + esc(c.a) + '</span><span class="small">Ещё раз — обратно</span></span>' +
        '</span></span></button>';
    }).join('');

    var marquee = D.marquee.concat(D.marquee).map(function (t) { return '<span class="mq-item">' + esc(t) + '</span>'; }).join('');
    var words = D.words.split(' ').map(function (t, i) {
      return '<span class="w' + ((i >= 14 && i <= 20) ? ' hl' : '') + '" data-w aria-hidden="true">' + esc(t) + '</span>';
    }).join('');

    var storyTexts = D.story.map(function (s) {
      return '<div class="st-text" data-st-text><span class="mono" style="font-size: 14px; color: var(--ink3)">' + s.n + ' / 04</span>' +
        '<h2 class="serif h-sec">' + esc(s.t) + '</h2><p class="lead">' + esc(s.d) + '</p></div>';
    }).join('');
    var storyChips = D.story.map(function (s, i) {
      return '<button type="button" class="st-chip" data-st-chip data-act="stage" data-arg="' + i + '">' + s.n + ' ' + esc(s.chip) + '</button>';
    }).join('');
    var storyCards = D.storyCards.map(function (c) {
      return '<div class="st" data-st="' + c.key + '" style="width: 220px; height: 130px; margin: -65px 0 0 -110px"><div class="mini"><span class="tag">История</span><b style="font-size: 16px; line-height: 1.25">' + esc(c.q) + '</b><span class="small">→ ' + esc(c.a) + '</span></div></div>';
    }).join('');
    var weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(function (t) { return '<span class="small" style="height: 18px; text-align: center; font-size: 12px">' + t + '</span>'; }).join('');
    var calDays = '';
    for (var i = 1; i <= 28; i++) calDays += '<span class="cal-d' + (i === 3 ? ' today' : ([4, 6, 10].indexOf(i) >= 0 ? ' due' : '')) + '">' + i + '</span>';

    var deck = D.deck.map(function (c, id) {
      return '<button type="button" class="swc" data-swc="' + id + '" aria-label="' + esc(c.q) + '. Нажми, чтобы перевернуть; смахни вправо — помню, влево — снова">' +
        '<span class="flip" style="transform: rotateY(0deg)">' +
        '<span class="swf"><span style="display: flex; justify-content: space-between; align-items: center"><span class="tag">' + esc(c.subj) + '</span><span class="small mono">' + (id + 1) + ' / ' + D.deck.length + '</span></span>' +
        '<span class="serif swf-q">' + esc(c.q) + '</span><span class="small">Нажми, чтобы увидеть ответ</span></span>' +
        '<span class="swf back"><span class="tag">Ответ</span><span class="serif swf-q">' + esc(c.a) + '</span><span class="small">Вправо — помню · влево — снова</span></span>' +
        '</span><span class="stamp stamp-r" data-stamp="r">Помню</span><span class="stamp stamp-l" data-stamp="l">Снова</span></button>';
    }).join('');

    var gEdges = D.gEdges.map(function () { return '<span class="gedge" data-gedge></span>'; }).join('');
    var gNodes = D.gNodes.map(function (n, i) {
      return '<button type="button" class="gnode' + (n.s ? ' subj' : '') + (n.weak ? ' weak' : '') + '" data-gnode="' + i + '" aria-label="' + esc(n.t + (n.weak ? ', слабое место' : '')) + '">' + esc(n.t) + '</button>';
    }).join('');

    var arrowFeat = function (cat) { return '<button type="button" class="tile-link" data-act="feat" data-arg="' + cat + '">Подробнее ›</button>'; };

    return '<main class="page" id="main" tabindex="-1">' +
      '<section class="wrap hero" data-hero>' +
        '<div class="hero-grid">' +
          '<div class="hero-copy">' +
            '<a class="eyebrow" href="#/updates"><b>1.26</b><span>Синхронизация по Wi-Fi теперь зашифрована</span><span aria-hidden="true">›</span></a>' +
            '<h1 class="serif h-display">Запоминай больше.<br><span class="accent-text">Учи меньше.</span></h1>' +
            '<p class="lead">Параграф учебника → конспект → карточки → повторения по расписанию. Мнема встраивает в учёбу то, что по исследованиям действительно работает.</p>' +
            '<div style="display: flex; flex-wrap: wrap; gap: 12px">' +
              '<a class="btn btn-primary" data-magnet data-dl="any" href="' + RELEASES + '">' + SVG.download + 'Скачать бесплатно</a>' +
              '<button type="button" class="btn btn-ghost" data-magnet data-act="demo">Попробовать прямо здесь</button>' +
            '</div>' +
            '<div class="facts"><span>Windows и Android</span><span>Без аккаунта</span><span>Без рекламы</span><span>Работает офлайн</span></div>' +
          '</div>' +
          '<div class="deck" data-deck><div class="deck-stage" data-deck-stage>' + hero + '</div></div>' +
        '</div>' +
      '</section>' +

      '<div class="marquee" aria-hidden="true"><div class="mq-track" data-marquee>' + marquee + '</div></div>' +

      '<section class="wrap sec-words" style="padding-top: 160px; padding-bottom: 120px"><p class="words" data-words aria-label="' + esc(D.words) + '">' + words + '</p></section>' +

      '<section class="pin" data-pin style="height: 3000px"><div class="pin-sticky"><div class="wrap story-grid">' +
        '<div style="display: flex; flex-direction: column; gap: 28px">' +
          '<div class="kicker">Как это работает</div>' +
          '<div class="st-texts">' + storyTexts + '</div>' +
          '<div class="st-bar"><span data-st-bar></span></div>' +
          '<div class="st-chips">' + storyChips + '</div>' +
        '</div>' +
        '<div class="stage-wrap" data-stage-wrap aria-hidden="true"><div class="stage" data-stage>' +
          '<div class="st" data-st="frame" style="width: 400px; height: 500px; margin: -250px 0 0 -200px"><span class="vf a"></span><span class="vf b"></span><span class="vf c"></span><span class="vf d"></span></div>' +
          '<div class="st" data-st="page" style="width: 340px; height: 440px; margin: -220px 0 0 -170px"><div class="tb-page" data-tb>' +
            '<div class="scanbar"></div><div class="tb-head">§ 12. Крещение Руси</div>' +
            '<p>В <span class="term">988 году</span> киевский князь <span class="term">Владимир</span> принял христианство по восточному обряду — из <span class="term">Византии</span>. Это укрепило связи Руси с соседними государствами и их культурой.</p>' +
            '<div class="tb-box"><b>Запомните:</b> крещение Руси — 988 г.</div>' +
            '<div class="tb-bars"><span style="width: 100%"></span><span style="width: 92%"></span><span style="width: 97%"></span><span style="width: 60%"></span></div>' +
          '</div></div>' +
          '<div class="st" data-st="cal" style="width: 420px; height: 290px; margin: -145px 0 0 -210px"><div class="cal">' +
            '<div style="height: 28px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; padding: 0 4px"><b style="font-size: 15px">Повторения</b><span class="small">сегодня → +1 → +3 → +7</span></div>' +
            '<div class="cal-grid" style="margin-bottom: 8px">' + weekdays + '</div><div class="cal-grid">' + calDays + '</div>' +
          '</div></div>' +
          storyCards +
        '</div></div>' +
      '</div></div></section>' +

      '<section id="demo" class="wrap sec-md" style="padding-top: 140px"><div class="demo-grid">' +
        '<div style="display: flex; flex-direction: column; gap: 22px" data-reveal>' +
          '<div class="kicker">Попробуй прямо здесь</div>' +
          '<h2 class="serif h-sec">Смахни карточку — как в Мнеме.</h2>' +
          '<p class="lead">Нажми, чтобы увидеть ответ. Вправо — «Помню», влево — «Снова». Карточка «Снова» вернётся в эту же сессию: доучивание сразу работает лучше, чем «потом как-нибудь».</p>' +
          '<div class="ios-group" style="max-width: 420px; background: var(--surface); border: 1px solid var(--line)">' +
            '<div class="ios-row"><span>Осталось в сессии</span><b class="mono" data-deck-left>6</b></div>' +
            '<div class="ios-row"><span>Помню</span><b class="mono" style="color: var(--good)" data-deck-know>0</b></div>' +
            '<div class="ios-row"><span>Снова</span><b class="mono" style="color: var(--warm-text)" data-deck-again>0</b></div>' +
          '</div>' +
        '</div>' +
        '<div style="display: flex; flex-direction: column; gap: 22px">' +
          '<div class="sw-area">' + deck + '<div data-deck-done></div></div>' +
          '<div class="sw-btns">' +
            '<button type="button" class="round again" data-act="swipe-again" aria-label="Снова"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7"></path><path d="M4 4v4.5h4.5"></path></svg></button>' +
            '<button type="button" class="round" data-act="flip-top" aria-label="Перевернуть"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h18"></path><path d="M7 8l-4 4 4 4"></path><path d="M17 8l4 4-4 4"></path></svg></button>' +
            '<button type="button" class="round know" data-act="swipe-know" aria-label="Помню"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"></path></svg></button>' +
          '</div>' +
        '</div>' +
      '</div></section>' +

      '<section class="wrap sec-lg" style="padding-top: 160px">' +
        '<div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 40px; max-width: 760px" data-reveal><div class="kicker">Всё для учёбы</div><h2 class="serif h-sec">Одно приложение вместо тетради, флешкарт и будильника.</h2></div>' +
        '<div class="bento">' +
          '<article class="tile t-4" data-tilt data-reveal><h3>Фото учебника → конспект</h3><p>Сфотографируй страницы — Мнема распознает текст даже без интернета, найдёт жирное, рисунки и рамки «Запомните».</p>' +
            '<div class="viz"><div class="typed"><span style="width: 100%"></span><span style="width: 86%"></span><span style="width: 94%"></span><span style="width: 52%"></span></div>' +
            '<div class="scanpic"><div class="scanbar"></div><span style="width: 70%; height: 12px; background: #CFC6B3"></span><span></span><span style="width: 94%"></span><span style="width: 88%"></span><span style="width: 60%"></span></div></div>' +
            arrowFeat('learn') + '</article>' +
          '<article class="tile t-2" data-tilt data-reveal><h3>Формулы</h3><p>Визуальный редактор, $…$ в тексте и формула от руки → LaTeX.</p>' +
            '<div class="viz" style="display: flex; flex-direction: column; justify-content: center; gap: 6px"><svg class="hand" width="220" height="50" viewBox="0 0 220 50" aria-hidden="true"><path d="M6 36 C 20 6, 34 6, 40 34 S 62 44, 70 18 M84 26 h22 M96 15 v22 M122 34 C 128 10, 150 8, 156 30 C 160 42, 176 40, 182 22 L 214 22"></path></svg><div class="formula">x = (−b ± √D) / 2a</div></div>' +
            arrowFeat('learn') + '</article>' +
          '<article class="tile t-2" data-tilt data-reveal><h3>Любой ИИ</h3><p>Свой ключ, модель на компьютере или любой сервис по API.</p>' +
            '<div class="viz chips" style="align-content: center"><span class="chip">Claude</span><span class="chip">Gemini</span><span class="chip">LM Studio</span><span class="chip">OpenRouter</span><span class="chip">DeepSeek</span><span class="chip">Ollama</span></div>' +
            arrowFeat('ai') + '</article>' +
          '<article class="tile t-2" data-tilt data-reveal><h3>Стихи наизусть</h3><p>Подсказки тают до первых букв.</p>' +
            '<div class="viz" style="display: flex; align-items: center"><div class="poem"><div class="full">Я помню чудное мгновенье:<br>Передо мной явилась ты,</div><div class="cue" aria-hidden="true">Я п… ч… м…:<br>П… м… я… т…,</div></div></div>' +
            arrowFeat('learn') + '</article>' +
          '<article class="tile t-2" data-tilt data-reveal><h3>Синхронизация по Wi\u2011Fi</h3><p>Код из 12 знаков, всё шифруется AES-GCM.</p>' +
            '<div class="viz" style="display: flex; flex-direction: column; justify-content: center; gap: 18px"><div class="code">K7QM-2XPA-9RTD</div><div class="wire">' +
              '<span class="dev"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="12" rx="2"></rect><path d="M8 20h8"></path></svg></span>' +
              '<span class="wire-line"><span class="packet"></span><span class="packet"></span><span class="packet"></span></span>' +
              '<span class="dev"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="7" y="3" width="10" height="18" rx="2.5"></rect><path d="M11 18h2"></path></svg></span>' +
            '</div></div>' + arrowFeat('data') + '</article>' +
          '<article class="tile t-3" data-tilt data-reveal><h3>Anki ⇄ Мнема ⇄ Obsidian</h3><p>Импорт колод с прогрессом и картинками, экспорт обратно. Данные — в открытых форматах, ты не привязан к Мнеме.</p>' +
            '<div class="viz chips" style="align-content: flex-end"><span class="chip mono">.apkg</span><span class="chip mono">.colpkg</span><span class="chip mono">.anki2</span><span class="chip mono">.md</span><span class="chip mono">.mnema</span></div>' +
            arrowFeat('data') + '</article>' +
          '<article class="tile t-3" data-tilt data-reveal style="background: var(--ink); color: var(--bg); border-color: transparent"><h3>Данные принадлежат тебе</h3><p style="color: inherit; opacity: .78">Всё хранится на устройстве. Аккаунт не нужен, рекламы нет. Автокопия каждый день, корзина на 30 дней.</p>' +
            '<div class="viz" style="display: flex; align-items: flex-end"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2.5"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path><circle cx="12" cy="16" r="1.3"></circle></svg></div>' +
            '<button type="button" class="tile-link" style="color: inherit" data-act="feat" data-arg="data">Подробнее ›</button></article>' +
        '</div>' +
      '</section>' +

      '<section class="wrap sec-lg" style="padding-top: 160px">' +
        '<div style="display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 32px" data-reveal>' +
          '<div style="display: flex; flex-direction: column; gap: 16px; max-width: 680px"><div class="kicker">Карта знаний</div><h2 class="serif h-sec">Потяни любой узел.</h2>' +
          '<p class="lead">Предметы → темы → понятия. Общие понятия связывают темы разных предметов, слабые места подсвечены. Нажми на узел — увидишь, с чем он связан.</p></div>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-act="shake">Встряхнуть</button>' +
        '</div>' +
        '<div class="graph" data-graph data-reveal>' + gEdges + gNodes +
          '<div class="legend"><span><i style="background: var(--accent)"></i>предмет</span><span><i style="background: var(--warm)"></i>слабое место</span></div>' +
          '<div data-ginfo></div>' +
        '</div>' +
      '</section>' +

      '<section class="wrap sec-lg" style="padding-top: 160px">' +
        '<div class="cta" data-spot data-reveal>' +
          '<button type="button" class="mlogo-big" data-logo data-act="logo" aria-label="Мнема — показать анимацию логотипа"><span class="mlogo auto" aria-hidden="true"><span class="mlogo-bg"></span><svg viewBox="0 0 32 32"><path d="M8 23 V9.5 L16 18.5 L24 9.5 V23"></path></svg><span class="mlogo-dot"></span></span></button>' +
          '<h2 class="serif h-large" style="max-width: 860px">Учёба, которая остаётся в голове.</h2>' +
          '<p style="font-size: 19px; opacity: .78; max-width: 520px">Бесплатно для Windows и Android. Обновляется сама — карточки и настройки сохраняются.</p>' +
          '<div style="display: flex; flex-wrap: wrap; gap: 12px; justify-content: center">' +
            '<a class="btn btn-primary" data-magnet data-dl="win" href="' + RELEASES + '">Скачать для Windows</a>' +
            '<a class="btn btn-ghost" data-magnet data-dl="android" href="' + RELEASES + '">Скачать для Android</a>' +
          '</div>' +
        '</div>' +
      '</section>' +
    '</main>';
  }

  function initHome() {
    updateDeck();
    updateGraphSel();
  }

  // ───── swipe-демо ─────
  function updateDeck() {
    var els = $$('[data-swc]');
    if (!els.length) return;
    els.forEach(function (el) {
      var id = +el.getAttribute('data-swc');
      var pos = S.queue.indexOf(id), gone = S.gone[id];
      var tf, op = 1, z = 1;
      if (gone === 'right') { tf = 'translate(130%, -50px) rotate(22deg)'; op = 0; }
      else if (gone === 'left') { tf = 'translate(-130%, -50px) rotate(-22deg)'; op = 0; }
      else if (pos < 0) { tf = 'translate(130%, -50px) rotate(22deg)'; op = 0; }
      else { var p = Math.min(pos, 3); tf = 'translate(0px, ' + (p * 16) + 'px) scale(' + (1 - p * 0.05) + ')'; op = pos > 2 ? 0 : 1; z = 50 - pos; }
      var top = pos === 0 && !gone;
      el.style.transform = tf; el.style.opacity = op; el.style.zIndex = z;
      el.style.pointerEvents = top ? 'auto' : 'none';
      el.tabIndex = top ? 0 : -1;
      $('.flip', el).style.transform = S.flips[id] ? 'rotateY(180deg)' : 'rotateY(0deg)';
    });
    $('[data-deck-left]').textContent = S.queue.length;
    $('[data-deck-know]').textContent = S.know;
    $('[data-deck-again]').textContent = S.again;
    var done = $('[data-deck-done]'), isDone = S.queue.length === 0;
    if (!!done.firstChild !== isDone) {
      done.innerHTML = isDone ?
        '<div class="done-card"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="color: var(--good)"><circle cx="12" cy="12" r="10"></circle><path d="M7.5 12.5l3 3 6-6.5"></path></svg>' +
        '<h3 class="serif" style="font-size: 30px">Сессия окончена</h3>' +
        '<div class="stat-row"><div><b style="color: var(--good)" data-done-know>' + S.know + '</b><span class="small">помню</span></div><div><b style="color: var(--warm-text)" data-done-again>' + S.again + '</b><span class="small">доучил</span></div></div>' +
        '<p class="small" style="max-width: 240px">В Мнеме следующее повторение назначит расписание — тебе останется нажать «Учиться».</p>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="reset-deck">Ещё раз</button></div>' : '';
    }
  }

  function flipCard(id) { S.flips[id] = !S.flips[id]; updateDeck(); }

  function answer(id, kind) {
    if (S.queue[0] !== id) return;
    S.queue = S.queue.slice(1);
    S.gone[id] = kind === 'know' ? 'right' : 'left';
    if (kind === 'know') { S.know++; updateDeck(); return; }
    S.again++;
    updateDeck();
    setTimeout(function () {
      delete S.gone[id];
      S.flips[id] = false;
      S.queue = S.queue.concat([id]);
      updateDeck();
    }, 520);
  }

  // ───── карта знаний ─────
  function updateGraphSel() {
    var nodes = $$('[data-gnode]');
    if (!nodes.length) return;
    var sel = S.gSel;
    nodes.forEach(function (el, i) { el.classList.toggle('sel', i === sel); });
    $$('[data-gedge]').forEach(function (el, k) { el.classList.toggle('hot', D.gEdges[k][0] === sel || D.gEdges[k][1] === sel); });
    var box = $('[data-ginfo]'), n = sel != null ? D.gNodes[sel] : null;
    if (!n) { box.innerHTML = ''; return; }
    var links = D.gEdges.filter(function (e) { return e[0] === sel || e[1] === sel; }).map(function (e) { return D.gNodes[e[0] === sel ? e[1] : e[0]].t; });
    box.innerHTML = '<div class="ginfo"><div class="small">' + esc(n.g) + '</div><div style="font-size: 20px; font-weight: 600; margin: 2px 0 6px">' + esc(n.t) + '</div>' +
      '<div style="font-size: 15px; color: ' + (n.weak ? 'var(--warm-text)' : 'var(--good)') + '; font-weight: 500">' + (n.weak ? 'Слабое место — стоит повторить' : (n.s ? 'Предмет' : 'Помнишь хорошо')) + '</div>' +
      '<div class="small" style="margin-top: 8px">Связано: ' + esc(links.join(', ')) + '</div></div>';
  }

  // ───── страница: возможности ─────
  function featsAll() { return D.feats.map(function (f, i) { return Object.assign({}, f, { num: (i < 9 ? '0' : '') + (i + 1) }); }); }

  function pageFeatures() {
    var segsHtml = D.segs.map(function (g) {
      var on = g[0] === S.filter;
      return '<button type="button" role="tab" class="' + (on ? 'on' : '') + '" data-seg data-act="seg" data-arg="' + g[0] + '" aria-selected="' + on + '">' + esc(g[1]) + '</button>';
    }).join('');
    return '<main class="page wrap" id="main" tabindex="-1">' +
      '<div class="ptitle"><div class="kicker">Возможности</div><h1 class="serif h-large">Всё, что нужно,<br>и ничего лишнего.</h1>' +
      '<p class="lead">В интерфейсе нет «cloze», «FSRS» и «retention» — есть «пропуск», «расписание повторений» и «как сильно запоминать». Нажми на карточку, чтобы узнать больше.</p></div>' +
      '<div style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; margin: 40px 0 28px">' +
        '<div class="seg seg-5" role="tablist" aria-label="Категории" style="grid-template-columns: repeat(5, auto)"><span class="seg-thumb" data-seg-thumb></span>' + segsHtml + '</div>' +
        '<label class="search">' + SVG.search + '<span class="sr-only">Поиск по возможностям</span><input type="search" placeholder="Поиск: формулы, Anki, Wi-Fi…" value="' + esc(S.query) + '" data-input="query"></label>' +
      '</div>' +
      '<div class="fgrid" id="fgrid" data-fgrid></div>' +
      '<div id="fempty"></div>' +
      '<div class="d-docs-link" data-reveal><div style="display: flex; flex-direction: column; gap: 4px"><b style="font-size: 20px">Как всё это устроено — в документации</b>' +
        '<span class="muted" style="font-size: 15px">Пошагово, с горячими клавишами. И раздел про моды и стили — на будущее.</span></div>' +
        '<div style="display: flex; gap: 10px; flex-wrap: wrap"><a class="btn btn-ghost btn-sm" href="#/docs/mods">Моды</a><a class="btn btn-primary btn-sm" href="#/docs">Открыть документацию</a></div></div>' +
    '</main>';
  }

  function featList() {
    var qy = (S.query || '').trim().toLowerCase();
    return featsAll().filter(function (f) {
      return (S.filter === 'all' || f.c === S.filter) && (!qy || (f.t + ' ' + f.d + ' ' + f.more).toLowerCase().indexOf(qy) >= 0);
    });
  }

  function renderFeats(animate) {
    var grid = $('#fgrid'); if (!grid) return;
    var snap = animate ? snapFeats() : null;
    var list = featList();
    grid.innerHTML = list.map(function (f) {
      return '<button type="button" class="fcard" data-fid="' + f.id + '" data-act="sheet" data-arg="' + f.id + '">' +
        '<span style="display: flex; justify-content: space-between; align-items: center"><span class="tag">' + esc(D.cats[f.c]) + '</span><span class="fnum">' + f.num + '</span></span>' +
        '<span style="font-size: 21px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.25">' + esc(f.t) + '</span>' +
        '<span style="color: var(--ink2); font-size: 15px">' + esc(f.d) + '</span><span class="more">Подробнее ›</span></button>';
    }).join('');
    $('#fempty').innerHTML = list.length ? '' :
      '<div class="empty"><p style="font-size: 20px; font-weight: 600; color: var(--ink)">Ничего не нашлось</p><p>Попробуй другое слово или <button type="button" class="tile-link" style="display: inline; padding: 0" data-act="clear-query">сбрось поиск</button>.</p></div>';
    if (snap) playFlip(snap);
  }

  function snapFeats() {
    var snap = {};
    $$('[data-fid]').forEach(function (el) { snap[el.getAttribute('data-fid')] = el.getBoundingClientRect(); });
    return snap;
  }

  function playFlip(snap) {
    if (reduce) return;
    var n = 0;
    $$('[data-fid]').forEach(function (el) {
      if (!el.animate) return;
      var id = el.getAttribute('data-fid'), old = snap[id], now = el.getBoundingClientRect();
      if (old) {
        var dx = old.left - now.left, dy = old.top - now.top;
        if (Math.abs(dx) + Math.abs(dy) > 1) el.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }], { duration: 650, easing: 'cubic-bezier(.2,.9,.25,1.05)' });
      } else {
        el.animate([{ opacity: 0, transform: 'translateY(18px) scale(.94)' }, { opacity: 1, transform: 'none' }], { duration: 520, delay: (n++) * 35, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
      }
    });
  }

  function setFilter(id) {
    if (id === S.filter) return;
    S.filter = id;
    $$('[data-seg]').forEach(function (b) {
      var on = b.getAttribute('data-arg') === id;
      b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    placePills();
    renderFeats(true);
  }

  // ───── шторка с подробностями ─────
  var sheetT = null, sheetOpener = null;
  function openSheet(id) {
    clearTimeout(sheetT);
    sheetOpener = document.activeElement;
    S.sheet = id;
    renderSheet();
    var btn = $('.done-btn', $('#sheet-root')); if (btn) btn.focus({ preventScroll: true });
  }
  function closeSheet() {
    var layer = $('.sheet-layer'); if (!layer) return;
    layer.classList.add('closing');
    clearTimeout(sheetT);
    sheetT = setTimeout(function () {
      S.sheet = null; renderSheet();
      if (sheetOpener && sheetOpener.focus && document.contains(sheetOpener)) sheetOpener.focus({ preventScroll: true });
    }, reduce ? 0 : 320);
  }
  function renderSheet() {
    var root = $('#sheet-root');
    var all = featsAll(), sf = S.sheet ? all.filter(function (f) { return f.id === S.sheet; })[0] : null;
    if (!sf) { root.innerHTML = ''; return; }
    var rel = all.filter(function (f) { return f.c === sf.c && f.id !== sf.id; }).map(function (f) {
      return '<button type="button" class="chip" style="cursor: pointer; animation: none" data-act="sheet" data-arg="' + f.id + '">' + esc(f.t) + '</button>';
    }).join('');
    root.innerHTML = '<div class="sheet-layer"><button type="button" class="scrim" aria-label="Закрыть" data-act="close-sheet"></button>' +
      '<div class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(sf.t) + '"><div class="grabber"></div>' +
      '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px"><span class="tag">' + esc(D.cats[sf.c]) + '</span><button type="button" class="done-btn" data-act="close-sheet">Готово</button></div>' +
      '<h2 class="serif" style="font-size: 36px; line-height: 1.1; margin-bottom: 14px">' + esc(sf.t) + '</h2>' +
      '<p style="font-size: 18px; color: var(--ink2); margin-bottom: 22px">' + esc(sf.more) + '</p>' +
      '<div class="ios-group" style="margin-bottom: 22px"><div class="ios-row"><span class="muted">Где в Мнеме</span><b style="text-align: right">' + esc(sf.where) + '</b></div>' +
      '<div class="ios-row"><span class="muted">Категория</span><b>' + esc(D.cats[sf.c]) + '</b></div></div>' +
      (rel ? '<div class="small" style="margin-bottom: 10px">Рядом в этой категории</div><div class="chips">' + rel + '</div>' : '') +
      '</div></div>';
  }

  // ───── страница: наука ─────
  function pageScience() {
    var methods = D.methods.map(function (m, i) {
      return '<button type="button" class="mcard" data-act="methflip" data-arg="' + i + '" aria-label="' + esc(m.t) + ' — перевернуть"><span class="flip" style="transform: rotateY(0deg)">' +
        '<span class="mface"><span class="ev"><i><b style="width: ' + m.w + '"></b></i>' + esc(m.ev) + '</span><span style="font-size: 22px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.2">' + esc(m.t) + '</span><span class="small">' + esc(m.src) + '</span></span>' +
        '<span class="mface back"><span class="kicker" style="color: inherit; opacity: .7">В Мнеме</span><span style="font-size: 19px; line-height: 1.35; font-weight: 500">' + esc(m.inapp) + '</span><span style="font-size: 13px; opacity: .7">Нажми, чтобы вернуть</span></span>' +
        '</span></button>';
    }).join('');
    var myths = D.myths.map(function (m, i) {
      return '<div class="myth">' + accordion({
        cls: 'myth-q', rot: 180, open: i === 0,
        head: '<span><s>' + esc(m.q) + '</s></span>' + withChev(SVG.chevDown, i === 0, 180),
        body: '<p style="padding: 0 24px 24px; font-size: 17px; color: var(--ink2); max-width: 820px">' + esc(m.a) + '</p>'
      }) + '</div>';
    }).join('');

    return '<main class="page wrap" id="main" tabindex="-1">' +
      '<div class="ptitle"><div class="kicker">Наука</div><h1 class="serif h-large">Почему это работает.</h1>' +
      '<p class="lead">Только то, что подтверждено исследованиями. Главное — вспоминать без подсказки и повторять с перерывами.</p></div>' +
      '<section class="curve-card" style="margin-top: 48px">' +
        '<div style="display: flex; flex-wrap: wrap; justify-content: space-between; gap: 16px; align-items: flex-start">' +
          '<div style="display: flex; flex-direction: column; gap: 8px; max-width: 560px"><h2 style="font-size: 26px; font-weight: 600; letter-spacing: -0.015em">Кривая забывания</h2>' +
          '<p class="muted" style="font-size: 16px">Нажми на график — добавишь повторение. Число на точке — день повторения, точки можно двигать. Каждое повторение делает память прочнее, и забывание замедляется.</p></div>' +
          '<div style="display: flex; gap: 8px; flex-wrap: wrap"><button type="button" class="btn btn-primary btn-sm" data-act="curve-preset">Как в Мнеме</button><button type="button" class="btn btn-ghost btn-sm" data-act="curve-reset">Сбросить</button></div>' +
        '</div>' +
        '<div class="curve-box" data-curve>' +
          '<svg viewBox="0 0 800 340" preserveAspectRatio="none" aria-hidden="true">' +
            '<line x1="48" y1="20" x2="780" y2="20" style="stroke: var(--line)"></line><line x1="48" y1="160" x2="780" y2="160" style="stroke: var(--line)"></line><line x1="48" y1="300" x2="780" y2="300" style="stroke: var(--line2)"></line>' +
            '<path data-c="base" fill="none" style="stroke: var(--warm)" stroke-width="2.5" stroke-dasharray="6 6"></path>' +
            '<path data-c="area" style="fill: var(--accent-soft)" stroke="none"></path>' +
            '<path data-c="line" fill="none" style="stroke: var(--accent-text)" stroke-width="3.5" stroke-linejoin="round"></path>' +
          '</svg>' +
          '<span class="cax y" style="top: 5.9%">100%</span><span class="cax y" style="top: 47.1%">50%</span><span class="cax y" style="top: 88.2%">0%</span>' +
          '<span class="cax x first" style="left: 6%">0</span><span class="cax x" style="left: 36.5%">10 дней</span><span class="cax x" style="left: 67%">20 дней</span><span class="cax x" style="left: 94%">30</span>' +
        '</div>' +
        '<div class="readout"><div><b class="accent-text" data-c-with></b><span class="small">помнишь на 30-й день · повторений: <span data-c-count></span></span></div>' +
          '<div><b style="color: var(--warm-text)" data-c-without></b><span class="small">без повторений</span></div>' +
          '<p class="small" style="max-width: 360px">Модель для наглядности: R = e^(−t/S), каждое повторение увеличивает прочность S. В Мнеме расписание считает алгоритм FSRS по твоим ответам.</p></div>' +
      '</section>' +
      '<section class="sec-gap" style="margin-top: 120px"><div style="display: flex; flex-direction: column; gap: 14px; margin-bottom: 32px" data-reveal><div class="kicker">Приёмы</div><h2 class="serif h-sec">Каждый — уже внутри Мнемы.</h2><p class="lead">Нажми на карточку: на обороте — где этот приём в приложении.</p></div>' +
        '<div class="mgrid">' + methods + '</div></section>' +
      '<section class="sec-gap" style="margin-top: 120px"><div style="display: flex; flex-direction: column; gap: 14px; margin-bottom: 28px" data-reveal><div class="kicker">Мифов нет</div><h2 class="serif h-sec">Что не работает — и что вместо.</h2></div>' +
        '<div style="display: flex; flex-direction: column; gap: 12px">' + myths + '</div>' +
        '<p class="small" style="margin-top: 28px; max-width: 820px">Источники: Dunlosky и др., 2013; Cepeda и др., 2008; Pashler и др., 2008; Rawson и Dunlosky; AFT «Strengthening the Student Toolbox»; руководство Anki по FSRS.</p></section>' +
    '</main>';
  }

  // ───── кривая забывания ─────
  function curvePts(reps) {
    var rs = reps.slice().sort(function (a, b) { return a - b; }), pts = [];
    var Sx = 1.5, last = 0, ri = 0;
    for (var tt = 0; tt <= 30.0001; tt += 0.25) {
      while (ri < rs.length && rs[ri] <= tt) {
        pts.push([rs[ri], Math.exp(-(rs[ri] - last) / Sx)]);
        Sx *= 2.3; last = rs[ri]; ri++;
        pts.push([last, 1]);
      }
      pts.push([tt, Math.exp(-(tt - last) / Sx)]);
    }
    return pts;
  }
  function cX(d) { return 48 + d / 30 * 732; }
  function cY(R) { return 20 + (1 - R) * 280; }
  function fmtDay(d) { return d % 1 ? d.toFixed(1).replace('.', ',') : String(d); }

  function renderCurve() {
    var box = $('[data-curve]'); if (!box) return;
    var pts = curvePts(S.reps), base = curvePts([]);
    var toD = function (ps) { return ps.map(function (p, i) { return (i ? 'L' : 'M') + cX(p[0]).toFixed(1) + ' ' + cY(p[1]).toFixed(1); }).join(' '); };
    var line = toD(pts);
    $('[data-c="line"]').setAttribute('d', line);
    $('[data-c="area"]').setAttribute('d', line + ' L780 300 L48 300 Z');
    $('[data-c="base"]').setAttribute('d', toD(base));
    var pct = function (r) { return (r < 0.01 ? '≈0' : Math.round(r * 100)) + '%'; };
    $('[data-c-with]').textContent = pct(pts[pts.length - 1][1]);
    $('[data-c-without]').textContent = pct(base[base.length - 1][1]);
    $('[data-c-count]').textContent = S.reps.length;
    var dots = $$('.cdot', box);
    while (dots.length > S.reps.length) dots.pop().remove();
    while (dots.length < S.reps.length) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'cdot';
      box.appendChild(b); dots.push(b);
    }
    S.reps.forEach(function (d, i) {
      var el = dots[i];
      el.setAttribute('data-dot', i);
      el.style.left = (cX(d) / 800 * 100).toFixed(3) + '%';
      el.style.top = (cY(1) / 340 * 100).toFixed(3) + '%';
      el.textContent = fmtDay(d);
      el.setAttribute('aria-label', 'Повторение в день ' + fmtDay(d));
    });
  }

  function dayAt(clientX) {
    var r = E.curve.getBoundingClientRect();
    var x = (clientX - r.left) / r.width * 800;
    return clamp(Math.round(((x - 48) / 732 * 30) * 2) / 2, 0.5, 29.5);
  }

  // ───── страница: что нового ─────
  function pageUpdates() {
    var items = D.versions.map(function (v, i) {
      return '<div class="tl-item"><span class="tl-dot" data-tl-dot></span><div class="vcard">' + accordion({
        cls: 'vhead', rot: 180, open: i === 0,
        head: '<span class="vnum">' + esc(v.v) + '</span><span style="flex: 1; font-size: 18px; font-weight: 600; line-height: 1.3">' + esc(v.t) + '</span>' + withChev(SVG.chevDownSm, i === 0, 180),
        body: '<ul>' + v.items.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>'
      }) + '</div></div>';
    }).join('');
    return '<main class="page wrap" id="main" tabindex="-1" style="max-width: 900px">' +
      '<div class="ptitle"><div class="kicker">Что нового</div><h1 class="serif h-large">Мнема растёт.</h1>' +
      '<p class="lead">Раз в день Мнема сама проверяет выпуски и предлагает обновиться. Карточки, предметы и настройки при обновлении сохраняются.</p></div>' +
      '<div class="tl" data-tl style="margin-top: 56px"><div class="tl-line"><div class="tl-fill" data-tl-fill></div></div>' + items + '</div>' +
      '<a class="btn btn-ghost" style="margin-top: 20px" href="https://github.com/' + REPO + '/releases">Все выпуски на GitHub ›</a>' +
    '</main>';
  }

  // ───── страница: скачать ─────
  function relVer() { return REL ? REL.ver : FALLBACK_VER; }
  function relFile(kind) {
    if (REL && REL[kind] && REL[kind].name) return REL[kind].name;
    return kind === 'win' ? 'Mnema-Setup-' + relVer() + '.exe' : 'Mnema-' + relVer() + '-Android.apk';
  }
  function relUrl(kind) {
    if (kind === 'any') return RELEASES;
    return (REL && REL[kind] && REL[kind].url) || RELEASES;
  }

  function pageDownload() {
    return '<main class="page wrap" id="main" tabindex="-1">' +
      '<div class="ptitle" style="align-items: center; text-align: center"><div class="kicker" data-dl-kicker></div>' +
      '<h1 class="serif h-large">Мнема на твоём устройстве.</h1><p class="lead">Бесплатно. Без аккаунта и рекламы. Учится и работает без интернета.</p>' +
      '<div class="seg" role="tablist" aria-label="Платформа" style="grid-template-columns: repeat(2, 150px); margin-top: 8px"><span class="seg-thumb" data-plat-thumb style="width: 150px"></span>' +
        '<button type="button" role="tab" data-plat="win" data-act="plat" data-arg="win">Windows</button><button type="button" role="tab" data-plat="android" data-act="plat" data-arg="android">Android</button></div></div>' +
      '<div class="dl-grid" style="margin-top: 56px">' +
        '<div class="dev-stage" data-dev-stage><div class="device" data-dev><div class="screen" data-screen>' +
          '<div class="app-side" data-side><b style="font-size: 13px; display: flex; gap: 6px; align-items: center"><span class="logo" style="width: 20px; height: 20px; border-radius: 6px; font-size: 12px">М</span>Мнема</b>' +
            '<span style="width: 80%; margin-top: 8px"></span><span style="width: 64%"></span><span style="width: 72%"></span><span style="width: 56%"></span><span style="width: 68%"></span></div>' +
          '<div class="app-main"><div style="display: flex; justify-content: space-between; align-items: baseline"><b class="serif" style="font-size: 24px">Сегодня</b><span style="font-size: 12px; color: #64666F">ждут повторения</span></div>' +
            '<div class="app-learn">Учиться</div><div class="app-time"><span>5 мин</span><span class="on">10 мин</span><span>20 мин</span><span>Всё</span></div>' +
            '<div class="app-sub">История<i><b style="width: 72%"></b></i></div><div class="app-sub">Физика<i><b style="width: 48%"></b></i></div><div class="app-sub">Биология<i><b style="width: 86%"></b></i></div>' +
            '<div class="app-tabs" data-tabs><span class="on">Учусь</span><span>Знания</span><span>Профиль</span></div></div>' +
        '</div><div class="base" data-base></div></div></div>' +
        '<div style="display: flex; flex-direction: column; gap: 28px"><h2 style="font-size: 30px; font-weight: 600; letter-spacing: -0.02em" data-plat-title></h2>' +
          '<div data-plat-steps></div>' +
          '<div style="display: flex; gap: 12px; flex-wrap: wrap"><a class="btn btn-primary" data-magnet data-plat-cta href="' + RELEASES + '"></a><a class="btn btn-ghost" href="https://github.com/' + REPO + '">Исходный код</a></div></div>' +
      '</div>' +
      '<section class="sec-gap" style="margin-top: 120px; max-width: 760px; margin-left: auto; margin-right: auto"><h2 class="serif h-sec" style="margin-bottom: 24px" data-reveal>Частые вопросы</h2>' +
        '<div class="ios-group" style="background: var(--surface); border: 1px solid var(--line)">' + D.faq.map(function (f, i) {
          return '<div class="ios-row" style="flex-direction: column; align-items: stretch; padding: 0">' + accordion({
            cls: 'myth-q', style: 'font-size: 17px; padding: 18px 18px', rot: 90, open: i === 0,
            head: '<span>' + esc(f.q) + '</span>' + withChev(SVG.chevRight, i === 0, 90),
            body: '<p style="padding: 0 18px 18px; color: var(--ink2); font-size: 16px">' + esc(f.a) + '</p>'
          }) + '</div>';
        }).join('') + '</div></section>' +
    '</main>';
  }

  function applyPlat(first) {
    var win = S.plat === 'win', q = function (s) { return $(s, app); };
    var dev = q('[data-dev]'); if (!dev) return;
    fitDevice();
    q('[data-dl-kicker]').textContent = 'Скачать · версия ' + relVer();
    if (first) $$('[data-dev-stage],[data-dev],[data-screen],[data-side],[data-base],[data-tabs]', app).forEach(function (el) { el.style.transition = 'none'; });
    q('[data-plat-thumb]').style.transform = 'translateX(' + (win ? 0 : 150) + 'px)';
    $$('[data-plat]', app).forEach(function (b) {
      var on = b.getAttribute('data-plat') === S.plat;
      b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    dev.style.width = win ? '560px' : '270px'; dev.style.height = win ? '360px' : '540px'; dev.style.borderRadius = win ? '18px' : '42px';
    q('[data-screen]').style.borderRadius = win ? '10px' : '33px';
    var side = q('[data-side]'); side.style.width = win ? '150px' : '0px'; side.style.opacity = win ? 1 : 0; side.style.padding = win ? '14px 10px' : '14px 0px';
    var base = q('[data-base]'); base.style.width = win ? '118%' : '0%'; base.style.opacity = win ? 1 : 0;
    var tabs = q('[data-tabs]'); tabs.style.opacity = win ? 0 : 1; tabs.style.transform = win ? 'translateY(30px)' : 'translateY(0px)';
    if (first) { void dev.offsetWidth; $$('[data-dev-stage],[data-dev],[data-screen],[data-side],[data-base],[data-tabs]', app).forEach(function (el) { el.style.transition = ''; }); }
    q('[data-plat-title]').textContent = win ? 'Для Windows' : 'Для Android';
    q('[data-plat-steps]').innerHTML = win ?
      '<ol class="steps"><li><span><b>Скачай установщик</b><br><span class="muted mono" style="font-size: 14px">' + esc(relFile('win')) + '</span></span></li>' +
      '<li><span><b>Запусти и следуй установщику</b><br><span class="muted">Можно включить автозапуск и значок у часов.</span></span></li>' +
      '<li><span><b>Дальше — само</b><br><span class="muted">Мнема раз в день проверяет выпуски и предлагает обновиться.</span></span></li></ol>' :
      '<ol class="steps"><li><span><b>Скачай APK на телефон</b><br><span class="muted mono" style="font-size: 14px">' + esc(relFile('android')) + '</span></span></li>' +
      '<li><span><b>Открой и разреши установку</b><br><span class="muted">Из этого источника — один раз.</span></span></li>' +
      '<li><span><b>Перенеси карточки с компьютера</b><br><span class="muted">По Wi-Fi: код из 12 знаков или QR — и готово.</span></span></li></ol>';
    var cta = q('[data-plat-cta]'); cta.textContent = win ? 'Скачать Mnema-Setup.exe' : 'Скачать APK';
    cta.setAttribute('href', relUrl(win ? 'win' : 'android'));
  }

  // макет устройства уменьшается, чтобы помещаться в узкий экран
  function fitDevice() {
    var st = $('[data-dev-stage]', app), dev = $('[data-dev]', app);
    if (!st || !dev) return;
    var win = S.plat === 'win', dw = win ? 560 : 270, dh = win ? 360 : 540;
    var k = Math.min(1, st.clientWidth / dw);
    dev.style.transform = k < 1 ? 'scale(' + k.toFixed(3) + ')' : '';
    if (k < 1) { st.style.height = Math.round((dh + 20) * k + 24) + 'px'; st.style.alignItems = 'start'; }
    else { st.style.height = ''; st.style.alignItems = ''; }
  }

  // ───── выпуск с GitHub ─────
  function applyRelease() {
    $$('[data-dl]').forEach(function (a) { a.setAttribute('href', relUrl(a.getAttribute('data-dl'))); });
    if ($('[data-plat-cta]', app)) applyPlat(false);
  }

  function loadRelease() {
    if (!window.fetch) return;
    fetch('https://api.github.com/repos/' + REPO + '/releases/latest', { headers: { Accept: 'application/vnd.github+json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.tag_name) return;
        var rel = { ver: String(j.tag_name).replace(/^v/i, '') };
        (j.assets || []).forEach(function (a) {
          if (/\.exe$/i.test(a.name)) rel.win = { name: a.name, url: a.browser_download_url };
          else if (/\.apk$/i.test(a.name)) rel.android = { name: a.name, url: a.browser_download_url };
        });
        REL = rel;
        applyRelease();
      })
      .catch(function () {});
  }

  // ───── страница: документация ─────
  function pageDocs() {
    return '<div class="d-prog" aria-hidden="true"><span data-doc-prog></span></div>' +
      '<main class="page wrap" id="main" tabindex="-1">' +
      '<div class="ptitle" style="padding-top: 64px"><div class="kicker">Документация</div><h1 class="serif h-large">Как пользоваться Мнемой.</h1><p class="lead">От первой карточки до своих модов — простыми словами.</p></div>' +
      '<div class="d-layout" data-doc-top>' +
        '<aside class="d-side">' +
          '<label class="search" style="max-width: none; min-width: 0; width: 100%; flex: none">' + SVG.search + '<span class="sr-only">Поиск по документации</span><input type="search" placeholder="Поиск: Wi-Fi, формулы, app.data…" value="' + esc(S.docQ) + '" data-input="docq"></label>' +
          '<button type="button" class="d-toc-btn" data-act="doc-nav" aria-expanded="false"><span data-doc-toc-label></span>' + SVG.chevDownXs + '</button>' +
          '<nav class="d-list" aria-label="Разделы документации" data-doc-list></nav>' +
        '</aside>' +
        '<article class="d-main" data-doc-article></article>' +
      '</div></main>';
  }

  function currentDoc() {
    var i = Math.max(0, DOC_LIST.findIndex(function (d) { return d.id === S.doc; }));
    return { i: i, doc: DOC_LIST[i] };
  }

  function renderDocNav() {
    var list = $('[data-doc-list]'); if (!list) return;
    var dq = (S.docQ || '').trim().toLowerCase();
    var html = DOCS.map(function (g) {
      var items = g.items.filter(function (it) { return !dq || DOC_LIST.filter(function (d) { return d.id === it.id; })[0].text.indexOf(dq) >= 0; });
      if (!items.length) return '';
      return '<div class="d-group"><div class="d-gt"><span>' + esc(g.t) + '</span>' + (g.soon ? '<span class="d-soon">скоро</span>' : '') + '</div>' +
        items.map(function (it) {
          var on = it.id === S.doc;
          return '<a class="d-link' + (on ? ' on' : '') + '" href="#/docs/' + it.id + '"' + (on ? ' aria-current="page"' : '') + '>' + esc(it.t) + '</a>';
        }).join('') + '</div>';
    }).join('');
    list.innerHTML = html || '<p class="small" style="padding: 8px 12px">Ничего не нашлось.</p>';
    list.classList.toggle('open', S.docNavOpen);
    var btn = $('.d-toc-btn'); btn.setAttribute('aria-expanded', S.docNavOpen ? 'true' : 'false');
    $('.chev', btn).style.transform = 'rotate(' + (S.docNavOpen ? 180 : 0) + 'deg)';
    $('[data-doc-toc-label]').textContent = 'Содержание · ' + currentDoc().doc.t;
  }

  var labDefs = [['sticky', 'Стикеры', 'Карточки как жёлтые стикеры'], ['pastel', 'Пастельные оценки', 'Кнопки оценок нежных цветов'], ['big', 'Большие карточки', 'Вопрос и ответ крупнее'], ['glow', 'Свечение', 'Главный цвет мягко светится']];
  function labCss() {
    var C = {
      sticky: ".review-card { background: #FFF4A8 !important; color: #2B2610 !important; border-color: #EBD970 !important; transform: rotate(-0.6deg); }",
      pastel: ".grade { border-radius: 22px !important; } .grade.again { background: #FFD9D6; color: #8A2A24; } .grade.hard { background: #FFE9C2; color: #7A4F0E; } .grade.good { background: #CFF1DC; color: #1F6B43; } .grade.easy { background: #D6E4FF; color: #2A5BB8; }",
      big: ".review-card .question { font-size: 2.15rem; line-height: 1.25; } .review-card .answer-text { font-size: 1.4rem; }",
      glow: ".btn.primary, .switch.on { box-shadow: 0 0 16px color-mix(in srgb, var(--accent) 55%, transparent); }"
    };
    return Object.keys(C).filter(function (k) { return S.lab[k]; }).map(function (k) { return C[k]; }).join(' ');
  }
  function labJson() {
    var on = labDefs.filter(function (d) { return S.lab[d[0]]; });
    return JSON.stringify({ kind: 'mnema-mod', name: on.length ? on.map(function (x) { return x[1]; }).join(' + ') : 'Мой стиль', description: 'Собрано в документации Мнемы', author: 'Я', where: 'при повторении', css: labCss() || '/* включи хотя бы один стиль */' }, null, 2);
  }
  function genCode() {
    var gn = S.gen;
    var gid = String(gn.id || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'my-mod';
    return '// @id ' + gid + '\n// @name ' + (gn.name || 'Мой мод') + '\n// @version ' + (gn.version || '1.0') + '\n// @author ' + (gn.author || 'Я') + '\n// @description ' + (gn.desc || '') +
      "\n\nexport default {\n  onload(app) {\n    app.commands.add({\n      id: 'hello',\n      name: '" + String(gn.name || 'Мой мод').replace(/'/g, "\\'") + ": привет',\n      run: () => app.ui.toast('Привет из мода!')\n    });\n  },\n  onunload() {\n    // убрать за собой таймеры и т. п.\n  }\n};";
  }
  function refreshCode(id, text) {
    codeTexts[id] = text;
    var el = $('[data-code="' + id + '"] code'); if (el) el.innerHTML = toks(text);
  }

  function docBlockHtml(doc, b, bi) {
    if (b.h) return '<h3 class="d-h">' + esc(b.h) + '</h3>';
    if (b.p) return '<p class="d-p">' + segs(b.p) + '</p>';
    if (b.ul) return '<ul class="d-ul">' + b.ul.map(function (t) { return '<li>' + segs(t) + '</li>'; }).join('') + '</ul>';
    if (b.steps) return '<ol class="steps d-steps">' + b.steps.map(function (t) { return '<li><span>' + segs(t) + '</span></li>'; }).join('') + '</ol>';
    if (b.note) {
      var warn = b.kind === 'warn';
      return '<div class="d-note' + (warn ? ' warn' : '') + '" role="note">' + (warn ? SVG.warn : SVG.info) + '<p style="margin: 0">' + segs(b.note) + '</p></div>';
    }
    if (b.code) return codeBlock(doc.id + ':' + bi, b.lang, b.code);
    if (b.table) {
      var hasHead = !!(b.head && (b.head[0] || b.head[1]));
      return '<div class="d-table">' + (hasHead ? '<div class="d-tr head"><span>' + esc(b.head[0]) + '</span><span>' + esc(b.head[1]) + '</span></div>' : '') +
        b.table.map(function (r) {
          return '<div class="d-tr"><span class="' + (b.mono === 'a' ? 'ta mono-cell' : 'ta') + '">' + esc(r[0]) + '</span><span class="' + (b.mono === 'b' ? 'tb mono-cell' : 'tb') + '">' + segs(r[1]) + '</span></div>';
        }).join('') + '</div>';
    }
    if (b.api) {
      return '<div class="d-api">' + b.api.map(function (r, ri) {
        var key = doc.id + ':' + bi + ':' + ri, a = acc(false);
        return '<div class="d-api-row"><button type="button" class="d-api-q" data-act="acc" data-rot="180" aria-expanded="false"><code>' + esc(r[0]) + '</code>' + SVG.chevDownXs + '<span class="small">' + esc(r[1]) + '</span></button>' +
          '<div class="acc" style="grid-template-rows: ' + a.rows + '"><div>' + (r[2] ? '<div class="d-api-body">' + codeBlock(key, 'Пример', r[2]) + '</div>' : '') + '</div></div></div>';
      }).join('') + '</div>';
    }
    if (b.lab) {
      var rows = labDefs.map(function (d) {
        var on = S.lab[d[0]];
        return '<div class="lab-row"><span><b style="font-size: 15px">' + d[1] + '</b><span class="small">' + d[2] + '</span></span>' +
          '<button type="button" role="switch" class="switch' + (on ? ' on' : '') + '" aria-checked="' + on + '" aria-label="' + d[1] + '" data-act="lab" data-arg="' + d[0] + '"><span class="knob"></span></button></div>';
      }).join('');
      return '<div class="lab"><div class="lab-box">' + rows + '</div><div class="pv ' + labCls() + '" data-pv aria-label="Как будет выглядеть повторение">' +
        '<div class="pv-card"><span class="small">История · 3 / 12</span><div class="pv-q">Год Куликовской битвы</div><div class="pv-div"></div><div class="pv-a">1380</div></div>' +
        '<div class="pv-grades"><span class="pv-g again">Снова</span><span class="pv-g hard">Трудно</span><span class="pv-g good">Хорошо</span><span class="pv-g easy">Легко</span></div></div></div>' +
        codeBlock('lab', 'Файл стиля · .mnemamod', labJson());
    }
    if (b.gen) {
      var g = S.gen;
      var f = function (k, label, extra) { return '<label' + (extra || '') + '>' + label + '<input type="text" value="' + esc(g[k]) + '" data-input="gen" data-arg="' + k + '"></label>'; };
      return '<div class="gen">' + f('id', 'id') + f('name', 'Название') + f('version', 'Версия') + f('author', 'Автор') + f('desc', 'Описание', ' style="grid-column: 1 / -1"') + '</div>' + codeBlock('gen', 'JavaScript', genCode());
    }
    return '';
  }
  function labCls() { return labDefs.map(function (d) { return S.lab[d[0]] ? 'pv-' + d[0] : ''; }).join(' '); }

  function renderDocArticle(animate) {
    var art = $('[data-doc-article]'); if (!art) return;
    var c = currentDoc(), doc = c.doc, prev = DOC_LIST[c.i - 1], next = DOC_LIST[c.i + 1];
    art.innerHTML = '<div class="d-crumb">' + esc(doc.group) + ' › ' + esc(doc.t) + '</div><h2 class="serif d-title">' + esc(doc.t) + '</h2>' +
      '<p class="lead" style="max-width: 720px">' + segs(doc.lead) + '</p><div class="d-meta">~' + Math.max(1, Math.round(doc.words / 160)) + ' мин чтения</div>' +
      doc.blocks.map(function (b, bi) { return docBlockHtml(doc, b, bi); }).join('') +
      '<div class="d-pager">' +
        (prev ? '<a class="d-pg" href="#/docs/' + prev.id + '"><span class="small">← Назад</span><b>' + esc(prev.t) + '</b></a>' : '') +
        (next ? '<a class="d-pg next" href="#/docs/' + next.id + '"><span class="small">Дальше →</span><b>' + esc(next.t) + '</b></a>' : '') +
      '</div>';
    document.title = doc.t + ' — документация Мнемы';
    if (animate) {
      if (art.animate && !reduce) art.animate([{ opacity: 0, transform: 'translateY(16px)', filter: 'blur(4px)' }, { opacity: 1, transform: 'none', filter: 'none' }], { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)' });
      var top = $('[data-doc-top]');
      if (top) {
        var r = top.getBoundingClientRect();
        if (r.top < 0) window.scrollTo({ top: (window.scrollY || 0) + r.top - 84, behavior: reduce ? 'auto' : 'smooth' });
      }
    }
  }

  function copyCode(btn) {
    var id = btn.getAttribute('data-arg'), text = codeTexts[id] || '';
    var set = function (label, ok) {
      btn.textContent = label; btn.classList.toggle('ok', !!ok);
      clearTimeout(btn._t);
      btn._t = setTimeout(function () { btn.textContent = 'Копировать'; btn.classList.remove('ok'); }, 1600);
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { set('Скопировано', true); }, function () { set('Выдели вручную', false); });
      else set('Выдели вручную', false);
    } catch (e) { set('Выдели вручную', false); }
  }

  // ───── показ страницы ─────
  var PAGES = { home: pageHome, features: pageFeatures, science: pageScience, updates: pageUpdates, download: pageDownload, docs: pageDocs };
  var TITLES = { home: 'Мнема — запоминай больше, учи меньше', features: 'Возможности — Мнема', science: 'Наука — Мнема', updates: 'Что нового — Мнема', download: 'Скачать — Мнема', docs: 'Документация — Мнема' };

  function renderPage() {
    app.innerHTML = PAGES[S.page]();
    document.title = TITLES[S.page];
    window.scrollTo({ top: 0, behavior: 'instant' });
    var main = $('main', app);
    if (main) main.addEventListener('animationend', function (ev) { if (ev.target === main) placePills(); }, { once: true });
    A.sp = 0; A.gp = null; A.lastSy = null;
    updateNav();
    if (S.page === 'home') initHome();
    if (S.page === 'features') { renderFeats(false); }
    if (S.page === 'science') renderCurve();
    if (S.page === 'download') applyPlat(true);
    if (S.page === 'docs') { renderDocNav(); renderDocArticle(false); }
    scan();
    applyRelease();
  }

  // ───── поиск элементов для анимации ─────
  var io = null;
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  }

  function scan() {
    E.hero = $('[data-hero]', app); E.deck = $('[data-deck]', app); E.heroStage = $('[data-deck-stage]', app); E.heroCards = $$('[data-hero-card]', app);
    E.mq = $('[data-marquee]', app);
    E.words = $('[data-words]', app); E.wordEls = $$('[data-w]', app);
    E.pin = $('[data-pin]', app); E.stageWrap = $('[data-stage-wrap]', app); E.stage = $('[data-stage]', app);
    E.st = {}; $$('[data-st]', app).forEach(function (el) { E.st[el.getAttribute('data-st')] = el; });
    E.tb = $('[data-tb]', app); E.stTexts = $$('[data-st-text]', app); E.stChips = $$('[data-st-chip]', app); E.stBar = $('[data-st-bar]', app);
    E.tilts = $$('[data-tilt]', app); E.spots = $$('[data-spot]', app); E.magnets = $$('[data-magnet]', app);
    E.graph = $('[data-graph]', app); E.gNodes = $$('[data-gnode]', app); E.gEdges = $$('[data-gedge]', app);
    E.tl = $('[data-tl]', app); E.tlFill = $('[data-tl-fill]', app); E.tlDots = $$('[data-tl-dot]', app);
    E.curve = $('[data-curve]', app);
    E.docProg = $('[data-doc-prog]', app); E.docArt = $('[data-doc-article]', app); A.dp = null;
    placePills();
    if (io) $$('[data-reveal]:not(.in)', app).forEach(function (el) { io.observe(el); });
    else $$('[data-reveal]', app).forEach(function (el) { el.classList.add('in'); });
  }

  // ───── указатель ─────
  function pointerMove(e) {
    if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
      A.px = e.clientX; A.py = e.clientY;
      var w = window.innerWidth || 1, h = window.innerHeight || 1;
      A.tmx = e.clientX / w - 0.5; A.tmy = Math.min(1, e.clientY / Math.min(h, 1000)) - 0.5;
    }
    var dr = A.drag;
    if (dr) {
      dr.dx = e.clientX - dr.x0; dr.dy = e.clientY - dr.y0;
      if (Math.abs(dr.dx) + Math.abs(dr.dy) > 6) dr.moved = true;
      if (dr.moved) {
        dr.el.style.transform = 'translate(' + dr.dx + 'px,' + (dr.dy * 0.35) + 'px) rotate(' + (dr.dx * 0.06) + 'deg)';
        var sr = $('[data-stamp="r"]', dr.el), sl = $('[data-stamp="l"]', dr.el);
        if (sr) sr.style.opacity = clamp(dr.dx / 110, 0, 1);
        if (sl) sl.style.opacity = clamp(-dr.dx / 110, 0, 1);
      }
    }
    var g = A.gdrag;
    if (g && E.graph && A.gp) {
      var r = E.graph.getBoundingClientRect();
      if (Math.abs(e.clientX - g.x0) + Math.abs(e.clientY - g.y0) > 5) g.moved = true;
      var n = A.gp[g.i]; n.x = e.clientX - r.left; n.y = e.clientY - r.top; n.vx = 0; n.vy = 0;
    }
    var c = A.cdrag;
    if (c && E.curve) {
      S.reps[c.i] = dayAt(e.clientX);
      renderCurve();
    }
  }

  function pointerUp() {
    var dr = A.drag;
    if (dr) {
      A.drag = null;
      dr.el.classList.remove('drag');
      var sr = $('[data-stamp="r"]', dr.el), sl = $('[data-stamp="l"]', dr.el);
      if (sr) sr.style.opacity = ''; if (sl) sl.style.opacity = '';
      if (!dr.moved) flipCard(dr.id);
      else if (dr.dx > 110) answer(dr.id, 'know');
      else if (dr.dx < -110) answer(dr.id, 'again');
      else dr.el.style.transform = dr.orig;
    }
    var g = A.gdrag;
    if (g) { A.gdrag = null; if (!g.moved) { S.gSel = g.i; updateGraphSel(); } }
    if (A.cdrag) A.cdrag = null;
  }

  function pointerDown(e) {
    if (e.button != null && e.button > 0) return;
    var t = e.target;
    var swc = t.closest && t.closest('.swc');
    if (swc) {
      var id = +swc.getAttribute('data-swc');
      if (S.queue[0] !== id) return;
      A.drag = { id: id, el: swc, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, moved: false, orig: swc.style.transform };
      swc.classList.add('drag');
      try { swc.setPointerCapture(e.pointerId); } catch (err) {}
      return;
    }
    var gn = t.closest && t.closest('.gnode');
    if (gn) {
      A.gdrag = { i: +gn.getAttribute('data-gnode'), x0: e.clientX, y0: e.clientY, moved: false };
      try { gn.setPointerCapture(e.pointerId); } catch (err) {}
      return;
    }
    var dot = t.closest && t.closest('.cdot');
    if (dot) {
      e.stopPropagation();
      A.cdrag = { i: +dot.getAttribute('data-dot') };
      try { dot.setPointerCapture(e.pointerId); } catch (err) {}
      return;
    }
    var cb = t.closest && t.closest('[data-curve]');
    if (cb && E.curve) {
      if (S.reps.length >= 8) return;
      var day = dayAt(e.clientX);
      if (S.reps.some(function (d) { return Math.abs(d - day) < 1; })) return;
      S.reps.push(day);
      A.cdrag = { i: S.reps.length - 1 };
      renderCurve();
    }
  }

  // ───── главный цикл анимации ─────
  function tick(t) {
    requestAnimationFrame(tick);
    try {
      var vh = window.innerHeight, m = MOTION;
      A.mx += (A.tmx - A.mx) * 0.06; A.my += (A.tmy - A.my) * 0.06;
      var sy = window.scrollY || 0;
      var v = A.lastSy == null ? 0 : sy - A.lastSy; A.lastSy = sy; A.vel += (v - A.vel) * 0.12;
      doHero(t, m); doMarquee(m); doWords(vh); doStory(t, vh);
      doTilt(m); doMagnet(m); doGraph(t, m); doTimeline(vh); doDocs(vh);
    } catch (err) { /* анимация не должна ронять страницу */ }
  }

  function doHero(t, m) {
    if (!E.heroStage || !E.hero) return;
    var hr = E.hero.getBoundingClientRect();
    if (hr.bottom < -50) return;
    var hp = clamp(-hr.top / (hr.height * 0.9), 0, 1);
    E.heroStage.style.transform = 'rotateY(' + (A.mx * 20 * m) + 'deg) rotateX(' + (-A.my * 14 * m) + 'deg)';
    var base = Math.min(96, (E.deck ? E.deck.clientWidth : 500) / 5.6);
    E.heroCards.forEach(function (el, i) {
      var k = i - 2, sp = 1 + hp * 0.9;
      var fl = Math.sin(t / 1100 + i * 1.3) * 7 * m;
      var x = k * base * sp + A.mx * k * 16 * m;
      var y = Math.abs(k) * 18 + fl - hp * 70 + hp * k * k * 12;
      var r = k * 6.5 * (1 + hp * 0.8);
      var z = -Math.abs(k) * 34;
      el.style.transform = 'translate3d(' + x + 'px,' + y + 'px,' + z + 'px) rotate(' + r + 'deg)';
    });
  }

  function doMarquee(m) {
    var el = E.mq; if (!el) return;
    var half = el.scrollWidth / 2; if (!half) return;
    if (Math.abs(A.vel) > 0.5) A.mqDir = A.vel > 0 ? 1 : -1;
    A.mq -= (0.6 + Math.min(14, Math.abs(A.vel) * 0.5)) * A.mqDir * Math.max(0.15, m);
    if (A.mq <= -half) A.mq += half; if (A.mq > 0) A.mq -= half;
    el.style.transform = 'translate3d(' + A.mq + 'px,0,0)';
  }

  function doWords(vh) {
    var el = E.words; if (!el || !E.wordEls.length) return;
    var r = el.getBoundingClientRect();
    var p = clamp((vh * 0.78 - r.top) / (r.height + vh * 0.12), 0, 1);
    var N = E.wordEls.length;
    E.wordEls.forEach(function (w, i) {
      var a = clamp(p * (N + 6) - i, 0, 1);
      var o = (0.14 + 0.86 * a).toFixed(3);
      if (w._o !== o) { w._o = o; w.style.opacity = o; }
    });
  }

  function goStage(i) {
    if (!E.pin) return;
    var r = E.pin.getBoundingClientRect();
    window.scrollTo({ top: (window.scrollY || 0) + r.top + (i / 3) * (r.height - window.innerHeight) + 2, behavior: reduce ? 'auto' : 'smooth' });
  }

  function doStory(t, vh) {
    if (!E.pin || !E.stage) return;
    var r = E.pin.getBoundingClientRect();
    var target = clamp(-r.top / Math.max(1, r.height - vh), 0, 1);
    A.sp += (target - A.sp) * 0.16;
    if (E.stageWrap) { var k = E.stageWrap.clientWidth / 560; if (A.k !== k) { A.k = k; E.stage.style.setProperty('--k', k); } }
    var T = A.sp * 3, seg = Math.min(2, Math.floor(T));
    var raw = clamp((T - seg - 0.18) / 0.64, 0, 1);
    var f = raw < 0.5 ? 4 * raw * raw * raw : 1 - Math.pow(-2 * raw + 2, 3) / 2;
    var KF = D.KF;
    Object.keys(KF).forEach(function (name) {
      var el = E.st[name]; if (!el) return;
      var a = KF[name][seg], b = KF[name][seg + 1], L = function (j) { return a[j] + (b[j] - a[j]) * f; };
      el.style.transform = 'translate(' + L(0) + 'px,' + L(1) + 'px) rotate(' + L(2) + 'deg) scale(' + L(3) + ')';
      el.style.opacity = L(4);
    });
    var Te = seg + f;
    if (E.tb) {
      var ph = Math.max(0, 1 - Te);
      E.tb.style.filter = 'sepia(' + (0.5 * ph).toFixed(3) + ') contrast(' + (1 - 0.08 * ph).toFixed(3) + ')';
      E.tb.style.setProperty('--hl', clamp((Te - 0.35) / 0.6, 0, 1).toFixed(3));
      E.tb.style.setProperty('--scan', Math.max(0, 1 - Te * 2.2).toFixed(3));
    }
    var act = Math.round(Te);
    E.stTexts.forEach(function (el, i) {
      var dd = Te - i, o = Math.max(0, 1 - Math.abs(dd) * 2.4);
      el.style.opacity = o.toFixed(3); el.style.transform = 'translateY(' + (-dd * 36).toFixed(1) + 'px)';
      el.style.pointerEvents = i === act ? 'auto' : 'none';
    });
    E.stChips.forEach(function (el, i) { var on = i === act; if (el.classList.contains('on') !== on) el.classList.toggle('on', on); });
    if (E.stBar) E.stBar.style.transform = 'scaleX(' + A.sp.toFixed(4) + ')';
  }

  function doTilt(m) {
    var px = A.px, py = A.py;
    E.tilts.forEach(function (el) {
      var r = el.getBoundingClientRect();
      var inside = px >= r.left && px <= r.right && py >= r.top && py <= r.bottom;
      var s = el._s || (el._s = { rx: 0, ry: 0, g: 0 });
      var trx = inside ? -((py - r.top) / r.height - 0.5) * 7 * m : 0;
      var tryy = inside ? ((px - r.left) / r.width - 0.5) * 9 * m : 0;
      s.rx += (trx - s.rx) * 0.12; s.ry += (tryy - s.ry) * 0.12; s.g += ((inside ? 1 : 0) - s.g) * 0.1;
      if (Math.abs(s.rx) + Math.abs(s.ry) + s.g < 0.002 && !inside) return;
      el.style.setProperty('--rx', s.rx.toFixed(3) + 'deg'); el.style.setProperty('--ry', s.ry.toFixed(3) + 'deg');
      el.style.setProperty('--glow', s.g.toFixed(3));
      if (inside) { el.style.setProperty('--mx', (px - r.left) + 'px'); el.style.setProperty('--my', (py - r.top) + 'px'); }
    });
    E.spots.forEach(function (el) {
      var r = el.getBoundingClientRect();
      el.style.setProperty('--mx', (px - r.left) + 'px'); el.style.setProperty('--my', (py - r.top) + 'px');
    });
  }

  function doMagnet(m) {
    var px = A.px, py = A.py;
    E.magnets.forEach(function (el) {
      var s = el._m || (el._m = { x: 0, y: 0 });
      var r = el.getBoundingClientRect();
      var L = r.left - s.x, T = r.top - s.y, hw = r.width / 2, hh = r.height / 2;
      var over = px >= L - 10 && px <= L + r.width + 10 && py >= T - 10 && py <= T + r.height + 10;
      var nx = clamp((px - L - hw) / hw, -1, 1), ny = clamp((py - T - hh) / hh, -1, 1);
      var tx = over ? nx * 5 * m : 0, ty = over ? ny * 4 * m : 0;
      s.x += (tx - s.x) * 0.15; s.y += (ty - s.y) * 0.15;
      if (Math.abs(s.x) + Math.abs(s.y) < 0.01 && tx === 0) { if (el._mOn) { el.style.transform = ''; el._mOn = false; } return; }
      el._mOn = true;
      el.style.transform = 'translate(' + s.x.toFixed(2) + 'px,' + s.y.toFixed(2) + 'px)';
    });
  }

  function doGraph(t, m) {
    var box = E.graph; if (!box || !E.gNodes.length) return;
    var r = box.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) return;
    var W = r.width, H = r.height, N = E.gNodes.length, Ed = D.gEdges;
    var narrow = W < 560, padB = narrow ? 140 : 0, sk = narrow ? clamp(W / 560, 0.7, 1) : 1, rk = narrow ? 3.2 : 1;
    if (!A.gp || A.gW !== W) {
      A.gW = W;
      A.gp = D.gNodes.map(function (n, i) {
        var a = i / N * Math.PI * 2, rad = n.s ? Math.min(W, H) * 0.22 : Math.min(W, H) * 0.38;
        return { x: W / 2 + Math.cos(a) * rad + (Math.random() - 0.5) * 30, y: H / 2 + Math.sin(a) * rad * 0.8 + (Math.random() - 0.5) * 30, vx: 0, vy: 0, w: E.gNodes[i].offsetWidth, h: E.gNodes[i].offsetHeight };
      });
    }
    var P = A.gp, F = P.map(function () { return [0, 0]; });
    for (var i = 0; i < N; i++) for (var j = i + 1; j < N; j++) {
      var dx = P[j].x - P[i].x, dy = (P[j].y - P[i].y) * 1.6, d2 = dx * dx + dy * dy + 0.01, d = Math.sqrt(d2);
      var f = Math.min(7, 16000 * rk / d2);
      F[i][0] -= dx / d * f; F[i][1] -= dy / d * f; F[j][0] += dx / d * f; F[j][1] += dy / d * f;
    }
    Ed.forEach(function (e) {
      var a = e[0], b = e[1];
      var dx = P[b].x - P[a].x, dy = P[b].y - P[a].y, d = Math.hypot(dx, dy) || 1;
      var L = ((D.gNodes[a].s || D.gNodes[b].s) ? 130 : 105) * sk, k = (d - L) * 0.012;
      F[a][0] += dx / d * k; F[a][1] += dy / d * k; F[b][0] -= dx / d * k; F[b][1] -= dy / d * k;
    });
    for (var q = 0; q < N; q++) {
      var n = P[q];
      F[q][0] += (W / 2 - n.x) * 0.0016; F[q][1] += ((H - padB) / 2 - n.y) * 0.003;
      F[q][0] += Math.sin(t / 1400 + q * 2.1) * 0.03 * m; F[q][1] += Math.cos(t / 1700 + q) * 0.03 * m;
      if (A.gdrag && A.gdrag.i === q) continue;
      n.vx = (n.vx + F[q][0]) * 0.86; n.vy = (n.vy + F[q][1]) * 0.86;
      n.x += n.vx; n.y += n.vy;
      var hw = (n.w || 80) / 2 + 8, hh = (n.h || 36) / 2 + 8;
      if (n.x < hw) { n.x = hw; n.vx *= -0.5; } if (n.x > W - hw) { n.x = W - hw; n.vx *= -0.5; }
      if (n.y < hh + 40) { n.y = hh + 40; n.vy *= -0.5; } if (n.y > H - hh - padB) { n.y = H - hh - padB; n.vy *= -0.5; }
    }
    E.gNodes.forEach(function (el, i) { el.style.transform = 'translate(' + (P[i].x - (P[i].w || 0) / 2).toFixed(1) + 'px,' + (P[i].y - (P[i].h || 0) / 2).toFixed(1) + 'px)'; });
    E.gEdges.forEach(function (el, k) {
      var e = Ed[k]; if (!e) return;
      var a = P[e[0]], b = P[e[1]], dx = b.x - a.x, dy = b.y - a.y;
      el.style.width = Math.hypot(dx, dy).toFixed(1) + 'px';
      el.style.transform = 'translate(' + a.x.toFixed(1) + 'px,' + a.y.toFixed(1) + 'px) rotate(' + Math.atan2(dy, dx) + 'rad)';
    });
  }

  function doDocs(vh) {
    if (!E.docProg || !E.docArt) return;
    var r = E.docArt.getBoundingClientRect();
    var p = clamp((vh * 0.35 - r.top) / Math.max(1, r.height - vh * 0.5), 0, 1);
    var v = p.toFixed(4);
    if (A.dp !== v) { A.dp = v; E.docProg.style.transform = 'scaleX(' + v + ')'; }
  }

  function doTimeline(vh) {
    if (!E.tl || !E.tlFill) return;
    var r = E.tl.getBoundingClientRect(), line = vh * 0.55;
    E.tlFill.style.height = Math.max(0, Math.min(r.height - 12, line - r.top)) + 'px';
    E.tlDots.forEach(function (d) { var on = d.getBoundingClientRect().top < line; if (d.classList.contains('on') !== on) d.classList.toggle('on', on); });
  }

  // ───── логотип ─────
  function replayLogo(el) {
    if (!el || !el.getAnimations || reduce) return;
    var as = el.getAnimations({ subtree: true });
    if (as.some(function (a) { return a.playState === 'running'; })) return;
    as.forEach(function (a) { a.currentTime = 0; a.play(); });
  }

  // ───── события ─────
  var ACTIONS = {
    heroflip: function (el, arg) {
      S.heroFlip[arg] = !S.heroFlip[arg];
      $('.flip', el).style.transform = S.heroFlip[arg] ? 'rotateY(180deg)' : 'rotateY(0deg)';
    },
    demo: function () { var d = $('#demo'); if (d) d.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); },
    stage: function (el, arg) { goStage(+arg); },
    'swipe-know': function () { if (S.queue.length) answer(S.queue[0], 'know'); },
    'swipe-again': function () { if (S.queue.length) answer(S.queue[0], 'again'); },
    'flip-top': function () { if (S.queue.length) flipCard(S.queue[0]); },
    'reset-deck': function () { S.queue = [0, 1, 2, 3, 4, 5]; S.gone = {}; S.flips = {}; S.know = 0; S.again = 0; updateDeck(); },
    shake: function () { if (A.gp) A.gp.forEach(function (n) { n.vx += (Math.random() - 0.5) * 60; n.vy += (Math.random() - 0.5) * 60; }); },
    logo: function (el) { replayLogo(el); },
    feat: function (el, arg) { S.filter = arg; S.query = ''; navigate('#/features'); },
    seg: function (el, arg) { setFilter(arg); },
    'clear-query': function () {
      S.query = ''; var inp = $('[data-input="query"]'); if (inp) inp.value = '';
      if (S.filter !== 'all') setFilter('all'); else renderFeats(true);
    },
    skip: function () { var m = $('#main'); if (m) { m.focus({ preventScroll: true }); m.scrollIntoView(); } },
    sheet: function (el, arg) { openSheet(arg); },
    'close-sheet': function () { closeSheet(); },
    methflip: function (el, arg) {
      S.methFlip[arg] = !S.methFlip[arg];
      $('.flip', el).style.transform = S.methFlip[arg] ? 'rotateY(180deg)' : 'rotateY(0deg)';
    },
    'curve-preset': function () { S.reps = [1, 3, 7, 16]; renderCurve(); },
    'curve-reset': function () { S.reps = []; renderCurve(); },
    acc: function (el) { toggleAcc(el); },
    plat: function (el, arg) { S.plat = arg; applyPlat(false); },
    'doc-nav': function () { S.docNavOpen = !S.docNavOpen; renderDocNav(); },
    copy: function (el) { copyCode(el); },
    lab: function (el, arg) {
      S.lab[arg] = !S.lab[arg];
      el.classList.toggle('on', S.lab[arg]); el.setAttribute('aria-checked', S.lab[arg] ? 'true' : 'false');
      var pv = $('[data-pv]'); if (pv) pv.className = 'pv ' + labCls();
      refreshCode('lab', labJson());
    }
  };

  function onClick(e) {
    var t = e.target;
    if (!t.closest) return;
    // клавиатура на карточках демо и узлах графа (мышь и касание обрабатываются через pointer-события)
    if (e.detail === 0) {
      var swc = t.closest('.swc');
      if (swc) { var id = +swc.getAttribute('data-swc'); if (S.queue[0] === id) flipCard(id); return; }
      var gn = t.closest('.gnode');
      if (gn) { S.gSel = +gn.getAttribute('data-gnode'); updateGraphSel(); return; }
    }
    var a = t.closest('[data-act]');
    if (a && ACTIONS[a.getAttribute('data-act')]) {
      if (a.tagName === 'A') e.preventDefault();
      ACTIONS[a.getAttribute('data-act')](a, a.getAttribute('data-arg'));
      return;
    }
    var link = t.closest('a[href^="#/"]');
    if (link && !(e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0)) {
      var href = link.getAttribute('href');
      if (href === location.hash || (href === '#/' && (!location.hash || location.hash === '#'))) {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
      }
    }
  }

  function onInput(e) {
    var el = e.target, kind = el.getAttribute && el.getAttribute('data-input');
    if (!kind) return;
    if (kind === 'query') { S.query = el.value; renderFeats(true); }
    else if (kind === 'docq') { S.docQ = el.value; renderDocNav(); }
    else if (kind === 'gen') { S.gen[el.getAttribute('data-arg')] = el.value; refreshCode('gen', genCode()); }
  }

  function onKey(e) {
    if (e.key === 'Escape' && S.sheet) closeSheet();
  }

  // ───── запуск ─────
  function init() {
    buildNav();
    applyTheme();
    $('#dark-switch').addEventListener('click', function () {
      S.dark = !S.dark; applyTheme(); lsSet('mnema-theme', S.dark ? 'dark' : 'light');
    });
    $$('[data-logo]').forEach(function (el) { el.addEventListener('pointerenter', function () { replayLogo(el); }); });
    document.addEventListener('pointerenter', function (e) {
      if (e.target.matches && e.target.matches('.mlogo-big')) replayLogo(e.target);
    }, true);
    site.addEventListener('click', onClick);
    site.addEventListener('input', onInput);
    site.addEventListener('pointerdown', pointerDown);
    window.addEventListener('pointermove', pointerMove, { passive: true });
    window.addEventListener('pointerup', pointerUp);
    window.addEventListener('pointercancel', pointerUp);
    window.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', onRoute);
    window.addEventListener('resize', function () { placePills(); fitDevice(); });
    window.addEventListener('orientationchange', function () { setTimeout(function () { placePills(); fitDevice(); }, 250); });
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () {
      placePills();
      if (A.gp) A.gp.forEach(function (n, i) { var el = E.gNodes[i]; if (el) { n.w = el.offsetWidth; n.h = el.offsetHeight; } });
    });

    var r = parseRoute();
    S.page = r.page;
    if (r.doc) S.doc = r.doc;
    renderPage();
    requestAnimationFrame(tick);
    loadRelease();
  }

  init();
})();
