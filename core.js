'use strict';
/* =====================================================================
   Tagwerk · core.js – Helfer, Speicher, Termine, Stundenplan, Emojis,
   Statistik und Wetter. Alle anderen Dateien bauen darauf auf.
   ===================================================================== */

// ---------- Helfer ----------
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
const hm = min => { min = Math.round(min); return `${pad(Math.floor(min / 60) % 24)}:${pad(((min % 60) + 60) % 60)}`; };
const minOf = d => d.getHours() * 60 + d.getMinutes();
const todayStr = () => ymd(new Date());
const roundUp = (m, step) => Math.ceil(m / step) * step;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const WD_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const COLORS = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#30b0ff', '#6e5bff', '#b44cff', '#ff2d55', '#a2845e', '#8e8e93'];
const ACCENT = '#6e5bff';
const H = 52; // Pixel pro Stunde im Kalender-Zeitraster
const durLabel = m => { m = Math.round(m); return m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}` : `${m} min`; };
const normDate = x => (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)) ? x : null;
const normTime = x => { if (typeof x !== 'string') return null; const m = x.trim().match(/^(\d{1,2})[:.](\d{2})$/); return m && +m[1] < 24 && +m[2] < 60 ? `${pad(+m[1])}:${m[2]}` : null; };
const startOfWeekMon = d => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 864e5);
function relDay(date) {
  const t = todayStr();
  if (date === t) return 'heute';
  if (date === ymd(addDays(new Date(), 1))) return 'morgen';
  if (date === ymd(addDays(new Date(), -1))) return 'gestern';
  const d = parseYmd(date);
  return d.toLocaleDateString('de-AT', { weekday: 'short', day: 'numeric', month: 'numeric' });
}
function dueLabel(due, time) {
  if (!due) return '';
  const d = parseYmd(due), r = relDay(due);
  let s = r.charAt(0).toUpperCase() + r.slice(1);
  if (d.getFullYear() !== new Date().getFullYear() && !['heute', 'morgen', 'gestern'].includes(r)) s += ' ' + d.getFullYear();
  return time ? `${s}, ${time}` : s;
}
const inDays = date => { const n = daysBetween(todayStr(), date); return n === 0 ? 'heute' : n === 1 ? 'morgen' : n < 0 ? `vor ${-n} Tagen` : `in ${n} Tagen`; };

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
  mic: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
  chart: '<svg viewBox="0 0 24 24"><path d="M5 20V11M11 20V5M17 20v-7M3 20h18"/></svg>',
  sliders: '<svg viewBox="0 0 24 24"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
};

// ---------- App-Name (sichtbar) – die Speicher-Schlüssel unten bleiben bewusst gleich ----------
const APP_NAME = 'Tagwerk';

// ---------- Speicher ----------
const KEY = 'tagwerk.v1';
function defaults() {
  return {
    settings: {
      userName: '', dayStart: '07:00', dayEnd: '22:00', breakMin: 10, defaultTaskMin: 30, weekStart: 1, theme: 'system',
      defaultEventMin: 60, showTimetable: true, apiKey: '', model: 'claude-opus-5-5', aiEffort: 'low',
      googleClientId: '', defaultCal: 'personal', defaultList: 'inbox', defaultView: 'month',
      lessonTimes: ['07:50-08:40', '08:45-09:35', '09:50-10:40', '10:45-11:35', '11:40-12:30', '12:35-13:25', '13:30-14:20', '14:25-15:15', '15:20-16:10'],
      weatherCity: '', rewards: true, rewardAfterMin: 90, rewardMin: 20, rewardTitle: 'Freizeit',
      focusMin: 25, focusBreak: 5, pomodoro: true, eveningReview: '20:00',
      abWeeks: false, abRef: null, voiceReplies: true, liveMode: true, onboarded: false, aiHintSeen: false,
    },
    calendars: [
      { id: 'personal', name: 'Privat', color: '#30b0ff', visible: true, source: 'local' },
      { id: 'school', name: 'Schule', color: '#ff9500', visible: true, source: 'local' },
      { id: 'sport', name: 'Training & Hobbys', color: '#34c759', visible: true, source: 'local' },
    ],
    events: [], timetable: [], ttOverrides: {}, routines: [],
    lists: [
      { id: 'inbox', name: 'Erinnerungen', color: '#6e5bff' },
      { id: 'school', name: 'Schule', color: '#ff9500' },
    ],
    reminders: [], plans: {}, doneLog: [], subjectColors: {}, focus: null, weather: null, ver: 0,
  };
}
function migrate(s) {
  const d = defaults();
  s = { ...d, ...s, settings: { ...d.settings, ...(s.settings || {}) } };
  s.routines ||= []; s.ttOverrides ||= {}; s.doneLog ||= []; s.subjectColors ||= {}; s.plans ||= {};
  s.untis ??= null; s.calRules ||= { note: '', exclude: [], only: [] };
  if (s.untis?.days) { const old2 = ymd(addDays(new Date(), -14)); for (const k of Object.keys(s.untis.days)) if (k < old2) delete s.untis.days[k]; }
  for (const r of s.reminders) { r.subtasks ||= []; r.repeat ??= null; r.planDate ??= null; r.planTime ??= null; r.postponed ??= 0; r.notes ??= ''; }
  for (const l of s.timetable) { l.week ||= 'all'; l.teacher ??= ''; l.room ??= ''; }
  const old = ymd(addDays(new Date(), -60));
  for (const [k, p] of Object.entries(s.plans)) { if (k < old) { delete s.plans[k]; continue; } p.extras ||= []; p.aiDur ||= {}; p.taskIds ||= []; p.skipRoutines ||= []; delete p.chat; }
  for (const k of Object.keys(s.ttOverrides)) if (k < old) delete s.ttOverrides[k];
  if (!s.settings.onboarded && (s.events.length || s.timetable.length || s.reminders.length)) s.settings.onboarded = true;
  return s;
}
let S;
function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    S = raw ? migrate(raw) : defaults();
  } catch (e) { console.warn(e); S = defaults(); }
}
function save() {
  S.ver = (S.ver || 0) + 1;
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Speichern fehlgeschlagen – Speicher voll?'); }
}
function saveQuiet() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { } }
load();

const calById = id => S.calendars.find(c => c.id === id);
const listById = id => S.lists.find(l => l.id === id);
const calColor = id => calById(id)?.color || '#8e8e93';

// ---------- Rückgängig ----------
const undoStore = new Map();
function makeUndo() {
  const id = uid(); undoStore.set(id, JSON.stringify(S));
  if (undoStore.size > 15) undoStore.delete(undoStore.keys().next().value);
  return id;
}
function doUndo(id) {
  const snap = undoStore.get(id);
  if (!snap) { toast('Das kann nicht mehr rückgängig gemacht werden.'); return false; }
  S = migrate(JSON.parse(snap)); save(); undoStore.delete(id);
  render(); toast('Rückgängig gemacht ↶');
  return true;
}

// ---------- Hinweise ----------
function toast(msg, opt = {}) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${opt.action ? `<button>${esc(opt.action)}</button>` : ''}`;
  if (opt.action) t.querySelector('button').onclick = () => { t.classList.remove('show'); opt.onAction?.(); };
  t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), opt.ms || (opt.action ? 5000 : 2600));
}
function applyTheme() {
  const t = S.settings.theme;
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = t;
}
function confetti(x, y) {
  const colors = ['#6e5bff', '#b44cff', '#ffcc00', '#34c759', '#ff2d55', '#30b0ff'];
  for (let i = 0; i < 28; i++) {
    const s = document.createElement('i'); s.className = 'confetti';
    s.style.left = x + 'px'; s.style.top = y + 'px'; s.style.background = colors[i % colors.length];
    document.body.append(s);
    const a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 80;
    s.animate([
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d + 40}px)) rotate(${Math.random() * 540}deg) scale(.5)`, opacity: 0 },
    ], { duration: 700 + Math.random() * 500, easing: 'cubic-bezier(.2,.8,.3,1)' }).onfinish = () => s.remove();
  }
  try { navigator.vibrate?.(15); } catch { }
}
function beep() {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    [0, .25].forEach(t => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ac.destination);
      g.gain.setValueAtTime(.0001, ac.currentTime + t); g.gain.exponentialRampToValueAtTime(.25, ac.currentTime + t + .02);
      g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + t + .2);
      o.start(ac.currentTime + t); o.stop(ac.currentTime + t + .22);
    });
  } catch { }
}

// =====================================================================
//  Wiederholungen & Termin-Instanzen
// =====================================================================
function nthWeekday(y, m, wd, nth, h, mi) {
  const first = new Date(y, m, 1);
  if (nth > 0) {
    const d = new Date(y, m, 1 + ((wd - first.getDay() + 7) % 7) + (nth - 1) * 7, h, mi);
    return d.getMonth() === first.getMonth() ? d : null;
  }
  const last = new Date(y, m + 1, 0);
  const d = new Date(y, m, last.getDate() - ((last.getDay() - wd + 7) % 7) + (nth + 1) * 7, h, mi);
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
    for (let g = 0; g < 20000; i++, g++) if (!push(new Date(s0.getFullYear(), s0.getMonth(), s0.getDate() + i * interval, Hh, M))) break;
  } else if (r.freq === 'WEEKLY') {
    const days = (r.byday && r.byday.length ? r.byday : [s0.getDay()]).slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    const wk = addDays(startOfDay(s0), -((s0.getDay() + 6) % 7));
    let w = 0;
    if (!r.count) { const skip = Math.floor((from - wk - dur) / (7 * 864e5 * interval)) - 1; if (skip > 0) w = skip; }
    outer: for (let g = 0; g < 6000; w++, g++) {
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
const instCache = new Map();
function instances(from, to) {
  const key = `${S.ver}|${+from}|${+to}`;
  if (instCache.has(key)) return instCache.get(key);
  const out = [];
  for (const ev of S.events) {
    const cal = calById(ev.calendarId);
    if (cal && cal.visible === false) continue;
    for (const [s, e] of expand(ev, from, to)) out.push({ ev, s, e, color: cal?.color || '#8e8e93' });
  }
  if (instCache.size > 60) instCache.clear();
  instCache.set(key, out);
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
function repeatToRRule(rep, s) {
  const wd = s.getDay();
  return ({
    daily: { freq: 'DAILY', interval: 1 }, weekdays: { freq: 'WEEKLY', interval: 1, byday: [1, 2, 3, 4, 5] },
    weekly: { freq: 'WEEKLY', interval: 1, byday: [wd] }, biweekly: { freq: 'WEEKLY', interval: 2, byday: [wd] },
    monthly: { freq: 'MONTHLY', interval: 1 }, yearly: { freq: 'YEARLY', interval: 1 },
  })[rep] || null;
}

// =====================================================================
//  Stundenplan (A/B-Wochen, Entfall, Vertretung)
// =====================================================================
function weekType(date) {
  if (!S.settings.abWeeks || !S.settings.abRef) return null;
  const w = Math.round((startOfWeekMon(parseYmd(date)) - startOfWeekMon(parseYmd(S.settings.abRef))) / (7 * 864e5));
  return Math.abs(w) % 2 === 0 ? 'A' : 'B';
}
function isFreeDay(date) {
  return dayInstances(date).some(i => i.ev.allDay && /ferien|schulfrei|frei\b|feiertag|urlaub|autonom/i.test(i.ev.title));
}
function lessonsOn(date, withCancelled = false) {
  const wd = parseYmd(date).getDay(), wt = weekType(date), ov = S.ttOverrides[date] || {};
  const ud = S.untis?.days?.[date];
  // Echte Stunden aus WebUntis (nächste 2 Wochen) haben Vorrang vor dem Wochenmuster
  const base = ud && typeof untisKeep === 'function'
    ? ud.filter(untisKeep).map(l => ({
      id: 'ud' + l.id, wd, start: l.start, end: l.end, room: l.room, teacher: l.teacher, week: 'all', untis: true,
      subject: untisName(l.subject), origSubject: untisName(l.orig || l.subject), cancelled: l.status === 'cancelled',
      substituted: l.status === 'changed' && !!l.orig, changed: l.status === 'changed', extra: l.status === 'extra', exam: l.status === 'exam' || !!l.exam, note: l.info || '',
    }))
    : S.timetable.filter(l => +l.wd === wd && l.start && l.end && (!wt || !l.week || l.week === 'all' || l.week === wt));
  return base
    .map(l => {
      const o = ov[l.id];
      if (!o) return l;
      return { ...l, cancelled: l.cancelled || !!o.cancel, substituted: l.substituted || !!o.subject, origSubject: l.origSubject || l.subject, subject: o.subject || l.subject, room: o.room || l.room, note: o.note || l.note || '' };
    })
    .filter(l => withCancelled || !l.cancelled)
    .sort((a, b) => toMin(a.start) - toMin(b.start));
}
function schoolBlocks(date) {
  if ((!S.timetable.length && !S.untis?.days?.[date]) || isFreeDay(date)) return [];
  const blocks = [];
  for (const l of lessonsOn(date)) {
    const s = toMin(l.start), e = toMin(l.end), last = blocks.at(-1);
    if (last && s - last.e <= 20) { last.e = Math.max(last.e, e); last.subjects.push(l.subject); }
    else blocks.push({ s, e, subjects: [l.subject] });
  }
  blocks.forEach(b => b.subjects = b.subjects.filter(Boolean));
  return blocks;
}
const subjects = () => [...new Set(S.timetable.map(l => (l.subject || '').trim()).filter(Boolean))];
function subjectOf(title) {
  const t = (title || '').toLowerCase();
  return subjects().sort((a, b) => b.length - a.length).find(s => t.includes(s.toLowerCase())) || null;
}
function subjectColor(s) {
  if (!s) return null;
  if (S.subjectColors[s]) return S.subjectColors[s];
  let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % (COLORS.length - 1)];
}
function itemColor(r) { return subjectColor(subjectOf(r.title)) || listById(r.listId)?.color || ACCENT; }

// =====================================================================
//  Emojis – werden aus dem Titel erkannt
// =====================================================================
const EMOJI_RULES = [
  [/heimfahrt|heimweg|fahrt|\bbus\b|\bzug\b|bahn|öffis?/i, '🚌'], [/frühstück/i, '🥐'], [/abendessen/i, '🍽️'],
  [/mittag|essen|jause|kochen/i, '🍝'], [/pause|chill|kaffee|snack/i, '☕'], [/freizeit|gaming|zocken|playstation|netflix|serie/i, '🎮'],
  [/schularbeit|prüfung|\btest|klausur|\bsa\b/i, '📝'], [/referat|präsentation/i, '🎤'], [/vokabel/i, '🧠'],
  [/mathe/i, '📐'], [/deutsch/i, '📖'], [/englisch|english/i, '🇬🇧'], [/franz/i, '🇫🇷'], [/spanisch/i, '🇪🇸'], [/italienisch/i, '🇮🇹'],
  [/latein/i, '🏺'], [/\bbio/i, '🧬'], [/physik/i, '⚛️'], [/chemie/i, '🧪'], [/geschichte/i, '🏛️'], [/\bgeo/i, '🌍'],
  [/informatik|coding|programmier/i, '💻'], [/kunst|zeichnen|malen|\bbe\b/i, '🎨'], [/religion|ethik/i, '🕊️'],
  [/lernen|wiederholen|üben/i, '🧠'], [/\bhü\b|hausübung|hausaufgabe|aufgabe/i, '✏️'],
  [/schwimm/i, '🏊'], [/tanz/i, '💃'], [/fußball|fussball|training|sport|turnen|laufen|joggen|fitness|basketball|volleyball|tennis/i, '⚽'],
  [/klavier/i, '🎹'], [/band|probe|gitarre|schlagzeug|musik|chor|geige/i, '🎸'],
  [/arzt|zahnarzt|ordination/i, '🩺'], [/geburtstag/i, '🎂'], [/party|feier/i, '🎉'], [/aufräumen|zimmer|putzen/i, '🧹'],
  [/einkauf|kaufen|geschenk|shoppen/i, '🛍️'], [/duschen/i, '🚿'], [/schlaf/i, '😴'], [/lesen|buch/i, '📚'],
  [/anruf|telefon/i, '📞'], [/hund|gassi/i, '🐕'], [/ferien|urlaub/i, '🏖️'], [/kino|film/i, '🎬'], [/freund|treffen/i, '👋'],
  [/nachhilfe/i, '🧑‍🏫'], [/schule|unterricht/i, '🏫'],
];
function emojiFor(title, fallback = '') {
  if (/^\p{Extended_Pictographic}/u.test(title || '')) return '';
  for (const [re, e] of EMOJI_RULES) if (re.test(title || '')) return e;
  return fallback;
}
const withEmoji = (title, fb = '') => { const e = emojiFor(title, fb); return e ? `${e} ${title}` : title; };

// =====================================================================
//  Statistik: Erledigt-Protokoll und Serien
// =====================================================================
function logDone(rid, title, minutes) {
  S.doneLog.push({ rid, title, date: todayStr(), minutes: Math.max(1, Math.round(minutes || 0)), subject: subjectOf(title) });
  if (S.doneLog.length > 3000) S.doneLog.splice(0, S.doneLog.length - 3000);
}
function unlogDone(rid) {
  const i = S.doneLog.findLastIndex(x => x.rid === rid && x.date === todayStr());
  if (i >= 0) S.doneLog.splice(i, 1);
}
function dayCounts(date) {
  if (!S.doneLog.some(x => x.date === date)) return false;
  return !S.reminders.some(r => r.due === date && !r.done && !r.repeat);
}
function streak() {
  let n = 0, d = new Date();
  if (!dayCounts(ymd(d))) d = addDays(d, -1);
  for (let g = 0; g < 400 && dayCounts(ymd(d)); g++, d = addDays(d, -1)) n++;
  return n;
}

// =====================================================================
//  Wetter (Open-Meteo, ohne Schlüssel)
// =====================================================================
const WMO = c => c === 0 ? '☀️' : c <= 2 ? '🌤️' : c === 3 ? '☁️' : c <= 48 ? '🌫️' : c <= 57 ? '🌦️' : c <= 67 ? '🌧️' : c <= 77 ? '🌨️' : c <= 82 ? '🌦️' : c <= 86 ? '🌨️' : '⛈️';
async function refreshWeather(force = false) {
  const city = (S.settings.weatherCity || '').trim();
  if (!city) return;
  const w = S.weather;
  if (!force && w && w.city === city && Date.now() - w.at < 3 * 3600e3) return;
  try {
    let lat = w?.city === city ? w.lat : null, lon = w?.city === city ? w.lon : null, name = w?.name;
    if (lat == null) {
      const g = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=de`)).json();
      if (!g.results?.length) { toast(`Ort „${city}“ nicht gefunden`); return; }
      ({ latitude: lat, longitude: lon, name } = g.results[0]);
    }
    const d = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=7`)).json();
    S.weather = { city, name, lat, lon, at: Date.now(), current: d.current, daily: d.daily };
    saveQuiet(); render.keepScroll = true; render();
  } catch (e) { console.warn('Wetter', e); }
}
function weatherFor(date) {
  const w = S.weather; if (!w?.daily?.time) return null;
  const i = w.daily.time.indexOf(date); if (i < 0) return null;
  const isToday = date === todayStr() && w.current;
  return {
    emoji: WMO(isToday ? w.current.weather_code : w.daily.weather_code[i]),
    temp: Math.round(isToday ? w.current.temperature_2m : w.daily.temperature_2m_max[i]),
    max: Math.round(w.daily.temperature_2m_max[i]), min: Math.round(w.daily.temperature_2m_min[i]),
    rain: w.daily.precipitation_probability_max?.[i] ?? 0,
  };
}
