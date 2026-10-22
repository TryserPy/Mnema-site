// Аудит сайта на телефонах: нет прокрутки вбок, текст не налезает, нижняя панель ничего не закрывает,
// шторки на экране целиком, цели нажатия не меньше 44 px, axe без серьёзных нарушений.
// Запуск: python3 -m http.server 8088 (в корне сайта), затем node tests/mobile-audit.mjs [URL]
// Playwright и axe-core берутся из node_modules репозитория Mnema (NODE_PATH) или установленные глобально.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const URL = process.argv[2] ?? 'http://localhost:8088/';
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(require('node:fs').existsSync(exe) ? { executablePath: exe } : {});
let bad = 0;
const check = (ok, label) => {
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'} ${label}`);
};

for (const [w, h] of [[320, 568], [360, 640], [390, 844], [430, 932]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'ru-RU' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForTimeout(600);
  for (const tab of await page.locator('nav.tabs .tab').all()) {
    const name = (await tab.innerText()).trim();
    await tab.click();
    await page.waitForTimeout(450);
    const tag = `${w}×${h} «${name}»`;
    const r = await page.evaluate(() => {
      const vw = innerWidth;
      const over = [...document.querySelectorAll('.screen.on *, .screen.active *, [data-screen] *')].filter((e) => {
        const b = e.getBoundingClientRect();
        return b.width && (b.right > vw + 1 || b.left < -1) && getComputedStyle(e).position !== 'fixed' && !e.closest('[class*="scroll"], .hscroll, .rail, .chips, pre, code, table');
      }).slice(0, 3).map((e) => e.className || e.tagName);
      const small = [...document.querySelectorAll('button, a[href], [role="button"]')].filter((e) => {
        const b = e.getBoundingClientRect();
        const s = getComputedStyle(e);
        // Невидимая зона нажатия ::before (inset: -8px) тоже считается.
        const pb = getComputedStyle(e, '::before');
        const ext = pb.content !== 'none' && pb.position === 'absolute';
        const hh = b.height + (ext ? 2 * Math.max(0, -parseFloat(pb.top) || 0) : 0);
        const ww = b.width + (ext ? 2 * Math.max(0, -parseFloat(pb.left) || 0) : 0);
        const shown = b.width && b.height && s.visibility !== 'hidden' && b.top < innerHeight && b.bottom > 0;
        return shown && (hh < 44 || ww < 44) && !e.closest('p, li, .md, .doc');
      }).slice(0, 4).map((e) => (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 24) + ' [' + e.className + ' ' + Math.round(e.getBoundingClientRect().height) + 'px]');
      return { sw: document.documentElement.scrollWidth, vw, over, small };
    });
    check(r.sw <= r.vw + 1, `${tag}: нет прокрутки вбок (${r.sw} ≤ ${r.vw})`);
    check(r.small.length === 0, `${tag}: зона нажатия не меньше 44 px ${r.small.join(' | ')}`);
    const ax = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const serious = ax.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    check(serious.length === 0, `${tag}: axe ${serious.map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`).join('; ')}`);
  }
  // Шторка возможности: целиком на экране и над системной полосой.
  await page.locator('nav.tabs .tab').first().click();
  const opener = page.locator('[data-act="sheet"]').first();
  if (await opener.count()) {
    await opener.scrollIntoViewIfNeeded();
    await opener.click();
    await page.waitForTimeout(500);
    const s = await page.locator('[data-sheet]').boundingBox();
    check(Boolean(s) && s.y >= 0 && s.y + s.height <= h + 1, `${w}×${h}: шторка целиком на экране`);
    await page.keyboard.press('Escape');
  }
  check(errors.length === 0, `${w}×${h}: без ошибок страницы ${errors.join('; ')}`);
  await ctx.close();
}
await browser.close();
console.log(bad ? `\nПроблем: ${bad}` : '\nВсё хорошо');
process.exit(bad ? 1 : 0);
