'use strict';
/* =====================================================================
   Tagwerk · planner.js – rechnet den Tagesplan aus und führt Änderungen
   aus (von Knöpfen, vom Assistenten und von der KI).
   ===================================================================== */

function getPlan(date) {
  const p = (S.plans[date] ||= {});
  p.extras ||= []; p.aiDur ||= {}; p.taskIds ||= []; p.skipRoutines ||= [];
  if (p.anchor === undefined) p.anchor = null;
  return p;
}
const nowAnchor = () => Math.max(toMin(S.settings.dayStart), roundUp(minOf(new Date()), 5));

function guessTaskDur(title) {
  const t = (title || '').toLowerCase();
  if (/schularbeit|prüfung|klausur|\bsa\b|\btest|lernen für|referat|präsentation/.test(t)) return 60;
  if (/lernen|üben|wiederholen|vokabel/.test(t)) return 45;
  if (/\bhü\b|hausübung|hausaufgabe|aufgabe/.test(t)) return 30;
  return +S.settings.defaultTaskMin || 30;
}
function guessExtraDur(title) {
  const t = (title || '').toLowerCase();
  if (/heim|fahrt|bus|zug|bahn|nach hause/.test(t)) return 30;
  if (/mittag|essen|abendessen|jause|kochen/.test(t)) return 30;
  if (/pause|chill|kaffee|snack|duschen/.test(t)) return 15;
  return 30;
}
const isHard = t => /schularbeit|\btest|prüfung|klausur|lernen|referat|präsentation|mathe|physik|chemie|latein|projekt/i.test(t || '') ? 1 : 0;
const SCHOOLWORDS = /mathe|deutsch|englisch|\bbio|physik|chemie|geschichte|\bgeo|latein|franz|spanisch|informatik|lernen|\bhü\b|hausübung|hausaufgabe|\btest|schularbeit|referat|vokabel|prüfung/i;
const defaultListId = () => listById(S.settings.defaultList) ? S.settings.defaultList : S.lists[0].id;
const guessList = t => (SCHOOLWORDS.test(t || '') || subjectOf(t)) && listById('school') ? 'school' : defaultListId();
const guessCal = t => /training|fußball|fussball|sport|band|probe|musik|gitarre|klavier|tanz|schwimm|turnen|verein/i.test(t || '') && calById('sport') ? 'sport'
  : (/schularbeit|test|prüfung|schule|elternabend|sprechtag/i.test(t || '') && calById('school') ? 'school' : (calById(S.settings.defaultCal) ? S.settings.defaultCal : S.calendars[0].id));
function findList(name) {
  if (!name) return null;
  const n = String(name).toLowerCase();
  return S.lists.find(l => l.id === name || l.name.toLowerCase() === n)?.id || S.lists.find(l => l.name.toLowerCase().includes(n))?.id || null;
}
function newReminder(o = {}) {
  return {
    id: o.id || uid(), listId: o.listId || defaultListId(), title: o.title || '', notes: o.notes || '',
    due: o.due || null, time: o.time || null, priority: o.priority || 0, flagged: !!o.flagged, done: false, doneAt: null,
    duration: o.duration || null, createdAt: Date.now(), subtasks: o.subtasks || [], repeat: o.repeat || null,
    planDate: o.planDate || null, planTime: o.planTime || null, postponed: 0,
  };
}

// ---------- Routinen ----------
const ROUTINE_DAYS = { school: 'An Schultagen', daily: 'Jeden Tag', weekdays: 'Mo–Fr', weekend: 'Am Wochenende', noschool: 'An schulfreien Tagen' };
function routineApplies(r, date) {
  const wd = parseYmd(date).getDay(), school = schoolBlocks(date).length > 0;
  switch (r.days) {
    case 'school': return school;
    case 'weekdays': return wd >= 1 && wd <= 5;
    case 'weekend': return wd === 0 || wd === 6;
    case 'noschool': return !school;
    case 'daily': return true;
    default: return Array.isArray(r.days) ? r.days.includes(wd) : true;
  }
}

// ---------- Aufgaben-Einheiten (mit Unteraufgaben) ----------
function taskUnits(date, p) {
  const today = todayStr(), horizon = ymd(addDays(parseYmd(date), 14));
  const keepDone = r => r.done && r.doneAt && r.doneAt.slice(0, 10) === date && p.taskIds.some(k => k.split(':')[0] === r.id);
  const pinned = [], auto = [];
  for (const r of S.reminders) {
    if (r.done && !keepDone(r)) continue;
    const pd = r.planDate;
    const overduePlan = pd && pd < today && date === today && !r.done;
    if (pd && pd !== date && !overduePlan) continue;
    if (!pd && r.due && r.due > horizon) continue;
    if (date < today && !pd) continue;
    const base = { r, color: itemColor(r), prio: r.priority || 0, due: r.due };
    const dur = +(p.aiDur?.[r.id]) || +r.duration || guessTaskDur(r.title);
    if (pd === date && r.planTime) { pinned.push({ ...base, key: r.id, id: r.id, title: r.title, dur, at: r.planTime, done: r.done }); continue; }
    const subs = (r.subtasks || []).filter(s => !s.done || keepDone(r) || p.taskIds.includes(r.id + ':' + s.id));
    if (subs.length && !r.done) {
      const each = Math.max(10, roundUp(dur / subs.length, 5));
      subs.forEach(s => auto.push({ ...base, key: `${r.id}:${s.id}`, id: r.id, sub: s.id, title: `${r.title} · ${s.title}`, dur: +(p.aiDur?.[`${r.id}:${s.id}`]) || +s.duration || each, done: s.done, prefer: pd === date || overduePlan }));
    } else auto.push({ ...base, key: r.id, id: r.id, title: r.title, dur, done: r.done, prefer: pd === date || overduePlan });
  }
  const score = u => (u.prefer ? -8 : 0) + (u.due ? (u.due < date ? -5 : daysBetween(date, u.due)) : 10) - u.prio * 1.5 - (u.r.flagged ? 1 : 0);
  const energy = p.energy || 'normal';
  auto.sort((a, b) => score(a) - score(b) || a.r.createdAt - b.r.createdAt);
  if (energy === 'fit') auto.sort((a, b) => isHard(b.title) - isHard(a.title) || score(a) - score(b));
  if (energy === 'müde') {
    const urgent = u => u.due && u.due <= ymd(addDays(parseYmd(date), 1)) ? 1 : 0;
    auto.sort((a, b) => urgent(b) - urgent(a) || isHard(a.title) - isHard(b.title) || a.dur - b.dur);
  }
  if (p.aiOrder?.length) {
    const pos = new Map(p.aiOrder.map((k, i) => [k, i]));
    const at = u => pos.has(u.key) ? pos.get(u.key) : pos.has(u.id) ? pos.get(u.id) + .01 : null;
    const listed = auto.filter(u => at(u) != null).sort((a, b) => at(a) - at(b));
    const rest = auto.filter(u => at(u) == null && (u.r.createdAt > (p.aiAt || 0) || u.prefer));
    return { pinned, auto: [...listed, ...rest] };
  }
  return { pinned, auto };
}

// =====================================================================
//  Tagesplan berechnen
// =====================================================================
function computePlan(date) {
  const p = getPlan(date), st = S.settings;
  const dStart = toMin(st.dayStart), dEnd = toMin(st.dayEnd) || 1440;
  const today = todayStr(), isToday = date === today;
  if (p.anchor == null) { p.anchor = isToday ? nowAnchor() : dStart; saveQuiet(); }
  const anchor = date < today ? dStart : p.anchor;
  const energy = p.energy || 'normal';
  const brk = (+st.breakMin || 0) + (energy === 'müde' ? 5 : 0);
  const items = [], busy = [], leftovers = [];
  const occupy = (s, e) => { if (e > s) { busy.push([s, e]); busy.sort((a, b) => a[0] - b[0]); } };
  const free = (from, dur) => {
    let t = from, moved = true;
    while (moved) { moved = false; for (const [s, e] of busy) if (t < e && t + dur > s) { t = e; moved = true; } }
    return t + dur <= dEnd ? t : null;
  };

  // 1) Fixtermine (Kalender + Schule)
  const day = parseYmd(date), next = addDays(day, 1), flexEvents = [];
  for (const it of dayInstances(date)) {
    if (it.ev.allDay) continue;
    const s = it.s < day ? 0 : minOf(it.s), e = it.e >= next ? 1440 : minOf(it.e);
    if (it.ev.fixed === false) flexEvents.push({ id: 'ev-' + it.ev.id, evId: it.ev.id, title: it.ev.title, minutes: e - s, at: hm(s), fromCal: true });
    else { items.push({ kind: 'fixed', key: 'ev:' + it.ev.id, title: it.ev.title, s, e, color: it.color, sub: it.ev.location || '', evId: it.ev.id, date: ymd(it.s) }); occupy(s, e); }
  }
  const blocks = schoolBlocks(date);
  blocks.forEach((b, i) => { items.push({ kind: 'fixed', school: true, key: 'school' + i, title: 'Schule', s: b.s, e: b.e, color: calColor('school'), sub: b.subjects.join(' · '), date }); occupy(b.s, b.e); });
  const fixedItems = items.slice();
  const schoolEnd = blocks.length ? Math.max(...blocks.map(b => b.e)) : null;
  const findAfter = q => {
    q = String(q).toLowerCase();
    const f = fixedItems.filter(x => x.title.toLowerCase().includes(q) || q.includes(x.title.toLowerCase()) || (x.school && /schul|unterricht/.test(q)));
    return f.length ? Math.max(...f.map(x => x.e)) : null;
  };

  // 2) Laufender Fokus-Timer (wächst mit, wenn du länger brauchst)
  let focusKey = null;
  if (isToday && S.focus && S.focus.date === date) {
    const f = S.focus, sM = minOf(new Date(f.startedAt));
    const elapsed = Math.ceil(focusElapsed(f) / 60000);
    const dur = Math.max(f.plannedMin, roundUp(elapsed + 1, 5));
    const r = S.reminders.find(x => x.id === f.remId);
    items.push({ kind: 'task', key: f.key, id: f.remId, sub: f.subId, title: f.title, s: sM, e: sM + dur, color: r ? itemColor(r) : ACCENT, focus: true, due: r?.due });
    occupy(sM, sM + dur + brk); focusKey = f.key;
  }

  // 3) Fest eingeplante Aufgaben (📌)
  const units = taskUnits(date, p);
  for (const u of units.pinned) {
    if (u.key === focusKey) continue;
    const want = toMin(u.at); let t = free(want, u.dur); if (t == null) t = want;
    items.push({ kind: 'task', key: u.key, id: u.id, title: u.title, s: t, e: t + u.dur, color: u.color, done: u.done, due: u.due, prio: u.prio, pinned: true });
    occupy(t, t + u.dur + brk);
  }

  // 4) Kette: Routinen, flexible Kalendertermine, Chat-Einträge
  const chain = [];
  S.routines.filter(r => routineApplies(r, date) && !p.skipRoutines.includes(r.id)).forEach(r => chain.push({
    id: 'rt-' + r.id, routineId: r.id, title: r.title, minutes: r.minutes,
    at: r.anchor === 'at' ? r.at : null, after: r.anchor === 'after_school' ? 'Schule' : null, routine: true,
  }));
  chain.push(...flexEvents, ...p.extras);
  let cursor = anchor;
  for (const x of chain) {
    const dur = Math.max(5, +x.minutes || guessExtraDur(x.title));
    let from;
    if (x.at) from = toMin(x.at);
    else if (x.after && findAfter(x.after) != null) from = findAfter(x.after);
    else if (schoolEnd != null && cursor < schoolEnd && /heim|nach ?hause|bus|bahn|zug|fahrt|mittag|essen/i.test(x.title)) from = schoolEnd;
    else from = cursor;
    // Routinen, deren Zeit schon vorbei ist, bleiben an ihrem echten Platz (vergangen);
    // alles andere wird erst ab "jetzt" geplant.
    if (!x.at && !(x.routine && from < anchor)) from = Math.max(from, anchor);
    const t = free(from, dur);
    if (t == null) { leftovers.push({ kind: 'extra', key: x.id, title: x.title, dur, id: x.id }); continue; }
    items.push({ kind: x.routine ? 'routine' : 'extra', key: x.id, id: x.id, routineId: x.routineId, title: x.title, s: t, e: t + dur, fromCal: x.fromCal, evId: x.evId, color: x.routine ? '#30b0ff' : '#b44cff', at: x.at });
    occupy(t, t + dur);
    if (!x.at) cursor = t + dur;
  }

  // 5) Aufgaben füllen die Lücken (Energie, Belohnungen)
  const tFrom = Math.max(anchor, schoolEnd ?? 0);
  const capMin = energy === 'müde' ? 150 : Infinity;
  let work = 0, lastEnd = null, taskMin = 0;
  for (const u of units.auto) {
    if (u.key === focusKey) continue;
    if (!u.done && taskMin + u.dur > capMin) { leftovers.push({ ...u, kind: 'task', why: 'müde' }); continue; }
    const t = free(tFrom, u.dur);
    if (t == null) { leftovers.push({ ...u, kind: 'task' }); continue; }
    if (lastEnd != null && t - lastEnd > 30) work = 0;
    items.push({ kind: 'task', key: u.key, id: u.id, sub: u.sub, title: u.title, s: t, e: t + u.dur, color: u.color, done: u.done, due: u.due, prio: u.prio });
    occupy(t, t + u.dur); taskMin += u.dur; work += u.dur; lastEnd = t + u.dur;
    if (st.rewards && work >= (+st.rewardAfterMin || 90)) {
      const rm = +st.rewardMin || 20, rt = free(lastEnd, rm);
      if (rt != null) { items.push({ kind: 'reward', key: 'rw-' + u.key, title: st.rewardTitle || 'Freizeit', s: rt, e: rt + rm, color: '#34c759' }); occupy(rt, rt + rm); lastEnd = rt + rm; work = 0; continue; }
    }
    occupy(lastEnd, lastEnd + brk);
  }

  const keys = items.filter(i => i.kind === 'task').map(i => i.key);
  if (keys.join() !== p.taskIds.join()) { p.taskIds = keys; saveQuiet(); }
  items.sort((a, b) => a.s - b.s || (a.kind === 'fixed' ? -1 : 1));
  return { items, leftovers, anchor, dStart, dEnd, schoolEnd, busy, energy, taskMin, brk };
}

// Freie Lücken eines Tages (für Vorschläge der KI und des Assistenten)
function freeGaps(date, minDur = 15) {
  const plan = computePlan(date);
  const start = Math.max(plan.anchor, plan.schoolEnd ?? plan.dStart, date === todayStr() ? nowAnchor() : 0);
  // Nicht fest eingeplante Aufgaben und Belohnungen rücken ohnehin zur Seite – die zählen nicht als belegt.
  const iv = plan.items.filter(i => !((i.kind === 'task' && !i.pinned && !i.focus) || i.kind === 'reward')).map(i => [i.s, i.e]).sort((a, b) => a[0] - b[0]);
  const gaps = []; let t = start;
  for (const [s, e] of iv) { if (s - t >= minDur) gaps.push({ s: t, e: s }); t = Math.max(t, e); }
  if (plan.dEnd - t >= minDur) gaps.push({ s: t, e: plan.dEnd });
  return gaps;
}
function proposeSlot(dur, { due = null, startDate = todayStr(), afterMin = -1, maxDays = 7 } = {}) {
  const brk = +S.settings.breakMin || 0;
  const tryRange = (from, last) => {
    for (let d = parseYmd(from), i = 0; ymd(d) <= last && i < 40; d = addDays(d, 1), i++) {
      const k = ymd(d);
      for (const g of freeGaps(k, dur)) {
        const s = roundUp(Math.max(g.s + (g.s > 0 ? brk : 0), k === startDate ? afterMin : -1), 5);
        if (g.e - s >= dur) return { date: k, s, e: s + dur, time: hm(s) };
      }
    }
    return null;
  };
  if (due && due >= startDate) {
    const dayBefore = ymd(addDays(parseYmd(due), -1));
    return (dayBefore >= startDate ? tryRange(startDate, dayBefore) : null) || tryRange(due, due);
  }
  return tryRange(startDate, ymd(addDays(parseYmd(startDate), maxDays)));
}

// ---------- Lernplan für Tests ----------
function createStudyPlan(testTitle, testDate, count = 3, minutes = 45) {
  const today = todayStr(), days = [];
  for (let d = parseYmd(today); ymd(d) < testDate && days.length < 60; d = addDays(d, 1)) days.push(ymd(d));
  if (days[0] === today && minOf(new Date()) > toMin(S.settings.dayEnd) - minutes - 30) days.shift();
  if (!days.length) return [];
  const n = Math.min(count, days.length);
  const pick = n === 1 ? [days.at(-1)] : [...new Set([...Array(n)].map((_, i) => days[Math.round(i * (days.length - 1) / (n - 1))]))];
  const subj = subjectOf(testTitle) || testTitle.replace(/(-?schularbeit|-?test|-?prüfung|-?klausur|lernen)/gi, '').trim() || testTitle;
  return pick.map((day, i) => {
    const r = newReminder({ title: `${subj} lernen (${i + 1}/${pick.length})`, due: day, duration: minutes, listId: guessList(subj + ' lernen'), notes: `Lerneinheit für „${testTitle}“ (${dueLabel(testDate)})`, planDate: day });
    S.reminders.push(r);
    return r;
  });
}

// ---------- Erledigen (mit Unteraufgaben und Wiederholung) ----------
function nextRepeat(date, rep) {
  let d = parseYmd(date || todayStr());
  const base = parseYmd(todayStr()) > d ? parseYmd(todayStr()) : d;
  d = base;
  if (rep === 'daily') d = addDays(d, 1);
  else if (rep === 'weekdays') { do d = addDays(d, 1); while (d.getDay() === 0 || d.getDay() === 6); }
  else if (rep === 'weekly') d = addDays(d, 7);
  else if (rep === 'monthly') d = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate());
  else d = addDays(d, 1);
  return ymd(d);
}
function completeReminder(r, subId = null) {
  const dur = r.duration || guessTaskDur(r.title);
  if (subId) {
    const s = r.subtasks.find(x => x.id === subId); if (!s) return null;
    s.done = !s.done;
    if (s.done) logDone(`${r.id}:${s.id}`, `${r.title} · ${s.title}`, dur / Math.max(1, r.subtasks.length)); else unlogDone(`${r.id}:${s.id}`);
    if (s.done && r.subtasks.every(x => x.done) && !r.done) return completeReminder(r);
    return s.done ? 'sub' : 'undone';
  }
  if (!r.done) {
    logDone(r.id, r.title, dur);
    if (r.repeat) {
      r.due = nextRepeat(r.due, r.repeat); r.planDate = null; r.planTime = null; r.subtasks.forEach(s => s.done = false);
      return 'repeat';
    }
    r.done = true; r.doneAt = toLocal(new Date());
    return 'done';
  }
  r.done = false; r.doneAt = null; unlogDone(r.id);
  return 'undone';
}

// =====================================================================
//  Änderungen ausführen – ein gemeinsamer Weg für Knöpfe, Assistent & KI.
//  Jede Aktion liefert eine "Änderungskarte" zurück, die zeigt, wo es ist.
// =====================================================================
function normRepeat(x) {
  const m = { täglich: 'daily', daily: 'daily', wochentags: 'weekdays', weekdays: 'weekdays', wöchentlich: 'weekly', weekly: 'weekly', biweekly: 'biweekly', monatlich: 'monthly', monthly: 'monthly', jährlich: 'yearly', yearly: 'yearly' };
  return x ? m[String(x).toLowerCase()] || null : null;
}
function fuzzyFind(list, q, get = x => x.title) {
  if (!q) return null;
  q = String(q).toLowerCase().trim();
  return list.find(x => x.id === q) || list.find(x => get(x).toLowerCase() === q) || list.find(x => get(x).toLowerCase().includes(q))
    || list.find(x => q.includes(get(x).toLowerCase())) || list.find(x => q.split(/\s+/).filter(w => w.length > 2).every(w => get(x).toLowerCase().includes(w)));
}
function remShow(r) {
  const out = [{ tab: 'reminders', listId: r.listId, key: 'rem:' + r.id }];
  if (r.planDate) out.push({ tab: 'plan', date: r.planDate, key: 'pl:' + r.id });
  return out;
}
function remLabel(r) {
  return `${r.title}${r.due ? ' · bis ' + dueLabel(r.due) : ''}${r.planDate ? ' · 📌 ' + relDay(r.planDate) + (r.planTime ? ' ' + r.planTime : '') : ''}`;
}
function applyAction(a, ctxDate) {
  if (!a || !a.type) return null;
  ctxDate ||= (typeof ui !== 'undefined' ? ui.plan.date : todayStr());
  const date = normDate(a.date) || ctxDate;
  switch (a.type) {
    case 'add_event': {
      if (!a.title) return null;
      const time = normTime(a.time), allDay = !time;
      const s = parseYmd(date); let e;
      if (!allDay) {
        s.setMinutes(toMin(time));
        const et = normTime(a.end_time);
        if (et) { e = parseYmd(date); e.setMinutes(toMin(et)); if (e <= s) e = new Date(s.getTime() + 3600e3); }
        else e = new Date(s.getTime() + (+a.minutes || S.settings.defaultEventMin) * 60000);
      } else e = addDays(s, Math.max(1, +a.days || 1));
      const ev = { id: a._id || uid(), title: a.title, location: a.location || '', notes: a.notes || '', start: toLocal(s), end: toLocal(e), allDay, calendarId: guessCal(a.title), fixed: a.fixed !== false, rrule: repeatToRRule(normRepeat(a.repeat), s), exdates: [], source: 'local' };
      S.events.push(ev);
      return { icon: emojiFor(a.title, '📅'), label: `${a.title} · ${relDay(date)}${allDay ? ' (ganztägig)' : ' ' + time}`, show: [{ tab: 'calendar', date, key: 'ev:' + ev.id }, ...(allDay ? [] : [{ tab: 'plan', date, key: 'pl:ev:' + ev.id }])] };
    }
    case 'update_event': {
      const ev = S.events.find(x => x.id === a.id) || fuzzyFind(S.events, a.title);
      if (!ev) return null;
      const s0 = parseLocal(ev.start), e0 = parseLocal(ev.end), dur = e0 - s0;
      if (a.title && a.id) ev.title = a.title;
      if (a.location) ev.location = a.location;
      if (normDate(a.date) || normTime(a.time)) {
        const d = normDate(a.date) || ev.start.slice(0, 10), t = normTime(a.time) || (ev.allDay ? null : ev.start.slice(11));
        const s = parseYmd(d); if (t) s.setMinutes(toMin(t));
        let e = new Date(s.getTime() + dur);
        if (normTime(a.end_time)) { e = parseYmd(d); e.setMinutes(toMin(a.end_time)); }
        if (+a.minutes) e = new Date(s.getTime() + a.minutes * 60000);
        ev.start = toLocal(s); ev.end = toLocal(e); if (t) ev.allDay = false;
      } else if (normTime(a.end_time)) { const e = parseYmd(ev.start.slice(0, 10)); e.setMinutes(toMin(a.end_time)); ev.end = toLocal(e); }
      else if (+a.minutes) ev.end = toLocal(new Date(s0.getTime() + a.minutes * 60000));
      if (typeof a.fixed === 'boolean') ev.fixed = a.fixed;
      const d = ev.start.slice(0, 10);
      return { icon: '✏️', label: `${ev.title} geändert · ${relDay(d)}${ev.allDay ? '' : ' ' + ev.start.slice(11)}`, show: [{ tab: 'calendar', date: d, key: 'ev:' + ev.id }] };
    }
    case 'delete_event': {
      const ev = S.events.find(x => x.id === a.id) || fuzzyFind(S.events.filter(e => e.end >= todayStr()), a.title);
      if (!ev) return null;
      S.events = S.events.filter(x => x.id !== ev.id);
      return { icon: '🗑️', label: `${ev.title} gelöscht`, show: [{ tab: 'calendar', date: ev.start.slice(0, 10) }] };
    }
    case 'add_reminder': {
      if (!a.title) return null;
      const r = newReminder({
        id: a._id, title: a.title, due: normDate(a.due_date), time: normTime(a.due_time), priority: clamp(+a.priority || 0, 0, 3), flagged: !!a.flagged,
        duration: +a.minutes || null, listId: findList(a.list) || guessList(a.title), notes: a.notes || '', repeat: normRepeat(a.repeat),
        subtasks: Array.isArray(a.subtasks) ? a.subtasks.filter(Boolean).map(t => ({ id: uid(), title: String(t), done: false })) : [],
      });
      if (normDate(a.date)) { r.planDate = normDate(a.date); r.planTime = normTime(a.time); }
      S.reminders.push(r);
      return { icon: emojiFor(r.title, '✅'), label: remLabel(r), show: remShow(r), remId: r.id };
    }
    case 'update_reminder': case 'plan_reminder': {
      const r = S.reminders.find(x => x.id === a.id) || fuzzyFind(S.reminders.filter(x => !x.done), a.title);
      if (!r) return null;
      if (a.type === 'update_reminder') {
        if (a.title && a.id) r.title = a.title;
        if (a.due_date !== undefined && a.due_date !== null) r.due = normDate(a.due_date);
        if (normTime(a.due_time)) r.time = normTime(a.due_time);
        if (a.priority != null) r.priority = clamp(+a.priority || 0, 0, 3);
        if (a.flagged != null) r.flagged = !!a.flagged;
        if (+a.minutes) r.duration = +a.minutes;
        if (a.notes) r.notes = a.notes;
        if (findList(a.list)) r.listId = findList(a.list);
        if (normRepeat(a.repeat)) r.repeat = normRepeat(a.repeat);
        if (Array.isArray(a.subtasks) && a.subtasks.length) r.subtasks.push(...a.subtasks.filter(Boolean).map(t => ({ id: uid(), title: String(t), done: false })));
      }
      if (a.type === 'plan_reminder' || normDate(a.date) || a.date === 'none') {
        if (a.date === 'none' || (a.type === 'plan_reminder' && !normDate(a.date))) { r.planDate = null; r.planTime = null; }
        else { if (r.planDate && r.planDate !== normDate(a.date)) r.postponed = (r.postponed || 0) + 1; r.planDate = normDate(a.date); r.planTime = normTime(a.time); }
      }
      return { icon: emojiFor(r.title, '✅'), label: remLabel(r), show: remShow(r), remId: r.id };
    }
    case 'complete_reminder': {
      const r = S.reminders.find(x => x.id === a.id) || fuzzyFind(S.reminders.filter(x => !x.done), a.title);
      if (!r) return null;
      const res = completeReminder(r);
      return { icon: '🎉', label: `${r.title} ${res === 'repeat' ? 'erledigt · nächstes Mal ' + dueLabel(r.due) : 'erledigt'}`, show: [{ tab: 'reminders', listId: r.listId, key: 'rem:' + r.id }], done: true };
    }
    case 'delete_reminder': {
      const r = S.reminders.find(x => x.id === a.id) || fuzzyFind(S.reminders, a.title);
      if (!r) return null;
      S.reminders = S.reminders.filter(x => x.id !== r.id);
      return { icon: '🗑️', label: `${r.title} gelöscht`, show: [{ tab: 'reminders', listId: r.listId }] };
    }
    case 'add_extra': {
      if (!a.title) return null;
      const p = getPlan(date), id = a._id || uid();
      p.extras.push({ id, title: a.title, minutes: +a.minutes || guessExtraDur(a.title), at: normTime(a.time), after: a.after || null });
      return { icon: emojiFor(a.title, '🟣'), label: `${a.title} · ${relDay(date)}${a.time ? ' ' + a.time : ''} (${+a.minutes || guessExtraDur(a.title)} min)`, show: [{ tab: 'plan', date, key: 'pl:' + id }] };
    }
    case 'remove_extra': {
      const p = getPlan(date), q = (a.title || '').toLowerCase();
      const x = fuzzyFind(p.extras, q);
      if (x) { p.extras = p.extras.filter(e => e !== x); return { icon: '➖', label: `${x.title} entfernt (${relDay(date)})`, show: [{ tab: 'plan', date }] }; }
      const r = fuzzyFind(S.routines.filter(r => routineApplies(r, date)), q);
      if (r) { p.skipRoutines.push(r.id); return { icon: '➖', label: `${r.title} fällt ${relDay(date)} aus`, show: [{ tab: 'plan', date }] }; }
      return null;
    }
    case 'add_routine': {
      if (!a.title) return null;
      const id = a._id || uid(), at = normTime(a.time);
      const days = ['school', 'daily', 'weekdays', 'weekend', 'noschool'].includes(a.repeat) ? a.repeat : 'school';
      S.routines.push({ id, title: a.title, minutes: +a.minutes || guessExtraDur(a.title), anchor: at ? 'at' : (a.after === 'chain' ? 'chain' : 'after_school'), at, days, order: S.routines.length });
      return { icon: '🔁', label: `Routine: ${a.title} · ${ROUTINE_DAYS[days]}`, show: [{ tab: 'plan', date: todayStr(), key: 'pl:rt-' + id }] };
    }
    case 'study_plan': {
      const test = normDate(a.due_date) || normDate(a.date);
      if (!test || !a.title) return null;
      const made = createStudyPlan(a.title, test, clamp(+a.count || 3, 1, 8), +a.minutes || 45);
      if (!made.length) return null;
      return { icon: '🧠', label: `Lernplan: ${made.length}× ${made[0].duration} min bis ${dueLabel(test)}`, show: [{ tab: 'reminders', listId: made[0].listId, key: 'rem:' + made[0].id }, { tab: 'plan', date: made[0].planDate, key: 'pl:' + made[0].id }] };
    }
    case 'set_energy': {
      const lv = /müd|tired|kaputt/i.test(a.level || '') ? 'müde' : /fit|motiv|energ/i.test(a.level || '') ? 'fit' : 'normal';
      getPlan(date).energy = lv;
      return { icon: lv === 'müde' ? '😴' : lv === 'fit' ? '⚡' : '🙂', label: `Energie ${relDay(date)}: ${lv}`, show: [{ tab: 'plan', date, key: 'energy' }] };
    }
    case 'replan': {
      getPlan(date).anchor = date === todayStr() ? nowAnchor() : toMin(S.settings.dayStart);
      return { icon: '🔄', label: `${relDay(date).replace(/^./, c => c.toUpperCase())} neu geplant`, show: [{ tab: 'plan', date }] };
    }
    case 'set_duration': {
      const p = getPlan(date), q = a.id || a.title;
      const r = S.reminders.find(x => x.id === q) || fuzzyFind(S.reminders.filter(x => !x.done), q);
      if (r && +a.minutes) { r.duration = +a.minutes; return { icon: '⏱', label: `${r.title}: ${a.minutes} min`, show: [{ tab: 'plan', date, key: 'pl:' + r.id }] }; }
      const x = fuzzyFind(p.extras, q);
      if (x && +a.minutes) { x.minutes = +a.minutes; return { icon: '⏱', label: `${x.title}: ${a.minutes} min`, show: [{ tab: 'plan', date, key: 'pl:' + x.id }] }; }
      const rt = fuzzyFind(S.routines, q);
      if (rt && +a.minutes) { p.extras.push({ id: uid(), title: rt.title, minutes: +a.minutes, at: null, after: rt.anchor === 'after_school' ? 'Schule' : null }); p.skipRoutines.push(rt.id); return { icon: '⏱', label: `${rt.title} ${relDay(date)}: ${a.minutes} min`, show: [{ tab: 'plan', date }] }; }
      return null;
    }
    case 'cancel_lesson': case 'substitute_lesson': {
      const l = fuzzyFind(lessonsOn(date, true), a.title, x => x.origSubject || x.subject || '');
      if (!l) return null;
      const ov = (S.ttOverrides[date] ||= {});
      ov[l.id] = a.type === 'cancel_lesson' ? { cancel: true } : { subject: a.notes || l.subject, room: a.location || '' };
      return { icon: a.type === 'cancel_lesson' ? '🚫' : '🔁', label: `${l.origSubject || l.subject} ${relDay(date)} ${a.type === 'cancel_lesson' ? 'entfällt' : '→ ' + (a.notes || 'Vertretung')}`, show: [{ tab: 'calendar', date, key: 'sch:' + date }, { tab: 'plan', date }] };
    }
    case 'navigate': {
      const tab = /kal|cal/i.test(a.tab || '') ? 'calendar' : /erinn|rem|aufg/i.test(a.tab || '') ? 'reminders' : 'plan';
      return { icon: '👀', label: `Zeige ${tab === 'calendar' ? 'Kalender' : tab === 'reminders' ? 'Erinnerungen' : 'Tagesplan'}${normDate(a.date) ? ' · ' + relDay(date) : ''}`, show: [{ tab, date: normDate(a.date) || undefined, view: ['day', 'week', 'month', 'list'].includes(a.view) ? a.view : undefined }], nav: true };
    }
    case 'focus': {
      const r = S.reminders.find(x => x.id === a.id) || fuzzyFind(S.reminders.filter(x => !x.done), a.title);
      if (!r) return null;
      startFocus({ key: r.id, id: r.id, title: r.title, dur: r.duration || guessTaskDur(r.title) });
      return { icon: '⏱', label: `Fokus: ${r.title}`, show: [] };
    }
  }
  return null;
}
