/* Скрытая страница статистики Refrain (только для владельца).
   Токен GitHub вводится вручную, лежит в sessionStorage (или в localStorage по галочке) и уходит только на https://api.github.com.
   Все строки из API выводятся через textContent — innerHTML с данными нигде не используется. Токен не пишется ни в консоль, ни в адрес, ни в атрибуты. */
(function () {
  'use strict';

  var API = 'https://api.github.com';
  var NAME_RE = /^[A-Za-z0-9-_.]+$/;           // владелец и имя репозитория
  var TOKEN_RE = /^[\x21-\x7E]{8,255}$/;       // токен: видимые ASCII-символы без пробелов
  var K_TOKEN = 'rs-token', K_CFG = 'rs-cfg', K_RATE = 'rs-rate', K_CACHE = 'rs-c:';
  var TTL = 5 * 60 * 1000;                     // кэш ответов — 5 минут
  var DEF = { owner: 'TryserPy', app: 'Mnema', site: 'Mnema-site' };
  var NS = 'http://www.w3.org/2000/svg';
  var DAY = 86400000;

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  // ───── хранилище (всё в try: в приватных окнах оно может быть недоступно) ─────
  function stGet(st, k) { try { return window[st].getItem(k); } catch (e) { return null; } }
  function stSet(st, k, v) { try { window[st].setItem(k, v); return true; } catch (e) { return false; } }
  function stDel(st, k) { try { window[st].removeItem(k); } catch (e) {} }
  function wipe() { // «Выйти»: стираем токен, настройки, кэш и лимит — везде
    ['sessionStorage', 'localStorage'].forEach(function (st) {
      var keys = [];
      try { for (var i = 0; i < window[st].length; i++) { var k = window[st].key(i); if (k && k.indexOf('rs-') === 0) keys.push(k); } } catch (e) { return; }
      keys.forEach(function (k) { stDel(st, k); });
    });
  }
  function wipeCache() {
    var keys = [];
    try { for (var i = 0; i < sessionStorage.length; i++) { var k = sessionStorage.key(i); if (k && k.indexOf(K_CACHE) === 0) keys.push(k); } } catch (e) { return; }
    keys.forEach(function (k) { stDel('sessionStorage', k); });
  }

  // ───── мелочи ─────
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = String(text);
    return e;
  }
  function add(parent) {
    for (var i = 1; i < arguments.length; i++) if (arguments[i]) parent.appendChild(arguments[i]);
    return parent;
  }
  function svg(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, String(attrs[k]));
    if (parent) parent.appendChild(e);
    return e;
  }
  function svgText(parent, cls, x, y, text, extra) {
    var t = svg('text', { 'class': cls, x: x, y: y }, parent);
    if (extra) for (var k in extra) t.setAttribute(k, extra[k]);
    t.textContent = String(text);
    return t;
  }
  function fmtN(n) { return (Number(n) || 0).toLocaleString('ru-RU'); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtDate(d) { return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear(); }
  function fmtTime(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function fmtTimeS(d) { return fmtTime(d) + ':' + pad(d.getSeconds()); }
  function fmtSize(b) { return b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' МБ' : Math.max(1, Math.round(b / 1024)) + ' КБ'; }
  function plural(n, f) { var a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? f[2] : b > 1 && b < 5 ? f[1] : b === 1 ? f[0] : f[2]; }
  function ago(iso) {
    var d = Math.floor((Date.now() - new Date(iso).getTime()) / DAY);
    if (d < 1) return 'сегодня';
    if (d === 1) return 'вчера';
    return d + ' ' + plural(d, ['день', 'дня', 'дней']) + ' назад';
  }
  function safeUrl(u) { return typeof u === 'string' && u.indexOf('https://github.com/') === 0 ? u : null; }
  function niceMax(v) { // верх шкалы: 4 одинаковых деления
    if (v <= 4) return 4;
    var x = v / 4, p = Math.pow(10, Math.floor(Math.log(x) / Math.LN10)), f = x / p;
    var n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
    return n * p * 4;
  }
  function validName(s) { return typeof s === 'string' && s.length > 0 && s.length <= 100 && NAME_RE.test(s) && !/^\.+$/.test(s); }

  // ───── тема: как на сайте (если там выбрана вручную), иначе по системе ─────
  (function () {
    var t = stGet('localStorage', 'mnema-theme');
    if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
  })();

  // страницу нельзя вставить в чужой iframe
  if (window.top !== window.self) {
    document.body.textContent = '';
    document.body.appendChild(el('p', 'noscript', 'Эта страница не открывается внутри другой страницы.'));
    return;
  }

  // ───── состояние ─────
  var token = null;
  var cfg = { owner: DEF.owner, app: DEF.app, site: DEF.site };
  var rate = null;      // { rem, lim, reset }
  var busy = false;
  var charts = [];      // нарисованные графики: перерисовываем при смене ширины

  var loginBox = $('#login'), appBox = $('#app'), out = $('#out');

  function showMsg(node, text) {
    if (text) { node.textContent = text; node.hidden = false; } else { node.textContent = ''; node.hidden = true; }
  }

  // ───── настройки репозиториев ─────
  function readCfgFrom(root) {
    return { owner: $('.f-owner', root).value.trim(), app: $('.f-app', root).value.trim(), site: $('.f-site', root).value.trim() };
  }
  function cfgError(c) {
    if (!validName(c.owner)) return 'Владелец: можно только буквы, цифры, «-», «_» и «.».';
    if (!validName(c.app)) return 'Репозиторий приложения: можно только буквы, цифры, «-», «_» и «.».';
    if (!validName(c.site)) return 'Репозиторий сайта: можно только буквы, цифры, «-», «_» и «.».';
    return null;
  }
  function fillCfg() {
    $$('.f-owner').forEach(function (i) { i.value = cfg.owner; });
    $$('.f-app').forEach(function (i) { i.value = cfg.app; });
    $$('.f-site').forEach(function (i) { i.value = cfg.site; });
  }
  function loadCfg() {
    var raw = stGet('sessionStorage', K_CFG) || stGet('localStorage', K_CFG);
    if (!raw) return;
    try {
      var c = JSON.parse(raw);
      if (c && !cfgError(c)) cfg = { owner: c.owner, app: c.app, site: c.site };
    } catch (e) {}
  }
  function saveCfg(remember) {
    var s = JSON.stringify(cfg);
    stSet('sessionStorage', K_CFG, s);
    if (remember) stSet('localStorage', K_CFG, s); else stDel('localStorage', K_CFG);
  }

  // ───── запросы к GitHub ─────
  function readRate(res) {
    var rem = res.headers.get('x-ratelimit-remaining');
    if (rem === null) return;
    rate = { rem: Number(rem), lim: Number(res.headers.get('x-ratelimit-limit')), reset: Number(res.headers.get('x-ratelimit-reset')) };
  }
  function readCache(key) {
    var raw = stGet('sessionStorage', key);
    if (!raw) return null;
    try {
      var c = JSON.parse(raw);
      if (c && typeof c.at === 'number' && Date.now() - c.at < TTL && Date.now() >= c.at) return c;
    } catch (e) {}
    stDel('sessionStorage', key);
    return null;
  }
  // path — только относительный путь к api.github.com; reduce — урезает ответ перед кэшем (чтобы не забить хранилище)
  function request(path, force, reduce) {
    var key = K_CACHE + path;
    if (!force) {
      var c = readCache(key);
      if (c) return Promise.resolve({ data: c.data, at: c.at, cached: true });
    }
    return fetch(API + path, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Authorization': 'Bearer ' + token }
    }).then(function (res) {
      readRate(res);
      if (res.ok) {
        return res.json().then(function (data) {
          if (reduce) data = reduce(data);
          var at = Date.now();
          stSet('sessionStorage', key, JSON.stringify({ at: at, data: data }));
          return { data: data, at: at, cached: false };
        });
      }
      var kind = 'http';
      if (res.status === 401) kind = 'auth';
      else if (res.status === 429 || (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0')) kind = 'rate';
      else if (res.status === 403) kind = 'forbidden';
      else if (res.status === 404) kind = 'notfound';
      throw { kind: kind, status: res.status };
    }, function () {
      throw { kind: 'net', status: 0 };
    });
  }
  function settle(p) {
    return p.then(function (r) { return { ok: true, data: r.data, at: r.at, cached: r.cached }; },
      function (e) { return { ok: false, err: (e && e.kind) ? e : { kind: 'net', status: 0 } }; });
  }
  function repoPath(r) { return '/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(r); }

  function reduceRepo(d) {
    return { full_name: d.full_name, html_url: d.html_url, stargazers_count: d.stargazers_count, forks_count: d.forks_count, subscribers_count: d.subscribers_count, open_issues_count: d.open_issues_count, permissions: d.permissions || null, archived: !!d.archived };
  }
  function reduceReleases(list) {
    return list.map(function (r) {
      return { tag_name: r.tag_name, name: r.name, draft: !!r.draft, prerelease: !!r.prerelease, published_at: r.published_at || r.created_at, html_url: r.html_url,
        assets: (r.assets || []).map(function (a) { return { name: a.name, download_count: a.download_count || 0, size: a.size || 0 }; }) };
    });
  }
  function fetchReleases(force) { // все страницы выпусков
    var all = [], page = 1, at = Infinity, cached = true;
    function next() {
      return request(repoPath(cfg.app) + '/releases?per_page=100&page=' + page, force, reduceReleases).then(function (r) {
        all = all.concat(r.data);
        at = Math.min(at, r.at);
        cached = cached && r.cached;
        if (r.data.length >= 100 && page < 30) { page++; return next(); }
        return { data: all, at: at, cached: cached };
      });
    }
    return next();
  }

  // ───── платформы по имени файла ─────
  var PLAT = [
    { id: 'win', label: 'Windows (Setup .exe)', g: 0 },
    { id: 'android', label: 'Android (.apk)', g: 1 },
    { id: 'appimage-x64', label: 'Linux AppImage · x64', g: 2 },
    { id: 'appimage-arm64', label: 'Linux AppImage · arm64', g: 2 },
    { id: 'deb-x64', label: 'Linux .deb · x64', g: 2 },
    { id: 'deb-arm64', label: 'Linux .deb · arm64', g: 2 },
    { id: 'pacman-x64', label: 'Linux .pacman · x64', g: 2 },
    { id: 'pacman-arm64', label: 'Linux .pacman · arm64', g: 2 },
    { id: 'targz-x64', label: 'Linux .tar.gz · x64', g: 2 },
    { id: 'targz-arm64', label: 'Linux .tar.gz · arm64', g: 2 },
    { id: 'other', label: 'Прочее', g: 3 },
    { id: 'service', label: 'Служебные (.yml, .blockmap — автообновление)', g: -1 }
  ];
  var GROUPS = ['Windows', 'Android', 'Linux', 'Прочее'];
  var PLAT_BY = {};
  PLAT.forEach(function (p) { PLAT_BY[p.id] = p; });

  function platformOf(name) {
    var n = String(name);
    if (/\.(ya?ml|blockmap)$/i.test(n)) return 'service';
    var arch = /(arm64|aarch64)/i.test(n) ? 'arm64' : 'x64';
    if (/\.exe$/i.test(n)) return 'win';
    if (/\.apk$/i.test(n)) return 'android';
    if (/\.appimage$/i.test(n)) return 'appimage-' + arch;
    if (/\.deb$/i.test(n)) return 'deb-' + arch;
    if (/\.pacman$/i.test(n)) return 'pacman-' + arch;
    if (/\.tar\.gz$/i.test(n)) return 'targz-' + arch;
    return 'other';
  }

  function analyze(list) {
    var rels = list.filter(function (r) { return !r.draft; }).sort(function (a, b) { return new Date(b.published_at) - new Date(a.published_at); });
    var byPlat = {};
    PLAT.forEach(function (p) { byPlat[p.id] = 0; });
    var seen = {};
    var rows = rels.map(function (r) {
      var row = { rel: r, files: [], g: [0, 0, 0, 0], service: 0, total: 0, byPlat: {} };
      r.assets.forEach(function (a) {
        var pid = platformOf(a.name), p = PLAT_BY[pid];
        row.files.push({ name: a.name, count: a.download_count, size: a.size, pid: pid });
        row.byPlat[pid] = (row.byPlat[pid] || 0) + a.download_count;
        byPlat[pid] += a.download_count;
        seen[pid] = true;
        if (p.g < 0) row.service += a.download_count; else { row.g[p.g] += a.download_count; row.total += a.download_count; }
      });
      row.files.sort(function (a, b) { return b.count - a.count || (a.name < b.name ? -1 : 1); });
      return row;
    });
    var latest = null;
    for (var i = 0; i < rows.length; i++) if (!rows[i].rel.prerelease) { latest = rows[i]; break; }
    if (!latest && rows.length) latest = rows[0];
    var total = 0, service = 0;
    rows.forEach(function (r) { total += r.total; service += r.service; });
    return { rows: rows, byPlat: byPlat, seen: seen, latest: latest, total: total, service: service };
  }

  // ───── тексты ошибок ─────
  function resetText() { return rate && rate.reset ? ' Лимит обновится около ' + fmtTime(new Date(rate.reset * 1000)) + '.' : ''; }
  function errText(e, what) {
    switch (e.kind) {
      case 'auth': return 'GitHub не принял токен (401): он неверный, просрочен или отозван. Введи новый токен.';
      case 'rate': return 'Лимит запросов GitHub исчерпан.' + resetText() + ' Подожди и нажми «Обновить».';
      case 'net': return 'Нет связи с api.github.com. Проверь интернет и нажми «Обновить».';
      case 'forbidden':
        return what === 'traffic'
          ? 'GitHub не отдаёт трафик этому токену (403). Это видит только владелец: токену нужен доступ к этому репозиторию и право Administration: Read-only (а у твоего аккаунта — право записи в репозиторий).'
          : 'Доступ закрыт (403). Проверь, что токен выдан на этот репозиторий и имеет права на чтение.';
      case 'notfound': return 'Не найдено (404). Проверь названия репозиториев; у fine-grained токена репозиторий должен быть выбран в Repository access.';
      default: return 'GitHub ответил ошибкой' + (e.status ? ' ' + e.status : '') + '. Попробуй обновить позже.';
    }
  }
  function noteErr(e, what) { return el('p', 'note err', errText(e, what)); }

  // ───── небольшие строительные блоки ─────
  function panel(title, sub) {
    var p = el('section', 'panel');
    add(p, el('h2', 'serif', title));
    if (sub) add(p, el('p', 'sub', sub));
    return p;
  }
  function kpi(n, t, s) {
    var k = el('div', 'kpi');
    add(k, el('div', 'n', n), el('div', 't', t));
    if (s) add(k, el('div', 's', s));
    return k;
  }
  function kpis(list) {
    var g = el('div', 'kpis');
    list.forEach(function (k) { add(g, k); });
    return g;
  }
  // heads: [{t, num}], rows: [[cell...]], cell: строка | {t, cls, sub}
  function table(heads, rows, foot) {
    var wrap = el('div', 'tw');
    var t = el('table');
    var thead = el('thead'), trh = el('tr');
    heads.forEach(function (h) { add(trh, el('th', h.num ? 'num' : '', h.t)); });
    add(thead, trh);
    var tb = el('tbody');
    function fillRow(tr, cells) {
      cells.forEach(function (c, i) {
        var o = (c !== null && typeof c === 'object') ? c : { t: c };
        var td = el('td', (heads[i].num ? 'num ' : '') + (heads[i].wrap ? 'wrapcell ' : '') + (o.cls || ''), o.t);
        if (o.sub) add(td, el('span', 'sub', o.sub));
        add(tr, td);
      });
    }
    rows.forEach(function (r) { var tr = el('tr'); fillRow(tr, r); add(tb, tr); });
    add(t, thead, tb);
    if (foot) { var tf = el('tfoot'), tr = el('tr'); fillRow(tr, foot); add(tf, tr); add(t, tf); }
    add(wrap, t);
    return wrap;
  }
  function legend(items) { // items: [[класс, подпись]]
    var l = el('div', 'legend');
    items.forEach(function (it) { var s = el('span'); add(s, el('i', it[0]), document.createTextNode(it[1])); add(l, s); });
    return l;
  }
  function chartBox(draw) { // draw(box, width) рисует svg; вызывается снова при смене ширины
    var box = el('div', 'chart');
    charts.push({ box: box, draw: draw, w: 0 });
    return box;
  }
  function drawCharts(force) {
    charts.forEach(function (c) {
      if (!c.box.isConnected) return;
      var w = Math.floor(c.box.clientWidth) - 12;
      if (w < 200) w = 200;
      if (!force && Math.abs(w - c.w) < 2) return;
      c.w = w;
      c.box.textContent = '';
      c.draw(c.box, w);
    });
  }

  // ───── столбики: скачивания по выпускам (с накоплением по платформам) ─────
  function drawBars(box, rows, W) { // rows: от старых к новым
    var n = rows.length, ml = 44, mr = 10, mt = 20, mb = 58, H = 270;
    if (!n) { add(box, el('p', 'empty', 'Выпусков пока нет.')); return; }
    var minSlot = 30;
    W = Math.max(W, n * minSlot + ml + mr);
    var max = 0;
    rows.forEach(function (r) { if (r.total > max) max = r.total; });
    var top = niceMax(max), pw = W - ml - mr, ph = H - mt - mb, slot = pw / n, bw = Math.min(30, slot * 0.7);
    var s = svg('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Скачивания по выпускам, столбики; те же числа в таблице ниже' }, box);
    for (var i = 0; i <= 4; i++) {
      var y = mt + ph - ph * i / 4;
      svg('line', { 'class': 'grid-line', x1: ml, x2: W - mr, y1: y, y2: y }, s);
      svgText(s, 'ax-t end', ml - 6, y + 4, fmtN(top * i / 4));
    }
    rows.forEach(function (r, k) {
      var cx = ml + slot * (k + 0.5), yy = mt + ph, g = svg('g', {}, s);
      for (var j = 0; j < 4; j++) {
        if (!r.g[j]) continue;
        var h = ph * r.g[j] / top;
        yy -= h;
        svg('rect', { 'class': 's' + (j + 1), x: cx - bw / 2, y: yy, width: bw, height: Math.max(1, h), rx: 2 }, g);
      }
      var tip = svg('title', {}, g);
      tip.textContent = r.rel.tag_name + ': ' + fmtN(r.total) + (r.total ? ' (' + GROUPS.map(function (nm, q) { return r.g[q] ? nm + ' ' + fmtN(r.g[q]) : ''; }).filter(Boolean).join(', ') + ')' : '');
      svg('rect', { 'class': 'hit', x: cx - slot / 2, y: mt, width: slot, height: ph + 2 }, g);
      if (r.total) svgText(s, 'val-t', cx, yy - 5, fmtN(r.total));
      svgText(s, 'ax-t end', cx + 4, mt + ph + 14, r.rel.tag_name.replace(/^v/i, ''), { transform: 'rotate(-45 ' + (cx + 4) + ' ' + (mt + ph + 14) + ')' });
    });
    svg('line', { 'class': 'axis', x1: ml, x2: W - mr, y1: mt + ph, y2: mt + ph }, s);
  }

  // ───── линии: трафик по дням ─────
  function fillDays(items) { // нули в днях без данных; 14 дней, заканчивая сегодняшним (UTC)
    var map = {}, minT = Infinity, maxT = -Infinity;
    (items || []).forEach(function (it) {
      var t = Date.parse(it.timestamp);
      if (isNaN(t)) return;
      var d = Math.floor(t / DAY) * DAY;
      map[d] = it;
      if (d < minT) minT = d;
      if (d > maxT) maxT = d;
    });
    var now = new Date(), end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    var start = end - 13 * DAY;
    if (minT < start) start = minT;
    if (maxT > end) end = maxT;
    var out = [];
    for (var d = start; d <= end; d += DAY) {
      var it = map[d], dt = new Date(d);
      out.push({ label: pad(dt.getUTCDate()) + '.' + pad(dt.getUTCMonth() + 1), a: it ? it.count : 0, b: it ? it.uniques : 0 });
    }
    return out;
  }
  function drawLines(box, days, W, names) {
    var n = days.length, ml = 40, mr = 14, mt = 14, mb = 30, H = 220;
    var max = 0;
    days.forEach(function (d) { if (d.a > max) max = d.a; if (d.b > max) max = d.b; });
    var top = niceMax(max), pw = W - ml - mr, ph = H - mt - mb;
    var s = svg('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': names[0] + ' и ' + names[1] + ' по дням за 14 дней' }, box);
    function X(i) { return n > 1 ? ml + pw * i / (n - 1) : ml + pw / 2; }
    function Y(v) { return mt + ph - ph * v / top; }
    for (var i = 0; i <= 4; i++) {
      var y = mt + ph - ph * i / 4;
      svg('line', { 'class': 'grid-line', x1: ml, x2: W - mr, y1: y, y2: y }, s);
      svgText(s, 'ax-t end', ml - 6, y + 4, fmtN(top * i / 4));
    }
    var step = Math.max(1, Math.ceil(46 / (pw / Math.max(1, n - 1))));
    days.forEach(function (d, k) { if (k % step === 0 || k === n - 1 && step === 1) svgText(s, 'ax-t mid', X(k), H - 10, d.label); });
    var da = '', db = '';
    days.forEach(function (d, k) { da += (k ? 'L' : 'M') + X(k).toFixed(1) + ' ' + Y(d.a).toFixed(1); db += (k ? 'L' : 'M') + X(k).toFixed(1) + ' ' + Y(d.b).toFixed(1); });
    svg('path', { 'class': 'ar1', d: da + 'L' + X(n - 1).toFixed(1) + ' ' + Y(0) + 'L' + X(0).toFixed(1) + ' ' + Y(0) + 'Z' }, s);
    svg('path', { 'class': 'ln1', d: da }, s);
    svg('path', { 'class': 'ln2', d: db }, s);
    days.forEach(function (d, k) {
      var g = svg('g', {}, s);
      svg('circle', { 'class': 'dt2', cx: X(k), cy: Y(d.b), r: 3.5 }, g);
      svg('circle', { 'class': 'dt1', cx: X(k), cy: Y(d.a), r: 3.5 }, g);
      svg('title', {}, g).textContent = d.label + ': ' + names[0].toLowerCase() + ' ' + fmtN(d.a) + ', ' + names[1].toLowerCase() + ' ' + fmtN(d.b);
      svg('rect', { 'class': 'hit', x: X(k) - pw / Math.max(1, n - 1) / 2, y: mt, width: pw / Math.max(1, n - 1), height: ph }, g);
    });
    svg('line', { 'class': 'axis', x1: ml, x2: W - mr, y1: mt + ph, y2: mt + ph }, s);
  }

  // ───── разделы страницы ─────
  function summarySection(infoApp, infoSite, dl) {
    var p = panel('Сводка', 'Звёзды, форки и наблюдатели репозиториев, последний выпуск.');
    [[cfg.app, infoApp], [cfg.site, infoSite]].forEach(function (pair, idx) {
      var res = pair[1], head = el('div', 'repo-head');
      add(head, el('h3', 'serif', cfg.owner + '/' + pair[0]));
      if (res.ok) {
        var perm = res.data.permissions;
        if (perm) {
          if (perm.admin || perm.push || perm.maintain) add(head, el('span', 'tag good', perm.admin ? 'права: администратор' : 'права: запись'));
          else add(head, el('span', 'tag bad', 'только чтение — трафик недоступен'));
        }
      }
      add(p, head);
      if (!res.ok) { add(p, noteErr(res.err, 'info')); return; }
      var d = res.data, list = [
        kpi(fmtN(d.stargazers_count), 'Звёзды'),
        kpi(fmtN(d.forks_count), 'Форки'),
        kpi(fmtN(d.subscribers_count), 'Наблюдатели'),
        kpi(fmtN(d.open_issues_count), 'Открытые issues и PR')
      ];
      if (idx === 0) {
        if (dl && dl.ok && dl.info.latest) {
          var r = dl.info.latest.rel, dt = new Date(r.published_at);
          list.push(kpi(r.tag_name, 'Последний выпуск', fmtDate(dt) + ' · ' + ago(r.published_at)));
        } else if (dl && !dl.ok) list.push(kpi('—', 'Последний выпуск', 'не удалось получить'));
        else list.push(kpi('—', 'Последний выпуск', 'выпусков нет'));
      }
      add(p, kpis(list));
    });
    return p;
  }

  function downloadsSection(dl) {
    var p = panel('Скачивания', 'Сколько раз скачали файлы выпусков с github.com (это скачивания файлов, а не установки и не люди). Служебные файлы .yml и .blockmap качает автообновление приложения — в итоги они не входят.');
    if (!dl.ok) { add(p, noteErr(dl.err, 'releases')); return p; }
    var a = dl.info, rows = a.rows;
    if (!rows.length) { add(p, el('p', 'empty', 'В репозитории приложения ещё нет выпусков.')); return p; }

    // лидер среди платформ
    var best = null;
    PLAT.forEach(function (pl) { if (pl.g >= 0 && a.byPlat[pl.id] > (best ? a.byPlat[best.id] : 0)) best = pl; });
    add(p, kpis([
      kpi(fmtN(a.total), 'Всего за всё время', a.service ? '+ ' + fmtN(a.service) + ' служебных' : null),
      kpi(a.latest ? fmtN(a.latest.total) : '—', 'Последний выпуск', a.latest ? a.latest.rel.tag_name : null),
      kpi(fmtN(rows.length), plural(rows.length, ['выпуск', 'выпуска', 'выпусков']) + ' на GitHub'),
      kpi(best ? best.label.replace(/ \(.*\)$/, '') : '—', 'Чаще всего скачивают', best ? fmtN(a.byPlat[best.id]) + ' раз' : null)
    ]));

    add(p, el('h3', '', 'По выпускам'));
    var asc = rows.slice().reverse();
    add(p, chartBox(function (box, w) { drawBars(box, asc, w); }));
    add(p, legend([['l1', 'Windows'], ['l2', 'Android'], ['l3', 'Linux'], ['l4', 'Прочее']]));

    add(p, el('h3', '', 'По платформам'));
    var prow = [], ptotal = 0, plast = 0;
    PLAT.forEach(function (pl) {
      if (!a.seen[pl.id]) return;
      var last = a.latest ? (a.latest.byPlat[pl.id] || 0) : 0;
      if (pl.g >= 0) { ptotal += a.byPlat[pl.id]; plast += last; }
      prow.push([{ t: pl.label, cls: pl.g < 0 ? 'muted' : '' }, fmtN(a.byPlat[pl.id]), fmtN(last), pl.g >= 0 && a.total ? Math.round(a.byPlat[pl.id] * 100 / a.total) + '%' : '—']);
    });
    add(p, table([{ t: 'Платформа', wrap: true }, { t: 'Всего', num: true }, { t: 'Последний выпуск', num: true }, { t: 'Доля', num: true }], prow,
      ['Итого (без служебных)', fmtN(ptotal), fmtN(plast), '']));

    add(p, el('h3', '', 'Таблица по выпускам'));
    add(p, table(
      [{ t: 'Выпуск' }, { t: 'Дата' }, { t: 'Windows', num: true }, { t: 'Android', num: true }, { t: 'Linux', num: true }, { t: 'Прочее', num: true }, { t: 'Служебные', num: true }, { t: 'Всего', num: true }],
      rows.map(function (r) {
        return [{ t: r.rel.tag_name, sub: r.rel.prerelease ? 'предварительный' : null }, fmtDate(new Date(r.rel.published_at)), fmtN(r.g[0]), fmtN(r.g[1]), fmtN(r.g[2]), fmtN(r.g[3]), { t: fmtN(r.service), cls: 'muted' }, { t: fmtN(r.total), cls: 'strong' }];
      })));

    add(p, el('h3', '', 'Файлы по выпускам'));
    rows.forEach(function (r, i) {
      var d = el('details', 'rel');
      if (i === 0) d.open = true;
      var sm = el('summary');
      add(sm, el('span', '', r.rel.tag_name + (r.rel.prerelease ? ' (предварительный)' : '')),
        el('span', 's', fmtDate(new Date(r.rel.published_at)) + ' · скачано ' + fmtN(r.total) + ' · файлов ' + r.files.length));
      add(d, sm);
      if (!r.files.length) add(d, el('p', 'empty', 'У выпуска нет файлов.'));
      else add(d, table([{ t: 'Файл', wrap: true }, { t: 'Платформа' }, { t: 'Размер', num: true }, { t: 'Скачано', num: true }],
        r.files.map(function (f) { return [f.name, PLAT_BY[f.pid].label.replace(/ \(.*\)$/, ''), fmtSize(f.size), fmtN(f.count)]; })));
      add(p, d);
    });
    return p;
  }

  function trafficRepo(parent, name, tr) {
    var head = el('div', 'repo-head');
    add(head, el('h3', 'serif', cfg.owner + '/' + name));
    add(parent, head);
    var errs = [tr.views, tr.clones, tr.refs, tr.paths].filter(function (x) { return !x.ok; });
    if (errs.length === 4) { add(parent, noteErr(errs[0].err, 'traffic')); return; }
    var v = tr.views, c = tr.clones;
    var list = [];
    if (v.ok) list.push(kpi(fmtN(v.data.count), 'Просмотры', 'за 14 дней'), kpi(fmtN(v.data.uniques), 'Уникальные посетители', 'за 14 дней'));
    if (c.ok) list.push(kpi(fmtN(c.data.count), 'Клоны', 'за 14 дней'), kpi(fmtN(c.data.uniques), 'Уникальные клонировавшие', 'за 14 дней'));
    if (list.length) add(parent, kpis(list));

    var two = el('div', 'two');
    [[v, 'Просмотры', 'views', ['Просмотры', 'Уникальные посетители']], [c, 'Клоны', 'clones', ['Клоны', 'Уникальные клонировавшие']]].forEach(function (x) {
      var col = el('div');
      add(col, el('h3', '', x[1] + ' по дням'));
      if (!x[0].ok) add(col, noteErr(x[0].err, 'traffic'));
      else {
        var days = fillDays(x[0].data[x[2]]);
        add(col, chartBox(function (box, w) { drawLines(box, days, w, x[3]); }));
        add(col, legend([['l1', x[3][0]], ['l2', x[3][1] + ' (пунктир)']]));
      }
      add(two, col);
    });
    add(parent, two);

    var two2 = el('div', 'two');
    var c1 = el('div'), c2 = el('div');
    add(c1, el('h3', '', 'Откуда приходят'));
    if (!tr.refs.ok) add(c1, noteErr(tr.refs.err, 'traffic'));
    else if (!tr.refs.data.length) add(c1, el('p', 'empty', 'За 14 дней данных нет.'));
    else add(c1, table([{ t: 'Источник', wrap: true }, { t: 'Просмотры', num: true }, { t: 'Уникальные', num: true }],
      tr.refs.data.map(function (r) { return [r.referrer, fmtN(r.count), fmtN(r.uniques)]; })));
    add(c2, el('h3', '', 'Популярные страницы'));
    if (!tr.paths.ok) add(c2, noteErr(tr.paths.err, 'traffic'));
    else if (!tr.paths.data.length) add(c2, el('p', 'empty', 'За 14 дней данных нет.'));
    else add(c2, table([{ t: 'Страница', wrap: true }, { t: 'Просмотры', num: true }, { t: 'Уникальные', num: true }],
      tr.paths.data.map(function (r) { return [{ t: r.path, sub: r.title && r.title !== r.path ? r.title : null }, fmtN(r.count), fmtN(r.uniques)]; })));
    add(two2, c1, c2);
    add(parent, two2);
  }

  function trafficSection(appTr, siteTr) {
    var p = panel('Трафик за 14 дней', 'GitHub хранит трафик только за последние 14 дней и показывает его владельцу. У сайта — это заходы на страницу репозитория на github.com, а не посещения самого сайта на github.io (GitHub Pages свою статистику не отдаёт).');
    trafficRepo(p, cfg.app, appTr);
    trafficRepo(p, cfg.site, siteTr);
    return p;
  }

  // ───── метаданные: лимит и время ─────
  function showMeta(at, cached) {
    var parts = [];
    if (at) parts.push('Обновлено: ' + fmtTimeS(new Date(at)) + (cached ? ' (из кэша)' : ''));
    if (rate && !isNaN(rate.rem)) {
      parts.push('Осталось запросов: ' + fmtN(rate.rem) + (rate.lim ? ' из ' + fmtN(rate.lim) : '') + (rate.reset ? ' (сброс в ' + fmtTime(new Date(rate.reset * 1000)) + ')' : ''));
    }
    $('#meta-line').textContent = parts.join(' · ');
  }

  // ───── загрузка и показ ─────
  function setBusy(b) {
    busy = b;
    var btn = $('#b-refresh');
    btn.disabled = b;
    btn.textContent = b ? 'Обновляю…' : 'Обновить';
    $('#b-apply').disabled = b;
  }
  function load(force) {
    if (busy || !token) return;
    setBusy(true);
    showMsg($('#app-msg'), '');
    var o = repoPath, trf = function (r, what) { return settle(request(o(r) + '/traffic/' + what, force)); };
    var tasks = [
      settle(request(o(cfg.app), force, reduceRepo)),
      settle(request(o(cfg.site), force, reduceRepo)),
      settle(fetchReleases(force)),
      trf(cfg.app, 'views'), trf(cfg.app, 'clones'), trf(cfg.app, 'popular/referrers'), trf(cfg.app, 'popular/paths'),
      trf(cfg.site, 'views'), trf(cfg.site, 'clones'), trf(cfg.site, 'popular/referrers'), trf(cfg.site, 'popular/paths')
    ];
    Promise.all(tasks).then(function (r) {
      setBusy(false);
      if (!token) return; // пока ждали, нажали «Выйти»
      var all = r.slice();
      var authErr = all.filter(function (x) { return !x.ok && x.err.kind === 'auth'; })[0];
      if (authErr) { logout(errText(authErr.err)); return; }
      var dl = r[2];
      if (dl.ok) dl.info = analyze(dl.data);
      var tr = function (i) { return { views: r[i], clones: r[i + 1], refs: r[i + 2], paths: r[i + 3] }; };

      charts = [];
      out.textContent = '';
      add(out, summarySection(r[0], r[1], dl), downloadsSection(dl), trafficSection(tr(3), tr(7)));
      drawCharts(true);

      var at = Infinity, cached = true, okCount = 0;
      all.forEach(function (x) { if (x.ok) { okCount++; at = Math.min(at, x.at); cached = cached && x.cached; } });
      if (okCount) {
        showMeta(at, cached);
      } else showMeta(null, false);
      if (rate) stSet('sessionStorage', K_RATE, JSON.stringify(rate));

      var netErr = all.filter(function (x) { return !x.ok && x.err.kind === 'net'; }).length;
      var rateErr = all.filter(function (x) { return !x.ok && x.err.kind === 'rate'; })[0];
      if (netErr === all.length) showMsg($('#app-msg'), errText({ kind: 'net' }));
      else if (rateErr) showMsg($('#app-msg'), errText(rateErr.err));
    });
  }

  // ───── вход и выход ─────
  function showLogin(msg) {
    appBox.hidden = true;
    loginBox.hidden = false;
    showMsg($('#login-msg'), msg || '');
    fillCfg();
    $('#f-token').value = '';
  }
  function showApp() {
    loginBox.hidden = true;
    appBox.hidden = false;
    fillCfg();
  }
  function logout(msg) {
    token = null;
    wipe();
    charts = [];
    out.textContent = '';
    $('#meta-line').textContent = '';
    showMsg($('#app-msg'), '');
    rate = null;
    cfg = { owner: DEF.owner, app: DEF.app, site: DEF.site };
    $('#f-remember').checked = false;
    showLogin(msg);
  }

  $('#login-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var input = $('#f-token'), t = input.value.trim();
    if (!TOKEN_RE.test(t)) { showMsg($('#login-msg'), 'Вставь токен целиком: он состоит из латинских букв, цифр и знаков, без пробелов.'); return; }
    var c = readCfgFrom(loginBox), e = cfgError(c);
    if (e) { $('#repos-box-login').open = true; showMsg($('#login-msg'), e); return; }
    var remember = $('#f-remember').checked;
    wipe(); // чистим всё прежнее: другой токен — другие права
    cfg = c;
    token = t;
    input.value = '';
    stSet('sessionStorage', K_TOKEN, t);
    if (remember) stSet('localStorage', K_TOKEN, t);
    saveCfg(remember);
    showMsg($('#login-msg'), '');
    showApp();
    load(true);
  });
  $('#b-refresh').addEventListener('click', function () { load(true); });
  $('#b-logout').addEventListener('click', function () { logout(''); });
  $('#b-apply').addEventListener('click', function () {
    var c = readCfgFrom(appBox), e = cfgError(c);
    showMsg($('#cfg-msg'), e || '');
    if (e) return;
    cfg = c;
    saveCfg(stGet('localStorage', K_TOKEN) !== null);
    wipeCache();
    load(true);
  });

  var rzT = null, lastW = window.innerWidth;
  window.addEventListener('resize', function () {
    clearTimeout(rzT);
    rzT = setTimeout(function () { if (window.innerWidth !== lastW) { lastW = window.innerWidth; drawCharts(false); } }, 150);
  });

  // ───── старт ─────
  loadCfg();
  token = stGet('sessionStorage', K_TOKEN) || stGet('localStorage', K_TOKEN);
  if (token && !TOKEN_RE.test(token)) { token = null; wipe(); }
  if (token) {
    $('#f-remember').checked = stGet('localStorage', K_TOKEN) !== null;
    try { var rr = JSON.parse(stGet('sessionStorage', K_RATE) || 'null'); if (rr && typeof rr.rem === 'number') rate = rr; } catch (e) {}
    showApp();
    load(false);
  } else showLogin('');
})();
