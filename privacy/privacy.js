// Тема как на сайте: если там выбрана вручную — она, иначе по системе. Больше страница ничего не делает и ничего не хранит.
(function () {
  try {
    var t = localStorage.getItem('mnema-theme');
    if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* хранилище недоступно — остаётся тема системы */ }
})();
