'use strict';
/* =====================================================================
   Tagwerk – Kalender · Erinnerungen · Tagesplan
   Alles läuft lokal im Browser, Daten liegen im localStorage des Geräts.
   ===================================================================== */

// ---------- kleine Helfer ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const toLocal = d => `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const parseLocal = s => { const [a, b = '00:00'] = s.split('T'); const [y, m, d] = a.split('-').map(Number); const [h, mi] = b.split(':').map(Number); return new Date(y, m - 1, d, h || 0, mi || 0); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const toMin = hhmm => { if (!hhmm) return 0; const [h, m] = String(hhmm).split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const hm = min => { min = Math.round(min); return `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`; };
const minOf = d => d.getHours() * 60 + d.getMinutes();
const todayStr = () => ymd(new Date());
const roundUp = (m, step) => Math.ceil(m / step) * step;
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const WD_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const COLORS = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#007aff', '#5856d6', '#af52de', '#ff2d55', '#a2845e', '#8e8e93'];
const H = 52; // Pixel pro Stunde im Zeitraster

const I = {
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 12h.01M12 12h.01M16 12h.01"/></svg>',
  send: '<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  spark: '<svg viewBox="0 0 24 24"><path d="M12 2.5l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/><path d="M19 15l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>',
  tray: '<svg viewBox="0 0 24 24"><path d="M4 13h4l2 3h4l2-3h4M5 5h14l1 8v6H4v-6z"/></svg>',
  flag: '<svg viewBox="0 0 24 24"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 7"/></svg>',
  list: '<svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/></svg>',
};

// ---------- Speicher ----------
const KEY = 'tagwerk.v1';
function defaults() {
  return {
    settings: {
      dayStart: '07:00', dayEnd: '22:00', breakMin: 10, defaultTaskMin: 30, weekStart: 1, theme: 'system',
      defaultEventMin: 60, showTimetable: true, apiKey: '', model: 'claude-opus-5-5', aiEffort: 'low',
      googleClientId: '', defaultCal: 'personal', defaultList: 'inbox', defaultView: 'month',
      lessonTimes: ['07:50-08:40', '08:45-09:35', '09:50-10:40', '10:45-11:35', '11:40-12:30', '12:35-13:25', '13:30-14:20', '14:25-15:15', '15:20-16:10'],
    },
    calendars: [
      { id: 'personal', name: 'Privat', color: '#007aff', visible: true, source: 'local' },
      { id: 'school', name: 'Schule', color: '#ff9500', visible: true, source: 'local' },
      { id: 'sport', name: 'Training & Hobbys', color: '#34c759', visible: true, source: 'local' },
    ],
    events: [], timetable: [],
    lists: [
      { id: 'inbox', name: 'Erinnerungen', color: '#007aff' },
      { id: 'school', name: 'Schule', color: '#ff9500' },
    ],
    reminders: [], plans: {}, ver: 0,
  };
}
let S;
function load() {
  const d = defaults();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw) { S = { ...d, ...raw, settings: { ...d.settings, ...(raw.settings || {}) } }; return; }
  } catch (e) { console.warn(e); }
  S = d;
}
function save() {
  S.ver = (S.ver || 0) + 1;
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Speichern fehlgeschlagen – Speicher voll?'); }
}
load();

const calById = id => S.calendars.find(c => c.id === id);
const listById = id => S.lists.find(l => l.id === id);
const calColor = id => calById(id)?.color || '#8e8e93';

// ---------- UI-Zustand ----------
const ui = {
  tab: (() => { try { return localStorage.getItem('tagwerk.tab') || 'calendar'; } catch { return 'calendar'; } })(),
  cal: { view: S.settings.defaultView || 'month', cursor: new Date(), sel: todayStr(), scrollTo: true },
  rem: { screen: 'home', id: null, search: '', recent: {} },
  plan: { date: todayStr(), busy: false },
};

function toast(msg, ms = 2400) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
}
function applyTheme() {
  const t = S.settings.theme;
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = t;
}

// =====================================================================
//  Wiederholungen & Termin-Instanzen
// =====================================================================
function nthWeekday(y, m, wd, nth, h, mi) {
  const first = new Date(y, m, 1);
  if (nth > 0) {
    const day = 1 + ((wd - first.getDay() + 7) % 7) + (nth - 1) * 7;
    const d = new Date(y, m, day, h, mi);
    return d.getMonth() === first.getMonth() ? d : null;
  }
  const last = new Date(y, m + 1, 0);
  const day = last.getDate() - ((last.getDay() - wd + 7) % 7) + (nth + 1) * 7;
  const d = new Date(y, m, day, h, mi);
  return d.getMonth() === first.getMonth() ? d : null;
}

function expand(ev, from, to) {
  const s0 = parseLocal(ev.start), e0 = parseLocal(ev.end);
  const dur = Math.max(0, e0 - s0);
  const r = ev.rrule;
  if (!r) return (s0 < to && (e0 > from || (+e0 === +s0 && s0 >= from))) ? [[s0, e0]] : [];
  const out = [], ex = new Set(ev.exdates || []);
  const until = r.until ? parseLocal(r.until) : null;
  const interval = r.interval || 1, max = r.count || Infinity;
  let count = 0;
  const push = s => {
    if (until && s > until) return false;
    if (count >= max || s >= to) return false;
    count++;
    const e = new Date(s.getTime() + dur);
    if (e > from && !ex.has(ymd(s))) out.push([s, e]);
    return true;
  };
  const Hh = s0.getHours(), M = s0.getMinutes();
  if (r.freq === 'DAILY') {
    let i = 0;
    if (!r.count) { const skip = Math.floor((from - s0 - dur) / 864e5 / interval) - 1; if (skip > 0) i = skip; }
    for (let guard = 0; guard < 20000; i++, guard++) {
      if (!push(new Date(s0.getFullYear(), s0.getMonth(), s0.getDate() + i * interval, Hh, M))) break;
    }
  } else if (r.freq === 'WEEKLY') {
    const days = (r.byday && r.byday.length ? r.byday : [s0.getDay()]).slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    const wk = addDays(startOfDay(s0), -((s0.getDay() + 6) % 7));
    let w = 0;
    if (!r.count) { const skip = Math.floor((from - wk - dur) / (7 * 864e5 * interval)) - 1; if (skip > 0) w = skip; }
    outer: for (let guard = 0; guard < 6000; w++, guard++) {
      for (const wd of days) {
        const s = new Date(wk.getFullYear(), wk.getMonth(), wk.getDate() + w * 7 * interval + ((wd + 6) % 7), Hh, M);
        if (s < s0) continue;
        if (!push(s)) break outer;
      }
    }
  } else if (r.freq === 'MONTHLY') {
    for (let i = 0; i < 2400; i++) {
      const y = s0.getFullYear(), m = s0.getMonth() + i * interval;
      let s;
      if (r.nth && r.byday?.length) s = nthWeekday(y, m, r.byday[0], r.nth, Hh, M);
      else { s = new Date(y, m, s0.getDate(), Hh, M); if (s.getDate() !== s0.getDate()) s = null; }
      if (!s || s < s0) continue;
      if (!push(s)) break;
    }
  } else if (r.freq === 'YEARLY') {
    for (let i = 0; i < 300; i++) {
      const s = new Date(s0.getFullYear() + i * interval, s0.getMonth(), s0.getDate(), Hh, M);
      if (s.getMonth() !== s0.getMonth()) continue;
      if (!push(s)) break;
    }
  }
  return out;
}

let instCache = { key: '', list: [] };
function instances(from, to, includeHidden = false) {
  const key = `${S.ver}|${+from}|${+to}|${includeHidden}`;
  if (instCache.key === key) return instCache.list;
  const out = [];
  for (const ev of S.events) {
    const cal = calById(ev.calendarId);
    if (!includeHidden && cal && cal.visible === false) continue;
    for (const [s, e] of expand(ev, from, to)) out.push({ ev, s, e, color: cal?.color || '#8e8e93' });
  }
  instCache = { key, list: out };
  return out;
}
function byDay(from, to) {
  const map = {};
  for (const it of instances(from, to)) {
    let d = startOfDay(it.s);
    if (d < from) d = startOfDay(from);
    for (let g = 0; d < to && g < 400; g++, d = addDays(d, 1)) {
      const dEnd = addDays(d, 1);
      const overlaps = it.s < dEnd && (it.e > d || (+it.e === +it.s && it.s >= d));
      if (!overlaps) { if (d >= it.e) break; continue; }
      (map[ymd(d)] ||= []).push(it);
    }
  }
  return map;
}
const dayInstances = date => { const d = parseYmd(date); return byDay(d, addDays(d, 1))[date] || []; };

// ---------- Stundenplan ----------
function isFreeDay(date) {
  return dayInstances(date).some(i => i.ev.allDay && /ferien|schulfrei|frei\b|feiertag|urlaub|autonom/i.test(i.ev.title));
}
function lessonsOn(date) {
  const wd = parseYmd(date).getDay();
  return S.timetable.filter(l => +l.wd === wd && l.start && l.end).sort((a, b) => toMin(a.start) - toMin(b.start));
}
function schoolBlocks(date) {
  if (!S.timetable.length || isFreeDay(date)) return [];
  const blocks = [];
  for (const l of lessonsOn(date)) {
    const s = toMin(l.start), e = toMin(l.end), last = blocks.at(-1);
    if (last && s - last.e <= 20) { last.e = Math.max(last.e, e); last.subjects.push(l.subject); }
    else blocks.push({ s, e, subjects: [l.subject] });
  }
  blocks.forEach(b => b.subjects = b.subjects.filter(Boolean));
  return blocks;
}

// =====================================================================
//  Rendering
// =====================================================================
const view = $('#view');
function render() {
  $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === ui.tab));
  const keep = view.scrollTop;
  if (ui.tab === 'calendar') view.innerHTML = renderCalendar();
  else if (ui.tab === 'reminders') view.innerHTML = renderReminders();
  else view.innerHTML = renderPlan();
  if (ui.tab === 'calendar' && (ui.cal.view === 'week' || ui.cal.view === 'day')) {
    if (ui.cal.scrollTo) { view.scrollTop = 7 * H; ui.cal.scrollTo = false; } else view.scrollTop = keep;
  } else if (render.keepScroll) view.scrollTop = keep;
  render.keepScroll = false;
  if (ui.tab === 'plan') { const log = $('.chat-log'); if (log) log.scrollTop = log.scrollHeight; }
}

// ---------- Kalender ----------
function calHead(extra = '') {
  const v = ui.cal.view;
  return `<div class="sticky-head">
    <div class="topbar">
      <div class="left"><button class="icon-btn" data-act="settings" aria-label="Einstellungen">${I.gear}</button>
        <button class="link" data-act="calendars">Kalender</button></div>
      <div class="right"><button class="link" data-act="calToday">Heute</button>
        <button class="icon-btn" data-act="newEvent" aria-label="Neues Ereignis">${I.plus}</button></div>
    </div>
    <div class="seg">${[['day', 'Tag'], ['week', 'Woche'], ['month', 'Monat'], ['list', 'Liste']].map(([k, l]) =>
      `<button class="${v === k ? 'on' : ''}" data-act="calView" data-v="${k}">${l}</button>`).join('')}</div>
    ${extra}
  </div>`;
}
function navRow(label) {
  return `<div class="cal-nav"><button data-act="calPrev" aria-label="Zurück">‹</button><div class="month-label">${label}</div><button data-act="calNext" aria-label="Weiter">›</button></div>`;
}
function startOfWeek(d) {
  const wd = (d.getDay() - S.settings.weekStart + 7) % 7;
  return addDays(startOfDay(d), -wd);
}
function renderCalendar() {
  const v = ui.cal.view;
  if (v === 'month') return monthView();
  if (v === 'week') return weekView();
  if (v === 'day') return dayView();
  return listView();
}
function emptyHint() {
  if (S.events.length || S.timetable.length) return '';
  return `<div class="hint-card">
    <b>Willkommen bei Tagwerk 👋</b>
    <p>Hol dir zuerst deine Termine aus Google und trag deinen Stundenplan ein.</p>
    <div class="hint-actions"><button class="btn secondary" data-act="calendars">Google-Kalender importieren</button>
    <button class="btn secondary" data-act="timetable">Stundenplan eintragen</button></div>
  </div>`;
}
function monthView() {
  const cur = ui.cal.cursor, y = cur.getFullYear(), m = cur.getMonth();
  const first = new Date(y, m, 1), last = new Date(y, m + 1, 0), gs = startOfWeek(first);
  const lead = Math.round((first - gs) / 864e5);
  const total = Math.ceil((lead + last.getDate()) / 7) * 7;
  const map = byDay(gs, addDays(gs, total));
  const today = todayStr();
  const wdOrder = [...Array(7)].map((_, i) => WD[(i + S.settings.weekStart) % 7]);
  let cells = '';
  for (let i = 0; i < total; i++) {
    const d = addDays(gs, i), k = ymd(d), list = map[k] || [];
    const cols = [...new Set(list.map(x => x.color))];
    if (S.settings.showTimetable && schoolBlocks(k).length) cols.push(calColor('school'));
    const dots = [...new Set(cols)].slice(0, 3).map(c => `<i style="background:${c}"></i>`).join('');
    const cls = ['mday', d.getMonth() !== m && 'other', k === today && 'today', k === ui.cal.sel && 'sel', (d.getDay() % 6 === 0) && 'weekend'].filter(Boolean).join(' ');
    cells += `<button class="${cls}" data-act="pickDay" data-date="${k}"><span class="num">${d.getDate()}</span><span class="dots">${dots}</span></button>`;
  }
  const label = first.toLocaleDateString('de-AT', { month: 'long', year: 'numeric' });
  const sel = parseYmd(ui.cal.sel);
  return calHead(navRow(label) + `<div class="weekdays">${wdOrder.map(w => `<div>${w}</div>`).join('')}</div>`) +
    `<div class="month-grid" data-swipe="1">${cells}</div>
     <div class="day-title">${WD_LONG[sel.getDay()]}, ${sel.toLocaleDateString('de-AT', { day: 'numeric', month: 'long' })}</div>
     ${dayAgenda(ui.cal.sel)}${emptyHint()}`;
}
function agendaItems(date) {
  const list = dayInstances(date).map(it => ({ kind: 'event', it }));
  if (S.settings.showTimetable) for (const b of schoolBlocks(date)) list.push({ kind: 'school', b });
  const key = x => x.kind === 'school' ? x.b.s : (x.it.ev.allDay ? -1 : (ymd(x.it.s) < date ? 0 : minOf(x.it.s)));
  return list.sort((a, b) => key(a) - key(b));
}
function dayAgenda(date) {
  const items = agendaItems(date);
  if (!items.length) return `<div class="empty">Keine Ereignisse</div>`;
  return `<div class="day-list">${items.map(x => {
    if (x.kind === 'school') return `<button class="ev-row" data-act="timetable"><div class="t"><b>${hm(x.b.s)}</b>${hm(x.b.e)}</div><div class="bar" style="background:${calColor('school')}"></div>
      <div class="info"><div class="ti">Schule</div><div class="sub">${esc(x.b.subjects.join(' · ') || 'Stundenplan')}</div></div></button>`;
    const { ev, s, e, color } = x.it;
    const startsToday = ymd(s) === date, endsToday = ymd(e) === date || (ymd(addDays(e, -1)) === date && minOf(e) === 0);
    const t = ev.allDay ? `<b>ganztägig</b>` : `<b>${startsToday ? hm(minOf(s)) : '00:00'}</b>${endsToday && minOf(e) ? hm(minOf(e)) : (endsToday ? '24:00' : '…')}`;
    const sub = [ev.location, ev.rrule ? '↻ wiederholt sich' : '', ev.fixed === false ? 'flexibel' : ''].filter(Boolean).join(' · ');
    return `<button class="ev-row" data-act="openEvent" data-id="${ev.id}" data-date="${ymd(s)}"><div class="t">${t}</div><div class="bar" style="background:${color}"></div>
      <div class="info"><div class="ti">${esc(ev.title)}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div></button>`;
  }).join('')}</div>`;
}
function weekView() {
  const ws = startOfWeek(ui.cal.cursor);
  const dates = [...Array(7)].map((_, i) => ymd(addDays(ws, i)));
  const we = addDays(ws, 6);
  const label = ws.getMonth() === we.getMonth()
    ? ws.toLocaleDateString('de-AT', { month: 'long', year: 'numeric' })
    : `${ws.toLocaleDateString('de-AT', { month: 'short' })} – ${we.toLocaleDateString('de-AT', { month: 'short', year: 'numeric' })}`;
  return calHead(navRow(label) + gridHead(dates)) + timeGrid(dates);
}
function dayView() {
  const sel = parseYmd(ui.cal.sel), ws = startOfWeek(sel), today = todayStr();
  const strip = [...Array(7)].map((_, i) => {
    const d = addDays(ws, i), k = ymd(d);
    return `<button class="${k === today ? 'today' : ''} ${k === ui.cal.sel ? 'sel' : ''}" data-act="gotoDay" data-date="${k}">${WD[d.getDay()]}<b>${d.getDate()}</b></button>`;
  }).join('');
  const label = `${WD_LONG[sel.getDay()]}, ${sel.toLocaleDateString('de-AT', { day: 'numeric', month: 'long', year: 'numeric' })}`;
  return calHead(`<div class="day-strip">${strip}</div>` + navRow(label) + gridHead([ui.cal.sel], true)) + timeGrid([ui.cal.sel]);
}
function gridHead(dates, single = false) {
  const gtc = `44px repeat(${dates.length}, 1fr)`, today = todayStr();
  const d0 = parseYmd(dates[0]), map = byDay(d0, addDays(d0, dates.length));
  const head = single ? '' : `<div class="wk-head" style="grid-template-columns:${gtc}"><div></div>${dates.map(k => {
    const d = parseYmd(k); return `<button class="${k === today ? 'today' : ''}" data-act="gotoDay" data-date="${k}">${WD[d.getDay()]}<b>${d.getDate()}</b></button>`;
  }).join('')}</div>`;
  const anyAll = dates.some(k => (map[k] || []).some(i => i.ev.allDay));
  const allday = anyAll ? `<div class="allday-row" style="grid-template-columns:${gtc}"><div class="ad-lbl">ganzt.</div>${dates.map(k =>
    `<div>${(map[k] || []).filter(i => i.ev.allDay).map(i => `<div class="chip" style="background:${i.color}" data-act="openEvent" data-id="${i.ev.id}" data-date="${ymd(i.s)}">${esc(i.ev.title)}</div>`).join('')}</div>`).join('')}</div>` : '';
  return head + allday;
}
function layoutCol(items) {
  items.sort((a, b) => a.sMin - b.sMin || b.eMin - a.eMin);
  const clusters = []; let cur = [], end = -1;
  for (const it of items) {
    if (cur.length && it.sMin >= end) { clusters.push(cur); cur = []; end = -1; }
    cur.push(it); end = Math.max(end, it.eMin);
  }
  if (cur.length) clusters.push(cur);
  for (const cl of clusters) {
    const lanes = [];
    for (const it of cl) {
      let l = lanes.findIndex(e => e <= it.sMin);
      if (l < 0) { l = lanes.length; lanes.push(0); }
      lanes[l] = it.eMin; it.lane = l;
    }
    cl.forEach(it => it.lanes = lanes.length);
  }
  return items;
}
function timeGrid(dates) {
  const gtc = `44px repeat(${dates.length}, 1fr)`, today = todayStr();
  const d0 = parseYmd(dates[0]), map = byDay(d0, addDays(d0, dates.length));
  const hours = [...Array(24)].map((_, h) => `<div>${h ? pad(h) + ':00' : ''}</div>`).join('');
  const cols = dates.map(k => {
    const day = parseYmd(k), next = addDays(day, 1);
    const items = (map[k] || []).filter(i => !i.ev.allDay).map(i => ({
      sMin: i.s < day ? 0 : minOf(i.s), eMin: i.e >= next ? 1440 : minOf(i.e), title: i.ev.title, sub: i.ev.location,
      color: i.color, act: `data-act="openEvent" data-id="${i.ev.id}" data-date="${ymd(i.s)}"`,
    }));
    if (S.settings.showTimetable && !isFreeDay(k)) for (const l of lessonsOn(k)) items.push({
      sMin: toMin(l.start), eMin: toMin(l.end), title: l.subject || 'Stunde', sub: l.room, color: calColor('school'), lesson: true, act: 'data-act="timetable"',
    });
    layoutCol(items);
    const blocks = items.map(it => {
      const top = it.sMin / 60 * H, h = Math.max(it.eMin - it.sMin, 20) / 60 * H - 2;
      const w = 100 / it.lanes;
      return `<div class="block ${it.lesson ? 'timetable' : ''}" ${it.act} style="top:${top}px;height:${h}px;left:calc(${it.lane * w}% + 1px);width:calc(${w}% - 3px);right:auto;background:${it.color}2e;border-color:${it.color}">
        <b>${esc(it.title)}</b>${h > 34 ? `<span>${hm(it.sMin)}${it.sub ? ' · ' + esc(it.sub) : ''}</span>` : ''}</div>`;
    }).join('');
    const now = k === today ? `<div class="now-line" style="top:${minOf(new Date()) / 60 * H}px"></div>` : '';
    return `<div class="col" data-act="slot" data-date="${k}" style="height:${24 * H}px">${blocks}${now}</div>`;
  }).join('');
  return `<div class="grid-wrap" data-swipe="1" style="grid-template-columns:${gtc}"><div class="hours">${hours}</div>${cols}</div>`;
}
function listView() {
  const from = startOfDay(new Date()), to = addDays(from, 90);
  const map = byDay(from, to);
  let html = '';
  for (let d = from; d < to; d = addDays(d, 1)) {
    const k = ymd(d), items = agendaItems(k);
    if (!(map[k] || []).length && !items.length) continue;
    html += `<div class="list-day">${k === todayStr() ? 'Heute · ' : ''}${WD_LONG[d.getDay()]}, ${d.toLocaleDateString('de-AT', { day: 'numeric', month: 'long' })}</div>${dayAgenda(k)}`;
  }
  return calHead() + (html || `<div class="empty">In den nächsten 90 Tagen ist nichts eingetragen.</div>`) + emptyHint();
}

// ---------- Erinnerungen ----------
function dueLabel(due, time) {
  if (!due) return '';
  const t = todayStr(), d = parseYmd(due);
  let s;
  if (due === t) s = 'Heute';
  else if (due === ymd(addDays(new Date(), 1))) s = 'Morgen';
  else if (due === ymd(addDays(new Date(), -1))) s = 'Gestern';
  else s = d.toLocaleDateString('de-AT', { weekday: 'short', day: 'numeric', month: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
  return time ? `${s}, ${time}` : s;
}
const isOverdue = r => !r.done && r.due && (r.due < todayStr() || (r.due === todayStr() && r.time && toMin(r.time) < minOf(new Date())));
const visibleDone = r => r.done && ui.rem.recent[r.id] && Date.now() - ui.rem.recent[r.id] < 1600;

function smartSets() {
  const t = todayStr(), open = S.reminders.filter(r => !r.done);
  return {
    today: open.filter(r => r.due && r.due <= t),
    scheduled: open.filter(r => r.due),
    all: open,
    flagged: open.filter(r => r.flagged),
    done: S.reminders.filter(r => r.done),
  };
}
const SMART = {
  today: { name: 'Heute', color: '#007aff', icon: I.cal },
  scheduled: { name: 'Geplant', color: '#ff3b30', icon: I.clock },
  all: { name: 'Alle', color: '#5b5b60', icon: I.tray },
  flagged: { name: 'Markiert', color: '#ff9500', icon: I.flag },
  done: { name: 'Erledigt', color: '#8e8e93', icon: I.check },
};
function renderReminders() {
  const r = ui.rem;
  if (r.screen === 'list') return remListScreen(r.id);
  if (r.screen === 'smart') return remSmartScreen(r.id);
  const sets = smartSets();
  const q = r.search.trim().toLowerCase();
  let body;
  if (q) {
    const res = S.reminders.filter(x => (x.title + ' ' + (x.notes || '')).toLowerCase().includes(q));
    body = `<div class="group">${res.map(x => remRow(x, { showList: true })).join('') || '<div class="empty">Keine Treffer</div>'}</div>`;
  } else {
    body = `<div class="smart-grid">${Object.entries(SMART).map(([k, v]) => `
      <button class="smart" data-act="openSmart" data-id="${k}"><span class="ico" style="background:${v.color}">${v.icon}</span><span class="n">${k === 'done' ? '' : sets[k].length}</span><span class="l">${v.name}</span></button>`).join('')}</div>
      <div class="group-title" style="font-size:20px;font-weight:700;color:var(--text);text-transform:none;padding-left:20px">Meine Listen</div>
      <div class="group">${S.lists.map(l => `<button class="cell" data-act="openList" data-id="${l.id}"><span class="ico" style="background:${l.color}">${I.list}</span>
        <span class="grow">${esc(l.name)}</span><span class="val">${S.reminders.filter(x => x.listId === l.id && !x.done).length}</span><span class="chev">›</span></button>`).join('')}</div>`;
  }
  return `<div class="sticky-head"><div class="topbar"><div class="left"><button class="icon-btn blue" data-act="settings">${I.gear}</button></div>
      <div class="right"><button class="link blue" data-act="newList">Liste hinzufügen</button></div></div></div>
    <div class="search">🔍<input type="search" placeholder="Suchen" value="${esc(r.search)}" data-input="remSearch"></div>
    ${body}
    <div class="bottom-actions"><button class="add-row" data-act="newRem"><span class="plus">+</span>Neue Erinnerung</button></div>`;
}
function remRow(r, o = {}) {
  const list = listById(r.listId), c = list?.color || '#007aff';
  const meta = [];
  if (r.due) meta.push(`<span class="${isOverdue(r) ? 'late' : ''}">${dueLabel(r.due, r.time)}</span>`);
  if (r.duration) meta.push(`<span>⏱ ${r.duration} min</span>`);
  if (o.showList && list) meta.push(`<span>${esc(list.name)}</span>`);
  if (r.notes) meta.push(`<span>${esc(r.notes.split('\n')[0].slice(0, 60))}</span>`);
  const prio = r.priority ? `<span class="prio">${'!'.repeat(r.priority)}</span>` : '';
  return `<div class="rem ${r.done ? 'done' : ''}" style="--c:${c}">
    <button class="circle ${r.done ? 'on' : ''}" data-act="toggleRem" data-id="${r.id}" aria-label="Erledigt"></button>
    <div class="body" data-act="editRem" data-id="${r.id}"><div class="title">${prio}${esc(r.title)}</div>${meta.length ? `<div class="meta">${meta.join('')}</div>` : ''}</div>
    ${r.flagged ? '<span class="flag">⚑</span>' : ''}
    <button class="info-btn" data-act="editRem" data-id="${r.id}" aria-label="Details">${I.info}</button></div>`;
}
function remBack(right = '') {
  return `<div class="sticky-head"><div class="topbar"><div class="left"><button class="link blue" data-act="remHome">‹ Listen</button></div><div class="right">${right}</div></div></div>`;
}
function remListScreen(id) {
  const l = listById(id); if (!l) { ui.rem.screen = 'home'; return renderReminders(); }
  const items = S.reminders.filter(r => r.listId === id && (!r.done || l.showDone || visibleDone(r)))
    .sort((a, b) => (a.done - b.done) || (a.createdAt - b.createdAt));
  return remBack(`<button class="icon-btn blue" data-act="editList" data-id="${id}">${I.more}</button>`) +
    `<h1 class="list-title" style="color:${l.color}">${esc(l.name)}</h1>
    <div class="rem-list" style="--c:${l.color}">${items.map(r => remRow(r)).join('')}<div id="quick-slot"></div></div>
    <button class="add-row" style="--c:${l.color}" data-act="quickAdd" data-list="${id}"><span class="plus">+</span>Neue Erinnerung</button>
    ${S.reminders.some(r => r.listId === id && r.done) ? `<button class="link blue small-link" data-act="toggleShowDone" data-id="${id}">${l.showDone ? 'Erledigte ausblenden' : 'Erledigte anzeigen'}</button>` : ''}`;
}
function remSmartScreen(k) {
  const sm = SMART[k], sets = smartSets();
  let items = k === 'done' ? sets.done.slice().sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''))
    : S.reminders.filter(r => (sets[k].includes(r) || visibleDone(r) && (k === 'all' || (k === 'flagged' && r.flagged) || (r.due && (k === 'scheduled' || r.due <= todayStr())))));
  let html = '';
  if (k === 'scheduled' || k === 'today') {
    items.sort((a, b) => (a.due || '').localeCompare(b.due || '') || (a.time || '').localeCompare(b.time || ''));
    if (k === 'scheduled') {
      const groups = {};
      items.forEach(r => (groups[r.due] ||= []).push(r));
      html = Object.entries(groups).map(([d, rs]) => `<div class="list-day">${dueLabel(d)}</div>${rs.map(r => remRow(r, { showList: true })).join('')}`).join('');
    } else html = items.map(r => remRow(r, { showList: true })).join('');
  } else if (k === 'all') {
    html = S.lists.map(l => {
      const rs = items.filter(r => r.listId === l.id);
      return `<div class="list-day" style="color:${l.color}">${esc(l.name)}</div>${rs.map(r => remRow(r)).join('') || '<div class="empty small">Keine Erinnerungen</div>'}`;
    }).join('');
  } else html = items.map(r => remRow(r, { showList: true })).join('');
  const quick = k !== 'done' ? `<div id="quick-slot"></div><button class="add-row" style="--c:${sm.color}" data-act="quickAdd" data-smart="${k}"><span class="plus">+</span>Neue Erinnerung</button>` : '';
  return remBack() + `<h1 class="list-title" style="color:${sm.color}">${sm.name}</h1>
    <div class="rem-list">${html || `<div class="empty">${k === 'done' ? 'Noch nichts erledigt' : 'Keine Erinnerungen'}</div>`}${quick}</div>`;
}
function newReminder(o = {}) {
  return {
    id: uid(), listId: o.listId || (listById(S.settings.defaultList) ? S.settings.defaultList : S.lists[0]?.id), title: o.title || '', notes: o.notes || '',
    due: o.due || null, time: o.time || null, priority: o.priority || 0, flagged: !!o.flagged, done: false, doneAt: null,
    duration: o.duration || null, createdAt: Date.now(),
  };
}

// =====================================================================
//  Tagesplan – Planungslogik
// =====================================================================
function getPlan(date) {
  return (S.plans[date] ||= { extras: [], chat: [], anchor: null, aiOrder: null, aiDur: {}, taskIds: [] });
}
function guessTaskDur(title) {
  const t = title.toLowerCase();
  if (/schularbeit|prüfung|klausur|\bsa\b|test|lernen für|referat|präsentation/.test(t)) return 60;
  if (/lernen|üben|wiederholen|vokabel/.test(t)) return 45;
  if (/hü|hausübung|hausaufgabe|aufgabe/.test(t)) return 30;
  return +S.settings.defaultTaskMin || 30;
}
function guessExtraDur(title) {
  const t = title.toLowerCase();
  if (/heim|fahrt|bus|zug|bahn|nach hause/.test(t)) return 30;
  if (/mittag|essen|abendessen|jause/.test(t)) return 30;
  if (/pause|chill|kaffee|snack/.test(t)) return 15;
  if (/duschen/.test(t)) return 15;
  return 30;
}
const SCHOOLWORDS = /mathe|deutsch|englisch|bio|physik|chemie|geschichte|geo|latein|franz|spanisch|informatik|lernen|hü|hausübung|hausaufgabe|test|schularbeit|referat|vokabel/i;
const guessList = t => SCHOOLWORDS.test(t) && listById('school') ? 'school' : (listById(S.settings.defaultList) ? S.settings.defaultList : S.lists[0].id);
const guessCal = t => /training|fußball|fussball|sport|band|probe|musik|gitarre|klavier|tanz|schwimm|turnen|verein/i.test(t) && calById('sport') ? 'sport' : (calById(S.settings.defaultCal) ? S.settings.defaultCal : S.calendars[0].id);

function planTasks(date, p) {
  const horizon = ymd(addDays(parseYmd(date), 14));
  const list = S.reminders.filter(r =>
    (!r.done || (p.taskIds.includes(r.id) && r.doneAt && r.doneAt.slice(0, 10) === todayStr() && date === todayStr())) &&
    (!r.due || r.due <= horizon) && (!r.due || r.due >= date || !r.done));
  const days = d => Math.round((parseYmd(d) - parseYmd(date)) / 864e5);
  const score = r => (r.due ? (r.due < date ? -5 : days(r.due)) : 10) - r.priority * 1.5 - (r.flagged ? 1 : 0);
  list.sort((a, b) => score(a) - score(b) || a.createdAt - b.createdAt);
  if (p.aiOrder && p.aiOrder.length) {
    const pos = new Map(p.aiOrder.map((id, i) => [id, i]));
    const fresh = list.filter(r => !pos.has(r.id) && r.createdAt > (p.aiAt || 0));
    return [...list.filter(r => pos.has(r.id)).sort((a, b) => pos.get(a.id) - pos.get(b.id)), ...fresh];
  }
  return list;
}

function computePlan(date) {
  const p = getPlan(date), st = S.settings;
  const dStart = toMin(st.dayStart), dEnd = toMin(st.dayEnd) || 1440;
  const isToday = date === todayStr();
  if (p.anchor == null) { p.anchor = isToday ? Math.max(dStart, roundUp(minOf(new Date()), 5)) : dStart; localStorage.setItem(KEY, JSON.stringify(S)); }
  const anchor = p.anchor;
  const items = [], busy = [], leftovers = [];
  const occupy = (s, e) => { busy.push([s, e]); busy.sort((a, b) => a[0] - b[0]); };
  const free = (from, dur) => {
    let t = from, moved = true;
    while (moved) { moved = false; for (const [s, e] of busy) if (t < e && t + dur > s) { t = e; moved = true; } }
    return t + dur <= dEnd ? t : null;
  };
  // 1) Fixtermine aus Kalender + Schule
  const flexEvents = [];
  const day = parseYmd(date), next = addDays(day, 1);
  for (const it of dayInstances(date)) {
    if (it.ev.allDay) continue;
    const s = it.s < day ? 0 : minOf(it.s), e = it.e >= next ? 1440 : minOf(it.e);
    if (it.ev.fixed === false) flexEvents.push({ id: 'ev-' + it.ev.id, title: it.ev.title, minutes: e - s, at: hm(s), fromCal: true });
    else { items.push({ kind: 'fixed', title: it.ev.title, s, e, color: it.color, sub: it.ev.location || '', evId: it.ev.id, date: ymd(it.s) }); occupy(s, e); }
  }
  const blocks = schoolBlocks(date);
  for (const b of blocks) { items.push({ kind: 'fixed', school: true, title: 'Schule', s: b.s, e: b.e, color: calColor('school'), sub: b.subjects.join(' · ') }); occupy(b.s, b.e); }
  const fixedItems = items.slice();
  const schoolEnd = blocks.length ? Math.max(...blocks.map(b => b.e)) : null;
  const findAfter = q => {
    q = q.toLowerCase();
    const f = fixedItems.filter(x => x.title.toLowerCase().includes(q) || q.includes(x.title.toLowerCase()) || (x.school && /schul|unterricht/.test(q)));
    return f.length ? Math.max(...f.map(x => x.e)) : null;
  };
  // 2) Flexible Einträge aus dem Chat (Kette: einer nach dem anderen)
  let cursor = anchor;
  for (const x of [...flexEvents, ...p.extras]) {
    const dur = Math.max(5, +x.minutes || guessExtraDur(x.title));
    let from;
    if (x.at) from = toMin(x.at);
    else if (x.after && findAfter(x.after) != null) from = findAfter(x.after);
    else if (schoolEnd != null && cursor < schoolEnd && /heim|nach ?hause|bus|bahn|zug|fahrt|mittag|essen/i.test(x.title)) from = schoolEnd;
    else from = cursor;
    if (!x.at) from = Math.max(from, anchor);
    const t = free(from, dur);
    if (t == null) { leftovers.push({ kind: 'extra', title: x.title, minutes: dur, id: x.id }); continue; }
    items.push({ kind: 'extra', title: x.title, s: t, e: t + dur, id: x.id, fromCal: x.fromCal, color: '#af52de', at: x.at });
    occupy(t, t + dur);
    if (!x.at) cursor = t + dur;
  }
  // 3) Aufgaben füllen die Lücken
  const brk = +st.breakMin || 0;
  const tFrom = Math.max(anchor, schoolEnd ?? 0);
  const tasks = planTasks(date, p);
  for (const r of tasks) {
    const dur = +(p.aiDur?.[r.id]) || +r.duration || guessTaskDur(r.title);
    let t = null;
    if (r.due === date && r.time) { const want = toMin(r.time); if (free(want, dur) === want) t = want; }
    if (t == null) t = free(tFrom, dur);
    if (t == null) { leftovers.push({ kind: 'task', title: r.title, minutes: dur, id: r.id }); continue; }
    const list = listById(r.listId);
    items.push({ kind: 'task', title: r.title, s: t, e: t + dur, id: r.id, color: list?.color || '#007aff', done: r.done, due: r.due, prio: r.priority });
    occupy(t, t + dur + brk);
  }
  const ids = items.filter(i => i.kind === 'task').map(i => i.id);
  if (ids.join() !== p.taskIds.join()) { p.taskIds = ids; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { } }
  items.sort((a, b) => a.s - b.s || (a.kind === 'fixed' ? -1 : 1));
  return { items, leftovers, anchor, dStart, dEnd };
}

// ---------- Chat ohne KI: einfache Befehle verstehen ----------
function parseCommandLocal(text, date) {
  let t = ' ' + text.trim() + ' ';
  const low = t.toLowerCase();
  if (/^\s*(neu planen|plane neu|aktualisier|nochmal planen|tag planen|plan(e)? (meinen )?tag)/.test(low))
    return { actions: [{ type: 'replan' }], reply: 'Erledigt – dein Tag ist ab jetzt neu geplant.' };
  if (/^\s*(alles )?(zurücksetzen|reset|alles löschen)/.test(low))
    return { actions: [{ type: 'clear_extras' }], reply: 'Alle Chat-Einträge für diesen Tag sind entfernt.' };
  const del = low.match(/^\s*(lösche|lösch|entferne|streiche|streich|kein(?:e|en)?|ohne)\s+(?:die |den |das )?(.+?)\s*$/);
  if (del) return { actions: [{ type: 'remove_extra', title: del[2] }], reply: `„${del[2].trim()}“ ist raus. Der Rest rückt nach.` };

  let at = null, end = null, minutes = null, after = null;
  const cut = re => { const m = t.match(re); if (m) t = t.replace(m[0], ' '); return m; };
  let m = cut(/\b(?:von\s*)?(\d{1,2})(?:[:.](\d{2}))?\s*(?:uhr\s*)?(?:-|–|bis)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(?:uhr)?/i);
  if (m) { at = `${pad(+m[1])}:${m[2] || '00'}`; end = `${pad(+m[3])}:${m[4] || '00'}`; }
  if (!at) { m = cut(/\b(?:um|ab|gegen)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(?:uhr)?/i) || cut(/\b(\d{1,2})[:.](\d{2})\s*(?:uhr)?/i) || cut(/\b(\d{1,2})\s*uhr/i); if (m) at = `${pad(+m[1])}:${m[2] || '00'}`; }
  m = cut(/(\d+(?:[.,]\d+)?)\s*(?:h|std\.?|stunden?)\b/i); if (m) minutes = Math.round(parseFloat(m[1].replace(',', '.')) * 60);
  m = cut(/(\d+)\s*(?:min\.?|minuten|m)\b/i); if (m) minutes = (minutes || 0) + +m[1];
  if (!minutes && cut(/\b(eine )?halbe stunde\b/i)) minutes = 30;
  if (!minutes && cut(/\b(eine )?viertelstunde\b/i)) minutes = 15;
  if (!minutes && cut(/\beine stunde\b/i)) minutes = 60;
  m = t.match(/\bnach (?:der |dem |den )?([a-zäöüß]+)/i);
  if (m && !/^hause$/i.test(m[1])) { after = m[1]; t = t.replace(m[0], ' '); }
  const isFixed = !!end || /\b(fix|fixtermin)\b/i.test(t);
  t = t.replace(/\b(fix|fixtermin|bitte|heute|noch|plane?|plan|füge?|hinzu|trag|ein|mach|mache|ich|habe|hab|muss|will|möchte|dann|danach|und|ist|einplanen|eintragen)\b/gi, ' ')
    .replace(/\s+/g, ' ').trim().replace(/^[,.-]+|[,.-]+$/g, '').trim();
  if (!t) return { actions: [], reply: 'Das habe ich nicht verstanden. Probier z. B. „Heimfahrt 30 min mit Bus“ oder „Mittagessen um 13:30“.' };
  const title = t.charAt(0).toUpperCase() + t.slice(1);
  if (isFixed && at) {
    return { actions: [{ type: 'add_fixed', title, at, end, minutes }], reply: `„${title}“ ist jetzt ein Fixtermin (${at}${end ? '–' + end : ''}). Alles Flexible plant sich drum herum.` };
  }
  if (SCHOOLWORDS.test(title) && !at && !after && !/heim|fahrt/i.test(title)) {
    return { actions: [{ type: 'add_reminder', title, minutes, date }], reply: `„${title}“ ist jetzt in deinen Erinnerungen${minutes ? ` (${minutes} min)` : ''} und wird in eine freie Lücke gelegt.` };
  }
  const mins = minutes || guessExtraDur(title);
  return { actions: [{ type: 'add_extra', title, minutes: mins, at, after }], reply: `„${title}“ (${mins} min) ist eingeplant{WHERE}. Alles Flexible wurde verschoben, Fixtermine bleiben.` };
}

function applyActions(date, actions = []) {
  const p = getPlan(date);
  for (const a of actions) {
    if (!a || !a.type) continue;
    if (a.type === 'add_extra' && a.title) p.extras.push({ id: uid(), title: a.title, minutes: a.minutes || guessExtraDur(a.title), at: a.at || null, after: a.after || null });
    else if (a.type === 'remove_extra') {
      const q = (a.title || '').toLowerCase().trim();
      const i = p.extras.findIndex(x => x.title.toLowerCase().includes(q) || q.includes(x.title.toLowerCase()));
      if (i >= 0) p.extras.splice(i, 1);
    } else if (a.type === 'clear_extras') p.extras = [];
    else if (a.type === 'add_fixed' && a.title && a.at) {
      const d = a.date || date;
      const s = parseYmd(d); s.setMinutes(toMin(a.at));
      let e; if (a.end) { e = parseYmd(d); e.setMinutes(toMin(a.end)); if (e <= s) e = new Date(s.getTime() + 3600e3); } else e = new Date(s.getTime() + (a.minutes || 60) * 60000);
      S.events.push({ id: uid(), title: a.title, location: '', notes: '', start: toLocal(s), end: toLocal(e), allDay: false, calendarId: guessCal(a.title), fixed: true, rrule: null, exdates: [], source: 'local' });
    } else if (a.type === 'add_reminder' && a.title) {
      S.reminders.push(newReminder({ title: a.title, due: a.date || date, duration: a.minutes || null, listId: guessList(a.title) }));
    } else if (a.type === 'set_duration' && a.title && a.minutes) {
      const q = a.title.toLowerCase();
      const r = S.reminders.find(x => !x.done && (x.id === a.title || x.title.toLowerCase().includes(q)));
      if (r) r.duration = a.minutes;
      else { const x = p.extras.find(x => x.title.toLowerCase().includes(q)); if (x) x.minutes = a.minutes; }
    } else if (a.type === 'replan') {
      p.anchor = date === todayStr() ? Math.max(toMin(S.settings.dayStart), roundUp(minOf(new Date()), 5)) : toMin(S.settings.dayStart);
    }
  }
}

const aiReady = () => !!(S.settings.apiKey && window.TagwerkAI);
function buildAIContext(date, mode) {
  const plan = computePlan(date), p = getPlan(date), d = parseYmd(date);
  return {
    modus: mode, heute: todayStr(), jetzt: hm(minOf(new Date())), plan_datum: date, wochentag: WD_LONG[d.getDay()],
    tag_von: S.settings.dayStart, tag_bis: S.settings.dayEnd, pause_nach_aufgabe_min: +S.settings.breakMin,
    fixtermine: plan.items.filter(i => i.kind === 'fixed').map(i => ({ titel: i.title, von: hm(i.s), bis: hm(i.e), info: i.sub || '' })),
    flexible_eintraege: p.extras.map(x => ({ titel: x.title, minuten: x.minutes, um: x.at, nach: x.after })),
    aufgaben: S.reminders.filter(r => !r.done).slice(0, 80).map(r => ({
      id: r.id, titel: r.title, faellig: r.due, uhrzeit: r.time, prioritaet: ['keine', 'niedrig', 'mittel', 'hoch'][r.priority || 0],
      markiert: !!r.flagged, dauer_min: r.duration, liste: listById(r.listId)?.name || '', notiz: (r.notes || '').slice(0, 200),
    })),
    aktueller_plan: plan.items.map(i => `${hm(i.s)}–${hm(i.e)} ${i.title} [${i.kind === 'fixed' ? 'fix' : i.kind === 'task' ? 'aufgabe:' + i.id : 'flexibel'}]`),
    nicht_eingeplant: plan.leftovers.map(l => l.title),
    verlauf: p.chat.slice(-8).map(c => `${c.role === 'user' ? 'Ich' : 'Assistent'}: ${c.text}`),
  };
}
async function sendChat(text, mode = 'chat') {
  text = text.trim(); if (!text || ui.plan.busy) return;
  const date = ui.plan.date, p = getPlan(date);
  p.chat.push({ role: 'user', text }); save();
  if (aiReady()) {
    ui.plan.busy = true; render.keepScroll = true; render();
    try {
      if (mode === 'plan') applyActions(date, [{ type: 'replan' }]);
      const out = await window.TagwerkAI.run(buildAIContext(date, mode), text, S.settings);
      applyActions(date, out.actions);
      if (Array.isArray(out.task_order) && out.task_order.length) { p.aiOrder = out.task_order; p.aiAt = Date.now(); }
      for (const d of out.durations || []) if (d && d.id && d.minutes) p.aiDur[d.id] = d.minutes;
      p.chat.push({ role: 'bot', text: out.reply || 'Erledigt.' });
    } catch (e) {
      console.error(e);
      const local = parseCommandLocal(text, date);
      if (mode !== 'plan') applyActions(date, local.actions);
      p.chat.push({ role: 'bot', text: `⚠️ KI nicht erreichbar (${e.message || e}). ${mode === 'plan' ? 'Ich habe ohne KI geplant.' : local.reply}` });
    } finally { ui.plan.busy = false; }
  } else {
    if (mode === 'plan') { applyActions(date, [{ type: 'replan' }]); p.aiOrder = null; p.chat.push({ role: 'bot', text: 'Dein Tag ist geplant: Fixtermine bleiben, Aufgaben liegen nach Dringlichkeit in den Lücken. Tipp: Mit einem API-Schlüssel in den Einstellungen plant die KI noch schlauer.' }); }
    else {
      const r = parseCommandLocal(text, date); applyActions(date, r.actions);
      let reply = r.reply;
      if (reply.includes('{WHERE}')) {
        const last = p.extras.at(-1), plan = computePlan(date);
        const it = last && plan.items.find(i => i.id === last.id);
        reply = reply.replace('{WHERE}', it ? `: ${hm(it.s)}–${hm(it.e)} Uhr` : ', passt heute aber nicht mehr rein');
      }
      p.chat.push({ role: 'bot', text: reply });
    }
  }
  save(); render.keepScroll = true; render();
}

// ---------- Tagesplan-Ansicht ----------
function renderPlan() {
  const date = ui.plan.date, d = parseYmd(date), t = todayStr();
  const plan = computePlan(date), p = getPlan(date);
  const rel = date === t ? 'Heute' : date === ymd(addDays(new Date(), 1)) ? 'Morgen' : date === ymd(addDays(new Date(), -1)) ? 'Gestern' : WD_LONG[d.getDay()];
  const label = `${rel}${rel !== WD_LONG[d.getDay()] ? ', ' + WD_LONG[d.getDay()] : ''} ${d.toLocaleDateString('de-AT', { day: 'numeric', month: 'long' })}`;
  let tl = '', last = plan.anchor;
  for (const it of plan.items) {
    if (it.e <= plan.anchor && it.kind === 'fixed' && date === t) { /* vorbei – trotzdem zeigen */ }
    const gap = it.s - last;
    if (gap >= 15 && last >= plan.anchor) tl += `<div class="tl-item"><div class="tm"></div><div class="rail"></div><div class="tl-gap">frei · ${gap >= 60 ? Math.floor(gap / 60) + ' h ' : ''}${gap % 60 ? gap % 60 + ' min' : ''}</div></div>`;
    last = Math.max(last, it.e);
    const tag = it.kind === 'fixed' ? (it.school ? 'Schule' : 'Fix') : it.kind === 'task' ? 'Aufgabe' : (it.fromCal ? 'Kalender' : 'Flexibel');
    const act = it.kind === 'task' ? `data-act="editRem" data-id="${it.id}"` : it.kind === 'fixed' ? (it.school ? 'data-act="timetable"' : `data-act="openEvent" data-id="${it.evId}" data-date="${it.date}"`) : '';
    const check = it.kind === 'task' ? `<button class="circle ${it.done ? 'on' : ''}" style="--c:${it.color}" data-act="toggleRem" data-id="${it.id}"></button>` : '';
    const rm = it.kind === 'extra' && !it.fromCal ? `<button class="x-btn" data-act="rmExtra" data-id="${it.id}" aria-label="Entfernen">×</button>` : '';
    tl += `<div class="tl-item" style="--c:${it.color}"><div class="tm">${hm(it.s)}</div><div class="rail"><i></i></div>
      <div class="tl-card ${it.kind === 'fixed' ? 'fixed' : ''} ${it.done ? 'done' : ''}">${check}
        <div class="grow" ${act}><div class="ti">${esc(it.title)}</div><div class="sub">${hm(it.s)}–${hm(it.e)} · ${it.e - it.s} min${it.sub ? ' · ' + esc(it.sub) : ''}${it.kind === 'task' && it.due ? ' · fällig ' + dueLabel(it.due) : ''}</div></div>
        <span class="tag">${tag}</span>${rm}</div></div>`;
  }
  if (!plan.items.length) tl = `<div class="empty">Noch nichts geplant. Trag Erinnerungen ein oder schreib unten in den Chat.</div>`;
  const left = plan.leftovers.length ? `<div class="group-title">Passt heute nicht mehr rein</div><div class="group">${plan.leftovers.map(l =>
    `<div class="cell"><span class="grow">${esc(l.title)}</span><span class="val">${l.minutes} min</span></div>`).join('')}</div>` : '';
  const onboarding = !S.timetable.length ? `<div class="hint-card"><b>Stundenplan fehlt</b><p>Damit der Plan weiß, wann du in der Schule bist, trag einmal deinen Stundenplan ein.</p>
    <div class="hint-actions"><button class="btn secondary" data-act="timetable">Stundenplan eintragen</button></div></div>` : '';
  const chat = p.chat.length ? p.chat.map(c => `<div class="msg ${c.role}">${esc(c.text)}</div>`).join('')
    : `<div class="msg bot">Hi! Schreib mir einfach, was dazukommt, z. B. „Heimfahrt 30 min mit Bus“, „Mittagessen um 13:30“ oder „Training 17–19 Uhr“. Ich schiebe dann alles Flexible um deine Fixtermine herum.</div>`;
  const busy = ui.plan.busy ? `<div class="msg bot"><span class="typing"><i></i><i></i><i></i></span></div>` : '';
  const chips = ['🚌 Heimfahrt 30 min', '🍝 Mittagessen 30 min', '☕ Pause 15 min', '🔄 Neu planen'];
  return `<div class="sticky-head"><div class="topbar"><div class="left"><button class="icon-btn purple" data-act="settings">${I.gear}</button></div>
      <div class="right"><button class="link purple" data-act="planToday">Heute</button></div></div></div>
    <h1 class="big-title">Tagesplan</h1>
    <div class="day-nav"><button data-act="planPrev" aria-label="Vortag">‹</button><span class="lbl">${label}</span><button data-act="planNext" aria-label="Nächster Tag">›</button></div>
    <div class="plan-actions">
      <button class="btn primary" data-act="planDay" ${ui.plan.busy ? 'disabled' : ''}>${I.spark}${aiReady() ? 'Mit KI planen' : 'Tag planen'}</button>
      <button class="btn secondary" data-act="planReset">Zurücksetzen</button></div>
    ${onboarding}
    <div class="timeline">${tl}</div>
    ${left}
    <div class="group-title">Plan-Chat ${aiReady() ? '· KI aktiv' : '· ohne KI'}</div>
    <div class="chat"><div class="chat-log">${chat}${busy}</div>
      <div class="chips">${chips.map(c => `<button data-act="chip" data-text="${esc(c.replace(/^\S+\s/, ''))}">${esc(c)}</button>`).join('')}</div>
      <form class="chat-input" data-form="chat"><input name="msg" placeholder="z. B. Essen 20 min nach Heimfahrt" autocomplete="off" enterkeyhint="send">
      <button class="send" aria-label="Senden">${I.send}</button></form></div>`;
}

// =====================================================================
//  Sheets (Eingabe-Fenster)
// =====================================================================
function openSheet({ title, left = 'Abbrechen', right = 'Fertig', body, onSave, onOpen, onClose }) {
  const root = $('#sheet-root');
  const bd = document.createElement('div'); bd.className = 'backdrop';
  const sh = document.createElement('div'); sh.className = 'sheet';
  sh.innerHTML = `<div class="sheet-head"><button class="link blue" data-x="cancel">${left || ''}</button><h3>${esc(title)}</h3><button class="link blue" data-x="save">${right || ''}</button></div><div class="sheet-body">${body}</div>`;
  root.append(bd, sh);
  const close = () => { bd.remove(); sh.remove(); onClose?.(); };
  bd.onclick = close;
  sh.querySelector('[data-x=cancel]').onclick = close;
  sh.querySelector('[data-x=save]').onclick = () => { if (!onSave || onSave(sh) !== false) close(); };
  onOpen?.(sh, close);
  return { el: sh, close };
}
const val = (sh, name) => { const el = sh.querySelector(`[name="${name}"]`); return !el ? null : el.type === 'checkbox' ? el.checked : el.value; };
const sw = (name, on) => `<label class="switch"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}><span></span></label>`;
const colorPick = (cur) => `<div class="color-pick" data-value="${cur}">${COLORS.map(c => `<button type="button" class="${c === cur ? 'on' : ''}" style="background:${c}" data-act="pickColor" data-color="${c}"></button>`).join('')}</div>`;

// ---------- Ereignis ----------
function rruleSel(r) {
  if (!r) return 'none';
  if (r.freq === 'DAILY' && r.interval === 1) return 'daily';
  if (r.freq === 'WEEKLY' && (!r.byday || r.byday.length <= 1)) return r.interval === 2 ? 'biweekly' : r.interval === 1 ? 'weekly' : 'custom';
  if (r.freq === 'WEEKLY' && r.byday?.join() === '1,2,3,4,5' && r.interval === 1) return 'weekdays';
  if (r.freq === 'MONTHLY' && !r.nth && r.interval === 1) return 'monthly';
  if (r.freq === 'YEARLY' && r.interval === 1) return 'yearly';
  return 'custom';
}
function openEventEditor(ev, opts = {}) {
  const isNew = !ev;
  let d;
  if (ev) d = JSON.parse(JSON.stringify(ev));
  else {
    const date = opts.date || ui.cal.sel;
    const now = new Date();
    const sMin = opts.startMin ?? Math.min(23 * 60, (now.getHours() + 1) * 60);
    const s = parseYmd(date); s.setMinutes(sMin);
    const e = new Date(s.getTime() + S.settings.defaultEventMin * 60000);
    d = { title: '', location: '', notes: '', start: toLocal(s), end: toLocal(e), allDay: false, calendarId: calById(S.settings.defaultCal) ? S.settings.defaultCal : S.calendars[0].id, fixed: true, rrule: null, exdates: [], source: 'local' };
  }
  const [sd, stime] = d.start.split('T'), [ed0, etime] = d.end.split('T');
  const ed = d.allDay ? ymd(addDays(parseYmd(ed0), -1)) : ed0;
  const rs = rruleSel(d.rrule);
  const body = `
    <div class="group"><div class="cell"><input type="text" name="title" placeholder="Titel" value="${esc(d.title)}"></div>
      <div class="cell"><input type="text" name="location" placeholder="Ort" value="${esc(d.location)}"></div></div>
    <div class="group ${d.allDay ? 'is-allday' : ''}" id="ev-times">
      <div class="cell"><span class="grow">Ganztägig</span>${sw('allDay', d.allDay)}</div>
      <div class="cell"><span class="grow">Beginn</span><input type="date" class="right" name="sd" value="${sd}"><input type="time" class="right t-only" name="st" value="${stime}"></div>
      <div class="cell"><span class="grow">Ende</span><input type="date" class="right" name="ed" value="${ed}"><input type="time" class="right t-only" name="et" value="${etime}"></div></div>
    <div class="group">
      <div class="cell"><span class="grow">Wiederholen</span><select class="right" name="rep">
        ${[['none', 'Nie'], ['daily', 'Täglich'], ['weekdays', 'An Wochentagen'], ['weekly', 'Wöchentlich'], ['biweekly', 'Alle 2 Wochen'], ['monthly', 'Monatlich'], ['yearly', 'Jährlich'], ...(rs === 'custom' ? [['custom', 'Benutzerdefiniert']] : [])]
          .map(([k, l]) => `<option value="${k}" ${k === rs ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="cell"><span class="grow">Wiederholung endet</span><input type="date" class="right" name="until" value="${d.rrule?.until ? d.rrule.until.slice(0, 10) : ''}"></div></div>
    <div class="group">
      <div class="cell"><span class="grow">Kalender</span><select class="right" name="cal">${S.calendars.map(c => `<option value="${c.id}" ${c.id === d.calendarId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
      <div class="cell"><span class="grow">Fixtermin<div class="cell-sub">Wird im Tagesplan nie verschoben</div></span>${sw('fixed', d.fixed !== false)}</div></div>
    <div class="group"><div class="cell"><textarea name="notes" placeholder="Notizen">${esc(d.notes)}</textarea></div></div>
    ${!isNew ? (d.rrule ? `<div class="group"><button class="cell danger" data-x="del-one">Nur diesen Termin löschen</button><button class="cell danger" data-x="del-all">Alle zukünftigen Termine löschen</button></div>`
      : `<div class="group"><button class="cell danger" data-x="del-all">Ereignis löschen</button></div>`) : ''}
    ${d.source === 'google' ? '<p class="help">Aus Google kopiert. Änderungen bleiben nur in Tagwerk.</p>' : ''}`;
  openSheet({
    title: isNew ? 'Neues Ereignis' : 'Ereignis', right: isNew ? 'Hinzufügen' : 'Fertig', body,
    onOpen(sh, close) {
      sh.querySelector('[name=allDay]').onchange = e => sh.querySelector('#ev-times').classList.toggle('is-allday', e.target.checked);
      sh.querySelector('[name=sd]').onchange = e => { const edI = sh.querySelector('[name=ed]'); if (edI.value < e.target.value) edI.value = e.target.value; };
      sh.querySelector('[name=st]').onchange = e => {
        const etI = sh.querySelector('[name=et]');
        if (sh.querySelector('[name=sd]').value === sh.querySelector('[name=ed]').value && toMin(etI.value) <= toMin(e.target.value)) etI.value = hm(Math.min(toMin(e.target.value) + S.settings.defaultEventMin, 1439));
      };
      const del = which => {
        if (which === 'one') { ev.exdates = [...(ev.exdates || []), opts.date]; }
        else if (ev.rrule && opts.date && opts.date > ev.start.slice(0, 10)) { ev.rrule.until = ymd(addDays(parseYmd(opts.date), -1)) + 'T23:59'; ev.rrule.count = null; }
        else S.events = S.events.filter(x => x.id !== ev.id);
        save(); render(); close(); toast('Gelöscht');
      };
      sh.querySelector('[data-x=del-one]')?.addEventListener('click', () => del('one'));
      sh.querySelector('[data-x=del-all]')?.addEventListener('click', () => { if (confirm('Wirklich löschen?')) del('all'); });
    },
    onSave(sh) {
      const title = val(sh, 'title').trim() || 'Neues Ereignis';
      const allDay = val(sh, 'allDay');
      const sdv = val(sh, 'sd'), edv = val(sh, 'ed') || sdv;
      let start, end;
      if (allDay) { start = sdv + 'T00:00'; end = ymd(addDays(parseYmd(edv < sdv ? sdv : edv), 1)) + 'T00:00'; }
      else {
        start = `${sdv}T${val(sh, 'st') || '09:00'}`; end = `${edv}T${val(sh, 'et') || '10:00'}`;
        if (parseLocal(end) <= parseLocal(start)) { toast('Das Ende muss nach dem Beginn liegen.'); return false; }
      }
      const rep = val(sh, 'rep'), until = val(sh, 'until');
      let rrule = d.rrule;
      const wd = parseYmd(sdv).getDay();
      if (rep !== 'custom') rrule = {
        none: null, daily: { freq: 'DAILY', interval: 1 }, weekdays: { freq: 'WEEKLY', interval: 1, byday: [1, 2, 3, 4, 5] },
        weekly: { freq: 'WEEKLY', interval: 1, byday: [wd] }, biweekly: { freq: 'WEEKLY', interval: 2, byday: [wd] },
        monthly: { freq: 'MONTHLY', interval: 1 }, yearly: { freq: 'YEARLY', interval: 1 },
      }[rep];
      if (rrule) { rrule = { ...rrule }; if (until) rrule.until = until + 'T23:59'; else if (rep !== 'custom') delete rrule.until; }
      const obj = { ...d, title, location: val(sh, 'location'), notes: val(sh, 'notes'), allDay, start, end, rrule, calendarId: val(sh, 'cal'), fixed: val(sh, 'fixed') };
      if (isNew) S.events.push({ id: uid(), ...obj }); else Object.assign(ev, obj);
      save(); render();
    },
  });
}

// ---------- Erinnerung ----------
function openReminderEditor(r, defaults = {}) {
  const isNew = !r;
  const d = r ? { ...r } : newReminder(defaults);
  const body = `
    <div class="group"><div class="cell"><input type="text" name="title" placeholder="Titel" value="${esc(d.title)}"></div>
      <div class="cell"><textarea name="notes" placeholder="Notizen">${esc(d.notes)}</textarea></div></div>
    <div class="group">
      <div class="cell"><span class="ico" style="background:#ff3b30">${I.cal}</span><span class="grow">Datum</span>${sw('hasDue', !!d.due)}</div>
      <div class="cell sub-row ${d.due ? '' : 'hidden'}" data-for="hasDue"><input type="date" name="due" value="${d.due || todayStr()}"></div>
      <div class="cell"><span class="ico" style="background:#007aff">${I.clock}</span><span class="grow">Uhrzeit</span>${sw('hasTime', !!d.time)}</div>
      <div class="cell sub-row ${d.time ? '' : 'hidden'}" data-for="hasTime"><input type="time" name="time" value="${d.time || '16:00'}"></div></div>
    <div class="group">
      <div class="cell"><span class="ico" style="background:#ff9500">${I.flag}</span><span class="grow">Markierung</span>${sw('flagged', d.flagged)}</div>
      <div class="cell"><span class="grow">Priorität</span><div class="prio-seg" data-value="${d.priority}">${['Keine', '!', '!!', '!!!'].map((l, i) => `<button type="button" class="${i === d.priority ? 'on' : ''}" data-p="${i}">${l}</button>`).join('')}</div></div>
      <div class="cell"><span class="grow">Liste</span><select class="right" name="list">${S.lists.map(l => `<option value="${l.id}" ${l.id === d.listId ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></div></div>
    <div class="group">
      <div class="cell"><span class="ico" style="background:#af52de">${I.spark}</span><span class="grow">Dauer für den Tagesplan</span>
        <select class="right" name="duration">${[['', 'automatisch'], ...[10, 15, 20, 30, 45, 60, 90, 120, 180].map(m => [m, m < 60 ? m + ' min' : (m / 60) + ' h'])]
          .map(([v, l]) => `<option value="${v}" ${String(v) === String(d.duration || '') ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
    ${!isNew ? `<div class="group"><button class="cell danger" data-x="del">Erinnerung löschen</button></div>` : ''}`;
  openSheet({
    title: isNew ? 'Neue Erinnerung' : 'Details', right: isNew ? 'Hinzufügen' : 'Fertig', body,
    onOpen(sh, close) {
      ['hasDue', 'hasTime'].forEach(n => sh.querySelector(`[name=${n}]`).onchange = e => {
        sh.querySelector(`[data-for=${n}]`).classList.toggle('hidden', !e.target.checked);
        if (n === 'hasTime' && e.target.checked && !sh.querySelector('[name=hasDue]').checked) { sh.querySelector('[name=hasDue]').checked = true; sh.querySelector('[data-for=hasDue]').classList.remove('hidden'); }
      });
      const ps = sh.querySelector('.prio-seg');
      ps.onclick = e => { const b = e.target.closest('[data-p]'); if (!b) return; ps.dataset.value = b.dataset.p; $$('button', ps).forEach(x => x.classList.toggle('on', x === b)); };
      sh.querySelector('[data-x=del]')?.addEventListener('click', () => { S.reminders = S.reminders.filter(x => x.id !== r.id); save(); render(); close(); toast('Erinnerung gelöscht'); });
      if (isNew) setTimeout(() => sh.querySelector('[name=title]').focus(), 300);
    },
    onSave(sh) {
      const title = val(sh, 'title').trim();
      if (!title) { if (isNew) return; toast('Titel fehlt'); return false; }
      const hasDue = val(sh, 'hasDue'), hasTime = val(sh, 'hasTime');
      const obj = {
        title, notes: val(sh, 'notes'), due: hasDue ? val(sh, 'due') : null, time: hasDue && hasTime ? val(sh, 'time') : null,
        flagged: val(sh, 'flagged'), priority: +sh.querySelector('.prio-seg').dataset.value, listId: val(sh, 'list'),
        duration: val(sh, 'duration') ? +val(sh, 'duration') : null,
      };
      if (isNew) S.reminders.push({ ...d, ...obj }); else Object.assign(r, obj);
      save(); render();
    },
  });
}
function toggleReminder(id) {
  const r = S.reminders.find(x => x.id === id); if (!r) return;
  r.done = !r.done; r.doneAt = r.done ? toLocal(new Date()) : null;
  if (r.done) { ui.rem.recent[id] = Date.now(); setTimeout(() => { render.keepScroll = true; render(); }, 1700); }
  save(); render.keepScroll = true; render();
}
function openListEditor(l) {
  const isNew = !l;
  const d = l || { name: '', color: COLORS[(S.lists.length + 4) % COLORS.length] };
  openSheet({
    title: isNew ? 'Neue Liste' : 'Liste bearbeiten', right: isNew ? 'Fertig' : 'Fertig',
    body: `<div class="group"><div class="cell"><input type="text" name="name" placeholder="Listenname" value="${esc(d.name)}"></div></div>
      <div class="group">${colorPick(d.color)}</div>
      ${!isNew && S.lists.length > 1 ? `<div class="group"><button class="cell danger" data-x="del">Liste löschen</button></div>` : ''}`,
    onOpen(sh, close) {
      sh.querySelector('[data-x=del]')?.addEventListener('click', () => {
        if (!confirm(`„${l.name}“ und alle Erinnerungen darin löschen?`)) return;
        S.lists = S.lists.filter(x => x.id !== l.id); S.reminders = S.reminders.filter(r => r.listId !== l.id);
        ui.rem.screen = 'home'; save(); render(); close();
      });
      if (isNew) setTimeout(() => sh.querySelector('[name=name]').focus(), 300);
    },
    onSave(sh) {
      const name = val(sh, 'name').trim(); if (!name) return isNew ? undefined : false;
      const color = sh.querySelector('.color-pick').dataset.value;
      if (isNew) S.lists.push({ id: uid(), name, color }); else Object.assign(l, { name, color });
      save(); render();
    },
  });
}
function quickAdd(el) {
  const slot = $('#quick-slot'); if (!slot) return;
  const listId = el.dataset.list || guessList('');
  const smart = el.dataset.smart;
  slot.innerHTML = `<div class="rem"><span class="circle"></span><div class="body"><input class="title quick-input" placeholder="Neue Erinnerung" enterkeyhint="done"></div></div>`;
  const inp = $('.quick-input', slot); inp.focus();
  const commit = () => {
    const title = inp.value.trim(); if (!title) return false;
    const o = { title, listId: el.dataset.list || guessList(title) };
    if (smart === 'today' || smart === 'scheduled') o.due = todayStr();
    if (smart === 'flagged') o.flagged = true;
    S.reminders.push(newReminder(o)); save(); return true;
  };
  inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); if (commit()) { render.keepScroll = true; render(); quickAdd($(`[data-act=quickAdd]`)); } } };
  inp.onblur = () => setTimeout(() => { if (!document.body.contains(inp)) return; if (commit()) { render.keepScroll = true; render(); } else slot.innerHTML = ''; }, 120);
}

// ---------- Kalenderliste & Import ----------
function openCalendars() {
  const paint = () => `
    <div class="group-title">Meine Kalender</div>
    <div class="group">${S.calendars.map(c => `<div class="cell"><button class="swatch" style="background:${c.color}" data-cal-color="${c.id}" aria-label="Farbe"></button>
      <span class="grow">${esc(c.name)}<div class="cell-sub">${c.source === 'google' ? 'Google' : c.source === 'ics' ? 'Importiert' : 'Lokal'} · ${S.events.filter(e => e.calendarId === c.id).length} Termine</div></span>
      <label class="switch"><input type="checkbox" data-cal-vis="${c.id}" ${c.visible !== false ? 'checked' : ''}><span></span></label>
      ${S.calendars.length > 1 ? `<button class="x-btn" data-cal-del="${c.id}" aria-label="Löschen">×</button>` : ''}</div>`).join('')}
      <button class="cell action" data-cal-add>+ Kalender hinzufügen</button></div>
    <div class="group-title">Google Kalender kopieren</div>
    <div class="group">
      <button class="cell action" data-google>Mit Google-Konto verbinden & kopieren</button>
      <label class="cell action" style="cursor:pointer">ICS-Datei importieren (.ics)<input type="file" accept=".ics,text/calendar" multiple hidden data-ics></label></div>
    <div class="help">
      <b>Weg 1 – Datei (klappt immer):</b>
      <ol><li>Am Computer <i>calendar.google.com</i> öffnen → Zahnrad → <i>Einstellungen</i> → <i>Importieren & Exportieren</i> → <i>Exportieren</i>.</li>
      <li>Die ZIP-Datei entpacken (am iPhone in der <i>Dateien</i>-App einfach antippen).</li>
      <li>Hier auf „ICS-Datei importieren“ tippen und die .ics-Dateien auswählen. Wiederholte Termine werden übernommen.</li></ol>
      <b>Weg 2 – direkt mit Google-Login:</b> braucht einmalig eine kostenlose <i>Client-ID</i> von Google (Einstellungen → Google). Danach reicht ein Tipp zum Kopieren und erneuten Abgleichen.
    </div>`;
  openSheet({
    title: 'Kalender', left: '', right: 'Fertig', body: paint(),
    onOpen(sh) {
      const body = sh.querySelector('.sheet-body');
      const repaint = () => { body.innerHTML = paint(); };
      body.addEventListener('change', async e => {
        const t = e.target;
        if (t.dataset.calVis) { calById(t.dataset.calVis).visible = t.checked; save(); render(); }
        if (t.dataset.ics !== undefined && t.files?.length) {
          let n = 0;
          for (const f of t.files) n += importICS(await f.text(), f.name);
          save(); render(); repaint(); toast(`${n} Termine importiert`);
        }
      });
      body.addEventListener('click', e => {
        const t = e.target.closest('button'); if (!t) return;
        if (t.dataset.calColor) { const c = calById(t.dataset.calColor); c.color = COLORS[(COLORS.indexOf(c.color) + 1) % COLORS.length]; save(); render(); repaint(); }
        if (t.dataset.calDel) {
          const c = calById(t.dataset.calDel);
          if (!confirm(`Kalender „${c.name}“ mit allen Terminen löschen?`)) return;
          S.calendars = S.calendars.filter(x => x.id !== c.id); S.events = S.events.filter(x => x.calendarId !== c.id);
          save(); render(); repaint();
        }
        if (t.dataset.calAdd !== undefined) {
          const name = prompt('Name des neuen Kalenders'); if (!name) return;
          S.calendars.push({ id: uid(), name, color: COLORS[S.calendars.length % COLORS.length], visible: true, source: 'local' }); save(); repaint();
        }
        if (t.dataset.google !== undefined) googleSync().then(repaint);
      });
    },
  });
}

// ---------- ICS-Import ----------
const unesc = s => (s || '').replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
function tzToDate(y, mo, d, h, mi, tz) {
  try {
    const guess = Date.UTC(y, mo, d, h, mi);
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    const p = Object.fromEntries(f.formatToParts(new Date(guess)).map(x => [x.type, x.value]));
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
    return new Date(guess - (asUTC - guess));
  } catch { return null; }
}
function icsDate(prop) {
  if (!prop) return null;
  const v = prop.value.trim(), params = prop.params || {};
  if (params.VALUE === 'DATE' || /^\d{8}$/.test(v)) return { local: `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}T00:00`, allDay: true };
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!m) return null;
  const [, Y, Mo, D, h, mi, , z] = m;
  if (z) return { local: toLocal(new Date(Date.UTC(+Y, +Mo - 1, +D, +h, +mi))), allDay: false };
  if (params.TZID) { const d = tzToDate(+Y, +Mo - 1, +D, +h, +mi, params.TZID); if (d && !isNaN(d)) return { local: toLocal(d), allDay: false }; }
  return { local: `${Y}-${Mo}-${D}T${h}:${mi}`, allDay: false };
}
function parseRRule(str) {
  const o = Object.fromEntries(str.split(';').map(kv => kv.split('=')));
  const map = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  const r = { freq: o.FREQ, interval: +o.INTERVAL || 1 };
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(r.freq)) return null;
  if (o.COUNT) r.count = +o.COUNT;
  if (o.UNTIL) { const u = icsDate({ value: o.UNTIL, params: {} }); if (u) r.until = u.allDay ? u.local.slice(0, 10) + 'T23:59' : u.local; }
  if (o.BYDAY) {
    r.byday = [];
    for (const p of o.BYDAY.split(',')) { const mm = p.match(/^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/); if (!mm) continue; r.byday.push(map[mm[2]]); if (mm[1]) r.nth = +mm[1]; }
  }
  if (r.freq === 'MONTHLY' && o.BYSETPOS && r.byday?.length === 1) r.nth = +o.BYSETPOS;
  if (r.freq === 'MONTHLY' && r.byday?.length && !r.nth) { r.freq = 'WEEKLY'; r.interval = 1; }
  if (r.freq === 'DAILY' && r.byday?.length) { r.freq = 'WEEKLY'; }
  return r;
}
function parseDuration(s) {
  const m = s.match(/P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?/);
  if (!m) return 0;
  return ((+m[1] || 0) * 7 * 1440 + (+m[2] || 0) * 1440 + (+m[3] || 0) * 60 + (+m[4] || 0)) * 60000;
}
function importICS(text, fileName = 'Import') {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  let calName = fileName.replace(/\.ics$/i, '').replace(/_/g, ' ');
  const vevents = []; let cur = null, depth = 0;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') { if (cur) vevents.push(cur); cur = null; continue; }
    if (cur && line.startsWith('BEGIN:')) { depth++; continue; } // VALARM o. ä. überspringen
    if (cur && line.startsWith('END:')) { depth--; continue; }
    if (depth > 0) continue;
    const idx = line.indexOf(':'); if (idx < 0) continue;
    const left = line.slice(0, idx), value = line.slice(idx + 1);
    const [name, ...ps] = left.split(';');
    const params = {}; ps.forEach(p => { const [k, v] = p.split('='); params[k.toUpperCase()] = (v || '').replace(/"/g, ''); });
    if (!cur) { if (name === 'X-WR-CALNAME' && value.trim()) calName = unesc(value); continue; }
    if (name === 'EXDATE') (cur.EXDATE ||= []).push(...value.split(',').map(v => ({ value: v, params })));
    else cur[name] = { value, params };
  }
  if (!vevents.length) { toast(`In „${fileName}“ wurden keine Termine gefunden.`); return 0; }
  // gleichnamigen importierten Kalender ersetzen (erneuter Import = Aktualisierung)
  let cal = S.calendars.find(c => c.source === 'ics' && c.name === calName);
  if (cal) S.events = S.events.filter(e => e.calendarId !== cal.id);
  else { cal = { id: uid(), name: calName, color: COLORS[(S.calendars.length + 5) % COLORS.length], visible: true, source: 'ics' }; S.calendars.push(cal); }
  const out = [], overrides = [];
  for (const v of vevents) {
    if (v.STATUS?.value === 'CANCELLED') continue;
    const s = icsDate(v.DTSTART); if (!s) continue;
    let e = icsDate(v.DTEND);
    if (!e) {
      if (v.DURATION) e = { local: toLocal(new Date(parseLocal(s.local).getTime() + parseDuration(v.DURATION.value))) };
      else e = { local: s.allDay ? toLocal(addDays(parseLocal(s.local), 1)) : s.local };
    }
    if (s.allDay && e.local <= s.local) e.local = toLocal(addDays(parseLocal(s.local), 1));
    const ev = {
      id: uid(), uid: v.UID?.value || null, title: unesc(v.SUMMARY?.value) || '(Ohne Titel)', location: unesc(v.LOCATION?.value), notes: unesc(v.DESCRIPTION?.value),
      start: s.local, end: e.local, allDay: s.allDay, calendarId: cal.id, fixed: true,
      rrule: v.RRULE ? parseRRule(v.RRULE.value) : null,
      exdates: (v.EXDATE || []).map(x => icsDate(x)?.local.slice(0, 10)).filter(Boolean), source: 'ics',
    };
    if (v['RECURRENCE-ID']) { const rid = icsDate(v['RECURRENCE-ID']); if (rid) overrides.push({ uid: ev.uid, date: rid.local.slice(0, 10) }); }
    out.push(ev);
  }
  for (const o of overrides) { const m = out.find(x => x.uid === o.uid && x.rrule); if (m) m.exdates.push(o.date); }
  S.events.push(...out);
  return out.length;
}

// ---------- Google-Kalender direkt ----------
function loadScript(src) {
  return new Promise((res, rej) => {
    if ([...document.scripts].some(s => s.src === src)) return res();
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Google-Skript konnte nicht geladen werden'));
    document.head.append(s);
  });
}
async function googleSync() {
  const cid = (S.settings.googleClientId || '').trim();
  if (!cid) { toast('Zuerst in den Einstellungen eine Google Client-ID eintragen – oder den ICS-Import nutzen.', 4000); return; }
  try {
    await loadScript('https://accounts.google.com/gsi/client');
    const token = await new Promise((res, rej) => {
      const tc = google.accounts.oauth2.initTokenClient({
        client_id: cid, scope: 'https://www.googleapis.com/auth/calendar.readonly',
        callback: r => r.error ? rej(new Error(r.error)) : res(r.access_token),
        error_callback: e => rej(new Error(e.message || e.type || 'Login abgebrochen')),
      });
      tc.requestAccessToken();
    });
    toast('Kopiere Termine …', 10000);
    const api = async url => { const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } }); if (!r.ok) throw new Error('Google antwortet mit ' + r.status); return r.json(); };
    const list = await api('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250');
    const timeMin = encodeURIComponent(addDays(new Date(), -180).toISOString()), timeMax = encodeURIComponent(addDays(new Date(), 400).toISOString());
    let total = 0;
    for (const c of list.items || []) {
      let cal = S.calendars.find(x => x.gid === c.id);
      if (!cal) { cal = { id: uid(), gid: c.id, name: c.summaryOverride || c.summary, color: c.backgroundColor || COLORS[S.calendars.length % COLORS.length], visible: c.selected !== false, source: 'google' }; S.calendars.push(cal); }
      const fresh = []; let pageToken = '';
      do {
        const d = await api(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(c.id)}/events?singleEvents=true&orderBy=startTime&maxResults=2500&timeMin=${timeMin}&timeMax=${timeMax}${pageToken ? '&pageToken=' + pageToken : ''}`);
        for (const it of d.items || []) {
          if (it.status === 'cancelled' || !it.start) continue;
          const allDay = !!it.start.date;
          fresh.push({
            id: uid(), gid: it.id, title: it.summary || '(Ohne Titel)', location: it.location || '', notes: it.description || '',
            start: allDay ? it.start.date + 'T00:00' : toLocal(new Date(it.start.dateTime)), end: allDay ? it.end.date + 'T00:00' : toLocal(new Date(it.end.dateTime)),
            allDay, calendarId: cal.id, fixed: true, rrule: null, exdates: [], source: 'google',
          });
        }
        pageToken = d.nextPageToken || '';
      } while (pageToken);
      S.events = S.events.filter(e => e.calendarId !== cal.id).concat(fresh);
      total += fresh.length;
    }
    save(); render(); toast(`${total} Termine aus Google kopiert ✓`);
  } catch (e) { console.error(e); toast('Google: ' + e.message, 5000); }
}

// ---------- Stundenplan ----------
function openTimetable() {
  const days = [1, 2, 3, 4, 5, 6];
  const paint = () => days.map(wd => {
    const ls = S.timetable.filter(l => +l.wd === wd).sort((a, b) => toMin(a.start) - toMin(b.start));
    if (wd === 6 && !ls.length) return `<div class="tt-day">Samstag</div><div class="group"><button class="cell action" data-tt-add="6">+ Stunde</button></div>`;
    return `<div class="tt-day">${WD_LONG[wd]}</div><div class="group">${ls.map(l => `
      <div class="cell tt-row"><input type="text" placeholder="Fach" value="${esc(l.subject)}" data-tt="${l.id}" data-f="subject">
        <input type="time" value="${l.start}" data-tt="${l.id}" data-f="start"><input type="time" value="${l.end}" data-tt="${l.id}" data-f="end">
        <button class="del" data-tt-del="${l.id}" aria-label="Löschen">⊖</button></div>`).join('')}
      <div class="cell tt-btns"><button class="link blue" data-tt-add="${wd}">+ Stunde</button>${wd > 1 ? `<button class="link blue" data-tt-copy="${wd}">wie ${WD[wd - 1]}</button>` : ''}</div></div>`;
  }).join('') + `<div class="group-title">Stundenzeiten deiner Schule</div><div class="group"><div class="cell"><textarea data-lt rows="4">${esc(S.settings.lessonTimes.join('\n'))}</textarea></div></div>
    <p class="help">Eine Zeile pro Stunde (z. B. <i>07:50-08:40</i>). „+ Stunde“ nimmt automatisch die nächste Zeit. Ganztägige Termine wie „Ferien“ oder „schulfrei“ im Kalender schalten die Schule für den Tag aus.</p>`;
  openSheet({
    title: 'Stundenplan', left: '', right: 'Fertig', body: paint(),
    onOpen(sh) {
      const body = sh.querySelector('.sheet-body');
      body.addEventListener('change', e => {
        const t = e.target;
        if (t.dataset.tt) { const l = S.timetable.find(x => x.id === t.dataset.tt); if (l) { l[t.dataset.f] = t.value; save(); render(); } }
        if (t.dataset.lt !== undefined) { S.settings.lessonTimes = t.value.split('\n').map(s => s.trim()).filter(s => /^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/.test(s)); save(); }
      });
      body.addEventListener('click', e => {
        const t = e.target.closest('button'); if (!t) return;
        if (t.dataset.ttAdd) {
          const wd = +t.dataset.ttAdd;
          const ls = S.timetable.filter(l => +l.wd === wd).sort((a, b) => toMin(a.start) - toMin(b.start));
          const lastEnd = ls.length ? toMin(ls.at(-1).end) : -1;
          const slot = S.settings.lessonTimes.map(s => s.split('-').map(x => x.trim())).find(([a]) => toMin(a) >= lastEnd);
          const [start, end] = slot || [hm(Math.max(lastEnd, 480) + 5), hm(Math.max(lastEnd, 480) + 55)];
          S.timetable.push({ id: uid(), wd, subject: '', room: '', start: start.padStart(5, '0'), end: end.padStart(5, '0') });
          save(); render(); body.innerHTML = paint();
          const inputs = $$(`[data-f=subject]`, body).filter(i => !i.value); inputs.at(-1)?.focus();
        }
        if (t.dataset.ttDel) { S.timetable = S.timetable.filter(l => l.id !== t.dataset.ttDel); save(); render(); body.innerHTML = paint(); }
        if (t.dataset.ttCopy) {
          const wd = +t.dataset.ttCopy;
          S.timetable = S.timetable.filter(l => +l.wd !== wd).concat(S.timetable.filter(l => +l.wd === wd - 1).map(l => ({ ...l, id: uid(), wd })));
          save(); render(); body.innerHTML = paint();
        }
      });
    },
  });
}

// ---------- Einstellungen ----------
function openSettings() {
  const st = S.settings;
  const inp = (label, key, type = 'text', extra = '') => `<div class="cell"><span class="grow">${label}</span><input type="${type}" class="right" data-set="${key}" value="${esc(st[key])}" ${extra}></div>`;
  const sel = (label, key, opts) => `<div class="cell"><span class="grow">${label}</span><select class="right" data-set="${key}">${opts.map(([v, l]) => `<option value="${v}" ${String(st[key]) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
  const body = `
    <div class="group-title">Tagesplan</div><div class="group">
      ${inp('Tag beginnt', 'dayStart', 'time')}${inp('Tag endet', 'dayEnd', 'time')}
      ${sel('Pause nach Aufgabe', 'breakMin', [0, 5, 10, 15, 20].map(m => [m, m + ' min']))}
      ${sel('Standarddauer Aufgabe', 'defaultTaskMin', [15, 20, 30, 45, 60].map(m => [m, m + ' min']))}
      <button class="cell" data-open="timetable"><span class="grow">Stundenplan</span><span class="val">${S.timetable.length} Stunden</span><span class="chev">›</span></button></div>
    <div class="group-title">KI-Assistent (Claude)</div><div class="group">
      <div class="cell"><span class="grow">API-Schlüssel</span><input type="password" class="right" data-set="apiKey" value="${esc(st.apiKey)}" placeholder="sk-ant-…" autocomplete="off"></div>
      ${sel('Modell', 'model', [['claude-opus-5-5', 'Claude Opus 5.5 (klügste)'], ['claude-sonnet-5-5', 'Claude Sonnet 5.5'], ['claude-haiku-5-5', 'Claude Haiku 5.5 (günstig)']])}
      ${sel('Gründlichkeit', 'aiEffort', [['low', 'Schnell'], ['medium', 'Mittel'], ['high', 'Gründlich']])}</div>
    <p class="help">Ohne Schlüssel funktioniert der Plan auch, dann mit fester Logik. Einen Schlüssel bekommst du auf <i>platform.claude.com</i> (kostenpflichtig, pro Planung meist unter einem Cent mit Haiku). Er bleibt nur auf diesem Gerät gespeichert.</p>
    <div class="group-title">Kalender</div><div class="group">
      ${sel('Standardansicht', 'defaultView', [['month', 'Monat'], ['week', 'Woche'], ['day', 'Tag'], ['list', 'Liste']])}
      ${sel('Woche beginnt am', 'weekStart', [[1, 'Montag'], [0, 'Sonntag']])}
      ${sel('Standarddauer Termin', 'defaultEventMin', [15, 30, 45, 60, 90, 120].map(m => [m, m + ' min']))}
      ${sel('Standardkalender', 'defaultCal', S.calendars.map(c => [c.id, esc(c.name)]))}
      <div class="cell"><span class="grow">Stundenplan im Kalender</span><label class="switch"><input type="checkbox" data-set="showTimetable" ${st.showTimetable ? 'checked' : ''}><span></span></label></div>
      <button class="cell" data-open="calendars"><span class="grow">Kalender & Google-Import</span><span class="chev">›</span></button></div>
    <div class="group-title">Google</div><div class="group">
      <div class="cell"><span class="grow">Client-ID</span><input type="text" class="right" data-set="googleClientId" value="${esc(st.googleClientId)}" placeholder="….apps.googleusercontent.com"></div></div>
    <p class="help">Nur für den direkten Google-Login nötig: In der Google Cloud Console ein Projekt anlegen → „Google Calendar API“ aktivieren → OAuth-Zustimmungsbildschirm (extern, dich selbst als Testnutzer) → Anmeldedaten → OAuth-Client-ID vom Typ „Webanwendung“ mit der Adresse dieser App als „Autorisierter JavaScript-Ursprung“.</p>
    <div class="group-title">Erinnerungen & Darstellung</div><div class="group">
      ${sel('Standardliste', 'defaultList', S.lists.map(l => [l.id, esc(l.name)]))}
      ${sel('Design', 'theme', [['system', 'Wie iPhone'], ['light', 'Hell'], ['dark', 'Dunkel']])}</div>
    <div class="group-title">Daten</div><div class="group">
      <button class="cell action" data-backup>Backup speichern (.json)</button>
      <label class="cell action" style="cursor:pointer">Backup laden<input type="file" accept=".json,application/json" hidden data-restore></label>
      <button class="cell danger" data-wipe>Alle Daten löschen</button></div>
    <p class="help">Alles wird nur auf diesem Gerät gespeichert. Mach ab und zu ein Backup.</p>`;
  openSheet({
    title: 'Einstellungen', left: '', right: 'Fertig', body,
    onOpen(sh, close) {
      const b = sh.querySelector('.sheet-body');
      b.addEventListener('change', async e => {
        const t = e.target;
        if (t.dataset.set) {
          const k = t.dataset.set;
          let v = t.type === 'checkbox' ? t.checked : t.value;
          if (['breakMin', 'defaultTaskMin', 'weekStart', 'defaultEventMin'].includes(k)) v = +v;
          if (k === 'apiKey' || k === 'googleClientId') v = v.trim();
          st[k] = v;
          if (k === 'dayStart' || k === 'dayEnd') Object.values(S.plans).forEach(p => p.anchor = null);
          if (k === 'defaultView') ui.cal.view = v;
          save(); applyTheme(); render();
        }
        if (t.dataset.restore !== undefined && t.files?.[0]) {
          try {
            const data = JSON.parse(await t.files[0].text());
            if (!data.settings || !data.events) throw new Error('kein Tagwerk-Backup');
            if (!confirm('Backup laden? Die aktuellen Daten werden ersetzt.')) return;
            localStorage.setItem(KEY, JSON.stringify(data)); load(); applyTheme(); render(); close(); toast('Backup geladen ✓');
          } catch (err) { toast('Backup ungültig: ' + err.message); }
        }
      });
      b.addEventListener('click', e => {
        const t = e.target.closest('button'); if (!t) return;
        if (t.dataset.open === 'timetable') openTimetable();
        if (t.dataset.open === 'calendars') openCalendars();
        if (t.dataset.backup !== undefined) {
          const blob = new Blob([JSON.stringify({ ...S, settings: { ...S.settings, apiKey: '' } }, null, 1)], { type: 'application/json' });
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `tagwerk-backup-${todayStr()}.json`; a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        }
        if (t.dataset.wipe !== undefined && confirm('Wirklich ALLE Termine, Erinnerungen und Einstellungen löschen?')) {
          localStorage.removeItem(KEY); load(); render(); close(); toast('Alles gelöscht');
        }
      });
    },
  });
}

// =====================================================================
//  Aktionen (Klicks)
// =====================================================================
const ACT = {
  settings: () => openSettings(),
  calendars: () => openCalendars(),
  timetable: () => openTimetable(),
  calView: el => { ui.cal.view = el.dataset.v; ui.cal.scrollTo = true; if (el.dataset.v !== 'month') ui.cal.cursor = parseYmd(ui.cal.sel); view.scrollTop = 0; render(); },
  calToday: () => { ui.cal.cursor = new Date(); ui.cal.sel = todayStr(); ui.cal.scrollTo = true; render(); },
  calPrev: () => calShift(-1), calNext: () => calShift(1),
  pickDay: el => {
    const k = el.dataset.date;
    if (ui.cal.sel === k) { ui.cal.view = 'day'; ui.cal.scrollTo = true; }
    ui.cal.sel = k; const d = parseYmd(k);
    if (d.getMonth() !== ui.cal.cursor.getMonth()) ui.cal.cursor = new Date(d.getFullYear(), d.getMonth(), 1);
    render.keepScroll = true; render();
  },
  gotoDay: el => { ui.cal.sel = el.dataset.date; ui.cal.cursor = parseYmd(el.dataset.date); ui.cal.view = 'day'; render.keepScroll = true; render(); },
  newEvent: () => openEventEditor(null, { date: ui.cal.sel }),
  openEvent: el => { const ev = S.events.find(e => e.id === el.dataset.id); if (ev) openEventEditor(ev, { date: el.dataset.date }); },
  slot: (el, e) => {
    if (e.target !== el) return;
    const y = e.clientY - el.getBoundingClientRect().top;
    const min = Math.max(0, Math.min(23 * 60, Math.floor(y / H * 2) * 30));
    ui.cal.sel = el.dataset.date;
    openEventEditor(null, { date: el.dataset.date, startMin: min });
  },
  pickColor: el => { const p = el.closest('.color-pick'); p.dataset.value = el.dataset.color; $$('button', p).forEach(b => b.classList.toggle('on', b === el)); },
  // Erinnerungen
  remHome: () => { ui.rem.screen = 'home'; view.scrollTop = 0; render(); },
  openList: el => { ui.rem.screen = 'list'; ui.rem.id = el.dataset.id; view.scrollTop = 0; render(); },
  openSmart: el => { ui.rem.screen = 'smart'; ui.rem.id = el.dataset.id; view.scrollTop = 0; render(); },
  newRem: () => openReminderEditor(null, {}),
  newList: () => openListEditor(null),
  editList: el => openListEditor(listById(el.dataset.id)),
  editRem: el => { const r = S.reminders.find(x => x.id === el.dataset.id); if (r) openReminderEditor(r); },
  toggleRem: el => toggleReminder(el.dataset.id),
  quickAdd: el => quickAdd(el),
  toggleShowDone: el => { const l = listById(el.dataset.id); l.showDone = !l.showDone; save(); render.keepScroll = true; render(); },
  // Tagesplan
  planPrev: () => { ui.plan.date = ymd(addDays(parseYmd(ui.plan.date), -1)); render(); },
  planNext: () => { ui.plan.date = ymd(addDays(parseYmd(ui.plan.date), 1)); render(); },
  planToday: () => { ui.plan.date = todayStr(); render(); },
  planDay: () => sendChat('✨ Plane meinen Tag', 'plan'),
  planReset: () => {
    if (!confirm('Chat-Einträge und KI-Reihenfolge für diesen Tag zurücksetzen?')) return;
    S.plans[ui.plan.date] = { extras: [], chat: [], anchor: null, aiOrder: null, aiDur: {}, taskIds: [] }; save(); render();
  },
  rmExtra: el => { const p = getPlan(ui.plan.date); p.extras = p.extras.filter(x => x.id !== el.dataset.id); save(); render.keepScroll = true; render(); },
  chip: el => { const t = el.dataset.text; if (/neu planen/i.test(t)) sendChat('Neu planen', aiReady() ? 'plan' : 'chat'); else sendChat(t); },
};
function calShift(n) {
  const c = ui.cal;
  if (c.view === 'month') { c.cursor = new Date(c.cursor.getFullYear(), c.cursor.getMonth() + n, 1); }
  else if (c.view === 'week') { c.cursor = addDays(c.cursor, 7 * n); c.sel = ymd(addDays(parseYmd(c.sel), 7 * n)); }
  else if (c.view === 'day') { c.sel = ymd(addDays(parseYmd(c.sel), n)); c.cursor = parseYmd(c.sel); }
  render.keepScroll = c.view !== 'month'; render();
}

document.addEventListener('click', e => {
  const tab = e.target.closest('[data-tab]');
  if (tab) {
    if (ui.tab === tab.dataset.tab && tab.dataset.tab === 'reminders') ui.rem.screen = 'home';
    ui.tab = tab.dataset.tab; try { localStorage.setItem('tagwerk.tab', ui.tab); } catch { }
    ui.cal.scrollTo = true; view.scrollTop = 0; render(); return;
  }
  const el = e.target.closest('[data-act]');
  if (el && ACT[el.dataset.act]) ACT[el.dataset.act](el, e);
});
document.addEventListener('input', e => {
  if (e.target.dataset.input === 'remSearch') {
    ui.rem.search = e.target.value;
    const pos = e.target.selectionStart; render.keepScroll = true; render();
    const s = $('[data-input=remSearch]'); s.focus(); s.setSelectionRange(pos, pos);
  }
});
document.addEventListener('submit', e => {
  if (e.target.dataset.form === 'chat') {
    e.preventDefault();
    const inp = e.target.querySelector('input'); const t = inp.value; inp.value = '';
    sendChat(t);
  }
});
// Wischen im Kalender: links/rechts = vor/zurück
let touch = null;
view.addEventListener('touchstart', e => { if (ui.tab === 'calendar' && e.target.closest('[data-swipe]')) touch = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() }; }, { passive: true });
view.addEventListener('touchend', e => {
  if (!touch) return;
  const dx = e.changedTouches[0].clientX - touch.x, dy = e.changedTouches[0].clientY - touch.y;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - touch.t < 600) calShift(dx < 0 ? 1 : -1);
  touch = null;
}, { passive: true });

// Jede Minute die "Jetzt"-Linie aktualisieren (nur wenn kein Eingabefeld aktiv ist)
setInterval(() => { if (!document.querySelector('.sheet') && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) { render.keepScroll = true; render(); } }, 60000);

applyTheme();
render();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { });
window.Tagwerk = { S: () => S, render, importICS, computePlan, parseCommandLocal, save };
