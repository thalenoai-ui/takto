'use strict';
/* =====================================================================
   Tagwerk · views.js – zeichnet Kalender, Erinnerungen und Tagesplan
   ===================================================================== */

const ui = {
  tab: (() => { try { return localStorage.getItem('tagwerk.tab') || 'plan'; } catch { return 'plan'; } })(),
  cal: { view: S.settings.defaultView || 'month', cursor: new Date(), sel: todayStr(), scrollTo: true },
  rem: { screen: 'home', id: null, search: '', recent: {} },
  plan: { date: todayStr() },
};
const view = $('#view');
const aiReady = () => !!(S.settings.apiKey && window.TagwerkAI);

function viewSig() {
  if (ui.tab === 'calendar') return `c|${ui.cal.view}|${ui.cal.sel}|${ui.cal.cursor.getMonth()}`;
  if (ui.tab === 'reminders') return `r|${ui.rem.screen}|${ui.rem.id}`;
  return `p|${ui.plan.date}`;
}
function render() {
  $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === ui.tab));
  const sig = viewSig(), animate = sig === render.lastSig;
  const before = new Map();
  if (animate) $$('[data-flip]', view).forEach(el => before.set(el.dataset.key, el.getBoundingClientRect().top));
  const keep = view.scrollTop;
  if (ui.tab === 'calendar') view.innerHTML = renderCalendar();
  else if (ui.tab === 'reminders') view.innerHTML = renderReminders();
  else view.innerHTML = renderPlan();
  if (ui.tab === 'calendar' && (ui.cal.view === 'week' || ui.cal.view === 'day') && ui.cal.scrollTo) { view.scrollTop = 7 * H; ui.cal.scrollTo = false; }
  else if (animate || render.keepScroll) view.scrollTop = keep;
  else view.scrollTop = 0;
  if (animate && before.size) {
    $$('[data-flip]', view).forEach(el => {
      const old = before.get(el.dataset.key), now = el.getBoundingClientRect().top;
      if (old != null) { const dy = old - now; if (Math.abs(dy) > 1) el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 480, easing: 'cubic-bezier(.2,.8,.2,1)' }); }
      else el.animate([{ opacity: 0, transform: 'scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'ease-out' });
    });
  }
  render.lastSig = sig; render.keepScroll = false;
  if (typeof updateFocusPill === 'function') updateFocusPill();
}

// =====================================================================
//  Kalender
// =====================================================================
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
const navRow = label => `<div class="cal-nav"><button data-act="calPrev" aria-label="Zurück">‹</button><div class="month-label">${label}</div><button data-act="calNext" aria-label="Weiter">›</button></div>`;
function startOfWeek(d) { return addDays(startOfDay(d), -((d.getDay() - S.settings.weekStart + 7) % 7)); }
function renderCalendar() {
  const v = ui.cal.view;
  return v === 'month' ? monthView() : v === 'week' ? weekView() : v === 'day' ? dayView() : listView();
}
function emptyHint() {
  if (S.events.length || S.timetable.length) return '';
  return `<div class="card"><b>Dein Kalender ist noch leer</b><p>Hol deine Termine aus Google und trag deinen Stundenplan ein – dann weiß der Tagesplan Bescheid.</p>
    <div class="hint-actions"><button class="btn secondary" data-act="calendars">Google importieren</button><button class="btn secondary" data-act="timetable">Stundenplan</button></div></div>`;
}
function monthView() {
  const cur = ui.cal.cursor, y = cur.getFullYear(), m = cur.getMonth();
  const first = new Date(y, m, 1), last = new Date(y, m + 1, 0), gs = startOfWeek(first);
  const total = Math.ceil((Math.round((first - gs) / 864e5) + last.getDate()) / 7) * 7;
  const map = byDay(gs, addDays(gs, total)), today = todayStr();
  const wdOrder = [...Array(7)].map((_, i) => WD[(i + S.settings.weekStart) % 7]);
  let cells = '';
  for (let i = 0; i < total; i++) {
    const d = addDays(gs, i), k = ymd(d), list = map[k] || [];
    const cols = [...new Set(list.map(x => x.color))];
    if (S.settings.showTimetable && schoolBlocks(k).length) cols.push(calColor('school'));
    const dots = [...new Set(cols)].slice(0, 3).map(c => `<i style="background:${c}"></i>`).join('');
    const cls = ['mday', d.getMonth() !== m && 'other', k === today && 'today', k === ui.cal.sel && 'sel', (d.getDay() % 6 === 0) && 'weekend'].filter(Boolean).join(' ');
    cells += `<button class="${cls}" data-act="pickDay" data-date="${k}" data-key="day:${k}"><span class="num">${d.getDate()}</span><span class="dots">${dots}</span></button>`;
  }
  const sel = parseYmd(ui.cal.sel);
  return calHead(navRow(first.toLocaleDateString('de-AT', { month: 'long', year: 'numeric' })) + `<div class="weekdays">${wdOrder.map(w => `<div>${w}</div>`).join('')}</div>`) +
    `<div class="month-grid" data-swipe="1">${cells}</div>
     <div class="day-title">${WD_LONG[sel.getDay()]}, ${sel.toLocaleDateString('de-AT', { day: 'numeric', month: 'long' })}${weekType(ui.cal.sel) ? ` · ${weekType(ui.cal.sel)}-Woche` : ''}</div>
     ${dayAgenda(ui.cal.sel)}${emptyHint()}`;
}
function agendaItems(date) {
  const list = dayInstances(date).map(it => ({ kind: 'event', it }));
  if (S.settings.showTimetable) schoolBlocks(date).forEach((b, i) => list.push({ kind: 'school', b, i }));
  const key = x => x.kind === 'school' ? x.b.s : (x.it.ev.allDay ? -1 : (ymd(x.it.s) < date ? 0 : minOf(x.it.s)));
  return list.sort((a, b) => key(a) - key(b));
}
function dayAgenda(date) {
  const items = agendaItems(date);
  const cancelled = lessonsOn(date, true).filter(l => l.cancelled);
  if (!items.length && !cancelled.length) return `<div class="empty">Keine Ereignisse</div>`;
  const cancelNote = cancelled.length ? `<button class="ev-row" data-act="lessonDay" data-date="${date}" data-key="sch:${date}"><div class="t"><b>🚫</b></div><div class="bar" style="background:${calColor('school')}"></div>
    <div class="info"><div class="ti">Entfällt: ${esc(cancelled.map(l => l.subject).join(', '))}</div><div class="sub">Stundenplan-Änderung für diesen Tag</div></div></button>` : '';
  return `<div class="day-list">${items.map(x => {
    if (x.kind === 'school') {
      const subs = lessonsOn(date).filter(l => toMin(l.start) >= x.b.s && toMin(l.end) <= x.b.e);
      const changed = subs.some(l => l.substituted);
      return `<button class="ev-row" data-act="lessonDay" data-date="${date}" ${x.i === 0 ? `data-key="sch:${date}"` : ''}><div class="t"><b>${hm(x.b.s)}</b>${hm(x.b.e)}</div><div class="bar" style="background:${calColor('school')}"></div>
        <div class="info"><div class="ti">🏫 Schule${changed ? ' · Vertretung' : ''}</div><div class="sub">${esc(subs.map(l => l.subject + (l.substituted ? '*' : '')).join(' · ') || 'Stundenplan')}</div></div></button>`;
    }
    const { ev, s, e, color } = x.it;
    const startsToday = ymd(s) === date, endsToday = ymd(e) === date || (ymd(addDays(e, -1)) === date && minOf(e) === 0);
    const t = ev.allDay ? `<b>ganztägig</b>` : `<b>${startsToday ? hm(minOf(s)) : '00:00'}</b>${endsToday && minOf(e) ? hm(minOf(e)) : (endsToday ? '24:00' : '…')}`;
    const sub = [ev.location, ev.rrule ? '↻ wiederholt sich' : '', ev.fixed === false ? 'flexibel' : ''].filter(Boolean).join(' · ');
    return `<button class="ev-row" data-act="openEvent" data-id="${ev.id}" data-date="${ymd(s)}" data-key="ev:${ev.id}"><div class="t">${t}</div><div class="bar" style="background:${color}"></div>
      <div class="info"><div class="ti">${esc(withEmoji(ev.title))}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div></button>`;
  }).join('')}${cancelNote}</div>`;
}
function weekView() {
  const ws = startOfWeek(ui.cal.cursor), we = addDays(ws, 6);
  const dates = [...Array(7)].map((_, i) => ymd(addDays(ws, i)));
  const label = ws.getMonth() === we.getMonth() ? ws.toLocaleDateString('de-AT', { month: 'long', year: 'numeric' })
    : `${ws.toLocaleDateString('de-AT', { month: 'short' })} – ${we.toLocaleDateString('de-AT', { month: 'short', year: 'numeric' })}`;
  return calHead(navRow(label + (weekType(dates[0]) ? ` · ${weekType(dates[0])}` : '')) + gridHead(dates)) + timeGrid(dates);
}
function dayView() {
  const sel = parseYmd(ui.cal.sel), ws = startOfWeek(sel), today = todayStr();
  const strip = [...Array(7)].map((_, i) => {
    const d = addDays(ws, i), k = ymd(d);
    return `<button class="${k === today ? 'today' : ''} ${k === ui.cal.sel ? 'sel' : ''}" data-act="gotoDay" data-date="${k}">${WD[d.getDay()]}<b>${d.getDate()}</b></button>`;
  }).join('');
  const label = `${WD_LONG[sel.getDay()]}, ${sel.toLocaleDateString('de-AT', { day: 'numeric', month: 'long' })}`;
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
    `<div>${(map[k] || []).filter(i => i.ev.allDay).map(i => `<div class="chip" style="background:${i.color}" data-act="openEvent" data-id="${i.ev.id}" data-date="${ymd(i.s)}" data-key="ev:${i.ev.id}">${esc(i.ev.title)}</div>`).join('')}</div>`).join('')}</div>` : '';
  return head + allday;
}
function layoutCol(items) {
  items.sort((a, b) => a.sMin - b.sMin || b.eMin - a.eMin);
  const clusters = []; let cur = [], end = -1;
  for (const it of items) { if (cur.length && it.sMin >= end) { clusters.push(cur); cur = []; end = -1; } cur.push(it); end = Math.max(end, it.eMin); }
  if (cur.length) clusters.push(cur);
  for (const cl of clusters) {
    const lanes = [];
    for (const it of cl) { let l = lanes.findIndex(e => e <= it.sMin); if (l < 0) { l = lanes.length; lanes.push(0); } lanes[l] = it.eMin; it.lane = l; }
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
      sMin: i.s < day ? 0 : minOf(i.s), eMin: i.e >= next ? 1440 : minOf(i.e), title: withEmoji(i.ev.title), sub: i.ev.location,
      color: i.color, act: `data-act="openEvent" data-id="${i.ev.id}" data-date="${ymd(i.s)}" data-key="ev:${i.ev.id}"`,
    }));
    if (S.settings.showTimetable && !isFreeDay(k)) for (const l of lessonsOn(k, true)) items.push({
      sMin: toMin(l.start), eMin: toMin(l.end), title: l.subject || 'Stunde', sub: [l.room, l.teacher].filter(Boolean).join(' · '),
      color: subjectColor(l.subject) || calColor('school'), lesson: true, cancelled: l.cancelled, act: `data-act="lessonDay" data-date="${k}" data-key="ls:${l.id}"`,
    });
    layoutCol(items);
    const blocks = items.map(it => {
      const top = it.sMin / 60 * H, h = Math.max(it.eMin - it.sMin, 20) / 60 * H - 2, w = 100 / it.lanes;
      return `<div class="block ${it.lesson ? 'timetable' : ''} ${it.cancelled ? 'cancelled' : ''}" ${it.act} style="top:${top}px;height:${h}px;left:calc(${it.lane * w}% + 1px);width:calc(${w}% - 3px);background:${it.color}2e;border-color:${it.color}">
        <b>${esc(it.title)}</b>${h > 34 ? `<span>${hm(it.sMin)}${it.sub ? ' · ' + esc(it.sub) : ''}</span>` : ''}</div>`;
    }).join('');
    const now = k === today ? `<div class="now-line" style="top:${minOf(new Date()) / 60 * H}px"></div>` : '';
    return `<div class="col" data-act="slot" data-date="${k}" style="height:${24 * H}px">${blocks}${now}</div>`;
  }).join('');
  return `<div class="grid-wrap" data-swipe="1" style="grid-template-columns:${gtc}"><div class="hours">${hours}</div>${cols}</div>`;
}
function listView() {
  const from = startOfDay(new Date()), to = addDays(from, 90);
  let html = '';
  for (let d = from; d < to; d = addDays(d, 1)) {
    const k = ymd(d);
    if (!agendaItems(k).length) continue;
    html += `<div class="list-day">${k === todayStr() ? 'Heute · ' : ''}${WD_LONG[d.getDay()]}, ${d.toLocaleDateString('de-AT', { day: 'numeric', month: 'long' })}</div>${dayAgenda(k)}`;
  }
  return calHead() + (html || `<div class="empty">In den nächsten 90 Tagen ist nichts eingetragen.</div>`) + emptyHint();
}

// =====================================================================
//  Erinnerungen
// =====================================================================
const REPEAT_LABEL = { daily: 'täglich', weekdays: 'Mo–Fr', weekly: 'wöchentlich', monthly: 'monatlich' };
const isOverdue = r => !r.done && r.due && (r.due < todayStr() || (r.due === todayStr() && r.time && toMin(r.time) < minOf(new Date())));
const visibleDone = r => r.done && ui.rem.recent[r.id] && Date.now() - ui.rem.recent[r.id] < 1600;
function smartSets() {
  const t = todayStr(), open = S.reminders.filter(r => !r.done);
  return {
    today: open.filter(r => (r.due && r.due <= t) || r.planDate === t),
    scheduled: open.filter(r => r.due || r.planDate),
    all: open, flagged: open.filter(r => r.flagged), done: S.reminders.filter(r => r.done),
  };
}
const SMART = {
  today: { name: 'Heute', color: '#30b0ff', icon: I.cal },
  scheduled: { name: 'Geplant', color: '#ff3b30', icon: I.clock },
  all: { name: 'Alle', color: '#5b5b66', icon: I.tray },
  flagged: { name: 'Markiert', color: '#ff9500', icon: I.flag },
  done: { name: 'Erledigt', color: '#8e8e93', icon: I.check },
};
function renderReminders() {
  const r = ui.rem;
  if (r.screen === 'list') return remListScreen(r.id);
  if (r.screen === 'smart') return remSmartScreen(r.id);
  const sets = smartSets(), q = r.search.trim().toLowerCase();
  let body;
  if (q) {
    const res = S.reminders.filter(x => (x.title + ' ' + (x.notes || '')).toLowerCase().includes(q));
    body = `<div class="rem-list group">${res.map(x => remRow(x, { showList: true })).join('') || '<div class="empty">Keine Treffer</div>'}</div>`;
  } else {
    body = `<div class="smart-grid">${Object.entries(SMART).map(([k, v]) => `
      <button class="smart" data-act="openSmart" data-id="${k}"><span class="ico" style="background:${v.color}">${v.icon}</span><span class="n">${k === 'done' ? '' : sets[k].length}</span><span class="l">${v.name}</span></button>`).join('')}</div>
      <div class="section-title">Meine Listen</div>
      <div class="group">${S.lists.map(l => `<button class="cell" data-act="openList" data-id="${l.id}"><span class="ico" style="background:${l.color}">${I.list}</span>
        <span class="grow">${esc(l.name)}</span><span class="val">${S.reminders.filter(x => x.listId === l.id && !x.done).length}</span><span class="chev">›</span></button>`).join('')}</div>`;
  }
  return `<div class="sticky-head"><div class="topbar"><div class="left"><button class="icon-btn" data-act="settings" aria-label="Einstellungen">${I.gear}</button></div>
      <div class="right"><button class="link" data-act="newList">Liste hinzufügen</button></div></div></div>
    <h1 class="big-title">Erinnerungen</h1>
    <div class="search">🔍<input type="search" placeholder="Suchen" value="${esc(r.search)}" data-input="remSearch"></div>
    ${body}
    <div class="bottom-actions"><button class="add-row" data-act="newRem"><span class="plus">+</span>Neue Erinnerung</button></div>
    <p class="help center">Tipp: Nach rechts wischen = erledigt · nach links = morgen / löschen</p>`;
}
function remRow(r, o = {}) {
  const list = listById(r.listId), c = list?.color || ACCENT, subj = subjectOf(r.title);
  const meta = [];
  if (r.due && !(r.planDate === r.due && !r.time && !r.done)) meta.push(`<span class="${isOverdue(r) ? 'late' : ''}">${dueLabel(r.due, r.time)}</span>`);
  if (r.planDate && !r.done) meta.push(`<span class="planned">📌 ${relDay(r.planDate)}${r.planTime ? ' ' + r.planTime : ''}</span>`);
  if (r.repeat) meta.push(`<span>↻ ${REPEAT_LABEL[r.repeat] || ''}</span>`);
  if (r.duration) meta.push(`<span>⏱ ${durLabel(r.duration)}</span>`);
  if (subj) meta.push(`<span class="subj" style="--sc:${subjectColor(subj)}">${esc(subj)}</span>`);
  if (o.showList && list) meta.push(`<span>${esc(list.name)}</span>`);
  if (r.subtasks?.length) meta.push(`<span>☑ ${r.subtasks.filter(s => s.done).length}/${r.subtasks.length}</span>`);
  if (r.notes) meta.push(`<span class="note">${esc(r.notes.split('\n')[0].slice(0, 60))}</span>`);
  const prio = r.priority ? `<span class="prio">${'!'.repeat(r.priority)}</span>` : '';
  const em = emojiFor(r.title);
  const subs = !r.done && r.subtasks?.length ? `<div class="subs">${r.subtasks.map(s => `<div class="sub-item"><button class="circle small ${s.done ? 'on' : ''}" data-act="toggleSub" data-id="${r.id}" data-sub="${s.id}" aria-label="Unteraufgabe erledigt"></button><span class="${s.done ? 'done-t' : ''}">${esc(s.title)}</span></div>`).join('')}</div>` : '';
  return `<div class="rem-wrap" data-key="rem:${r.id}" data-flip data-swipe-id="${r.id}">
    <div class="rem-bg"><div class="bg-left">✓ Erledigt</div><div class="bg-right"><button data-act="remTomorrow" data-id="${r.id}">Morgen</button><button data-act="remDelete" data-id="${r.id}">Löschen</button></div></div>
    <div class="rem ${r.done ? 'done' : ''}" style="--c:${c}">
      <button class="circle ${r.done ? 'on' : ''}" data-act="toggleRem" data-id="${r.id}" aria-label="Erledigt"></button>
      <div class="body" data-act="editRem" data-id="${r.id}"><div class="title">${prio}${em ? `<span class="em">${em}</span>` : ''}${esc(r.title)}</div>${meta.length ? `<div class="meta">${meta.join('')}</div>` : ''}${subs}</div>
      ${r.flagged ? '<span class="flag">⚑</span>' : ''}
      <button class="info-btn" data-act="editRem" data-id="${r.id}" aria-label="Details">${I.info}</button></div></div>`;
}
const remBack = (right = '') => `<div class="sticky-head"><div class="topbar"><div class="left"><button class="link" data-act="remHome">‹ Listen</button></div><div class="right">${right}</div></div></div>`;
function remListScreen(id) {
  const l = listById(id); if (!l) { ui.rem.screen = 'home'; return renderReminders(); }
  const items = S.reminders.filter(r => r.listId === id && (!r.done || l.showDone || visibleDone(r))).sort((a, b) => (a.done - b.done) || (a.createdAt - b.createdAt));
  return remBack(`<button class="icon-btn" data-act="editList" data-id="${id}" aria-label="Liste bearbeiten">${I.more}</button>`) +
    `<h1 class="list-title" style="color:${l.color}">${esc(l.name)}</h1>
    <div class="rem-list">${items.map(r => remRow(r)).join('') || '<div class="empty small">Noch leer – tippe unten auf „Neue Erinnerung“.</div>'}<div id="quick-slot"></div></div>
    <button class="add-row" style="--c:${l.color}" data-act="quickAdd" data-list="${id}"><span class="plus">+</span>Neue Erinnerung</button>
    ${S.reminders.some(r => r.listId === id && r.done) ? `<button class="link small-link" data-act="toggleShowDone" data-id="${id}">${l.showDone ? 'Erledigte ausblenden' : 'Erledigte anzeigen'}</button>` : ''}`;
}
function remSmartScreen(k) {
  const sm = SMART[k], sets = smartSets();
  const inSet = r => sets[k].includes(r) || (visibleDone(r) && k !== 'done');
  let items = k === 'done' ? sets.done.slice().sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || '')) : S.reminders.filter(inSet);
  let html;
  if (k === 'scheduled') {
    const key = r => r.planDate || r.due;
    items.sort((a, b) => key(a).localeCompare(key(b)) || (a.time || '').localeCompare(b.time || ''));
    const groups = {}; items.forEach(r => (groups[key(r)] ||= []).push(r));
    html = Object.entries(groups).map(([d, rs]) => `<div class="list-day">${dueLabel(d)}</div>${rs.map(r => remRow(r, { showList: true })).join('')}`).join('');
  } else if (k === 'all') {
    html = S.lists.map(l => `<div class="list-day" style="color:${l.color}">${esc(l.name)}</div>${items.filter(r => r.listId === l.id).map(r => remRow(r)).join('') || '<div class="empty small">Keine Erinnerungen</div>'}`).join('');
  } else html = items.map(r => remRow(r, { showList: true })).join('');
  const quick = k !== 'done' ? `<div id="quick-slot"></div><button class="add-row" style="--c:${sm.color}" data-act="quickAdd" data-smart="${k}"><span class="plus">+</span>Neue Erinnerung</button>` : '';
  return remBack() + `<h1 class="list-title" style="color:${sm.color}">${sm.name}</h1>
    <div class="rem-list">${html || `<div class="empty">${k === 'done' ? 'Noch nichts erledigt' : 'Keine Erinnerungen'}</div>`}${quick}</div>`;
}

// =====================================================================
//  Tagesplan
// =====================================================================
function countdowns() {
  const today = todayStr(), out = [], seen = new Set();
  for (const r of S.reminders) if (!r.done && r.due && r.due >= today && /schularbeit|\btest|prüfung|klausur|referat/i.test(r.title) && !/lernen \(\d/.test(r.title)) { seen.add(r.title.toLowerCase()); out.push({ e: emojiFor(r.title, '📝'), t: r.title, d: r.due }); }
  const from = startOfDay(new Date());
  for (const it of instances(from, addDays(from, 150))) {
    const t = it.ev.title, d = ymd(it.s);
    if (d < today || seen.has(t.toLowerCase())) continue;
    if (/ferien|urlaub|schularbeit|\btest|prüfung/i.test(t) || (/geburtstag/i.test(t) && it.s < addDays(from, 21))) { seen.add(t.toLowerCase()); out.push({ e: emojiFor(t, '⏳'), t, d }); }
  }
  return out.sort((a, b) => a.d.localeCompare(b.d)).slice(0, 6);
}
function heroCard(date, plan) {
  const isToday = date === todayStr(), h = new Date().getHours(), name = (S.settings.userName || '').trim(), d = parseYmd(date);
  const hello = isToday
    ? `${h < 5 ? 'Gute Nacht' : h < 11 ? 'Guten Morgen' : h < 14 ? 'Hallo' : h < 18 ? 'Schönen Nachmittag' : 'Guten Abend'}${name ? ', ' + esc(name) : ''} 👋`
    : `${relDay(date) === 'morgen' ? 'Morgen, ' : ''}${WD_LONG[d.getDay()]}, ${d.toLocaleDateString('de-AT', { day: 'numeric', month: 'long' })}`;
  const blocks = schoolBlocks(date), wd = d.getDay(), parts = [];
  if (blocks.length) parts.push(`🏫 Schule bis ${hm(Math.max(...blocks.map(b => b.e)))}`);
  else parts.push(wd === 0 || wd === 6 ? '🌴 Wochenende' : isFreeDay(date) ? '🎉 Schulfrei' : '🏠 Keine Schule');
  plan.items.filter(i => i.kind === 'fixed' && !i.school).slice(0, 2).forEach(i => parts.push(`${emojiFor(i.title, '📅')} ${esc(i.title)} ${hm(i.s)}`));
  const tasks = plan.items.filter(i => i.kind === 'task'), open = tasks.filter(t => !t.done).length;
  parts.push(open ? `✅ ${open} Aufgabe${open > 1 ? 'n' : ''}` : tasks.length ? '✅ alles erledigt' : '✨ keine Aufgaben');
  const w = weatherFor(date);
  const weather = w ? `<div class="weather">${w.emoji} ${w.temp}°${w.rain >= 40 ? `<small>☔ ${w.rain}%</small>` : `<small>${w.min}° / ${w.max}°</small>`}</div>`
    : (S.settings.weatherCity ? '' : `<button class="weather add" data-act="weatherSetup">🌤️<small>Wetter</small></button>`);
  const chips = [], st = streak();
  if (st > 0) chips.push(`<span class="chip-c fire">🔥 ${st} ${st === 1 ? 'Tag' : 'Tage'} in Folge</span>`);
  for (const c of countdowns()) chips.push(`<span class="chip-c">${c.e} ${esc(c.t)} · <b>${inDays(c.d)}</b></span>`);
  return `<div class="hero"><div class="hero-top"><div><div class="hello">${hello}</div><div class="hero-sum">${parts.join(' · ')}</div></div>${weather}</div>${chips.length ? `<div class="hero-chips">${chips.join('')}</div>` : ''}</div>`;
}
const TIPS = [
  'Leg dein Handy beim Lernen in ein anderes Zimmer – das wirkt Wunder.', 'Fang mit der schwierigsten Aufgabe an, solange du frisch bist.',
  'Pack deine Schultasche schon am Abend.', 'Alle 25 Minuten eine kurze Pause hält dich konzentriert.', 'Ein Glas Wasser neben dem Schreibtisch hilft beim Denken.',
  'Erklär dir den Stoff laut selbst – so merkst du, was du schon kannst.', 'Lieber jeden Tag ein bisschen lernen als alles am Vorabend.',
];
const tipOfDay = date => TIPS[Math.abs(daysBetween('2026-01-01', date)) % TIPS.length];
function eveningCard(date, plan, p) {
  if (date !== todayStr() || p.reviewDone || minOf(new Date()) < toMin(S.settings.eveningReview || '20:00')) return '';
  const done = S.doneLog.filter(x => x.date === date).length;
  const open = plan.items.filter(i => i.kind === 'task' && !i.done);
  return `<div class="card evening"><b>🌙 Tagesabschluss</b>
    <p>${done ? `Du hast heute ${done} ${done === 1 ? 'Sache' : 'Sachen'} geschafft – stark! 🎉` : 'Heute wurde noch nichts abgehakt – kein Stress, morgen ist ein neuer Tag.'}${open.length ? ` Noch offen: ${open.slice(0, 3).map(o => esc(o.title)).join(', ')}${open.length > 3 ? ' …' : ''}.` : ''}</p>
    <p class="tip">💡 ${tipOfDay(date)}</p>
    <div class="hint-actions">${open.length ? '<button class="btn secondary" data-act="moveOpenTomorrow">Offene auf morgen</button>' : ''}<button class="btn secondary" data-act="reviewDone">Fertig für heute ✓</button></div></div>`;
}
function weekCard(date) {
  if (date !== todayStr()) return '';
  const wd = new Date().getDay(), wk = ymd(startOfWeekMon(new Date()));
  if (!(wd === 0 || (wd === 1 && new Date().getHours() < 14)) || S.settings.lastReview === wk || !S.doneLog.length) return '';
  return `<button class="card week-card" data-act="weekReview"><b>📊 Dein Wochenrückblick ist da</b><p>Schau, was du diese Woche geschafft hast ›</p></button>`;
}
function timelineItem(it, h, past, nl) {
  const tag = { fixed: it.school ? 'Schule' : 'Fix', task: it.pinned ? '📌 Fix geplant' : 'Aufgabe', extra: it.fromCal ? 'Kalender' : 'Flexibel', routine: 'Routine', reward: 'Belohnung' }[it.kind];
  const em = emojiFor(it.title, it.kind === 'task' ? '✅' : it.kind === 'reward' ? '🎮' : it.school ? '🏫' : '');
  const act = it.kind === 'task' ? `data-act="editRem" data-id="${it.id}"` : it.kind === 'fixed' ? (it.school ? `data-act="lessonDay" data-date="${it.date}"` : `data-act="openEvent" data-id="${it.evId}" data-date="${it.date}"`) : it.fromCal ? `data-act="openEvent" data-id="${it.evId}" data-date="${ui.plan.date}"` : '';
  const check = it.kind === 'task' ? `<button class="circle ${it.done ? 'on' : ''}" style="--c:${it.color}" data-act="toggleUnit" data-id="${it.id}" ${it.sub ? `data-sub="${it.sub}"` : ''} aria-label="Erledigt"></button>` : '';
  const play = it.kind === 'task' && !it.done && !it.focus ? `<button class="play-btn" data-act="focus" data-key="${it.key}" data-id="${it.id}" ${it.sub ? `data-sub="${it.sub}"` : ''} aria-label="Fokus starten">${I.play}</button>` : it.focus ? `<button class="play-btn on" data-act="openFocus" aria-label="Fokus öffnen">⏱</button>` : '';
  const rm = it.kind === 'extra' && !it.fromCal ? `<button class="x-btn" data-act="rmExtra" data-id="${it.id}" aria-label="Entfernen">×</button>`
    : it.kind === 'routine' ? `<button class="x-btn" data-act="skipRoutine" data-id="${it.routineId}" aria-label="Heute auslassen">×</button>` : '';
  return `<div class="tl-row ${past ? 'past' : ''} ${it.focus ? 'focusing' : ''}" data-key="pl:${it.key}" data-flip style="--c:${it.color};min-height:${h}px">
    <div class="tm"><b>${hm(it.s)}</b><small>${hm(it.e)}</small></div>
    <div class="tl-card k-${it.kind} ${it.done ? 'done' : ''}">${check}
      <div class="grow" ${act}><div class="ti">${em ? `<span class="em">${em}</span>` : ''}${esc(it.title)}</div>
        <div class="sub"><span class="tag">${tag}</span>${durLabel(it.e - it.s)}${it.sub && it.kind === 'fixed' ? ' · ' + esc(it.sub) : ''}${it.kind === 'task' && it.due ? ' · bis ' + relDay(it.due) : ''}${it.focus ? ' · läuft gerade' : ''}</div></div>
      ${play}${rm}</div>${nl}</div>`;
}
function timelineHTML(plan, date) {
  if (!plan.items.length) return `<div class="empty">Noch nichts geplant.<br>Leg Erinnerungen an oder sag dem Assistenten unten rechts, was ansteht.</div>`;
  const isToday = date === todayStr(), nowM = minOf(new Date()), PPM = 1.15;
  const nowLine = top => `<div class="now-line" style="top:${top}"><span>${hm(nowM)}</span></div>`;
  let html = '', cursor = null, nowDone = !isToday;
  for (const it of plan.items) {
    if (cursor != null && it.s > cursor) {
      const gap = it.s - cursor;
      let nl = ''; if (!nowDone && nowM >= cursor && nowM < it.s) { nl = nowLine(((nowM - cursor) / gap * 100).toFixed(1) + '%'); nowDone = true; }
      html += `<div class="tl-gap" style="height:${clamp(gap * PPM, 14, 130)}px">${gap >= 15 ? `<span>frei · ${durLabel(gap)}</span>` : ''}${nl}</div>`;
    } else if (cursor == null && !nowDone && nowM < it.s) { html += `<div class="tl-gap" style="height:22px">${nowLine('50%')}</div>`; nowDone = true; }
    let nl = ''; if (!nowDone && nowM >= it.s && nowM < it.e) { nl = nowLine(((nowM - it.s) / (it.e - it.s) * 100).toFixed(1) + '%'); nowDone = true; }
    html += timelineItem(it, clamp((it.e - it.s) * PPM, 58, 150), isToday && it.e <= nowM, nl);
    cursor = cursor == null ? it.e : Math.max(cursor, it.e);
  }
  if (!nowDone && nowM >= cursor) html += `<div class="tl-gap" style="height:26px">${nowLine('50%')}</div>`;
  return `<div class="timeline">${html}</div>`;
}
function renderPlan() {
  const date = ui.plan.date, today = todayStr(), isToday = date === today;
  const plan = computePlan(date), p = getPlan(date), nowM = minOf(new Date());
  const rel = relDay(date), d = parseYmd(date);
  const label = `${rel.charAt(0).toUpperCase() + rel.slice(1)}${['heute', 'morgen', 'gestern'].includes(rel) ? ', ' + d.toLocaleDateString('de-AT', { weekday: 'short', day: 'numeric', month: 'long' }) : ''}`;
  const energy = p.energy || 'normal';
  const late = isToday && plan.items.find(i => i.kind === 'task' && !i.done && !i.focus && i.e <= nowM);
  const left = plan.leftovers.filter(l => l.kind === 'task' || l.kind === 'extra');
  const onboarding = !S.timetable.length ? `<div class="card"><b>🏫 Stundenplan fehlt</b><p>Damit der Plan weiß, wann du in der Schule bist, trag ihn einmal ein.</p><div class="hint-actions"><button class="btn secondary" data-act="timetable">Stundenplan eintragen</button></div></div>` : '';
  const quick = [['🚌', 'Heimfahrt', 30], ['🍝', 'Mittagessen', 30], ['☕', 'Pause', 15], ['🍽️', 'Abendessen', 30], ['🎮', 'Freizeit', 30]];
  return `<div class="sticky-head"><div class="topbar"><div class="left"><button class="icon-btn" data-act="settings" aria-label="Einstellungen">${I.gear}</button></div>
      <div class="right">${isToday ? '' : '<button class="link" data-act="planToday">Heute</button>'}<button class="icon-btn" data-act="weekReview" aria-label="Wochenrückblick">${I.chart}</button></div></div></div>
    ${heroCard(date, plan)}
    <div class="day-nav"><button data-act="planPrev" aria-label="Vortag">‹</button><span class="lbl">${label}</span><button data-act="planNext" aria-label="Nächster Tag">›</button></div>
    <div class="energy" data-key="energy">${[['müde', '😴', 'Müde'], ['normal', '🙂', 'Normal'], ['fit', '⚡', 'Fit']].map(([k, e, l]) => `<button class="${energy === k ? 'on' : ''}" data-act="setEnergy" data-v="${k}">${e} ${l}</button>`).join('')}</div>
    <div class="plan-actions">
      <button class="btn primary" data-act="planDay">${I.spark}${aiReady() ? 'Mit KI planen' : 'Tag planen'}</button>
      <button class="btn secondary" data-act="adjust">${I.sliders}Anpassen</button></div>
    ${late ? `<div class="banner">⏰ <span>„${esc(late.title)}“ ist noch offen.</span><button data-act="replanNow">Ab jetzt neu planen</button></div>` : ''}
    ${eveningCard(date, plan, p)}${weekCard(date)}${onboarding}
    ${timelineHTML(plan, date)}
    ${left.length ? `<div class="group-title">Passt ${isToday ? 'heute' : 'an diesem Tag'} nicht mehr rein</div><div class="group">${left.map(l => `<div class="cell"><span class="grow">${esc(withEmoji(l.title))}<div class="cell-sub">${durLabel(l.dur)}${l.why === 'müde' ? ' · weil du müde bist' : ''}</div></span>${l.kind === 'task' ? `<button class="link" data-act="remTomorrow" data-id="${l.id}">→ Morgen</button>` : ''}</div>`).join('')}</div>` : ''}
    <div class="group-title">Schnell einplanen</div>
    <div class="quick">${quick.map(([e, t, m]) => `<button data-act="quick" data-t="${t}" data-m="${m}">${e} ${t}</button>`).join('')}</div>
    <div class="card hint-as">💬 <span>Sag dem Assistenten unten rechts einfach, was dazukommt – z. B. <i>„Heimfahrt dauert heute 45 Minuten“</i> oder <i>„HÜ Mathe bis Freitag“</i>.</span></div>`;
}
