/* Общая часть панели Refrain ИИ: сайт admin/ и мини-приложение tg/ работают через один API сервера (shared/refrain/admin.ts в Mnema).
   Токен панели живёт только в переменной внутри этого файла: вход идёт через функции ниже, наружу токен не отдаётся,
   ни в какие хранилища браузера и куки не попадает (на этом origin работает веб-версия app/ с модами). PIN нужен только на время
   одного запроса и сразу забывается. В localStorage лежит лишь адрес сервера — это не секрет.
   Все строки с сервера выводятся через textContent; HTML из строк нигде не собирается. */
(function () {
  'use strict';

  var DEFAULT_SERVER = 'https://refrain-ai.example.workers.dev';
  var K_SERVER = 'rf-admin-server';
  var SESSION_MS = 15 * 60000;
  var TIMEOUT_MS = 20000;
  var GITHUB_ISSUES = 'https://github.com/TryserPy/Mnema/issues/';
  var ID_RE = /^[\w@.%+-]{1,200}$/; // как матчер маршрутов на сервере

  // ───── мелочи ─────
  function $(s, r) { return (r || document).querySelector(s); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = String(text);
    return e;
  }
  function add(parent) {
    for (var i = 1; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      parent.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return parent;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
  function btn(text, cls, onClick) {
    var b = el('button', 'btn ' + (cls || 'btn-ghost btn-sm'), text);
    b.type = 'button';
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }
  function inp(type, attrs) {
    var i = document.createElement('input');
    i.type = type;
    i.autocomplete = 'off';
    i.spellcheck = false;
    if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) {
      if (k === 'value') i.value = attrs[k] == null ? '' : String(attrs[k]);
      else if (k === 'checked' || k === 'disabled' || k === 'required') i[k] = Boolean(attrs[k]);
      else i.setAttribute(k, String(attrs[k]));
    }
    return i;
  }
  function sel(options, value) { // options: [[value, text, disabled?]]
    var s = document.createElement('select');
    options.forEach(function (o) {
      var op = el('option', null, o[1]);
      op.value = o[0];
      if (o[2]) op.disabled = true;
      s.appendChild(op);
    });
    if (value != null) s.value = value;
    return s;
  }
  function field(label, control, hint) {
    var f = el('label', 'field');
    add(f, el('span', 'lbl', label), control);
    if (hint) add(f, el('span', 'hint', hint));
    return f;
  }
  function tag(text, kind) { return el('span', 'tag' + (kind ? ' ' + kind : ''), text); }
  function panel(title, sub) {
    var p = el('section', 'panel');
    if (title) add(p, el('h2', 'serif', title));
    if (sub) add(p, el('p', 'sub', sub));
    return p;
  }
  function table(head, numCols) {
    var w = el('div', 'tw'), t = el('table'), th = el('thead'), tr = el('tr'), tb = el('tbody');
    head.forEach(function (h, i) { add(tr, el('th', numCols && numCols.indexOf(i) >= 0 ? 'num' : null, h)); });
    add(w, add(t, add(th, tr), tb));
    return { wrap: w, body: tb, table: t };
  }
  function td(text, cls) { return el('td', cls || null, text); }
  function kv(pairs) {
    var d = el('dl', 'kv');
    pairs.forEach(function (p) { if (p && p[1] != null && p[1] !== '') add(d, el('dt', null, p[0]), el('dd', null, p[1])); });
    return d;
  }
  function plural(n, f) { var a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? f[2] : b > 1 && b < 5 ? f[1] : b === 1 ? f[0] : f[2]; }
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : 0; }
  function fmtN(n, d) { return num(n).toLocaleString('ru-RU', { maximumFractionDigits: d == null ? 0 : d }); }
  function fmtRub(n) { return num(n).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽'; }
  function fmtPct(share) { return fmtN(num(share) * 100, 1) + ' %'; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function parseTime(iso) { var t = Date.parse(iso); return isFinite(t) ? new Date(t) : null; }
  function fmtTime(iso) { var d = parseTime(iso); return d ? pad(d.getHours()) + ':' + pad(d.getMinutes()) : '—'; }
  function fmtDate(iso) { var d = parseTime(iso); return d ? pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() : '—'; }
  function fmtDT(iso) {
    var d = parseTime(iso);
    if (!d) return '—';
    var now = new Date();
    var sameDay = d.toDateString() === now.toDateString();
    return (sameDay ? 'сегодня' : pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + (d.getFullYear() !== now.getFullYear() ? '.' + d.getFullYear() : '')) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function fmtUntil(iso) {
    var d = parseTime(iso);
    if (!d) return 'бессрочно';
    if (d.getFullYear() > 9000) return 'бессрочно';
    return 'до ' + fmtDT(iso);
  }
  function fmtMin(m) {
    m = num(m);
    if (m >= 1440 && m % 1440 === 0) return fmtN(m / 1440) + ' ' + plural(m / 1440, ['день', 'дня', 'дней']);
    if (m >= 60 && m % 60 === 0) return fmtN(m / 60) + ' ' + plural(m / 60, ['час', 'часа', 'часов']);
    return fmtN(m) + ' мин';
  }
  function str(v, max) { return typeof v === 'string' ? v.slice(0, max || 2000) : v == null ? '' : String(v).slice(0, max || 2000); }
  function arr(v) { return Array.isArray(v) ? v : []; }

  // ───── хранилище: только адрес сервера и тема сайта ─────
  function stGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function stSet(k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function stDel(k) { try { window.localStorage.removeItem(k); } catch (e) { /* нет хранилища */ } }

  /** Адрес сервера → origin. Только https. */
  function normServer(v) {
    if (typeof v !== 'string') return null;
    v = v.trim();
    if (!v) return null;
    if (!/^[a-z]+:\/\//i.test(v)) v = 'https://' + v;
    var u;
    try { u = new URL(v); } catch (e) { return null; }
    if (u.protocol !== 'https:') return null; // CSP страниц пускает только https
    if (u.username || u.password) return null;
    return u.origin;
  }
  function getServer() { return normServer(stGet(K_SERVER)) || DEFAULT_SERVER; }
  /** Сохраняет адрес; пустое значение — вернуть запасной. Возвращает origin или null, если адрес не подходит. */
  function setServer(v) {
    if (!String(v || '').trim()) { stDel(K_SERVER); return DEFAULT_SERVER; }
    var o = normServer(v);
    if (!o) return null;
    if (o === DEFAULT_SERVER) stDel(K_SERVER); else stSet(K_SERVER, o);
    return o;
  }

  /** Поле «Адрес сервера» для экранов входа. */
  function serverField(onChange) {
    var box = el('details', 'more');
    var i = inp('url', { value: getServer(), maxlength: 200, placeholder: DEFAULT_SERVER, inputmode: 'url', autocapitalize: 'off' });
    var m = el('p', 'hint');
    function show() { m.textContent = 'Сейчас: ' + getServer() + '. Пустое поле — адрес по умолчанию. Адрес хранится в этом браузере, это не секрет.'; }
    show();
    i.addEventListener('change', function () {
      var o = setServer(i.value);
      if (!o) { i.setAttribute('aria-invalid', 'true'); m.textContent = 'Нужен адрес вида https://имя.workers.dev'; return; }
      i.removeAttribute('aria-invalid');
      i.value = o;
      show();
      if (onChange) onChange(o);
    });
    add(box, el('summary', null, 'Адрес сервера'), field('Сервер Refrain ИИ', i), m);
    return box;
  }

  // ───── сессия: только здесь, в памяти ─────
  var token = null;
  var expiresAt = 0;
  var expiryTimer = 0;
  var expireHandlers = [];

  function setSession(r) {
    if (!r || typeof r.token !== 'string' || !/^[\x21-\x7E]{16,512}$/.test(r.token)) throw new ApiError('internal', 0, {});
    token = r.token;
    var exp = Date.parse(r.expiresAt);
    // часы компьютера могут врать: считаем срок от своего «сейчас», но не дольше 15 минут
    expiresAt = Date.now() + Math.min(isFinite(exp) ? Math.max(exp - Date.now(), 0) : SESSION_MS, SESSION_MS);
    clearTimeout(expiryTimer);
    expiryTimer = setTimeout(function () { expire('time'); }, Math.max(expiresAt - Date.now(), 0));
  }
  function clearSession() {
    token = null;
    expiresAt = 0;
    clearTimeout(expiryTimer);
  }
  function expire(why) {
    var had = token !== null;
    clearSession();
    if (had) expireHandlers.forEach(function (f) { try { f(why); } catch (e) { /* обработчик экрана */ } });
  }
  function onExpire(f) { expireHandlers.push(f); }
  function loggedIn() { return token !== null && Date.now() < expiresAt; }
  function sessionEnds() { return expiresAt; }

  // ───── запросы ─────
  function ApiError(code, status, extra) {
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.extra = extra || {};
    this.message = code;
  }
  ApiError.prototype = Object.create(Error.prototype);

  function request(path, o) {
    o = o || {};
    var method = o.method || 'GET';
    var headers = {};
    if (o.body !== undefined) headers['content-type'] = 'application/json';
    if (o.auth !== false) {
      if (!loggedIn()) { expire('time'); return Promise.reject(new ApiError('device_unknown', 401, {})); }
      headers.authorization = 'Bearer ' + token;
    }
    if (o.pin) headers['x-refrain-pin'] = o.pin;
    var url = getServer() + path;
    if (o.query) {
      var q = new URLSearchParams();
      Object.keys(o.query).forEach(function (k) { if (o.query[k] != null && o.query[k] !== '') q.set(k, String(o.query[k])); });
      if (String(q)) url += '?' + q;
    }
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, TIMEOUT_MS) : 0;
    return fetch(url, {
      method: method,
      headers: headers,
      body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: ctl ? ctl.signal : undefined
    }).then(function (res) {
      return res.text().then(function (txt) {
        var data = null;
        try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = null; }
        if (!res.ok || !data || data.ok === false) {
          var err = data && data.error && typeof data.error === 'object' ? data.error : {};
          var code = typeof err.code === 'string' ? err.code : res.status >= 500 ? 'internal' : 'bad_request';
          var e = new ApiError(code, res.status, err);
          if (o.auth !== false && res.status === 401) expire('server');
          throw e;
        }
        return data;
      });
    }, function () {
      throw new ApiError('network', 0, {});
    }).then(function (d) { clearTimeout(timer); return d; }, function (e) { clearTimeout(timer); throw e; });
  }

  function loginEmailStart() {
    return request('/v1/admin/login/email/start', { method: 'POST', body: {}, auth: false }).then(function () { return true; });
  }
  function loginEmailVerify(code, pin) {
    return request('/v1/admin/login/email/verify', { method: 'POST', body: { code: code, pin: pin }, auth: false }).then(function (r) { setSession(r); return true; });
  }
  function loginTelegram(initData) {
    return request('/v1/admin/login/telegram', { method: 'POST', body: { initData: initData }, auth: false }).then(function (r) { setSession(r); return true; });
  }
  function logout() { clearSession(); }

  /** Текст ошибки по коду. ctx: 'pin' — запрос с PIN, 'login' — вход по коду, 'tg' — вход из Telegram. */
  function errText(e, ctx) {
    var c = e && e.code, x = (e && e.extra) || {};
    switch (c) {
      case 'network': return 'Сервер не отвечает. Проверь интернет и адрес сервера.';
      case 'code_invalid':
        if (ctx === 'pin') return 'Неверный PIN. После 5 ошибок подряд панель закроется на час.';
        if (ctx === 'login') return 'Неверный код или PIN.' + (typeof x.attemptsLeft === 'number' ? (x.attemptsLeft > 0 ? ' Осталось попыток: ' + x.attemptsLeft + '.' : ' Попытки кончились — запроси новый код.') : '');
        return 'Неверный код.';
      case 'blocked': return 'Панель закрыта' + (x.until ? ' до ' + fmtDT(x.until) : ' на час') + ': было 5 неверных PIN подряд.';
      case 'device_unknown': return ctx === 'tg' ? 'Telegram не подтвердил вход. Открой мини-приложение заново из бота.' : ctx === 'login' ? 'Вход не подтверждён.' : 'Сессия закончилась. Войди снова.';
      case 'too_fast': return 'Слишком часто.' + (x.retryAfter ? ' Подожди ' + fmtMin(Math.max(1, Math.ceil(x.retryAfter / 60))) + '.' : ' Подожди немного.');
      case 'email_rejected': return 'Почта не подходит: нужен адрес вида name@example.com.';
      case 'upstream': return 'Внешний сервис не ответил. Попробуй ещё раз.';
      case 'payload_too_large': return 'Слишком большой запрос.';
      case 'bad_request': return 'Сервер не принял запрос: проверь значения.';
      case 'internal': return 'Сбой на сервере. Попробуй позже.';
      default: return 'Ошибка сервера' + (c ? ' (' + String(c).slice(0, 40) + ')' : '') + '.';
    }
  }

  // ───── диалоги: PIN и подтверждение ─────
  function dialog(build) {
    return new Promise(function (resolve) {
      var d = el('dialog', 'dlg');
      var form = el('form');
      form.method = 'dialog';
      d.appendChild(form);
      var done = false;
      function finish(v) {
        if (done) return;
        done = true;
        try { d.close(); } catch (e) { /* уже закрыт */ }
        d.remove();
        resolve(v);
      }
      build(form, finish);
      d.addEventListener('cancel', function (ev) { ev.preventDefault(); finish(null); });
      document.body.appendChild(d);
      if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
      var f = form.querySelector('input, select, button.btn-primary, button.btn-danger');
      if (f) f.focus();
    });
  }

  /** PIN из 6 цифр. Возвращает строку или null (отмена). Значение сразу стирается из поля. */
  function askPin(what, error) {
    return dialog(function (form, finish) {
      var i = inp('password', { inputmode: 'numeric', maxlength: 6, pattern: '[0-9]{6}', 'class': 'pin', 'aria-label': 'PIN' });
      var m = el('p', 'msg err', error || '');
      m.hidden = !error;
      m.setAttribute('role', 'alert');
      add(form, el('h2', 'serif', 'Нужен PIN'), el('p', null, what), field('PIN из 6 цифр', i), m,
        add(el('div', 'row end'), btn('Отмена', 'btn-ghost', function () { i.value = ''; finish(null); }), (function () { var b = el('button', 'btn btn-primary', 'Подтвердить'); b.type = 'submit'; return b; })()));
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var v = i.value.trim();
        i.value = '';
        if (!/^\d{6}$/.test(v)) { m.textContent = 'PIN — ровно 6 цифр.'; m.hidden = false; i.focus(); return; }
        finish(v);
      });
    });
  }

  function confirmDlg(title, text, okText, danger) {
    return dialog(function (form, finish) {
      var ok = el('button', 'btn ' + (danger ? 'btn-danger' : 'btn-primary'), okText || 'Да');
      ok.type = 'submit';
      add(form, el('h2', 'serif', title), text ? el('p', null, text) : null, add(el('div', 'row end'), btn('Отмена', 'btn-ghost', function () { finish(false); }), ok));
      form.addEventListener('submit', function (ev) { ev.preventDefault(); finish(true); });
    }).then(function (v) { return v === true; });
  }

  /** Срок блокировки. Возвращает { minutes, reason } или null. */
  function blockDlg(who) {
    return dialog(function (form, finish) {
      var s = sel([['60', '1 час'], ['1440', '24 часа'], ['10080', '7 дней'], ['43200', '30 дней'], ['', 'Бессрочно']], '1440');
      var r = inp('text', { maxlength: 200, placeholder: 'вручную' });
      var ok = el('button', 'btn btn-danger', 'Заблокировать');
      ok.type = 'submit';
      add(form, el('h2', 'serif', 'Заблокировать'), el('p', null, who), field('Срок', s), field('Причина (видна только тебе)', r),
        add(el('div', 'row end'), btn('Отмена', 'btn-ghost', function () { finish(null); }), ok));
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        finish({ minutes: s.value ? Number(s.value) : null, reason: r.value.trim() || undefined });
      });
    });
  }

  /** Запрос с PIN: спросить, выполнить, при неверном PIN спросить снова. null — отмена. */
  function pinned(what, call) {
    var error = '';
    function step() {
      return askPin(what, error).then(function (pin) {
        if (pin === null) return null;
        return call(pin).catch(function (e) {
          if (e && e.code === 'code_invalid') { error = errText(e, 'pin'); return step(); }
          throw e;
        });
      });
    }
    return step();
  }

  // ───── подписи ─────
  var MODE = { off: 'Выключен', owner: 'Только я', testers: 'Тестировщики', all: 'Все' };
  var MODE_SHORT = { off: 'Выкл', owner: 'Я', testers: 'Тест', all: 'Все' };
  var MODE_DESC = {
    off: 'Refrain ИИ не работает ни у кого, и у тебя тоже. Аварийная кнопка.',
    owner: 'Работает только у тебя. Сюда же переключает аварийная пауза защиты.',
    testers: 'У тебя и у группы «Тестировщик»: по почте из списка и по приглашениям.',
    all: 'У всех учеников. Включается только с PIN.'
  };
  var PAUSE = { budget: 'кончился бюджет месяца', guard: 'аварийная пауза защиты', spike: 'скачок расхода', manual: 'пауза вручную' };
  var KIND = { account: 'Аккаунт', device: 'Устройство', ip: 'IP', asn: 'Сеть (ASN)' };
  var LEVEL = { info: ['ℹ️ инфо', 'dim'], warn: ['⚠️ важно', 'warn'], critical: ['🚨 срочно', 'bad'] };
  var ALERT_KIND = {
    key_leak: 'утечка ключа', emergency_pause: 'аварийная пауза', forgery: 'подделка запроса', travel: 'несколько мест', contract: 'выход за контракт',
    ip_block: 'блок IP', block: 'блок', pending_block: 'ждёт решения', budget: 'бюджет', spike: 'скачок расхода', greedy: 'жадный ученик',
    signup_wave: 'волна регистраций', upstream: 'сбои OpenAI', panel_login: 'вход в панель', pin_wrong: 'неверный PIN', pin_locked: 'панель закрыта', bug: 'баг'
  };
  var REACTION = {
    slowdown: 'замедлил запросы', block_account: 'заблокировал аккаунт', revoke_tokens: 'закрыл сессии', unbind_device: 'отвязал устройство',
    block_ip: 'заблокировал IP', block_asn: 'заблокировал сеть (ASN)', pending_block: 'ждёт подтверждения блока', mode_testers: 'переключил режим на «Тестировщики»',
    mode_owner: 'включил аварийную паузу', budget_pause: 'поставил на паузу по бюджету', newbie_zero: 'временно обнулил лимит «Новичка»'
  };
  var ACTOR = { system: 'сервер', 'owner:tg': 'ты · Telegram', 'owner:web': 'ты · сайт', 'owner:bot': 'ты · бот' };
  var ACTION = {
    'panel.login': 'вход в панель', 'panel.pin_wrong': 'неверный PIN', 'panel.locked': 'панель закрыта', 'access.set': 'режим доступа', 'access.pause': 'пауза',
    'access.resume': 'режим возвращён', 'budget.set': 'бюджет', 'budget.spike': 'скачок расхода', 'group.update': 'лимиты групп', 'account.group': 'группа ученика',
    'account.block': 'блок аккаунта', 'account.unblock': 'разблокировка', 'tester.add': 'тестировщик добавлен', 'tester.remove': 'тестировщик убран',
    'invite.create': 'приглашение', 'invite.revoke': 'приглашение отозвано', 'block.lift': 'блок снят', 'block.confirm': 'блок подтверждён', 'guard.config': 'пороги детектора',
    'guard.level1': 'защита: уровень 1', 'guard.level2': 'защита: уровень 2', 'guard.level3': 'защита: уровень 3', 'alert.raised': 'тревога', 'alert.sent': 'тревога отправлена',
    'alert.emailed': 'тревога ушла письмом', 'alert.undelivered': 'тревога не доставлена', 'bug.github': 'баг → GitHub', 'bug.done': 'баг закрыт', 'bug.spam': 'баг: спам',
    'key.rotated': 'ключ заменён'
  };
  var BUG_CAT = { note: 'Конспект', textbook: 'Из учебника', cards: 'Карточки', styles: 'Стили', ai: 'ИИ', other: 'Другое' };
  var BUG_STATUS = { 'new': ['новый', ''], done: ['готово', 'good'], spam: ['спам', 'bad'], github: ['в GitHub', 'dim'] };
  var GROUP_RU = { owner: 'Ты', tester: 'Тестировщик', newbie: 'Новичок', student: 'Ученик', blocked: 'Заблокирован' };
  var RULE = {
    sig_invalid: 'неверная подпись', token_unknown: 'чужой или неизвестный токен', device_unknown: 'неизвестное устройство', nonce_replay: 'повтор nonce',
    time_skew: 'время вне окна', refresh_reuse: 'повтор старого токена обновления', impossible_travel: 'невозможное перемещение', account_many_ips: 'аккаунт с многих IP',
    ip_many_accounts: 'IP с многими аккаунтами', unknown_task: 'неизвестная задача', extra_fields: 'лишние поля', oversize: 'выше рамок по размеру',
    own_prompt: 'свой промт', parallel: 'параллельный запрос', burn_rate: 'расход за час выше нормы', machine_rhythm: 'ровный ритм запросов',
    expensive_only: 'только дорогие задачи', ua_missing: 'нет заголовка приложения', app_version_unknown: 'неизвестная версия', signup_wave_ip: 'волна регистраций с IP'
  };
  var PARAM = {
    maxKmh: 'км/ч', minKm: 'км', ips: 'IP', windowMin: 'окно, мин', accounts: 'аккаунтов', groupFactor: '× группы', selfFactor: '× своей',
    minPages: 'страниц', minRequests: 'запросов', maxCv: 'разброс', share: 'доля'
  };
  function groupTitle(id, groups) {
    var g = arr(groups).filter(function (x) { return x && x.id === id; })[0];
    return g && g.title ? str(g.title, 40) : GROUP_RU[id] || str(id, 40);
  }

  // ───── оболочка панели ─────
  /**
   * Рисует панель в root. o.views — список экранов; o.via — 'web' | 'tg'; o.openLink(url) — открыть ссылку (в Telegram — через WebApp);
   * o.onLogout() — после «Выйти»; o.start — первый экран; o.alert — { id, act, target } для экрана тревоги из бота.
   */
  function mount(root, o) {
    var views = o.views.filter(function (v) { return VIEWS[v]; });
    var current = null, seq = 0, badges = {}, flashTimer = 0;
    clear(root);

    var bar = el('div', 'bar');
    var meta = el('p', 'small muted any');
    meta.setAttribute('aria-live', 'polite');
    var bl = add(el('div', 'bar-l'), el('h1', 'serif', o.via === 'tg' ? 'Refrain · панель' : 'Панель Refrain ИИ'), meta);
    var br = el('div', 'bar-r');
    add(br, btn('Обновить', 'btn-ghost btn-sm', function () { show(current); }));
    if (o.onLogout) add(br, btn('Выйти', 'btn-ghost btn-sm', function () { logout(); o.onLogout(); }));
    add(bar, bl, br);

    var nav = el('nav', 'nav');
    nav.setAttribute('aria-label', 'Разделы панели');
    var navBtns = {};
    views.forEach(function (v) {
      var b = el('button', null, VIEWS[v].title);
      b.type = 'button';
      b.dataset.view = v;
      b.addEventListener('click', function () { show(v); });
      navBtns[v] = b;
      nav.appendChild(b);
    });
    var msg = el('p', 'msg');
    msg.id = 'view-msg';
    msg.hidden = true;
    var box = el('div', 'view');
    add(root, bar, nav, msg, box);

    function tick() {
      if (!loggedIn()) return;
      var left = Math.max(0, Math.round((sessionEnds() - Date.now()) / 60000));
      meta.textContent = 'Сервер ' + getServer().replace(/^https?:\/\//, '') + ' · сессия ещё ' + left + ' мин';
    }
    tick();
    var tickTimer = setInterval(function () { if (!root.isConnected) clearInterval(tickTimer); else tick(); }, 20000);

    function flash(text, kind) {
      clearTimeout(flashTimer);
      msg.className = 'msg ' + (kind || 'ok');
      msg.setAttribute('role', kind === 'err' ? 'alert' : 'status');
      msg.textContent = text;
      msg.hidden = !text;
      if (text && kind !== 'err') flashTimer = setTimeout(function () { msg.hidden = true; }, 5000);
    }
    function setBadge(v, n) {
      var b = navBtns[v];
      if (!b) return;
      badges[v] = n;
      var old = b.querySelector('.badge');
      if (old) old.remove();
      if (n > 0) b.appendChild(el('span', 'badge', n > 99 ? '99+' : n));
    }
    function refreshBadges(ov) {
      var p = ov ? Promise.resolve(ov) : request('/v1/admin/overview');
      return p.then(function (d) {
        setBadge('alerts', num(d.unreadAlerts));
        setBadge('bugs', num(d.newBugs));
        setBadge('blocks', num(d.activeBlocks));
        return d;
      }, function () { return null; });
    }

    var ctx = {
      via: o.via,
      go: function (v) { show(v); },
      flash: flash,
      refreshBadges: refreshBadges,
      rerender: function () { show(current, true); },
      openLink: o.openLink || function (u) { window.open(u, '_blank', 'noopener,noreferrer'); },
      has: function (v) { return views.indexOf(v) >= 0; },
      /** Кнопка действия: блокирует себя на время запроса, показывает итог. fn возвращает null при отмене. */
      act: function (b, fn, okText, ctxErr) {
        b.disabled = true;
        return Promise.resolve().then(fn).then(function (r) {
          if (r !== null && r !== false && okText) flash(typeof okText === 'function' ? okText(r) : okText, 'ok');
          return r;
        }, function (e) {
          flash(errText(e, ctxErr), 'err');
          return null;
        }).then(function (r) { if (b.isConnected) b.disabled = false; return r; });
      }
    };

    function show(v, keepMsg) {
      if (!v) v = views[0];
      current = v;
      var my = ++seq;
      Object.keys(navBtns).forEach(function (k) { if (k === v) navBtns[k].setAttribute('aria-current', 'page'); else navBtns[k].removeAttribute('aria-current'); });
      if (navBtns[v] && navBtns[v].scrollIntoView && nav.scrollWidth > nav.clientWidth) navBtns[v].scrollIntoView({ block: 'nearest', inline: 'nearest' });
      if (!keepMsg) flash('');
      clear(box);
      var loading = el('div', 'panel');
      add(loading, el('div', 'skel'), el('div', 'skel'), el('div', 'skel short'));
      box.appendChild(loading);
      var out = el('div', 'view-in');
      var run = v === 'alert' ? renderAlertScreen(out, ctx, o.alert || {}) : VIEWS[v].render(out, ctx);
      Promise.resolve(run).then(function () {
        if (my !== seq) return;
        clear(box).appendChild(out);
      }, function (e) {
        if (my !== seq) return;
        clear(box);
        var p = panel(VIEWS[v] ? VIEWS[v].title : 'Тревога');
        add(p, el('p', 'msg err', errText(e)), add(el('div', 'row'), btn('Повторить', 'btn-ghost btn-sm', function () { show(v); })));
        box.appendChild(p);
      });
      tick();
    }

    refreshBadges();
    show(o.alert ? 'alert' : o.start || views[0]);
    return { show: show, flash: flash };
  }

  // ───── экраны ─────
  var VIEWS = {};

  function meter(spent, budget) {
    var share = budget > 0 ? spent / budget : 0;
    var m = el('div', 'meter'), i = el('i', share >= 1 ? 'bad' : share >= 0.8 ? 'warn' : null);
    i.style.width = Math.min(100, Math.max(0, share * 100)).toFixed(1) + '%';
    m.setAttribute('role', 'img');
    m.setAttribute('aria-label', 'потрачено ' + Math.round(share * 100) + ' %');
    return add(m, i);
  }
  function kpi(n, t, s, extra, onClick) {
    var k = el(onClick ? 'button' : 'div', 'kpi');
    if (onClick) { k.type = 'button'; k.addEventListener('click', onClick); }
    add(k, el('span', 'n', n), el('span', 't', t), s ? el('span', 's', s) : null, extra || null);
    return k;
  }

  /** «Вернуть режим»: на сервере — prevMode или «Тестировщики»; переход на «Все» — с PIN. */
  function resumeBtn(ctx, ov, after) {
    var to = ov.prevMode || 'testers';
    var b = btn('Вернуть режим «' + (MODE[to] || to) + '»', 'btn-primary btn-sm', function () {
      ctx.act(b, function () {
        if (to === 'all') return pinned('Вернуть режим «Все»: Refrain ИИ снова заработает у всех учеников.', function (pin) { return request('/v1/admin/resume', { method: 'POST', body: {}, pin: pin }); });
        return request('/v1/admin/resume', { method: 'POST', body: {} });
      }, 'Режим возвращён.').then(function (r) { if (r) (after || ctx.rerender)(); }).catch(function () {});
    });
    return b;
  }
  function pauseBtn(ctx, after) {
    var b = btn('Пауза', 'btn-danger btn-sm', function () {
      confirmDlg('Поставить Refrain ИИ на паузу?', 'Работать будет только у тебя. Вернуть прежний режим можно кнопкой «Вернуть режим».', 'Пауза', true).then(function (ok) {
        if (!ok) return;
        ctx.act(b, function () { return request('/v1/admin/pause', { method: 'POST', body: {} }); }, 'Refrain ИИ на паузе: работает только у тебя.').then(function (r) { if (r) (after || ctx.rerender)(); });
      });
    });
    return b;
  }
  function pauseBanner(ctx, ov) {
    if (!ov.paused || !ov.paused.reason) return null;
    var m = el('div', 'msg warn stack');
    add(m, el('p', null, 'Refrain ИИ на паузе: ' + (PAUSE[ov.paused.reason] || ov.paused.reason) + (ov.paused.since ? ', с ' + fmtDT(ov.paused.since) : '') + '. Сейчас режим «' + (MODE[ov.mode] || ov.mode) + '».'));
    if (ov.paused.reason === 'guard') add(m, el('p', 'small', 'Если это подозрение на утечку ключа — сначала замени ключ ИИ и нажми «Ключ заменён».'));
    add(m, add(el('div', 'row'), resumeBtn(ctx, ov), ctx.has('key') && ov.paused.reason === 'guard' ? btn('Ключ заменён…', 'btn-ghost btn-sm', function () { ctx.go('key'); }) : null));
    return m;
  }

  VIEWS.overview = {
    title: 'Обзор',
    render: function (out, ctx) {
      return request('/v1/admin/overview').then(function (ov) {
        ctx.refreshBadges(ov);
        var month = ov.month || {}, today = ov.today || {};
        var p = panel('Обзор');
        add(p, pauseBanner(ctx, ov));
        var modeRow = add(el('div', 'row'), el('span', 'muted', 'Доступ:'), tag(MODE[ov.mode] || str(ov.mode, 20), ov.mode === 'all' ? 'good' : ov.mode === 'off' ? 'bad' : ''));
        if (ctx.has('access')) add(modeRow, btn('Изменить', 'btn-ghost btn-sm', function () { ctx.go('access'); }));
        if (ov.mode !== 'owner' && ov.mode !== 'off') add(modeRow, pauseBtn(ctx));
        add(p, modeRow);
        var k = el('div', 'kpis');
        add(k,
          kpi(fmtRub(month.spentRub), 'из ' + fmtRub(month.budgetRub) + ' за месяц', fmtN(month.pages) + ' ' + plural(num(month.pages), ['страница', 'страницы', 'страниц']), meter(num(month.spentRub), num(month.budgetRub))),
          kpi(fmtRub(today.spentRub), 'из ' + fmtRub(today.budgetRub) + ' сегодня', null, meter(num(today.spentRub), num(today.budgetRub))),
          kpi(fmtN(today.students), plural(num(today.students), ['ученик сегодня', 'ученика сегодня', 'учеников сегодня']), 'запросов ' + fmtN(today.requests) + ' · ошибок ' + fmtN(today.errors)),
          kpi(fmtRub(ov.lastHourRub), 'за последний час'),
          kpi(fmtN(ov.unreadAlerts), 'непрочитанных тревог', null, null, ctx.has('alerts') ? function () { ctx.go('alerts'); } : null),
          kpi(fmtN(ov.activeBlocks), 'активных блокировок', null, null, ctx.has('blocks') ? function () { ctx.go('blocks'); } : null),
          kpi(fmtN(ov.newBugs), plural(num(ov.newBugs), ['новый баг', 'новых бага', 'новых багов']), null, null, ctx.has('bugs') ? function () { ctx.go('bugs'); } : null)
        );
        add(p, k);
        out.appendChild(p);
      });
    }
  };

  VIEWS.access = {
    title: 'Доступ',
    render: function (out, ctx) {
      return request('/v1/admin/overview').then(function (ov) {
        var p = panel('Доступ к Refrain ИИ', 'Режим касается только Refrain ИИ: остальное приложение работает у всех.');
        add(p, pauseBanner(ctx, ov));
        var seg = el('div', 'seg');
        seg.setAttribute('role', 'group');
        seg.setAttribute('aria-label', 'Режим доступа');
        ['off', 'owner', 'testers', 'all'].forEach(function (m) {
          var b = el('button', null, MODE[m]);
          b.type = 'button';
          b.setAttribute('aria-pressed', String(ov.mode === m));
          b.addEventListener('click', function () {
            if (ov.mode === m) return;
            var put = function (pin) { return request('/v1/admin/mode', { method: 'PUT', body: { mode: m }, pin: pin }); };
            var run;
            if (m === 'all') run = function () { return pinned('Режим «Все»: Refrain ИИ заработает у всех учеников.', put); };
            else if (m === 'off') run = function () { return confirmDlg('Выключить Refrain ИИ для всех?', 'Он перестанет работать у всех, включая тебя.', 'Выключить', true).then(function (ok) { return ok ? put() : null; }); };
            else run = function () { return put(); };
            ctx.act(b, run, 'Режим: «' + MODE[m] + '».').then(function (r) { if (r) ctx.rerender(); });
          });
          seg.appendChild(b);
        });
        add(p, seg);
        var modes = el('div', 'modes');
        ['off', 'owner', 'testers', 'all'].forEach(function (m) { add(modes, add(el('p'), el('b', null, MODE[m] + '. '), MODE_DESC[m])); });
        add(p, modes);
        var row = el('div', 'row');
        if (ov.mode !== 'owner' && ov.mode !== 'off') add(row, pauseBtn(ctx));
        if (ov.prevMode && !ov.paused.reason) add(row, el('span', 'small muted', 'Прежний режим: «' + (MODE[ov.prevMode] || ov.prevMode) + '».'), resumeBtn(ctx, ov));
        if (row.firstChild) add(p, row);
        out.appendChild(p);
      });
    }
  };

  VIEWS.testers = {
    title: 'Тестировщики',
    render: function (out, ctx) {
      return Promise.all([request('/v1/admin/testers'), request('/v1/admin/invites'), request('/v1/admin/groups')]).then(function (r) {
        var testers = arr(r[0].testers), invites = arr(r[1].invites), groups = arr(r[2].groups);

        var p1 = panel('Тестировщики', 'Группа «Тестировщик» по почте: при следующем входе аккаунт с этой почтой попадёт в группу.');
        var em = inp('email', { maxlength: 254, placeholder: 'name@example.com', autocapitalize: 'off', inputmode: 'email' });
        var addB = el('button', 'btn btn-primary btn-sm', 'Добавить');
        addB.type = 'submit';
        var f = add(el('form', 'inline'), field('Почта', em), addB);
        f.addEventListener('submit', function (ev) {
          ev.preventDefault();
          var v = em.value.trim();
          if (!/^[^@\s]{1,64}@[^@\s]{3,190}$/.test(v)) { ctx.flash('Почта не похожа на адрес: name@example.com.', 'err'); return; }
          ctx.act(addB, function () { return request('/v1/admin/testers', { method: 'POST', body: { email: v } }); }, 'Тестировщик добавлен.').then(function (x) { if (x) { em.value = ''; ctx.rerender(); } });
        });
        add(p1, f);
        if (!testers.length) add(p1, el('p', 'empty', 'Список пуст.'));
        else {
          var t = table(['Почта', 'Добавлен', '']);
          testers.forEach(function (x) {
            var rm = btn('Убрать', 'btn-ghost btn-sm', function () {
              confirmDlg('Убрать из тестировщиков?', str(x.emailMasked, 260), 'Убрать', true).then(function (ok) {
                if (!ok) return;
                ctx.act(rm, function () { return request('/v1/admin/testers/' + encodeURIComponent(String(x.email || '')), { method: 'DELETE' }); }, 'Убран из тестировщиков.').then(function (y) { if (y) ctx.rerender(); });
              });
            });
            add(t.body, add(el('tr'), td(str(x.emailMasked, 260), 'any'), td(fmtDate(x.addedAt)), add(el('td', 'acts'), rm)));
          });
          add(p1, t.wrap);
        }

        var p2 = panel('Приглашения', 'Код RFN-XXXX-XXXX: ученик вводит его в приложении, код один раз привязывается к почте. Места, срок и группа — здесь.');
        var seats = inp('number', { min: 1, max: 500, step: 1, value: 10, inputmode: 'numeric' });
        var days = inp('number', { min: 1, max: 365, step: 1, value: 14, inputmode: 'numeric' });
        var gs = sel(groups.filter(function (g) { return g && g.id !== 'owner' && g.id !== 'blocked'; }).map(function (g) { return [g.id, groupTitle(g.id, groups)]; }), 'tester');
        var mk = el('button', 'btn btn-primary btn-sm', 'Создать');
        mk.type = 'submit';
        var made = el('div', 'msg ok stack');
        made.hidden = true;
        var f2 = add(el('form', 'inline'), field('Мест', seats), field('Дней', days), field('Группа', gs), mk);
        f2.addEventListener('submit', function (ev) {
          ev.preventDefault();
          var s = Number(seats.value), d = Number(days.value);
          if (!Number.isInteger(s) || s < 1 || s > 500 || !Number.isInteger(d) || d < 1 || d > 365) { ctx.flash('Мест — от 1 до 500, дней — от 1 до 365.', 'err'); return; }
          ctx.act(mk, function () { return request('/v1/admin/invites', { method: 'POST', body: { seats: s, days: d, group: gs.value } }); }).then(function (x) {
            if (!x || !x.invite) return;
            var code = str(x.invite.code, 40);
            clear(made);
            var c = el('b', 'mono code-big', code);
            var cp = btn('Скопировать', 'btn-ghost btn-sm', function () {
              var done = function () { cp.textContent = 'Скопировано'; };
              if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, function () { selectText(c); });
              else selectText(c);
            });
            add(made, el('span', null, 'Новое приглашение:'), add(el('div', 'row'), c, cp), el('span', 'small', s + ' ' + plural(s, ['место', 'места', 'мест']) + ', до ' + fmtDate(x.invite.expiresAt) + ', группа «' + groupTitle(x.invite.group, groups) + '».'));
            made.hidden = false;
            request('/v1/admin/invites').then(function (y) { fillInvites(arr(y.invites)); }, function () {});
          });
        });
        add(p2, f2, made);
        var invBox = el('div');
        add(p2, invBox);
        function fillInvites(list) {
          clear(invBox);
          if (!list.length) { add(invBox, el('p', 'empty', 'Приглашений нет.')); return; }
          var t2 = table(['Код', 'Занято', 'Срок', 'Группа', 'Состояние', ''], [1]);
          list.forEach(function (x) {
            var expired = (parseTime(x.expiresAt) || new Date(0)) < new Date();
            var full = num(x.used) >= num(x.seats);
            var state = x.revoked ? tag('отозвано', 'dim') : expired ? tag('истекло', 'dim') : full ? tag('места заняты', 'warn') : tag('действует', 'good');
            var cell = el('td', 'acts');
            if (!x.revoked && !expired) {
              var rv = btn('Отозвать', 'btn-ghost btn-sm', function () {
                confirmDlg('Отозвать приглашение?', str(x.code, 40) + ': новые ученики по нему не войдут. Кто уже вошёл — останется в группе.', 'Отозвать', true).then(function (ok) {
                  if (!ok) return;
                  ctx.act(rv, function () { return request('/v1/admin/invites/' + encodeURIComponent(str(x.code, 40)), { method: 'DELETE' }); }, 'Приглашение отозвано.').then(function (y) { if (y) ctx.rerender(); });
                });
              });
              cell.appendChild(rv);
            }
            add(t2.body, add(el('tr'), td(str(x.code, 40), 'mono'), td(fmtN(x.used) + ' из ' + fmtN(x.seats), 'num'), td('до ' + fmtDate(x.expiresAt)), td(groupTitle(x.group, groups)), add(el('td'), state), cell));
          });
          add(invBox, t2.wrap);
        }
        fillInvites(invites);
        add(out, p1, p2);
      });
    }
  };
  function selectText(node) {
    try { var r = document.createRange(); r.selectNodeContents(node); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); } catch (e) { /* не страшно */ }
  }

  VIEWS.accounts = {
    title: 'Ученики',
    q: '',
    render: function (out, ctx) {
      var self = this;
      return Promise.all([request('/v1/admin/accounts', { query: { q: self.q } }), request('/v1/admin/groups')]).then(function (r) {
        var list = arr(r[0].accounts), groups = arr(r[1].groups);
        var p = panel('Ученики', 'Последние 100 аккаунтов или поиск по части почты. Почты показаны в маске.');
        var q = inp('search', { maxlength: 60, placeholder: 'часть почты', value: self.q, autocapitalize: 'off' });
        var go = el('button', 'btn btn-primary btn-sm', 'Найти');
        go.type = 'submit';
        var f = add(el('form', 'inline'), field('Поиск', q), go);
        f.addEventListener('submit', function (ev) { ev.preventDefault(); self.q = q.value.trim().slice(0, 60); ctx.rerender(); });
        add(p, f);
        if (!list.length) { add(p, el('p', 'empty', self.q ? 'Никого не нашлось.' : 'Аккаунтов пока нет.')); out.appendChild(p); return; }
        var targets = groups.filter(function (g) { return g && g.id !== 'owner' && g.id !== 'newbie'; });
        var t = table(['Почта', 'Группа', 'Сегодня', 'Месяц', 'Устр.', 'Баллы', 'Блок', ''], [2, 3, 4, 5]);
        list.forEach(function (a) {
          var id = str(a.id, 200);
          var gcell = el('td');
          if (a.group === 'owner') gcell.appendChild(tag(groupTitle('owner', groups)));
          else {
            var opts = targets.map(function (g) { return [g.id, groupTitle(g.id, groups)]; });
            if (a.group === 'newbie') opts.unshift(['newbie', groupTitle('newbie', groups), true]);
            var gsel = sel(opts, a.group);
            gsel.setAttribute('aria-label', 'Группа');
            gsel.addEventListener('change', function () {
              var to = gsel.value;
              ctx.act(gsel, function () { return request('/v1/admin/accounts/' + encodeURIComponent(id) + '/group', { method: 'POST', body: { group: to } }); }, 'Группа: «' + groupTitle(to, groups) + '».').then(function (x) { if (!x) gsel.value = a.group; else a.group = to; });
            });
            gcell.appendChild(gsel);
          }
          var blocked = Boolean(a.blockedUntil);
          var acts = el('td', 'acts');
          if (a.group !== 'owner') {
            var b = blocked
              ? btn('Разблокировать', 'btn-ghost btn-sm', function () { ctx.act(b, function () { return request('/v1/admin/accounts/' + encodeURIComponent(id) + '/unblock', { method: 'POST', body: {} }); }, 'Разблокирован.').then(function (x) { if (x) { ctx.refreshBadges(); ctx.rerender(); } }); })
              : btn('Заблокировать', 'btn-danger btn-sm', function () {
                blockDlg(str(a.emailMasked, 260)).then(function (v) {
                  if (!v) return;
                  ctx.act(b, function () { return request('/v1/admin/accounts/' + encodeURIComponent(id) + '/block', { method: 'POST', body: v }); }, 'Заблокирован.').then(function (x) { if (x) { ctx.refreshBadges(); ctx.rerender(); } });
                });
              });
            acts.appendChild(b);
          }
          var mail = add(el('td', 'any'), document.createTextNode(str(a.emailMasked, 260)), el('span', 'sub', 'с ' + fmtDate(a.createdAt)));
          add(t.body, add(el('tr'), mail, gcell, td(fmtN(a.todayPages, 1), 'num'), td(fmtN(a.monthPages, 1), 'num'), td(fmtN(a.devices), 'num'),
            td(fmtN(a.score), 'num' + (num(a.score) >= 40 ? ' warn-text' : '')), add(el('td'), blocked ? tag(fmtUntil(a.blockedUntil), 'bad') : el('span', 'faint', '—')), acts));
        });
        add(p, t.wrap);
        out.appendChild(p);
      });
    }
  };

  VIEWS.groups = {
    title: 'Лимиты',
    render: function (out, ctx) {
      return request('/v1/admin/groups').then(function (r) {
        var groups = arr(r.groups).map(function (g) { return JSON.parse(JSON.stringify(g)); });
        var p = panel('Лимиты групп', 'Страниц в день и в месяц (пусто — без лимита), запросов в минуту, устройств на аккаунт и множитель порога защиты. Лимиты «Заблокирован» всегда 0, порог «Ты» — бесконечность.');
        var body = el('div');
        add(p, body);
        function draw() {
          clear(body);
          var t = table(['Группа', 'В день', 'В месяц', 'В минуту', 'Устройств', 'Порог ×', 'Блок с подтв.', '']);
          groups.forEach(function (g, idx) {
            var fixed = g.id === 'blocked';
            var title = inp('text', { value: g.title, maxlength: 40, 'aria-label': 'Название' });
            title.addEventListener('input', function () { g.title = title.value; });
            var limit = function (key, nullable, max) {
              var i = inp('number', { min: 0, max: max, step: 1, value: g[key] == null ? '' : g[key], placeholder: nullable ? '∞' : '', disabled: fixed, inputmode: 'numeric', 'aria-label': key });
              i.addEventListener('input', function () { g[key] = i.value === '' && nullable ? null : Number(i.value); });
              return add(el('td'), i);
            };
            var gf = g.id === 'owner'
              ? add(el('td'), el('span', 'faint', '∞'))
              : (function () { var i = inp('number', { min: 1, max: 20, step: 0.5, value: g.guardFactor == null ? 1 : g.guardFactor, inputmode: 'decimal', 'aria-label': 'Порог' }); i.addEventListener('input', function () { g.guardFactor = Number(i.value); }); return add(el('td'), i); })();
            var lockConfirm = g.id === 'owner' || g.id === 'tester';
            var cb = inp('checkbox', { checked: lockConfirm || g.blockNeedsConfirm, disabled: lockConfirm, 'aria-label': 'Блок только после подтверждения' });
            cb.addEventListener('change', function () { g.blockNeedsConfirm = cb.checked; });
            var acts = el('td', 'acts');
            if (/^g_/.test(g.id)) acts.appendChild(btn('Убрать', 'btn-ghost btn-sm', function () { groups.splice(idx, 1); draw(); }));
            add(t.body, add(el('tr'), add(el('td'), title, el('span', 'sub mono', g.id)), limit('perDay', true, 100000), limit('perMonth', true, 100000), limit('perMinute', false, 600), limit('devices', false, 20), gf, add(el('td'), cb), acts));
          });
          add(body, t.wrap);
        }
        draw();
        var nid = inp('text', { maxlength: 20, placeholder: 'school', pattern: '[a-z0-9]{1,20}', autocapitalize: 'off' });
        var ntitle = inp('text', { maxlength: 40, placeholder: 'Школа №1' });
        var addB = el('button', 'btn btn-ghost btn-sm', 'Добавить группу');
        addB.type = 'submit';
        var f = add(el('form', 'inline'), field('Код группы (a–z, 0–9)', nid), field('Название', ntitle), addB);
        f.addEventListener('submit', function (ev) {
          ev.preventDefault();
          var id = 'g_' + nid.value.trim().toLowerCase();
          if (!/^g_[a-z0-9]{1,20}$/.test(id)) { ctx.flash('Код группы — латинские буквы и цифры, до 20 знаков.', 'err'); return; }
          if (groups.some(function (g) { return g.id === id; })) { ctx.flash('Такая группа уже есть.', 'err'); return; }
          groups.push({ id: id, title: ntitle.value.trim().slice(0, 40) || id, perDay: 30, perMonth: 400, perMinute: 6, devices: 3, guardFactor: 1, blockNeedsConfirm: false });
          nid.value = ''; ntitle.value = '';
          draw();
        });
        var save = btn('Сохранить лимиты', 'btn-primary', function () {
          var bad = groups.some(function (g) { return ['perDay', 'perMonth'].some(function (k) { return g[k] !== null && !(isFinite(g[k]) && g[k] >= 0); }) || !(isFinite(g.perMinute) && g.perMinute >= 0) || !(isFinite(g.devices) && g.devices >= 0); });
          if (bad) { ctx.flash('Проверь числа: только неотрицательные.', 'err'); return; }
          ctx.act(save, function () { return request('/v1/admin/groups', { method: 'PUT', body: { groups: groups } }); }, 'Лимиты сохранены.').then(function (x) { if (x) ctx.rerender(); });
        });
        add(p, f, add(el('div', 'row'), save, btn('Отменить правки', 'btn-ghost', function () { ctx.rerender(); })));
        out.appendChild(p);
      });
    }
  };

  VIEWS.budget = {
    title: 'Бюджет',
    render: function (out, ctx) {
      return request('/v1/admin/budget').then(function (r) {
        var b = r.budget || {};
        var p = panel('Бюджет', 'Сколько можно потратить на ИИ (баланс Polza.ai) и когда поднимать тревогу. Увеличение бюджета больше чем вдвое — с PIN.');
        function n(v, a) { return inp('number', Object.assign({ value: v == null ? '' : v, inputmode: 'decimal' }, a || {})); }
        var month = n(b.monthRub, { min: 0, max: 10000, step: 0.5 });
        var day = n(b.dayRub, { min: 0, max: 1000, step: 0.1, placeholder: 'авто' });
        var alertAt = inp('text', { value: arr(b.alertAt).map(function (x) { return Math.round(x * 1000) / 10; }).join(', '), maxlength: 40, inputmode: 'decimal' });
        var spikeF = n(b.spikeFactor, { min: 1.5, max: 100, step: 0.5 });
        var spikeMin = n(b.spikeMinRub, { min: 0, max: 100, step: 0.05 });
        var greedy = n(Math.round(num(b.greedyShare) * 1000) / 10, { min: 0.1, max: 100, step: 0.1 });
        var waveH = n(b.signupWaveHour, { min: 1, max: 100000, step: 1 });
        var waveIp = n(b.signupWavePerIp, { min: 1, max: 1000, step: 1 });
        var upstream = n(Math.round(num(b.upstreamErrorShare) * 1000) / 10, { min: 1, max: 100, step: 1 });
        add(p,
          add(el('div', 'grid2'), field('В месяц, ₽', month), field('В сутки, ₽', day, 'Пусто — двойная средняя доля месяца.')),
          field('Тревоги при расходе, % месяца', alertAt, 'Через запятую. На 100 % — пауза для всех, кроме тебя.'),
          el('h3', null, 'Скачок расхода'),
          add(el('div', 'grid2'), field('Час дороже среднего, раз', spikeF), field('И не меньше, ₽ за час', spikeMin)),
          el('h3', null, 'Тревоги'),
          add(el('div', 'grid2'), field('Жадный ученик, % дневного бюджета', greedy), field('Сбои OpenAI, % ошибок за 10 минут', upstream)),
          add(el('div', 'grid2'), field('Волна: новых аккаунтов за час', waveH), field('Волна: новых с одного IP', waveIp))
        );
        var save = btn('Сохранить бюджет', 'btn-primary', function () {
          var shares = alertAt.value.split(/[;,\s]+/).filter(Boolean).map(function (x) { return Number(x.replace(',', '.')) / 100; });
          var next = {
            monthRub: Number(month.value), dayRub: day.value === '' ? null : Number(day.value), alertAt: shares,
            spikeFactor: Number(spikeF.value), spikeMinRub: Number(spikeMin.value), greedyShare: Number(greedy.value) / 100,
            signupWaveHour: Number(waveH.value), signupWavePerIp: Number(waveIp.value), upstreamErrorShare: Number(upstream.value) / 100
          };
          var bad = Object.keys(next).some(function (k) { return k !== 'dayRub' && k !== 'alertAt' && !(isFinite(next[k]) && next[k] >= 0); }) || (next.dayRub !== null && !(isFinite(next.dayRub) && next.dayRub >= 0)) || !shares.length || shares.some(function (x) { return !(x > 0 && x <= 1); });
          if (bad) { ctx.flash('Проверь числа: доли — от 1 до 100 %, суммы — не меньше нуля.', 'err'); return; }
          // Та же проверка, что на сервере: без нужды PIN не спрашиваем (каждая ошибка PIN считается).
          var needPin = next.monthRub > num(b.monthRub) * 2 || (next.dayRub || 0) > (b.dayRub == null ? Infinity : b.dayRub * 2);
          var put = function (pin) { return request('/v1/admin/budget', { method: 'PUT', body: next, pin: pin }); };
          ctx.act(save, function () { return needPin ? pinned('Бюджет больше чем вдвое: ' + fmtRub(next.monthRub) + ' в месяц.', put) : put(); }, 'Бюджет сохранён.').then(function (x) { if (x) ctx.rerender(); });
        });
        add(p, add(el('div', 'row'), save));
        out.appendChild(p);
      });
    }
  };

  function alertItem(a, ctx, o) {
    o = o || {};
    var lv = LEVEL[a.level] || LEVEL.info;
    var it = el('article', 'item' + (a.level === 'critical' ? ' crit' : !a.readAt ? ' unread' : ''));
    var head = add(el('div', 'item-h'), el('b', null, str(a.title, 200)), el('span', 'small faint', fmtDT(a.at)));
    var tags = add(el('div', 'tags'), tag(lv[0], lv[1]), tag(ALERT_KIND[a.kind] || str(a.kind, 40), 'dim'));
    if (num(a.count) > 1) add(tags, tag('×' + fmtN(a.count), 'dim'));
    if (!a.readAt) add(tags, tag('не прочитано'));
    add(it, head, tags, el('p', null, str(a.text, 2000)));
    var who = a.who || {};
    var d = a.delivery || {};
    var tg = d.telegram === 'sent' ? 'отправлено' : d.telegram === 'failed' ? 'не доставлено после ' + fmtN(d.attempts) + ' ' + plural(num(d.attempts), ['попытки', 'попыток', 'попыток']) : 'ждёт отправки' + (num(d.attempts) ? ', попыток ' + fmtN(d.attempts) : '') + (d.nextTryAt ? ', следующая в ' + fmtTime(d.nextTryAt) : '');
    var mail = d.email === 'sent' ? 'письмо отправлено' : d.email === 'failed' ? 'письмо не ушло' : null;
    add(it, kv([
      ['Кто', [who.email, who.ip ? 'IP ' + who.ip : '', who.asn ? 'AS' + who.asn : '', who.device ? 'устройство «' + who.device + '»' : ''].filter(Boolean).map(function (x) { return str(x, 200); }).join(' · ')],
      ['Правила', arr(a.rules).map(function (x) { return RULE[x] ? RULE[x] + ' (' + x + ')' : str(x, 40); }).join(', ')],
      ['Сервер уже', arr(a.done).map(function (x) { return REACTION[x] || str(x, 40); }).join(', ')],
      ['Доставка', 'Telegram: ' + tg + (mail ? ' · ' + mail : '')]
    ]));
    if (o.actions !== false) {
      var row = el('div', 'row');
      if (!a.readAt) {
        var rd = btn('Прочитано', 'btn-ghost btn-sm', function () {
          ctx.act(rd, function () { return request('/v1/admin/alerts/' + encodeURIComponent(String(a.id)) + '/read', { method: 'POST', body: {} }); }).then(function (x) { if (x) { ctx.refreshBadges(); ctx.rerender(); } });
        });
        add(row, rd);
      }
      arr(a.buttons).forEach(function (bt) {
        if (bt === 'pause') add(row, pauseBtn(ctx));
        else if (bt === 'restore_mode') add(row, btn('Вернуть режим…', 'btn-ghost btn-sm', function () { ctx.go('access'); }));
        else if (bt === 'block' && ctx.has('accounts') && a.kind !== 'pending_block') add(row, btn('К ученикам', 'btn-ghost btn-sm', function () { ctx.go('accounts'); }));
        else if ((bt === 'unblock' || (bt === 'block' && a.kind === 'pending_block')) && ctx.has('blocks')) add(row, btn('К блокировкам', 'btn-ghost btn-sm', function () { ctx.go('blocks'); }));
      });
      if (a.kind === 'key_leak' && ctx.has('key')) add(row, btn('Ключ заменён…', 'btn-ghost btn-sm', function () { ctx.go('key'); }));
      if (row.firstChild) add(it, row);
    }
    return it;
  }

  VIEWS.alerts = {
    title: 'Тревоги',
    unread: true,
    render: function (out, ctx) {
      var self = this;
      return request('/v1/admin/alerts', { query: self.unread ? { unread: 1 } : null }).then(function (r) {
        var list = arr(r.alerts);
        var p = panel('Тревоги', 'Тревоги хранятся на сервере, пока не прочитаны. Доставка: Telegram сразу, повторы через 30 с, 2 и 10 минут, потом письмо.');
        var seg = el('div', 'seg seg2');
        [[true, 'Непрочитанные'], [false, 'Все']].forEach(function (x) {
          var b = el('button', null, x[1]);
          b.type = 'button';
          b.setAttribute('aria-pressed', String(self.unread === x[0]));
          b.addEventListener('click', function () { if (self.unread !== x[0]) { self.unread = x[0]; ctx.rerender(); } });
          seg.appendChild(b);
        });
        var row = add(el('div', 'row'), seg);
        var unread = list.filter(function (a) { return !a.readAt; });
        if (unread.length > 1) {
          var all = btn('Прочитать все (' + unread.length + ')', 'btn-ghost btn-sm', function () {
            ctx.act(all, function () {
              return unread.reduce(function (pr, a) { return pr.then(function () { return request('/v1/admin/alerts/' + encodeURIComponent(String(a.id)) + '/read', { method: 'POST', body: {} }); }); }, Promise.resolve());
            }, 'Все тревоги прочитаны.').then(function () { ctx.refreshBadges(); ctx.rerender(); });
          });
          add(row, all);
        }
        add(p, row);
        if (!list.length) add(p, el('p', 'empty', self.unread ? 'Непрочитанных тревог нет.' : 'Тревог нет.'));
        else { var items = el('div', 'items'); list.forEach(function (a) { items.appendChild(alertItem(a, ctx)); }); add(p, items); }
        out.appendChild(p);
      });
    }
  };

  function blockItem(b, ctx, after) {
    var it = el('article', 'item' + (b.pending ? ' unread' : ''));
    add(it, add(el('div', 'item-h'), el('b', null, str(b.label, 260)), el('span', 'small faint', 'с ' + fmtDT(b.since))));
    var tags = add(el('div', 'tags'), tag(KIND[b.kind] || str(b.kind, 20), 'dim'), tag(fmtUntil(b.until), 'bad'));
    if (b.pending) add(tags, tag('ждёт подтверждения', 'warn'));
    add(it, tags, kv([['Причина', str(b.reason, 400)], ['Правила', arr(b.rules).map(function (x) { return RULE[x] ? RULE[x] + ' (' + x + ')' : str(x, 40); }).join(', ')]]));
    var row = el('div', 'row');
    var lift = btn(b.pending ? 'Отклонить' : 'Снять', 'btn-ghost btn-sm', function () {
      ctx.act(lift, function () { return request('/v1/admin/blocks/' + encodeURIComponent(String(b.id)) + '/lift', { method: 'POST', body: {} }); }, b.pending ? 'Блок отклонён.' : 'Блок снят.').then(function (x) { if (x) { ctx.refreshBadges(); (after || ctx.rerender)(); } });
    });
    if (b.pending) {
      var conf = btn('Подтвердить блок', 'btn-danger btn-sm', function () {
        ctx.act(conf, function () { return request('/v1/admin/blocks/' + encodeURIComponent(String(b.id)) + '/confirm', { method: 'POST', body: {} }); }, 'Блок подтверждён.').then(function (x) { if (x) { ctx.refreshBadges(); (after || ctx.rerender)(); } });
      });
      add(row, conf);
    }
    add(row, lift);
    return add(it, row);
  }

  VIEWS.blocks = {
    title: 'Блокировки',
    render: function (out, ctx) {
      return request('/v1/admin/blocks').then(function (r) {
        var list = arr(r.blocks);
        var p = panel('Блокировки', 'Действующие блоки и замедления. Блок тестировщика ждёт твоего подтверждения. Разблокировать можно только отсюда или из бота.');
        if (list.length) {
          var all = btn('Снять все (' + list.length + ')', 'btn-danger btn-sm', function () {
            confirmDlg('Снять все блокировки?', 'Снимутся все ' + list.length + ', включая ожидающие подтверждения.', 'Продолжить', true).then(function (ok) {
              if (!ok) return;
              ctx.act(all, function () { return pinned('Снять все блокировки сразу.', function (pin) { return request('/v1/admin/blocks/lift-all', { method: 'POST', body: {}, pin: pin }); }); }, function (x) { return 'Снято блокировок: ' + fmtN(x.lifted) + '.'; }).then(function (x) { if (x) { ctx.refreshBadges(); ctx.rerender(); } });
            });
          });
          add(p, add(el('div', 'row'), all));
          var pend = list.filter(function (b) { return b.pending; }), rest = list.filter(function (b) { return !b.pending; });
          var items = el('div', 'items');
          pend.concat(rest).forEach(function (b) { items.appendChild(blockItem(b, ctx)); });
          add(p, items);
        } else add(p, el('p', 'empty', 'Блокировок нет.'));
        out.appendChild(p);
      });
    }
  };

  VIEWS.guard = {
    title: 'Пороги',
    render: function (out, ctx) {
      return request('/v1/admin/guard').then(function (r) {
        var g = JSON.parse(JSON.stringify(r.guard || {}));
        g.rules = g.rules || {};
        g.leak = g.leak || {};
        var p = panel('Пороги детектора', 'Баллы за срабатывание правила копятся у субъекта и затухают вдвое за полураспад. Сохранение — с PIN.');
        var inputs = [];
        function nf(label, obj, key, o) {
          o = o || {};
          var scale = o.pct ? 100 : 1;
          var i = inp('number', { min: o.min == null ? 0 : o.min, max: o.max, step: o.step || 1, value: obj[key] == null ? '' : Math.round(num(obj[key]) * scale * 1000) / 1000, inputmode: 'decimal' });
          inputs.push(function () { var v = Number(i.value); if (i.value === '' || !isFinite(v) || v < 0) return label; obj[key] = v / scale; return null; });
          return field(label, i, o.hint);
        }
        add(p,
          el('h3', null, 'Уровни'),
          add(el('div', 'grid3'), nf('Уровень 1, баллов', g, 'level1', { min: 1 }), nf('Уровень 2, баллов', g, 'level2', { min: 2 }), nf('Полураспад баллов, мин', g, 'halfLifeMin', { min: 1 })),
          add(el('div', 'grid3'), nf('Доля IP за нарушения аккаунта, %', g, 'ipShareKnown', { pct: true, max: 100, hint: 'Чтобы один ученик не заблокировал школьный NAT.' }), nf('Замедление: лимит ÷', g, 'slowdownFactor', { min: 1, step: 0.5 }), nf('Замедление, мин', g, 'slowdownMin', { min: 1 })),
          el('h3', null, 'Сроки блока (уровень 2)'),
          add(el('div', 'grid3'), nf('Аккаунт, мин', g, 'blockAccountMin', { min: 1 }), nf('IP, мин', g, 'blockIpMin', { min: 1 }), nf('Сеть (ASN), мин', g, 'blockAsnMin', { min: 1 })),
          el('h3', null, 'Массовая атака (уровень 3)'),
          add(el('div', 'grid2'), nf('Аккаунтов на уровне 2', g, 'massAccounts', { min: 2 }), nf('За окно, мин', g, 'massWindowMin', { min: 1 }))
        );

        var leakOn = inp('checkbox', { checked: g.leak.enabled !== false });
        inputs.push(function () { g.leak.enabled = leakOn.checked; return null; });
        add(p,
          el('h3', null, 'Сверка с OpenAI (утечка ключа)'),
          add(el('label', 'check'), leakOn, el('span', null, 'Сверять расход у OpenAI с нашим учётом')),
          add(el('div', 'grid3'), nf('Каждые, мин', g.leak, 'everyMin', { min: 5, max: 60 }), nf('Окно, мин', g.leak, 'windowMin', { min: 10 }), nf('Задержка данных, мин', g.leak, 'lagMin')),
          add(el('div', 'grid3'), nf('Больше нашего на, %', g.leak, 'overShare', { pct: true, min: 1 }), nf('И больше на, $', g.leak, 'overRub', { step: 0.05 }), nf('При нуле запросов больше, $', g.leak, 'idleRub', { step: 0.05 }))
        );

        add(p, el('h3', null, 'Правила'));
        var t = table(['Правило', 'Вкл', 'Баллы', 'Кому', 'Параметры']);
        Object.keys(g.rules).forEach(function (id) {
          var rule = g.rules[id] || {};
          var on = inp('checkbox', { checked: rule.enabled !== false, 'aria-label': 'Включено: ' + id });
          var w = inp('number', { min: 0, max: 1000, step: 1, value: num(rule.weight), inputmode: 'numeric', 'aria-label': 'Баллы: ' + id });
          inputs.push(function () { rule.enabled = on.checked; var v = Number(w.value); if (w.value === '' || !isFinite(v) || v < 0) return id; rule.weight = v; return null; });
          var params = el('td', 'params');
          Object.keys(rule.params || {}).forEach(function (k) {
            var pi = inp('number', { min: 0, step: k === 'maxCv' || k === 'share' ? 0.01 : 1, value: num(rule.params[k]), inputmode: 'decimal', 'aria-label': id + ' ' + k });
            inputs.push(function () { var v = Number(pi.value); if (pi.value === '' || !isFinite(v) || v < 0) return id + ' ' + k; rule.params[k] = v; return null; });
            add(params, add(el('label', 'param'), el('span', null, PARAM[k] || k), pi));
          });
          var name = add(el('td'), el('span', 'mono', id), el('span', 'sub', (RULE[id] || '') + (rule.instantLevel2 ? ' · сразу уровень 2' : '')));
          add(t.body, add(el('tr'), name, add(el('td'), on), add(el('td'), w), td(arr(rule.subjects).map(function (s) { return KIND[s] || s; }).join(', ')), params));
        });
        add(p, t.wrap);
        var save = btn('Сохранить пороги', 'btn-primary', function () {
          var bad = inputs.map(function (f) { return f(); }).filter(Boolean);
          if (bad.length) { ctx.flash('Проверь числа: ' + bad.slice(0, 3).join(', ') + '.', 'err'); return; }
          if (g.level2 <= g.level1) { ctx.flash('Уровень 2 должен быть выше уровня 1.', 'err'); return; }
          ctx.act(save, function () { return pinned('Изменить пороги детектора.', function (pin) { return request('/v1/admin/guard', { method: 'PUT', body: g, pin: pin }); }); }, 'Пороги сохранены.').then(function (x) { if (x) ctx.rerender(); });
        });
        add(p, add(el('div', 'row'), save, btn('Отменить правки', 'btn-ghost', function () { ctx.rerender(); })));
        out.appendChild(p);
      });
    }
  };

  function shortJson(v) {
    if (v === undefined) return '';
    try { var s = JSON.stringify(v, null, 1); return s.length > 4000 ? s.slice(0, 4000) + '…' : s; } catch (e) { return ''; }
  }

  VIEWS.journal = {
    title: 'Журнал',
    render: function (out, ctx) {
      var p = panel('Журнал действий', 'Что меняли, когда и откуда — и защита, и панель. Без текстов запросов, полных почт и IP.');
      var t = table(['Когда', 'Кто', 'Действие', 'Цель', 'Подробности']);
      var more = btn('Показать ещё', 'btn-ghost btn-sm');
      var empty = el('p', 'empty', 'Журнал пуст.');
      empty.hidden = true;
      add(p, t.wrap, empty, add(el('div', 'row'), more));
      var oldest = null;
      function load() {
        return request('/v1/admin/journal', { query: oldest ? { before: oldest } : null }).then(function (r) {
          var list = arr(r.journal);
          list.forEach(function (j) {
            if (oldest === null || num(j.id) < oldest) oldest = num(j.id);
            var det = el('td', 'any');
            if (j.reason) add(det, el('span', null, str(j.reason, 400)));
            if (arr(j.rules).length) add(det, el('span', 'sub', arr(j.rules).join(', ')));
            if (j.score != null) add(det, el('span', 'sub', 'баллы: ' + fmtN(j.score)));
            if (j.before !== undefined || j.after !== undefined) {
              var dd = el('details', 'jd');
              add(dd, el('summary', null, 'до / после'), el('pre', 'raw', (j.before !== undefined ? 'до: ' + shortJson(j.before) + '\n' : '') + (j.after !== undefined ? 'после: ' + shortJson(j.after) : '')));
              add(det, dd);
            }
            var target = j.target ? (KIND[j.target.kind] || str(j.target.kind, 20)) + ' ' + str(j.target.id, 200) : '—';
            add(t.body, add(el('tr'), td(fmtDT(j.at)), td(ACTOR[j.actor] || str(j.actor, 30)), add(el('td'), el('span', null, ACTION[j.action] || str(j.action, 60)), el('span', 'sub mono', str(j.action, 60))), td(target, 'any'), det));
          });
          empty.hidden = t.body.childNodes.length > 0;
          t.wrap.hidden = !t.body.childNodes.length;
          more.hidden = list.length < 50;
        });
      }
      more.addEventListener('click', function () { ctx.act(more, load); });
      return load().then(function () { out.appendChild(p); });
    }
  };

  VIEWS.stats = {
    title: 'Расход',
    days: 30,
    render: function (out, ctx) {
      var self = this;
      return request('/v1/admin/stats', { query: { days: self.days } }).then(function (r) {
        var list = arr(r.stats);
        var p = panel('Расход', 'По дням (московское время) и по задачам. Страница — условная единица: около 0,04 ₽ (38 554 микрорубля).');
        var seg = el('div', 'seg seg3');
        [7, 30, 90].forEach(function (d) {
          var b = el('button', null, d + ' ' + plural(d, ['день', 'дня', 'дней']));
          b.type = 'button';
          b.setAttribute('aria-pressed', String(self.days === d));
          b.addEventListener('click', function () { if (self.days !== d) { self.days = d; ctx.rerender(); } });
          seg.appendChild(b);
        });
        add(p, seg);
        var tot = { rub: 0, pages: 0, requests: 0 }, tasks = {};
        list.forEach(function (d) {
          tot.rub += num(d.rub); tot.pages += num(d.pages); tot.requests += num(d.requests);
          var bt = d.byTask && typeof d.byTask === 'object' ? d.byTask : {};
          Object.keys(bt).forEach(function (k) { var x = tasks[k] || (tasks[k] = { rub: 0, requests: 0 }); x.rub += num(bt[k] && bt[k].rub); x.requests += num(bt[k] && bt[k].requests); });
        });
        add(p, add(el('div', 'kpis'), kpi(fmtRub(tot.rub), 'за ' + self.days + ' ' + plural(self.days, ['день', 'дня', 'дней'])), kpi(fmtN(tot.pages), 'страниц'), kpi(fmtN(tot.requests), 'запросов'), kpi(fmtRub(list.length ? tot.rub / list.length : 0), 'в среднем за день с расходом')));
        if (!list.length) { add(p, el('p', 'empty', 'За этот срок расхода не было.')); out.appendChild(p); return; }
        var max = Math.max.apply(null, list.map(function (d) { return num(d.rub); }).concat([0.000001]));
        add(p, el('h3', null, 'По дням'));
        var t = table(['День', '₽', 'Страниц', 'Запросов', ''], [1, 2, 3]);
        list.slice().reverse().forEach(function (d) {
          var bar = el('div', 'hbar');
          bar.style.width = Math.max(1, num(d.rub) / max * 100).toFixed(1) + '%';
          add(t.body, add(el('tr'), td(str(d.day, 10), 'mono'), td(fmtRub(d.rub), 'num'), td(fmtN(d.pages), 'num'), td(fmtN(d.requests), 'num'), add(el('td', 'bar-cell'), bar)));
        });
        add(p, t.wrap, el('h3', null, 'По задачам'));
        var t2 = table(['Задача', '₽', 'Запросов', 'Доля'], [1, 2, 3]);
        Object.keys(tasks).sort(function (a, b) { return tasks[b].rub - tasks[a].rub; }).forEach(function (k) {
          add(t2.body, add(el('tr'), td(str(k, 60), 'mono'), td(fmtRub(tasks[k].rub), 'num'), td(fmtN(tasks[k].requests), 'num'), td(tot.rub > 0 ? fmtPct(tasks[k].rub / tot.rub) : '—', 'num')));
        });
        add(p, t2.wrap);
        out.appendChild(p);
      });
    }
  };

  VIEWS.bugs = {
    title: 'Баги',
    onlyNew: true,
    render: function (out, ctx) {
      var self = this;
      return request('/v1/admin/bugs').then(function (r) {
        var all = arr(r.bugs);
        var list = self.onlyNew ? all.filter(function (b) { return b.status === 'new'; }) : all;
        var p = panel('Баги', 'Из формы «Сообщить о проблеме». Текст хранится 90 дней. «В GitHub» создаёт issue в открытом репозитории — без почты и снимка.');
        var seg = el('div', 'seg seg2');
        [[true, 'Новые'], [false, 'Все']].forEach(function (x) {
          var b = el('button', null, x[1]);
          b.type = 'button';
          b.setAttribute('aria-pressed', String(self.onlyNew === x[0]));
          b.addEventListener('click', function () { if (self.onlyNew !== x[0]) { self.onlyNew = x[0]; ctx.rerender(); } });
          seg.appendChild(b);
        });
        add(p, seg);
        if (!list.length) { add(p, el('p', 'empty', self.onlyNew ? 'Новых багов нет.' : 'Багов нет.')); out.appendChild(p); return; }
        var items = el('div', 'items');
        list.forEach(function (b) {
          var st = BUG_STATUS[b.status] || [str(b.status, 20), 'dim'];
          var it = el('article', 'item' + (b.status === 'new' ? ' unread' : ''));
          var app = b.app || {};
          add(it, add(el('div', 'item-h'), el('b', null, 'Баг #' + num(b.id) + ' · ' + (BUG_CAT[b.category] || str(b.category, 40))), el('span', 'small faint', fmtDT(b.at))));
          var tags = add(el('div', 'tags'), tag(st[0], st[1]));
          add(it, tags, el('p', null, str(b.text, 4000)));
          add(it, kv([['Приложение', ['Refrain ' + str(app.version, 40), str(app.os, 80), str(app.platform, 40), app.style ? 'стиль «' + str(app.style, 60) + '»' : ''].filter(Boolean).join(' · ')]]));
          var issue = num(b.githubIssue);
          if (issue > 0) {
            var a = el('a', null, 'Issue #' + issue);
            a.href = GITHUB_ISSUES + issue;
            a.rel = 'noopener noreferrer';
            a.target = '_blank';
            a.addEventListener('click', function (ev) { ev.preventDefault(); ctx.openLink(a.href); });
            add(tags, a);
          }
          if (arr(b.log).length) {
            var lg = el('details', 'more');
            add(lg, el('summary', null, 'Журнал ошибок (' + arr(b.log).length + ')'), el('pre', 'raw', arr(b.log).slice(0, 200).map(function (x) { return str(x, 500); }).join('\n')));
            add(it, lg);
          }
          var row = el('div', 'row');
          if (b.status !== 'github' && b.status !== 'spam') {
            var gh = btn('В GitHub', 'btn-ghost btn-sm', function () {
              ctx.act(gh, function () { return request('/v1/admin/bugs/' + encodeURIComponent(String(b.id)) + '/github', { method: 'POST', body: {} }); }, function (x) { return 'Создан issue #' + num(x.issue) + '.'; }).then(function (x) { if (x) { ctx.refreshBadges(); ctx.rerender(); } });
            });
            add(row, gh);
          }
          if (b.status === 'new') {
            var dn = btn('Готово', 'btn-ghost btn-sm', function () {
              ctx.act(dn, function () { return request('/v1/admin/bugs/' + encodeURIComponent(String(b.id)) + '/done', { method: 'POST', body: {} }); }, 'Баг закрыт.').then(function (x) { if (x) { ctx.refreshBadges(); ctx.rerender(); } });
            });
            var sp = btn('Спам · блок', 'btn-danger btn-sm', function () {
              confirmDlg('Это спам?', 'Баг пометится спамом, отправитель (его IP) будет заблокирован на 7 дней.', 'Спам · блок', true).then(function (ok) {
                if (!ok) return;
                ctx.act(sp, function () { return request('/v1/admin/bugs/' + encodeURIComponent(String(b.id)) + '/spam', { method: 'POST', body: {} }); }, 'Помечен спамом, отправитель заблокирован.').then(function (x) { if (x) { ctx.refreshBadges(); ctx.rerender(); } });
              });
            });
            add(row, dn, sp);
          }
          if (row.firstChild) add(it, row);
          items.appendChild(it);
        });
        add(p, items);
        out.appendChild(p);
      });
    }
  };

  VIEWS.key = {
    title: 'Ключ',
    render: function (out, ctx) {
      return request('/v1/admin/overview').then(function (ov) {
        var p = panel('Ключ ИИ заменён', 'Если пришла тревога «Подозрение на утечку ключа», сервер сам включил аварийную паузу. Отозвать ключ он не может — это делаешь ты.');
        var ol = el('ol', 'steps');
        [
          ['Открой ', el('b', null, 'polza.ai → API-ключи'), ' (или platform.openai.com → проект Refrain → API keys) и создай новый ключ.'],
          ['В папке ', el('span', 'mono', 'server'), ' выполни ', el('span', 'mono', 'npx wrangler secret put OPENAI_API_KEY'), ' и вставь новый ключ.'],
          ['Там же удали (отзови) старый ключ.'],
          ['Нажми ', el('b', null, '«Ключ заменён»'), ' ниже (нужен PIN): сервер снимет подозрение на утечку.'],
          ['Верни режим кнопкой ', el('b', null, '«Вернуть режим»'), '.']
        ].forEach(function (parts) { var li = el('li'); parts.forEach(function (x) { add(li, x); }); ol.appendChild(li); });
        add(p, ol);
        var row = el('div', 'row');
        var done = btn('Ключ заменён', 'btn-primary', function () {
          ctx.act(done, function () { return pinned('Подтверди, что ключ ИИ заменён и старый отозван.', function (pin) { return request('/v1/admin/key-rotated', { method: 'POST', body: {}, pin: pin }); }); }, 'Подозрение снято. Теперь можно вернуть режим.').then(function (x) {
            if (x && !row.querySelector('.resume')) { var rb = resumeBtn(ctx, ov); rb.classList.add('resume'); row.appendChild(rb); }
          });
        });
        add(row, done);
        if (ov.paused && ov.paused.reason) { var rb = resumeBtn(ctx, ov); rb.classList.add('resume'); add(row, rb); }
        add(p, row);
        out.appendChild(p);
      });
    }
  };

  // ───── экран тревоги из бота: tg/#alert=<id>&do=<действие>&t=<цель> ─────
  var ALERT_ACTS = ['block', 'unblock', 'pause', 'restore_mode', 'open_panel'];
  /** Разбор адреса кнопки тревоги. Telegram дописывает в тот же hash свои tgWebApp* — они пропускаются. */
  function parseAlertHash(hash) {
    var q;
    try { q = new URLSearchParams(String(hash || '').replace(/^#/, '')); } catch (e) { return null; }
    var id = q.get('alert');
    if (!id || !/^\d{1,12}$/.test(id)) return null;
    var act = q.get('do');
    var t = q.get('t');
    return { id: Number(id), act: ALERT_ACTS.indexOf(act) >= 0 ? act : null, target: t && ID_RE.test(t) ? t : null };
  }

  function renderAlertScreen(out, ctx, o) {
    return request('/v1/admin/alerts').then(function (r) {
      var a = arr(r.alerts).filter(function (x) { return num(x.id) === o.id; })[0];
      var p = panel('Тревога #' + o.id);
      if (!a) {
        add(p, el('p', 'empty', 'Тревога не найдена: возможно, она уже старая. Остальное — в панели.'));
        out.appendChild(p);
        return;
      }
      if (!a.readAt) request('/v1/admin/alerts/' + encodeURIComponent(String(a.id)) + '/read', { method: 'POST', body: {} }).then(function () { ctx.refreshBadges(); }, function () {});
      add(p, alertItem(a, ctx, { actions: false }));
      var box = el('div', 'alert-act');
      var after = function (text) { return function () { clear(box); add(box, el('p', 'msg ok', text)); }; };
      var id = o.target;
      if (o.act === 'pause') {
        add(box, el('b', null, 'Пауза Refrain ИИ'), el('p', 'small', 'Работать будет только у тебя. Прежний режим запомнится.'));
        var pb = btn('Поставить на паузу', 'btn-danger', function () {
          ctx.act(pb, function () { return request('/v1/admin/pause', { method: 'POST', body: {} }); }).then(function (x) { if (x) after('Refrain ИИ на паузе: работает только у тебя.')(); });
        });
        add(box, pb);
      } else if (o.act === 'restore_mode') {
        return request('/v1/admin/overview').then(function (ov) {
          var to = ov.prevMode || 'testers';
          add(box, el('b', null, 'Вернуть режим «' + (MODE[to] || to) + '»'), el('p', 'small', 'Сейчас: «' + (MODE[ov.mode] || ov.mode) + '».' + (to === 'all' ? ' Переход на «Все» — с PIN.' : '')));
          add(box, resumeBtn(ctx, ov, after('Режим возвращён: «' + (MODE[to] || to) + '».')));
          add(p, box);
          out.appendChild(p);
        });
      } else if (o.act === 'block' && a.kind === 'pending_block') {
        return request('/v1/admin/blocks').then(function (rb) {
          var pend = arr(rb.blocks).filter(function (b) { return b.pending; });
          add(box, el('b', null, 'Ждут подтверждения'));
          if (!pend.length) add(box, el('p', 'small', 'Ожидающих блоков нет — уже решено.'));
          var items = el('div', 'items');
          pend.forEach(function (b) { items.appendChild(blockItem(b, ctx, function () { ctx.rerender(); })); });
          add(box, items);
          add(p, box);
          out.appendChild(p);
        });
      } else if (o.act === 'block' && id) {
        add(box, el('b', null, 'Заблокировать аккаунт'), el('p', 'small', (a.who && a.who.email ? str(a.who.email, 260) + '. ' : '') + 'Сессии аккаунта закроются.'));
        var bb = btn('Заблокировать…', 'btn-danger', function () {
          blockDlg(a.who && a.who.email ? str(a.who.email, 260) : 'Аккаунт из тревоги').then(function (v) {
            if (!v) return;
            ctx.act(bb, function () { return request('/v1/admin/accounts/' + encodeURIComponent(id) + '/block', { method: 'POST', body: v }); }).then(function (x) { if (x) after('Аккаунт заблокирован.')(); });
          });
        });
        add(box, bb);
      } else if (o.act === 'unblock' && id) {
        add(box, el('b', null, 'Разблокировать аккаунт'), el('p', 'small', 'Снимет блок, обнулит баллы и историю детектора для аккаунта.'));
        var ub = btn('Разблокировать', 'btn-primary', function () {
          ctx.act(ub, function () { return request('/v1/admin/accounts/' + encodeURIComponent(id) + '/unblock', { method: 'POST', body: {} }); }).then(function (x) { if (x) { ctx.refreshBadges(); after('Аккаунт разблокирован.')(); } });
        });
        add(box, ub);
        if (ctx.has('blocks')) add(box, btn('Все блокировки', 'btn-ghost btn-sm', function () { ctx.go('blocks'); }));
      } else if (o.act === 'block' || o.act === 'unblock') {
        add(box, el('b', null, o.act === 'block' ? 'Кого блокировать — выбери в списке' : 'Снять блок — в списке блокировок'));
        add(box, btn(o.act === 'block' ? 'Ученики' : 'Блокировки', 'btn-primary', function () { ctx.go(o.act === 'block' ? 'accounts' : 'blocks'); }));
      }
      if (box.firstChild) add(p, box);
      out.appendChild(p);
    });
  }

  window.RefrainPanel = {
    DEFAULT_SERVER: DEFAULT_SERVER,
    getServer: getServer,
    setServer: setServer,
    serverField: serverField,
    loginEmailStart: loginEmailStart,
    loginEmailVerify: loginEmailVerify,
    loginTelegram: loginTelegram,
    logout: logout,
    loggedIn: loggedIn,
    onExpire: onExpire,
    errText: errText,
    parseAlertHash: parseAlertHash,
    mount: mount,
    el: el,
    add: add,
    clear: clear,
    btn: btn,
    field: field,
    inp: inp,
    $: $
  };
})();
