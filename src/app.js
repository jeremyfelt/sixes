(function () {
'use strict';

const D = window.SIXES_DATA;
const IN_FRAME = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();

/* ================= utilities ================= */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pad2 = n => String(n).padStart(2, '0');
function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffleArr(a, rnd = Math.random) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}
function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
}
const fmtNum = n => Number(n || 0).toLocaleString('en-US');
const fmtShort = n => (n >= 10000 ? (Math.round(n / 100) / 10).toLocaleString('en-US') + 'k' : fmtNum(n));
const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fx(el, cls, ms) {
  if (!el) return;
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  const k = '_fx_' + cls; clearTimeout(el[k]);
  el[k] = setTimeout(() => el.classList.remove(cls), ms);
}
const sortKey = w => w.split('').sort().join('');
// Phones held sideways get a "turn upright" note; clocks pause while it shows.
const ROTATED = window.matchMedia ? window.matchMedia('(orientation: landscape) and (max-height: 520px) and (pointer: coarse)') : { matches: false };
function onMediaChange(mq, fn) { if (mq.addEventListener) mq.addEventListener('change', fn); else if (mq.addListener) mq.addListener(fn); }
// In the installed app, dim the status bar along with the page when a sheet opens.
function dimStatusBar(on) {
  for (const m of document.querySelectorAll('meta[name="theme-color"][data-dim]')) {
    if (!m.dataset.base) m.dataset.base = m.content;
    m.content = on ? m.dataset.dim : m.dataset.base;
  }
}

/* ================= dates ================= */
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const keyOf = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const todayKey = () => keyOf(new Date());
function keyDays(k) { const [y, m, d] = k.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); }
function daysKey(n) { const d = new Date(n * 864e5); return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`; }
const addDays = (k, n) => daysKey(keyDays(k) + n);
function keyDate(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
function untilMidnight(withSeconds) {
  const now = new Date(); const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const s = Math.max(0, Math.floor((next - now) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h ${pad2(m)}m`;
  return withSeconds ? `${m}m ${pad2(s % 60)}s` : `${Math.max(1, m)}m`;
}

/* ================= words ================= */
const VALID = new Set();
const COMMON = [];
for (let i = 0; i < D.valid.length; i += 6) {
  const w = D.valid.substr(i, 6); const up = w.toUpperCase();
  VALID.add(up);
  if (w.charCodeAt(0) < 97) COMMON.push(up);
}
const COMMON_SET = new Set(COMMON);
const ANS = [];
for (let i = 0; i < D.ans.length; i += 6) ANS.push(D.ans.substr(i, 6).toUpperCase());
const TIER = D.tiers;
let ANAGRAMS = null;
function anagramsOf(w) {
  if (!ANAGRAMS) {
    ANAGRAMS = new Map();
    for (const x of COMMON) { const k = sortKey(x); const a = ANAGRAMS.get(k); if (a) a.push(x); else ANAGRAMS.set(k, [x]); }
  }
  return ANAGRAMS.get(sortKey(w)) || [];
}

/* ================= puzzles ================= */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function decode12(s) {
  const out = [];
  for (let i = 0; i < 12; i += 2) out.push(ANS[B64.indexOf(s[i]) * 64 + B64.indexOf(s[i + 1])]);
  return out;
}
const DAILY_N = D.daily.length / 13;
const START_DAYS = keyDays(D.start);
const DIFF_NAME = { 1: 'Gentle', 2: 'Steady', 3: 'Tricky' };
const practiceCount = diff => D.practice[diff].length / 12;
function practicePuzzle(diff, i) {
  const n = practiceCount(diff); const j = ((i % n) + n) % n;
  return { words: decode12(D.practice[diff].substr(j * 12, 12)), diff, i: j };
}
function dailyPuzzle(k) {
  const idx = Math.max(0, keyDays(k) - START_DAYS);
  if (idx < DAILY_N) {
    const s = D.daily.substr(idx * 13, 13);
    return { words: decode12(s.slice(1)), diff: +s[0], no: idx + 1 };
  }
  const diff = [2, 1, 1, 2, 2, 3, 3][keyDate(k).getDay()];
  return { words: practicePuzzle(diff, idx * 7 + 3).words, diff, no: idx + 1 };
}
const diffDots = d => `<span class="diff-dots" aria-hidden="true">${[1, 2, 3].map(i => `<b class="${i <= d ? 'on' : ''}"></b>`).join('')}</span>`;

/* ================= solver =================
   rows[i][letter] = how many unused tiles in row i carry that letter.
   Finds k words that use every remaining tile exactly once (one tile per row each). */
const emptyRows = () => [0, 1, 2, 3, 4, 5].map(() => new Int8Array(26));
function fitsRows(w, rows) {
  for (let i = 0; i < 6; i++) if (rows[i][w.charCodeAt(i) - 65] <= 0) return false;
  return true;
}
function solveExact(rows, k, prefer) {
  if (k === 0) return [];
  const list = COMMON.filter(w => fitsRows(w, rows));
  if (prefer) list.sort((a, b) => (prefer.has(b) ? 1 : 0) - (prefer.has(a) ? 1 : 0));
  let nodes = 0;
  const rec = (pool, left) => {
    if (left === 0) return [];
    if (++nodes > 60000) return null;
    const fit = [];
    for (const w of pool) if (fitsRows(w, rows)) fit.push(w);
    let bi = -1, bc = -1, bn = Infinity;
    for (let i = 0; i < 6; i++) {
      const row = rows[i];
      for (let c = 0; c < 26; c++) {
        if (row[c] <= 0) continue;
        let n = 0;
        for (const w of fit) if (w.charCodeAt(i) - 65 === c) n++;
        if (n === 0) return null;
        if (n < bn) { bn = n; bi = i; bc = c; }
      }
    }
    for (const w of fit) {
      if (w.charCodeAt(bi) - 65 !== bc) continue;
      for (let i = 0; i < 6; i++) rows[i][w.charCodeAt(i) - 65]--;
      const sub = rec(fit, left - 1);
      for (let i = 0; i < 6; i++) rows[i][w.charCodeAt(i) - 65]++;
      if (sub) return [w].concat(sub);
    }
    return null;
  };
  return rec(list, k);
}

/* ================= storage ================= */
const Store = (() => {
  const P = 'sixes:';
  const mem = {};
  let ok = false;
  try { const t = P + '__t'; localStorage.setItem(t, '1'); localStorage.removeItem(t); ok = true; } catch (e) { ok = false; }
  return {
    get(k, d) {
      if (ok) { try { const v = localStorage.getItem(P + k); if (v != null) return JSON.parse(v); } catch (e) { /* fall through */ } }
      return (k in mem) ? JSON.parse(JSON.stringify(mem[k])) : d;
    },
    set(k, v) { mem[k] = v; if (ok) { try { localStorage.setItem(P + k, JSON.stringify(v)); } catch (e) { /* quota or blocked */ } } },
    del(k) { delete mem[k]; if (ok) { try { localStorage.removeItem(P + k); } catch (e) { /* ignore */ } } },
    keys() {
      const out = new Set(Object.keys(mem));
      if (ok) { try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(P)) out.add(k.slice(P.length)); } } catch (e) { /* ignore */ } }
      return [...out];
    },
    dump() { const o = {}; for (const k of this.keys()) o[k] = this.get(k); return o; },
    load(o) { if (!o) return; for (const k in o) if (this.get(k) === undefined) this.set(k, o[k]); },
  };
})();

const Settings = Object.assign({ sound: true, haptics: true }, Store.get('settings', {}));
const saveSettings = () => Store.set('settings', Settings);

/* ================= sound ================= */
const Sound = (() => {
  let ctx = null, master = null;
  const NOTES = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch (e) { /* optional API */ }
    try {
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch (e) { ctx = null; }
  }
  function tone(f, dur, type, vol, when, slideTo) {
    if (!Settings.sound || !ctx || ctx.state !== 'running') return;
    try {
      const t = ctx.currentTime + (when || 0);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'triangle';
      o.frequency.setValueAtTime(f, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.15, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + dur + 0.03);
    } catch (e) { /* ignore */ }
  }
  return {
    unlock,
    tap(r) { tone(NOTES[r % 6], 0.12, 'triangle', 0.14); },
    untap() { tone(392, 0.07, 'triangle', 0.07); },
    lock() {
      NOTES.forEach((f, i) => tone(f, 0.16, 'triangle', 0.12, i * 0.045));
      tone(261.63, 0.55, 'sine', 0.09, 0.27); tone(329.63, 0.55, 'sine', 0.07, 0.27);
    },
    bonus() { tone(1318.5, 0.12, 'sine', 0.12); tone(1975.5, 0.22, 'sine', 0.1, 0.08); },
    bad() { tone(220, 0.16, 'square', 0.045, 0, 160); tone(196, 0.2, 'square', 0.04, 0.07, 140); },
    win() {
      const seq = NOTES.concat(NOTES.map(n => n * 2));
      seq.forEach((f, i) => tone(f, 0.22, 'triangle', 0.1, i * 0.055));
      [523.25, 659.25, 783.99, 1046.5].forEach(f => tone(f, 1.3, 'sine', 0.055, 0.68));
    },
    tick() { tone(1500, 0.035, 'square', 0.03); },
    skip() { tone(440, 0.1, 'triangle', 0.09); tone(330, 0.16, 'triangle', 0.09, 0.08); },
    good(n) { const b = NOTES[n % 6]; tone(b, 0.12, 'triangle', 0.12); tone(b * 1.5, 0.2, 'triangle', 0.1, 0.06); },
    sixer() { NOTES.forEach((f, i) => tone(f * 2, 0.15, 'triangle', 0.1, i * 0.04)); tone(2093, 0.6, 'sine', 0.07, 0.26); },
    end() { tone(659.25, 0.2, 'triangle', 0.1); tone(523.25, 0.2, 'triangle', 0.1, 0.12); tone(392, 0.45, 'triangle', 0.1, 0.24); },
    hint() { tone(880, 0.1, 'sine', 0.1); tone(1174.66, 0.16, 'sine', 0.09, 0.07); },
    shuffle() { [0, 1, 2, 3].forEach(i => tone(600 + i * 90, 0.05, 'triangle', 0.05, i * 0.03)); },
  };
})();

/* ================= haptics =================
   Android: Vibration API. iPhone (iOS 18+): toggling a hidden switch control produces a system tick. */
const Haptic = (() => {
  function iosTick() {
    try {
      const label = document.createElement('label');
      label.setAttribute('aria-hidden', 'true');
      label.style.display = 'none';
      const input = document.createElement('input');
      input.type = 'checkbox'; input.setAttribute('switch', ''); input.tabIndex = -1;
      label.appendChild(input);
      document.head.appendChild(label);
      label.click();
      document.head.removeChild(label);
    } catch (e) { /* unsupported */ }
  }
  const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  return {
    tap() {
      if (!Settings.haptics || !touch) return;
      if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) { /* ignore */ } return; }
      iosTick();
    },
    buzz() {
      if (!Settings.haptics || !touch) return;
      if (navigator.vibrate) { try { navigator.vibrate([14, 50, 14]); } catch (e) { /* ignore */ } return; }
      iosTick();
    },
  };
})();

/* ================= toast + sheet ================= */
const toast = (() => {
  const el = $('#toast'); let t = 0;
  return (html, ms) => {
    el.innerHTML = html;
    el.classList.add('show');
    clearTimeout(t);
    t = setTimeout(() => el.classList.remove('show'), ms || 1700);
  };
})();

const Sheet = (() => {
  const sheet = $('#sheet'), scrim = $('#scrim'), body = $('#sheetBody');
  let onClose = null, isOpen = false, lastFocus = null, gen = 0;
  function show(html, opts) {
    opts = opts || {};
    const prevClose = isOpen ? onClose : null;
    gen++;
    body.innerHTML = html;
    body.scrollTop = 0;
    onClose = opts.onClose || null;
    if (prevClose && prevClose !== onClose) prevClose();
    if (!isOpen) lastFocus = document.activeElement;
    sheet.hidden = false; scrim.hidden = false;
    isOpen = true;
    dimStatusBar(true);
    requestAnimationFrame(() => requestAnimationFrame(() => { sheet.classList.add('open'); scrim.classList.add('open'); }));
    if (opts.bind) opts.bind(body);
    setTimeout(() => { try { $('#sheetClose').focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 60);
  }
  function hide() {
    if (!isOpen) return;
    isOpen = false;
    const my = ++gen;
    sheet.classList.remove('open'); scrim.classList.remove('open');
    dimStatusBar(false);
    setTimeout(() => { if (!isOpen && my === gen) { sheet.hidden = true; scrim.hidden = true; body.innerHTML = ''; } }, 360);
    const cb = onClose; onClose = null;
    if (cb) cb();
    try { if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }
  scrim.addEventListener('click', hide);
  $('#sheetClose').addEventListener('click', hide);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen) { e.preventDefault(); hide(); } });
  // swipe the sheet down to dismiss
  let y0 = null, dy = 0;
  sheet.addEventListener('touchstart', e => {
    if (body.scrollTop > 0 && !e.target.closest('.sheet-grab')) { y0 = null; return; }
    y0 = e.touches[0].clientY; dy = 0;
  }, { passive: true });
  sheet.addEventListener('touchmove', e => {
    if (y0 == null) return;
    dy = e.touches[0].clientY - y0;
    if (dy > 0) { sheet.style.transition = 'none'; sheet.style.transform = `translateY(${dy}px)`; }
  }, { passive: true });
  sheet.addEventListener('touchend', () => {
    if (y0 == null) return;
    sheet.style.transition = ''; sheet.style.transform = '';
    if (dy > 90) hide();
    y0 = null; dy = 0;
  });
  return { show, hide, get open() { return isOpen; } };
})();

/* ================= shared state ================= */
const Book = (() => {
  const set = new Set();
  const s = Store.get('book', '');
  if (typeof s === 'string') for (let i = 0; i + 6 <= s.length; i += 6) set.add(s.substr(i, 6));
  return {
    has: w => set.has(w),
    add(w) { if (set.has(w)) return false; set.add(w); Store.set('book', [...set].join('')); return true; },
    get size() { return set.size; },
    all: () => [...set],
    clear() { set.clear(); },
  };
})();

const getHistory = () => Store.get('history', {});
function streakInfo() {
  const h = getHistory(); const t = todayKey();
  let k = h[t] ? t : addDays(t, -1); let cur = 0;
  while (h[k]) { cur++; k = addDays(k, -1); }
  const meta = Store.get('meta', {});
  return { cur, max: Math.max(meta.maxStreak || 0, cur) };
}
function markPlayed(k) {
  const played = Store.get('played', []);
  if (!played.includes(k)) { played.push(k); Store.set('played', played.slice(-2000)); }
}
async function shareOrCopy(text) {
  if (!IN_FRAME && navigator.share) {
    try { await navigator.share({ text }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(text); toast('Copied to clipboard'); return; } catch (e) { /* fall back to manual copy */ }
  Sheet.show(`<h2 id="sheetTitle">Copy your result</h2><p>Select the text and copy it.</p><textarea class="share-text" id="shareTA" readonly>${esc(text)}</textarea>`, {
    bind: b => { const ta = $('#shareTA', b); setTimeout(() => { try { ta.focus(); ta.select(); } catch (e) { /* ignore */ } }, 120); },
  });
}
function shareURL() {
  if (IN_FRAME) return '';
  return /^https?:$/.test(location.protocol) ? location.origin + location.pathname : '';
}

/* ================= screens ================= */
let current = 'home';
function showScreen(id) {
  ['home', 'board', 'blitz'].forEach(s => {
    const el = $('#scr-' + s);
    if (s === id) { el.hidden = false; el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter'); }
    else el.hidden = true;
  });
  current = id;
  if (id === 'home') renderHome();
}

/* ================= board game (daily + practice) ================= */
const Board = (() => {
  const elBoard = $('#board'), elArea = $('#playArea'), elPreview = $('#preview'), elFound = $('#found');
  const elTimer = $('#boardTimer'), elTitle = $('#boardTitle'), elSub = $('#boardSub');
  const tileEls = [], slotEls = [], labelEls = [], chipEls = [];
  const moving = new Set();
  let G = null, timer = 0, lastTs = 0, ticks = 0, busy = false;

  for (let r = 0; r < 6; r++) {
    const lab = document.createElement('div');
    lab.className = 'row-label'; lab.textContent = r + 1; lab.setAttribute('aria-hidden', 'true');
    lab.style.top = `calc(${r} * var(--step))`;
    elBoard.appendChild(lab); labelEls.push(lab);
  }
  for (let id = 0; id < 36; id++) {
    const b = document.createElement('button');
    b.className = 'tile'; b.dataset.id = id; b.type = 'button';
    b.style.setProperty('--r', (id / 6) | 0);
    b.style.setProperty('--c', id % 6);
    b.innerHTML = '<span class="cap"></span>';
    elBoard.appendChild(b); tileEls.push(b);
  }
  for (let i = 0; i < 6; i++) { const s = document.createElement('div'); s.className = 'slot'; elPreview.appendChild(s); slotEls.push(s); }
  for (let i = 0; i < 6; i++) { const c = document.createElement('div'); c.className = 'chip'; elFound.appendChild(c); chipEls.push(c); }

  const rowOf = id => (id / 6) | 0;
  const letterOf = id => G.words[id % 6][rowOf(id)];
  const lockedCols = () => new Set(G.locked.map(l => l.c));
  const colLocked = c => G.locked.some(l => l.c === c);
  const isLockedTile = id => colLocked(G.grid[rowOf(id)].indexOf(id));

  function remainingRows() {
    const rows = emptyRows(); const lc = lockedCols();
    for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) if (!lc.has(c)) rows[r][letterOf(G.grid[r][c]).charCodeAt(0) - 65]++;
    return rows;
  }
  function wordConsistent(w) {
    const rows = remainingRows();
    if (!fitsRows(w, rows)) return false;
    for (let r = 0; r < 6; r++) rows[r][w.charCodeAt(r) - 65]--;
    const k = 5 - G.locked.length;
    return k <= 0 || !!solveExact(rows, k, null);
  }

  function freshState(words, seed) {
    const rnd = mulberry32(hashStr(seed));
    let grid = null;
    for (let attempt = 0; attempt < 80; attempt++) {
      grid = [];
      for (let r = 0; r < 6; r++) grid.push(shuffleArr([0, 1, 2, 3, 4, 5].map(k => r * 6 + k), rnd));
      let clean = true;
      for (let c = 0; c < 6 && clean; c++) {
        let w = ''; for (let r = 0; r < 6; r++) w += words[grid[r][c] % 6][r];
        if (VALID.has(w)) clean = false;
      }
      if (clean) break;
    }
    return { w: words.join(''), grid, locked: [], bonus: [], hints: 0, hint: null, elapsed: 0, started: false, done: false, finishedAt: 0 };
  }
  function validState(st, words) {
    if (!st || st.w !== words.join('') || !Array.isArray(st.grid) || st.grid.length !== 6) return false;
    for (let r = 0; r < 6; r++) {
      const row = st.grid[r];
      if (!Array.isArray(row) || row.length !== 6) return false;
      const seen = new Set(row);
      for (let k = 0; k < 6; k++) if (!seen.has(r * 6 + k)) return false;
    }
    return Array.isArray(st.locked) && Array.isArray(st.bonus);
  }

  function persist() {
    if (!G) return;
    const st = {
      w: G.words.join(''), grid: G.grid, locked: G.locked, bonus: G.bonus, hints: G.hints, hint: G.hint,
      elapsed: Math.round(G.elapsed * 10) / 10, started: G.started, done: G.done, finishedAt: G.finishedAt || 0,
    };
    if (G.kind === 'daily') Store.set(G.key, st);
    else {
      const P = Store.get('practice', {});
      P.cur = P.cur || {};
      P.cur[G.diff] = { i: G.pi, state: st };
      Store.set('practice', P);
    }
  }

  function load(cfg, st) {
    G = Object.assign({}, st, cfg, { sel: [-1, -1, -1, -1, -1, -1] });
    if (G.hint && !Array.isArray(G.hint.ids)) G.hint.ids = [];
    busy = false; moving.clear();
    elTitle.textContent = cfg.title;
    elSub.innerHTML = cfg.sub;
    applyHintSelection();
    elBoard.classList.add('no-anim');
    render();
    requestAnimationFrame(() => requestAnimationFrame(() => elBoard.classList.remove('no-anim')));
  }

  function openDaily() {
    const k = todayKey(); const p = dailyPuzzle(k);
    const key = 'daily:' + k;
    let st = Store.get(key, null);
    if (!validState(st, p.words)) st = freshState(p.words, 'daily:' + k);
    const d = keyDate(k);
    load({ kind: 'daily', key, dateKey: k, no: p.no, diff: p.diff, words: p.words,
      title: `No. ${p.no}`, sub: `${WEEKDAYS[d.getDay()]} · ${DIFF_NAME[p.diff]}` }, st);
    showScreen('board');
    layout();
    pruneOldDailies(k);
    if (G.done) setTimeout(showResults, 350);
    else if (!Store.get('seenIntro', false)) setTimeout(() => showHowTo(true), 300);
  }

  function openPractice(diff) {
    const P = Store.get('practice', {});
    P.cur = P.cur || {}; P.next = P.next || {}; P.solved = P.solved || {};
    let cur = P.cur[diff];
    let p = null;
    if (cur && cur.state) {
      p = practicePuzzle(diff, cur.i);
      if (cur.state.done || !validState(cur.state, p.words)) cur = null;
    } else cur = null;
    if (!cur) {
      let i = P.next[diff];
      if (typeof i !== 'number') i = Math.floor(Math.random() * practiceCount(diff));
      P.next[diff] = i + 1;
      p = practicePuzzle(diff, i);
      cur = { i: p.i, state: freshState(p.words, `practice:${diff}:${p.i}`) };
      P.cur[diff] = cur;
      Store.set('practice', P);
    }
    load({ kind: 'practice', diff, pi: cur.i, words: p.words, no: cur.i + 1,
      title: 'Practice', sub: `${DIFF_NAME[diff]} · Board ${cur.i + 1}` }, cur.state);
    showScreen('board');
    layout();
    if (!Store.get('seenIntro', false)) setTimeout(() => showHowTo(true), 300);
  }

  function pruneOldDailies(k) {
    const cutoff = keyDays(k) - 14;
    for (const key of Store.keys()) {
      if (key.startsWith('daily:')) { const dk = key.slice(6); if (/^\d{4}-\d\d-\d\d$/.test(dk) && keyDays(dk) < cutoff) Store.del(key); }
    }
  }

  /* ---------- layout + render ---------- */
  function layout() {
    if (!G || current !== 'board') return;
    const w = elArea.clientWidth;
    const gapY = parseFloat(getComputedStyle(elArea).rowGap) || 16;
    const h = elArea.clientHeight - elPreview.offsetHeight - elFound.offsetHeight - 2 * gapY - 8;
    if (!w || h <= 0) return;
    const ratio = 0.13, label = w < 360 ? 12 : 14;
    let t = Math.min((w - 2 * label) / (6 + 5 * ratio), (h - 6) / (6 + 5 * ratio), 72);
    t = Math.max(28, Math.floor(t));
    const gap = Math.max(4, Math.round(t * ratio));
    elBoard.style.setProperty('--tile', t + 'px');
    elBoard.style.setProperty('--gap', gap + 'px');
    elBoard.style.setProperty('--label', label + 'px');
    elBoard.style.setProperty('--lift', (t >= 44 ? 4 : 3) + 'px');
  }
  if (window.ResizeObserver) new ResizeObserver(layout).observe(elArea);
  window.addEventListener('resize', layout);

  function render() {
    if (!G) return;
    const lockIdx = new Map(); G.locked.forEach((l, i) => lockIdx.set(l.c, i));
    const hintIds = new Set(G.hint ? G.hint.ids : []);
    for (let id = 0; id < 36; id++) {
      const el = tileEls[id]; const r = rowOf(id); const c = G.grid[r].indexOf(id);
      el.style.setProperty('--c', c);
      const li = lockIdx.has(c) ? lockIdx.get(c) : -1;
      const sel = G.sel[r] === id;
      let cls = 'tile';
      if (li >= 0) cls += ' locked k' + (li + 1);
      if (sel && li < 0) cls += ' sel';
      if (li < 0 && hintIds.has(id)) cls += ' hinted';
      if (moving.has(id)) cls += ' moving';
      if (el.className !== cls) el.className = cls;
      const cap = el.firstChild; const ch = letterOf(id);
      if (cap.textContent !== ch) cap.textContent = ch;
      el.disabled = li >= 0 || G.done;
      el.setAttribute('aria-label', `Row ${r + 1}, ${ch}${li >= 0 ? ', locked' : sel ? ', selected' : ''}`);
      el.setAttribute('aria-pressed', sel ? 'true' : 'false');
    }
    for (let r = 0; r < 6; r++) {
      const id = G.sel[r]; const ch = id >= 0 ? letterOf(id) : '';
      if (slotEls[r].textContent !== ch) slotEls[r].textContent = ch;
      slotEls[r].classList.toggle('on', id >= 0);
      labelEls[r].classList.toggle('on', id >= 0);
    }
    for (let i = 0; i < 6; i++) {
      const l = G.locked[i]; const c = chipEls[i];
      if (l) {
        const cls = 'chip on k' + (i + 1);
        if (c.className !== cls) c.className = cls;
        const html = esc(l.w) + (l.h ? '<i class="h" aria-label="hinted"></i>' : '');
        if (c.innerHTML !== html) c.innerHTML = html;
      } else {
        if (c.className !== 'chip') c.className = 'chip';
        if (c.textContent !== '· · · · · ·') c.textContent = '· · · · · ·';
      }
    }
    $('#bonusCount').textContent = G.bonus.length;
    $('#btnHint').disabled = G.done;
    $('#btnShuffle').disabled = G.done;
    $('#btnClear').disabled = G.done;
    elTimer.textContent = fmtTime(G.elapsed);
  }

  /* ---------- clock ---------- */
  function startClock() {
    if (!G || G.done) return;
    if (!G.started) { G.started = true; if (G.kind === 'daily') markPlayed(G.dateKey); persist(); }
    if (timer) return;
    lastTs = performance.now();
    timer = setInterval(tick, 250);
  }
  function tick() {
    const now = performance.now();
    if (!G || G.done || document.hidden || current !== 'board' || Sheet.open || ROTATED.matches) { lastTs = now; return; }
    G.elapsed += Math.min(2, (now - lastTs) / 1000);
    lastTs = now;
    elTimer.textContent = fmtTime(G.elapsed);
    if (++ticks % 20 === 0) persist();
  }
  function stopClock() { clearInterval(timer); timer = 0; }

  /* ---------- interactions ---------- */
  function tapTile(id) {
    if (!G || G.done || busy) return;
    if (isLockedTile(id)) return;
    startClock();
    const r = rowOf(id);
    if (G.sel[r] === id) { G.sel[r] = -1; Sound.untap(); }
    else { G.sel[r] = id; Sound.tap(r); fx(slotEls[r], 'pop', 260); }
    Haptic.tap();
    render();
    if (G.sel.every(x => x >= 0)) {
      busy = true;
      setTimeout(() => { busy = false; submit(); }, 150);
    }
  }
  elBoard.addEventListener('click', e => {
    const t = e.target.closest('.tile');
    if (t) tapTile(+t.dataset.id);
  });

  function submit() {
    if (!G || G.done) return;
    const ids = G.sel.slice();
    if (ids.some(x => x < 0)) return;
    const w = ids.map(letterOf).join('');
    if (!VALID.has(w)) return reject(w, ids);
    if (wordConsistent(w)) lockWord(w, ids);
    else bonusWord(w, ids);
  }

  function reject(w, ids) {
    Sound.bad(); Haptic.buzz();
    elPreview.classList.add('bad');
    fx(elPreview, 'shake', 400);
    ids.forEach(id => fx(tileEls[id].firstChild, 'shake', 400));
    toast(`<b>${esc(w)}</b> isn’t in the word list`);
    busy = true;
    setTimeout(() => {
      busy = false;
      elPreview.classList.remove('bad');
      if (!G) return;
      G.sel.fill(-1); applyHintSelection(); render();
    }, 430);
  }

  function bonusWord(w, ids) {
    const fresh = !G.bonus.includes(w);
    if (fresh) G.bonus.push(w);
    const newInBook = Book.add(w);
    Sound.bonus(); Haptic.tap();
    elPreview.classList.add('bonus');
    ids.forEach(id => fx(tileEls[id].firstChild, 'bonus', 650));
    if (!fresh) toast(`<b>${esc(w)}</b> already found`);
    else if (!Store.get('seenBonusTip', false)) {
      Store.set('seenBonusTip', true);
      toast(`<b>${esc(w)}</b> is a bonus word: real, but not one of the six`, 3200);
    } else toast(`Bonus word · <b>${esc(w)}</b>${newInBook ? '<span class="t-tag">NEW</span>' : ''}`);
    busy = true;
    setTimeout(() => {
      busy = false;
      elPreview.classList.remove('bonus');
      if (!G) return;
      G.sel.fill(-1); applyHintSelection(); render(); persist();
    }, 560);
  }

  function lockWord(w, ids) {
    const lc = lockedCols();
    let target = 0;
    while (lc.has(target)) target++;
    for (let r = 0; r < 6; r++) {
      const id = ids[r]; const row = G.grid[r]; const c0 = row.indexOf(id);
      if (c0 !== target) { row[c0] = row[target]; row[target] = id; }
    }
    const hinted = G.hint && G.hint.w === w ? G.hint.n : 0;
    G.locked.push({ c: target, w, h: hinted });
    G.sel.fill(-1);
    if (G.hint && (G.hint.w === w || !wordConsistent(G.hint.w))) G.hint = null;
    Book.add(w);
    Sound.lock(); Haptic.tap();
    ids.forEach(id => moving.add(id));
    applyHintSelection();
    render();
    ids.forEach(id => fx(tileEls[id].firstChild, 'pop', 750));
    setTimeout(() => { ids.forEach(id => moving.delete(id)); render(); }, 420);
    persist();
    if (G.locked.length === 6) { finish(); return; }
    if (G.locked.length === 5) {
      busy = true;
      setTimeout(() => {
        busy = false;
        if (!G || G.done || G.locked.length !== 5) return;
        const lcs = lockedCols(); let c = 0; while (lcs.has(c)) c++;
        for (let r = 0; r < 6; r++) G.sel[r] = G.grid[r][c];
        render();
        busy = true;
        setTimeout(() => { busy = false; submit(); }, 340);
      }, 560);
    }
  }

  function applyHintSelection() {
    const h = G && G.hint;
    if (!h) return;
    const lc = lockedCols();
    h.ids = [];
    for (let r = 0; r < Math.min(6, h.n); r++) {
      const want = h.w[r];
      let id = G.sel[r];
      if (!(id >= 0 && letterOf(id) === want && !lc.has(G.grid[r].indexOf(id)))) {
        id = -1;
        for (let c = 0; c < 6; c++) {
          const t = G.grid[r][c];
          if (!lc.has(c) && letterOf(t) === want) { id = t; break; }
        }
      }
      if (id >= 0) { G.sel[r] = id; h.ids.push(id); }
    }
  }

  function useHint() {
    if (!G || G.done || busy) return;
    startClock();
    if (G.hint && !wordConsistent(G.hint.w)) G.hint = null;
    if (!G.hint) {
      const sol = solveExact(remainingRows(), 6 - G.locked.length, new Set(G.words));
      if (!sol || !sol.length) { toast('No hint available right now'); return; }
      const target = sol.find(x => G.words.includes(x)) || sol[0];
      G.hint = { w: target, n: 0, ids: [] };
    }
    if (G.hint.n >= 6) return;
    G.hint.n++; G.hints++;
    G.sel.fill(-1);
    applyHintSelection();
    Sound.hint(); Haptic.tap();
    render(); persist();
    const shown = G.hint.w.slice(0, G.hint.n);
    toast(`Hint · starts <b>${esc(shown)}</b>`, 1500);
    if (G.hint.n >= 6 && G.sel.every(x => x >= 0)) {
      busy = true;
      setTimeout(() => { busy = false; submit(); }, 320);
    }
  }

  function shuffleBoard() {
    if (!G || G.done || busy) return;
    startClock();
    const lc = lockedCols(); const free = [0, 1, 2, 3, 4, 5].filter(c => !lc.has(c));
    for (let r = 0; r < 6; r++) {
      const ids = free.map(c => G.grid[r][c]);
      shuffleArr(ids);
      free.forEach((c, i) => { G.grid[r][c] = ids[i]; });
    }
    Sound.shuffle(); Haptic.tap();
    render(); persist();
  }

  function clearSel() {
    if (!G || G.done || busy) return;
    G.sel.fill(-1); applyHintSelection();
    Sound.untap(); render();
  }

  function finish() {
    G.done = true; G.finishedAt = Date.now();
    stopClock();
    G.sel.fill(-1); G.hint = null;
    persist();
    if (G.kind === 'daily') {
      const h = getHistory();
      h[G.dateKey] = { t: Math.round(G.elapsed), h: G.hints, b: G.bonus.length, n: G.no };
      Store.set('history', h);
      const s = streakInfo(); const meta = Store.get('meta', {});
      meta.maxStreak = Math.max(meta.maxStreak || 0, s.cur);
      Store.set('meta', meta);
    } else {
      const P = Store.get('practice', {});
      P.solved = P.solved || {};
      P.solved[G.diff] = (P.solved[G.diff] || 0) + 1;
      Store.set('practice', P);
    }
    render();
    busy = true;
    setTimeout(() => {
      Sound.win();
      for (let id = 0; id < 36; id++) fx(tileEls[id].firstChild, 'wave', 1500);
    }, 480);
    setTimeout(() => { busy = false; showResults(); }, 1450);
  }

  /* ---------- results ---------- */
  function shareText() {
    const sq = ['🟥', '🟧', '🟨', '🟩', '🟦', '🟪'];
    const squares = G.locked.map((l, i) => (l.h ? '⬜' : sq[i])).join('');
    const tail = (G.hints ? plural(G.hints, 'hint') : 'No hints') + (G.bonus.length ? ` · ${G.bonus.length} bonus` : '');
    const head = G.kind === 'daily' ? `Sixes No. ${G.no} · ${fmtTime(G.elapsed)}` : `Sixes Practice (${DIFF_NAME[G.diff]}) · ${fmtTime(G.elapsed)}`;
    const lines = [head, squares, tail];
    const url = shareURL(); if (url) lines.push(url);
    return lines.join('\n');
  }

  let countdownT = 0;
  function showResults() {
    if (!G || !G.done) return;
    const perfect = G.hints === 0;
    const titles = perfect ? ['Perfect six.', 'Clean sweep.', 'Flawless.'] : ['Solved.', 'All six.', 'Board cleared.'];
    const title = titles[(G.no || 0) % 3];
    const s = streakInfo();
    const wordChips = G.locked.map((l, i) =>
      `<a class="wchip k${i + 1}" href="https://en.wiktionary.org/wiki/${l.w.toLowerCase()}" target="_blank" rel="noopener">${esc(l.w)}${l.h ? '<span class="tag">HINT</span>' : ''}</a>`).join('');
    const alt = G.locked.filter(l => !G.words.includes(l.w)).length;
    const bonusChips = G.bonus.map(w => `<span class="wchip small">${esc(w)}</span>`).join('');
    const stats = G.kind === 'daily'
      ? `<div class="stat"><span class="v">${G.hints}</span><span class="k">${G.hints === 1 ? 'Hint' : 'Hints'}</span></div>
         <div class="stat"><span class="v">${G.bonus.length}</span><span class="k">${G.bonus.length === 1 ? 'Bonus word' : 'Bonus words'}</span></div>
         <div class="stat"><span class="v">${s.cur}</span><span class="k">Streak</span></div>
         <div class="stat"><span class="v">${s.max}</span><span class="k">Best streak</span></div>`
      : `<div class="stat"><span class="v">${G.hints}</span><span class="k">${G.hints === 1 ? 'Hint' : 'Hints'}</span></div>
         <div class="stat"><span class="v">${G.bonus.length}</span><span class="k">${G.bonus.length === 1 ? 'Bonus word' : 'Bonus words'}</span></div>
         <div class="stat"><span class="v">${(Store.get('practice', {}).solved || {})[G.diff] || 0}</span><span class="k">${DIFF_NAME[G.diff]} solved</span></div>
         <div class="stat"><span class="v">${Book.size}</span><span class="k">Word Book</span></div>`;
    const sub = G.kind === 'daily'
      ? `No. ${G.no} · ${WEEKDAYS[keyDate(G.dateKey).getDay()]} · ${DIFF_NAME[G.diff]}`
      : `Practice · ${DIFF_NAME[G.diff]} · Board ${G.pi + 1}`;
    const actions = G.kind === 'daily'
      ? `<button class="btn" id="rShare"><svg width="20" height="20"><use href="#i-share"/></svg>Share result</button>
         <div class="btn-row"><button class="btn ghost" id="rBlitz">Play Blitz</button><button class="btn ghost" id="rPractice">Practice</button></div>`
      : `<button class="btn" id="rNext">Next ${DIFF_NAME[G.diff]} board</button>
         <div class="btn-row"><button class="btn ghost" id="rShare">Share</button><button class="btn ghost" id="rHome">Menu</button></div>`;
    Sheet.show(`
      <h2 id="sheetTitle">${title}</h2>
      <p class="lead">${sub}</p>
      <div class="big-time">${fmtTime(G.elapsed)}</div>
      <div class="stat-grid">${stats}</div>
      <h3>The six${alt ? ' you found' : ''}</h3>
      <div class="word-chips">${wordChips}</div>
      ${alt ? `<p style="margin-top:10px">You found ${plural(alt, 'word')} the setter didn’t plan on. The intended six were ${G.words.map(esc).join(', ')}.</p>` : ''}
      ${G.bonus.length ? `<h3>Bonus words</h3><div class="word-chips">${bonusChips}</div>` : ''}
      <div class="sheet-actions">${actions}</div>
      ${G.kind === 'daily' ? '<div class="countdown" id="rCountdown"></div>' : ''}
    `, {
      bind: b => {
        const sh = $('#rShare', b); if (sh) sh.addEventListener('click', () => shareOrCopy(shareText()));
        const bl = $('#rBlitz', b); if (bl) bl.addEventListener('click', () => { Sheet.hide(); stopClock(); Blitz.open(); });
        const pr = $('#rPractice', b); if (pr) pr.addEventListener('click', () => { Sheet.hide(); openPractice(G.diff || 2); });
        const nx = $('#rNext', b); if (nx) nx.addEventListener('click', () => { const d = G.diff; Sheet.hide(); openPractice(d); });
        const hm = $('#rHome', b); if (hm) hm.addEventListener('click', () => { Sheet.hide(); leave(); });
        const cd = $('#rCountdown', b);
        if (cd) {
          const upd = () => { cd.textContent = `Next board in ${untilMidnight(true)}`; };
          upd(); clearInterval(countdownT); countdownT = setInterval(() => { if (!document.body.contains(cd)) clearInterval(countdownT); else upd(); }, 1000);
        }
      },
    });
  }

  function showBonus() {
    if (!G) return;
    const list = G.bonus;
    Sheet.show(`<h2 id="sheetTitle">Bonus words</h2>
      <p class="lead">Real six-letter words that don’t belong to this board’s six. Each one goes in your Word Book.</p>
      ${list.length ? `<div class="word-chips">${list.map(w => `<span class="wchip small">${esc(w)}</span>`).join('')}</div>`
        : '<p class="empty-note">None yet. Spell any real word down the rows and it lands here if it isn’t one of the six.</p>'}`);
  }

  function leave() {
    stopClock(); persist();
    showScreen('home');
  }

  $('#boardBack').addEventListener('click', leave);
  $('#btnShuffle').addEventListener('click', shuffleBoard);
  $('#btnClear').addEventListener('click', clearSel);
  $('#btnHint').addEventListener('click', useHint);
  $('#btnBonus').addEventListener('click', showBonus);

  function onKey(e) {
    if (!G || G.done || busy || Sheet.open) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (/^[a-zA-Z]$/.test(k)) {
      const ch = k.toUpperCase();
      const r = G.sel.indexOf(-1); if (r < 0) return;
      const lc = lockedCols();
      for (let c = 0; c < 6; c++) {
        const id = G.grid[r][c];
        if (!lc.has(c) && letterOf(id) === ch) { e.preventDefault(); tapTile(id); return; }
      }
      toast(`No <b>${ch}</b> in row ${r + 1}`, 1100);
    } else if (k === 'Backspace') {
      for (let r = 5; r >= 0; r--) if (G.sel[r] >= 0) { e.preventDefault(); G.sel[r] = -1; Sound.untap(); render(); return; }
    } else if (k === ' ' && !(e.target.closest && e.target.closest('button'))) { e.preventDefault(); shuffleBoard(); }
  }

  return {
    openDaily, openPractice, layout, onKey, showResults, persist,
    pause() { persist(); },
    get active() { return !!G && current === 'board'; },
    get state() { return G; },
  };
})();

/* ================= blitz ================= */
const Blitz = (() => {
  const stage = $('#stage'), msg = $('#blitzMsg'), clock = $('#clock'), fill = $('#clockFill'), secs = $('#clockSecs');
  const scoreEl = $('#blitzScore'), pips = $$('#pips .pip'), pipsLabel = $('#pipsLabel'), overlay = $('#blitzOverlay'), ovCard = $('#blitzOverlayCard');
  const mid = $('.blitz-mid');
  const START = 60000, PLUS = 3000, SKIP = 5000, SIXER = 6000;
  const tiles = [], slots = [];
  let S = null;

  for (let i = 0; i < 6; i++) { const s = document.createElement('div'); s.className = 'bslot'; s.style.setProperty('--i', i); stage.appendChild(s); slots.push(s); }
  for (let i = 0; i < 6; i++) {
    const b = document.createElement('button'); b.className = 'bt'; b.type = 'button'; b.dataset.i = i;
    b.innerHTML = '<span class="cap"></span>';
    stage.appendChild(b); tiles.push(b);
  }

  function layout() {
    if (current !== 'blitz') return;
    const w = stage.parentElement.clientWidth;
    let t = Math.min((w - 5 * 8) / 6, 64);
    t = Math.max(34, Math.floor(t));
    stage.style.setProperty('--tile', t + 'px');
    stage.style.setProperty('--gap', Math.max(5, Math.round(t * 0.14)) + 'px');
  }
  window.addEventListener('resize', layout);

  function best() { return (Store.get('blitz', {}).best) || 0; }

  function open() {
    showScreen('blitz');
    layout();
    S = null;
    $('#blitzSub').textContent = `Best ${fmtNum(best())}`;
    scoreEl.textContent = '0';
    renderClockStatic(START);
    renderPips(0);
    msg.innerHTML = '';
    pipsLabel.textContent = 'Six in a row makes a Sixer';
    tiles.forEach((el, i) => { el.className = 'bt'; el.firstChild.textContent = 'SIXERS'[i]; el.style.setProperty('--x', i); el.style.setProperty('--y', 1); el.disabled = true; });
    showIntro();
  }

  function showIntro() {
    overlay.classList.remove('solid');
    ovCard.innerHTML = `
      <h2>Blitz</h2>
      <p>Unscramble six-letter words before the clock runs out.</p>
      <div class="rules-mini">
        <div><b>60s</b><span>on the clock to start</span></div>
        <div><b>+3s</b><span>for every word you solve</span></div>
        <div><b>−5s</b><span>to skip one you can’t see</span></div>
        <div><b>Sixer</b><span>six solves in a row: +600 points and +6s</span></div>
      </div>
      <button class="btn" id="bStart">Start</button>`;
    overlay.hidden = false;
    $('#bStart').addEventListener('click', start);
    setTimeout(() => { try { $('#bStart').focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 50);
  }

  function start() {
    Sound.unlock();
    overlay.hidden = true;
    const B = Store.get('blitz', {});
    S = {
      running: true, paused: false, timeLeft: START, score: 0, n: 0, streak: 0, run: 0, bestRun: 0, sixers: 0,
      solved: [], skipped: [], used: new Set(), recent: new Set(B.recent || []), word: null, slots: [], tray: [0, 1, 2, 3, 4, 5],
      locked: false, wordStart: 0, lastTs: 0, lastSec: 61, raf: 0, pausedAt: 0,
    };
    scoreEl.textContent = '0';
    renderPips(0);
    tiles.forEach(el => { el.disabled = false; });
    nextWord();
    S.raf = requestAnimationFrame(loop);
  }

  function pickWord() {
    const n = S.n, r = Math.random();
    let tier;
    if (n < 5) tier = 0;
    else if (n < 12) tier = r < 0.6 ? 0 : 1;
    else if (n < 20) tier = r < 0.3 ? 0 : r < 0.8 ? 1 : 2;
    else tier = r < 0.2 ? 0 : r < 0.65 ? 1 : 2;
    const lo = tier === 0 ? 0 : tier === 1 ? TIER[0] : TIER[1];
    const hi = tier === 0 ? TIER[0] : tier === 1 ? TIER[1] : (TIER[2] || ANS.length);
    for (let tries = 0; tries < 80; tries++) {
      const w = ANS[lo + Math.floor(Math.random() * (hi - lo))];
      if (S.used.has(w) || (tries < 50 && S.recent.has(w))) continue;
      return w;
    }
    return ANS[Math.floor(Math.random() * TIER[0])];
  }
  function scramble(w) {
    const L = w.split('');
    let best = null;
    for (let t = 0; t < 50; t++) {
      shuffleArr(L);
      const s = L.join('');
      if (VALID.has(s)) continue;
      let same = 0; for (let i = 0; i < 6; i++) if (s[i] === w[i]) same++;
      if (same <= 1) return L.slice();
      if (!best) best = L.slice();
    }
    return best || L.slice();
  }

  function place() {
    for (let i = 0; i < 6; i++) {
      const el = tiles[i]; const j = S.slots.indexOf(i);
      el.style.setProperty('--x', j >= 0 ? j : S.tray[i]);
      el.style.setProperty('--y', j >= 0 ? 0 : 1);
      el.classList.toggle('in', j >= 0);
      el.setAttribute('aria-label', `${S.word.letters[i]}${j >= 0 ? `, position ${j + 1}` : ''}`);
    }
  }

  function nextWord() {
    if (!S || !S.running) return;
    const w = pickWord();
    S.used.add(w); S.n++;
    S.word = { answer: w, key: sortKey(w), letters: scramble(w) };
    S.slots = []; S.tray = [0, 1, 2, 3, 4, 5]; S.locked = false;
    S.wordStart = performance.now();
    tiles.forEach((el, i) => {
      el.className = 'bt';
      el.style.removeProperty('--k');
      el.firstChild.textContent = S.word.letters[i];
    });
    place();
    tiles.forEach(el => fx(el, 'drop', 520));
    renderPips(S.streak);
  }

  function tap(i) {
    if (!S || !S.running || S.paused || S.locked) return;
    const j = S.slots.indexOf(i);
    if (j >= 0) { S.slots.splice(j, 1); Sound.untap(); }
    else if (S.slots.length < 6) { S.slots.push(i); Sound.tap(S.slots.length - 1); }
    Haptic.tap();
    place();
    if (S.slots.length === 6) { S.locked = true; setTimeout(check, 120); }
  }
  stage.addEventListener('click', e => { const t = e.target.closest('.bt'); if (t) tap(+t.dataset.i); });

  function check() {
    if (!S || !S.running) return;
    const guess = S.slots.map(i => S.word.letters[i]).join('');
    if (VALID.has(guess) && sortKey(guess) === S.word.key) correct(guess);
    else wrong(guess);
  }

  function floatAt(html, cls) {
    const f = document.createElement('div');
    f.className = cls; f.innerHTML = html;
    return f;
  }

  function correct(guess) {
    const secsTaken = (performance.now() - S.wordStart) / 1000;
    S.streak++; S.run++; S.bestRun = Math.max(S.bestRun, S.run);
    let pts = 100 + 25 * S.streak; let quick = false;
    if (secsTaken < 4) { pts += 50; quick = true; }
    S.timeLeft += PLUS;
    S.solved.push(guess);
    const isNew = Book.add(guess);
    const sixer = S.streak >= 6;
    if (sixer) { S.sixers++; pts += 600; S.timeLeft += SIXER; }
    S.score += pts;
    scoreEl.textContent = fmtNum(S.score);
    const color = `var(--c${((S.streak - 1) % 6) + 1})`;
    tiles.forEach(el => { el.style.setProperty('--k', color); el.classList.remove('in'); el.classList.add('good'); });
    stage.appendChild(floatAt(`+${pts}`, 'float-pts'));
    setTimeout(() => { const f = stage.querySelector('.float-pts'); if (f) f.remove(); }, 950);
    bump(`+${(PLUS + (sixer ? SIXER : 0)) / 1000}s`, false);
    const others = anagramsOf(guess).filter(x => x !== guess);
    const parts = [];
    if (quick) parts.push('<b>Quick!</b>');
    if (others.length) parts.push(`also ${others.slice(0, 3).map(esc).join(' · ')}`);
    else if (isNew) parts.push('new in your Word Book');
    msg.innerHTML = parts.join(' &nbsp;·&nbsp; ');
    Sound.good(S.streak - 1); Haptic.tap();
    renderPips(S.streak);
    if (sixer) {
      setTimeout(() => {
        Sound.sixer(); Haptic.buzz();
        const b = floatAt('<span>Sixer!</span>', 'sixer');
        mid.appendChild(b);
        setTimeout(() => b.remove(), 1150);
      }, 160);
      S.streak = 0;
      setTimeout(() => renderPips(0), 1000);
    }
    setTimeout(nextWord, sixer ? 1050 : 560);
  }

  function wrong(guess) {
    Sound.bad(); Haptic.buzz();
    S.slots.forEach(i => fx(tiles[i], 'shake', 420));
    msg.innerHTML = `<b>${esc(guess)}</b> isn’t a word`;
    setTimeout(() => { if (!S) return; S.slots = []; place(); S.locked = false; }, 430);
  }

  function skip() {
    if (!S || !S.running || S.paused || S.locked) return;
    S.locked = true;
    S.timeLeft -= SKIP; S.streak = 0; S.run = 0;
    S.skipped.push(S.word.answer);
    Sound.skip(); Haptic.tap();
    bump(`−${SKIP / 1000}s`, true);
    const used = new Set(); S.slots = [];
    for (const ch of S.word.answer) {
      const i = S.word.letters.findIndex((x, j) => x === ch && !used.has(j));
      used.add(i); S.slots.push(i);
    }
    place();
    tiles.forEach(el => { el.classList.remove('in'); el.classList.add('reveal'); });
    msg.innerHTML = `Skipped · it was <b>${esc(S.word.answer)}</b>`;
    renderPips(0);
    if (S.timeLeft <= 0) { S.timeLeft = 0; renderClock(); setTimeout(end, 700); return; }
    setTimeout(nextWord, 950);
  }

  function shuffleTray() {
    if (!S || !S.running || S.paused || S.locked) return;
    const free = [0, 1, 2, 3, 4, 5].filter(i => !S.slots.includes(i));
    const pos = free.map(i => S.tray[i]);
    for (let t = 0; t < 6; t++) { shuffleArr(pos); if (free.some((i, k) => S.tray[i] !== pos[k])) break; }
    free.forEach((i, k) => { S.tray[i] = pos[k]; });
    Sound.shuffle(); Haptic.tap();
    place();
  }

  function bump(text, minus) {
    const b = document.createElement('span');
    b.className = 'clock-bump' + (minus ? ' minus' : '');
    b.textContent = text;
    clock.appendChild(b);
    setTimeout(() => b.remove(), 950);
  }

  function renderPips(n) {
    pips.forEach((p, i) => p.classList.toggle('on', i < n));
    pipsLabel.textContent = n > 0 && n < 6 ? `${6 - n} more for a Sixer` : 'Six in a row makes a Sixer';
  }
  function renderClockStatic(ms) {
    fill.style.transform = `scaleX(${clamp(ms / START, 0, 1)})`;
    secs.textContent = Math.ceil(ms / 1000);
    clock.classList.toggle('low', ms < 10000);
  }
  function renderClock() { renderClockStatic(S.timeLeft); }

  function loop(ts) {
    if (!S || !S.running) return;
    if (ROTATED.matches && !S.paused) pause();
    if (S.paused || current !== 'blitz') { S.lastTs = ts; S.raf = requestAnimationFrame(loop); return; }
    const dt = S.lastTs ? Math.min(250, ts - S.lastTs) : 0;
    S.lastTs = ts;
    S.timeLeft -= dt;
    if (S.timeLeft <= 0) { S.timeLeft = 0; renderClock(); end(); return; }
    renderClock();
    const sec = Math.ceil(S.timeLeft / 1000);
    if (sec !== S.lastSec) { S.lastSec = sec; if (sec <= 5) Sound.tick(); }
    S.raf = requestAnimationFrame(loop);
  }

  function pause() {
    if (!S || !S.running || S.paused) return;
    S.paused = true; S.pausedAt = performance.now();
    overlay.classList.add('solid');
    ovCard.innerHTML = `
      <h2>Paused</h2>
      <p>${fmtNum(S.score)} points · ${plural(S.solved.length, 'word')} · ${Math.ceil(S.timeLeft / 1000)}s left</p>
      <button class="btn" id="bResume">Resume</button>
      <button class="btn ghost" id="bQuit">End run</button>`;
    overlay.hidden = false;
    $('#bResume').addEventListener('click', resume);
    $('#bQuit').addEventListener('click', () => { overlay.hidden = true; S.paused = false; S.timeLeft = 0; renderClock(); end(); });
  }
  function resume() {
    if (!S || !S.paused) return;
    S.wordStart += performance.now() - S.pausedAt;
    S.paused = false; S.lastTs = 0;
    overlay.hidden = true;
  }

  function end() {
    if (!S || !S.running) return;
    S.running = false;
    cancelAnimationFrame(S.raf);
    tiles.forEach(el => { el.disabled = true; });
    Sound.end(); Haptic.buzz();
    const B = Store.get('blitz', {});
    const prev = B.best || 0;
    B.best = Math.max(prev, S.score);
    B.bestWords = Math.max(B.bestWords || 0, S.solved.length);
    B.bestRun = Math.max(B.bestRun || 0, S.bestRun);
    B.runs = (B.runs || 0) + 1;
    B.total = (B.total || 0) + S.solved.length;
    B.sixers = (B.sixers || 0) + S.sixers;
    B.recent = (B.recent || []).concat([...S.used]).slice(-260);
    B.scores = (B.scores || []).concat([S.score]).slice(-12);
    Store.set('blitz', B);
    $('#blitzSub').textContent = `Best ${fmtNum(B.best)}`;
    msg.innerHTML = '<b>Time!</b>';
    const run = S;
    run.resultsT = setTimeout(() => { if (S === run) results(prev, B, run); }, 650);
  }

  function results(prev, B, run) {
    const isBest = run.score > prev && run.score > 0;
    const title = isBest ? (prev ? 'New best!' : 'First score on the board.') : run.score ? 'Time!' : 'Out of time.';
    const words = run.solved.map((w, i) => `<span class="wchip small k${(i % 6) + 1}">${esc(w)}</span>`).join('');
    const skipped = run.skipped.map(w => `<a class="wchip small" href="https://en.wiktionary.org/wiki/${w.toLowerCase()}" target="_blank" rel="noopener">${esc(w)}</a>`).join('');
    const text = `Sixes Blitz · ${fmtNum(run.score)} points\n${plural(run.solved.length, 'word')} · ${plural(run.sixers, 'Sixer')}${shareURL() ? '\n' + shareURL() : ''}`;
    Sheet.show(`
      <h2 id="sheetTitle">${title}</h2>
      <p class="lead">Blitz · best ${fmtNum(B.best)}</p>
      <div class="big-time">${fmtNum(run.score)}</div>
      <div class="stat-grid">
        <div class="stat"><span class="v">${run.solved.length}</span><span class="k">${run.solved.length === 1 ? 'Word' : 'Words'}</span></div>
        <div class="stat"><span class="v">${run.sixers}</span><span class="k">${run.sixers === 1 ? 'Sixer' : 'Sixers'}</span></div>
        <div class="stat"><span class="v">${run.bestRun}</span><span class="k">Longest run</span></div>
        <div class="stat"><span class="v">${run.skipped.length}</span><span class="k">Skipped</span></div>
      </div>
      ${run.solved.length ? `<h3>Solved</h3><div class="word-chips">${words}</div>` : ''}
      ${run.skipped.length ? `<h3>Skipped</h3><div class="word-chips">${skipped}</div>` : ''}
      <div class="sheet-actions">
        <button class="btn" id="bAgain">Play again</button>
        <div class="btn-row"><button class="btn ghost" id="bShare">Share</button><button class="btn ghost" id="bHome">Menu</button></div>
      </div>`, {
      bind: b => {
        $('#bAgain', b).addEventListener('click', () => { Sheet.hide(); setTimeout(start, 120); });
        $('#bShare', b).addEventListener('click', () => shareOrCopy(text));
        $('#bHome', b).addEventListener('click', () => { Sheet.hide(); leave(); });
      },
      onClose: () => { if (S && !S.running && current === 'blitz') { tiles.forEach(el => { el.disabled = true; }); showAgain(); } },
    });
  }

  function showAgain() {
    overlay.classList.remove('solid');
    ovCard.innerHTML = `<h2>Blitz</h2><p>Best ${fmtNum(best())}</p><button class="btn" id="bStart">Play again</button>`;
    overlay.hidden = false;
    $('#bStart').addEventListener('click', start);
  }

  function leave() {
    if (S && S.running) { S.running = false; cancelAnimationFrame(S.raf); }
    if (S && S.resultsT) clearTimeout(S.resultsT);
    S = null;
    overlay.hidden = true;
    showScreen('home');
  }

  $('#blitzBack').addEventListener('click', () => {
    if (S && S.running && !S.paused && S.solved.length) { pause(); return; }
    leave();
  });
  $('#btnSkip').addEventListener('click', skip);
  $('#btnBShuffle').addEventListener('click', shuffleTray);
  $('#btnPause').addEventListener('click', () => (S && S.paused ? resume() : pause()));

  function onKey(e) {
    if (!S || !S.running || Sheet.open) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (S.paused) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); resume(); } return; }
    const k = e.key;
    if (/^[a-zA-Z]$/.test(k)) {
      const ch = k.toUpperCase();
      const cands = [0, 1, 2, 3, 4, 5].filter(i => !S.slots.includes(i) && S.word.letters[i] === ch).sort((a, b) => S.tray[a] - S.tray[b]);
      if (cands.length) { e.preventDefault(); tap(cands[0]); }
    } else if (k === 'Backspace') {
      if (S.slots.length && !S.locked) { e.preventDefault(); tap(S.slots[S.slots.length - 1]); }
    } else if (k === ' ' && !(e.target.closest && e.target.closest('button'))) { e.preventDefault(); shuffleTray(); }
    else if (k === 'Escape') { e.preventDefault(); pause(); }
    else if (k === 'Tab' && e.shiftKey === false && e.target === document.body) { /* keep default focus order */ }
  }

  return { open, onKey, layout, autoPause() { if (S && S.running && !S.paused) pause(); }, get running() { return !!(S && S.running); } };
})();

/* ================= home ================= */
function renderHome() {
  const k = todayKey(); const d = keyDate(k);
  $('#homeDate').textContent = `${WEEKDAYS[d.getDay()]} · ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const p = dailyPuzzle(k);
  let st = Store.get('daily:' + k, null);
  if (st && st.w !== p.words.join('')) st = null;
  $('#dcNo').textContent = `Daily · No. ${p.no}`;
  $('#dcDiff').innerHTML = `${diffDots(p.diff)} ${DIFF_NAME[p.diff]}`;
  const mini = $('#dailyMini');
  if (!mini.children.length) for (let i = 0; i < 36; i++) mini.appendChild(document.createElement('i'));
  const locked = st ? st.locked || [] : [];
  for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) {
    const li = locked.findIndex(l => l.c === c);
    mini.children[r * 6 + c].className = li >= 0 ? 'k' + (li + 1) : '';
  }
  const s = streakInfo();
  $('#dcStreak').innerHTML = `Streak <b>${s.cur}</b>${s.max > s.cur ? ` · best ${s.max}` : ''}`;
  let title, status, cta;
  if (st && st.done) {
    title = st.hints ? 'Solved' : 'Perfect six';
    status = `${fmtTime(st.elapsed)} · ${st.hints ? plural(st.hints, 'hint') : 'no hints'}. Next board in ${untilMidnight()}.`;
    cta = 'Results';
  } else if (st && st.started) {
    title = `${locked.length} of 6 found`;
    status = `Paused at ${fmtTime(st.elapsed)}. The clock only runs while you play.`;
    cta = 'Continue';
  } else {
    title = `${WEEKDAYS[d.getDay()]}’s Six`;
    status = 'Six words hide in 36 tiles. Find all six.';
    cta = 'Play';
  }
  $('#dcTitle').textContent = title;
  $('#dcStatus').textContent = status;
  $('#dcCta').textContent = cta;
  const B = Store.get('blitz', {});
  $('#blitzBest').textContent = B.best ? fmtNum(B.best) : '—';
  const P = Store.get('practice', {}); const solved = P.solved || {};
  [1, 2, 3].forEach(i => {
    const cur = P.cur && P.cur[i] && P.cur[i].state;
    const going = cur && cur.started && !cur.done;
    $('#pc' + i).textContent = going ? 'in progress' : `${solved[i] || 0} solved`;
  });
  $('#bookCount').textContent = fmtNum(Book.size);
  $('#bookSub').textContent = Book.size ? 'Browse every word you’ve found' : 'Every word you find, kept';
}

/* ================= sheets: how to, stats, settings, book ================= */
function showHowTo(fromGame) {
  const demo = [['M', 'R', 'B', 'T'], ['A', 'I', 'O', 'E'], ['C', 'S', 'N', 'L'], ['P', 'K', 'D', 'U'], ['E', 'A', 'I', 'O'], ['S', 'N', 'T', 'Y']];
  const pick = [1, 2, 0, 1, 0, 2];
  const demoHTML = demo.map((row, r) => `<span>${r + 1}</span>` + row.map((ch, c) => `<i class="${pick[r] === c ? 's' : ''}">${ch}</i>`).join('')).join('');
  Sheet.show(`
    <h2 id="sheetTitle">How to play</h2>
    <p class="lead">Every board hides six six-letter words. All 36 tiles belong to exactly one of them.</p>
    <div class="demo" aria-hidden="true">${demoHTML}</div>
    <div class="demo-caption">One tile per row spells R·O·C·K·E·T</div>
    <div class="how-steps">
      <div class="how-step"><span class="n">1</span><p>Each row holds one letter from every word. <span>Row 1 has the six first letters, row 6 the six last.</span></p></div>
      <div class="how-step"><span class="n">2</span><p>Tap one tile in each row to spell a word top to bottom. <span>It checks itself once all six rows are picked.</span></p></div>
      <div class="how-step"><span class="n">3</span><p>Words that fit lock into a column and take a color. <span>Find all six to clear the board.</span></p></div>
      <div class="how-step"><span class="n">4</span><p>Real words that don’t fit are bonus words. <span>They’re saved to your Word Book.</span></p></div>
      <div class="how-step"><span class="n">5</span><p>Stuck? Shuffle the rows or take a hint. <span>Each hint reveals the next letter of a word.</span></p></div>
      <div class="how-step"><span class="n">6</span><p>A new daily board arrives at midnight. <span>Solve it each day to build your streak.</span></p></div>
    </div>
    <h3>Blitz</h3>
    <p>Unscramble six-letter words against a 60-second clock. Each solve adds 3 seconds, a skip costs 5, and six solves in a row is a Sixer worth 600 points and 6 more seconds.</p>
    <div class="sheet-actions"><button class="btn" id="howGo">${fromGame ? 'Start playing' : 'Got it'}</button></div>
  `, {
    bind: b => { $('#howGo', b).addEventListener('click', () => Sheet.hide()); },
    onClose: () => Store.set('seenIntro', true),
  });
}

function showStats() {
  const h = getHistory(); const keys = Object.keys(h).sort();
  const played = Store.get('played', []).length || keys.length;
  const s = streakInfo();
  const times = keys.map(k => h[k].t);
  const bestT = times.length ? Math.min(...times) : 0;
  const avgT = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
  const perfect = keys.filter(k => !h[k].h).length;
  const t = todayKey();
  let recent = '';
  for (let i = 13; i >= 0; i--) {
    const k = addDays(t, -i);
    recent += `<i class="${h[k] ? 'k' + ((keyDays(k) % 6) + 1) : ''}${i === 0 ? ' today' : ''}" title="${k}"></i>`;
  }
  const last = keys.slice(-10);
  const maxT = Math.max(60, ...last.map(k => h[k].t));
  const bars = last.map(k => `<div class="bar-col${h[k].t === bestT ? ' best' : ''}"><i style="height:${Math.max(4, (h[k].t / maxT) * 74)}px"></i><span>${fmtTime(h[k].t)}</span></div>`).join('');
  const B = Store.get('blitz', {});
  const P = Store.get('practice', {}); const ps = P.solved || {};
  const scores = B.scores || [];
  const maxS = Math.max(1, ...scores);
  const sbars = scores.map(v => `<div class="bar-col${v === B.best ? ' best' : ''}"><i style="height:${Math.max(4, (v / maxS) * 74)}px"></i><span>${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v}</span></div>`).join('');
  const d0 = keyDate(addDays(t, -13));
  Sheet.show(`
    <h2 id="sheetTitle">Stats</h2>
    <h3>Daily</h3>
    <div class="stat-grid">
      <div class="stat"><span class="v">${played}</span><span class="k">Played</span></div>
      <div class="stat"><span class="v">${keys.length}</span><span class="k">Solved</span></div>
      <div class="stat"><span class="v">${s.cur}</span><span class="k">Streak</span></div>
      <div class="stat"><span class="v">${s.max}</span><span class="k">Best streak</span></div>
    </div>
    <div class="stat-grid three" style="margin-top:8px">
      <div class="stat"><span class="v">${times.length ? fmtTime(bestT) : '—'}</span><span class="k">Fastest</span></div>
      <div class="stat"><span class="v">${times.length ? fmtTime(avgT) : '—'}</span><span class="k">Average</span></div>
      <div class="stat"><span class="v">${perfect}</span><span class="k">No-hint solves</span></div>
    </div>
    <h3>Last 14 days</h3>
    <div class="recent">${recent}</div>
    <div class="recent-labels"><span>${d0.getDate()} ${MONTHS[d0.getMonth()]}</span><span>Today</span></div>
    ${last.length ? `<h3>Recent solve times</h3><div class="bars">${bars}</div>` : ''}
    <h3>Blitz</h3>
    <div class="stat-grid">
      <div class="stat"><span class="v">${B.best ? fmtShort(B.best) : '—'}</span><span class="k">Best score</span></div>
      <div class="stat"><span class="v">${B.bestWords || 0}</span><span class="k">Most words</span></div>
      <div class="stat"><span class="v">${B.sixers || 0}</span><span class="k">Sixers</span></div>
      <div class="stat"><span class="v">${B.runs || 0}</span><span class="k">Runs</span></div>
    </div>
    ${scores.length > 1 ? `<h3>Recent Blitz scores</h3><div class="bars">${sbars}</div>` : ''}
    <h3>Practice</h3>
    <div class="stat-grid three">
      <div class="stat"><span class="v">${ps[1] || 0}</span><span class="k">Gentle</span></div>
      <div class="stat"><span class="v">${ps[2] || 0}</span><span class="k">Steady</span></div>
      <div class="stat"><span class="v">${ps[3] || 0}</span><span class="k">Tricky</span></div>
    </div>
  `);
}

function showSettings() {
  const row = (id, title, sub, on) => `<button class="setting" id="${id}" role="switch" aria-checked="${on}"><span><span class="s-title">${title}</span><br><span class="s-sub">${sub}</span></span><span class="switch" aria-checked="${on}"></span></button>`;
  Sheet.show(`
    <h2 id="sheetTitle">Settings</h2>
    <div class="settings-list">
      ${row('setSound', 'Sound', 'Soft tones for taps and finds. Follows your silent switch.', Settings.sound)}
      ${row('setHaptics', 'Haptics', 'A light tap on supported phones.', Settings.haptics)}
      <button class="setting" id="setReset"><span><span class="s-title danger">Erase progress</span><br><span class="s-sub" id="resetSub">Clears streaks, stats, boards and your Word Book on this device.</span></span></button>
    </div>
    <p class="about">Sixes · version 1.0<br>Word lists adapted from ENABLE (public domain) and SCOWL. Progress is stored on this device only.</p>
  `, {
    bind: b => {
      const toggle = (id, key) => {
        const el = $('#' + id, b);
        el.addEventListener('click', () => {
          Settings[key] = !Settings[key]; saveSettings();
          el.setAttribute('aria-checked', Settings[key]);
          el.querySelector('.switch').setAttribute('aria-checked', Settings[key]);
          if (key === 'sound' && Settings.sound) { Sound.unlock(); Sound.tap(2); }
          if (key === 'haptics' && Settings.haptics) Haptic.tap();
        });
      };
      toggle('setSound', 'sound'); toggle('setHaptics', 'haptics');
      let armed = false;
      $('#setReset', b).addEventListener('click', () => {
        const sub = $('#resetSub', b);
        if (!armed) { armed = true; sub.textContent = 'Tap again to erase everything. This can’t be undone.'; return; }
        for (const k of Store.keys()) Store.del(k);
        Book.clear();
        Object.assign(Settings, { sound: true, haptics: true });
        Sheet.hide();
        renderHome();
        toast('Progress erased');
      });
    },
  });
}

function showBook(letter) {
  const all = Book.all().sort();
  const by = {}; for (const w of all) (by[w[0]] = by[w[0]] || []).push(w);
  const counts = Object.values(by).map(a => a.length);
  const max = Math.max(1, ...counts);
  let cur = letter || (all.length ? all[0][0] : null);
  const rare = all.filter(w => !COMMON_SET.has(w));
  const level = n => (!n ? '' : n / max > 0.66 ? 'l3' : n / max > 0.33 ? 'l2' : 'l1');
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const grid = letters.map(L => `<button data-l="${L}" class="${level((by[L] || []).length)}${L === cur ? ' cur' : ''}" ${by[L] ? '' : 'disabled'} aria-label="${L}, ${(by[L] || []).length} words"><b>${L}</b><small>${(by[L] || []).length}</small></button>`).join('');
  const list = L => {
    if (!L || !by[L]) return '<p class="empty-note">Words you find in any mode land here, sorted by first letter.</p>';
    return `<div class="word-chips">${by[L].map(w => `<a class="wchip small" href="https://en.wiktionary.org/wiki/${w.toLowerCase()}" target="_blank" rel="noopener">${esc(w)}${COMMON_SET.has(w) ? '' : '<span class="tag">RARE</span>'}</a>`).join('')}</div>`;
  };
  Sheet.show(`
    <h2 id="sheetTitle">Word Book</h2>
    <p class="lead">${all.length ? `${plural(all.length, 'word')} collected${rare.length ? `, ${rare.length} of them rare` : ''}. Tap a word to look it up.` : 'Every six-letter word you find in any mode is kept here.'}</p>
    <div class="alpha" id="alpha">${grid}</div>
    <div class="book-list" id="bookList">${list(cur)}</div>
  `, {
    bind: b => {
      $('#alpha', b).addEventListener('click', e => {
        const btn = e.target.closest('button[data-l]'); if (!btn || btn.disabled) return;
        cur = btn.dataset.l;
        $$('#alpha button', b).forEach(x => x.classList.toggle('cur', x === btn));
        $('#bookList', b).innerHTML = list(cur);
      });
    },
  });
}

/* ================= wiring ================= */
$('#dailyCard').addEventListener('click', () => Board.openDaily());
$('#blitzCard').addEventListener('click', () => Blitz.open());
$('#practiceSeg').addEventListener('click', e => { const b = e.target.closest('button[data-diff]'); if (b) Board.openPractice(+b.dataset.diff); });
$('#bookCard').addEventListener('click', () => showBook());
$('#btnHow').addEventListener('click', () => showHowTo(false));
$('#btnStats').addEventListener('click', showStats);
$('#btnSettings').addEventListener('click', showSettings);

document.addEventListener('keydown', e => {
  if (current === 'board') Board.onKey(e);
  else if (current === 'blitz') Blitz.onKey(e);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { Board.persist(); Blitz.autoPause(); }
  else if (current === 'home') renderHome();
});
window.addEventListener('pagehide', () => Board.persist());
onMediaChange(ROTATED, e => { if (e.matches) { Board.persist(); Blitz.autoPause(); } });
document.addEventListener('touchstart', () => {}, { passive: true });
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
const unlockAudio = () => Sound.unlock();
document.addEventListener('touchend', unlockAudio, { passive: true });
document.addEventListener('click', unlockAudio);
setInterval(() => { if (current === 'home' && !document.hidden) renderHome(); }, 30000);

/* ================= boot ================= */
function start(hotData) {
  if (hotData && hotData.store) Store.load(hotData.store);
  showScreen('home');
}
const hot = window.claude && window.claude.hot;
if (hot && typeof hot.snapshot === 'function') { try { hot.snapshot(() => ({ store: Store.dump() })); } catch (e) { /* viewer hook optional */ } }
if (hot && typeof hot.ready === 'function') hot.ready(start);
else start((hot && hot.data) || {});

window.__sixes = { dailyPuzzle, practicePuzzle, todayKey, VALID, COMMON, board: () => Board.state };
})();
