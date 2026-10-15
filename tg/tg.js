/* Мини-приложение панели в Telegram. Вход — initData от Telegram (сервер проверяет подпись, свежесть до 5 минут и ID владельца).
   Сессия 15 минут, токен только в памяти panel.js. Кнопки тревог из бота открывают tg/#alert=<id>&do=<действие>&t=<цель>.
   Экраны общие с сайтом, без журнала и таблиц расхода (они только на сайте). */
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

  function start() {
    if (!TG || !TG.initData) {
      card('Refrain · панель', 'Эта страница открывается только из бота Refrain в Telegram: кнопка «Открыть панель» или кнопка под тревогой.', 'info');
      return;
    }
    card('Refrain · панель', 'Вход через Telegram…');
    RP.loginTelegram(TG.initData).then(function () {
      RP.clear(root);
      RP.mount(root, {
        via: 'tg',
        views: ['overview', 'access', 'alerts', 'blocks', 'accounts', 'testers', 'groups', 'budget', 'guard', 'bugs', 'key'],
        alert: alertParams,
        openLink: openLink
      });
    }, function (e) {
      var again = RP.btn('Повторить', 'btn-primary', start);
      var cl = RP.btn('Закрыть', 'btn-ghost', close);
      var hint = e && e.code === 'device_unknown' ? RP.el('p', 'small muted', 'Подтверждение от Telegram действует 5 минут. Если панель открыта давно — закрой её и открой снова из бота.') : null;
      card('Не получилось войти', RP.errText(e, 'tg'), 'err', [hint, RP.add(RP.el('div', 'row'), again, cl), RP.serverField()]);
    });
  }

  RP.onExpire(function (why) {
    var cl = RP.btn('Закрыть', 'btn-primary', close);
    card('Сессия закончилась', why === 'time' ? 'Вход живёт 15 минут. Закрой мини-приложение и открой его снова из бота.' : 'Сервер закрыл сессию. Открой мини-приложение снова из бота.', 'info', [RP.add(RP.el('div', 'row'), cl)]);
  });

  start();
})();
