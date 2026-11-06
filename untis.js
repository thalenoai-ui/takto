'use strict';
/* =====================================================================
   untis.js – Stundenplan direkt aus WebUntis übernehmen
   Nutzt die zustandslose "Untis Mobile"-Schnittstelle (jsonrpc_intern.do):
   jede Anfrage trägt Benutzername + Einmalcode (TOTP aus dem App-Schlüssel).
   Das Passwort wird nur einmal zum Holen des Schlüssels verwendet und nie gespeichert.
   ===================================================================== */

// ---------- Einmalcode (TOTP, RFC 6238: HMAC-SHA1, 30 s, 6 Stellen) ----------
function base32Decode(s) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  s = String(s).toUpperCase().replace(/=+$/, '').replace(/[^A-Z2-7]/g, '');
  let bits = 0, val = 0; const out = [];
  for (const c of s) { val = (val << 5) | A.indexOf(c); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } }
  return new Uint8Array(out);
}
async function totp(secret, time = Date.now(), step = 30, digits = 6) {
  const key = await crypto.subtle.importKey('raw', base32Decode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const counter = Math.floor(time / 1000 / step), buf = new ArrayBuffer(8), dv = new DataView(buf);
  dv.setUint32(0, Math.floor(counter / 2 ** 32)); dv.setUint32(4, counter >>> 0);
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, buf)), o = h[h.length - 1] & 15;
  return (((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 10 ** digits;
}

// ---------- Anfragen ----------
class UntisError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const UNTIS_ERRORS = {
  '-8504': 'Benutzername oder Passwort stimmt nicht.', '-8998': 'Anmeldung fehlt – bitte neu verbinden.',
  '-8520': 'Nicht angemeldet – bitte neu verbinden.', '-8509': 'Dein Konto darf diesen Stundenplan nicht sehen.',
  '-8521': 'Dieses Konto ist für die App nicht freigeschaltet.', '-6003': 'Zu viele Treffer – bitte genauer suchen (z. B. Ort dazuschreiben).',
};
const untisMsg = e => UNTIS_ERRORS[String(e.code)] || (e.message === 'Failed to fetch' ? 'Keine Verbindung zu WebUntis (Internet prüfen).' : e.message || 'Unbekannter Fehler');
async function rpc(url, method, params) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: String(Date.now()), method, params, jsonrpc: '2.0' }) });
  if (!r.ok) throw new UntisError(r.status, `WebUntis antwortet mit ${r.status}`);
  const j = await r.json();
  if (j.error) throw new UntisError(j.error.code, j.error.message);
  return j.result;
}
const internUrl = (U, m) => `https://${U.server}/WebUntis/jsonrpc_intern.do?m=${m}&school=${encodeURIComponent(U.school)}&v=i2.2`;
async function untisAuth(U) { const t = Date.now(); return { clientTime: t, user: U.user, otp: await totp(U.secret, t) }; }
async function untisSearchSchools(q) {
  const res = await rpc('https://mobile.webuntis.com/ms/schoolquery2', 'searchSchool', [{ search: q }]);
  return (res?.schools || []).map(s => ({ server: s.server, school: s.loginName, name: s.displayName, address: s.address }));
}
async function untisGetSecret(U, password) {
  const res = await rpc(internUrl(U, 'getAppSharedSecret'), 'getAppSharedSecret', [{ userName: U.user, password }]);
  const secret = typeof res === 'string' ? res : res?.secret || res?.key;
  if (!secret) throw new UntisError(0, 'WebUntis hat keinen Schlüssel geliefert.');
  return secret;
}
async function untisUserData(U) {
  return rpc(internUrl(U, 'getUserData2017'), 'getUserData2017', [{ elementId: 0, deviceOs: 'WEB', deviceOsVersion: '', auth: await untisAuth(U) }]);
}
async function untisTimetable(U, id, type, startDate, endDate) {
  return rpc(internUrl(U, 'getTimetable2017'), 'getTimetable2017', [{
    id, type, startDate, endDate, masterDataTimestamp: 0, timetableTimestamp: 0, timetableTimestamps: [], auth: await untisAuth(U),
  }]);
}

// ---------- Daten umwandeln ----------
const byId = list => Object.fromEntries((list || []).map(x => [x.id, x]));
function slimMaster(md = {}) {
  return {
    subjects: byId((md.subjects || []).map(s => ({ id: s.id, name: s.name, long: s.longName || s.name }))),
    rooms: byId((md.rooms || []).map(r => ({ id: r.id, name: r.name || r.longName }))),
    teachers: byId((md.teachers || []).map(t => ({ id: t.id, name: t.name || [t.firstName, t.lastName].filter(Boolean).join(' ') }))),
    klassen: byId((md.klassen || []).map(k => ({ id: k.id, name: k.name }))),
  };
}
// "2026-11-09T07:50Z" oder "2026-11-09T07:50" → Datum + Uhrzeit (Untis liefert Ortszeit der Schule)
const untisDT = s => { const m = String(s || '').match(/(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/); return m ? { date: m[1], time: `${m[2]}:${m[3]}` } : null; };
function periodToLesson(p, M) {
  const st = untisDT(p.startDateTime), en = untisDT(p.endDateTime);
  if (!st || !en) return null;
  const els = p.elements || [];
  const find = t => els.filter(e => e.type === t);
  const subj = find('SUBJECT')[0], rooms = find('ROOM'), teachers = find('TEACHER');
  const S0 = subj ? M.subjects[subj.id] : null, orig = subj && subj.orgId && subj.orgId !== subj.id ? M.subjects[subj.orgId] : null;
  const is = (p.is || []).map(x => String(x).toUpperCase());
  const roomChanged = rooms.some(r => r.orgId && r.orgId !== r.id), teacherChanged = teachers.some(t => t.orgId && t.orgId !== t.id);
  const status = is.includes('CANCELLED') ? 'cancelled' : is.includes('EXAM') || p.exam ? 'exam' : is.includes('ADDITIONAL') ? 'extra'
    : (orig || is.includes('SUBSTITUTION') || is.includes('IRREGULAR') || roomChanged || teacherChanged) ? 'changed' : 'normal';
  const name = S0?.long || S0?.name || p.text?.lesson || 'Stunde';
  return {
    id: String(p.id), date: st.date, start: st.time, end: en.time,
    subject: name, short: S0?.name || '', orig: orig ? (orig.long || orig.name) : null,
    room: rooms.map(r => M.rooms[r.id]?.name).filter(Boolean).join(', '),
    teacher: teachers.map(t => M.teachers[t.id]?.name).filter(Boolean).join(', '),
    status, info: [p.text?.substitution, p.text?.info].filter(Boolean).join(' · '),
    exam: p.exam ? { name: p.exam.name || p.exam.text || '', type: p.exam.examType || '' } : null,
    homework: (p.homeWorks || []).map(h => ({ id: String(h.id), text: h.text || '', due: (h.endDate || h.dueDate || '').slice(0, 10) })),
  };
}

// ---------- Hinweise ("Religion habe ich nicht", "Latein statt Französisch") ----------
const RULE_WORD = /(statt|nicht|kein|keine|keinen|ohne|\bnur\b|weg|lass|streich|abgemeldet|befreit|raus|trifft)/;
const FILLER_WORDS = /\b(ich|habe|hab|hat|nicht|kein|keine|keinen|ohne|bitte|weg|weglassen|lassen|lass|streichen|streich|raus|mehr|trifft|zu|für|mich|mir|das|die|der|den|dem|fach|fächer|stunde|stunden|abgemeldet|befreit|von|bin|in|im|auch|alle|alles|termine|einträge|kalender|gar|weil|da)\b/g;
function parseImportNote(note, names) {
  const rules = { exclude: [], replace: [], only: [] };
  // Namen finden – auch Abkürzungen wie "Reli" → "Religion", "Franz" → "Französisch"
  const namesIn = s => {
    const words = s.split(/[^a-zäöüß0-9]+/).filter(w => w.length >= 3);
    return names.filter(n => { const nl = n.toLowerCase(); return s.includes(nl) || words.some(w => nl.startsWith(w) || (w.length >= 5 && nl.includes(w)) || (w.endsWith('e') && nl.startsWith(w.slice(0, -1)))); });
  };
  const nameIn = s => namesIn(s).sort((a, b) => b.length - a.length)[0] || null;
  // In Sätze teilen; "und" nur trennen, wenn beide Teile eine eigene Regel haben
  const clauses = [];
  for (const part of (note || '').toLowerCase().split(/[,;.\n!]+/)) {
    const bits = part.split(/\bund\b|\baußerdem\b|\bsowie\b/);
    if (bits.length > 1 && bits.every(b => RULE_WORD.test(b))) clauses.push(...bits); else clauses.push(part);
  }
  for (const raw of clauses) {
    const p = raw.trim(); if (!p) continue;
    const sw = p.match(/(.+?)\s+(?:statt|anstatt|anstelle von|anstelle)\s+(.+)/);
    if (sw) {
      const to = nameIn(sw[1]) || sw[1].replace(FILLER_WORDS, ' ').replace(/\s+/g, ' ').trim(), from = nameIn(sw[2]) || sw[2].replace(FILLER_WORDS, ' ').trim();
      if (from && to) rules.replace.push({ from, to: to.replace(/^./, c => c.toUpperCase()) });
      continue;
    }
    const hit = namesIn(p);
    if (/\bnur\b/.test(p) && hit.length) { rules.only.push(...hit); continue; }
    if (RULE_WORD.test(p)) {
      if (hit.length) rules.exclude.push(...hit);
      else p.replace(FILLER_WORDS, ' ').split(/\s+/).map(w => w.trim()).filter(w => w.length > 2).forEach(w => rules.exclude.push(w));
    }
  }
  rules.exclude = [...new Set(rules.exclude)]; rules.only = [...new Set(rules.only)];
  return rules;
}
async function interpretNote(kind, note, names) {
  if (!note.trim()) return { exclude: [], replace: [], only: [] };
  if (aiReady() && window.TagwerkAI?.oneShot) {
    try {
      const sys = `Du wandelst kurze Hinweise einer Schülerin/eines Schülers in Filterregeln für einen Import um. Antworte NUR mit JSON: {"exclude":[…],"replace":[{"from":"…","to":"…"}],"only":[…]}. "exclude" = Namen aus der Liste, die weggelassen werden sollen; "replace" = Fach/Kalender aus der Liste, das durch etwas anderes ersetzt wird; "only" = nur diese behalten. Verwende für exclude/only/from möglichst exakt die Schreibweise aus der Liste.`;
      const out = await window.TagwerkAI.oneShot({ system: sys, user: `Art: ${kind}\nListe: ${JSON.stringify(names)}\nHinweis: ${note}`, settings: S.settings });
      if (out && (out.exclude || out.replace || out.only)) return { exclude: out.exclude || [], replace: out.replace || [], only: out.only || [] };
    } catch (e) { console.warn('KI-Hinweis', e); }
  }
  return parseImportNote(note, names);
}
const ruleHit = (list, s) => (list || []).some(x => (s || '').toLowerCase().includes(String(x).toLowerCase()) || String(x).toLowerCase() === (s || '').toLowerCase());

// ---------- Stundenplan-Muster aus den echten Tagen bilden ----------
const slotKey = l => `${parseYmd(l.date).getDay()}|${l.start}|${(l.orig || l.subject).toLowerCase()}`;
function untisKeep(l) {
  const R = S.untis?.rules || {};
  const subj = l.orig || l.subject;
  if (ruleHit(R.exclude, subj) || ruleHit(R.exclude, l.short)) return false;
  if (R.only?.length && !ruleHit(R.only, subj)) return false;
  if ((R.slots || []).includes(slotKey(l))) return false;
  return true;
}
const untisName = s => { const r = (S.untis?.rules?.replace || []).find(x => x.from && s && s.toLowerCase().includes(x.from.toLowerCase())); return r ? r.to : s; };
function buildPattern(days) {
  const seen = new Map();
  for (const [date, ls] of Object.entries(days)) for (const l of ls) {
    if (l.status === 'extra') continue;
    const subject = l.orig || l.subject, k = `${parseYmd(date).getDay()}|${l.start}|${l.end}|${subject}`;
    if (!seen.has(k)) seen.set(k, { id: 'u' + (seen.size + 1), wd: parseYmd(date).getDay(), subject, start: l.start, end: l.end, room: l.status === 'normal' ? l.room : '', teacher: l.status === 'normal' ? l.teacher : '', week: 'all', source: 'untis', date });
    else if (l.status === 'normal') { const x = seen.get(k); x.room ||= l.room; x.teacher ||= l.teacher; }
  }
  return [...seen.values()].sort((a, b) => a.wd - b.wd || toMin(a.start) - toMin(b.start));
}
// Gleichzeitige Stunden (z. B. Religion/Ethik, Latein/Französisch) → nachfragen
function findConflicts(pattern) {
  const groups = [];
  for (const wd of [1, 2, 3, 4, 5, 6]) {
    const ls = pattern.filter(l => l.wd === wd).sort((a, b) => toMin(a.start) - toMin(b.start));
    for (const l of ls) {
      const g = groups.find(g => g.wd === wd && g.items.some(x => toMin(x.start) < toMin(l.end) && toMin(l.start) < toMin(x.end)));
      if (g) g.items.push(l); else groups.push({ wd, items: [l] });
    }
  }
  return groups.filter(g => g.items.length > 1 && new Set(g.items.map(i => i.subject)).size > 1);
}
function applyUntisToTimetable() {
  const U = S.untis; if (!U?.days) return 0;
  const pattern = buildPattern(U.days).filter(l => untisKeep({ ...l, date: l.date }));
  S.timetable = S.timetable.filter(l => l.source !== 'untis').concat(pattern.map(({ date, ...l }) => ({ ...l, subject: untisName(l.subject) })));
  return pattern.length;
}
// Prüfungen und Hausübungen aus Untis als Erinnerungen
function importUntisTasks(days) {
  let n = 0;
  for (const ls of Object.values(days)) for (const l of ls) {
    if (!untisKeep(l)) continue;
    if (l.status === 'exam' || l.exam) {
      const key = 'ux:' + l.id;
      if (!S.reminders.some(r => r.untisKey === key) && l.date >= todayStr()) {
        const r = newReminder({ title: `${untisName(l.subject)}: ${l.exam?.name || 'Prüfung'}`, due: l.date, priority: 3, flagged: true, listId: guessList('test'), notes: `Aus WebUntis · ${l.start}–${l.end}${l.room ? ' · ' + l.room : ''}` });
        r.untisKey = key; S.reminders.push(r); n++;
      }
    }
    for (const h of l.homework || []) {
      const key = 'uh:' + h.id;
      if (!h.text || (h.due || l.date) < todayStr() || S.reminders.some(r => r.untisKey === key)) continue;
      const r = newReminder({ title: `HÜ ${untisName(l.subject)}: ${h.text.slice(0, 60)}`, due: h.due || l.date, listId: guessList('hü'), notes: h.text });
      r.untisKey = key; S.reminders.push(r); n++;
    }
  }
  return n;
}

// ---------- Synchronisieren ----------
async function untisFetchDays(U) {
  if (!U.master || !U.elemId || Date.now() - (U.masterAt || 0) > 864e5) {
    const ud = await untisUserData(U);
    U.master = slimMaster(ud?.masterData);
    const u = ud?.userData || {};
    U.elemType = u.elemType || 'STUDENT'; U.elemId = u.elemId; U.displayName = u.displayName || U.user;
    U.klasseId = (u.klassenIds || [])[0] || null;
    U.masterAt = Date.now();
  }
  const start = startOfWeekMon(new Date()), end = addDays(start, 13);
  let tt;
  try { tt = await untisTimetable(U, U.elemId, U.elemType, ymd(start), ymd(end)); }
  catch (e) {
    if (U.klasseId && U.elemType !== 'CLASS') { tt = await untisTimetable(U, U.klasseId, 'CLASS', ymd(start), ymd(end)); U.usingClass = true; }
    else throw e;
  }
  const periods = tt?.timetable?.periods || tt?.periods || [];
  const days = {};
  for (let d = start; d <= end; d = addDays(d, 1)) days[ymd(d)] = [];
  for (const p of periods) { const l = periodToLesson(p, U.master); if (l && days[l.date]) days[l.date].push(l); }
  Object.values(days).forEach(ls => ls.sort((a, b) => toMin(a.start) - toMin(b.start)));
  return days;
}
async function untisSync({ silent = false } = {}) {
  const U = S.untis; if (!U?.secret) return false;
  try {
    U.days = await untisFetchDays(U); U.lastSync = Date.now(); U.error = null;
    if (!S.timetable.some(l => l.source === 'untis')) applyUntisToTimetable();
    const n = importUntisTasks(U.days);
    save(); render.keepScroll = true; render();
    if (!silent) toast(`✅ Stundenplan aktualisiert${n ? ` · ${n} neue Prüfung/HÜ` : ''}`);
    return true;
  } catch (e) {
    U.error = untisMsg(e); saveQuiet();
    if (!silent) toast('WebUntis: ' + U.error, { ms: 5000 });
    return false;
  }
}
const untisAgo = () => { const m = Math.round((Date.now() - (S.untis?.lastSync || 0)) / 60000); return !S.untis?.lastSync ? 'noch nie' : m < 2 ? 'gerade eben' : m < 60 ? `vor ${m} min` : m < 1440 ? `vor ${Math.round(m / 60)} h` : `vor ${Math.round(m / 1440)} Tagen`; };

// =====================================================================
//  Verbinden-Fenster: Schule suchen → anmelden → prüfen → übernehmen
// =====================================================================
function openUntisConnect(initialNote) {
  const st = { step: S.untis?.secret ? 'review' : 'school', results: [], school: S.untis?.server ? { server: S.untis.server, school: S.untis.school, name: S.untis.schoolName, address: '' } : null, busy: false, err: '', days: S.untis?.days || null, conflicts: [], picks: {}, note: initialNote ?? S.untis?.note ?? '' };
  const { el, close } = openSheet({ title: 'WebUntis', left: 'Abbrechen', right: '', body: '<div id="ux"></div>' });
  const box = $('#ux', el);
  const errHTML = () => st.err ? `<div class="banner err">⚠️ <span>${esc(st.err)}</span></div>` : '';
  const paint = () => {
    if (st.step === 'school') {
      box.innerHTML = `<div class="ux-hero">📲</div><h2 class="ux-h">Stundenplan aus WebUntis</h2>
        <p class="help center">Such deine Schule – dann meldest du dich einmal an und ${esc(APP_NAME)} übernimmt deinen Stundenplan. Entfall und Vertretungen kommen automatisch mit.</p>
        <form class="group" data-ux="search"><div class="cell"><span class="em">🔍</span><input type="search" name="q" placeholder="Name oder Ort deiner Schule" value="${esc(st.q || '')}" autocomplete="off" enterkeyhint="search"></div></form>
        ${errHTML()}${st.busy ? '<div class="empty"><span class="typing"><i></i><i></i><i></i></span></div>' : ''}
        <div class="group">${st.results.map((s, i) => `<button class="cell" data-pick="${i}"><span class="grow"><b>${esc(s.name)}</b><div class="cell-sub">${esc(s.address || s.server)}</div></span><span class="chev">›</span></button>`).join('') || (st.q && !st.busy && !st.err ? '<div class="empty small">Keine Schule gefunden.</div>' : '')}</div>`;
      setTimeout(() => box.querySelector('[name=q]')?.focus(), 250);
    } else if (st.step === 'login') {
      box.innerHTML = `<div class="group"><div class="cell"><span class="em big">🏫</span><span class="grow"><b>${esc(st.school.name)}</b><div class="cell-sub">${esc(st.school.address || st.school.server)}</div></span><button class="link" data-ux="change">ändern</button></div></div>
        <div class="group-title">Mit deinen WebUntis-Daten</div>
        <form class="group" data-ux="login" autocomplete="on">
          <div class="cell"><span class="grow">Benutzer</span><input class="right" type="text" name="user" autocomplete="username" autocapitalize="off" value="${esc(S.untis?.user || '')}" placeholder="wie in Untis"></div>
          <div class="cell"><span class="grow">Passwort</span><input class="right" name="pw" type="password" autocomplete="current-password" placeholder="••••••"></div>
          <button class="cell action" type="submit" ${st.busy ? 'disabled' : ''}>${st.busy ? 'Verbinde …' : 'Verbinden'}</button></form>
        ${errHTML()}
        <p class="help">🔒 Dein Passwort geht nur einmal direkt an deine Schule (WebUntis) und wird nicht gespeichert. Auf diesem Gerät bleibt nur ein App-Schlüssel, mit dem ${esc(APP_NAME)} deinen Stundenplan lesen kann.</p>
        <details class="group ux-sso"><summary class="cell action">Du meldest dich mit Microsoft oder Google an?</summary>
          <p class="help">Dann nimm den Zugangsschlüssel: Öffne <b>WebUntis im Browser</b> → oben rechts auf <b>dein Profil</b> → Reiter <b>„Freigaben“</b> → bei <b>„Zugriff über Untis Mobile“</b> auf <b>„Anzeigen“</b>. Dort stehen dein Benutzername und der Schlüssel.</p>
          <form data-ux="key"><div class="cell"><span class="grow">Benutzer</span><input class="right" type="text" name="user" autocapitalize="off" value="${esc(S.untis?.user || '')}"></div>
          <div class="cell"><span class="grow">Schlüssel</span><input class="right" type="text" name="key" autocapitalize="characters" autocomplete="off" placeholder="z. B. ABCD1234…"></div>
          <button class="cell action" type="submit">Mit Schlüssel verbinden</button></form></details>`;
    } else if (st.step === 'review') {
      const U = S.untis, pattern = st.days ? buildPattern(st.days) : [];
      st.conflicts = findConflicts(pattern);
      const rules = U?.rules || {};
      const kept = pattern.filter(l => untisKeep(l));
      const subjectsAll = [...new Set(pattern.map(l => l.subject))];
      box.innerHTML = `<div class="ux-ok">✅ Verbunden: <b>${esc(U.displayName || U.user)}</b> · ${esc(U.schoolName || U.school)}${U.usingClass ? ' <small>(Klassenstundenplan)</small>' : ''}</div>
        ${errHTML()}
        ${st.busy ? '<div class="empty"><span class="typing"><i></i><i></i><i></i></span><br>Hole deinen Stundenplan …</div>' : ''}
        ${st.conflicts.length ? `<div class="group-title">Zur selben Zeit – welches hast du?</div>${st.conflicts.map((g, gi) => `<div class="group pad"><div class="cell-sub">${WD_LONG[g.wd]}, ${g.items[0].start}</div><div class="chips-row">${[...new Set(g.items.map(i => i.subject))].map(s => {
          const off = g.items.filter(i => i.subject === s).every(i => !untisKeep(i));
          return `<button class="pick ${off ? '' : 'on'}" data-slot="${gi}" data-subj="${esc(s)}">${esc(withEmoji(s))}</button>`; }).join('')}</div></div>`).join('')}` : ''}
        <div class="group-title">Hinweise <small>(optional)</small></div>
        <div class="group"><div class="cell"><textarea name="note" rows="2" placeholder="z. B. „Religion habe ich nicht“, „Latein statt Französisch“">${esc(st.note)}</textarea></div>
          <button class="cell action" data-ux="note">Hinweis anwenden</button></div>
        ${rules.exclude?.length || rules.replace?.length ? `<p class="help">Wird angewendet: ${[...(rules.exclude || []).map(x => '– ' + x), ...(rules.replace || []).map(r => r.from + ' → ' + r.to)].map(esc).join(' · ')}</p>` : ''}
        <div class="group-title">Deine Woche (${kept.length} Stunden)</div>
        <div class="group pad ux-week">${[1, 2, 3, 4, 5, 6].map(wd => { const ls = kept.filter(l => l.wd === wd); return ls.length ? `<div class="ux-day"><b>${WD[wd]}</b><span>${ls.map(l => `<i style="--sc:${subjectColor(untisName(l.subject)) || ACCENT}">${esc(untisName(l.subject))}</i>`).join('')}</span></div>` : ''; }).join('') || '<div class="empty small">Keine Stunden gefunden – evtl. sind gerade Ferien.</div>'}</div>
        ${subjectsAll.length ? `<p class="help">Tipp: Tipp oben auf ein Fach, um es an- oder abzuwählen. Entfall, Vertretungen${' '}und Prüfungen der nächsten zwei Wochen holt ${esc(APP_NAME)} automatisch.</p>` : ''}
        <div class="plan-actions"><button class="btn primary" data-ux="apply" ${st.busy || !kept.length ? 'disabled' : ''}>Stundenplan übernehmen</button></div>
        <div class="group"><button class="cell action" data-ux="refetch">Neu von WebUntis laden</button><button class="cell danger" data-ux="disconnect">Verbindung trennen</button></div>`;
    }
  };
  const applyNote = async () => {
    S.untis.note = st.note;
    const names = [...new Set(buildPattern(st.days || {}).map(l => l.subject))];
    const r = await interpretNote('Schulfächer im Stundenplan', st.note, names);
    S.untis.rules = { ...(S.untis.rules || {}), exclude: r.exclude, replace: r.replace, only: r.only };
    S.untis.noteApplied = st.note; saveQuiet();
    return r;
  };
  const fetchDays = async () => {
    st.busy = true; st.err = ''; paint();
    try {
      st.days = await untisFetchDays(S.untis); S.untis.days = st.days; S.untis.lastSync = Date.now(); S.untis.error = null; saveQuiet();
      if (st.note.trim() && S.untis.noteApplied !== st.note) await applyNote();
    } catch (e) { st.err = untisMsg(e); }
    st.busy = false; paint();
  };
  const connect = async (user, password, key) => {
    st.busy = true; st.err = ''; paint();
    const U = { server: st.school.server, school: st.school.school, schoolName: st.school.name, user: user.trim(), secret: (key || '').replace(/\s+/g, '').toUpperCase(), rules: S.untis?.rules || { exclude: [], replace: [], only: [], slots: [] }, note: S.untis?.note || '' };
    try {
      if (!U.secret) U.secret = await untisGetSecret(U, password);
      await untisUserData(U).then(ud => { U.master = slimMaster(ud?.masterData); const u = ud?.userData || {}; U.elemType = u.elemType || 'STUDENT'; U.elemId = u.elemId; U.displayName = u.displayName || U.user; U.klasseId = (u.klassenIds || [])[0] || null; U.masterAt = Date.now(); });
      S.untis = U; save();
      st.step = 'review'; st.busy = false; paint(); await fetchDays();
    } catch (e) { st.busy = false; st.err = untisMsg(e); paint(); }
  };
  box.addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target, k = f.dataset.ux;
    if (k === 'search') {
      st.q = f.q.value.trim(); if (st.q.length < 3) { st.err = 'Bitte mindestens 3 Buchstaben eingeben.'; paint(); return; }
      st.busy = true; st.err = ''; st.results = []; paint();
      untisSearchSchools(st.q).then(r => { st.results = r; }).catch(err => { st.err = untisMsg(err); }).finally(() => { st.busy = false; paint(); });
    }
    if (k === 'login') { const pw = f.pw.value; f.pw.value = ''; if (!f.user.value.trim() || !pw) { st.err = 'Bitte Benutzer und Passwort eingeben.'; paint(); return; } connect(f.user.value, pw, null); }
    if (k === 'key') { if (!f.user.value.trim() || !f.key.value.trim()) { st.err = 'Bitte Benutzer und Schlüssel eingeben.'; paint(); return; } connect(f.user.value, null, f.key.value); }
  });
  box.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.pick) { st.school = st.results[+b.dataset.pick]; st.step = 'login'; st.err = ''; paint(); }
    if (b.dataset.ux === 'change') { st.step = 'school'; paint(); }
    if (b.dataset.slot !== undefined) {
      const g = st.conflicts[+b.dataset.slot], s = b.dataset.subj, R = (S.untis.rules ||= { exclude: [], replace: [], only: [], slots: [] }); R.slots ||= [];
      const keys = g.items.filter(i => i.subject === s).map(i => `${i.wd}|${i.start}|${i.subject.toLowerCase()}`);
      const on = !keys.every(k => R.slots.includes(k));
      if (on) R.slots.push(...keys); else R.slots = R.slots.filter(k => !keys.includes(k));
      saveQuiet(); paint();
    }
    if (b.dataset.ux === 'note') {
      st.note = box.querySelector('[name=note]').value;
      st.busy = true; paint();
      const r = await applyNote();
      st.busy = false; paint();
      toast(r.exclude.length || r.replace.length || r.only.length ? 'Hinweis angewendet ✓' : 'Ich habe im Hinweis kein Fach erkannt.');
    }
    if (b.dataset.ux === 'apply') {
      const note = box.querySelector('[name=note]')?.value || ''; S.untis.note = note;
      const undo = makeUndo(); const n = applyUntisToTimetable(); const t = importUntisTasks(S.untis.days || {});
      save(); render(); close();
      toast(`📲 ${n} Stunden übernommen${t ? ` · ${t} Prüfung/HÜ` : ''}`, { action: 'Rückgängig', onAction: () => doUndo(undo) });
    }
    if (b.dataset.ux === 'refetch') fetchDays();
    if (b.dataset.ux === 'disconnect') {
      if (!confirm('Verbindung zu WebUntis trennen? Dein Stundenplan bleibt erhalten.')) return;
      S.untis = null; save(); render(); close(); toast('WebUntis getrennt');
    }
  });
  paint();
  if (st.step === 'review' && !st.days) fetchDays();
}

// Beim Öffnen der App still aktualisieren (höchstens alle 3 Stunden)
function untisAutoSync() {
  if (S.untis?.secret && navigator.onLine !== false && Date.now() - (S.untis.lastSync || 0) > 3 * 3600e3) untisSync({ silent: true });
}
