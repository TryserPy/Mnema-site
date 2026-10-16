/* Мини-приложение панели в Telegram. Вход — initData от Telegram (сервер проверяет подпись, свежесть до 5 минут и ID владельца).
   Сессия 15 минут, токен только в памяти panel.js. Кнопки тревог из бота открывают tg/#alert=<id>&do=<действие>&t=<цель>.
   Экраны общие с сайтом, без журнала и таблиц расхода (они только на сайте). Навигация: «Обзор» со списком разделов,
   в разделе — системная кнопка «Назад» Telegram. Где мини-приложение не открывается — бот даёт ссылку для браузера (/panel). */
(function () {
  'use strict';
  var RP = window.RefrainPanel;
  var TG = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  var root = RP.$('#root');
  // hash читаем сразу: Telegram дописывает туда свои tgWebApp*, parseAlertHash их пропускает
  var alertParams = RP.parseAlertHash(window.location.hash);

  function theme() {
    var s = TG && TG.colorScheme;
    if (s === 'dark' || s === 'light') document.documentElement.setAttribute('data-theme', s);
    // Шапка и фон Telegram — цвета панели, чтобы окно выглядело цельным (клиенты 6.1+; старые просто пропустят).
    try {
      var bg = getComputedStyle(document.body).backgroundColor;
      var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(bg);
      if (m) {
        var hex = '#' + [m[1], m[2], m[3]].map(function (x) { return ('0' + Number(x).toString(16)).slice(-2); }).join('');
        if (TG && TG.setHeaderColor) TG.setHeaderColor(hex);
        if (TG && TG.setBackgroundColor) TG.setBackgroundColor(hex);
      }
    } catch (e) { /* старый клиент */ }
  }
  theme();
  if (TG) {
    try { TG.onEvent('themeChanged', theme); } catch (e) { /* старый клиент */ }
    try { TG.ready(); TG.expand(); } catch (e) { /* старый клиент */ }
  }

  function openLink(u) {
    if (TG && typeof TG.openLink === 'function') TG.openLink(u);
    else window.open(u, '_blank', 'noopener,noreferrer');
  }
  function close() { if (TG && typeof TG.close === 'function') TG.close(); }

  function card(title, text, kind, extra) {
    RP.clear(root);
    var c = RP.el('section', 'card');
    RP.add(c, RP.el('h1', 'serif', title));
    var m = RP.el('p', kind ? 'msg ' + kind : 'muted', text);
    m.setAttribute('role', kind === 'err' ? 'alert' : 'status');
    RP.add(c, m);
    (extra || []).forEach(function (x) { RP.add(c, x); });
    root.appendChild(c);
  }

  // Системная кнопка «Назад» Telegram: в разделе — к списку разделов, на «Обзоре» её нет.
  var panelApi = null;
  var BB = TG && TG.BackButton && typeof TG.BackButton.show === 'function' ? TG.BackButton : null;
  if (BB) try { BB.onClick(function () { if (panelApi) panelApi.home(); }); } catch (e) { BB = null; }
  function backButton(visible) {
    if (!BB) return;
    try { if (visible) BB.show(); else BB.hide(); } catch (e) { /* старый клиент */ }
  }

  var signedIn = false;
  function show() {
    RP.clear(root);
    panelApi = RP.mount(root, {
      via: 'tg',
      views: ['overview', 'access', 'alerts', 'blocks', 'accounts', 'testers', 'groups', 'budget', 'guard', 'bugs', 'key'],
      alert: alertParams,
      openLink: openLink,
      onNavigate: function (_v, home) { backButton(!home); }
    });
  }
  // Другая кнопка тревоги, пока панель открыта: Telegram меняет только #… — показываем новую тревогу без нового входа.
  window.addEventListener('hashchange', function () {
    var next = RP.parseAlertHash(window.location.hash);
    if (!next) return;
    alertParams = next;
    if (signedIn) show();
  });

  function start() {
    if (!TG || !TG.initData) {
      // Сюда попадают и из Telegram, который не умеет открывать мини-приложения внутри себя (часто — Telegram Desktop на Linux
      // без WebKitGTK): он открывает ссылку в обычном браузере, и подтверждения от Telegram нет.
      var how = RP.el('ol', 'steps small');
      ['Напиши боту /panel.', 'Нажми под ответом «🌐 В браузере» — откроется панель на сайте, вход уже выполнен.', 'Ссылка работает один раз и 5 минут. Никому её не пересылай.'].forEach(function (t) { how.appendChild(RP.el('li', null, t)); });
      card('Refrain · панель', 'Эта страница открывается из бота Refrain в Telegram: кнопка «Открыть панель» или кнопка под тревогой.', 'info', [
        RP.el('p', 'muted', 'Если Telegram открыл её в браузере (так бывает на Linux) или панель внутри Telegram не запускается:'),
        how
      ]);
      return;
    }
    card('Refrain · панель', 'Вход через Telegram…');
    RP.loginTelegram(TG.initData).then(function () {
      signedIn = true;
      show();
    }, function (e) {
      var again = RP.btn('Повторить', 'btn-primary', start);
      var cl = RP.btn('Закрыть', 'btn-ghost', close);
      var hint = e && e.code === 'device_unknown' ? RP.el('p', 'small muted', 'Подтверждение от Telegram действует 5 минут. Если панель открыта давно — закрой её и открой снова из бота.') : null;
      card('Не получилось войти', RP.errText(e, 'tg'), 'err', [hint, RP.add(RP.el('div', 'row'), again, cl), RP.serverField()]);
    });
  }

  RP.onExpire(function (why) {
    signedIn = false;
    backButton(false);
    var cl = RP.btn('Закрыть', 'btn-primary', close);
    card('Сессия закончилась', why === 'time' ? 'Вход живёт 15 минут. Закрой мини-приложение и открой его снова из бота.' : 'Сервер закрыл сессию. Открой мини-приложение снова из бота.', 'info', [RP.add(RP.el('div', 'row'), cl)]);
  });

  start();
})();
