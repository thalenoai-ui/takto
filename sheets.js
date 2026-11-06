'use strict';
/* =====================================================================
   Tagwerk · sheets.js – Eingabe-Fenster, Fokus-Timer, Rückblick,
   Einführung und Einstellungen
   ===================================================================== */

function openSheet({ title, left = 'Abbrechen', right = 'Fertig', body, onSave, onOpen, onClose, cls = '' }) {
  const root = $('#sheet-root');
  const bd = document.createElement('div'); bd.className = 'backdrop';
  const sh = document.createElement('div'); sh.className = 'sheet ' + cls;
  sh.innerHTML = `<div class="sheet-head"><button class="link" data-x="cancel">${left || ''}</button><h3>${esc(title)}</h3><button class="link strong" data-x="save">${right || ''}</button></div><div class="sheet-body">${body}</div>`;
  root.append(bd, sh);
  const close = () => { sh.classList.add('closing'); bd.classList.add('closing'); setTimeout(() => { bd.remove(); sh.remove(); }, 180); onClose?.(); };
  bd.onclick = close;
  sh.querySelector('[data-x=cancel]').onclick = close;
  sh.querySelector('[data-x=save]').onclick = () => { if (!onSave || onSave(sh) !== false) close(); };
  onOpen?.(sh, close);
  return { el: sh, close };
}
const val = (sh, name) => { const el = sh.querySelector(`[name="${name}"]`); return !el ? null : el.type === 'checkbox' ? el.checked : el.value; };
const sw = (name, on, extra = '') => `<label class="switch"><input type="checkbox" name="${name}" ${on ? 'checked' : ''} ${extra}><span></span></label>`;
const colorPick = cur => `<div class="color-pick" data-value="${cur}">${COLORS.map(c => `<button type="button" class="${c === cur ? 'on' : ''}" style="background:${c}" data-act="pickColor" data-color="${c}"></button>`).join('')}</div>`;
const opts = (list, cur) => list.map(([v, l]) => `<option value="${v}" ${String(v) === String(cur ?? '') ? 'selected' : ''}>${l}</option>`).join('');

// =====================================================================
//  Ereignis
// =====================================================================
function rruleSel(r) {
  if (!r) return 'none';
  if (r.freq === 'DAILY' && r.interval === 1) return 'daily';
  if (r.freq === 'WEEKLY' && r.byday?.join() === '1,2,3,4,5' && r.interval === 1) return 'weekdays';
  if (r.freq === 'WEEKLY' && (!r.byday || r.byday.length <= 1)) return r.interval === 2 ? 'biweekly' : r.interval === 1 ? 'weekly' : 'custom';
  if (r.freq === 'MONTHLY' && !r.nth && r.interval === 1) return 'monthly';
  if (r.freq === 'YEARLY' && r.interval === 1) return 'yearly';
  return 'custom';
}
function openEventEditor(ev, o = {}) {
  const isNew = !ev;
  let d;
  if (ev) d = JSON.parse(JSON.stringify(ev));
  else {
    const date = o.date || ui.cal.sel, now = new Date();
    const s = parseYmd(date); s.setMinutes(o.startMin ?? Math.min(23 * 60, (now.getHours() + 1) * 60));
    d = { title: '', location: '', notes: '', start: toLocal(s), end: toLocal(new Date(s.getTime() + S.settings.defaultEventMin * 60000)), allDay: false, calendarId: calById(S.settings.defaultCal) ? S.settings.defaultCal : S.calendars[0].id, fixed: true, rrule: null, exdates: [], source: 'local' };
  }
  const [sd, stime] = d.start.split('T'), [ed0, etime] = d.end.split('T');
  const ed = d.allDay ? ymd(addDays(parseYmd(ed0), -1)) : ed0, rs = rruleSel(d.rrule);
  const body = `
    <div class="group"><div class="cell"><input type="text" name="title" placeholder="Titel" value="${esc(d.title)}"></div>
      <div class="cell"><input type="text" name="location" placeholder="Ort" value="${esc(d.location)}"></div></div>
    <div class="group ${d.allDay ? 'is-allday' : ''}" id="ev-times">
      <div class="cell"><span class="grow">Ganztägig</span>${sw('allDay', d.allDay)}</div>
      <div class="cell"><span class="grow">Beginn</span><input type="date" class="right" name="sd" value="${sd}"><input type="time" class="right t-only" name="st" value="${stime}"></div>
      <div class="cell"><span class="grow">Ende</span><input type="date" class="right" name="ed" value="${ed}"><input type="time" class="right t-only" name="et" value="${etime}"></div></div>
    <div class="group">
      <div class="cell"><span class="grow">Wiederholen</span><select class="right" name="rep">${opts([['none', 'Nie'], ['daily', 'Täglich'], ['weekdays', 'An Wochentagen'], ['weekly', 'Wöchentlich'], ['biweekly', 'Alle 2 Wochen'], ['monthly', 'Monatlich'], ['yearly', 'Jährlich'], ...(rs === 'custom' ? [['custom', 'Benutzerdefiniert']] : [])], rs)}</select></div>
      <div class="cell"><span class="grow">Wiederholung endet</span><input type="date" class="right" name="until" value="${d.rrule?.until ? d.rrule.until.slice(0, 10) : ''}"></div></div>
    <div class="group">
      <div class="cell"><span class="grow">Kalender</span><select class="right" name="cal">${opts(S.calendars.map(c => [c.id, esc(c.name)]), d.calendarId)}</select></div>
      <div class="cell"><span class="grow">Fixtermin<div class="cell-sub">Wird im Tagesplan nie verschoben</div></span>${sw('fixed', d.fixed !== false)}</div></div>
    <div class="group"><div class="cell"><textarea name="notes" placeholder="Notizen">${esc(d.notes)}</textarea></div></div>
    ${!isNew ? (d.rrule ? `<div class="group"><button class="cell danger" data-x="del-one">Nur diesen Termin löschen</button><button class="cell danger" data-x="del-all">Alle zukünftigen löschen</button></div>`
      : `<div class="group"><button class="cell danger" data-x="del-all">Ereignis löschen</button></div>`) : ''}
    ${d.source === 'google' ? `<p class="help">Aus Google kopiert. Änderungen bleiben nur in ${APP_NAME}.</p>` : ''}`;
  openSheet({
    title: isNew ? 'Neues Ereignis' : 'Ereignis', right: isNew ? 'Hinzufügen' : 'Fertig', body,
    onOpen(sh, close) {
      sh.querySelector('[name=allDay]').onchange = e => sh.querySelector('#ev-times').classList.toggle('is-allday', e.target.checked);
      sh.querySelector('[name=sd]').onchange = e => { const x = sh.querySelector('[name=ed]'); if (x.value < e.target.value) x.value = e.target.value; };
      sh.querySelector('[name=st]').onchange = e => {
        const et = sh.querySelector('[name=et]');
        if (sh.querySelector('[name=sd]').value === sh.querySelector('[name=ed]').value && toMin(et.value) <= toMin(e.target.value)) et.value = hm(Math.min(toMin(e.target.value) + S.settings.defaultEventMin, 1439));
      };
      const del = which => {
        const undo = makeUndo();
        if (which === 'one') ev.exdates = [...(ev.exdates || []), o.date];
        else if (ev.rrule && o.date && o.date > ev.start.slice(0, 10)) { ev.rrule.until = ymd(addDays(parseYmd(o.date), -1)) + 'T23:59'; ev.rrule.count = null; }
        else S.events = S.events.filter(x => x.id !== ev.id);
        save(); render(); close(); toast('Gelöscht', { action: 'Rückgängig', onAction: () => doUndo(undo) });
      };
      sh.querySelector('[data-x=del-one]')?.addEventListener('click', () => del('one'));
      sh.querySelector('[data-x=del-all]')?.addEventListener('click', () => del('all'));
      if (isNew) setTimeout(() => sh.querySelector('[name=title]').focus(), 320);
    },
    onSave(sh) {
      const title = val(sh, 'title').trim() || 'Neues Ereignis', allDay = val(sh, 'allDay');
      const sdv = val(sh, 'sd'), edv = val(sh, 'ed') || sdv;
      let start, end;
      if (allDay) { start = sdv + 'T00:00'; end = ymd(addDays(parseYmd(edv < sdv ? sdv : edv), 1)) + 'T00:00'; }
      else {
        start = `${sdv}T${val(sh, 'st') || '09:00'}`; end = `${edv}T${val(sh, 'et') || '10:00'}`;
        if (parseLocal(end) <= parseLocal(start)) { toast('Das Ende muss nach dem Beginn liegen.'); return false; }
      }
      const rep = val(sh, 'rep'), until = val(sh, 'until');
      let rrule = rep === 'custom' ? d.rrule : repeatToRRule(rep, parseYmd(sdv));
      if (rrule) { rrule = { ...rrule }; if (until) rrule.until = until + 'T23:59'; else if (rep !== 'custom') delete rrule.until; }
      const obj = { ...d, title, location: val(sh, 'location'), notes: val(sh, 'notes'), allDay, start, end, rrule, calendarId: val(sh, 'cal'), fixed: val(sh, 'fixed') };
      if (isNew) S.events.push({ id: uid(), ...obj }); else Object.assign(ev, obj);
      save(); render();
    },
  });
}

// =====================================================================
//  Erinnerung (mit Unteraufgaben, Wiederholung, festem Termin, Lernplan)
// =====================================================================
const isTestTitle = t => /schularbeit|\btest|prüfung|klausur/i.test(t || '');
function openReminderEditor(r, defs = {}) {
  const isNew = !r;
  const d = r ? JSON.parse(JSON.stringify(r)) : newReminder(defs);
  let subs = d.subtasks || [];
  const subsHTML = () => subs.map(s => `<div class="cell st-row"><button type="button" class="circle small ${s.done ? 'on' : ''}" data-st-toggle="${s.id}" aria-label="erledigt"></button>
      <input type="text" value="${esc(s.title)}" data-st-edit="${s.id}"><button type="button" class="del" data-st-del="${s.id}" aria-label="löschen">⊖</button></div>`).join('')
    + `<div class="cell"><span class="plus-s">+</span><input type="text" placeholder="Unteraufgabe hinzufügen" data-st-new enterkeyhint="done"></div>`;
  const body = `
    <div class="group"><div class="cell"><input type="text" name="title" placeholder="Titel" value="${esc(d.title)}"></div>
      <div class="cell"><textarea name="notes" placeholder="Notizen">${esc(d.notes)}</textarea></div></div>
    <div class="group">
      <div class="cell"><span class="ico" style="background:#ff3b30">${I.cal}</span><span class="grow">Fällig am</span>${sw('hasDue', !!d.due)}</div>
      <div class="cell sub-row ${d.due ? '' : 'hidden'}" data-for="hasDue"><input type="date" name="due" value="${d.due || todayStr()}"></div>
      <div class="cell"><span class="ico" style="background:#30b0ff">${I.clock}</span><span class="grow">Uhrzeit</span>${sw('hasTime', !!d.time)}</div>
      <div class="cell sub-row ${d.time ? '' : 'hidden'}" data-for="hasTime"><input type="time" name="time" value="${d.time || '16:00'}"></div>
      <div class="cell"><span class="grow">Wiederholen</span><select class="right" name="repeat">${opts([['', 'Nie'], ['daily', 'Täglich'], ['weekdays', 'Mo–Fr'], ['weekly', 'Wöchentlich'], ['monthly', 'Monatlich']], d.repeat || '')}</select></div></div>
    <div class="group">
      <div class="cell"><span class="ico" style="background:${ACCENT}">📌</span><span class="grow">Fest einplanen<div class="cell-sub">Fixer Zeitpunkt im Tagesplan</div></span>${sw('hasPlan', !!d.planDate)}</div>
      <div class="cell sub-row ${d.planDate ? '' : 'hidden'}" data-for="hasPlan"><input type="date" name="planDate" value="${d.planDate || todayStr()}"><input type="time" name="planTime" value="${d.planTime || ''}"></div>
      <div class="cell"><span class="ico" style="background:#b44cff">⏱</span><span class="grow">Dauer</span>
        <select class="right" name="duration">${opts([['', 'automatisch'], ...[10, 15, 20, 30, 45, 60, 90, 120, 180].map(m => [m, durLabel(m)])], d.duration || '')}</select></div></div>
    <div class="group">
      <div class="cell"><span class="ico" style="background:#ff9500">${I.flag}</span><span class="grow">Markierung</span>${sw('flagged', d.flagged)}</div>
      <div class="cell"><span class="grow">Priorität</span><div class="prio-seg" data-value="${d.priority}">${['Keine', '!', '!!', '!!!'].map((l, i) => `<button type="button" class="${i === d.priority ? 'on' : ''}" data-p="${i}">${l}</button>`).join('')}</div></div>
      <div class="cell"><span class="grow">Liste</span><select class="right" name="list">${opts(S.lists.map(l => [l.id, esc(l.name)]), d.listId)}</select></div></div>
    <div class="group-title">Unteraufgaben</div>
    <div class="group" id="subs">${subsHTML()}</div>
    <div class="group study ${isTestTitle(d.title) ? '' : 'hidden'}"><button class="cell action" data-x="study">🧠 Lernplan für diesen Test erstellen</button></div>
    ${!isNew ? `<div class="group"><button class="cell action" data-x="focus">▶ Jetzt konzentriert starten</button><button class="cell danger" data-x="del">Erinnerung löschen</button></div>` : ''}`;
  openSheet({
    title: isNew ? 'Neue Erinnerung' : 'Details', right: isNew ? 'Hinzufügen' : 'Fertig', body,
    onOpen(sh, close) {
      ['hasDue', 'hasTime', 'hasPlan'].forEach(n => sh.querySelector(`[name=${n}]`).onchange = e => {
        sh.querySelector(`[data-for=${n}]`).classList.toggle('hidden', !e.target.checked);
        if (n === 'hasTime' && e.target.checked && !sh.querySelector('[name=hasDue]').checked) { sh.querySelector('[name=hasDue]').checked = true; sh.querySelector('[data-for=hasDue]').classList.remove('hidden'); }
      });
      sh.querySelector('[name=title]').addEventListener('input', e => sh.querySelector('.study').classList.toggle('hidden', !isTestTitle(e.target.value)));
      const ps = sh.querySelector('.prio-seg');
      ps.onclick = e => { const b = e.target.closest('[data-p]'); if (!b) return; ps.dataset.value = b.dataset.p; $$('button', ps).forEach(x => x.classList.toggle('on', x === b)); };
      const box = sh.querySelector('#subs');
      const repaint = (focusNew) => { box.innerHTML = subsHTML(); if (focusNew) box.querySelector('[data-st-new]').focus(); };
      box.addEventListener('click', e => {
        const t = e.target.closest('button'); if (!t) return;
        if (t.dataset.stToggle) { const s = subs.find(x => x.id === t.dataset.stToggle); s.done = !s.done; repaint(); }
        if (t.dataset.stDel) { subs = subs.filter(x => x.id !== t.dataset.stDel); repaint(); }
      });
      box.addEventListener('change', e => { const id = e.target.dataset.stEdit; if (id) { const s = subs.find(x => x.id === id); s.title = e.target.value; } });
      box.addEventListener('keydown', e => {
        if (e.target.dataset.stNew !== undefined && e.key === 'Enter') { e.preventDefault(); const v = e.target.value.trim(); if (v) { subs.push({ id: uid(), title: v, done: false }); repaint(true); } }
      });
      box.addEventListener('focusout', e => { if (e.target.dataset.stNew !== undefined && e.target.value.trim()) { subs.push({ id: uid(), title: e.target.value.trim(), done: false }); setTimeout(() => repaint(), 0); } });
      sh.querySelector('[data-x=del]')?.addEventListener('click', () => {
        const undo = makeUndo(); S.reminders = S.reminders.filter(x => x.id !== r.id); save(); render(); close();
        toast('Erinnerung gelöscht', { action: 'Rückgängig', onAction: () => doUndo(undo) });
      });
      sh.querySelector('[data-x=focus]')?.addEventListener('click', () => { close(); startFocus({ key: r.id, id: r.id, title: r.title, dur: r.duration || guessTaskDur(r.title) }); });
      sh.querySelector('[data-x=study]').addEventListener('click', () => {
        const title = val(sh, 'title').trim(), due = val(sh, 'hasDue') ? val(sh, 'due') : null;
        if (!due) { toast('Trag zuerst ein, wann der Test ist (Fällig am).'); return; }
        openStudyPlan(title, due);
      });
      if (isNew) setTimeout(() => sh.querySelector('[name=title]').focus(), 320);
    },
    onSave(sh) {
      const title = val(sh, 'title').trim();
      if (!title) { if (isNew) return; toast('Titel fehlt'); return false; }
      const pending = sh.querySelector('[data-st-new]')?.value.trim(); if (pending) subs.push({ id: uid(), title: pending, done: false });
      const hasDue = val(sh, 'hasDue'), hasTime = val(sh, 'hasTime'), hasPlan = val(sh, 'hasPlan');
      const obj = {
        title, notes: val(sh, 'notes'), due: hasDue ? val(sh, 'due') : null, time: hasDue && hasTime ? val(sh, 'time') : null,
        flagged: val(sh, 'flagged'), priority: +sh.querySelector('.prio-seg').dataset.value, listId: val(sh, 'list'),
        duration: val(sh, 'duration') ? +val(sh, 'duration') : null, repeat: val(sh, 'repeat') || null, subtasks: subs,
        planDate: hasPlan ? val(sh, 'planDate') : null, planTime: hasPlan ? (normTime(val(sh, 'planTime')) || null) : null,
      };
      if (isNew) S.reminders.push({ ...d, ...obj }); else Object.assign(r, obj);
      save(); render();
    },
  });
}
function openStudyPlan(title, due) {
  openSheet({
    title: 'Lernplan', right: 'Erstellen',
    body: `<p class="help">Für <b>${esc(title)}</b> am <b>${esc(dueLabel(due))}</b> verteile ich Lerneinheiten auf die Tage davor – so musst du nicht alles am Vorabend lernen.</p>
      <div class="group"><div class="cell"><span class="grow">Lerneinheiten</span><select class="right" name="n">${opts([[2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']], 3)}</select></div>
      <div class="cell"><span class="grow">Dauer pro Einheit</span><select class="right" name="m">${opts([[20, '20 min'], [30, '30 min'], [45, '45 min'], [60, '1 h']], 45)}</select></div></div>`,
    onSave(sh) {
      const undo = makeUndo();
      const made = createStudyPlan(title, due, +val(sh, 'n'), +val(sh, 'm'));
      if (!made.length) { toast('Bis zum Test ist leider kein Tag mehr frei.'); return; }
      save(); render();
      toast(`🧠 ${made.length} Lerneinheiten eingeplant`, { action: 'Rückgängig', onAction: () => doUndo(undo) });
    },
  });
}
function openListEditor(l) {
  const isNew = !l, d = l || { name: '', color: COLORS[(S.lists.length + 4) % COLORS.length] };
  openSheet({
    title: isNew ? 'Neue Liste' : 'Liste bearbeiten',
    body: `<div class="group"><div class="cell"><input type="text" name="name" placeholder="Listenname" value="${esc(d.name)}"></div></div>
      <div class="group">${colorPick(d.color)}</div>
      ${!isNew && S.lists.length > 1 ? `<div class="group"><button class="cell danger" data-x="del">Liste löschen</button></div>` : ''}`,
    onOpen(sh, close) {
      sh.querySelector('[data-x=del]')?.addEventListener('click', () => {
        const undo = makeUndo();
        S.lists = S.lists.filter(x => x.id !== l.id); S.reminders = S.reminders.filter(r => r.listId !== l.id);
        ui.rem.screen = 'home'; save(); render(); close();
        toast(`Liste „${l.name}“ gelöscht`, { action: 'Rückgängig', onAction: () => doUndo(undo) });
      });
      if (isNew) setTimeout(() => sh.querySelector('[name=name]').focus(), 320);
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
  inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); if (commit()) { render.keepScroll = true; render(); quickAdd($('[data-act=quickAdd]')); } } };
  inp.onblur = () => setTimeout(() => { if (!document.body.contains(inp)) return; if (commit()) { render.keepScroll = true; render(); } else slot.innerHTML = ''; }, 120);
}

// =====================================================================
//  Kalenderliste, ICS-Import, Google
// =====================================================================
// ---------- Kalender-Regeln aus dem Hinweisfeld ("Geburtstage weglassen", "nur Privat") ----------
const KW_SYN = { geburtstag: ['geburtstag', 'birthday'], feiertag: ['feiertag', 'holiday', 'feiertage in'], ferien: ['ferien', 'vacation'] };
function expandKw(list) {
  const out = new Set();
  for (const x of list || []) {
    const w = String(x).toLowerCase().trim(); if (!w) continue; out.add(w);
    const stem = w.replace(/(en|e|s|n)$/, '');
    for (const [base, syn] of Object.entries(KW_SYN)) if (stem.length >= 4 && (stem.startsWith(base) || base.startsWith(stem))) syn.forEach(s => out.add(s));
  }
  return [...out];
}
function calSkip(calName, title) {
  const R = S.calRules || {}, c = (calName || '').toLowerCase(), t = (title || '').toLowerCase();
  if (R.only?.length && !expandKw(R.only).some(k => c.includes(k))) return true;
  return expandKw(R.exclude).some(k => c.includes(k) || (t && t.includes(k)));
}
async function setCalNote(note, names = []) {
  const known = [...new Set([...names, ...S.calendars.map(c => c.name), 'Geburtstage', 'Feiertage'])];
  const r = await interpretNote('Kalender und Termine', note, known);
  S.calRules = { note, exclude: r.exclude || [], only: r.only || [] };
  const before = S.events.length;
  S.events = S.events.filter(e => { const cal = calById(e.calendarId); return !cal || cal.source === 'local' || !calSkip(cal.name, e.title); });
  return before - S.events.length;
}
// ---------- ZIP-Export von Google direkt lesen (ohne Entpacken) ----------
async function unzipIcs(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf), dec = new TextDecoder(), out = [];
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('keine gültige ZIP-Datei');
  const count = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (!/\.ics$/i.test(name)) continue;
    const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true), data = u8.subarray(start, start + csize);
    let text;
    if (method === 0) text = dec.decode(data);
    else if (method === 8) text = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    else continue;
    out.push({ name: name.split('/').pop(), text });
  }
  return out;
}
async function importCalendarFiles(files) {
  let n = 0, cals = 0;
  for (const f of files) {
    const parts = /\.zip$/i.test(f.name) || f.type === 'application/zip' ? await unzipIcs(await f.arrayBuffer()) : [{ name: f.name, text: await f.text() }];
    for (const x of parts) { const k = importICS(x.text, x.name); if (k) cals++; n += k; }
  }
  save(); render();
  return { n, cals };
}
function openGoogleGuide(onDone) {
  const isIOS = /iphone|ipad/i.test(navigator.userAgent);
  const { el, close } = openSheet({
    title: 'Google-Kalender holen', left: 'Abbrechen', right: '',
    body: `<p class="help">Google gibt Kalender nur über einen Export heraus. Zwei kurze Schritte:</p>
      <div class="group">
        <a class="cell action" href="https://calendar.google.com/calendar/u/0/r/settings/export" target="_blank" rel="noopener"><span class="step">1</span><span class="grow">Google-Export öffnen<div class="cell-sub">Dort auf „Exportieren“ tippen – Google lädt eine ZIP-Datei herunter.</div></span><span class="chev">↗</span></a>
        <label class="cell action" style="cursor:pointer"><span class="step">2</span><span class="grow">Heruntergeladene Datei auswählen<div class="cell-sub">${isIOS ? 'In der Dateien-App unter „Downloads“' : 'Meist im Ordner „Downloads“'} – die ZIP-Datei geht direkt.</div></span><input type="file" accept=".ics,.zip,text/calendar,application/zip" multiple hidden data-gfile></label>
      </div>
      <p class="help">Du nutzt iCloud oder Outlook? Dort kannst du einen Kalender ebenfalls als .ics-Datei exportieren und hier auswählen.</p>
      ${S.settings.googleClientId ? '' : '<p class="help">Profi-Weg ohne Datei: Mit einer Google-<i>Client-ID</i> (Einstellungen → Google) reicht künftig ein Tipp.</p>'}`,
  });
  el.querySelector('[data-gfile]').addEventListener('change', async e => {
    if (!e.target.files?.length) return;
    try { const r = await importCalendarFiles([...e.target.files]); close(); toast(`📅 ${r.n} Termine aus ${r.cals} Kalender${r.cals === 1 ? '' : 'n'} übernommen ✓`); onDone?.(); }
    catch (err) { toast('Import fehlgeschlagen: ' + err.message, { ms: 5000 }); }
  });
}
function openCalendars() {
  const paint = () => `
    <div class="card import-card"><div class="ic-top"><span class="ic-ico">📅</span><div><b>Aus Google übernehmen</b>
      <div class="cell-sub">Kopiert deine Google-Termine in ${esc(APP_NAME)}. Training & Co. bleiben im Tagesplan fix.</div></div></div>
      <textarea data-cal-note rows="2" placeholder="Hinweis (optional): z. B. „Geburtstage und Feiertage weglassen“">${esc(S.calRules?.note || '')}</textarea>
      ${S.calRules?.exclude?.length || S.calRules?.only?.length ? `<p class="cell-sub">Gilt beim Import: ${[...(S.calRules.exclude || []).map(x => 'ohne ' + x), ...(S.calRules.only || []).map(x => 'nur ' + x)].map(esc).join(' · ')}</p>` : ''}
      <div class="hint-actions"><button class="btn primary" data-google-go>Von Google übernehmen</button>
      <label class="btn secondary file-btn">Datei wählen<input type="file" accept=".ics,.zip,text/calendar,application/zip" multiple hidden data-ics></label></div></div>
    <div class="group-title">Meine Kalender</div>
    <div class="group">${S.calendars.map(c => `<div class="cell"><button class="swatch" style="background:${c.color}" data-cal-color="${c.id}" aria-label="Farbe ändern"></button>
      <span class="grow">${esc(c.name)}<div class="cell-sub">${c.source === 'google' ? 'Google' : c.source === 'ics' ? 'Importiert' : 'Lokal'} · ${S.events.filter(e => e.calendarId === c.id).length} Termine</div></span>
      <label class="switch"><input type="checkbox" data-cal-vis="${c.id}" ${c.visible !== false ? 'checked' : ''}><span></span></label>
      ${S.calendars.length > 1 ? `<button class="x-btn" data-cal-del="${c.id}" aria-label="Löschen">×</button>` : ''}</div>`).join('')}
      <button class="cell action" data-cal-add>+ Kalender hinzufügen</button></div>
    <p class="help">Tipp auf den Farbpunkt, um die Farbe zu ändern. Ein erneuter Import aktualisiert einen Kalender, statt ihn doppelt anzulegen.</p>`;
  openSheet({
    title: 'Kalender', left: '', right: 'Fertig', body: paint(),
    onOpen(sh) {
      const body = sh.querySelector('.sheet-body'), repaint = () => { body.innerHTML = paint(); };
      const noteNow = async () => {
        const note = body.querySelector('[data-cal-note]')?.value || '';
        if (note === (S.calRules?.note || '')) return;
        const removed = await setCalNote(note); save(); render();
        if (removed) toast(`${removed} vorhandene Termine passend zum Hinweis entfernt`);
      };
      body.addEventListener('change', async e => {
        const t = e.target;
        if (t.dataset.calVis) { calById(t.dataset.calVis).visible = t.checked; save(); render(); }
        if (t.dataset.ics !== undefined && t.files?.length) {
          await noteNow();
          try { const r = await importCalendarFiles([...t.files]); repaint(); toast(`📅 ${r.n} Termine übernommen ✓`); }
          catch (err) { toast('Import fehlgeschlagen: ' + err.message, { ms: 5000 }); }
        }
      });
      body.addEventListener('click', async e => {
        const t = e.target.closest('button'); if (!t) return;
        if (t.dataset.googleGo !== undefined) {
          t.disabled = true; await noteNow(); t.disabled = false;
          if (S.settings.googleClientId) { await googleSync(); repaint(); } else openGoogleGuide(repaint);
          return;
        }
        if (t.dataset.calColor) { const c = calById(t.dataset.calColor); c.color = COLORS[(COLORS.indexOf(c.color) + 1) % COLORS.length]; save(); render(); repaint(); }
        if (t.dataset.calDel) {
          const c = calById(t.dataset.calDel), undo = makeUndo();
          S.calendars = S.calendars.filter(x => x.id !== c.id); S.events = S.events.filter(x => x.calendarId !== c.id);
          save(); render(); repaint(); toast(`„${c.name}“ gelöscht`, { action: 'Rückgängig', onAction: () => { doUndo(undo); repaint(); } });
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
const unesc = s => (s || '').replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
function tzToDate(y, mo, d, h, mi, tz) {
  try {
    const guess = Date.UTC(y, mo, d, h, mi);
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    const p = Object.fromEntries(f.formatToParts(new Date(guess)).map(x => [x.type, x.value]));
    return new Date(guess - (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - guess));
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
  if (o.BYDAY) { r.byday = []; for (const p of o.BYDAY.split(',')) { const mm = p.match(/^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/); if (!mm) continue; r.byday.push(map[mm[2]]); if (mm[1]) r.nth = +mm[1]; } }
  if (r.freq === 'MONTHLY' && o.BYSETPOS && r.byday?.length === 1) r.nth = +o.BYSETPOS;
  if (r.freq === 'MONTHLY' && r.byday?.length && !r.nth) { r.freq = 'WEEKLY'; r.interval = 1; }
  if (r.freq === 'DAILY' && r.byday?.length) r.freq = 'WEEKLY';
  return r;
}
function parseDuration(s) {
  const m = s.match(/P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?/);
  return m ? ((+m[1] || 0) * 10080 + (+m[2] || 0) * 1440 + (+m[3] || 0) * 60 + (+m[4] || 0)) * 60000 : 0;
}
function importICS(text, fileName = 'Import') {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  let calName = fileName.replace(/\.ics$/i, '').replace(/_/g, ' ');
  const vevents = []; let cur = null, depth = 0;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') { if (cur) vevents.push(cur); cur = null; continue; }
    if (cur && line.startsWith('BEGIN:')) { depth++; continue; }
    if (cur && line.startsWith('END:')) { depth--; continue; }
    if (depth > 0) continue;
    const idx = line.indexOf(':'); if (idx < 0) continue;
    const [name, ...ps] = line.slice(0, idx).split(';'), value = line.slice(idx + 1);
    const params = {}; ps.forEach(p => { const [k, v] = p.split('='); params[k.toUpperCase()] = (v || '').replace(/"/g, ''); });
    if (!cur) { if (name === 'X-WR-CALNAME' && value.trim()) calName = unesc(value); continue; }
    if (name === 'EXDATE') (cur.EXDATE ||= []).push(...value.split(',').map(v => ({ value: v, params })));
    else cur[name] = { value, params };
  }
  if (!vevents.length) { toast(`In „${fileName}“ wurden keine Termine gefunden.`); return 0; }
  if (calSkip(calName, '')) return 0; // ganzer Kalender laut Hinweis weglassen
  if (S.calendars.some(c => c.source === 'local' && c.name.toLowerCase() === calName.toLowerCase())) calName += /gmail|google/i.test(fileName) ? ' (Google)' : ' (Import)';
  let cal = S.calendars.find(c => c.source === 'ics' && c.name === calName);
  if (cal) S.events = S.events.filter(e => e.calendarId !== cal.id);
  else { cal = { id: uid(), name: calName, color: COLORS[(S.calendars.length + 5) % COLORS.length], visible: true, source: 'ics' }; S.calendars.push(cal); }
  const out = [], overrides = [];
  for (const v of vevents) {
    if (v.STATUS?.value === 'CANCELLED') continue;
    if (calSkip(calName, unesc(v.SUMMARY?.value))) continue;
    const s = icsDate(v.DTSTART); if (!s) continue;
    let e = icsDate(v.DTEND);
    if (!e) e = { local: v.DURATION ? toLocal(new Date(parseLocal(s.local).getTime() + parseDuration(v.DURATION.value))) : (s.allDay ? toLocal(addDays(parseLocal(s.local), 1)) : s.local) };
    if (s.allDay && e.local <= s.local) e.local = toLocal(addDays(parseLocal(s.local), 1));
    const ev = {
      id: uid(), uid: v.UID?.value || null, title: unesc(v.SUMMARY?.value) || '(Ohne Titel)', location: unesc(v.LOCATION?.value), notes: unesc(v.DESCRIPTION?.value),
      start: s.local, end: e.local, allDay: s.allDay, calendarId: cal.id, fixed: true, rrule: v.RRULE ? parseRRule(v.RRULE.value) : null,
      exdates: (v.EXDATE || []).map(x => icsDate(x)?.local.slice(0, 10)).filter(Boolean), source: 'ics',
    };
    if (v['RECURRENCE-ID']) { const rid = icsDate(v['RECURRENCE-ID']); if (rid) overrides.push({ uid: ev.uid, date: rid.local.slice(0, 10) }); }
    out.push(ev);
  }
  for (const o of overrides) { const m = out.find(x => x.uid === o.uid && x.rrule); if (m) m.exdates.push(o.date); }
  S.events.push(...out);
  return out.length;
}
function loadScript(src) {
  return new Promise((res, rej) => {
    if ([...document.scripts].some(s => s.src === src)) return res();
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Google-Skript konnte nicht geladen werden'));
    document.head.append(s);
  });
}
async function googleSync() {
  const cid = (S.settings.googleClientId || '').trim();
  if (!cid) { toast('Zuerst in den Einstellungen eine Google Client-ID eintragen – oder den ICS-Import nutzen.', { ms: 4500 }); return; }
  try {
    await loadScript('https://accounts.google.com/gsi/client');
    const token = await new Promise((res, rej) => {
      google.accounts.oauth2.initTokenClient({
        client_id: cid, scope: 'https://www.googleapis.com/auth/calendar.readonly',
        callback: r => r.error ? rej(new Error(r.error)) : res(r.access_token),
        error_callback: e => rej(new Error(e.message || e.type || 'Login abgebrochen')),
      }).requestAccessToken();
    });
    toast('Kopiere Termine …', { ms: 10000 });
    const api = async url => { const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } }); if (!r.ok) throw new Error('Google antwortet mit ' + r.status); return r.json(); };
    const list = await api('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250');
    const tMin = encodeURIComponent(addDays(new Date(), -180).toISOString()), tMax = encodeURIComponent(addDays(new Date(), 400).toISOString());
    let total = 0;
    for (const c of list.items || []) {
      if (calSkip(c.summaryOverride || c.summary, '')) continue; // laut Hinweis weglassen
      let cal = S.calendars.find(x => x.gid === c.id);
      if (!cal) { cal = { id: uid(), gid: c.id, name: c.summaryOverride || c.summary, color: c.backgroundColor || COLORS[S.calendars.length % COLORS.length], visible: c.selected !== false, source: 'google' }; S.calendars.push(cal); }
      const fresh = []; let pt = '';
      do {
        const d = await api(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(c.id)}/events?singleEvents=true&orderBy=startTime&maxResults=2500&timeMin=${tMin}&timeMax=${tMax}${pt ? '&pageToken=' + pt : ''}`);
        for (const it of d.items || []) {
          if (it.status === 'cancelled' || !it.start || calSkip(cal.name, it.summary)) continue;
          const allDay = !!it.start.date;
          fresh.push({ id: uid(), gid: it.id, title: it.summary || '(Ohne Titel)', location: it.location || '', notes: it.description || '',
            start: allDay ? it.start.date + 'T00:00' : toLocal(new Date(it.start.dateTime)), end: allDay ? it.end.date + 'T00:00' : toLocal(new Date(it.end.dateTime)),
            allDay, calendarId: cal.id, fixed: true, rrule: null, exdates: [], source: 'google' });
        }
        pt = d.nextPageToken || '';
      } while (pt);
      S.events = S.events.filter(e => e.calendarId !== cal.id).concat(fresh);
      total += fresh.length;
    }
    save(); render(); toast(`${total} Termine aus Google kopiert ✓`);
  } catch (e) { console.error(e); toast('Google: ' + e.message, { ms: 5000 }); }
}

// =====================================================================
//  Stundenplan, Fächerfarben und Änderungen für einzelne Tage
// =====================================================================
function openTimetable() {
  const days = [1, 2, 3, 4, 5, 6];
  const ab = S.settings.abWeeks;
  const row = l => `<div class="cell tt-cell">
      <div class="tt-row"><input type="text" placeholder="Fach" value="${esc(l.subject)}" data-tt="${l.id}" data-f="subject" list="tt-subjects">
        <input type="time" value="${l.start}" data-tt="${l.id}" data-f="start"><input type="time" value="${l.end}" data-tt="${l.id}" data-f="end">
        <button class="del" data-tt-del="${l.id}" aria-label="Stunde löschen">⊖</button></div>
      <div class="tt-row2"><input type="text" placeholder="Raum" value="${esc(l.room)}" data-tt="${l.id}" data-f="room"><input type="text" placeholder="Lehrkraft" value="${esc(l.teacher)}" data-tt="${l.id}" data-f="teacher">
        ${ab ? `<select data-tt="${l.id}" data-f="week">${opts([['all', 'jede Woche'], ['A', 'nur A'], ['B', 'nur B']], l.week)}</select>` : ''}</div></div>`;
  const paint = () => `<datalist id="tt-subjects">${subjects().map(s => `<option value="${esc(s)}">`).join('')}</datalist>` + days.map(wd => {
    const ls = S.timetable.filter(l => +l.wd === wd).sort((a, b) => toMin(a.start) - toMin(b.start));
    if (wd === 6 && !ls.length) return `<div class="tt-day">Samstag</div><div class="group"><button class="cell action" data-tt-add="6">+ Stunde</button></div>`;
    return `<div class="tt-day">${WD_LONG[wd]}</div><div class="group">${ls.map(row).join('')}
      <div class="cell tt-btns"><button class="link" data-tt-add="${wd}">+ Stunde</button>${wd > 1 ? `<button class="link" data-tt-copy="${wd}">wie ${WD[wd - 1]}</button>` : ''}</div></div>`;
  }).join('') + (subjects().length ? `<div class="group-title">Fächerfarben</div><div class="group subj-colors">${subjects().map(s => `<button class="cell" data-subj="${esc(s)}"><span class="swatch" style="background:${subjectColor(s)}"></span><span class="grow">${esc(withEmoji(s))}</span><span class="val">Farbe ändern</span></button>`).join('')}</div>
    <p class="help">Aufgaben, in denen ein Fach vorkommt (z. B. „Mathe HÜ“), bekommen automatisch diese Farbe.</p>` : '') +
    `<div class="group-title">Stundenzeiten deiner Schule</div><div class="group"><div class="cell"><textarea data-lt rows="4">${esc(S.settings.lessonTimes.join('\n'))}</textarea></div></div>
    <p class="help">Eine Zeile pro Stunde (z. B. <i>07:50-08:40</i>). „+ Stunde“ nimmt automatisch die nächste Zeit. A/B-Wochen schaltest du in den Einstellungen ein. Entfall und Vertretung trägst du direkt im Kalender ein: auf die Schule tippen.</p>`;
  const untisCard = () => {
    const U = S.untis;
    if (U?.secret) return `<div class="card import-card"><div class="ic-top"><span class="ic-ico">📲</span><div><b>Mit WebUntis verbunden</b>
        <div class="cell-sub">${esc(U.schoolName || U.school)} · ${esc(U.displayName || U.user)} · aktualisiert ${untisAgo()}</div></div></div>
        ${U.error ? `<p class="err-t">⚠️ ${esc(U.error)}</p>` : ''}
        <textarea data-untis-note rows="2" placeholder="Hinweis (optional): z. B. „Religion habe ich nicht“">${esc(U.note || '')}</textarea>
        <div class="hint-actions"><button class="btn primary" data-untis-sync>Aktualisieren</button><button class="btn secondary" data-untis-open>Fächer & Verbindung</button></div></div>`;
    return `<div class="card import-card"><div class="ic-top"><span class="ic-ico">📸</span><div><b>Per Screenshot übernehmen</b>
        <div class="cell-sub">Screenshot der Wochenansicht aus Untis hochladen – die KI liest deinen Stundenplan aus.</div></div></div>
        <textarea data-untis-note rows="2" placeholder="Hinweis (optional): z. B. „Religion habe ich nicht, Latein statt Französisch“"></textarea>
        <button class="btn primary" data-scan-open>Screenshot hochladen</button>
        <button class="link" data-untis-open>oder direkt mit WebUntis verbinden (Test)</button></div>`;
  };
  openSheet({
    title: 'Stundenplan', left: '', right: 'Fertig',
    body: `<div class="tt-import">${untisCard()}</div><details class="tt-manual" ${S.timetable.length && !S.untis ? 'open' : ''}><summary>✏️ Selbst eintragen oder bearbeiten</summary><div class="tt-man">${paint()}</div></details>`,
    onOpen(sh, close) {
      const body = sh.querySelector('.tt-man'), all = sh.querySelector('.sheet-body');
      all.addEventListener('click', async e => {
        const t = e.target.closest('button'); if (!t) return;
        const note = all.querySelector('[data-untis-note]')?.value || '';
        if (t.dataset.untisOpen !== undefined) { close(); openUntisConnect(note); }
        if (t.dataset.scanOpen !== undefined) { close(); openTimetableScan(note); }
        if (t.dataset.untisSync !== undefined) {
          t.disabled = true; t.textContent = 'Lade …';
          if (note !== (S.untis.note || '')) {
            S.untis.note = note;
            const names = [...new Set(buildPattern(S.untis.days || {}).map(l => l.subject))];
            const r = await interpretNote('Schulfächer im Stundenplan', note, names);
            S.untis.rules = { ...(S.untis.rules || {}), exclude: r.exclude, replace: r.replace, only: r.only };
          }
          if (await untisSync()) { applyUntisToTimetable(); save(); render(); }
          sh.querySelector('.tt-import').innerHTML = untisCard(); body.innerHTML = paint();
        }
      });
      body.addEventListener('change', e => {
        const t = e.target;
        if (t.dataset.tt) { const l = S.timetable.find(x => x.id === t.dataset.tt); if (l) { l[t.dataset.f] = t.value; save(); render(); } }
        if (t.dataset.lt !== undefined) { S.settings.lessonTimes = t.value.split('\n').map(s => s.trim()).filter(s => /^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/.test(s)); save(); }
      });
      body.addEventListener('click', e => {
        const t = e.target.closest('button'); if (!t) return;
        if (t.dataset.ttAdd) {
          const wd = +t.dataset.ttAdd, ls = S.timetable.filter(l => +l.wd === wd).sort((a, b) => toMin(a.start) - toMin(b.start));
          const lastEnd = ls.length ? toMin(ls.at(-1).end) : -1;
          const slot = S.settings.lessonTimes.map(s => s.split('-').map(x => x.trim())).find(([a]) => toMin(a) >= lastEnd);
          const [start, end] = slot || [hm(Math.max(lastEnd, 480) + 5), hm(Math.max(lastEnd, 480) + 55)];
          S.timetable.push({ id: uid(), wd, subject: '', room: '', teacher: '', week: 'all', start: start.padStart(5, '0'), end: end.padStart(5, '0') });
          save(); render(); body.innerHTML = paint();
          $$('[data-f=subject]', body).filter(i => !i.value).at(-1)?.focus();
        }
        if (t.dataset.ttDel) { S.timetable = S.timetable.filter(l => l.id !== t.dataset.ttDel); save(); render(); body.innerHTML = paint(); }
        if (t.dataset.ttCopy) {
          const wd = +t.dataset.ttCopy;
          S.timetable = S.timetable.filter(l => +l.wd !== wd).concat(S.timetable.filter(l => +l.wd === wd - 1).map(l => ({ ...l, id: uid(), wd })));
          save(); render(); body.innerHTML = paint();
        }
        if (t.dataset.subj) { const s = t.dataset.subj; S.subjectColors[s] = COLORS[(COLORS.indexOf(subjectColor(s)) + 1) % COLORS.length]; save(); render(); body.innerHTML = paint(); }
      });
    },
  });
}
function openLessonDay(date) {
  const paint = () => {
    const ls = lessonsOn(date, true);
    if (!ls.length) return `<div class="empty">An diesem Tag steht nichts im Stundenplan.</div><div class="group"><button class="cell action" data-open-tt>Stundenplan bearbeiten</button></div>`;
    return `<p class="help">Änderungen gelten nur für <b>${esc(dueLabel(date))}</b>. Fällt eine Stunde aus, plant ${APP_NAME} deinen Nachmittag automatisch neu.</p>
      <div class="group">${ls.map(l => `<div class="cell tt-cell ${l.cancelled ? 'is-cancelled' : ''}">
        <div class="ld-top"><span class="ld-time">${l.start}–${l.end}</span><span class="grow"><b>${esc(withEmoji(l.origSubject || l.subject))}</b>${l.substituted ? ` → ${esc(l.subject)}` : ''}<div class="cell-sub">${esc([l.room, l.teacher].filter(Boolean).join(' · ') || ' ')}</div></span>
          <span class="ld-lbl">Entfällt</span><label class="switch"><input type="checkbox" data-cancel="${l.id}" ${l.cancelled ? 'checked' : ''}><span></span></label></div>
        <div class="tt-row2"><input type="text" placeholder="Vertretung: Fach" value="${l.substituted ? esc(l.subject) : ''}" data-subst="${l.id}"><input type="text" placeholder="Raum" value="${esc(S.ttOverrides[date]?.[l.id]?.room || '')}" data-sroom="${l.id}"></div></div>`).join('')}</div>
      <div class="group"><button class="cell action" data-open-tt>Ganzen Stundenplan bearbeiten</button></div>`;
  };
  openSheet({
    title: `Schule · ${dueLabel(date)}`, left: '', right: 'Fertig', body: paint(),
    onOpen(sh) {
      const body = sh.querySelector('.sheet-body');
      body.addEventListener('change', e => {
        const t = e.target, ov = (S.ttOverrides[date] ||= {});
        if (t.dataset.cancel) { if (t.checked) ov[t.dataset.cancel] = { ...(ov[t.dataset.cancel] || {}), cancel: true }; else if (ov[t.dataset.cancel]) delete ov[t.dataset.cancel].cancel; }
        if (t.dataset.subst) { const o = (ov[t.dataset.subst] ||= {}); if (t.value.trim()) o.subject = t.value.trim(); else delete o.subject; }
        if (t.dataset.sroom) { const o = (ov[t.dataset.sroom] ||= {}); if (t.value.trim()) o.room = t.value.trim(); else delete o.room; }
        for (const [k, o] of Object.entries(ov)) if (!Object.keys(o).length) delete ov[k];
        save(); render(); body.innerHTML = paint();
      });
      body.addEventListener('click', e => { if (e.target.closest('[data-open-tt]')) openTimetable(); });
    },
  });
}

// =====================================================================
//  Routinen
// =====================================================================
const ROUTINE_PRESETS = [['Heimfahrt', 30, 'after_school', null, 'school'], ['Mittagessen', 30, 'chain', null, 'school'], ['Abendessen', 30, 'at', '18:30', 'daily'], ['Duschen', 15, 'at', '21:00', 'daily'], ['Lesen', 20, 'at', '21:30', 'daily']];
function openRoutines() {
  const paint = () => `<p class="help">Routinen kommen automatisch in deinen Tagesplan – du musst sie nicht jeden Tag neu eintragen. Im Plan kannst du sie für einen Tag mit × auslassen.</p>
    <div class="group">${S.routines.map(r => `<div class="cell tt-cell">
      <div class="tt-row rt-row"><span class="em">${emojiFor(r.title, '🔁')}</span><input type="text" value="${esc(r.title)}" data-rt="${r.id}" data-f="title">
        <select data-rt="${r.id}" data-f="minutes">${opts([5, 10, 15, 20, 30, 45, 60, 90].map(m => [m, durLabel(m)]), r.minutes)}</select>
        <button class="del" data-rt-del="${r.id}" aria-label="Routine löschen">⊖</button></div>
      <div class="tt-row2"><select data-rt="${r.id}" data-f="anchor">${opts([['after_school', 'nach der Schule'], ['chain', 'nach dem Vorigen'], ['at', 'um Uhrzeit']], r.anchor)}</select>
        ${r.anchor === 'at' ? `<input type="time" value="${r.at || '18:00'}" data-rt="${r.id}" data-f="at">` : ''}
        <select data-rt="${r.id}" data-f="days">${opts(Object.entries(ROUTINE_DAYS), r.days)}</select></div></div>`).join('') || '<div class="empty small">Noch keine Routinen</div>'}</div>
    <div class="group-title">Vorschläge</div>
    <div class="quick">${ROUTINE_PRESETS.filter(p => !S.routines.some(r => r.title === p[0])).map(p => `<button data-rt-add="${p[0]}">${emojiFor(p[0])} ${p[0]}</button>`).join('')}<button data-rt-add="">+ Eigene</button></div>`;
  openSheet({
    title: 'Routinen', left: '', right: 'Fertig', body: paint(),
    onOpen(sh) {
      const body = sh.querySelector('.sheet-body');
      body.addEventListener('change', e => {
        const t = e.target, r = S.routines.find(x => x.id === t.dataset.rt); if (!r) return;
        r[t.dataset.f] = t.dataset.f === 'minutes' ? +t.value : t.value;
        if (t.dataset.f === 'anchor' && t.value === 'at' && !r.at) r.at = '18:00';
        save(); render(); if (t.dataset.f === 'anchor') body.innerHTML = paint();
      });
      body.addEventListener('click', e => {
        const t = e.target.closest('button'); if (!t) return;
        if (t.dataset.rtDel) { S.routines = S.routines.filter(r => r.id !== t.dataset.rtDel); save(); render(); body.innerHTML = paint(); }
        if (t.dataset.rtAdd !== undefined) {
          const p = ROUTINE_PRESETS.find(x => x[0] === t.dataset.rtAdd);
          let title = p?.[0];
          if (!p) { title = prompt('Wie heißt die Routine? (z. B. Gassi gehen)'); if (!title) return; }
          S.routines.push({ id: uid(), title, minutes: p?.[1] || 30, anchor: p?.[2] || 'chain', at: p?.[3] || null, days: p?.[4] || 'daily', order: S.routines.length });
          save(); render(); body.innerHTML = paint();
        }
      });
    },
  });
}

// =====================================================================
//  Anpassen (zu spät / früher fertig / mehr Zeit)
// =====================================================================
function openAdjust() {
  const date = ui.plan.date, plan = computePlan(date), nowM = minOf(new Date()), isToday = date === todayStr();
  const cur = isToday ? plan.items.find(i => i.s <= nowM && i.e > nowM && i.kind !== 'fixed' && i.kind !== 'reward') : null;
  const btn = (k, e, t, s = '') => `<button class="cell" data-adj="${k}"><span class="em big">${e}</span><span class="grow">${t}${s ? `<div class="cell-sub">${s}</div>` : ''}</span><span class="chev">›</span></button>`;
  const { close } = openSheet({
    title: 'Plan anpassen', left: '', right: 'Fertig',
    body: `<div class="group">
      ${isToday ? btn('late', '⏰', 'Ich hänge hinterher', 'Alles Offene rutscht ab jetzt nach hinten') : ''}
      ${isToday ? btn('early', '🏁', 'Ich bin früher fertig', 'Der Rest rückt ab jetzt nach vorne') : ''}
      ${cur ? btn('plus', '➕', `+15 min für „${esc(cur.title)}“`, 'Nachfolgendes verschiebt sich') : ''}
      ${btn('tired', '😴', 'Ich bin müde', 'Leichtes zuerst, mehr Pausen, weniger Programm')}
      ${btn('fit', '⚡', 'Ich bin voll fit', 'Schweres zuerst')}</div>
      <div class="group">${btn('routines', '🔁', 'Routinen bearbeiten', 'Heimfahrt, Essen & Co. automatisch')}${btn('reset', '🧹', 'Tag zurücksetzen', 'Chat-Einträge und KI-Reihenfolge entfernen')}</div>`,
    onOpen(sh, close) {
      sh.querySelector('.sheet-body').addEventListener('click', e => {
        const k = e.target.closest('[data-adj]')?.dataset.adj; if (!k) return;
        const p = getPlan(date), undo = makeUndo();
        if (k === 'late' || k === 'early') { p.anchor = nowAnchor(); toast(k === 'late' ? 'Okay – alles Offene ist ab jetzt neu geplant.' : 'Super! Der Rest ist nach vorne gerückt.'); }
        if (k === 'plus' && cur) {
          if (cur.kind === 'task') p.aiDur[cur.key] = (cur.e - cur.s) + 15;
          else applyAction({ type: 'set_duration', title: cur.title, minutes: (cur.e - cur.s) + 15, date }, date);
          toast(`+15 min für „${cur.title}“`, { action: 'Rückgängig', onAction: () => doUndo(undo) });
        }
        if (k === 'tired' || k === 'fit') p.energy = k === 'tired' ? 'müde' : 'fit';
        if (k === 'routines') { close(); openRoutines(); return; }
        if (k === 'reset') { Object.assign(p, { extras: [], aiOrder: null, aiDur: {}, skipRoutines: [], anchor: null }); toast('Tag zurückgesetzt', { action: 'Rückgängig', onAction: () => doUndo(undo) }); }
        save(); render(); close();
      });
    },
  });
}

// =====================================================================
//  Fokus-Modus (Pomodoro)
// =====================================================================
const focusElapsed = f => Math.max(0, (f.pausedAt || Date.now()) - f.startedAt - (f.pausedMs || 0));
function startFocus(u) {
  if (S.focus && S.focus.key !== u.key && !confirm(`Es läuft schon „${S.focus.title}“. Stattdessen „${u.title}“ starten?`)) return;
  S.focus = { key: u.key, remId: u.id, subId: u.sub || null, title: u.title, plannedMin: u.dur || 30, startedAt: Date.now(), pausedAt: null, pausedMs: 0, date: todayStr() };
  if (ui.plan.date === todayStr()) { const p = getPlan(todayStr()); if (p.anchor > minOf(new Date())) p.anchor = nowAnchor(); }
  save(); render.keepScroll = true; render(); openFocus();
}
let focusTimer = null, focusPhase = null;
function focusState() {
  const f = S.focus, st = S.settings, el = focusElapsed(f) / 1000;
  const total = f.plannedMin * 60, left = total - el;
  let phase = 'work', round = 1, phaseLeft = left;
  if (st.pomodoro) {
    const w = (+st.focusMin || 25) * 60, b = (+st.focusBreak || 5) * 60, cyc = w + b;
    round = Math.floor(el / cyc) + 1; const pos = el % cyc;
    if (pos >= w && left > 0) { phase = 'break'; phaseLeft = cyc - pos; } else phaseLeft = Math.min(w - pos, left);
  }
  return { el, total, left, phase, round, phaseLeft, progress: clamp(el / total, 0, 1) };
}
const mmss = s => { const a = Math.abs(Math.round(s)); return `${s < 0 ? '+' : ''}${pad(Math.floor(a / 60))}:${pad(a % 60)}`; };
function openFocus() {
  if (!S.focus) return;
  $('#focus')?.remove();
  const f = S.focus, ov = document.createElement('div');
  ov.id = 'focus'; ov.className = 'focus-ov';
  const C = 2 * Math.PI * 108;
  ov.innerHTML = `<button class="focus-min" data-f="min" aria-label="Verkleinern">${I.down}</button>
    <div class="focus-emoji">${emojiFor(f.title, '🎯')}</div><div class="focus-title">${esc(f.title)}</div><div class="focus-phase"></div>
    <div class="ring"><svg viewBox="0 0 240 240"><circle cx="120" cy="120" r="108" class="ring-bg"/><circle cx="120" cy="120" r="108" class="ring-fg" stroke-dasharray="${C}" stroke-dashoffset="${C}"/></svg><div class="focus-time">--:--</div><div class="focus-sub"></div></div>
    <div class="focus-btns"><button data-f="pause">${I.pause}<span>Pause</span></button><button data-f="plus">＋10<span>länger</span></button></div>
    <button class="btn primary focus-done" data-f="done">${I.check} Fertig!</button><button class="link focus-cancel" data-f="cancel">Abbrechen</button>`;
  document.body.append(ov);
  requestAnimationFrame(() => ov.classList.add('show'));
  ov.addEventListener('click', e => {
    const k = e.target.closest('[data-f]')?.dataset.f; if (!k) return;
    const f = S.focus; if (!f) return closeFocus();
    if (k === 'min') return closeFocus();
    if (k === 'pause') { if (f.pausedAt) { f.pausedMs += Date.now() - f.pausedAt; f.pausedAt = null; } else f.pausedAt = Date.now(); save(); tick(); }
    if (k === 'plus') { f.plannedMin += 10; save(); render.keepScroll = true; render(); toast('+10 min – der Rest deines Plans rutscht nach hinten'); tick(); }
    if (k === 'cancel') { if (!confirm('Fokus beenden, ohne abzuhaken?')) return; S.focus = null; save(); closeFocus(); render.keepScroll = true; render(); }
    if (k === 'done') finishFocus(e.clientX, e.clientY);
  });
  const tick = () => {
    if (!S.focus || !document.body.contains(ov)) return;
    const s = focusState(), f = S.focus;
    if (focusPhase && focusPhase !== s.phase) { beep(); toast(s.phase === 'break' ? '☕ Kurze Pause! Steh auf, trink was.' : '🎯 Weiter geht’s!'); }
    focusPhase = s.phase;
    ov.classList.toggle('is-break', s.phase === 'break'); ov.classList.toggle('is-paused', !!f.pausedAt);
    $('.focus-time', ov).textContent = s.left < 0 ? mmss(s.left) : mmss(s.phaseLeft);
    $('.focus-sub', ov).textContent = s.left < 0 ? 'länger als geplant – Plan wächst mit' : `noch ${mmss(s.left)} insgesamt`;
    $('.focus-phase', ov).textContent = f.pausedAt ? '⏸ pausiert' : s.phase === 'break' ? `☕ Pause · Runde ${s.round}` : S.settings.pomodoro ? `🎯 Konzentrieren · Runde ${s.round}` : '🎯 Konzentrieren';
    $('.ring-fg', ov).style.strokeDashoffset = C * (1 - s.progress);
    $('[data-f=pause]', ov).innerHTML = f.pausedAt ? `${I.play}<span>Weiter</span>` : `${I.pause}<span>Pause</span>`;
  };
  clearInterval(focusTimer); focusTimer = setInterval(tick, 1000); tick();
}
function closeFocus() { const ov = $('#focus'); if (ov) { ov.classList.remove('show'); setTimeout(() => { ov.remove(); updateFocusPill(); }, 250); } else updateFocusPill(); }
function finishFocus(x, y) {
  const f = S.focus; if (!f) return;
  const r = S.reminders.find(z => z.id === f.remId), mins = Math.max(1, Math.round(focusElapsed(f) / 60000));
  S.focus = null;
  if (r) { const res = completeReminder(r, f.subId); if (res !== 'undone' && S.doneLog.length) S.doneLog.at(-1).minutes = mins; }
  save(); closeFocus(); confetti(x || innerWidth / 2, y || innerHeight / 2); render.keepScroll = true; render();
  toast(`Super! 🎉 ${durLabel(mins)} konzentriert gearbeitet`);
}
function updateFocusPill() {
  let pill = $('#focus-pill');
  if (!S.focus || $('#focus')) { pill?.remove(); return; }
  if (!pill) { pill = document.createElement('button'); pill.id = 'focus-pill'; pill.dataset.act = 'openFocus'; document.body.append(pill); }
  const s = focusState();
  pill.innerHTML = `<span class="dot ${s.phase === 'break' ? 'brk' : ''}"></span>${s.left < 0 ? mmss(s.left) : mmss(s.phaseLeft)} · ${esc(S.focus.title)}`;
}
setInterval(() => { if (S.focus && !$('#focus')) updateFocusPill(); }, 1000);

// =====================================================================
//  Wochenrückblick
// =====================================================================
function openWeekReview() {
  const ws = startOfWeekMon(new Date());
  S.settings.lastReview = ymd(ws); saveQuiet();
  const days = [...Array(7)].map((_, i) => ymd(addDays(ws, i)));
  const log = S.doneLog.filter(x => days.includes(x.date));
  const prev = S.doneLog.filter(x => x.date >= ymd(addDays(ws, -7)) && x.date < days[0]);
  const mins = log.reduce((a, x) => a + x.minutes, 0), pmins = prev.reduce((a, x) => a + x.minutes, 0);
  const perDay = days.map(k => log.filter(x => x.date === k).length), maxD = Math.max(1, ...perDay);
  const subj = {}; log.forEach(x => { const s = x.subject || 'Sonstiges'; subj[s] = (subj[s] || 0) + x.minutes; });
  const subjList = Object.entries(subj).sort((a, b) => b[1] - a[1]), maxS = Math.max(1, ...subjList.map(x => x[1]));
  const postponed = S.reminders.filter(r => !r.done && ((r.postponed || 0) >= 2 || (r.due && daysBetween(r.due, todayStr()) >= 2)));
  const tip = postponed.length ? `„${postponed[0].title}“ schiebst du schon länger vor dir her. Plan es gleich als Erstes nach der Schule ein – dann ist es weg.`
    : !log.length ? 'Diese Woche ist noch nichts abgehakt. Fang mit einer kleinen Sache an – der Rest kommt von selbst.'
      : mins < pmins ? 'Etwas weniger als letzte Woche – völlig okay. Plan dir für nächste Woche feste Lernzeiten mit dem Fokus-Timer.'
        : 'Starke Woche! Du warst fleißiger als letzte Woche. Gönn dir am Wochenende bewusst Freizeit. 🎉';
  const subjBars = subjList.length ? subjList.map(([s, m]) => `<div class="hbar"><span class="hb-l">${esc(withEmoji(s))}</span><span class="hb-t"><i style="width:${m / maxS * 100}%;background:${subjectColor(s) || ACCENT}"></i></span><span class="hb-v">${durLabel(m)}</span></div>`).join('') : '<div class="empty small">Noch keine Daten</div>';
  openSheet({
    title: 'Wochenrückblick', left: '', right: 'Fertig',
    body: `<div class="stats">
        <div class="stat"><b>${log.length}</b><span>erledigt</span></div>
        <div class="stat"><b>${durLabel(mins)}</b><span>gearbeitet</span></div>
        <div class="stat"><b>🔥 ${streak()}</b><span>Tage Serie</span></div></div>
      <div class="group-title">Pro Tag</div>
      <div class="group pad"><div class="vbars">${days.map((k, i) => `<div class="vb ${k === todayStr() ? 'today' : ''}"><span class="vb-n">${perDay[i] || ''}</span><i style="height:${perDay[i] / maxD * 100}%"></i><span class="vb-l">${WD[parseYmd(k).getDay()]}</span></div>`).join('')}</div></div>
      <div class="group-title">Nach Fach</div><div class="group pad">${subjBars}</div>
      ${postponed.length ? `<div class="group-title">Wird oft verschoben</div><div class="group">${postponed.slice(0, 5).map(r => `<div class="cell"><span class="grow">${esc(withEmoji(r.title))}<div class="cell-sub">${r.postponed ? r.postponed + '× verschoben' : 'überfällig seit ' + dueLabel(r.due)}</div></span></div>`).join('')}</div>` : ''}
      <div class="card tip-card">💡 ${esc(tip)}</div>
      ${aiReady() ? '<div class="group"><button class="cell action" data-x="aitip">✨ Persönlichen Tipp von der KI holen</button></div>' : ''}
      <p class="help center">Letzte Woche: ${prev.length} erledigt · ${durLabel(pmins)}</p>`,
    onOpen(sh, close) {
      sh.querySelector('[data-x=aitip]')?.addEventListener('click', () => {
        close(); openAssistant();
        asSend(`Gib mir einen kurzen, motivierenden Tipp für nächste Woche. Mein Rückblick: ${log.length} Aufgaben erledigt, ${mins} Minuten gearbeitet (letzte Woche ${pmins}), nach Fach: ${subjList.map(([s, m]) => s + ' ' + m + ' min').join(', ') || 'keine'}, oft verschoben: ${postponed.map(r => r.title).join(', ') || 'nichts'}.`);
      });
    },
  });
}

// =====================================================================
//  Einführung beim ersten Start
// =====================================================================
function openOnboarding() {
  let step = 0;
  const picks = new Set(['Heimfahrt', 'Mittagessen']);
  const draft = { name: S.settings.userName, city: S.settings.weatherCity, key: S.settings.apiKey };
  const steps = [
    () => `<div class="ob-hero ob-logo"><img src="icons/icon-192.png" alt=""></div><h2>Willkommen bei ${APP_NAME}</h2><p>Kalender, Erinnerungen und ein Tagesplan, der sich selbst um deine Schule herum plant – alles in einer App.</p>
      <div class="group"><div class="cell"><input type="text" data-ob="name" placeholder="Wie heißt du? (für die Begrüßung)" value="${esc(draft.name)}"></div></div>`,
    () => `<div class="ob-hero">🏫</div><h2>Dein Stundenplan</h2><p>Mach in Untis einen Screenshot deiner Wochenansicht – die KI liest den Stundenplan daraus aus. ${APP_NAME} plant Hausübungen und Lernen dann in die freien Zeiten.</p>
      <div class="ob-actions"><button class="btn primary" data-ob-act="scan">📸 Screenshot hochladen</button><button class="btn secondary" data-ob-act="tt">Selbst eintragen</button></div>
      <p class="help center">${S.untis?.secret ? '✅ Mit WebUntis verbunden' : S.timetable.length ? `${S.timetable.length} Stunden eingetragen` : 'Geht auch später unter Einstellungen.'}</p>`,
    () => `<div class="ob-hero">📅</div><h2>Google-Kalender holen</h2><p>Kopier deine Termine einmal aus Google. Training, Bandprobe & Co. bleiben dann im Tagesplan fix.</p>
      <div class="ob-actions"><button class="btn primary" data-ob-act="cal">📅 Aus Google übernehmen</button></div>
      <p class="help center">${S.events.length ? `${S.events.length} Termine übernommen ✓` : 'Geht auch später im Kalender oben links.'}</p>`,
    () => `<div class="ob-hero">🔁</div><h2>Was machst du jeden Tag?</h2><p>Diese Routinen plane ich automatisch ein:</p>
      <div class="group">${ROUTINE_PRESETS.slice(0, 4).map(p => `<label class="cell"><span class="em big">${emojiFor(p[0])}</span><span class="grow">${p[0]}<div class="cell-sub">${p[1]} min · ${p[2] === 'after_school' ? 'nach der Schule' : p[2] === 'at' ? 'um ' + p[3] : 'danach'}</div></span><label class="switch"><input type="checkbox" data-ob-rt="${p[0]}" ${picks.has(p[0]) ? 'checked' : ''}><span></span></label></label>`).join('')}</div>
      <div class="group"><div class="cell"><span class="em big">🌤️</span><input type="text" data-ob="city" placeholder="Dein Ort fürs Wetter (z. B. Wien)" value="${esc(draft.city)}"></div></div>`,
    () => `<div class="ob-hero">✨</div><h2>Dein Assistent</h2><p>Unten rechts sitzt dein Assistent. Tipp drauf und <b>sprich oder schreib</b>, z. B. <i>„HÜ Mathe bis Freitag“</i> oder <i>„Zahnarzt morgen um 15 Uhr“</i>. Er trägt es ein und zeigt dir live, wo.</p>
      <p>Er funktioniert sofort. Mit einem Claude-API-Schlüssel wird er richtig schlau (optional):</p>
      <div class="group"><div class="cell"><input type="password" data-ob="key" placeholder="sk-ant-… (optional)" value="${esc(draft.key)}" autocomplete="off"></div></div>`,
  ];
  const { el, close } = openSheet({ title: '', left: '', right: '', cls: 'onboarding', body: '<div id="ob"></div>' });
  const box = $('#ob', el);
  const paint = () => {
    box.innerHTML = steps[step]() + `<div class="ob-dots">${steps.map((_, i) => `<i class="${i === step ? 'on' : ''}"></i>`).join('')}</div>
      <div class="ob-nav">${step ? '<button class="btn secondary" data-ob-act="back">Zurück</button>' : '<button class="btn secondary" data-ob-act="skip">Überspringen</button>'}
      <button class="btn primary" data-ob-act="next">${step === steps.length - 1 ? 'Los geht’s 🚀' : 'Weiter'}</button></div>`;
  };
  const finish = () => {
    S.settings.userName = draft.name.trim(); S.settings.weatherCity = draft.city.trim(); S.settings.apiKey = draft.key.trim();
    for (const p of ROUTINE_PRESETS) if (picks.has(p[0]) && !S.routines.some(r => r.title === p[0])) S.routines.push({ id: uid(), title: p[0], minutes: p[1], anchor: p[2], at: p[3], days: p[4], order: S.routines.length });
    S.settings.onboarded = true; save(); close(); ui.tab = 'plan'; render(); refreshWeather(true);
    setTimeout(showAiHint, 700);
  };
  box.addEventListener('input', e => { const k = e.target.dataset.ob; if (k) draft[k] = e.target.value; });
  box.addEventListener('change', e => { const k = e.target.dataset.obRt; if (k) e.target.checked ? picks.add(k) : picks.delete(k); });
  box.addEventListener('click', e => {
    const a = e.target.closest('[data-ob-act]')?.dataset.obAct; if (!a) return;
    if (a === 'next') { if (step === steps.length - 1) return finish(); step++; paint(); }
    if (a === 'back') { step--; paint(); }
    if (a === 'skip') finish();
    if (a === 'tt') { openTimetable(); }
    if (a === 'untis') { openUntisConnect(); }
    if (a === 'scan') { openTimetableScan(); }
    if (a === 'cal') { openCalendars(); }
  });
  paint();
}

// =====================================================================
//  Einstellungen
// =====================================================================
function openSettings() {
  const st = S.settings;
  const inp = (label, key, type = 'text', extra = '') => `<div class="cell"><span class="grow">${label}</span><input type="${type}" class="right" data-set="${key}" value="${esc(st[key])}" ${extra}></div>`;
  const sel = (label, key, list) => `<div class="cell"><span class="grow">${label}</span><select class="right" data-set="${key}">${opts(list, st[key])}</select></div>`;
  const tog = (label, key, sub = '') => `<div class="cell"><span class="grow">${label}${sub ? `<div class="cell-sub">${sub}</div>` : ''}</span><label class="switch"><input type="checkbox" data-set="${key}" ${st[key] ? 'checked' : ''}><span></span></label></div>`;
  const link = (label, k, val = '') => `<button class="cell" data-open="${k}"><span class="grow">${label}</span>${val ? `<span class="val">${val}</span>` : ''}<span class="chev">›</span></button>`;
  const body = `
    <div class="group-title">Du</div><div class="group">
      ${inp('Name', 'userName', 'text', 'placeholder="für die Begrüßung"')}${inp('Ort fürs Wetter', 'weatherCity', 'text', 'placeholder="z. B. Wien"')}</div>
    <div class="group-title">Tagesplan</div><div class="group">
      ${inp('Tag beginnt', 'dayStart', 'time')}${inp('Tag endet', 'dayEnd', 'time')}
      ${sel('Pause nach Aufgabe', 'breakMin', [0, 5, 10, 15, 20].map(m => [m, m + ' min']))}
      ${sel('Standarddauer Aufgabe', 'defaultTaskMin', [15, 20, 30, 45, 60].map(m => [m, m + ' min']))}
      ${inp('Tagesabschluss ab', 'eveningReview', 'time')}
      ${link('Routinen', 'routines', S.routines.length + '')}${link('Stundenplan', 'timetable', S.timetable.length + ' Stunden')}
      ${link('📲 WebUntis', 'untis', S.untis?.secret ? 'verbunden · ' + untisAgo() : 'nicht verbunden')}</div>
    <div class="group-title">Belohnungen & Fokus</div><div class="group">
      ${tog('Belohnungen einplanen', 'rewards', 'Nach längerem Lernen kommt automatisch Freizeit')}
      ${sel('… nach', 'rewardAfterMin', [45, 60, 90, 120].map(m => [m, durLabel(m) + ' Arbeit']))}
      ${sel('Belohnung dauert', 'rewardMin', [10, 15, 20, 30, 45].map(m => [m, m + ' min']))}
      ${inp('Belohnung heißt', 'rewardTitle')}
      ${tog('Pomodoro im Fokus-Modus', 'pomodoro', 'Arbeiten und kurze Pausen im Wechsel')}
      ${sel('Fokuszeit', 'focusMin', [15, 20, 25, 30, 45, 50].map(m => [m, m + ' min']))}${sel('Kurze Pause', 'focusBreak', [3, 5, 10].map(m => [m, m + ' min']))}</div>
    <div class="group-title">Assistent & KI (Claude)</div><div class="group">
      <div class="cell"><span class="grow">API-Schlüssel</span><input type="password" class="right" data-set="apiKey" value="${esc(st.apiKey)}" placeholder="sk-ant-…" autocomplete="off"></div>
      ${sel('Modell', 'model', [['claude-opus-5-5', 'Claude Opus 5.5 (klügste)'], ['claude-sonnet-5-5', 'Claude Sonnet 5.5'], ['claude-haiku-5-5', 'Claude Haiku 5.5 (günstig)']])}
      ${sel('Gründlichkeit', 'aiEffort', [['low', 'Schnell'], ['medium', 'Mittel'], ['high', 'Gründlich']])}
      ${tog('Antworten vorlesen', 'voiceReplies', 'Wenn du per Sprache fragst')}
      ${tog('Änderungen live zeigen', 'liveMode', 'Der Assistent springt dorthin, wo er etwas einträgt')}</div>
    <p class="help">Ohne Schlüssel versteht der Assistent einfache Sätze. Mit Schlüssel (von <i>platform.claude.com</i>, kostenpflichtig, mit Haiku meist unter 1 Cent pro Nachricht) führt er richtige Gespräche. Der Schlüssel bleibt nur auf diesem Gerät.</p>
    <div class="group-title">Kalender</div><div class="group">
      ${sel('Standardansicht', 'defaultView', [['month', 'Monat'], ['week', 'Woche'], ['day', 'Tag'], ['list', 'Liste']])}
      ${sel('Woche beginnt am', 'weekStart', [[1, 'Montag'], [0, 'Sonntag']])}
      ${sel('Standarddauer Termin', 'defaultEventMin', [15, 30, 45, 60, 90, 120].map(m => [m, m + ' min']))}
      ${sel('Standardkalender', 'defaultCal', S.calendars.map(c => [c.id, esc(c.name)]))}
      ${tog('Stundenplan im Kalender', 'showTimetable')}
      ${tog('A/B-Wochen', 'abWeeks', 'Für Stunden, die nur jede zweite Woche sind')}
      ${st.abWeeks ? `<div class="cell"><span class="grow">Diese Woche ist</span><select class="right" data-ab>${opts([['A', 'A-Woche'], ['B', 'B-Woche']], weekType(todayStr()) || 'A')}</select></div>` : ''}
      ${link('Kalender & Google-Import', 'calendars')}</div>
    <div class="group-title">Google</div><div class="group">
      <div class="cell"><span class="grow">Client-ID</span><input type="text" class="right" data-set="googleClientId" value="${esc(st.googleClientId)}" placeholder="….apps.googleusercontent.com"></div></div>
    <p class="help">Nur für den direkten Google-Login: Google Cloud Console → Projekt → „Google Calendar API“ aktivieren → OAuth-Zustimmungsbildschirm (extern, dich als Testnutzer) → OAuth-Client-ID „Webanwendung“ mit der Adresse dieser App als „Autorisierter JavaScript-Ursprung“.</p>
    <div class="group-title">Darstellung</div><div class="group">
      ${sel('Standardliste', 'defaultList', S.lists.map(l => [l.id, esc(l.name)]))}
      ${sel('Design', 'theme', [['system', 'Wie System'], ['light', 'Hell'], ['dark', 'Dunkel']])}</div>
    <div class="group-title">Daten</div><div class="group">
      <button class="cell action" data-backup>Backup speichern (.json)</button>
      <label class="cell action" style="cursor:pointer">Backup laden<input type="file" accept=".json,application/json" hidden data-restore></label>
      <button class="cell action" data-intro>Einführung nochmal zeigen</button>
      <button class="cell danger" data-wipe>Alle Daten löschen</button></div>
    <p class="help">Alles bleibt auf diesem Gerät. Mach ab und zu ein Backup.</p>`;
  openSheet({
    title: 'Einstellungen', left: '', right: 'Fertig', body,
    onOpen(sh, close) {
      const b = sh.querySelector('.sheet-body');
      b.addEventListener('change', async e => {
        const t = e.target;
        if (t.dataset.set) {
          const k = t.dataset.set;
          let v = t.type === 'checkbox' ? t.checked : t.value;
          if (['breakMin', 'defaultTaskMin', 'weekStart', 'defaultEventMin', 'rewardAfterMin', 'rewardMin', 'focusMin', 'focusBreak'].includes(k)) v = +v;
          if (typeof v === 'string') v = v.trim();
          st[k] = v;
          if (k === 'dayStart' || k === 'dayEnd') Object.values(S.plans).forEach(p => p.anchor = null);
          if (k === 'defaultView') ui.cal.view = v;
          if (k === 'abWeeks' && v && !st.abRef) st.abRef = ymd(startOfWeekMon(new Date()));
          save(); applyTheme(); render();
          if (k === 'weatherCity') { S.weather = null; refreshWeather(true); }
          if (k === 'abWeeks') { close(); openSettings(); }
        }
        if (t.dataset.ab !== undefined) {
          const mon = startOfWeekMon(new Date());
          st.abRef = ymd(t.value === 'A' ? mon : addDays(mon, -7)); save(); render();
        }
        if (t.dataset.restore !== undefined && t.files?.[0]) {
          try {
            const data = JSON.parse(await t.files[0].text());
            if (!data.settings || !data.events) throw new Error(`kein ${APP_NAME}-Backup`);
            if (!confirm('Backup laden? Die aktuellen Daten werden ersetzt.')) return;
            const key = S.settings.apiKey, oldUntis = S.untis;
            S = migrate(data); if (!S.settings.apiKey) S.settings.apiKey = key;
            if (S.untis && !S.untis.secret && oldUntis?.secret && oldUntis.server === S.untis.server && oldUntis.user === S.untis.user) S.untis.secret = oldUntis.secret;
            save(); applyTheme(); render(); close(); toast('Backup geladen ✓');
          } catch (err) { toast('Backup ungültig: ' + err.message); }
        }
      });
      b.addEventListener('click', e => {
        const t = e.target.closest('button'); if (!t) return;
        if (t.dataset.open === 'timetable') openTimetable();
        if (t.dataset.open === 'calendars') openCalendars();
        if (t.dataset.open === 'routines') openRoutines();
        if (t.dataset.open === 'untis') { close(); openUntisConnect(); }
        if (t.dataset.backup !== undefined) {
          const blob = new Blob([JSON.stringify({ ...S, settings: { ...S.settings, apiKey: '' }, untis: S.untis ? { ...S.untis, secret: '' } : null }, null, 1)], { type: 'application/json' });
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${APP_NAME.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-backup-${todayStr()}.json`; a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        }
        if (t.dataset.intro !== undefined) { close(); setTimeout(openOnboarding, 250); }
        if (t.dataset.wipe !== undefined && confirm('Wirklich ALLE Termine, Erinnerungen und Einstellungen löschen?')) {
          localStorage.removeItem(KEY); localStorage.removeItem(CHAT_KEY); load(); asLoad(); render(); close(); toast('Alles gelöscht');
          setTimeout(openOnboarding, 400);
        }
      });
    },
  });
}
