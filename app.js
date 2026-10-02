/* ============================================================
   RuYT — приложение (чистый JS, без сборки)
   • Поиск — РЕАЛЬНЫЙ: s.php (YouTube) → stream.php (воспроизведение)
   • Всё остальное (главная, токи, сторис, студия…) — заглушки из data.js
   ============================================================ */
(() => {
'use strict';

const D = window.RuYTData;
const { CH, V, AD, S: SH, STF, STA, P, C, TC, CM, CONTENT } = D;   // SH — токи (shorts)

/* ---------- настройки сервера ---------- */
const CFG = {
  searchServer: 'https://dustore.ru/s.php',
  streamServer: 'https://dustore.ru/stream.php',
  searchTimeout: 30000
};

/* ---------- утилиты ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('ruyt.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('ruyt.' + k, JSON.stringify(v)); } catch { /* приватный режим */ } }
};
const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' млн' : n >= 1000 ? (n / 1000).toFixed(1).replace('.', ',').replace(',0', '') + ' тыс' : String(n);
const num = n => Math.round(n).toLocaleString('ru-RU');
const norm = s => (s || '').toLowerCase().replace(/ё/g, 'е');
const words = q => norm(q).split(/\s+/).filter(Boolean);
const matchAll = (text, q) => { const w = words(q); return w.length > 0 && w.every(x => norm(text).includes(x)); };
function hl(text, q, tag = 'mark') {
  const w = words(q)[0]; if (!w) return esc(text);
  const i = norm(text).indexOf(w); if (i < 0) return esc(text);
  return esc(text.slice(0, i)) + `<${tag}>` + esc(text.slice(i, i + w.length)) + `</${tag}>` + esc(text.slice(i + w.length));
}
const ic = (n, c = '', st = '') => `<span class="ms ${c}"${st ? ` style="${st}"` : ''}>${n}</span>`;
const hue = s => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
const initial = s => (String(s).trim().match(/[\p{L}\p{N}]/u) || ['?'])[0].toUpperCase();
const avi = (name, size, cls = '') => `<span class="avi ${cls}" style="--h:${hue(name)};width:${size}px;height:${size}px;font-size:${Math.round(size * .42)}px">${esc(initial(name))}</span>`;
const av = (src, size, cls = '') => `<img class="av ${cls}" src="${esc(src)}" alt="" width="${size}" height="${size}" loading="lazy">`;
const isWide = () => matchMedia('(min-width:1100px)').matches;
const isPhone = () => matchMedia('(max-width:639px)').matches;
const cols = () => innerWidth >= 1700 ? 4 : isWide() ? 3 : innerWidth >= 640 ? 2 : 1;
const fmtDur = d => {
  if (d == null || d === '') return '';
  let s = d; if (typeof s === 'string' && /^\d+$/.test(s)) s = +s;
  if (typeof s === 'number') {
    const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = Math.floor(s % 60);
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`;
  }
  return String(s);
};
const fmtViews = v => v == null || v === '' ? '' : (typeof v === 'number' || /^\d+$/.test(String(v))) ? fmt(+v) + ' просмотров' : String(v);

/* ---------- состояние ---------- */
const S = {
  theme: store.get('theme', 'dark'),
  subs: store.get('subs', { open: 1, auto: 1, lena: 1, sever: 1, anya: 1, fun: 1 }),
  vlike: store.get('vlike', {}),
  recent: store.get('recent', []),
  vcache: store.get('vcache', []),            // [{id,title,channel,thumb,dur,views,ago}] — чтобы открыть видео по прямой ссылке
  chip: 0, sTab: 0, hover: null,
  plikes: {}, openC: {}, poll: {}, sliked: {}, slikes: {}, seen: {},
  mon: { pre: true, mid: true, post: false, overlay: true, toki: true, spon: true, don: true, memb: true },
  bells: {}, chan: 'open', chTab: 0, chSort: 0, descOpen: false,
  amount: 1,
  // студия
  stSec: 'overview', range: 1, metric: 3, cTab: 0, aTab: 0, vis: {}, monV: {}, sel: {}, deleted: {},
  cmFilter: 0, hearts: {}, pinned: null, removed: {}, approved: {}, replied: {}, replyOpen: null, payoutReq: false, midFreq: 1
};
const T = { i: 0, muted: true, liked: {}, panel: false };      // токи
const SR = { cache: new Map(), ctrl: null, last: null };       // поиск: кэш, abort, последняя выдача
let cur = null;                                                 // активная страница {unmount}
let pendingPush = false, curKey = null;
const scrollMem = {};

/* ---------- видео: единая модель (демо + реальные из YouTube) ---------- */
const ytThumb = id => `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
function normVideo(r) {
  const id = r.id || r.videoId || r.video_id || '';
  return {
    id: String(id), real: true,
    title: r.title || 'Без названия',
    channel: r.channel || r.author || r.uploader || '',
    thumb: r.thumbnail || r.thumb || (id ? ytThumb(id) : ''),
    dur: fmtDur(r.duration ?? r.length ?? r.duration_string),
    views: fmtViews(r.views ?? r.view_count),
    ago: r.published || r.ago || r.upload_date || '',
    desc: r.description || ''
  };
}
function rememberVideos(list) {
  const map = new Map(S.vcache.map(v => [v.id, v]));
  list.forEach(v => { map.delete(v.id); map.set(v.id, v); });
  S.vcache = Array.from(map.values()).slice(-120);
  store.set('vcache', S.vcache);
}
function getVideo(id) {
  const m = V.find(v => v.id === id);
  if (m) return { ...m, mock: true, chName: CH[m.ch].name, chAv: CH[m.ch].av, thumb: m.img };
  const r = S.vcache.find(v => v.id === id) || { id, title: 'Видео', channel: '', thumb: ytThumb(id), dur: '', views: '', ago: '' };
  return { ...r, real: true };
}
const streamUrl = id => CFG.streamServer + '?id=' + encodeURIComponent(id);

/* ---------- тосты ---------- */
let toastT;
function toast(text, err) {
  clearTimeout(toastT);
  const h = $('#toastHost');
  h.innerHTML = `<div class="toast glass-pop ${err ? 'err' : ''}">${ic(err ? 'error' : 'check_circle')}${esc(text)}</div>`;
  toastT = setTimeout(() => { h.innerHTML = ''; }, 2600);
}

/* ---------- слои (модалки, меню, сторис) ---------- */
let layerKind = null, storyTimer = null;
function closeLayer() {
  clearTimeout(storyTimer); storyTimer = null; layerKind = null; ST.open = false;
  $('#layer').innerHTML = ''; document.body.classList.remove('noscroll-l');
}
function openLayer(html, kind) { $('#layer').innerHTML = html; layerKind = kind; }

/* ============================================================
   РОУТЕР
   ============================================================ */
function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  const parts = raw ? raw.split('/').map(p => { try { return decodeURIComponent(p); } catch { return p; } }) : [];
  return { name: parts[0] || 'home', args: parts.slice(1), key: raw };
}
function go(path) {
  const h = '#/' + path;
  if (location.hash === h) { render(); return; }
  pendingPush = true; location.hash = h;
}
const searchPath = q => 'search/' + encodeURIComponent(q);
function back() { if (history.length > 1) history.back(); else go(''); }

const PAGES = { home: pageHome, search: pageSearch, watch: pageWatch, channel: pageChannel, toki: pageToki, media: pageMedia, subs: pageSubs, studio: pageStudio };
const TAB_OF = { home: 0, search: 0, watch: 0, media: 1, toki: 2 };

function render(restoreScroll) {
  const { name, args, key } = parseRoute();
  if (cur && cur.unmount) { try { cur.unmount(); } catch (e) { console.error(e); } }
  closeMenus();
  const view = $('#view');
  const page = (PAGES[name] || PAGES.home)(args);
  cur = page;
  view.innerHTML = page.html;
  document.body.className = 'r-' + (PAGES[name] ? name : 'home');
  curKey = key;
  syncChrome(name);
  if (page.mount) page.mount(view);
  window.scrollTo(0, restoreScroll ? (scrollMem[key] || 0) : 0);
}
function syncChrome(name) {
  const t = TAB_OF[name];
  [$('#topTabs'), $('#mTabs')].forEach(seg => {
    if (!seg) return;
    seg.classList.toggle('none', t == null);
    seg.style.setProperty('--i', t ?? 0);
    $$('button', seg).forEach((b, i) => b.classList.toggle('on', i === t));
  });
  $$('#dock [data-nav]').forEach(el => el.classList.toggle('on', el.dataset.nav === name || (el.dataset.nav === 'home' && (name === 'search' || name === 'watch'))));
  const me = $('#dock .me-btn'); if (me) me.classList.toggle('on', name === 'channel' && S.chan === 'me');
  if (name !== 'search') { /* поле поиска оставляем как есть */ }
}
window.addEventListener('hashchange', e => {
  try { const old = new URL(e.oldURL).hash.replace(/^#\/?/, ''); scrollMem[old] = window.scrollY; } catch { /* noop */ }
  const restore = !pendingPush; pendingPush = false;
  render(restore);
});

/* ============================================================
   ПОИСК (реальный)
   ============================================================ */
function addRecent(q) {
  S.recent = [q, ...S.recent.filter(r => norm(r) !== norm(q))].slice(0, 8);
  store.set('recent', S.recent);
}
function submitSearch(q) {
  q = (q || '').trim();
  if (q.length < 2) { toast('Введите хотя бы 2 символа', true); return; }
  addRecent(q);
  $('#q').blur(); closeSugg();
  S.sTab = 0;
  go(searchPath(q));
}
async function runSearch(q) {
  if (SR.ctrl) SR.ctrl.abort();
  const ctrl = new AbortController(); SR.ctrl = ctrl;
  const entry = { status: 'loading', items: [], error: '' };
  SR.cache.set(q, entry);
  let timedOut = false;
  const to = setTimeout(() => { timedOut = true; ctrl.abort(); }, CFG.searchTimeout);
  try {
    const res = await fetch(CFG.searchServer + '?q=' + encodeURIComponent(q), { signal: ctrl.signal });
    if (!res.ok) throw new Error('Сервер ответил ' + res.status);
    const data = await res.json();
    if (data && data.error) throw new Error(String(data.error));
    const list = Array.isArray(data) ? data : (data.results || data.items || []);
    entry.items = list.map(normVideo).filter(v => v.id);
    entry.status = 'ok';
    rememberVideos(entry.items);
    SR.last = { q, items: entry.items };
  } catch (err) {
    if (err.name === 'AbortError' && !timedOut) { SR.cache.delete(q); return; }   // заменён новым запросом
    entry.status = 'err';
    entry.error = timedOut ? 'Сервер слишком долго не отвечает' : (err.message || 'Не удалось выполнить поиск');
    console.error(err);
  } finally {
    clearTimeout(to);
    if (SR.ctrl === ctrl) SR.ctrl = null;
  }
  const r = parseRoute();
  if (r.name === 'search' && r.args[0] === q) paintSearch(q);
}
function channelsOf(items) {
  const m = new Map();
  items.forEach(v => { if (!v.channel) return; const o = m.get(v.channel) || { name: v.channel, n: 0 }; o.n++; m.set(v.channel, o); });
  return Array.from(m.values()).sort((a, b) => b.n - a.n);
}
const tokMatches = q => SH.filter(t => matchAll(t.cap + ' ' + CH[t.ch].name, q));

function resCard(v, q) {
  const meta = [v.views, v.ago].filter(Boolean).join(' · ');
  return `<div class="sres" data-act="watch" data-id="${esc(v.id)}" tabindex="0">
    <div class="th"><img src="${esc(v.thumb)}" data-fb="${ytThumb(v.id)}" alt="" loading="lazy">${v.dur ? `<span class="pill">${esc(v.dur)}</span>` : ''}</div>
    <div class="tx">
      <span class="tt clamp2">${hl(v.title, q)}</span>
      ${meta ? `<span class="mt">${esc(meta)}</span>` : ''}
      ${v.channel ? `<span class="chn" data-act="chsearch" data-name="${esc(v.channel)}">${avi(v.channel, 28)}<span>${esc(v.channel)}</span></span>` : ''}
      ${v.desc ? `<span class="ds clamp2">${esc(v.desc)}</span>` : ''}
    </div></div>`;
}
const tokCard = t => `<div class="tcard" data-act="toki" data-i="${t.i}"><img src="${t.img}" alt="" loading="lazy">${t.ad ? '<span class="tag-ad">РЕКЛАМА</span>' : ''}<div class="cap"><b class="clamp2">${esc(t.cap)}</b><span>${t.views} просмотров</span></div></div>`;

function searchBodyHtml(q) {
  const e = SR.cache.get(q);
  if (!e || e.status === 'loading') {
    return Array.from({ length: 4 }, () => `<div class="sk-row"><div class="a skel"></div><div class="b"><i class="skel" style="width:85%"></i><i class="skel" style="width:40%"></i><i class="skel" style="width:30%"></i></div></div>`).join('');
  }
  if (e.status === 'err') {
    return `<div class="err-box glass">${ic('cloud_off')}<b style="font:800 18px Manrope">Не удалось выполнить поиск</b><small>${esc(e.error)}</small><button class="btn accent" data-act="retry">${ic('refresh')}Повторить</button></div>`;
  }
  const chs = channelsOf(e.items), toks = tokMatches(q), t = S.sTab;
  const showCh = (t === 0 || t === 2) && chs.length > 0, showV = (t === 0 || t === 1) && e.items.length > 0, showT = (t === 0 || t === 3) && toks.length > 0;
  let h = '';
  if (showCh) {
    const list = t === 0 ? chs.slice(0, 1) : chs;
    h += list.map(c => `<div class="chres glass" data-act="chsearch" data-name="${esc(c.name)}"><div>${avi(c.name, 120, 'big')}</div>
      <div class="col" style="gap:6px;min-width:0"><span class="nm ell">${esc(c.name)}</span><span class="mt">${c.n} ${c.n === 1 ? 'видео' : 'видео'} в выдаче</span></div>
      <button class="btn solid sm" style="height:44px;padding:0 22px">Все видео</button></div>`).join('');
  }
  if (showT) h += `<div class="col" style="gap:14px"><span class="h3 row" style="gap:8px">${ic('bolt', 'f', 'color:var(--accent);font-size:20px')}Токи</span><div class="tgrid" style="grid-template-columns:repeat(5,minmax(0,1fr))">${toks.map(tokCard).join('')}</div></div>`;
  if (showV) h += `<div class="col" style="gap:12px">${e.items.map(v => resCard(v, q)).join('')}</div>`;
  if (!h) h = `<div class="empty">${ic('search_off')}<b>Ничего не нашлось — попробуйте другой запрос</b></div>`;
  return h;
}
function searchCount(q) {
  const e = SR.cache.get(q);
  if (!e || e.status === 'loading') return 'Ищем на YouTube…';
  if (e.status === 'err') return 'Ошибка поиска';
  const t = tokMatches(q).length;
  return e.items.length + ' видео' + (t ? ' · ' + t + ' ток.' : '');
}
function paintSearch(q) {
  const b = $('#sBody'); if (!b) return;
  b.innerHTML = searchBodyHtml(q);
  $('#sCount').textContent = searchCount(q);
}
function pageSearch([q = '']) {
  q = q.trim();
  const input = $('#q'); if (input && document.activeElement !== input) { input.value = q; syncClear(); }
  if (q && !SR.cache.get(q)) runSearch(q);
  else if (SR.cache.get(q)?.status === 'err') { /* ждём ручной повтор */ }
  const tabs = ['Все', 'Видео', 'Каналы', 'Токи'];
  return {
    html: `<div class="page narrow">
      <div class="sechead" style="align-items:flex-end">
        <div class="col" style="gap:4px;min-width:0"><span class="mute" id="sCount" style="font:700 13px Manrope">${searchCount(q)}</span><span class="h1 clamp2">«${esc(q)}»</span></div>
        <div class="seg" id="sSeg" style="--n:4;--i:${S.sTab}">${tabs.map((t, i) => `<button class="${i === S.sTab ? 'on' : ''}" data-act="stab" data-i="${i}">${t}</button>`).join('')}</div>
      </div>
      <div class="col" style="gap:22px" id="sBody">${searchBodyHtml(q)}</div></div>`
  };
}

/* подсказки в поле поиска (недавние запросы) */
const SG = { open: false, idx: -1, items: [] };
function suggItems(q) {
  q = q.trim();
  if (!q) return S.recent.map(t => ({ t, icon: 'history', rm: true }));
  const m = S.recent.filter(r => norm(r).startsWith(norm(q)) && norm(r) !== norm(q)).slice(0, 5).map(t => ({ t, icon: 'history', rm: true }));
  return [{ t: q, icon: 'search' }, ...m];
}
function paintSugg() {
  const box = $('#sugg'); if (!box) return;
  if (!SG.open) { box.hidden = true; return; }
  const q = $('#q').value;
  SG.items = suggItems(q);
  const rows = SG.items.map((g, i) => `<div class="it ${i === SG.idx ? 'on' : ''}" data-i="${i}">${ic(g.icon)}<span class="t ell">${g.icon === 'search' ? esc(g.t) : hl(g.t, q, 'b')}</span>${g.rm ? `<span class="x" data-rm="${i}">${ic('close', '', 'font-size:17px')}</span>` : ''}</div>`).join('');
  box.innerHTML = `<span class="cap">${q.trim() ? 'Искать на YouTube' : 'Недавние запросы'}</span>${rows || '<div class="note">Введите запрос — найдём видео на YouTube</div>'}
    <div class="keys"><span>↑ ↓ выбор</span><span>Enter — найти</span><span>Esc — закрыть</span></div>`;
  box.hidden = false;
  const sb = $('#sbox');
  if (innerWidth >= 1100 && sb) { const r = sb.getBoundingClientRect(); Object.assign(box.style, { left: r.left + 'px', top: r.bottom + 8 + 'px', width: r.width + 'px' }); }
  else box.style.left = box.style.top = box.style.width = '';
}
function closeSugg() { SG.open = false; SG.idx = -1; paintSugg(); }
function syncClear() { const b = $('#qclear'); if (b) b.hidden = !$('#q').value; }
function initSearchBox() {
  const q = $('#q');
  q.addEventListener('focus', () => { SG.open = true; paintSugg(); });
  q.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== q) closeSugg(); }, 140));
  q.addEventListener('input', () => { SG.idx = -1; SG.open = true; syncClear(); paintSugg(); });
  q.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); SG.idx = Math.min(SG.items.length - 1, SG.idx + 1); paintSugg(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); SG.idx = Math.max(-1, SG.idx - 1); paintSugg(); }
    else if (e.key === 'Escape') { q.blur(); }
  });
  $('#sform').addEventListener('submit', e => {
    e.preventDefault();
    const pick = SG.idx >= 0 ? SG.items[SG.idx] : null;
    submitSearch(pick ? pick.t : q.value);
  });
  $('#qclear').addEventListener('pointerdown', e => { e.preventDefault(); q.value = ''; syncClear(); SG.idx = -1; q.focus(); paintSugg(); });
  $('#sugg').addEventListener('pointerdown', e => {
    e.preventDefault();
    const rm = e.target.closest('[data-rm]');
    if (rm) { const g = SG.items[+rm.dataset.rm]; S.recent = S.recent.filter(r => r !== g.t); store.set('recent', S.recent); paintSugg(); return; }
    const it = e.target.closest('.it'); if (!it) return;
    const g = SG.items[+it.dataset.i]; q.value = g.t; submitSearch(g.t);
  });
  document.addEventListener('keydown', e => {
    if (e.key === '/' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); }
  });
}

/* ============================================================
   КАРТОЧКИ
   ============================================================ */
function vcardMock(v) {
  const c = CH[v.ch];
  return `<div class="vcard" data-act="watch" data-id="${v.id}" data-src="${v.src}" tabindex="0">
    <img class="cv" src="${v.img}" alt="" loading="lazy"><span class="pill">${v.dur}</span>
    <div class="vbar dglass"><span data-act="chan" data-ch="${v.ch}">${av(c.av, 38)}</span>
      <div class="tx"><span class="tt clamp2">${esc(v.title)}</span><span class="mt ell" data-act="chan" data-ch="${v.ch}">${esc(c.name)} · ${v.views} · ${v.ago}</span></div></div></div>`;
}
function adCard() {
  return `<div class="vcard adcard" data-act="ad" tabindex="0"><img class="cv" src="${AD.img}" alt="" loading="lazy"><span class="tag-ad">РЕКЛАМА</span>
    <div class="vbar dglass"><div class="tx"><span class="tt clamp2">${esc(AD.title)}</span><span class="mt">${esc(AD.adv)}</span></div><span class="cta">Подробнее</span></div></div>`;
}
function shelfHtml() {
  return `<div class="shelf glass"><div class="hd"><span class="ico">${ic('bolt')}</span><b>Токи</b><span class="s">короткие видео</span><span class="grow"></span>
    <button class="btn sm" data-act="tab" data-tab="toki" style="height:36px">Смотреть все</button></div>
    <div class="tgrid">${SH.slice(0, 6).map(tokCard).join('')}</div></div>`;
}
const CATS = ['Все', 'Подписки', 'Кино', 'Анимация', 'Авто', 'Природа', 'Еда'];

/* ---------- сторис ---------- */
const storyList = () => [...STF, ...STA.filter(g => S.subs[g.ch])];
const ringOf = g => S.seen[g.id] ? 'var(--line)' : g.friend ? 'conic-gradient(from 200deg,#4fd39a,#2fb6c4,#4fd39a)' : 'conic-gradient(from 200deg,#ff4d6d,#f5c84c,var(--accent),#ff4d6d)';
function storiesHtml() {
  const L = storyList(), nF = STF.length;
  const item = (g, i) => `<div class="st" data-act="story" data-i="${i}"><div class="ring" style="--ring:${ringOf(g)}">${av(g.av, 62)}${g.friend ? `<span class="fr">${ic('person')}</span>` : ''}</div><span class="n ell">${esc(g.name)}</span></div>`;
  return `<div class="stories glass" id="storiesBar">
    <div class="st" data-act="mystory"><div class="ring mine">${av(CH.me.av, 62)}<span class="plus">${ic('add')}</span></div><span class="n">Ваша история</span></div>
    <span class="lbl">ДРУЗЬЯ</span>${L.slice(0, nF).map((g, i) => item(g, i)).join('')}
    <span class="vsep"></span><span class="lbl">АВТОРЫ</span>${L.slice(nF).map((g, i) => item(g, i + nF)).join('')}</div>`;
}
const ST = { open: false, g: 0, f: 0, seq: 0 };
function openStory(i) { ST.open = true; ST.g = i; ST.f = 0; markSeen(); paintStory(); }
function markSeen() { const g = storyList()[ST.g]; if (g) S.seen[g.id] = true; }
function paintStory() {
  const L = storyList(), g = L[ST.g]; if (!g) { closeLayer(); return; }
  const f = g.frames[ST.f] || g.frames[0], key = g.id + ST.f, liked = !!S.slikes[key];
  const bars = g.frames.map((_, k) => `<div><i class="${k < ST.f ? 'done' : k === ST.f ? 'run' : ''}"></i></div>`).join('');
  openLayer(`<div class="story-ov" data-act="storyclose">
    <button class="arr glass" data-act="sprevg" aria-label="Назад">${ic('chevron_left')}</button>
    <div class="story" data-act="noop">
      <img src="${f.img}" alt=""><div class="shade"></div>
      <div class="tp" data-act="sprev"></div><div class="tn" data-act="snext"></div>
      <div class="bars">${bars}</div>
      <div class="who"><span data-act="sauthor" data-ch="${g.ch || ''}">${av(g.av, 36)}</span><b>${esc(g.name)}</b><span>${esc(f.time)}</span><span class="grow"></span><button class="ibtn sm" data-act="storyclose">${ic('close')}</button></div>
      <div class="cap">${f.text ? `<span class="dglass">${esc(f.text)}</span>` : ''}${f.link ? `<button data-act="slink" data-id="${f.link}">${ic('play_arrow')}Смотреть видео</button>` : ''}</div>
      <div class="ft"><input class="dglass" placeholder="Ответить: ${esc(g.name)}…"><button class="ibtn dg ${liked ? 'liked' : ''}" data-act="slike" data-key="${key}">${ic('favorite', 'f')}</button><button class="ibtn dg" data-act="ssend">${ic('send')}</button></div>
    </div>
    <button class="arr glass" data-act="snextg" aria-label="Вперёд">${ic('chevron_right')}</button></div>`, 'story');
  clearTimeout(storyTimer);
  storyTimer = setTimeout(() => storyStep(1), 5000);
}
function storyStep(d) {
  const L = storyList(); let gi = ST.g, f = ST.f + d;
  if (!L[gi]) return closeLayer();
  if (f >= L[gi].frames.length) { gi++; f = 0; if (gi >= L.length) return closeLayer(); }
  else if (f < 0) { gi--; if (gi < 0) { gi = 0; f = 0; } else f = L[gi].frames.length - 1; }
  ST.g = gi; ST.f = f; markSeen(); paintStory();
}
function storyGroup(d) { const gi = ST.g + d; if (gi < 0 || gi >= storyList().length) return closeLayer(); ST.g = gi; ST.f = 0; markSeen(); paintStory(); }

/* ============================================================
   ГЛАВНАЯ
   ============================================================ */
function homeGridHtml() {
  const list = V.filter(v => S.chip === 0 || (S.chip === 1 ? S.subs[v.ch] : v.cat === CATS[S.chip]));
  if (!list.length) return `<div class="empty" style="grid-column:1/-1">${ic('video_library')}<b>В этой категории пока пусто</b></div>`;
  const tiles = list.map(vcardMock);
  if (S.chip !== 0) return tiles.join('');
  const c = { 1: { ad: 2, pre: 5 }, 2: { ad: 2, pre: 4 }, 3: { ad: 3, pre: 6 }, 4: { ad: 3, pre: 8 } }[cols()];
  if (S.mon.pre) tiles.splice(c.ad, 0, adCard());
  return [...tiles.slice(0, c.pre), shelfHtml(), ...tiles.slice(c.pre)].join('');
}
function pageHome() {
  const chips = `<div class="chips glass" id="chips">${CATS.map((c, i) => `<button class="chip ${i === S.chip ? 'on' : ''}" data-act="chip" data-i="${i}">${c}</button>`).join('')}</div>`;
  let lastCols = cols();
  const onResize = () => { if (cols() !== lastCols) { lastCols = cols(); const g = $('#homeGrid'); if (g) g.innerHTML = homeGridHtml(); } };
  return {
    html: `<div class="page">${storiesHtml()}<div class="sechead"><h2 class="h2">Рекомендации</h2>${chips}</div><div class="grid" id="homeGrid">${homeGridHtml()}</div></div>`,
    mount() { addEventListener('resize', onResize); },
    unmount() { removeEventListener('resize', onResize); }
  };
}

/* ============================================================
   ПРОСМОТР
   ============================================================ */
const subLabel = (on, short) => short ? (on ? 'Вы читаете' : 'Читать') : (on ? 'Вы подписаны' : 'Подписаться');
const subBtn = (ch, short = false, cls = 'btn') => { const on = !!S.subs[ch]; return `<button class="${cls} btn-sub ${on ? 'on' : ''}" data-act="sub" data-ch="${ch}" data-short="${short ? 1 : 0}">${subLabel(on, short)}</button>`; };

function likesHtml(v) {
  const l = S.vlike[v.id] || 0;
  const cnt = v.mock ? fmt(v.likes + (l === 1 ? 1 : 0)) : 'Нравится';
  return `<div class="likes glass"><button class="${l === 1 ? 'on' : ''}" data-act="vlike" data-id="${v.id}">${ic('thumb_up', l === 1 ? 'pop' : '')}${cnt}</button><span class="sep"></span><button class="${l === -1 ? 'on' : ''}" data-act="vdislike" data-id="${v.id}" aria-label="Не нравится">${ic('thumb_down')}</button></div>`;
}
function upNextHtml(v) {
  let items;
  if (v.mock) items = V.filter(x => x.id !== v.id).slice(0, 9).map(x => ({ id: x.id, title: x.title, thumb: x.img, dur: x.dur, sub: CH[x.ch].name + ' · ' + x.views + ' просмотров', ch: x.ch }));
  else items = (SR.last ? SR.last.items : []).filter(x => x.id !== v.id).slice(0, 14).map(x => ({ id: x.id, title: x.title, thumb: x.thumb, dur: x.dur, sub: [x.channel, x.views].filter(Boolean).join(' · '), real: true }));
  if (!items.length) return '';
  const head = !v.mock && SR.last ? `Ещё по запросу «${esc(SR.last.q)}»` : 'Далее';
  return `<div class="side"><b>${head}</b>${items.map(x => `<div class="upn" data-act="watch" data-id="${esc(x.id)}" tabindex="0"><div class="th"><img src="${esc(x.thumb)}" ${x.real ? `data-fb="${ytThumb(x.id)}"` : ''} alt="" loading="lazy">${x.dur ? `<span class="pill">${esc(x.dur)}</span>` : ''}</div><div class="tx"><b class="clamp2">${esc(x.title)}</b><span>${esc(x.sub)}</span></div></div>`).join('')}</div>`;
}
const AD_SECS = 6;
function pageWatch([id]) {
  const v = getVideo(id);
  const chName = v.mock ? v.chName : v.channel;
  const withAd = v.mock && S.mon.pre;
  const poster = esc(v.thumb);
  const chAvHtml = v.mock ? av(v.chAv, 46) : (chName ? avi(chName, 46) : '');
  const who = chName ? `<div class="who" data-act="${v.mock ? 'chan' : 'chsearch'}" data-ch="${v.ch || ''}" data-name="${esc(chName)}">${chAvHtml}<div><b>${esc(chName)}</b>${v.mock ? `<small>${CH[v.ch].subs} подписчиков</small>` : '<small>Канал на YouTube</small>'}</div></div>` : '';
  const meta = v.mock ? `${v.views} просмотров · ${v.ago}` : [v.views, v.ago].filter(Boolean).join(' · ');
  const html = `<div class="watch">
    <div class="main">
      <div class="pwrap"><img class="glow" src="${poster}" alt="">
        <div class="player" id="player">
          <video id="mainVideo" controls playsinline preload="auto"></video>
          <img class="pposter" id="pposter" src="${poster}" alt="">
          <div class="pstate" id="pstate"><div class="spin"></div>Загружаем видео…</div>
          ${withAd ? `<div class="ad" id="ad"><video src="${D.PRE}" muted autoplay loop playsinline></video>
            <div class="top dglass"><span class="tag-ad">РЕКЛАМА</span>Nova Mobile · <span id="adT">0:0${AD_SECS}</span></div>
            <div class="lnk dglass">Nova Cast — 2 990 ₽<button data-act="adlink">На сайт</button></div>
            <button class="skip" id="adSkip" data-act="adskip">Пропустить через ${AD_SECS - 3}</button><div class="prog"><i id="adProg" style="width:0"></i></div></div>` : ''}
        </div></div>
      ${v.mock ? `<div class="moments">${[['0:00', 'Начало'], ['0:02', 'Завязка'], ['0:05', 'Главный момент'], ['0:08', 'Финал']].map(([t, l]) => `<button class="glass" data-act="moment" data-t="${t.split(':')[1]}"><b>${t}</b>${l}</button>`).join('')}</div>` : ''}
      <h1 class="wtitle">${esc(v.title)}</h1>
      <div class="wrow">${who}${v.mock ? subBtn(v.ch) : ''}<span class="grow"></span>
        <div class="actions"><span id="likes">${likesHtml(v)}</span>
          <button class="btn accent" data-act="donate" data-ch="${v.ch || ''}" data-name="${esc(chName)}">${ic('volunteer_activism', 'f')}Донат</button>
          <button class="btn glass" data-act="share">${ic('ios_share')}Поделиться</button></div></div>
      ${v.mock ? `<div class="goal" data-act="donate" data-ch="${v.ch}"><div class="rg"><span>68%</span></div><div><b>Цель: новая камера для канала</b><small>Собрано 136 000 ₽ из 200 000 ₽</small></div><button class="btn accent sm">Поддержать</button></div>` : ''}
      ${(meta || v.desc || v.mock) ? `<div class="desc glass"><b>${esc(meta || 'Видео с YouTube')}</b>${v.mock ? `<p>${esc(v.desc)}</p>` : (v.desc ? `<p>${esc(v.desc)}</p>` : '')}</div>` : ''}
      ${v.mock ? `<div class="comments"><b class="h3">Комментарии · 1 284</b>
        <div class="in">${av(CH.me.av, 38)}<input placeholder="Оставьте комментарий…"></div>
        ${C.map(c => `<div class="cm">${av(c.av, 38)}<div class="b"><span class="n">${esc(c.n)} <span>· ${c.ago}</span></span><span class="t">${esc(c.t)}</span><span class="l">${ic('thumb_up')}${c.likes}</span></div></div>`).join('')}</div>` : ''}
    </div>
    <aside>${upNextHtml(v)}</aside></div>`;

  let adIv = null, adT = AD_SECS, video = null;
  const unmountVideo = () => { clearInterval(adIv); if (video) { try { video.pause(); video.removeAttribute('src'); video.load(); } catch { /* noop */ } } };
  return {
    html,
    mount() {
      video = $('#mainVideo'); const st = $('#pstate');
      const showLoad = () => { st.className = 'pstate'; st.innerHTML = '<div class="spin"></div>Загружаем видео…'; st.hidden = false; };
      const hideSt = () => { st.hidden = true; };
      video.addEventListener('loadstart', showLoad);
      video.addEventListener('waiting', () => { st.className = 'pstate clear'; st.innerHTML = '<div class="spin"></div>'; st.hidden = false; });
      video.addEventListener('canplay', hideSt);
      video.addEventListener('playing', () => { hideSt(); const p = $('#pposter'); if (p) p.remove(); });
      video.addEventListener('error', () => {
        if (!video.getAttribute('src')) return;
        st.className = 'pstate'; st.hidden = false;
        st.innerHTML = `${ic('error')}Не удалось загрузить видео<small>${v.real ? 'Сервер не отдал поток. Проверьте stream.php или попробуйте ещё раз.' : 'Демо-видео недоступно.'}</small><button class="btn solid sm" data-act="vretry">${ic('refresh')}Повторить</button>`;
      });
      const start = () => {
        const src = v.mock ? v.src : streamUrl(v.id);
        video.src = src; video.load();
        const p = video.play(); if (p && p.catch) p.catch(() => { /* автозапуск запрещён — ждём нажатия */ });
      };
      video._start = start;
      if (withAd) {
        st.hidden = true;
        const stop = () => { clearInterval(adIv); const ad = $('#ad'); if (ad) ad.remove(); start(); };
        video._skipAd = () => { if (adT <= 3) stop(); };
        adIv = setInterval(() => {
          adT--;
          const t = $('#adT'), sk = $('#adSkip'), pr = $('#adProg');
          if (t) t.textContent = '0:0' + Math.max(adT, 0);
          if (pr) pr.style.width = ((AD_SECS - adT) / AD_SECS * 100) + '%';
          if (sk) { if (adT <= 3) { sk.textContent = 'Пропустить ›'; sk.classList.add('ready'); } else sk.textContent = 'Пропустить через ' + (adT - 3); }
          if (adT <= 0) stop();
        }, 1000);
      } else start();
    },
    unmount: unmountVideo
  };
}

/* ============================================================
   КАНАЛ (демо-каналы)
   ============================================================ */
const miniCard = v => `<div class="vmini" data-act="watch" data-id="${v.id}"><div class="th"><img src="${v.img}" alt="" loading="lazy"><span class="pill">${v.dur}</span></div><b class="clamp2">${esc(v.title)}</b><span>${v.views} просмотров · ${v.ago}</span></div>`;
const tokOf = ch => SH.filter(t => t.ch === ch);
function postHtml(p, i) {
  const c = p.ch ? CH[p.ch] : null, name = c ? c.name : p.name, avs = c ? c.av : p.av, liked = !!S.plikes[i];
  const votes = p.votes || [], mine = S.poll[i], tot = votes.reduce((a, b) => a + b, 0) + (mine != null ? 1 : 0);
  return `<div class="post glass" data-p="${i}"><div class="hd"><span data-act="chan" data-ch="${p.ch || 'nova'}">${av(avs, 42)}</span><div class="nm" data-act="chan" data-ch="${p.ch || 'nova'}"><b>${esc(name)}</b><span>${p.time}</span></div>${p.ad ? '<span class="tag-ad">СПОНСОРСКИЙ</span>' : ''}</div>
    <p class="tx">${esc(p.text)}</p>
    ${p.img ? `<div class="im" data-act="${p.link ? 'watch' : 'ad'}" data-id="${p.link || ''}"><img src="${p.img}" alt="" loading="lazy"></div>` : ''}
    ${p.poll ? `<div class="poll">${p.poll.map((l, k) => { const n = votes[k] + (mine === k ? 1 : 0), pct = Math.round(n / tot * 100); return `<div class="o" data-act="vote" data-p="${i}" data-k="${k}"><i class="${mine === k ? 'me' : ''}" style="width:${mine != null ? pct : 0}%"></i><div><span>${esc(l)}</span><span>${mine != null ? pct + '%' : ''}</span></div></div>`; }).join('')}<small>${mine == null ? 'Нажмите, чтобы проголосовать' : fmt(tot) + ' голосов · спасибо за голос'}</small></div>` : ''}
    <div class="pacts"><button class="btn ${liked ? 'liked' : ''}" data-act="plike" data-p="${i}">${ic('favorite', 'f')}${fmt(p.likes + (liked ? 1 : 0))}</button>
      <button class="btn ${S.openC[i] ? 'open' : ''}" data-act="pcm" data-p="${i}">${ic('chat_bubble')}${fmt(p.c)}</button>
      <button class="btn" data-act="share">${ic('ios_share')}Поделиться</button>
      ${p.linkLabel ? `<span class="grow"></span><button class="btn" data-act="${p.link ? 'watch' : 'ad'}" data-id="${p.link || ''}" style="background:var(--tabOn)">${p.linkLabel}</button>` : ''}</div>
    ${S.openC[i] ? `<div class="pcm">${C.slice(0, 2).map(c => `<div class="cm">${av(c.av, 32)}<div class="b"><span class="n">${esc(c.n)}</span><span class="t">${esc(c.t)}</span></div></div>`).join('')}</div>` : ''}</div>`;
}
function channelBody(k) {
  const cc = CH[k], vids = V.filter(v => v.ch === k), toks = tokOf(k), posts = P.map((p, i) => ({ p, i })).filter(x => x.p.ch === k);
  const feat = [...vids].sort((a, b) => b.likes - a.likes)[0];
  const t = S.chTab;
  const tokGrid = toks.length ? `<div class="tgrid">${toks.map(tokCard).join('')}</div>` : `<div class="empty">${ic('bolt')}<b>Токов пока нет</b></div>`;
  if (t === 0) return `<div class="col" style="gap:28px;animation:fadeIn .4s">${feat ? `<div class="feat" data-act="watch" data-id="${feat.id}"><div class="th"><img src="${feat.img}" alt=""><span class="pill">Лучшее видео</span></div><div><h3>${esc(feat.title)}</h3><span class="mute" style="font:600 13px Manrope">${feat.views} просмотров · ${feat.ago}</span><p class="mute" style="font:500 14px/1.5 Manrope">${esc(feat.desc)}</p></div></div>` : ''}
    ${vids.length ? `<div class="col" style="gap:14px"><span class="h3">Видео</span><div class="vgrid4">${vids.map(miniCard).join('')}</div></div>` : ''}
    ${toks.length ? `<div class="col" style="gap:14px"><span class="h3">Токи</span>${tokGrid}</div>` : ''}${!vids.length && !toks.length ? `<div class="empty">${ic('video_library')}<b>Пока ничего нет</b></div>` : ''}</div>`;
  if (t === 1) {
    const sorted = [[...vids], [...vids].sort((a, b) => b.likes - a.likes), [...vids].reverse()][S.chSort];
    return `<div class="col" style="gap:16px;animation:fadeIn .4s"><div class="row" style="gap:8px">${['Новые', 'Популярные', 'Старые'].map((l, i) => `<button class="chip ${i === S.chSort ? 'on' : ''}" style="border:1px solid var(--line)" data-act="chsort" data-i="${i}">${l}</button>`).join('')}</div>
      ${sorted.length ? `<div class="vgrid4">${sorted.map(miniCard).join('')}</div>` : `<div class="empty">${ic('video_library')}<b>Видео пока нет</b></div>`}</div>`;
  }
  if (t === 2) return `<div style="animation:fadeIn .4s">${tokGrid}</div>`;
  if (t === 3) return `<div class="feed" style="max-width:680px;animation:fadeIn .4s">${posts.length ? posts.map(x => postHtml(x.p, x.i)).join('') : `<div class="empty">${ic('article')}<b>Постов пока нет</b></div>`}</div>`;
  return `<div class="about"><div class="card glass"><span class="h3">Описание</span><p style="margin:0;font:500 15px/1.6 Manrope;color:var(--muted)">${esc(cc.desc)}</p>
    <div class="col" style="gap:8px">${cc.links.map(l => `<span class="row" style="gap:6px;font:700 14px Manrope;color:var(--accent)">${ic('link', '', 'font-size:18px')}${esc(l)}</span>`).join('')}</div></div>
    <div class="card glass" style="gap:4px;align-self:start"><span class="h3" style="padding-bottom:10px">Статистика</span>${[['calendar_month', 'Регистрация: ' + cc.joined], ['visibility', cc.total + ' просмотров'], ['group', cc.subs + ' подписчиков'], ['public', 'Россия']].map(([i, l]) => `<div class="stat">${ic(i)}${esc(l)}</div>`).join('')}</div></div>`;
}
function channelHead(k) {
  const cc = CH[k], me = k === 'me', long = cc.desc.length > 90, bell = S.bells[k] ?? 1;
  return `<div class="banner"><img src="${cc.banner}" alt=""></div>
    <div class="chhead">${av(cc.av, 160)}<div class="col" style="gap:10px;min-width:0;flex:1">
      <h1>${esc(cc.name)}${ic('verified', 'f')}</h1>
      <span class="meta"><b>${cc.handle}</b> · ${cc.subs} подписчиков · ${V.filter(v => v.ch === k).length} видео · ${tokOf(k).length} токов</span>
      <span class="dsc" data-act="desc">${esc(S.descOpen || !long ? cc.desc : cc.desc.slice(0, 90) + '…')} <b>${long ? (S.descOpen ? 'Свернуть' : 'ещё') : ''}</b></span>
      <span class="lnk">${ic('link')}${esc(cc.links[0] + (cc.links.length > 1 ? ' и ещё ' + (cc.links.length - 1) : ''))}</span>
      <div class="btns">${me ? `<button class="btn" data-act="toast" data-m="Редактор оформления канала">Настроить вид канала</button><button class="btn solid" data-act="gostudio" data-sec="content">${ic('video_settings')}Управление видео</button>`
        : `${subBtn(k, false, 'btn')}${S.subs[k] ? `<button class="ibtn" data-act="bell" data-ch="${k}" id="bellBtn">${ic(bell ? 'notifications_active' : 'notifications_off', bell ? 'f' : '')}</button>` : ''}<button class="btn accent" data-act="donate" data-ch="${k}">${ic('volunteer_activism', 'f')}Поддержать</button><button class="btn" data-act="toast" data-m="Оформление спонсорства — 149 ₽ в месяц">Спонсорство · 149 ₽/мес</button>`}</div></div></div>`;
}
function pageChannel([k]) {
  if (!CH[k] || CH[k].adv) k = 'open';
  S.chan = k;
  const tabs = ['Главная', 'Видео', 'Токи', 'Посты', 'О канале'];
  return {
    html: `<div class="page" style="max-width:1280px"><div id="chHead" class="col" style="gap:24px">${channelHead(k)}</div>
      <div class="seg" id="chSeg" style="--n:5;--i:${S.chTab};align-self:flex-start;max-width:100%;overflow-x:auto">${tabs.map((t, i) => `<button class="${i === S.chTab ? 'on' : ''}" data-act="chtab" data-i="${i}" style="min-width:104px">${t}</button>`).join('')}</div>
      <div id="chBody">${channelBody(k)}</div></div>`
  };
}
function repaintChannel() { const k = S.chan; if ($('#chHead')) { $('#chHead').innerHTML = channelHead(k); $('#chBody').innerHTML = channelBody(k); } }

/* ============================================================
   МЕДИА, ПОДПИСКИ
   ============================================================ */
function pageMedia() {
  const authors = ['lena', 'fun', 'sever', 'anya'];
  return {
    html: `<div class="media"><div class="feed"><div class="composer glass">${av(CH.me.av, 40)}<span>Что нового?</span><button class="btn accent" data-act="upload">Опубликовать</button></div>
      <div class="feed" id="posts">${P.map(postHtml).join('')}</div></div>
      <div class="aside"><div class="card glass"><span class="h3" style="font-size:17px">Авторы для вас</span>${authors.map(k => `<div class="arow"><span data-act="chan" data-ch="${k}">${av(CH[k].av, 40)}</span><div class="tx" data-act="chan" data-ch="${k}"><b>${esc(CH[k].name)}</b><span>${CH[k].subs} подписчиков</span></div>${subBtn(k, true, 'btn sm')}</div>`).join('')}</div>
      <div class="card accent glass-pop" style="background:var(--a-glass22);box-shadow:var(--shadow)">${ic('payments', 'f', 'font-size:28px')}<b style="font:800 19px/1.25 Manrope">Зарабатывайте на постах и видео</b><span class="mute" style="font:500 14px/1.5 Manrope">70% дохода от рекламы рядом с вашим контентом — автору. Выплаты раз в месяц.</span><button class="btn solid" data-act="gostudio" data-sec="monetization">Открыть монетизацию</button></div></div></div>`
  };
}
function subsBody() {
  const keys = Object.keys(CH).filter(k => S.subs[k] && k !== 'me' && !CH[k].adv);
  const vids = V.filter(v => S.subs[v.ch]);
  return `<div class="row" style="flex-wrap:wrap;gap:10px">${keys.map(k => `<div class="glass row" data-act="chan" data-ch="${k}" style="height:52px;padding:0 18px 0 6px;border-radius:999px;cursor:pointer;gap:10px">${av(CH[k].av, 40)}<b style="font:800 14px Manrope">${esc(CH[k].name)}</b></div>`).join('')}</div>
    <div class="grid">${vids.map(vcardMock).join('')}</div>
    ${!keys.length ? `<div class="empty">${ic('subscriptions')}<b>Вы пока ни на кого не подписаны</b></div>` : ''}`;
}
function pageSubs() {
  const n = Object.keys(CH).filter(k => S.subs[k] && k !== 'me' && !CH[k].adv).length;
  return { html: `<div class="page"><div class="row" style="align-items:baseline;gap:14px"><span class="h1">Подписки</span><span class="mute" style="font:600 14px Manrope">${n} каналов</span></div><div class="col" style="gap:24px" id="subsBody">${subsBody()}</div></div>` };
}

/* ============================================================
   ТОКИ (демо)
   ============================================================ */
function trailHtml() {
  const s = SH[T.i], liked = !!T.liked[T.i];
  return `<div class="b like ${liked ? 'liked' : ''}" data-act="tlike">${ic('favorite', 'f')}<span>${fmt(s.likes + (liked ? 1 : 0))}</span></div>
    <div class="b cm ${T.panel ? 'open' : ''}" data-act="tpanel">${ic('chat_bubble', 'f')}<span>${s.comments}</span></div>
    <div class="b send" data-act="share">${ic('send', 'f')}<span>Отправить</span></div>
    <div class="b don" data-act="donate" data-ch="${s.ch}">${ic('volunteer_activism', 'f')}<span>Донат</span></div>`;
}
const tokCta = s => s.ad ? 'Перейти' : s.ch === 'me' ? 'Это вы' : S.subs[s.ch] ? 'Вы подписаны' : 'Подписаться';
function tokPanelHtml() {
  const s = SH[T.i];
  return `<div class="tpanel glass"><div class="hd"><b>Комментарии · ${s.comments}</b><button class="ibtn sm" data-act="tpanel">${ic('close')}</button></div>
    <div class="ls">${TC.map(c => `<div class="cm">${av(c.av, 34)}<div class="b" style="flex:1"><span class="n">${esc(c.n)} <span>· ${c.ago}</span></span><span class="t">${esc(c.t)}</span></div><span class="fav">${ic('favorite')}${c.likes}</span></div>`).join('')}</div>
    <div class="ft"><input placeholder="Добавьте комментарий…"><button data-act="toast" data-m="Комментарий опубликован">${ic('arrow_upward')}</button></div></div>`;
}
function pageToki([start]) {
  T.i = Math.min(Math.max(+start || 0, 0), SH.length - 1);
  const slides = SH.map(s => `<div class="tslide" data-i="${s.i}"><video data-short="${s.i}" src="${s.src}" poster="${s.img}" loop playsinline preload="none" ${T.muted ? 'muted' : ''}></video>${s.ad ? '<span class="tag-ad">РЕКЛАМА</span>' : ''}
    <div class="tinfo dglass"><div class="a"><span data-act="chan" data-ch="${s.ch}">${av(CH[s.ch].av, 36)}</span><b data-act="chan" data-ch="${s.ch}">${esc(CH[s.ch].name)}</b><button class="${S.subs[s.ch] || s.ch === 'me' ? 'sub' : ''}" data-act="tsub" data-ch="${s.ch}" data-ad="${s.ad ? 1 : 0}">${tokCta(s)}</button></div>
    <span class="c">${esc(s.cap)}</span><span class="m">${ic('music_note')}Оригинальный звук · ${esc(CH[s.ch].name)}</span></div></div>`).join('');
  let io = null, onKey = null;
  return {
    html: `<div class="toki" id="toki"><div class="tcol" id="tcol"><div class="tscroll" id="tscroll">${slides}</div>
      <button class="ibtn dg tmute" data-act="tmute" id="tmute">${ic(T.muted ? 'volume_off' : 'volume_up')}</button></div>
      <div class="trail" id="trail">${trailHtml()}</div><div id="tpanelHost" style="display:contents">${T.panel ? tokPanelHtml() : ''}</div>
      <div class="tnav glass"><button data-act="tprev" aria-label="Вверх">${ic('keyboard_arrow_up', '')}</button><span id="tpos">${T.i + 1}/${SH.length}</span><button data-act="tnext" aria-label="Вниз">${ic('keyboard_arrow_down')}</button></div></div>`,
    mount() {
      const sc = $('#tscroll');
      const activate = i => {
        T.i = i;
        $$('video[data-short]').forEach(v => {
          v.muted = T.muted;
          if (+v.dataset.short === i) { const p = v.play(); if (p && p.catch) p.catch(() => { v.muted = true; v.play().catch(() => {}); }); }
          else if (!v.paused) v.pause();
        });
        $('#trail').innerHTML = trailHtml(); $('#tpos').textContent = (i + 1) + '/' + SH.length;
        if (T.panel) $('#tpanelHost').innerHTML = tokPanelHtml();
      };
      const slideH = () => sc.clientHeight;
      sc.scrollTo({ top: T.i * slideH(), behavior: 'instant' });
      let activeI = -1;
      io = new IntersectionObserver(es => es.forEach(en => {
        if (!en.isIntersecting || en.intersectionRatio < .6) return;
        const i = +en.target.dataset.i;
        if (i !== activeI) { activeI = i; activate(i); }
      }), { root: sc, threshold: [.6, 1] });
      $$('.tslide', sc).forEach(s => io.observe(s));
      // двойной тап/клик — лайк
      let lastTap = 0;
      sc.addEventListener('click', e => {
        if (e.target.closest('[data-act]')) return;
        const now = Date.now();
        if (now - lastTap < 320) { T.liked[T.i] = true; $('#trail').innerHTML = trailHtml(); burst(); lastTap = 0; } else lastTap = now;
      });
      onKey = e => {
        if (/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); sc.scrollBy({ top: slideH(), behavior: 'smooth' }); }
        if (e.key === 'ArrowUp') { e.preventDefault(); sc.scrollBy({ top: -slideH(), behavior: 'smooth' }); }
      };
      addEventListener('keydown', onKey);
    },
    unmount() { if (io) io.disconnect(); if (onKey) removeEventListener('keydown', onKey); $$('video[data-short]').forEach(v => { v.pause(); v.removeAttribute('src'); v.load(); }); T.panel = false; }
  };
}
function burst() {
  const col = $('#tcol'); if (!col) return;
  const b = document.createElement('span'); b.className = 'ms f tburst'; b.textContent = 'favorite'; col.appendChild(b); setTimeout(() => b.remove(), 800);
}

/* ============================================================
   СТУДИЯ (демо)
   ============================================================ */
const RGS = [{ v: [412000, 18400, 1960, 11840], d: ['+5%', '+3%', '+11%', '+8%'], n: 7, step: 1 }, { v: [1900000, 84200, 8412, 48320], d: ['+9%', '+6%', '+15%', '+12%'], n: 28, step: 1 }, { v: [5600000, 248000, 21300, 132900], d: ['+14%', '+9%', '+22%', '+18%'], n: 30, step: 3 }];
const M_LABELS = ['Просмотры', 'Время просмотра', 'Подписчики', 'Доход'];
const M_FMT = [x => fmt(Math.round(x)), x => num(x) + ' ч', x => '+' + num(x), x => num(x) + ' ₽'];
const MON_ABBR = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const ST_DEFS = [['overview', 'dashboard', 'Обзор', 'Студия · ' + CH.me.name, 'Обзор канала'], ['content', 'video_library', 'Контент', 'Видео, токи и посты', 'Контент канала'], ['analytics', 'insights', 'Аналитика', 'Подробная статистика', 'Аналитика'], ['monetization', 'payments', 'Монетизация', 'Реклама, донаты, спонсорство', 'Монетизация'], ['comments', 'forum', 'Комментарии', 'Модерация и ответы', 'Комментарии'], ['payouts', 'account_balance_wallet', 'Выплаты', 'Баланс и история', 'Выплаты']];
const VIS = [['public', 'Открытый', '#4fd39a'], ['link', 'По ссылке', '#f5c84c'], ['lock', 'Ограниченный', 'var(--muted)'], ['edit_note', 'Черновик', 'var(--muted)']];
const byId = id => V.find(v => v.id === id) || V[0];
const barRow = (l, v, w, c) => `<div class="bar"><div class="l"><span>${l}</span><span>${v}</span></div><div class="t"><i style="width:${w};${c ? 'background:' + c : ''}"></i></div></div>`;
const cardH = (t, s) => `<div class="cardhd"><b>${t}</b>${s ? `<span>${s}</span>` : ''}</div>`;
const seg = (id, labels, cur, act, w) => `<div class="seg" id="${id}" style="--n:${labels.length};--i:${cur}">${labels.map((l, i) => `<button class="${i === cur ? 'on' : ''}" data-act="${act}" data-i="${i}" ${w ? `style="min-width:${w}px"` : ''}>${l}</button>`).join('')}</div>`;
const switchRow = (key, label, hint, on) => `<div class="sw ${on ? 'on' : ''}" data-act="monsw" data-k="${key}"><div class="tx"><b>${label}</b><span>${hint}</span></div><div class="trk"></div></div>`;
const pts = a => a.map((v, i) => i * 30 + ',' + (220 - v * 2)).join(' ');
const cmLists = () => {
  const al = CM.filter(c => !S.removed[c.id]);
  return [al, al.filter(c => !c.review && !c.answered && !S.replied[c.id]), al.filter(c => c.sponsor), al.filter(c => c.review && !S.approved[c.id])];
};
function waves(RG) {
  const W = Array.from({ length: RG.n }, (_, j) => 0.55 + 0.22 * Math.sin(j * 0.9 + S.metric * 1.7 + S.range) + 0.25 * (j / RG.n));
  return { W, sum: W.reduce((a, b) => a + b, 0), max: Math.max(...W) };
}
const dateOf = (RG, j) => { const d = new Date(2026, 9, 2 - (RG.n - 1 - j) * RG.step); return d.getDate() + ' ' + MON_ABBR[d.getMonth()]; };

function stOverview() {
  const RG = RGS[S.range], { W, max } = waves(RG);
  return `<div class="kpis">${M_LABELS.map((l, i) => `<button class="kpi glass ${i === S.metric ? 'on' : ''}" data-act="metric" data-i="${i}"><small>${l}</small><b>${M_FMT[i](RG.v[i])}</b><span>${RG.d[i]}</span></button>`).join('')}</div>
    <div class="card glass">${`<div class="cardhd"><b>${M_LABELS[S.metric]} по дням</b><span id="hbLabel" style="font:800 14px Manrope;color:var(--accent)">Итого: ${M_FMT[S.metric](RG.v[S.metric])}</span></div>`}
      <div class="chart" id="chart">${W.map((w, j) => `<div data-j="${j}"><i style="height:${(w / max * 100).toFixed(1)}%;background:${j === RG.n - 1 ? 'color-mix(in oklch, var(--accent) 75%, transparent)' : 'var(--a32)'}"></i></div>`).join('')}</div>
      <div class="axis">${[0, Math.floor(RG.n / 2), RG.n - 1].map(j => `<span>${dateOf(RG, j)}</span>`).join('')}</div></div>
    <div class="cols3">
      <div class="card glass"><div class="row" style="gap:8px"><i style="width:9px;height:9px;border-radius:50%;background:var(--hot);animation:pulse 1.6s infinite"></i><b style="font:800 15px Manrope">В реальном времени</b></div>
        <b style="font:800 38px Manrope;letter-spacing:-.02em">128</b><span class="mute" style="font:600 13px Manrope;margin-top:-8px">зрителей сейчас</span>
        <div class="rt">${Array.from({ length: 48 }, (_, i) => `<i style="height:${(25 + 60 * Math.abs(Math.sin(i * .37)) + (i > 40 ? 15 : 0)).toFixed(0)}%;background:${i > 44 ? 'var(--accent)' : 'var(--a32)'}"></i>`).join('')}</div></div>
      <div class="card glass">${cardH('Последнее видео', 'вчера')}<div data-act="watch" data-id="bull" style="cursor:pointer"><img src="${byId('bull').img}" alt="" style="width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:16px;background:#111"></div>
        <b style="font:800 14px Manrope">${esc(byId('bull').title)}</b>${[['Место по просмотрам', '2 из 10'], ['Просмотры', '156 тыс'], ['CTR показов', '7,4%'], ['Среднее время', '6:41']].map(([l, v]) => `<div class="row" style="justify-content:space-between;font:600 13px Manrope"><span class="mute">${l}</span><b>${v}</b></div>`).join('')}</div>
      <div class="card paycard glass" style="background:var(--a-glass26)"><span class="mute" style="font:700 13px Manrope">К выплате · 15 октября</span><b class="big">41 200 ₽</b>
        <div class="split">${[['Реклама', 52, 'var(--accent)'], ['Донаты', 28, '#f5c84c'], ['Спонсорство', 20, '#4fd39a']].map(([, w, c]) => `<i style="width:${w}%;background:${c}"></i>`).join('')}</div>
        <div class="bars">${[['Реклама перед видео', 52], ['Реклама в середине', 21], ['Донаты', 19], ['Спонсорство', 6]].map(([l, p]) => barRow(l, p + '%', (p / 52 * 100) + '%')).join('')}</div>
        <button class="btn solid" data-act="stsec" data-sec="payouts">К выплатам</button></div></div>
    <div class="card glass">${cardH('Самые доходные видео', 'за выбранный период')}
      <div class="trow hd"><span></span><span>Видео</span><span>Просмотры</span><span>Ср. время</span><span style="text-align:right">Доход</span></div>
      ${[['ed', '845 тыс', '5:12', '18 410 ₽'], ['tos', '612 тыс', '6:03', '14 920 ₽'], ['bull', '156 тыс', '6:41', '3 860 ₽']].map(([id, v, a, r]) => `<div class="trow" data-act="watch" data-id="${id}"><img src="${byId(id).img}" alt=""><b class="clamp2">${esc(byId(id).title)}</b><span>${v}</span><span>${a}</span><span class="r">${r}</span></div>`).join('')}</div>`;
}
function stContent() {
  const src = CONTENT[S.cTab].filter(r => !S.deleted[r[0]]), sel = src.filter(r => S.sel[r[0]]), all = src.length > 0 && sel.length === src.length;
  const rows = src.map(([id, title, img, vis0, mon0, date, views, comm, rev]) => {
    const vis = S.vis[id] ?? vis0, mon = S.monV[id] ?? mon0, on = !!S.sel[id], vv = V.find(x => x.id === id);
    return `<div class="crow ${on ? 'sel' : ''}"><div class="ck ${on ? 'on' : ''}" data-act="csel" data-id="${id}">${on ? ic('check') : ''}</div>
      <div class="tt"><img src="${img}" alt="" loading="lazy"><div style="min-width:0"><b class="ell">${esc(title)}</b><span class="ell">${esc(vv ? vv.desc : (vis === 3 ? 'Черновик · обработка 80%' : 'Публикация канала'))}</span></div></div>
      <div class="acts2"><button class="pillb" data-act="cvis" data-id="${id}"><span class="ms" style="color:${VIS[vis][2]}">${VIS[vis][0]}</span>${VIS[vis][1]}</button>
      <button class="pillb mon" data-act="cmon" data-id="${id}" style="background:${mon ? 'rgba(47,182,124,.18)' : 'var(--glass2)'};color:${mon ? '#4fd39a' : 'var(--muted)'}"><span class="ms">${mon ? 'paid' : 'money_off'}</span>${mon ? 'Включена' : 'Выключена'}</button></div>
      <span class="d">${date}</span><span class="n v">${views}</span><span class="n c">${comm}</span><span class="rv">${rev}</span></div>`;
  }).join('');
  return `<div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:12px">${seg('cSeg', ['Видео', 'Токи', 'Посты'], S.cTab, 'ctab', 100)}
    ${sel.length ? `<div class="bulk glass"><b>Выбрано: ${sel.length}</b><button class="btn" data-act="bulk" data-k="pub">${ic('public')}Открыть доступ</button><button class="btn" data-act="bulk" data-k="ads">${ic('money_off')}Отключить рекламу</button><button class="btn" data-act="bulk" data-k="del" style="color:var(--hot)">${ic('delete')}Удалить</button><button class="ibtn sm" data-act="bulk" data-k="clear">${ic('close')}</button></div>` : ''}</div>
    <div class="ctable glass"><div class="crow hd"><div class="ck ${all ? 'on' : ''}" data-act="csel" data-id="*">${all ? ic('check') : ''}</div><span>Публикация</span><span>Доступ</span><span>Реклама</span><span>Дата</span><span>Просмотры</span><span>Комм.</span><span style="text-align:right">Доход</span></div>
    ${rows || `<div class="empty">${ic('inventory_2')}<b>Здесь пока пусто</b></div>`}</div>`;
}
function stAnalytics() {
  const RG = RGS[S.range];
  const tabs = seg('aSeg', ['Охват', 'Вовлечённость', 'Аудитория'], S.aTab, 'atab', 130);
  let b;
  if (S.aTab === 0) b = `<div class="cols2"><div class="card glass">${cardH('Воронка показов', 'как зрители находят видео')}<div class="funnel">${[['Показы значков', fmt(RG.v[0] * 14.8), '100%', 'var(--a32)'], ['Просмотры из показов · CTR 6,8%', fmt(RG.v[0]), '68%', 'var(--a45)'], ['Уникальные зрители', fmt(RG.v[0] * .61), '44%', 'var(--accent)'], ['Досмотрели до конца', fmt(RG.v[0] * .27), '22%', '#4fd39a']].map(([l, v, w, c]) => `<div style="width:${w};background:${c}"><span class="ell">${l}</span><b>${v}</b></div>`).join('')}</div></div>
    <div class="card glass">${cardH('Источники трафика', 'доля просмотров')}<div class="bars">${[['Рекомендации RuYT', 46], ['Поиск', 21], ['Внешние сайты', 12], ['Подписки', 11], ['Токи', 7], ['Плейлисты', 3]].map(([l, p]) => barRow(l, p + '%', (p / 46 * 100) + '%')).join('')}</div></div></div>`;
  else if (S.aTab === 1) b = `<div class="kpis">${[['Средний % просмотра', '46%', '+4% к обычному'], ['Лайки', '12 400', '+18%'], ['Комментарии', '1 284', '+9%'], ['Репосты', '860', '+31%']].map(([l, v, d]) => `<div class="kpi glass" style="cursor:default"><small>${l}</small><b>${v}</b><span>${d}</span></div>`).join('')}</div>
    <div class="cols2" style="grid-template-columns:minmax(0,1fr) minmax(0,.55fr)"><div class="card glass">${cardH('Удержание аудитории', '«Едем на ралли…»')}
      <svg class="retention" viewBox="0 0 600 230" preserveAspectRatio="none"><defs><linearGradient id="rg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".35"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
      <polygon points="${pts([100, 84, 76, 71, 67, 64, 62, 60, 61, 58, 55, 53, 52, 56, 51, 48, 45, 43, 41, 37, 31])} 600,220 0,220" fill="url(#rg)"/><polyline points="${pts([100, 72, 62, 56, 52, 49, 46, 44, 42, 40, 38, 36, 35, 34, 32, 31, 29, 28, 26, 24, 20])}" fill="none" stroke="var(--muted)" stroke-width="2" stroke-dasharray="6 5"/><polyline points="${pts([100, 84, 76, 71, 67, 64, 62, 60, 61, 58, 55, 53, 52, 56, 51, 48, 45, 43, 41, 37, 31])}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linejoin="round"/></svg>
      <div class="row mute" style="gap:18px;font:700 12px Manrope;flex-wrap:wrap"><span class="row" style="gap:6px"><i style="width:16px;height:3px;border-radius:2px;background:var(--accent)"></i>Это видео</span><span class="row" style="gap:6px"><i style="width:16px;border-top:2px dashed var(--muted)"></i>Обычно на канале</span></div></div>
      <div class="card glass">${cardH('Ключевые моменты')}${[['0:42', 'Старт ралли — пик повторных просмотров'], ['4:12', 'Ляп со звуком: зрители перематывают сюда'], ['9:30', 'Первая поломка — удержание растёт'], ['15:05', 'Ночной лагерь — заметный отток']].map(([t, l]) => `<div class="row" style="gap:10px;align-items:flex-start"><b style="padding:3px 8px;border-radius:999px;background:var(--glass2);font:800 11px Manrope;color:var(--accent)">${t}</b><span style="font:600 13px/1.4 Manrope">${l}</span></div>`).join('')}</div></div>`;
  else b = `<div class="cols3"><div class="card glass">${cardH('Возраст')}<div class="agebars">${[['13–17', 6], ['18–24', 28], ['25–34', 34], ['35–44', 19], ['45–54', 9], ['55+', 4]].map(([l, p]) => `<div><span>${p}%</span><i style="height:${p / 34 * 100}%"></i><span>${l}</span></div>`).join('')}</div>
      <b style="font:800 15px Manrope">Пол</b><div class="split" style="height:14px"><i style="width:64%;background:var(--accent)"></i><i style="flex:1;background:#4fd39a"></i></div><div class="row mute" style="justify-content:space-between;font:700 12px Manrope"><span>Мужчины 64%</span><span>Женщины 36%</span></div></div>
    <div class="card glass">${cardH('Города')}<div class="bars">${[['Москва', 24], ['Санкт-Петербург', 12], ['Новосибирск', 5], ['Екатеринбург', 5], ['Казань', 4]].map(([l, p]) => barRow(l, p + '%', (p / 24 * 100) + '%')).join('')}</div></div>
    <div class="card glass">${cardH('Устройства')}${[['smartphone', 'Телефон', '62%'], ['computer', 'Компьютер', '24%'], ['tv', 'Телевизор', '11%'], ['tablet', 'Планшет', '3%']].map(([i, l, p]) => `<div class="row" style="gap:12px;font:700 14px Manrope">${ic(i)}<span class="grow">${l}</span><span class="mute">${p}</span></div>`).join('')}
      <b style="font:800 15px Manrope">Зрители</b><div class="split" style="height:14px"><i style="width:38%;background:#f5c84c"></i><i style="flex:1;background:var(--glass2)"></i></div><div class="row mute" style="justify-content:space-between;font:700 12px Manrope"><span>Постоянные 38%</span><span>Новые 62%</span></div></div></div>`;
  return `<div style="align-self:flex-start;max-width:100%;overflow-x:auto">${tabs}</div>${b}`;
}
function stMonetization() {
  const defs = [['pre', 'smart_display', 'Реклама перед видео', 'Пропуск через 5 секунд'], ['mid', 'splitscreen', 'Реклама в середине', 'Для видео длиннее 8 минут'], ['post', 'last_page', 'Реклама после видео', 'Если зритель досмотрел до конца'], ['overlay', 'picture_in_picture', 'Баннер поверх видео', 'Небольшой баннер внизу плеера'], ['toki', 'bolt', 'Реклама в Токах', 'Между токами в ленте'], ['spon', 'campaign', 'Спонсорские посты', 'Нативные интеграции в «Медиа»'], ['don', 'volunteer_activism', 'Донаты', 'Кнопка под видео и в токах'], ['memb', 'workspace_premium', 'Платное спонсорство', 'Уровни подписки с бонусами']];
  const tiers = [['Зритель', '149 ₽', '312', ['Значок в комментариях', 'Ранний доступ к видео']], ['Фанат', '399 ₽', '96', ['Всё из уровня 1', 'Закрытые стримы', 'Бэкстейджи']], ['Продюсер', '999 ₽', '18', ['Всё из уровня 2', 'Имя в титрах', 'Созвон раз в месяц']]];
  const hints = ['1 вставка на 15 минут · примерно −12% дохода', '1 вставка на 8 минут · рекомендуем', '1 вставка на 5 минут · +9% дохода, удержание −4%'];
  return `<div class="cols2" style="grid-template-columns:minmax(0,1.1fr) minmax(0,1fr)">
    <div class="card glass" style="background:var(--a-glass22)"><div class="row" style="gap:12px"><span class="ms f" style="font-size:30px;color:var(--accent)">verified</span><div class="col" style="gap:2px"><b style="font:800 20px Manrope">Партнёр RuYT</b><span class="mute" style="font:600 13px Manrope">Монетизация подключена с 12 мая 2023</span></div></div>
      <span class="mute" style="font:500 14px/1.55 Manrope">Вы получаете 70% дохода от рекламы, 95% донатов и 85% платных спонсорств.</span>
      <div class="split" style="height:14px"><i style="width:70%;background:var(--fg)"></i><i style="flex:1;background:var(--glass2)"></i></div><div class="row mute" style="justify-content:space-between;font:700 12px Manrope"><span>Вам 70%</span><span>Платформе 30%</span></div>
      ${[['Подписчики · нужно 1 000', '48 200'], ['Часы просмотра за год · нужно 4 000', '12 840 ч']].map(([l, v]) => `<div class="bar"><div class="l"><span>${l}</span><span class="row" style="gap:4px;color:var(--ok)">${ic('check_circle', 'f', 'font-size:16px')}${v}</span></div><div class="t"><i style="width:100%;background:var(--ok)"></i></div></div>`).join('')}</div>
    <div class="card glass">${cardH('Доход на 1000 просмотров', 'RPM по форматам')}<div class="bars">${[['Перед видео', 31], ['В середине', 24], ['Спонсорские посты', 18], ['Токи', 6]].map(([l, v]) => barRow(l, v + ' ₽', (v / 31 * 100) + '%')).join('')}</div>
      <div class="col" style="gap:10px;padding-top:8px;border-top:1px solid var(--line)"><b style="font:800 14px Manrope">Частота рекламы в середине</b>${seg('midSeg', ['Реже', 'Оптимально', 'Чаще'], S.midFreq, 'mid', 110)}<span class="mute" style="font:600 12px Manrope">${hints[S.midFreq]}</span></div></div></div>
    <div class="card glass">${cardH('Форматы рекламы и доходы', 'изменения применяются сразу')}<div class="cols2" style="gap:14px 28px">${defs.map(([k, i, l, h]) => switchRow(k, l, h, S.mon[k])).join('')}</div></div>
    <div class="cols3">${tiers.map(([n, p, m, perks], i) => `<div class="tier glass"><small class="k">Уровень ${i + 1}</small><b>${n}</b><span style="font:800 22px Manrope">${p}<span class="mute" style="font:600 13px Manrope"> / мес</span></span><span class="mute" style="font:600 12px Manrope">${m} участников</span><ul>${perks.map(t => `<li>${ic('check', 'f')}${t}</li>`).join('')}</ul><button class="btn sm" data-act="toast" data-m="Редактор уровня «${n}» откроется в полной версии">Изменить</button></div>`).join('')}
      <div class="card glass"><div class="cardhd"><b>Цель для донатов</b></div><div class="goal" style="background:none;border:0;padding:0;cursor:default"><div class="rg"><span>68%</span></div><div><b>Новая камера</b><small>136 000 ₽ из 200 000 ₽</small></div></div><button class="btn sm" data-act="toast" data-m="Редактирование цели">Изменить цель</button></div></div>`;
}
function stComments() {
  const L = cmLists(), tabs = ['Все', 'Без ответа', 'От спонсоров', 'На проверке'];
  const list = L[S.cmFilter].map(c => {
    const rev = c.review && !S.approved[c.id], he = !!S.hearts[c.id], ans = !!(c.answered || S.replied[c.id]), vv = byId(c.v);
    return `<div class="cmrow glass">${av(c.av, 44)}<div class="b"><span class="n">${esc(c.n)}<span>· ${c.ago}</span>${c.sponsor ? '<span class="tag sp" style="color:var(--warn)">СПОНСОР</span>' : ''}${rev ? '<span class="tag rv" style="color:var(--hot)">НА ПРОВЕРКЕ</span>' : ''}${S.pinned === c.id ? `<span class="tag sp" style="color:var(--accent)">${ic('push_pin', 'f', 'font-size:13px')}ЗАКРЕПЛЁН</span>` : ''}</span><p>${esc(c.t)}</p>
      <div class="acts">${rev ? `<button class="btn" data-act="cmok" data-id="${c.id}">${ic('check')}Одобрить</button>` : `<button class="btn" data-act="cheart" data-id="${c.id}"><span class="ms ${he ? 'f' : ''}" style="color:${he ? 'var(--hot)' : 'inherit'}">favorite</span>${he ? 'Понравилось вам' : 'Нравится'}</button>${ans ? `<span class="mute" style="font:700 12px Manrope;align-self:center;display:flex;gap:4px;align-items:center">${ic('done_all', '', 'font-size:16px')}Отвечено</span>` : `<button class="btn" data-act="creply" data-id="${c.id}">${ic('reply')}Ответить</button>`}<button class="btn" data-act="cpin" data-id="${c.id}">${ic('push_pin')}Закрепить</button>`}<button class="btn" data-act="cdel" data-id="${c.id}" style="color:var(--hot)">${ic('delete')}</button></div>
      ${S.replyOpen === c.id ? `<div class="reply"><input id="replyInp" placeholder="Ваш ответ…"><button class="btn accent sm" data-act="csend" data-id="${c.id}">Отправить</button></div>` : ''}</div>
      <div class="v" data-act="watch" data-id="${c.v}"><img src="${vv.img}" alt=""><span class="clamp2">${esc(vv.title)}</span></div></div>`;
  }).join('');
  return `<div class="row" style="gap:8px;flex-wrap:wrap">${tabs.map((t, i) => `<button class="btn ${i === S.cmFilter ? 'solid' : 'glass'}" data-act="cmf" data-i="${i}" style="height:40px">${t}<span style="padding:2px 8px;border-radius:999px;background:var(--glass2);font:800 11px Manrope">${L[i].length}</span></button>`).join('')}</div>
    ${list || `<div class="empty">${ic('forum')}<b>Здесь пока пусто</b></div>`}`;
}
function stPayouts() {
  const hist = [...(S.payoutReq ? [['2 окт 2026', 'Сентябрь 2026', '41 200 ₽', 'В обработке', 'rgba(245,200,76,.18)', '#f5c84c']] : []), ['15 сен 2026', 'Август 2026', '38 920 ₽'], ['15 авг 2026', 'Июль 2026', '35 410 ₽'], ['15 июл 2026', 'Июнь 2026', '29 870 ₽'], ['15 июн 2026', 'Май 2026', '31 200 ₽']];
  return `<div class="cols2" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)"><div class="card paycard glass" style="background:var(--a-glass26)"><span class="mute" style="font:700 13px Manrope">Доступно к выплате</span><b class="big">41 200 ₽</b><span class="mute" style="font:600 13px Manrope">Следующая автоматическая выплата — 15 октября</span><button class="btn solid lg" data-act="payout">${S.payoutReq ? 'Заявка в обработке' : 'Запросить выплату'}</button></div>
    <div class="card glass">${cardH('Источники дохода', 'за сентябрь')}<div class="bars">${[['Реклама перед видео', '21 460 ₽', 52, 'var(--accent)'], ['Реклама в середине', '8 670 ₽', 21, 'color-mix(in oklch, var(--accent) 50%, #4fd39a)'], ['Донаты', '7 840 ₽', 19, '#f5c84c'], ['Спонсорство', '2 410 ₽', 6, '#4fd39a'], ['Спонсорские посты', '820 ₽', 2, '#ff8fa3']].map(([l, v, p, c]) => barRow(l, v, (p / 52 * 100) + '%', c)).join('')}</div></div></div>
    <div class="card glass">${cardH('История выплат')}${hist.map(([d, p, a, s = 'Выплачено', bg = 'rgba(47,182,124,.18)', c = '#4fd39a']) => `<div class="row" style="gap:14px;padding:12px 0;border-top:1px solid var(--line);flex-wrap:wrap"><span class="mute" style="font:600 13px Manrope;width:100px">${d}</span><b class="grow" style="font:700 14px Manrope;min-width:120px">${p}</b><b style="font:800 15px Manrope">${a}</b><span style="padding:4px 10px;border-radius:999px;background:${bg};color:${c};font:800 11px Manrope">${s}</span></div>`).join('')}
      <div class="row" style="gap:12px;padding-top:12px;border-top:1px solid var(--line)">${ic('credit_card')}<span class="grow" style="font:700 14px Manrope">Способ выплаты · СБП ••• 4821</span><button class="btn sm" data-act="toast" data-m="Смена способа выплаты">Изменить</button></div></div>`;
}
function stBodyHtml() {
  return { overview: stOverview, content: stContent, analytics: stAnalytics, monetization: stMonetization, comments: stComments, payouts: stPayouts }[S.stSec]();
}
function stHead() {
  const cur = ST_DEFS.find(d => d[0] === S.stSec) || ST_DEFS[0];
  const range = (S.stSec === 'overview' || S.stSec === 'analytics') ? seg('rgSeg', ['7 дней', '28 дней', '90 дней'], S.range, 'range', 96) : '';
  return `<div class="sthead"><div><small>${cur[3]}</small><span class="h1">${cur[4]}</span></div>${range}</div>`;
}
function paintStudio(still) {
  const b = $('#stBody'); if (!b) return;
  b.classList.toggle('still', !!still);
  $('#stHead').innerHTML = stHead();
  b.innerHTML = `<div class="sec">${stBodyHtml()}</div>`;
  $$('#stNav .it').forEach(el => el.classList.toggle('on', el.dataset.sec === S.stSec));
}
function pageStudio([sec]) {
  if (sec && ST_DEFS.some(d => d[0] === sec)) S.stSec = sec;
  const badge = () => { const L = cmLists(); return L[1].length + L[3].length; };
  return {
    html: `<div class="studio"><div class="stside glass" id="stNav"><div class="me">${av(CH.me.av, 84)}<b>${esc(CH.me.name)}</b><span>Студия RuYT</span></div>
      ${ST_DEFS.map(([id, icon, label]) => `<div class="it ${id === S.stSec ? 'on' : ''}" data-act="stsec" data-sec="${id}">${ic(icon)}<span class="l">${label}</span>${id === 'comments' && badge() ? `<span class="badge">${badge()}</span>` : ''}</div>`).join('')}
      <hr><div class="it out" data-act="chan" data-ch="me" style="color:var(--muted)">${ic('open_in_new')}<span class="l">Открыть канал</span></div></div>
      <div class="stbody"><div id="stHead">${stHead()}</div><div id="stBody"><div class="sec">${stBodyHtml()}</div></div></div></div>`
  };
}

/* ============================================================
   МОДАЛКИ: донат, загрузка, меню
   ============================================================ */
const AMTS = [100, 300, 500, 1000];
function openDonate(ch, name) {
  const mock = ch && CH[ch], nm = mock ? CH[ch].name : (name || 'автора');
  const head = `<div class="hd">${mock ? av(CH[ch].av, 52) : avi(nm, 52)}<div class="tt"><b>Поддержать автора</b><span>${esc(nm)}</span></div><button class="ibtn sm" data-act="layerclose">${ic('close')}</button></div>`;
  const body = `${head}<div class="amounts" id="amounts">${AMTS.map((a, i) => `<button class="${i === S.amount ? 'on' : ''}" data-act="amount" data-i="${i}">${a} ₽</button>`).join('')}</div>
    <textarea placeholder="Сообщение автору (необязательно)"></textarea><small>95% суммы получит автор, 5% — комиссия платформы.</small>
    <button class="btn accent lg block" data-act="donatego" id="donBtn">Отправить ${AMTS[S.amount]} ₽</button>`;
  showModal(body);
}
function showModal(body, wide) {
  if (isPhone()) openLayer(`<div class="scrim" style="z-index:60;background:rgba(5,6,10,.45)" data-act="layerclose"></div><div class="sheet glass-pop" style="z-index:61"><div class="grab"></div>${body}</div>`, 'sheet');
  else openLayer(`<div class="overlay" data-act="layerclose"><div class="modal glass-pop ${wide ? 'wide' : ''}" data-act="noop">${body}</div></div>`, 'modal');
}
let upType = 0, upOpt = { ads: true, don: true };
function openUpload() {
  const types = ['Видео', 'Ток', 'Пост'];
  const body = `<div class="hd"><div class="tt"><b style="font-size:21px">Новая публикация</b></div><button class="ibtn sm" data-act="layerclose">${ic('close')}</button></div>
    ${seg('upSeg', types, upType, 'uptype')}
    <div class="drop">${ic('cloud_upload')}<b>Перетащите файл сюда</b><span>MP4, MOV до 20 ГБ · или выберите на компьютере</span></div>
    <input class="inp" placeholder="Название">
    ${[['ads', 'Показывать рекламу', 'Вы получаете 70% дохода'], ['don', 'Принимать донаты', 'Кнопка «Донат» под публикацией']].map(([k, l, h]) => `<div class="sw ${upOpt[k] ? 'on' : ''}" data-act="upopt" data-k="${k}"><div class="tx"><b>${l}</b><span>${h}</span></div><div class="trk"></div></div>`).join('')}
    <button class="btn accent lg block" data-act="publish">Опубликовать</button>`;
  showModal(body, true);
}
function closeMenus() { const m = $('#amenu'); if (m) m.remove(); const sc = $('#menuScrim'); if (sc) sc.remove(); }
function openAvatarMenu() {
  if ($('#amenu')) { closeMenus(); return; }
  const light = S.theme === 'light';
  const items = [['account_circle', 'Мой канал', 'chan', 'me'], ['monitoring', 'Студия', 'stsec', ''], ['subscriptions', 'Подписки', 'gosubs', ''], ['add_circle', 'Создать', 'upload', ''], [light ? 'dark_mode' : 'light_mode', light ? 'Тёмная тема' : 'Светлая тема', 'theme', '']];
  const el = document.createElement('div');
  el.innerHTML = `<div id="menuScrim" style="position:fixed;inset:0;z-index:39" data-act="closemenu"></div><div id="amenu" class="amenu glass-pop"><div class="head">${av(CH.me.av, 44)}<div class="col"><b style="font:800 14px Manrope">${esc(CH.me.name)}</b><span class="mute" style="font:600 12px Manrope">${CH.me.handle}</span></div></div>
    ${items.map(([i, l, a, ch]) => `<div class="it" data-act="${a}" data-ch="${ch}" data-sec="overview">${ic(i)}${l}</div>`).join('')}</div>`;
  document.body.append(...el.children);
}

/* ============================================================
   ДОК (десктоп)
   ============================================================ */
function buildDock() {
  const keys = Object.keys(CH).filter(k => S.subs[k] && k !== 'me' && !CH[k].adv);
  const items = [...keys.map(k => ({ name: CH[k].name, av: CH[k].av, isNew: !!CH[k].isNew, act: 'chan', ch: k })), { name: 'Все подписки', all: true, act: 'gosubs' }];
  const max = Math.max(2, Math.floor((innerHeight - 170) / 64));
  const list = items.length > max ? [...items.slice(0, max - 1), items[items.length - 1]] : items;
  const nNew = keys.filter(k => CH[k].isNew).length;
  const dock = $('#dock'), open = dock.classList.contains('fan-open');
  dock.innerHTML = `<div class="it" data-nav="home" data-act="tab" data-tab="video" title="Главная">${ic('home')}<span class="lbl">Главная</span></div>
    <div class="it" data-nav="toki" data-act="tab" data-tab="toki" title="Токи">${ic('bolt')}<span class="lbl">Токи</span></div>
    <div class="it" data-nav="studio" data-act="stsec" data-sec="overview" title="Студия">${ic('monitoring')}<span class="lbl">Студия</span></div>
    <span class="sep"></span>
    <div class="fan-wrap"><div class="fan">${list.map((f, i) => `<div class="fi" style="--i:${i};--n:${list.length}" data-act="${f.act}" data-ch="${f.ch || ''}"><span class="nm glass-pop">${esc(f.name)}${f.isNew ? '<i></i>' : ''}</span>${f.all ? `<span class="all glass-pop">${ic('grid_view')}</span>` : `<img src="${f.av}" alt="">`}</div>`).join('')}</div>
      <div class="it subs-btn" data-act="fan"><div class="mosaic">${keys.slice(0, 4).map(k => `<img src="${CH[k].av}" alt="">`).join('')}</div><span>Подписки</span>${nNew ? `<span class="badge">${nNew}</span>` : ''}${ic('expand_less', 'chev')}</div></div>
    <span class="sep"></span>
    <div class="it me-btn" data-act="chan" data-ch="me"><img src="${CH.me.av}" alt=""><span>Мой канал</span></div>`;
  dock.classList.toggle('fan-open', open);
  syncChrome(parseRoute().name);
}
function toggleFan(force) {
  const dock = $('#dock'); const on = force ?? !dock.classList.contains('fan-open');
  dock.classList.toggle('fan-open', on);
  const sc = $('#fanScrim');
  if (on && !sc) { const d = document.createElement('div'); d.id = 'fanScrim'; d.className = 'scrim'; d.dataset.act = 'fanclose'; document.body.appendChild(d); }
  if (!on && sc) sc.remove();
}

/* ============================================================
   ДЕЙСТВИЯ (делегирование кликов)
   ============================================================ */
function afterSubsChange() {
  paintSubs(); buildDock();
  const sb = $('#storiesBar'); if (sb) sb.outerHTML = storiesHtml();
  if (S.chip === 1 && $('#homeGrid')) $('#homeGrid').innerHTML = homeGridHtml();
  if ($('#subsBody')) $('#subsBody').innerHTML = subsBody();
  if ($('#chHead')) repaintChannel();
}
function paintSubs() {
  $$('[data-act="sub"]').forEach(b => { const on = !!S.subs[b.dataset.ch]; b.classList.toggle('on', on); b.textContent = subLabel(on, b.dataset.short === '1'); });
  $$('[data-act="tsub"]').forEach(b => { const ch = b.dataset.ch, on = !!S.subs[ch] || ch === 'me'; b.classList.toggle('sub', on); b.textContent = tokCta(SH.find(s => s.ch === ch && (b.dataset.ad === '1') === s.ad) || { ch }); });
}
function patchLikes(id) { const el = $('#likes'); if (el) el.innerHTML = likesHtml(getVideo(id)); }
function segThen(id, i, fn) { setSeg(id, i); setTimeout(fn, 230); }
function setSeg(id, i) { const s = $('#' + id); if (!s) return; s.style.setProperty('--i', i); $$('button', s).forEach((b, k) => b.classList.toggle('on', k === i)); }
function copyLink() {
  const url = location.href;
  const done = () => toast('Ссылка скопирована');
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => toast('Не удалось скопировать', true));
  else { try { const t = document.createElement('textarea'); t.value = url; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); done(); } catch { toast('Не удалось скопировать', true); } }
}
const A = {
  noop() {},
  home() { S.chip = 0; go(''); },
  tab(el) { const t = el.dataset.tab; go(t === 'video' ? '' : t); toggleFan(false); },
  watch(el) { if (el.dataset.id) { go('watch/' + encodeURIComponent(el.dataset.id)); } },
  chan(el) {
    const ch = el.dataset.ch; toggleFan(false);
    if (ch === 'nova') return toast('Переход к рекламодателю');
    go('channel/' + ch);
  },
  chsearch(el) { const n = el.dataset.name; if (n) { addRecent(n); S.sTab = 0; go(searchPath(n)); } },
  ad() { toast('Переход к рекламодателю'); },
  adlink() { toast('Переход на сайт рекламодателя'); },
  adskip() { const v = $('#mainVideo'); if (v && v._skipAd) v._skipAd(); },
  vretry() { const v = $('#mainVideo'); if (v && v._start) { $('#pstate').className = 'pstate'; $('#pstate').innerHTML = '<div class="spin"></div>Загружаем видео…'; v._start(); } },
  moment(el) { const v = $('#mainVideo'); if (!v) return; const ad = $('#ad'); if (ad) { ad.remove(); if (v._start && !v.getAttribute('src')) v._start(); } v.currentTime = +el.dataset.t; v.muted = true; v.play().catch(() => {}); },
  retry() { const r = parseRoute(); if (r.name === 'search') { SR.cache.delete(r.args[0]); render(); } },
  stab(el) { S.sTab = +el.dataset.i; setSeg('sSeg', S.sTab); const q = parseRoute().args[0] || ''; $('#sBody').innerHTML = searchBodyHtml(q); },
  chip(el) { S.chip = +el.dataset.i; $$('#chips .chip').forEach((c, i) => c.classList.toggle('on', i === S.chip)); $('#homeGrid').innerHTML = homeGridHtml(); },
  sub(el) { const ch = el.dataset.ch; S.subs[ch] = S.subs[ch] ? 0 : 1; store.set('subs', S.subs); afterSubsChange(); if (S.subs[ch]) toast('Вы подписались на «' + CH[ch].name + '»'); },
  tsub(el) { const ch = el.dataset.ch; if (el.dataset.ad === '1') return toast('Переход к рекламодателю'); if (ch === 'me') return; S.subs[ch] = S.subs[ch] ? 0 : 1; store.set('subs', S.subs); afterSubsChange(); if (S.subs[ch]) toast('Вы подписались на «' + CH[ch].name + '»'); },
  vlike(el) { const id = el.dataset.id; S.vlike[id] = S.vlike[id] === 1 ? 0 : 1; store.set('vlike', S.vlike); patchLikes(id); },
  vdislike(el) { const id = el.dataset.id; S.vlike[id] = S.vlike[id] === -1 ? 0 : -1; store.set('vlike', S.vlike); patchLikes(id); },
  share() { copyLink(); },
  toast(el) { toast(el.dataset.m || 'Готово'); },
  bell(el) { const k = el.dataset.ch; const on = S.bells[k] ?? 1; S.bells[k] = on ? 0 : 1; repaintChannel(); toast(on ? 'Уведомления отключены' : 'Будем присылать все уведомления'); },
  desc() { S.descOpen = !S.descOpen; repaintChannel(); },
  chtab(el) { S.chTab = +el.dataset.i; setSeg('chSeg', S.chTab); $('#chBody').innerHTML = channelBody(S.chan); },
  chsort(el) { S.chSort = +el.dataset.i; $('#chBody').innerHTML = channelBody(S.chan); },
  vote(el) { S.poll[el.dataset.p] = +el.dataset.k; repaintPost(+el.dataset.p); },
  plike(el) { const i = el.dataset.p; S.plikes[i] = !S.plikes[i]; repaintPost(+i); },
  pcm(el) { const i = el.dataset.p; S.openC[i] = !S.openC[i]; repaintPost(+i); },
  gosubs() { toggleFan(false); closeMenus(); go('subs'); },
  gostudio(el) { go('studio/' + (el.dataset.sec || 'overview')); },
  stsec(el) {
    closeMenus(); toggleFan(false);
    const sec = el.dataset.sec || 'overview';
    if (parseRoute().name === 'studio' && $('#stBody')) { S.stSec = sec; paintStudio(false); history.replaceState(null, '', '#/studio/' + sec); curKey = 'studio/' + sec; scrollTo(0, 0); }
    else go('studio/' + sec);
  },
  fan() { toggleFan(); }, fanclose() { toggleFan(false); },
  amenu() { openAvatarMenu(); }, closemenu() { closeMenus(); },
  theme() { setTheme(S.theme === 'light' ? 'dark' : 'light'); closeMenus(); },
  bellnote() { toast('3 новых видео от ваших подписок'); },
  upload() { closeMenus(); openUpload(); },
  donate(el) { openDonate(el.dataset.ch, el.dataset.name); },
  amount(el) { S.amount = +el.dataset.i; $$('#amounts button').forEach((b, i) => b.classList.toggle('on', i === S.amount)); $('#donBtn').textContent = 'Отправить ' + AMTS[S.amount] + ' ₽'; },
  donatego() { closeLayer(); toast('Спасибо! ' + AMTS[S.amount] + ' ₽ отправлено автору'); },
  uptype(el) { upType = +el.dataset.i; setSeg('upSeg', upType); },
  upopt(el) { upOpt[el.dataset.k] = !upOpt[el.dataset.k]; el.classList.toggle('on', upOpt[el.dataset.k]); },
  publish() { closeLayer(); toast('Публикация отправлена на обработку'); },
  layerclose() { closeLayer(); },
  back() { back(); },
  mystory() { toast('Камера для истории откроется в приложении'); },
  story(el) { openStory(+el.dataset.i); },
  storyclose() { closeLayer(); },
  sprev() { storyStep(-1); }, snext() { storyStep(1); }, sprevg() { storyGroup(-1); }, snextg() { storyGroup(1); },
  sauthor(el) { const ch = el.dataset.ch; if (ch) { closeLayer(); go('channel/' + ch); } },
  slink(el) { closeLayer(); go('watch/' + el.dataset.id); },
  slike(el) { const k = el.dataset.key; S.slikes[k] = !S.slikes[k]; el.classList.toggle('liked', !!S.slikes[k]); },
  ssend() { toast('Ответ отправлен'); },
  toki(el) { go('toki/' + el.dataset.i); },
  tlike() { T.liked[T.i] = !T.liked[T.i]; $('#trail').innerHTML = trailHtml(); },
  tpanel() { T.panel = !T.panel; $('#tpanelHost').innerHTML = T.panel ? tokPanelHtml() : ''; $('#trail').innerHTML = trailHtml(); },
  tmute() { T.muted = !T.muted; $$('video[data-short]').forEach(v => { v.muted = T.muted; }); $('#tmute').innerHTML = ic(T.muted ? 'volume_off' : 'volume_up'); },
  tprev() { const sc = $('#tscroll'); sc.scrollBy({ top: -sc.clientHeight, behavior: 'smooth' }); },
  tnext() { const sc = $('#tscroll'); sc.scrollBy({ top: sc.clientHeight, behavior: 'smooth' }); },
  // студия
  range(el) { S.range = +el.dataset.i; segThen('rgSeg', S.range, () => paintStudio(true)); },
  metric(el) { S.metric = +el.dataset.i; paintStudio(true); },
  ctab(el) { S.cTab = +el.dataset.i; S.sel = {}; segThen('cSeg', S.cTab, () => paintStudio(true)); },
  atab(el) { S.aTab = +el.dataset.i; segThen('aSeg', S.aTab, () => paintStudio(false)); },
  csel(el) { const id = el.dataset.id; if (id === '*') { const src = CONTENT[S.cTab].filter(r => !S.deleted[r[0]]); const all = src.every(r => S.sel[r[0]]); S.sel = all ? {} : Object.fromEntries(src.map(r => [r[0], true])); } else S.sel[id] = !S.sel[id]; paintStudio(true); },
  cvis(el) { const id = el.dataset.id, row = CONTENT[S.cTab].find(r => r[0] === id); S.vis[id] = ((S.vis[id] ?? row[3]) + 1) % 4; paintStudio(true); },
  cmon(el) { const id = el.dataset.id, row = CONTENT[S.cTab].find(r => r[0] === id); S.monV[id] = !(S.monV[id] ?? row[4]); paintStudio(true); },
  bulk(el) {
    const ids = CONTENT[S.cTab].map(r => r[0]).filter(id => S.sel[id]), k = el.dataset.k;
    if (k === 'pub') { ids.forEach(id => { S.vis[id] = 0; }); toast('Доступ открыт'); }
    if (k === 'ads') { ids.forEach(id => { S.monV[id] = false; }); toast('Реклама отключена'); }
    if (k === 'del') { ids.forEach(id => { S.deleted[id] = true; }); toast('Публикации удалены'); }
    S.sel = {}; paintStudio(true);
  },
  monsw(el) { const k = el.dataset.k; S.mon[k] = !S.mon[k]; el.classList.toggle('on', S.mon[k]); },
  mid(el) { S.midFreq = +el.dataset.i; segThen('midSeg', S.midFreq, () => paintStudio(true)); },
  cmf(el) { S.cmFilter = +el.dataset.i; paintStudio(true); },
  cheart(el) { S.hearts[el.dataset.id] = !S.hearts[el.dataset.id]; paintStudio(true); },
  cpin(el) { S.pinned = S.pinned === el.dataset.id ? null : el.dataset.id; paintStudio(true); toast('Комментарий закреплён'); },
  cdel(el) { S.removed[el.dataset.id] = true; paintStudio(true); toast('Комментарий удалён'); },
  cmok(el) { S.approved[el.dataset.id] = true; paintStudio(true); },
  creply(el) { S.replyOpen = S.replyOpen === el.dataset.id ? null : el.dataset.id; paintStudio(true); const i = $('#replyInp'); if (i) i.focus(); },
  csend(el) { S.replied[el.dataset.id] = true; S.replyOpen = null; paintStudio(true); toast('Ответ опубликован'); },
  payout() { if (S.payoutReq) return toast('Заявка уже в обработке'); S.payoutReq = true; paintStudio(true); toast('Заявка на выплату 41 200 ₽ создана'); }
};
function repaintPost(i) {
  const el = document.querySelector(`.post[data-p="${i}"]`); if (!el) return;
  const t = document.createElement('div'); t.innerHTML = postHtml(P[i], i); el.replaceWith(t.firstElementChild);
}
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  if (el.dataset.act === 'noop') return;
  const fn = A[el.dataset.act]; if (!fn) return;
  e.preventDefault();
  fn(el, e);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (layerKind) closeLayer(); closeMenus(); toggleFan(false); }
  if (layerKind === 'story') { if (e.key === 'ArrowRight') storyStep(1); if (e.key === 'ArrowLeft') storyStep(-1); }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-act][tabindex]')) { e.preventDefault(); e.target.click(); }
});
// наведение на карточку — превью видео (только демо-карточки, только мышь)
if (matchMedia('(hover:hover)').matches) {
  document.addEventListener('mouseover', e => {
    const c = e.target.closest && e.target.closest('.vcard[data-src]'); if (!c || c.querySelector('video')) return;
    const v = document.createElement('video'); v.muted = true; v.loop = true; v.autoplay = true; v.playsInline = true; v.src = c.dataset.src;
    c.insertBefore(v, c.querySelector('.pill')); v.play().catch(() => {});
  });
  document.addEventListener('mouseout', e => {
    const c = e.target.closest && e.target.closest('.vcard[data-src]'); if (!c || (e.relatedTarget && c.contains(e.relatedTarget))) return;
    const v = c.querySelector('video'); if (v) v.remove();
  });
}
// подсветка столбца графика в студии
document.addEventListener('mouseover', e => {
  const col = e.target.closest && e.target.closest('#chart > div'); if (!col) return;
  const RG = RGS[S.range], { W, sum } = waves(RG), j = +col.dataset.j;
  $$('#chart > div i').forEach((b, k) => { b.style.background = k === j ? 'var(--accent)' : (k === RG.n - 1 ? 'color-mix(in oklch, var(--accent) 75%, transparent)' : 'var(--a32)'); });
  const l = $('#hbLabel'); if (l) l.textContent = dateOf(RG, j) + ': ' + M_FMT[S.metric](RG.v[S.metric] * W[j] / sum);
});
// сломанные картинки: пробуем запасную, иначе прячем
document.addEventListener('error', e => {
  const t = e.target; if (!t || t.tagName !== 'IMG') return;
  if (t.dataset.fb && !t.dataset.fbd) { t.dataset.fbd = 1; t.src = t.dataset.fb; return; }
  t.style.visibility = 'hidden';
}, true);

/* ============================================================
   ТЕМА И ЗАПУСК
   ============================================================ */
function setTheme(t) {
  S.theme = t; store.set('theme', t);
  document.documentElement.dataset.theme = t;
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = t === 'light' ? '#eef0f4' : '#0b0c10';
}
function init() {
  setTheme(S.theme);
  $('#meAv').src = CH.me.av;
  initSearchBox();
  buildDock();
  matchMedia('(min-width:1100px)').addEventListener('change', buildDock);
  render(false);
}
init();
})();
