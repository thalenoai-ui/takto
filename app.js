'use strict';
/* =====================================================================
   Tagwerk · app.js – Klicks, Wischgesten, Timer und Start der App
   ===================================================================== */

function toggleReminder(id, e, subId = null) {
  const r = S.reminders.find(x => x.id === id); if (!r) return;
  const res = completeReminder(r, subId);
  if (res && res !== 'undone') {
    ui.rem.recent[id] = Date.now();
    if (e && e.clientX) confetti(e.clientX, e.clientY);
    setTimeout(() => { render.keepScroll = true; render(); }, 1700);
    if (res === 'repeat') toast(`Erledigt ✓ – nächstes Mal ${dueLabel(r.due)}`);
    else if (res === 'done' && S.focus?.remId === id) { S.focus = null; closeFocus(); }
  }
  save(); render.keepScroll = true; render();
}
function moveToTomorrow(id) {
  const r = S.reminders.find(x => x.id === id); if (!r) return;
  const undo = makeUndo(), tm = ymd(addDays(new Date(), 1));
  r.planDate = tm; r.planTime = null; r.postponed = (r.postponed || 0) + 1;
  save(); render.keepScroll = true; render();
  toast(`„${r.title}“ → morgen`, { action: 'Rückgängig', onAction: () => doUndo(undo) });
}
function deleteReminder(id) {
  const r = S.reminders.find(x => x.id === id); if (!r) return;
  const undo = makeUndo();
  S.reminders = S.reminders.filter(x => x.id !== id);
  save(); render.keepScroll = true; render();
  toast(`„${r.title}“ gelöscht`, { action: 'Rückgängig', onAction: () => doUndo(undo) });
}
function addQuickExtra(title, minutes) {
  const date = ui.plan.date, id = uid();
  getPlan(date).extras.push({ id, title, minutes, at: null, after: null });
  save(); render.keepScroll = true; render();
  showTarget({ tab: 'plan', date, key: 'pl:' + id });
  toast(`${emojiFor(title)} ${title} eingeplant – der Rest rückt nach`, { action: 'Rückgängig', onAction: () => { const p = getPlan(date); p.extras = p.extras.filter(x => x.id !== id); save(); render(); } });
}

const ACT = {
  settings: () => openSettings(),
  calendars: () => openCalendars(),
  timetable: () => openTimetable(),
  weatherSetup: () => {
    const city = prompt('Für welchen Ort soll ich das Wetter anzeigen? (z. B. Wien)', S.settings.weatherCity || '');
    if (city) { S.settings.weatherCity = city.trim(); S.weather = null; save(); refreshWeather(true); }
  },
  aiOpen: () => AS.open ? closeAssistant() : openAssistant(true),
  // Kalender
  calView: el => { ui.cal.view = el.dataset.v; ui.cal.scrollTo = true; if (el.dataset.v !== 'month') ui.cal.cursor = parseYmd(ui.cal.sel); render(); },
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
  lessonDay: el => openLessonDay(el.dataset.date || ui.cal.sel),
  slot: (el, e) => {
    if (e.target !== el) return;
    const y = e.clientY - el.getBoundingClientRect().top;
    ui.cal.sel = el.dataset.date;
    openEventEditor(null, { date: el.dataset.date, startMin: clamp(Math.floor(y / H * 2) * 30, 0, 23 * 60) });
  },
  pickColor: el => { const p = el.closest('.color-pick'); p.dataset.value = el.dataset.color; $$('button', p).forEach(b => b.classList.toggle('on', b === el)); },
  // Erinnerungen
  remHome: () => { ui.rem.screen = 'home'; render(); },
  openList: el => { ui.rem.screen = 'list'; ui.rem.id = el.dataset.id; render(); },
  openSmart: el => { ui.rem.screen = 'smart'; ui.rem.id = el.dataset.id; render(); },
  newRem: () => openReminderEditor(null, {}),
  newList: () => openListEditor(null),
  editList: el => openListEditor(listById(el.dataset.id)),
  editRem: el => { const r = S.reminders.find(x => x.id === el.dataset.id); if (r) openReminderEditor(r); },
  toggleRem: (el, e) => toggleReminder(el.dataset.id, e),
  toggleSub: (el, e) => toggleReminder(el.dataset.id, e, el.dataset.sub),
  quickAdd: el => quickAdd(el),
  toggleShowDone: el => { const l = listById(el.dataset.id); l.showDone = !l.showDone; save(); render.keepScroll = true; render(); },
  remTomorrow: el => moveToTomorrow(el.dataset.id),
  remDelete: el => deleteReminder(el.dataset.id),
  // Tagesplan
  planPrev: () => { ui.plan.date = ymd(addDays(parseYmd(ui.plan.date), -1)); render(); },
  planNext: () => { ui.plan.date = ymd(addDays(parseYmd(ui.plan.date), 1)); render(); },
  planToday: () => { ui.plan.date = todayStr(); render(); },
  planDay: () => {
    if (aiReady()) { openAssistant(); asSend('✨ Plane meinen Tag'); return; }
    const p = getPlan(ui.plan.date); p.anchor = ui.plan.date === todayStr() ? nowAnchor() : toMin(S.settings.dayStart); p.aiOrder = null;
    save(); render.keepScroll = true; render();
    toast('✨ Geplant: Fixtermine bleiben, Aufgaben liegen nach Dringlichkeit in den Lücken.');
  },
  adjust: () => openAdjust(),
  setEnergy: el => { getPlan(ui.plan.date).energy = el.dataset.v; save(); render.keepScroll = true; render(); toast({ müde: '😴 Leichtes zuerst, mehr Pausen, weniger Programm', normal: '🙂 Normaler Plan', fit: '⚡ Schweres zuerst – los geht’s!' }[el.dataset.v]); },
  replanNow: () => { getPlan(ui.plan.date).anchor = nowAnchor(); save(); render.keepScroll = true; render(); toast('Alles Offene ist ab jetzt neu geplant ⏰'); },
  toggleUnit: (el, e) => toggleReminder(el.dataset.id, e, el.dataset.sub || null),
  focus: el => {
    const plan = computePlan(ui.plan.date), it = plan.items.find(i => i.key === el.dataset.key);
    if (ui.plan.date !== todayStr()) { toast('Den Fokus-Timer kannst du für heute starten.'); return; }
    startFocus({ key: el.dataset.key, id: el.dataset.id, sub: el.dataset.sub, title: it?.title || '', dur: it ? it.e - it.s : 30 });
  },
  openFocus: () => openFocus(),
  rmExtra: el => { const p = getPlan(ui.plan.date), undo = makeUndo(); p.extras = p.extras.filter(x => x.id !== el.dataset.id); save(); render.keepScroll = true; render(); toast('Entfernt – der Rest rückt nach', { action: 'Rückgängig', onAction: () => doUndo(undo) }); },
  skipRoutine: el => { const p = getPlan(ui.plan.date), undo = makeUndo(); p.skipRoutines.push(el.dataset.id); save(); render.keepScroll = true; render(); toast('Heute ausgelassen', { action: 'Rückgängig', onAction: () => doUndo(undo) }); },
  quick: el => addQuickExtra(el.dataset.t, +el.dataset.m),
  moveOpenTomorrow: () => {
    const plan = computePlan(ui.plan.date), undo = makeUndo(), tm = ymd(addDays(new Date(), 1));
    const ids = [...new Set(plan.items.filter(i => i.kind === 'task' && !i.done).map(i => i.id))];
    ids.forEach(id => { const r = S.reminders.find(x => x.id === id); if (r) { r.planDate = tm; r.planTime = null; r.postponed = (r.postponed || 0) + 1; } });
    getPlan(ui.plan.date).reviewDone = true; save(); render.keepScroll = true; render();
    toast(`${ids.length} ${ids.length === 1 ? 'Aufgabe' : 'Aufgaben'} auf morgen verschoben 🌙`, { action: 'Rückgängig', onAction: () => doUndo(undo) });
  },
  reviewDone: () => { getPlan(ui.plan.date).reviewDone = true; save(); render.keepScroll = true; render(); toast('Schönen Abend! 🌙'); },
  weekReview: () => openWeekReview(),
};
function calShift(n) {
  const c = ui.cal;
  if (c.view === 'month') c.cursor = new Date(c.cursor.getFullYear(), c.cursor.getMonth() + n, 1);
  else if (c.view === 'week') { c.cursor = addDays(c.cursor, 7 * n); c.sel = ymd(addDays(parseYmd(c.sel), 7 * n)); }
  else if (c.view === 'day') { c.sel = ymd(addDays(parseYmd(c.sel), n)); c.cursor = parseYmd(c.sel); }
  render.keepScroll = c.view !== 'month'; render();
}

// ---------- Klicks ----------
let swallowClick = false;
document.addEventListener('click', e => { if (swallowClick) { e.stopPropagation(); e.preventDefault(); swallowClick = false; } }, true);
document.addEventListener('click', e => {
  const tab = e.target.closest('[data-tab]');
  if (tab) {
    if (ui.tab === tab.dataset.tab && tab.dataset.tab === 'reminders') ui.rem.screen = 'home';
    if (ui.tab === tab.dataset.tab && tab.dataset.tab === 'plan') ui.plan.date = todayStr();
    ui.tab = tab.dataset.tab; try { localStorage.setItem('tagwerk.tab', ui.tab); } catch { }
    ui.cal.scrollTo = true; render(); return;
  }
  if (!e.target.closest('.rem-wrap.open')) $$('.rem-wrap.open').forEach(closeSwipe);
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

// ---------- Wischen: Erinnerungen (rechts = erledigt, links = Morgen/Löschen) ----------
let swp = null;
function closeSwipe(w) { const el = w.querySelector('.rem'); el.style.transform = ''; w.classList.remove('open', 'swipe-left', 'swipe-right', 'arm'); }
view.addEventListener('pointerdown', e => {
  const wrap = e.target.closest('[data-swipe-id]');
  if (!wrap || e.button > 0 || e.target.closest('.rem-bg') || e.target.closest('input')) return;
  $$('.rem-wrap.open').forEach(w => w !== wrap && closeSwipe(w));
  swp = { wrap, el: wrap.querySelector('.rem'), x: e.clientX, y: e.clientY, dx: 0, active: false, base: wrap.classList.contains('open') ? -150 : 0, id: e.pointerId };
});
view.addEventListener('pointermove', e => {
  if (!swp || e.pointerId !== swp.id) return;
  const dx = e.clientX - swp.x, dy = e.clientY - swp.y;
  if (!swp.active) {
    if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.4) { swp.active = true; swp.el.style.transition = 'none'; try { swp.wrap.setPointerCapture(e.pointerId); } catch { } }
    else if (Math.abs(dy) > 10) { swp = null; return; } else return;
  }
  swp.dx = clamp(swp.base + dx, -180, 150);
  swp.el.style.transform = `translateX(${swp.dx}px)`;
  swp.wrap.classList.toggle('swipe-right', swp.dx > 0); swp.wrap.classList.toggle('swipe-left', swp.dx < 0); swp.wrap.classList.toggle('arm', swp.dx > 90);
});
const endSwipe = e => {
  if (!swp) return;
  const s = swp; swp = null;
  if (!s.active) return;
  s.el.style.transition = ''; swallowClick = true; setTimeout(() => swallowClick = false, 80);
  if (s.dx > 90) { closeSwipe(s.wrap); toggleReminder(s.wrap.dataset.swipeId, e); }
  else if (s.dx < -60) { s.el.style.transform = 'translateX(-150px)'; s.wrap.classList.add('open'); }
  else closeSwipe(s.wrap);
};
view.addEventListener('pointerup', endSwipe);
view.addEventListener('pointercancel', () => { if (swp) { closeSwipe(swp.wrap); swp = null; } });

// ---------- Wischen im Kalender: vor/zurück ----------
let touch = null;
view.addEventListener('touchstart', e => { if (ui.tab === 'calendar' && e.target.closest('[data-swipe]')) touch = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() }; }, { passive: true });
view.addEventListener('touchend', e => {
  if (!touch) return;
  const dx = e.changedTouches[0].clientX - touch.x, dy = e.changedTouches[0].clientY - touch.y;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - touch.t < 600) calShift(dx < 0 ? 1 : -1);
  touch = null;
}, { passive: true });

// ---------- Zeit läuft: jede Minute neu zeichnen (wenn nichts getippt wird) ----------
setInterval(() => {
  if (document.querySelector('.sheet') || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || swp) return;
  if (ui.tab === 'plan' || ui.tab === 'calendar') { render.keepScroll = true; render(); }
}, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { refreshWeather(); untisAutoSync(); render.keepScroll = true; render(); } });
window.addEventListener('resize', () => layoutAs());

// ---------- Start ----------
applyTheme();
asBuild();
render();
if (!S.settings.onboarded) setTimeout(openOnboarding, 350);
else setTimeout(showAiHint, 1500);
refreshWeather();
untisAutoSync();
if (S.focus) updateFocusPill();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { });
window.Tagwerk = { S: () => S, render, paintAs, importICS, computePlan, applyAction, localAssistant, asSend, save, showTarget };
