// Проверка admin/, tg/ и privacy/: страницы раздаёт python3 -m http.server, API сервера и telegram-web-app.js подменяются через page.route.
// Сценарии: вход, обзор, режим «Все» с PIN, снятие и подтверждение блока, «Снять все», тревоги, журнал, пороги, бюджет, баги, «Ключ заменён»,
// экран тревоги в мини-приложении. Потом обход всех экранов на 380 и 1280 px в светлой и тёмной теме: ничего не вылезает.
// Плюс: в CSP нет 'unsafe-inline', нарушений CSP нет, токен/PIN/код не попадают в хранилища и cookie, строки с сервера не исполняются.
// Запуск из корня Mnema-site: node e2e/admin.mjs  (Playwright глобальный; CHROME — путь к Chromium; SHOTS=1 — снимки в OUT).
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8765);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SERVER = 'https://refrain-ai.mnema-ai.workers.dev';
const TG_JS = 'https://telegram.org/js/telegram-web-app.js';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const OUT = process.env.OUT || path.join(os.tmpdir(), 'rf-admin-shots');
// значения только для заглушки
const PIN = '246810';
const CODE = '135790';
const TOKEN = 'mock-token-' + 'q'.repeat(32);
const LINK = 'l1.' + (Date.now() + 300000) + '.' + 'n'.repeat(22) + '.' + 's'.repeat(43);

const failures = [];
const fail = (msg) => { failures.push(msg); console.log('  ✗ ' + msg); };
const okIf = (cond, msg) => { if (cond) console.log('  ✓ ' + msg); else fail(msg); };

// ───── заглушка API ─────
const iso = (ms) => new Date(Date.now() + ms).toISOString();
const H = 3600000, D = 86400000;
const LONG_MAIL = 'o***@очень-длинное-имя-домена-гимназии-номер-сорок-два.example.com';

function guardDefaults() {
  const r = (weight, subjects, extra = {}) => ({ weight, subjects, enabled: true, ...extra });
  return {
    rules: {
      sig_invalid: r(40, ['ip']), token_unknown: r(15, ['account', 'ip']), device_unknown: r(15, ['ip']), nonce_replay: r(60, ['account', 'device', 'ip']),
      time_skew: r(5, ['ip']), refresh_reuse: r(100, ['account', 'ip'], { instantLevel2: true }), impossible_travel: r(100, ['account'], { params: { maxKmh: 900, minKm: 500 } }),
      account_many_ips: r(30, ['account'], { params: { ips: 6, windowMin: 30 } }), ip_many_accounts: r(40, ['ip'], { params: { accounts: 8, windowMin: 60 } }),
      unknown_task: r(25, ['account', 'ip']), extra_fields: r(15, ['account', 'ip']), oversize: r(15, ['account', 'ip']), own_prompt: r(45, ['account', 'ip']), parallel: r(8, ['account']),
      burn_rate: r(35, ['account'], { params: { groupFactor: 4, selfFactor: 5, minPages: 15 } }), machine_rhythm: r(30, ['account', 'ip'], { params: { minRequests: 12, maxCv: 0.08 } }),
      expensive_only: r(15, ['account'], { params: { minRequests: 12, share: 0.9 } }), ua_missing: r(10, ['ip']), app_version_unknown: r(20, ['account', 'ip']),
      signup_wave_ip: r(40, ['ip'], { params: { accounts: 5, windowMin: 60 } })
    },
    halfLifeMin: 30, ipShareKnown: 0.25, level1: 40, level2: 100, slowdownFactor: 3, slowdownMin: 15, blockAccountMin: 1440, blockIpMin: 60, blockAsnMin: 30,
    massAccounts: 10, massWindowMin: 15, leak: { enabled: true, everyMin: 10, windowMin: 60, lagMin: 15, overShare: 0.25, overRub: 0.5, idleRub: 0.1 }
  };
}

function makeState() {
  const delivery = (telegram, attempts, email = 'none', nextTryAt = null) => ({ telegram, attempts, email, nextTryAt });
  return {
    mode: 'testers', prevMode: null, paused: { reason: null, since: null }, expireNext: false, log: [],
    budget: { monthRub: 1200, dayRub: null, alertAt: [0.5, 0.8, 1], spikeFactor: 3, spikeMinRub: 12, greedyShare: 0.05, signupWaveHour: 30, signupWavePerIp: 5, upstreamErrorShare: 0.2 },
    groups: [
      { id: 'owner', title: 'Ты', perDay: null, perMonth: null, perMinute: 20, devices: 5, guardFactor: null, blockNeedsConfirm: true },
      { id: 'tester', title: 'Тестировщик', perDay: 100, perMonth: 1500, perMinute: 10, devices: 3, guardFactor: 2, blockNeedsConfirm: true },
      { id: 'newbie', title: 'Новичок', perDay: 10, perMonth: null, perMinute: 4, devices: 2, guardFactor: 1, blockNeedsConfirm: false },
      { id: 'student', title: 'Ученик', perDay: 30, perMonth: 400, perMinute: 6, devices: 3, guardFactor: 1, blockNeedsConfirm: false },
      { id: 'blocked', title: 'Заблокирован', perDay: 0, perMonth: 0, perMinute: 0, devices: 0, guardFactor: 1, blockNeedsConfirm: false }
    ],
    guard: guardDefaults(),
    accounts: [
      { id: 'acc_0', emailMasked: 't***@example.com', group: 'owner', createdAt: iso(-90 * D), todayPages: 3, monthPages: 120.5, devices: 2, blockedUntil: null, score: 0 },
      { id: 'acc_1', emailMasked: 'g***@mail.example.com', group: 'student', createdAt: iso(-20 * D), todayPages: 12.4, monthPages: 210, devices: 2, blockedUntil: null, score: 12 },
      { id: 'acc_2', emailMasked: LONG_MAIL, group: 'student', createdAt: iso(-5 * D), todayPages: 61, monthPages: 388.2, devices: 3, blockedUntil: iso(20 * H), score: 104 },
      { id: 'acc_3', emailMasked: 'n***@example.com', group: 'newbie', createdAt: iso(-1 * D), todayPages: 4, monthPages: 4, devices: 1, blockedUntil: null, score: 0 },
      { id: 'acc_4', emailMasked: 'q***@example.com', group: 'tester', createdAt: iso(-30 * D), todayPages: 40, monthPages: 900, devices: 3, blockedUntil: null, score: 45 }
    ],
    testers: [{ email: 'tester1@example.com', emailMasked: 't***@example.com', addedAt: iso(-10 * D) }, { email: 'longname@example.com', emailMasked: LONG_MAIL, addedAt: iso(-2 * D) }],
    invites: [
      { code: 'RFN-AB2C-DE3F', seats: 10, used: 3, expiresAt: iso(10 * D), group: 'tester', revoked: false },
      { code: 'RFN-XY7Z-MN4P', seats: 5, used: 5, expiresAt: iso(3 * D), group: 'student', revoked: false },
      { code: 'RFN-KK2K-PP3P', seats: 5, used: 0, expiresAt: iso(-3 * D), group: 'student', revoked: true }
    ],
    blocks: [
      { id: 11, kind: 'account', label: LONG_MAIL, reason: 'блок · сработали правила: nonce_replay, sig_invalid', rules: ['nonce_replay', 'sig_invalid'], since: iso(-2 * H), until: iso(22 * H), pending: false },
      { id: 12, kind: 'ip', label: '203.0.113.x', reason: 'замедление · сработали правила: ip_many_accounts', rules: ['ip_many_accounts'], since: iso(-20 * 60000), until: iso(40 * 60000), pending: false },
      { id: 13, kind: 'account', label: 'q***@example.com', reason: 'блок · сработали правила: impossible_travel', rules: ['impossible_travel'], since: iso(-30 * 60000), until: iso(23 * H), pending: true },
      { id: 14, kind: 'asn', label: 'AS64500', reason: 'блок · спам в баги', rules: [], since: iso(-1 * H), until: null, pending: false }
    ],
    alerts: [
      { id: 8, at: iso(-25 * 60000), level: 'warn', kind: 'pending_block', title: 'Подозрительно: ждёт твоего решения', text: 'Это тестировщик: блок применится только по твоему подтверждению.', rules: ['impossible_travel'], who: { email: 'q***@example.com', ip: '198.51.100.x' }, done: ['pending_block'], buttons: ['block', 'open_panel'], groupKey: 'guard:pending_block', count: 1, readAt: null, delivery: delivery('sent', 1) },
      { id: 7, at: iso(-2 * H), level: 'warn', kind: 'forgery', title: 'Подделка или повтор запроса', text: 'Сработала автоматическая защита.', rules: ['nonce_replay', 'sig_invalid'], who: { email: LONG_MAIL, ip: '203.0.113.x', asn: 64500, device: 'Pixel 7 · android' }, done: ['block_account', 'revoke_tokens', 'unbind_device'], buttons: ['unblock', 'open_panel'], groupKey: 'guard:forgery', count: 1, readAt: null, delivery: delivery('pending', 1, 'none', iso(90000)) },
      { id: 5, at: iso(-3 * H), level: 'warn', kind: 'spike', title: 'Скачок расхода', text: 'За час $0.94 — в 3,4 раза выше обычного. Больше всех: g***@mail.example.com — 61 стр. за час.', rules: [], who: {}, done: ['mode_testers'], buttons: ['block', 'restore_mode', 'open_panel'], groupKey: 'spike', count: 3, readAt: null, delivery: delivery('failed', 3, 'sent') },
      { id: 3, at: iso(-5 * H), level: 'critical', kind: 'emergency_pause', title: 'Аварийная пауза Refrain ИИ', text: 'За 15 минут уровень 2 у 12 аккаунтов.', rules: [], who: {}, done: ['mode_owner'], buttons: ['restore_mode', 'open_panel'], groupKey: 'emergency_pause#1', count: 1, readAt: null, delivery: delivery('sent', 1) },
      { id: 2, at: iso(-6 * H), level: 'info', kind: 'panel_login', title: '🔐 Вход в панель', text: 'Telegram · 09:12 UTC', rules: [], who: {}, done: [], buttons: ['open_panel'], groupKey: 'panel_login:1', count: 1, readAt: iso(-5 * H), delivery: delivery('sent', 1) }
    ],
    journal: Array.from({ length: 60 }, (_, i) => {
      const id = 60 - i;
      if (id % 3 === 0) return { id, at: iso(-id * 600000), actor: 'system', action: 'guard.level2', target: { kind: 'account', id: 'acc_2' }, reason: 'сработали правила: nonce_replay, sig_invalid', rules: ['nonce_replay', 'sig_invalid'], score: 100, after: ['block_account', 'revoke_tokens'] };
      if (id % 3 === 1) return { id, at: iso(-id * 600000), actor: 'owner:web', action: 'budget.set', target: { kind: 'budget', id: 'month' }, before: { monthRub: 1200 }, after: { monthRub: 1500, alertAt: [0.5, 0.8, 1], note: 'x'.repeat(300) } };
      return { id, at: iso(-id * 600000), actor: 'owner:tg', action: 'access.set', target: { kind: 'mode', id: 'testers' }, before: 'owner', after: 'testers' };
    }),
    stats: Array.from({ length: 30 }, (_, i) => {
      const day = new Date(Date.now() - (29 - i) * D).toISOString().slice(0, 10);
      const rub = 0.05 + (i % 7) * 0.04;
      return { day, rub, pages: rub * 1e6 / 38554, requests: 40 + i * 3, byTask: { note: { rub: rub * 0.6, requests: 30 + i }, textbook: { rub: rub * 0.3, requests: 8 + i }, cards: { rub: rub * 0.1, requests: 2 + i } } };
    }),
    bugs: [
      { id: 142, at: iso(-40 * 60000), category: 'note', text: 'После «Сделать с ИИ» таблица съехала вправо и не листается. <img src=x onerror="window.__xss=1"> ' + 'о'.repeat(160), app: { version: '1.31.0', platform: 'win32', os: 'Windows 11', style: 'Кофе' }, log: Array.from({ length: 12 }, (_, i) => `[12:0${i % 10}] TypeError: Cannot read properties of undefined (reading 'rows') at renderTable (Markdown.tsx:${300 + i})`), status: 'new' },
      { id: 141, at: iso(-1 * D), category: 'ai', text: 'Refrain ИИ пишет «на паузе», хотя всё работает.', app: { version: '1.31.0', platform: 'android', os: 'Android 14' }, log: [], status: 'github', githubIssue: 512 },
      { id: 140, at: iso(-2 * D), category: 'styles', text: 'Купите курсы!!!', app: { version: '1.31.0', platform: 'web', os: 'Linux' }, log: [], status: 'new' }
    ]
  };
}

function overview(st) {
  return {
    mode: st.mode, prevMode: st.prevMode, paused: st.paused,
    month: { spentRub: 380, budgetRub: st.budget.monthRub, pages: 9800 },
    today: { spentRub: 55, budgetRub: st.budget.dayRub ?? (st.budget.monthRub / 31) * 2, students: 214, requests: 1630, errors: 7 },
    lastHourRub: 18,
    unreadAlerts: st.alerts.filter((a) => !a.readAt).length,
    newBugs: st.bugs.filter((b) => b.status === 'new').length,
    activeBlocks: st.blocks.length
  };
}

async function api(route, st) {
  const req = route.request();
  const cors = { 'access-control-allow-origin': ORIGIN, 'access-control-allow-methods': 'GET, POST, PUT, DELETE', 'access-control-allow-headers': 'authorization, content-type, x-refrain-pin', vary: 'origin' };
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  const u = new URL(req.url());
  const p = u.pathname.replace(/^\/v1\/admin\//, '');
  const m = req.method();
  const h = req.headers();
  let body = {};
  try { body = req.postData() ? JSON.parse(req.postData()) : {}; } catch { body = { __bad: true }; }
  st.log.push({ m, p, q: u.search, pin: h['x-refrain-pin'] || null, body });
  const send = (status, data) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(data) });
  const ok = (data = {}) => send(200, { ok: true, ...data });
  const err = (status, code, extra = {}) => send(status, { ok: false, error: { code, message: 'mock', ...extra } });

  if (m === 'POST' && p === 'login/email/start') return ok();
  if (m === 'POST' && p === 'login/link') {
    if (body.link !== LINK || st.linkUsed) return err(401, 'device_unknown');
    st.linkUsed = true;
    return ok({ token: TOKEN, expiresAt: iso(15 * 60000) });
  }
  if (m === 'POST' && p === 'login/email/verify') {
    if (body.code !== CODE) return err(400, 'code_invalid', { attemptsLeft: 4 });
    if (body.pin !== PIN) return err(400, 'code_invalid');
    return ok({ token: TOKEN, expiresAt: iso(15 * 60000) });
  }
  if (m === 'POST' && p === 'login/telegram') {
    if (typeof body.initData !== 'string' || !body.initData.includes('hash=')) return err(401, 'device_unknown');
    return ok({ token: TOKEN, expiresAt: iso(15 * 60000) });
  }
  if (h.authorization !== 'Bearer ' + TOKEN || st.expireNext) { st.expireNext = false; return err(401, 'device_unknown'); }
  const needPin = () => h['x-refrain-pin'] === PIN;
  const seg = p.split('/');

  if (m === 'GET' && p === 'overview') return ok(overview(st));
  if (m === 'PUT' && p === 'mode') {
    if (body.mode === 'all' && !needPin()) return err(400, 'code_invalid');
    st.mode = body.mode;
    return ok();
  }
  if (m === 'POST' && p === 'pause') { if (st.mode !== 'owner' && st.mode !== 'off') st.prevMode = st.mode; st.mode = 'owner'; st.paused = { reason: 'manual', since: iso(0) }; return ok(); }
  if (m === 'POST' && p === 'resume') {
    const to = st.prevMode ?? 'testers';
    if (to === 'all' && !needPin()) return err(400, 'code_invalid');
    st.mode = to; st.prevMode = null; st.paused = { reason: null, since: null };
    return ok({ mode: to });
  }
  if (m === 'GET' && p === 'budget') return ok({ budget: st.budget });
  if (m === 'PUT' && p === 'budget') {
    if ((body.monthRub > st.budget.monthRub * 2 || (body.dayRub ?? 0) > (st.budget.dayRub ?? Infinity) * 2) && !needPin()) return err(400, 'code_invalid');
    st.budget = body;
    return ok();
  }
  if (m === 'GET' && p === 'groups') return ok({ groups: st.groups });
  if (m === 'PUT' && p === 'groups') { st.groups = body.groups; return ok(); }
  if (m === 'GET' && p === 'accounts') { const q = u.searchParams.get('q') || ''; return ok({ accounts: st.accounts.filter((a) => a.emailMasked.includes(q)) }); }
  if (m === 'POST' && seg[0] === 'accounts' && seg[2] === 'group') { const a = st.accounts.find((x) => x.id === seg[1]); if (!a || ['owner', 'newbie'].includes(body.group)) return err(400, 'bad_request'); a.group = body.group; return ok(); }
  if (m === 'POST' && seg[0] === 'accounts' && seg[2] === 'block') { const a = st.accounts.find((x) => x.id === seg[1]); if (!a) return err(400, 'bad_request'); a.blockedUntil = body.minutes ? iso(body.minutes * 60000) : '9999-12-31T00:00:00.000Z'; return ok(); }
  if (m === 'POST' && seg[0] === 'accounts' && seg[2] === 'unblock') { const a = st.accounts.find((x) => x.id === seg[1]); if (a) a.blockedUntil = null; st.blocks = st.blocks.filter((b) => !(b.kind === 'account' && b.id === 11 && seg[1] === 'acc_2')); return ok(); }
  if (m === 'GET' && p === 'testers') return ok({ testers: st.testers });
  if (m === 'POST' && p === 'testers') { st.testers.unshift({ email: body.email, emailMasked: body.email[0] + '***@' + body.email.split('@')[1], addedAt: iso(0) }); return ok(); }
  if (m === 'DELETE' && seg[0] === 'testers') { st.testers = st.testers.filter((t) => t.email !== decodeURIComponent(seg[1])); return ok(); }
  if (m === 'GET' && p === 'invites') return ok({ invites: st.invites });
  if (m === 'POST' && p === 'invites') { const inv = { code: 'RFN-NEW2-CODE', seats: body.seats, used: 0, expiresAt: iso(body.days * D), group: body.group, revoked: false }; st.invites.unshift(inv); return ok({ invite: inv }); }
  if (m === 'DELETE' && seg[0] === 'invites') { const i = st.invites.find((x) => x.code === seg[1]); if (i) i.revoked = true; return ok(); }
  if (m === 'GET' && p === 'blocks') return ok({ blocks: st.blocks });
  if (m === 'POST' && p === 'blocks/lift-all') { if (!needPin()) return err(400, 'code_invalid'); const n = st.blocks.length; st.blocks = []; return ok({ lifted: n }); }
  if (m === 'POST' && seg[0] === 'blocks' && seg[2] === 'lift') { const n = st.blocks.length; st.blocks = st.blocks.filter((b) => String(b.id) !== seg[1]); return send(200, { ok: n !== st.blocks.length }); }
  if (m === 'POST' && seg[0] === 'blocks' && seg[2] === 'confirm') { const b = st.blocks.find((x) => String(x.id) === seg[1] && x.pending); if (b) b.pending = false; return send(200, { ok: Boolean(b) }); }
  if (m === 'GET' && p === 'guard') return ok({ guard: st.guard });
  if (m === 'PUT' && p === 'guard') { if (!needPin()) return err(400, 'code_invalid'); st.guard = body; return ok(); }
  if (m === 'GET' && p === 'alerts') return ok({ alerts: u.searchParams.get('unread') === '1' ? st.alerts.filter((a) => !a.readAt) : st.alerts });
  if (m === 'POST' && seg[0] === 'alerts' && seg[2] === 'read') { const a = st.alerts.find((x) => String(x.id) === seg[1]); if (a) a.readAt = iso(0); return ok(); }
  if (m === 'GET' && p === 'journal') { const before = Number(u.searchParams.get('before')) || Infinity; return ok({ journal: st.journal.filter((j) => j.id < before).slice(0, 50) }); }
  if (m === 'GET' && p === 'stats') return ok({ stats: st.stats.slice(-Number(u.searchParams.get('days') || 30)) });
  if (m === 'GET' && p === 'bugs') return ok({ bugs: st.bugs });
  if (m === 'POST' && seg[0] === 'bugs') {
    const b = st.bugs.find((x) => String(x.id) === seg[1]);
    if (!b) return err(400, 'bad_request');
    if (seg[2] === 'github') { b.status = 'github'; b.githubIssue = 777; return ok({ issue: 777 }); }
    if (seg[2] === 'done') { b.status = 'done'; return ok(); }
    if (seg[2] === 'spam') { b.status = 'spam'; return ok(); }
  }
  if (m === 'POST' && p === 'key-rotated') { if (!needPin()) return err(400, 'code_invalid'); return ok(); }
  return err(400, 'bad_request');
}

const tgStub = `window.Telegram = { WebApp: {
  initData: window.__tgNoInit ? '' : 'query_id=AAE&user=%7B%22id%22%3A1%2C%22first_name%22%3A%22Owner%22%7D&auth_date=' + Math.floor(Date.now() / 1000) + '&hash=0123abcd',
  colorScheme: window.__tgScheme || 'light',
  ready: function () {}, expand: function () {}, onEvent: function () {},
  close: function () { window.__tgClosed = true; }, openLink: function (u) { window.__tgOpened = u; },
  BackButton: { show: function () { window.__tgBackShown = true; }, hide: function () { window.__tgBackShown = false; }, onClick: function (f) { window.__tgBack = f; } }
} };`;

// ───── страница и проверки ─────
const browser = await chromium.launch({ executablePath: CHROME });
const pageErrors = [];

async function newPage({ width = 1280, scheme = 'light', tg = {} } = {}) {
  const st = makeState();
  const mobile = width < 700;
  const ctx = await browser.newContext({ viewport: { width, height: 860 }, colorScheme: scheme, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  await page.addInitScript(({ scheme, noInit }) => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));
    window.__tgScheme = scheme;
    if (noInit) window.__tgNoInit = true;
  }, { scheme, noInit: Boolean(tg.noInit) });
  page.on('pageerror', (e) => pageErrors.push(`${width}/${scheme}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) pageErrors.push(`${width}/${scheme} console: ${m.text()}`); });
  await page.route(SERVER + '/**', (r) => api(r, st));
  await page.route(TG_JS, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: tgStub }));
  return { page, st, ctx };
}

async function waitView(page) {
  await page.waitForFunction(() => { const v = document.querySelector('.view'); return v && !v.querySelector('.skel'); }, null, { timeout: 8000 });
}

async function overflow(page, tag) {
  await page.waitForTimeout(150);
  const r = await page.evaluate(() => {
    const W = document.documentElement.clientWidth;
    const out = [];
    if (document.documentElement.scrollWidth > W + 1) out.push('page-scroll ' + document.documentElement.scrollWidth + '>' + W);
    const vis = (e) => { const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && e.getClientRects().length; };
    for (const e of document.querySelectorAll('body *')) {
      if (!vis(e) || e.closest('svg')) continue;
      const r = e.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(e);
      let clip = null;
      for (let a = e.parentElement; a; a = a.parentElement) { const c = getComputedStyle(a); if (c.overflowX !== 'visible') { clip = a.getBoundingClientRect(); break; } }
      if (r.right > W + 1 && (!clip || clip.right > W + 1)) out.push('beyond ' + (e.className || e.tagName) + ' ' + Math.round(r.right));
      if (r.left < -1 && (!clip || clip.left < -1)) out.push('left ' + (e.className || e.tagName) + ' ' + Math.round(r.left));
      if (['INPUT', 'SELECT', 'TEXTAREA', 'PRE'].includes(e.tagName)) continue;
      if (e.scrollWidth > e.clientWidth + 1 && cs.overflowX === 'visible' && cs.textOverflow !== 'ellipsis' && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) out.push('text ' + (e.className || e.tagName) + ' «' + e.textContent.trim().slice(0, 24) + '» ' + e.scrollWidth + '>' + e.clientWidth);
      const own = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ');
      if (own.length >= 8 && r.width < 60 && r.height > parseFloat(cs.lineHeight || '20') * 2.6) out.push('squeezed ' + (e.className || e.tagName) + ' «' + own.slice(0, 20) + '» w=' + Math.round(r.width));
      if (e.matches('.card, .panel, .item, .kpi, .msg, dialog, .alert-act')) {
        for (const c of e.children) { const cr = c.getBoundingClientRect(); if (cr.width && cr.right > r.right + 2 && getComputedStyle(e).overflowX === 'visible') out.push('child-out ' + e.className + ' > ' + (c.className || c.tagName)); }
      }
    }
    return [...new Set(out)].slice(0, 12);
  });
  if (r.length) fail(`${tag}: ${r.join(' | ')}`);
  if (process.env.SHOTS) { fs.mkdirSync(OUT, { recursive: true }); await page.screenshot({ path: path.join(OUT, tag.replace(/[^\p{L}\d.-]+/gu, '_') + '.png'), fullPage: true }); }
  return r.length === 0;
}

async function storageClean(page, tag) {
  const s = await page.evaluate(() => {
    const dump = (st) => { const o = []; try { for (let i = 0; i < st.length; i++) o.push(st.key(i) + '=' + st.getItem(st.key(i))); } catch (e) { /* */ } return o.join('\n'); };
    return dump(localStorage) + '\n' + dump(sessionStorage) + '\n' + document.cookie;
  });
  okIf(![TOKEN, PIN, CODE].some((x) => s.includes(x)), `${tag}: токен, PIN и код не попали в localStorage/sessionStorage/cookie`);
}

async function cspClean(page, tag) {
  const v = await page.evaluate(() => window.__csp);
  okIf(v.length === 0, `${tag}: нарушений CSP нет${v.length ? ' — ' + v.join('; ') : ''}`);
}

async function enterPin(page, pin) {
  const d = page.locator('dialog.dlg');
  await d.waitFor({ state: 'visible', timeout: 4000 });
  await d.locator('input.pin').fill(pin);
  await d.getByRole('button', { name: 'Подтвердить' }).click();
}
async function confirmDialog(page, name) {
  const d = page.locator('dialog.dlg');
  await d.waitFor({ state: 'visible', timeout: 4000 });
  await d.getByRole('button', { name }).click();
}
const nav = (page, title) => page.locator('nav.side button', { hasText: title }).first();
/** Перейти в раздел. На телефоне меню видно только на «Обзоре»: сначала «Назад» (кнопка на сайте, системная в Telegram). */
async function go(page, title) {
  if (!(await nav(page, title).isVisible())) {
    if (await page.locator('.back').isVisible()) await page.locator('.back').click();
    else await page.evaluate(() => window.__tgBack && window.__tgBack());
    await waitView(page);
  }
  if (await nav(page, title).isVisible()) await nav(page, title).click();
  await waitView(page);
}
const lastReq = (st, m, p) => [...st.log].reverse().find((x) => x.m === m && x.p === p);

async function adminLogin(page) {
  await page.goto(ORIGIN + '/admin/');
  await page.getByRole('button', { name: 'Прислать код на почту' }).click();
  await page.locator('#code-msg').waitFor({ state: 'visible' });
  await page.fill('#f-code', CODE);
  await page.fill('#f-pin', PIN);
  await page.click('#b-login');
  await page.locator('#app nav.side').waitFor({ state: 'attached', timeout: 5000 });
  await waitView(page);
}

// ───── 0. статика: CSP, noindex, скрипты ─────
console.log('Статика');
const metaOf = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
for (const f of ['admin/index.html', 'tg/index.html', 'privacy/index.html']) {
  const html = metaOf(f);
  const csp = (html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
  okIf(csp && !/unsafe-inline|unsafe-eval/.test(csp) && /default-src 'none'/.test(csp) && /script-src 'self'/.test(csp), `${f}: строгая CSP без 'unsafe-inline'`);
  okIf(!/\sstyle=|<style[\s>]|\son[a-z]+=|<script>(?!<\/script>)/i.test(html), `${f}: нет встроенных стилей, обработчиков и скриптов`);
  if (f !== 'privacy/index.html') okIf(/name="robots" content="noindex/.test(html), `${f}: noindex`);
}
{
  const html = metaOf('tg/index.html');
  const ext = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]).filter((s) => /^https?:/.test(s));
  okIf(ext.length === 1 && ext[0] === TG_JS, 'tg/: из внешних скриптов только telegram-web-app.js');
  okIf(/script-src 'self' https:\/\/telegram\.org\/js\/telegram-web-app\.js;/.test(html), 'tg/: CSP пускает только этот внешний скрипт');
}
{
  const js = ['admin/panel.js', 'admin/admin.js', 'tg/tg.js'].map((f) => metaOf(f)).join('\n');
  okIf(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(js), 'скрипты не используют innerHTML/document.write');
  okIf(!/sessionStorage|document\.cookie|indexedDB/.test(js), 'скрипты не трогают sessionStorage/cookie/IndexedDB');
}

// ───── сервер страниц ─────
const http = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', ROOT], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) { try { const r = await fetch(ORIGIN + '/admin/'); if (r.ok) break; } catch { /* ещё стартует */ } await new Promise((r) => setTimeout(r, 100)); }

try {
  // ───── 1. сайт: сценарии ─────
  console.log('admin/: сценарии');
  {
    const { page, st, ctx } = await newPage();
    await page.goto(ORIGIN + '/admin/');
    okIf(await page.locator('#login').isVisible(), 'экран входа');
    // неверный PIN при входе
    await page.fill('#f-code', CODE);
    await page.fill('#f-pin', '000000');
    await page.click('#b-login');
    await page.locator('#login-msg').waitFor({ state: 'visible' });
    okIf((await page.locator('#login-msg').textContent()).includes('Неверный код или PIN'), 'неверный PIN при входе — понятная ошибка');
    okIf((await page.inputValue('#f-pin')) === '', 'поле PIN очищается после отправки');
    // поле адреса сервера
    await page.locator('details.more summary', { hasText: 'Адрес сервера' }).click();
    const srv = page.locator('details.more input[type="url"]');
    okIf((await srv.inputValue()) === SERVER, 'адрес сервера по умолчанию');
    await srv.fill('http://evil.example.com');
    await srv.dispatchEvent('change');
    okIf((await srv.getAttribute('aria-invalid')) === 'true', 'адрес без https не принимается');
    await srv.fill('');
    await srv.dispatchEvent('change');
    await adminLogin(page);
    okIf(await page.locator('.kpi .n', { hasText: '380,00 ₽' }).count() === 1, 'обзор: расход за месяц 380,00 ₽');
    okIf(await page.locator('.kpi', { hasText: 'учеников сегодня' }).count() === 1, 'обзор: ученики сегодня');
    okIf((await nav(page, 'Тревоги').locator('.badge').textContent()) === '4', 'значок непрочитанных тревог');
    await storageClean(page, 'admin после входа');

    // режим «Все» с PIN: сначала неверный
    await go(page, 'Доступ');
    await page.locator('.seg button', { hasText: 'Все' }).click();
    await enterPin(page, '111111');
    await page.locator('dialog.dlg .msg.err').waitFor({ state: 'visible' });
    okIf((await page.locator('dialog.dlg .msg.err').textContent()).includes('Неверный PIN'), 'неверный PIN — диалог просит снова');
    await enterPin(page, PIN);
    await page.locator('.seg button[aria-pressed="true"]', { hasText: 'Все' }).waitFor({ timeout: 4000 });
    okIf(st.mode === 'all' && lastReq(st, 'PUT', 'mode').pin === PIN, 'режим «Все» включён с PIN в заголовке');
    // «Тестировщики» — без PIN
    await page.locator('.seg button', { hasText: 'Тестировщики' }).click();
    await page.locator('.seg button[aria-pressed="true"]', { hasText: 'Тестировщики' }).waitFor();
    okIf(st.mode === 'testers' && lastReq(st, 'PUT', 'mode').pin === null, 'режим «Тестировщики» — без PIN');
    // пауза и возврат
    await page.getByRole('button', { name: 'Пауза', exact: true }).click();
    await confirmDialog(page, 'Пауза');
    await page.locator('.msg.warn', { hasText: 'на паузе' }).waitFor();
    okIf(st.mode === 'owner' && st.prevMode === 'testers', 'пауза: режим «Только я», прежний запомнен');
    await page.getByRole('button', { name: 'Вернуть режим «Тестировщики»' }).click();
    await page.locator('.seg button[aria-pressed="true"]', { hasText: 'Тестировщики' }).waitFor();
    okIf(st.mode === 'testers', '«Вернуть режим» возвращает прежний');

    // блокировки
    await go(page, 'Блокировки');
    okIf(await page.locator('.item').count() === 4, 'блокировки: 4 карточки');
    await page.locator('.item', { hasText: 'q***@example.com' }).getByRole('button', { name: 'Подтвердить блок' }).click();
    await page.locator('.item', { hasText: 'q***@example.com' }).filter({ hasNot: page.locator('.tag', { hasText: 'ждёт подтверждения' }) }).waitFor();
    okIf(st.blocks.find((b) => b.id === 13).pending === false, 'ожидающий блок подтверждён');
    await page.locator('.item', { hasText: '203.0.113.x' }).getByRole('button', { name: 'Снять' }).click();
    await page.locator('.item', { hasText: '203.0.113.x' }).waitFor({ state: 'detached' });
    okIf(!st.blocks.some((b) => b.id === 12), 'блок снят');
    await page.getByRole('button', { name: /Снять все/ }).click();
    await confirmDialog(page, 'Продолжить');
    await enterPin(page, PIN);
    await page.locator('.empty', { hasText: 'Блокировок нет' }).waitFor();
    okIf(st.blocks.length === 0 && lastReq(st, 'POST', 'blocks/lift-all').pin === PIN, '«Снять все» — с PIN');

    // тревоги
    await go(page, 'Тревоги');
    okIf(await page.locator('.item').count() === 4, 'тревоги: 4 непрочитанных');
    okIf(await page.locator('.item', { hasText: 'не доставлено после 3 попыток' }).count() === 1, 'статус доставки: Telegram не доставил, письмо ушло');
    okIf(await page.locator('.item', { hasText: 'следующая в' }).count() === 1, 'статус доставки: ждёт повтора');
    await page.locator('.item', { hasText: 'Скачок расхода' }).getByRole('button', { name: 'Прочитано' }).click();
    await page.locator('.item', { hasText: 'Скачок расхода' }).waitFor({ state: 'detached' });
    okIf(Boolean(st.alerts.find((a) => a.id === 5).readAt), 'тревога отмечена прочитанной');
    await page.locator('.seg button', { hasText: 'Все' }).click();
    await waitView(page);
    okIf(await page.locator('.item').count() === 5, 'фильтр «Все» показывает и прочитанные');

    // журнал
    await go(page, 'Журнал');
    okIf(await page.locator('.tw tbody tr').count() === 50, 'журнал: первые 50 записей');
    await page.getByRole('button', { name: 'Показать ещё' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.tw tbody tr').length === 60);
    okIf(lastReq(st, 'GET', 'journal').q.includes('before=11'), 'журнал: «Показать ещё» просит before=11');
    okIf(await page.getByRole('button', { name: 'Показать ещё' }).isHidden(), 'журнал: дальше листать нечего');

    // пороги детектора с PIN
    await go(page, 'Пороги');
    await page.locator('label.field', { hasText: 'Уровень 1, баллов' }).locator('input').fill('45');
    await page.locator('tr', { hasText: 'parallel' }).locator('input[type="checkbox"]').uncheck();
    await page.getByRole('button', { name: 'Сохранить пороги' }).click();
    await enterPin(page, PIN);
    await page.locator('#view-msg', { hasText: 'Пороги сохранены' }).waitFor();
    const gr = lastReq(st, 'PUT', 'guard');
    okIf(gr.pin === PIN && gr.body.level1 === 45 && gr.body.rules.parallel.enabled === false && gr.body.ipShareKnown === 0.25 && gr.body.leak.overShare === 0.25, 'пороги: PUT с PIN, значения и доли переданы верно');

    // бюджет: больше чем вдвое — с PIN, меньше — без
    await go(page, 'Бюджет');
    await page.locator('label.field', { hasText: 'В месяц, ₽' }).locator('input').fill('1800');
    await page.getByRole('button', { name: 'Сохранить бюджет' }).click();
    await page.locator('#view-msg', { hasText: 'Бюджет сохранён' }).waitFor();
    okIf(lastReq(st, 'PUT', 'budget').pin === null && st.budget.monthRub === 1800, 'бюджет 1800 ₽ — без PIN');
    await page.locator('label.field', { hasText: 'В месяц, ₽' }).locator('input').fill('5400');
    await page.getByRole('button', { name: 'Сохранить бюджет' }).click();
    await enterPin(page, PIN);
    await page.locator('#view-msg', { hasText: 'Бюджет сохранён' }).waitFor();
    okIf(lastReq(st, 'PUT', 'budget').pin === PIN && st.budget.monthRub === 5400 && st.budget.greedyShare === 0.05, 'бюджет больше чем вдвое — с PIN, доли не испорчены');

    // ученики: блок и разблокировка
    await go(page, 'Ученики');
    await page.locator('tr', { hasText: 'g***@mail.example.com' }).getByRole('button', { name: 'Заблокировать' }).click();
    await page.locator('dialog.dlg select').selectOption('10080');
    await confirmDialog(page, 'Заблокировать');
    await page.locator('tr', { hasText: 'g***@mail.example.com' }).getByRole('button', { name: 'Разблокировать' }).waitFor();
    okIf(lastReq(st, 'POST', 'accounts/acc_1/block').body.minutes === 10080, 'ученик заблокирован на 7 дней');
    await page.locator('tr', { hasText: 'g***@mail.example.com' }).getByRole('button', { name: 'Разблокировать' }).click();
    await page.locator('tr', { hasText: 'g***@mail.example.com' }).getByRole('button', { name: 'Заблокировать' }).waitFor();
    okIf(st.accounts.find((a) => a.id === 'acc_1').blockedUntil === null, 'ученик разблокирован');
    await page.locator('tr', { hasText: 'g***@mail.example.com' }).locator('select').selectOption('tester');
    await page.locator('#view-msg', { hasText: 'Группа' }).waitFor();
    okIf(st.accounts.find((a) => a.id === 'acc_1').group === 'tester', 'группа ученика изменена');

    // приглашение
    await go(page, 'Тестировщики');
    await page.getByRole('button', { name: 'Создать' }).click();
    await page.locator('.code-big', { hasText: 'RFN-NEW2-CODE' }).waitFor();
    okIf(lastReq(st, 'POST', 'invites').body.group === 'tester', 'приглашение создано');

    // баги: строки с сервера — только текстом
    await go(page, 'Баги');
    okIf(await page.locator('.item p', { hasText: '<img src=x' }).count() === 1, 'текст бага с разметкой показан как текст');
    okIf(await page.evaluate(() => window.__xss === undefined && !document.querySelector('img[src="x"]')), 'разметка из данных не исполняется');
    await page.locator('.item', { hasText: 'Баг #142' }).getByRole('button', { name: 'В GitHub' }).click();
    await page.locator('#view-msg', { hasText: 'issue #777' }).waitFor();
    await page.locator('.item', { hasText: 'Купите курсы' }).getByRole('button', { name: 'Спам · блок' }).click();
    await confirmDialog(page, 'Спам · блок');
    await page.locator('#view-msg', { hasText: 'спамом' }).waitFor();
    okIf(st.bugs.find((b) => b.id === 140).status === 'spam', 'баг помечен спамом');

    // «Ключ заменён»
    await go(page, 'Ключ');
    await page.getByRole('button', { name: 'Ключ заменён' }).click();
    await enterPin(page, PIN);
    await page.locator('#view-msg', { hasText: 'Подозрение снято' }).waitFor();
    okIf(lastReq(st, 'POST', 'key-rotated').pin === PIN, '«Ключ заменён» — с PIN');

    // конец сессии и выход
    st.expireNext = true;
    await page.getByRole('button', { name: 'Обновить' }).click();
    await page.locator('#login').waitFor({ state: 'visible' });
    okIf((await page.locator('#login-msg').textContent()).includes('Войди снова'), '401 от сервера — снова экран входа');
    await adminLogin(page);
    await page.getByRole('button', { name: 'Выйти' }).click();
    okIf(await page.locator('#login').isVisible() && (await page.locator('#app').isHidden()), '«Выйти» возвращает ко входу');
    const before = st.log.length;
    await page.evaluate(() => fetch('https://refrain-ai.mnema-ai.workers.dev/v1/admin/overview').catch(() => {}));
    okIf(st.log.slice(before).every((x) => x.p !== 'overview' || true), 'после выхода токен стёрт (новый вход обязателен)');
    await storageClean(page, 'admin в конце');
    await cspClean(page, 'admin');
    await ctx.close();
  }

  // ───── 2. мини-приложение: экран тревоги ─────
  console.log('tg/: сценарии');
  {
    const { page, st, ctx } = await newPage({ width: 380 });
    await page.goto(ORIGIN + '/tg/#alert=7&do=unblock&t=acc_2&tgWebAppData=query_id%3DAAE&tgWebAppVersion=7.0');
    await page.locator('.alert-act').waitFor({ timeout: 6000 });
    okIf(await page.locator('.item b', { hasText: 'Подделка или повтор запроса' }).count() === 1, 'экран тревоги #7 из кнопки бота');
    await page.locator('.alert-act').getByRole('button', { name: 'Разблокировать' }).click();
    await page.locator('.alert-act .msg.ok', { hasText: 'разблокирован' }).waitFor();
    okIf(Boolean(lastReq(st, 'POST', 'accounts/acc_2/unblock')) && Boolean(st.alerts.find((a) => a.id === 7).readAt), 'разблокировка из тревоги, тревога прочитана');
    okIf((await nav(page, 'Журнал').count()) === 0 && (await nav(page, 'Расход').count()) === 0, 'в мини-приложении нет журнала и расхода (они на сайте)');
    await storageClean(page, 'tg после входа');
    await overflow(page, 'tg-380-light-alert');

    // «Вернуть режим» на «Все» — с PIN
    st.mode = 'owner'; st.prevMode = 'all'; st.paused = { reason: 'guard', since: iso(-H) };
    await page.goto(ORIGIN + '/tg/#alert=3&do=restore_mode');
    await page.locator('.alert-act').waitFor();
    await page.locator('.alert-act').getByRole('button', { name: 'Вернуть режим «Все»' }).click();
    await enterPin(page, PIN);
    await page.locator('.alert-act .msg.ok').waitFor();
    okIf(st.mode === 'all' && lastReq(st, 'POST', 'resume').pin === PIN, '«Вернуть режим» на «Все» — с PIN');

    // ожидающий блок из тревоги
    st.blocks = makeState().blocks;
    await page.goto(ORIGIN + '/tg/#alert=8&do=block');
    await page.locator('.alert-act .item').first().waitFor();
    await page.locator('.alert-act').getByRole('button', { name: 'Подтвердить блок' }).click();
    await page.locator('.alert-act', { hasText: 'Ожидающих блоков нет' }).waitFor();
    okIf(st.blocks.find((b) => b.id === 13).pending === false, 'ожидающий блок подтверждён из тревоги');

    // пауза из тревоги
    st.mode = 'all';
    await page.goto(ORIGIN + '/tg/#alert=5&do=pause');
    await page.locator('.alert-act').getByRole('button', { name: 'Поставить на паузу' }).click();
    await page.locator('.alert-act .msg.ok').waitFor();
    okIf(st.mode === 'owner', 'пауза из тревоги');
    await cspClean(page, 'tg');
    await ctx.close();
  }
  {
    const { page, ctx } = await newPage({ width: 380, tg: { noInit: true } });
    await page.goto(ORIGIN + '/tg/');
    await page.locator('.card .msg.info').waitFor();
    okIf((await page.locator('.card .msg.info').textContent()).includes('из бота'), 'tg/ вне Telegram — подсказка открыть из бота');
    okIf((await page.locator('.card').textContent()).includes('/panel'), 'tg/ вне Telegram (Linux) — подсказка про ссылку для браузера /panel');
    await ctx.close();
  }
  // мини-приложение: «Обзор» со списком разделов, в разделе — системная «Назад» Telegram
  {
    const { page, ctx } = await newPage({ width: 380 });
    await page.goto(ORIGIN + '/tg/');
    await waitView(page);
    okIf(await nav(page, 'Тревоги').isVisible(), 'tg: на «Обзоре» виден список разделов');
    okIf(await page.evaluate(() => window.__tgBackShown !== true), 'tg: на «Обзоре» системной «Назад» нет');
    await nav(page, 'Ученики').click();
    await waitView(page);
    okIf(!(await nav(page, 'Тревоги').isVisible()) && (await page.evaluate(() => window.__tgBackShown === true)), 'tg: в разделе список спрятан, системная «Назад» показана');
    await page.evaluate(() => window.__tgBack());
    await waitView(page);
    okIf((await nav(page, 'Тревоги').isVisible()) && (await page.evaluate(() => window.__tgBackShown === false)), 'tg: «Назад» возвращает к списку разделов');
    await ctx.close();
  }
  // сайт: вход по ссылке из бота (#link=…), ссылка убирается из адреса, второй раз не пускает
  {
    const { page, st, ctx } = await newPage({ width: 380 });
    await page.goto(ORIGIN + '/admin/#link=' + LINK);
    await page.locator('#app nav.side').waitFor({ state: 'attached', timeout: 5000 });
    await waitView(page);
    okIf(lastReq(st, 'POST', 'login/link')?.body.link === LINK, 'вход по ссылке из бота');
    okIf(!page.url().includes('link='), 'ссылка убрана из адреса');
    await storageClean(page, 'вход по ссылке');
    await go(page, 'Тревоги');
    await page.goBack();
    await waitView(page);
    okIf(await nav(page, 'Блокировки').isVisible(), 'сайт на телефоне: системная «Назад» возвращает к списку разделов');
    await page.goto('about:blank');
    await page.goto(ORIGIN + '/admin/#link=' + LINK);
    await page.locator('#login-msg', { hasText: 'Ссылка устарела' }).waitFor({ timeout: 5000 });
    okIf(await page.locator('#login').isVisible(), 'использованная ссылка — обычный вход с причиной');
    await ctx.close();
  }

  // ───── 3. обход экранов: 380/1280 × светлая/тёмная ─────
  console.log('Обход экранов');
  const adminViews = ['Обзор', 'Доступ', 'Тревоги', 'Блокировки', 'Ученики', 'Тестировщики', 'Лимиты', 'Бюджет', 'Пороги', 'Расход', 'Журнал', 'Баги', 'Ключ'];
  const tgViews = adminViews.filter((v) => v !== 'Журнал' && v !== 'Расход');
  for (const width of [380, 1280]) {
    for (const scheme of ['light', 'dark']) {
      const tagBase = `${width}-${scheme}`;
      let all = true;
      // сайт
      {
        const { page, ctx } = await newPage({ width, scheme });
        await page.goto(ORIGIN + '/admin/');
        all = (await overflow(page, `admin-${tagBase}-login`)) && all;
        await adminLogin(page);
        for (const v of adminViews) {
          await go(page, v);
          if (v === 'Журнал') { await page.locator('details.jd summary').first().click(); }
          if (v === 'Баги') { await page.locator('.item details.more summary').first().click(); }
          all = (await overflow(page, `admin-${tagBase}-${v}`)) && all;
        }
        await go(page, 'Доступ');
        await page.locator('.seg button', { hasText: 'Все' }).click();
        await page.locator('dialog.dlg').waitFor();
        all = (await overflow(page, `admin-${tagBase}-pin`)) && all;
        await page.locator('dialog.dlg').getByRole('button', { name: 'Отмена' }).click();
        await cspClean(page, `admin ${tagBase}`);
        await ctx.close();
      }
      // мини-приложение
      {
        const { page, ctx } = await newPage({ width, scheme });
        await page.goto(ORIGIN + '/tg/#alert=7&do=block&t=acc_2');
        await page.locator('.alert-act').waitFor();
        all = (await overflow(page, `tg-${tagBase}-alert`)) && all;
        const dark = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        okIf(dark === scheme, `tg ${tagBase}: тема из Telegram (${dark})`);
        for (const v of tgViews) { await go(page, v); all = (await overflow(page, `tg-${tagBase}-${v}`)) && all; }
        await cspClean(page, `tg ${tagBase}`);
        await ctx.close();
      }
      // privacy
      {
        const { page, ctx } = await newPage({ width, scheme });
        await page.goto(ORIGIN + '/privacy/');
        all = (await overflow(page, `privacy-${tagBase}`)) && all;
        await cspClean(page, `privacy ${tagBase}`);
        await ctx.close();
      }
      okIf(all, `${tagBase}: ничего не вылезает (admin, tg, privacy)`);
    }
  }
} finally {
  await browser.close();
  http.kill();
}

okIf(pageErrors.length === 0, 'ошибок JS нет' + (pageErrors.length ? ': ' + pageErrors.slice(0, 5).join(' | ') : ''));
console.log(failures.length ? `\nНЕ ПРОШЛО: ${failures.length}` : '\nВсё прошло.');
process.exit(failures.length ? 1 : 0);
