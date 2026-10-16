/* Панель Refrain ИИ на сайте: вход по коду на почту владельца + PIN или по одноразовой ссылке из бота (#link=…, /panel → «В браузере»).
   Код и PIN из полей уходят только на сервер панели и сразу стираются из полей; ссылка сразу убирается из адреса;
   токен держит panel.js в памяти. Экраны — общие с мини-приложением tg/ (panel.js). */
(function () {
  'use strict';
  var RP = window.RefrainPanel;
  var $ = RP.$;

  // тема: как на сайте (если там выбрана вручную), иначе по системе
  try {
    var t = localStorage.getItem('mnema-theme');
    if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* хранилище недоступно — тема системы */ }

  // страницу нельзя вставить в чужой iframe (frame-ancestors в meta не работает)
  if (window.top !== window.self) {
    document.body.textContent = '';
    document.body.appendChild(RP.el('p', 'noscript', 'Эта страница не открывается внутри другой страницы.'));
    return;
  }

  var loginBox = $('#login'), appBox = $('#app');
  var form = $('#login-form'), fCode = $('#f-code'), fPin = $('#f-pin');
  var loginMsg = $('#login-msg'), codeMsg = $('#code-msg');
  var bCode = $('#b-code'), bLogin = $('#b-login');

  function showMsg(node, text) {
    node.textContent = text || '';
    node.hidden = !text;
  }

  $('#server-slot').appendChild(RP.serverField());

  function showLogin(text) {
    RP.clear(appBox);
    appBox.hidden = true;
    loginBox.hidden = false;
    showMsg(loginMsg, text || '');
    fCode.value = '';
    fPin.value = '';
  }

  function showApp() {
    loginBox.hidden = true;
    appBox.hidden = false;
    RP.mount(appBox, {
      via: 'web',
      views: ['overview', 'access', 'alerts', 'blocks', 'accounts', 'testers', 'groups', 'budget', 'guard', 'stats', 'journal', 'bugs', 'key'],
      onLogout: function () { showLogin(''); }
    });
  }

  RP.onExpire(function (why) {
    showLogin(why === 'time' ? 'Сессия закончилась (15 минут). Войди снова.' : 'Сервер закрыл сессию. Войди снова.');
  });

  bCode.addEventListener('click', function () {
    bCode.disabled = true;
    showMsg(codeMsg, '');
    showMsg(loginMsg, '');
    RP.loginEmailStart().then(function () {
      showMsg(codeMsg, 'Код отправлен на почту владельца. Он действует 10 минут.');
      fCode.focus();
    }, function (e) {
      showMsg(loginMsg, RP.errText(e, 'login'));
    }).then(function () { bCode.disabled = false; });
  });

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var code = fCode.value.trim(), pin = fPin.value.trim();
    fPin.value = '';
    if (!/^\d{6}$/.test(code)) { showMsg(loginMsg, 'Код из письма — 6 цифр.'); fCode.focus(); return; }
    if (!/^\d{6}$/.test(pin)) { showMsg(loginMsg, 'PIN — 6 цифр.'); fPin.focus(); return; }
    bLogin.disabled = true;
    showMsg(loginMsg, '');
    RP.loginEmailVerify(code, pin).then(function () {
      fCode.value = '';
      showMsg(codeMsg, '');
      showApp();
    }, function (e) {
      showMsg(loginMsg, RP.errText(e, 'login'));
    }).then(function () { bLogin.disabled = false; });
  });

  // Ссылка из бота: убрать из адреса (история, закладки) и войти. Не вышло — обычный вход с понятной причиной.
  var linkM = /(?:^#|&)link=([^&]{1,200})/.exec(window.location.hash || '');
  if (linkM) {
    try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch (e) { window.location.hash = ''; }
    showLogin('');
    showMsg(codeMsg, 'Вход по ссылке из Telegram…');
    bCode.disabled = true;
    RP.loginLink(decodeURIComponent(linkM[1])).then(function () {
      showMsg(codeMsg, '');
      showApp();
    }, function (e) {
      showMsg(codeMsg, '');
      showMsg(loginMsg, RP.errText(e, 'link'));
    }).then(function () { bCode.disabled = false; });
  } else showLogin('');
})();
