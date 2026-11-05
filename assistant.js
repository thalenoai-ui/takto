'use strict';
/* =====================================================================
   Tagwerk · assistant.js – der schwebende Assistent (unten rechts):
   Chat + Sprache, zeigt live, was er einträgt, fragt bei Bedarf nach.
   Ohne API-Schlüssel versteht er einfache deutsche Sätze selbst,
   mit Schlüssel spricht er mit Claude (siehe ai.js).
   ===================================================================== */

const CHAT_KEY = 'tagwerk.chat';
let CHAT;
function asLoad() {
  try { CHAT = JSON.parse(localStorage.getItem(CHAT_KEY) || 'null'); } catch { CHAT = null; }
  CHAT ||= {}; CHAT.messages ||= []; CHAT.api ||= [];
}
function asSave() {
  if (CHAT.messages.length > 80) CHAT.messages = CHAT.messages.slice(-60);
  try { localStorage.setItem(CHAT_KEY, JSON.stringify(CHAT)); }
  catch { CHAT.api = []; try { localStorage.setItem(CHAT_KEY, JSON.stringify(CHAT)); } catch { } }
}
asLoad();
const AS = { open: false, size: 'full', busy: false, listening: false, voice: false, speaking: false, pending: null, rec: null, status: '' };
const DEFAULT_CHIPS = ['Was steht heute an?', 'HÜ Mathe bis Freitag', 'Zahnarzt morgen um 15 Uhr', 'Ich bin müde'];
const isWide = () => matchMedia('(min-width: 1000px)').matches;

// ---------- Aufbau ----------
function asBuild() {
  const el = document.createElement('section');
  el.id = 'assistant'; el.className = 'as'; el.setAttribute('aria-label', 'Assistent');
  el.innerHTML = `
    <div class="as-head">
      <button class="as-grab" data-as="size" aria-label="Größe ändern"><i></i></button>
      <div class="as-title"><span class="as-orb"></span><div><b>Assistent</b><small class="as-status"></small></div></div>
      <button class="as-pill" data-as="live" title="Änderungen live zeigen">${I.eye}<span>Live</span></button>
      <button class="as-ico" data-as="new" aria-label="Neues Gespräch" title="Neues Gespräch">${I.edit}</button>
      <button class="as-ico as-sz" data-as="size" aria-label="Kleiner/größer">${I.down}</button>
      <button class="as-ico" data-as="close" aria-label="Schließen">${I.x}</button>
    </div>
    <div class="as-log" aria-live="polite"></div>
    <div class="as-chips"></div>
    <form class="as-input"><input type="text" placeholder="Frag mich oder sag, was ich eintragen soll …" autocomplete="off" enterkeyhint="send">
      <button type="button" class="as-mic" data-as="mic" aria-label="Sprechen">${I.mic}</button><button type="submit" class="as-send" aria-label="Senden">${I.send}</button></form>`;
  document.body.append(el);
  const input = $('input', el), form = $('form', el);
  form.addEventListener('submit', e => { e.preventDefault(); const t = input.value; input.value = ''; form.classList.remove('has-text'); asSend(t); });
  input.addEventListener('input', () => form.classList.toggle('has-text', !!input.value.trim()));
  input.addEventListener('focus', () => { if (AS.size === 'mini' && !isWide()) asSetSize('full'); });
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-as],[data-as-show],[data-as-undo],[data-as-chip]'); if (!b) return;
    if (b.dataset.asChip !== undefined) return asSend(b.dataset.asChip);
    if (b.dataset.asShow) { const [i, j] = b.dataset.asShow.split(':').map(Number); const c = CHAT.messages[i]?.changes?.[j]; if (c) playChanges([c], true); return; }
    if (b.dataset.asUndo) { if (doUndo(b.dataset.asUndo)) { CHAT.messages.forEach(m => { if (m.undo === b.dataset.asUndo) m.undo = null; }); asSave(); paintAs(); } return; }
    const k = b.dataset.as;
    if (k === 'close') closeAssistant();
    if (k === 'size') asSetSize(AS.size === 'full' ? 'mini' : 'full');
    if (k === 'live') { S.settings.liveMode = !S.settings.liveMode; save(); paintAs(); toast(S.settings.liveMode ? '👁 Live an: Ich zeige dir jede Änderung' : 'Live aus: Änderungen kommen als Karte mit „Zeigen“'); }
    if (k === 'new') { CHAT = { messages: [], api: [] }; AS.pending = null; asSave(); paintAs(); toast('Neues Gespräch'); }
    if (k === 'mic') AS.listening ? stopListening() : startListening(true);
  });
  paintAs();
}
function openAssistant(focus = false) {
  AS.open = true; document.body.classList.add('as-open');
  if (!S.settings.aiHintSeen) { S.settings.aiHintSeen = true; saveQuiet(); $('#ai-hint')?.remove(); }
  asSetSize('full'); paintAs();
  if (focus && !('ontouchstart' in window)) setTimeout(() => $('#assistant input').focus(), 250);
}
function closeAssistant() {
  AS.open = false; stopListening(); AS.voice = false; try { speechSynthesis.cancel(); } catch { }
  document.body.classList.remove('as-open', 'as-mini'); layoutAs();
}
function asSetSize(size) { AS.size = size; document.body.classList.toggle('as-mini', size === 'mini'); layoutAs(); }
function layoutAs() {
  const el = $('#assistant'); if (!el) return;
  requestAnimationFrame(() => {
    const h = AS.open && !isWide() ? el.offsetHeight : 0;
    document.documentElement.style.setProperty('--as-h', h + 'px');
    const log = $('.as-log', el); log.scrollTop = log.scrollHeight;
  });
  $('#ai-btn')?.classList.toggle('on', AS.open);
}
function asStatus(s) { AS.status = s; const st = $('#assistant .as-status'); if (st) st.textContent = s; }
function msgHTML(m, i) {
  if (m.role === 'user') return `<div class="msg user">${esc(m.text)}</div>`;
  const ch = (m.changes || []).map((c, j) => `<button class="as-change" data-as-show="${i}:${j}"><span class="ic">${c.icon || '•'}</span><span class="grow">${esc(c.label)}</span><span class="go">${c.nav ? 'Öffnen' : 'Zeigen'} ›</span></button>`).join('');
  const undo = m.undo && undoStore.has(m.undo) ? `<button class="as-undo" data-as-undo="${m.undo}">${I.undo}Rückgängig</button>` : '';
  return `<div class="msg bot">${esc(m.text)}${ch || undo ? `<div class="as-changes">${ch}${undo}</div>` : ''}</div>`;
}
function paintAs() {
  const el = $('#assistant'); if (!el) return;
  const log = $('.as-log', el);
  const name = (S.settings.userName || '').trim();
  const welcome = `<div class="msg bot">Hi${name ? ' ' + esc(name) : ''}! 👋 Ich bin dein Assistent. Sag oder schreib mir, was ansteht – ich trage es ein, plane es und zeig dir live, wo. Zum Beispiel:<br><i>„HÜ Mathe bis Freitag“</i>, <i>„Zahnarzt morgen um 15 Uhr“</i>, <i>„Heimfahrt dauert heute 45 Minuten“</i>.${aiReady() ? '' : '<br><small>Ohne API-Schlüssel verstehe ich einfache Sätze. Mit Schlüssel (Einstellungen) wird’s ein richtiges Gespräch.</small>'}</div>`;
  log.innerHTML = (CHAT.messages.length ? CHAT.messages.map(msgHTML).join('') : welcome)
    + (AS.busy ? `<div class="msg bot"><span class="typing"><i></i><i></i><i></i></span></div>` : '')
    + (AS.listening ? `<div class="msg user listening">🎙️ ${esc(AS.interim || 'Ich höre zu …')}</div>` : '');
  const last = CHAT.messages.at(-1);
  const chips = AS.busy || AS.listening ? [] : (last?.role === 'bot' && last.suggestions?.length ? last.suggestions : (!CHAT.messages.length ? DEFAULT_CHIPS : []));
  $('.as-chips', el).innerHTML = chips.slice(0, 5).map(c => `<button data-as-chip="${esc(c)}">${esc(c)}</button>`).join('');
  $('.as-pill', el).classList.toggle('on', !!S.settings.liveMode);
  $('.as-mic', el).classList.toggle('rec', AS.listening);
  $('.as-mic', el).innerHTML = AS.listening ? I.stop : I.mic;
  el.classList.toggle('busy', AS.busy); el.classList.toggle('listening', AS.listening); el.classList.toggle('speaking', AS.speaking);
  asStatus(AS.listening ? 'hört zu …' : AS.busy ? 'denkt nach …' : AS.speaking ? 'spricht …' : AS.status && AS.status.startsWith('zeigt') ? AS.status : (aiReady() ? 'mit Claude' : 'einfacher Modus'));
  layoutAs();
}
function showAiHint() {
  if (S.settings.aiHintSeen || AS.open || $('#ai-hint')) return;
  const h = document.createElement('div'); h.id = 'ai-hint';
  h.innerHTML = 'Neu ✨ Tippe hier und <b>sprich</b> mit deinem Assistenten';
  h.onclick = () => { h.remove(); openAssistant(true); };
  document.body.append(h);
  setTimeout(() => h.remove(), 9000);
}

// ---------- Senden ----------
async function asSend(text, { voice = false } = {}) {
  text = String(text || '').trim();
  if (!text || AS.busy) return;
  if (!AS.open) openAssistant();
  try { speechSynthesis.cancel(); } catch { }
  CHAT.messages.push({ role: 'user', text }); asSave();
  const undo = makeUndo();
  AS.busy = true; paintAs();
  let res;
  try {
    if (aiReady()) res = await askClaude(text);
    else { await sleep(250); res = localAssistant(text); }
  } catch (e) {
    console.error(e);
    const loc = localAssistant(text);
    res = { ...loc, reply: `⚠️ Die KI ist gerade nicht erreichbar (${e.message || e}). ${loc.reply}` };
  }
  const ctxDate = ui.tab === 'plan' ? ui.plan.date : todayStr();
  const changes = [];
  for (const a of res.actions || []) { try { const c = applyAction(a, ctxDate); if (c) changes.push(c); } catch (e) { console.warn('Aktion fehlgeschlagen', a, e); } }
  if (changes.some(c => !c.nav)) save(); else undoStore.delete(undo);
  AS.busy = false;
  CHAT.messages.push({ role: 'bot', text: res.reply || 'Erledigt.', changes, suggestions: (res.suggestions || []).slice(0, 4), undo: changes.some(c => !c.nav) ? undo : null });
  asSave();
  render.keepScroll = true; render(); paintAs();
  const wantsLive = /\bzeig|\blive\b|wo hast du/i.test(text);
  if (changes.length && (S.settings.liveMode || res.show_live || wantsLive || changes.every(c => c.nav))) await playChanges(changes);
  if (S.settings.voiceReplies && (voice || AS.voice)) await speak(res.reply);
  if (AS.voice && AS.open) { if (res.follow_up !== false || AS.pending) startListening(false); else AS.voice = false; }
  paintAs();
}

// ---------- Live zeigen: Ansicht automatisch steuern ----------
async function playChanges(changes, manual = false) {
  const shows = changes.flatMap(c => c.show || []).slice(0, 6);
  if (!shows.length) return;
  if (!isWide()) asSetSize('mini');
  for (let i = 0; i < shows.length; i++) {
    const c = changes.find(c => (c.show || []).includes(shows[i]));
    asStatus(`zeigt dir: ${c?.label || ''}`);
    await showTarget(shows[i]);
    if (i < shows.length - 1) await sleep(1500);
  }
  setTimeout(() => { if (AS.status.startsWith('zeigt')) { AS.status = ''; paintAs(); } }, 1800);
}
async function showTarget(t) {
  if (!t) return;
  if (t.tab === 'calendar') {
    ui.tab = 'calendar';
    if (t.date) { ui.cal.sel = t.date; ui.cal.cursor = parseYmd(t.date); }
    if (t.view) ui.cal.view = t.view; else if (ui.cal.view === 'list' || ui.cal.view === 'week') ui.cal.view = 'month';
    ui.cal.scrollTo = ui.cal.view === 'day';
  } else if (t.tab === 'reminders') {
    ui.tab = 'reminders';
    if (t.listId && listById(t.listId)) { ui.rem.screen = 'list'; ui.rem.id = t.listId; }
  } else {
    ui.tab = 'plan';
    if (t.date) ui.plan.date = t.date;
  }
  try { localStorage.setItem('tagwerk.tab', ui.tab); } catch { }
  render.keepScroll = true; render();
  await sleep(80);
  const sel = t.key ? `[data-key="${CSS.escape(t.key)}"], [data-key^="${CSS.escape(t.key)}:"]` : null;
  const el = sel && $(sel, view);
  if (el) {
    const vr = view.getBoundingClientRect(), er = el.getBoundingClientRect();
    const visible = vr.height - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--as-h')) || 0) - 70;
    view.scrollBy({ top: (er.top - vr.top) - Math.max(60, visible / 2 - er.height / 2), behavior: 'smooth' });
    el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
    setTimeout(() => el.classList.remove('pulse'), 2800);
  }
  if (t.tab === 'calendar' && t.date) { const c = $(`[data-key="day:${t.date}"]`, view); if (c && c !== el) { c.classList.add('pulse'); setTimeout(() => c.classList.remove('pulse'), 2800); } }
}

// ---------- Sprache ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function startListening(userStarted) {
  if (!SR) { toast('Spracheingabe kann dieser Browser nicht – tipp aufs Mikrofon deiner Tastatur und diktiere.', { ms: 4500 }); $('#assistant input')?.focus(); return; }
  if (AS.listening) return;
  if (userStarted) AS.voice = true;
  try { speechSynthesis.cancel(); } catch { }
  const rec = new SR();
  rec.lang = 'de-AT'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
  let final = '';
  rec.onresult = e => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) final += t; else interim += t; }
    AS.interim = (final + ' ' + interim).trim(); paintAs();
  };
  rec.onerror = e => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast('Mikrofon ist nicht erlaubt – bitte in den Browser-Einstellungen freigeben.', { ms: 4500 });
    else if (e.error !== 'no-speech' && e.error !== 'aborted') toast('Spracheingabe: ' + e.error);
  };
  rec.onend = () => {
    AS.listening = false; AS.rec = null; const t = final.trim(); AS.interim = '';
    paintAs();
    if (t) asSend(t, { voice: true }); else AS.voice = false;
  };
  AS.rec = rec; AS.listening = true; AS.interim = '';
  try { rec.start(); } catch (e) { AS.listening = false; console.warn(e); }
  paintAs();
}
function stopListening() { if (AS.rec) { try { AS.rec.stop(); } catch { } } AS.voice = false; }
function speak(text) {
  return new Promise(res => {
    if (!('speechSynthesis' in window) || !text) return res();
    const clean = text.replace(/\p{Extended_Pictographic}|️/gu, '').replace(/[„“"*_#]/g, '').replace(/\s+/g, ' ').trim();
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = 'de-DE'; u.rate = 1.05;
    const v = speechSynthesis.getVoices().find(v => /^de/i.test(v.lang) && /google|siri|anna|helena|katja|markus/i.test(v.name)) || speechSynthesis.getVoices().find(v => /^de/i.test(v.lang));
    if (v) u.voice = v;
    const done = () => { AS.speaking = false; paintAs(); res(); };
    u.onend = done; u.onerror = done;
    AS.speaking = true; paintAs();
    speechSynthesis.cancel(); speechSynthesis.speak(u);
    setTimeout(() => { if (AS.speaking) done(); }, Math.min(30000, 3000 + clean.length * 90));
  });
}

// =====================================================================
//  Claude: Zustand der App mitschicken, Antwort als Aktionen umsetzen
// =====================================================================
function aiContext() {
  const now = new Date(), today = todayStr();
  const days = [];
  for (let i = 0; i < 8; i++) {
    const k = ymd(addDays(now, i)), plan = computePlan(k), blocks = schoolBlocks(k);
    days.push({
      datum: k, tag: WD_LONG[parseYmd(k).getDay()],
      schule: blocks.length ? `${hm(Math.min(...blocks.map(b => b.s)))}–${hm(plan.schoolEnd)}` : null,
      ganztags: dayInstances(k).filter(x => x.ev.allDay).map(x => x.ev.title),
      plan: plan.items.map(it => `${hm(it.s)}–${hm(it.e)} ${it.title} [${it.kind === 'fixed' ? 'fix' + (it.evId ? ' termin_id:' + it.evId : '') : it.kind === 'task' ? 'aufgabe_id:' + it.id + (it.pinned ? ' fest' : '') + (it.done ? ' erledigt' : '') : it.kind === 'routine' ? 'routine' : it.kind === 'reward' ? 'belohnung' : 'flexibel'}]`),
      frei: freeGaps(k, 15).map(g => `${hm(g.s)}–${hm(g.e)}`),
      energie: getPlan(k).energy || 'normal',
    });
  }
  const later = instances(startOfDay(addDays(now, 8)), startOfDay(addDays(now, 45))).slice(0, 40)
    .map(i => ({ termin_id: i.ev.id, titel: i.ev.title, datum: ymd(i.s), von: i.ev.allDay ? 'ganztägig' : hm(minOf(i.s)) }));
  const tasks = S.reminders.filter(r => !r.done).slice(0, 80).map(r => ({
    aufgabe_id: r.id, titel: r.title, faellig: r.due, uhrzeit: r.time, fest_eingeplant: r.planDate ? `${r.planDate}${r.planTime ? ' ' + r.planTime : ''}` : null,
    dauer_min: r.duration || guessTaskDur(r.title), prio: r.priority, markiert: r.flagged, liste: listById(r.listId)?.name,
    unteraufgaben: r.subtasks.map(s => s.title + (s.done ? ' ✓' : '')), wiederholt: r.repeat, notiz: (r.notes || '').slice(0, 150),
  }));
  return {
    jetzt: `${today} ${hm(minOf(now))} (${WD_LONG[now.getDay()]})`, name: S.settings.userName || null,
    ansicht: { reiter: ui.tab, tagesplan_datum: ui.plan.date, kalender_datum: ui.cal.sel },
    tag_von_bis: `${S.settings.dayStart}–${S.settings.dayEnd}`, tage: days, spaetere_termine: later, aufgaben: tasks,
    listen: S.lists.map(l => l.name), faecher: subjects(),
    routinen: S.routines.map(r => `${r.title} ${r.minutes} min (${r.anchor === 'at' ? 'um ' + r.at : r.anchor === 'after_school' ? 'nach der Schule' : 'danach'}, ${ROUTINE_DAYS[r.days]})`),
    stundenplan_heute: lessonsOn(today, true).map(l => `${l.start}–${l.end} ${l.subject}${l.cancelled ? ' (entfällt)' : ''}`),
    live_modus: !!S.settings.liveMode,
  };
}
async function askClaude(text) {
  let history = CHAT.api, summary = '';
  if (history.length >= 30) {
    summary = CHAT.messages.slice(-9, -1).map(m => `${m.role === 'user' ? 'Ich' : 'Assistent'}: ${m.text}`).join('\n');
    history = [];
  }
  const userText = `${summary ? `<bisheriges_gespraech>\n${summary}\n</bisheriges_gespraech>\n\n` : ''}<app_zustand>\n${JSON.stringify(aiContext())}\n</app_zustand>\n\n${text}`;
  const out = await window.TagwerkAI.chat({ history, userText, settings: S.settings });
  CHAT.api = out.history; asSave();
  AS.pending = null;
  return out.json;
}

// =====================================================================
//  Einfacher Modus (ohne KI): deutsche Sätze selbst verstehen
// =====================================================================
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cut = (text, part) => part ? text.replace(new RegExp(reEsc(part), 'i'), ' ').replace(/\s+/g, ' ').trim() : text;
const WDN = { sonntag: 0, montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6 };
const MONTHS_DE = ['jänner|januar', 'februar|feber', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];
function parseDateDe(text) {
  const t = text.toLowerCase().replace(/guten morgen/g, ''), now = new Date();
  let m;
  if ((m = t.match(/\bübermorgen\b/))) return { date: ymd(addDays(now, 2)), m: m[0] };
  if ((m = t.match(/\b(?:bis |für )?morgen\b(?: früh)?/))) return { date: ymd(addDays(now, 1)), m: m[0] };
  if ((m = t.match(/\b(?:bis )?heute\b(?: abend| nachmittag)?/))) return { date: todayStr(), m: m[0] };
  if ((m = t.match(/\bin (\d+|einer|zwei|drei|vier) (tag|tagen|woche|wochen)\b/))) {
    const n = { einer: 1, zwei: 2, drei: 3, vier: 4 }[m[1]] || +m[1];
    return { date: ymd(addDays(now, /woche/.test(m[2]) ? n * 7 : n)), m: m[0] };
  }
  if ((m = t.match(/\b(?:am |bis |zum )?(\d{1,2})\.\s?(\d{1,2})\.(\d{2,4})?/))) {
    let y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : now.getFullYear();
    let d = new Date(y, +m[2] - 1, +m[1]);
    if (!m[3] && d < startOfDay(now)) d = new Date(y + 1, +m[2] - 1, +m[1]);
    return { date: ymd(d), m: m[0] };
  }
  for (let i = 0; i < 12; i++) {
    if ((m = t.match(new RegExp(`\\b(?:am |bis |zum )?(\\d{1,2})\\.?\\s*(?:${MONTHS_DE[i]})\\b`)))) {
      let d = new Date(now.getFullYear(), i, +m[1]);
      if (d < startOfDay(now)) d = new Date(now.getFullYear() + 1, i, +m[1]);
      return { date: ymd(d), m: m[0] };
    }
  }
  if ((m = t.match(/\b(?:(?:am|bis|nächsten|nächste|kommenden|diesen|zum) )*(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b/))) {
    let diff = (WDN[m[1]] - now.getDay() + 7) % 7; if (diff === 0) diff = 7;
    return { date: ymd(addDays(now, diff)), m: m[0] };
  }
  if ((m = t.match(/\b(?:am |bis )?(?:nächste|kommende) woche\b/))) return { date: ymd(addDays(startOfWeekMon(now), 7)), m: m[0] };
  if ((m = t.match(/\b(?:am |bis |zum )?wochenende\b/))) return { date: ymd(addDays(now, (6 - now.getDay() + 7) % 7 || 7)), m: m[0] };
  return null;
}
function fixHour(h, mm, ctx) { if (h >= 1 && h <= 7 && !/früh|morgens|in der früh/.test(ctx)) h += 12; return `${pad(h % 24)}:${mm || '00'}`; }
function parseTimeDe(text) {
  const t = text.toLowerCase();
  let m = t.match(/\b(?:von\s*)?(\d{1,2})(?:[:.](\d{2}))?\s*(?:uhr\s*)?(?:-|–|bis)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(?:uhr)?\b/);
  if (m && +m[1] < 24 && +m[3] < 24) return { time: fixHour(+m[1], m[2], t), end: fixHour(+m[3], m[4], t), m: m[0] };
  m = t.match(/\b(?:um|ab|gegen|so um)\s*(\d{1,2})(?:[:.](\d{2}))?(?![.\d])\s*(?:uhr)?\b/) || t.match(/\b(\d{1,2})[:.](\d{2})(?![.\d])\s*(?:uhr)?\b/) || t.match(/\b(\d{1,2})\s*uhr\b/);
  if (m && +m[1] < 24) return { time: fixHour(+m[1], m[2], t), m: m[0] };
  m = t.match(/\b(?:um )?halb (\d{1,2})\b/);
  if (m) return { time: fixHour(+m[1] - 1, '30', t), m: m[0] };
  return null;
}
function parseDurDe(text) {
  const t = text.toLowerCase(); let m;
  if ((m = t.match(/\b(?:dauert |für )?(\d+(?:[.,]5)?)\s*(?:h|std\.?|stunden?)\b/))) return { min: Math.round(parseFloat(m[1].replace(',', '.')) * 60), m: m[0] };
  if ((m = t.match(/\b(?:dauert |für |ca\. )?(\d+)\s*(?:min\.?|minuten|m)\b/))) return { min: +m[1], m: m[0] };
  if ((m = t.match(/\b(?:dauert |für )?(?:eine )?halbe stunde\b/))) return { min: 30, m: m[0] };
  if ((m = t.match(/\b(?:dauert |für )?(?:eine )?viertelstunde\b/))) return { min: 15, m: m[0] };
  if ((m = t.match(/\b(?:dauert |für )?(?:eine|1) stunde\b/))) return { min: 60, m: m[0] };
  if ((m = t.match(/\b(?:dauert |für )?(?:anderthalb|eineinhalb) stunden\b/))) return { min: 90, m: m[0] };
  return null;
}
function cleanTitle(s) {
  let t = ' ' + s + ' ';
  t = t.replace(/[!?.]+/g, ' ').replace(/\b(bitte|mal|noch|mir|mich|uns|halt|eh|so|ganz|einfach)\b/gi, ' ');
  const lead = /^\s*(kannst du|könntest du|würdest du|trag(e)?|mach(e)?|füg(e)?|plan(e)?|leg(e)?|schreib(e)?|merk(e)?|setz(e)?|erinner(e)?( mich)?( daran)?,?( dass)?|ich (habe|hab|muss|soll|will|möchte|hätte|brauche)|wir (haben|müssen)|neue[nrs]?|termin:?|erinnerung:?|aufgabe:?|dass|daran|einen|eine|ein|den|die|das|der|dem)\b[:,]?\s*/i;
  for (let i = 0; i < 6 && lead.test(t); i++) t = t.replace(lead, ' ');
  t = t.replace(/\s+(ein|eintragen|einplanen|hinzufügen|machen|erledigen|merken|planen|an|auf|rein|hin|vor|abgeben|sein|werden|erledigt sein|fertig sein|fertig|erledigt|gemacht|haben|ist|muss|soll)\s*$/i, ' ');
  t = t.replace(/\s+(ein|eintragen|einplanen|hinzufügen|machen|erledigen|sein|werden|muss|soll)\s*$/i, ' ');
  t = t.replace(/\b(muss|soll|sollte|müsste)\b/gi, ' ').replace(/\s+(am|um|bis|von|für|zum|zur|im|in)\s*$/i, ' ');
  t = t.replace(/\s+/g, ' ').trim().replace(/^[,.\-:]+|[,.\-:]+$/g, '').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}
const HELP_TEXT = 'Ich kann z. B.: Termine eintragen („Zahnarzt morgen um 15 Uhr“), Aufgaben mit Frist einplanen („HÜ Mathe bis Freitag“), Tests mit Lernplan („Bio-Test am 20.11.“), Dinge in den Tag einschieben („Heimfahrt 45 min“), Routinen anlegen („jeden Schultag Mittagessen 30 min“), umplanen („ich bin zu spät“) oder dir zeigen, was ansteht („Was steht morgen an?“).';
function overview(date) {
  const plan = computePlan(date), b = schoolBlocks(date);
  const fixed = plan.items.filter(i => i.kind === 'fixed' && !i.school);
  const tasks = plan.items.filter(i => i.kind === 'task' && !i.done);
  const parts = [];
  parts.push(b.length ? `Schule bis ${hm(plan.schoolEnd)}` : 'keine Schule');
  if (fixed.length) parts.push(fixed.slice(0, 3).map(f => `${f.title} um ${hm(f.s)}`).join(', '));
  let s = `${relDay(date).replace(/^./, c => c.toUpperCase())}: ${parts.join(', ')}.`;
  s += tasks.length ? ` ${tasks.length} ${tasks.length === 1 ? 'Aufgabe' : 'Aufgaben'} – als Nächstes „${tasks[0].title}“ um ${hm(tasks[0].s)}.` : ' Keine Aufgaben – genieß die Freizeit! 🎉';
  return { reply: s, actions: [{ type: 'navigate', tab: 'plan', date }], suggestions: ['Ich bin müde', 'Ich hänge hinterher', date === todayStr() ? 'Was steht morgen an?' : 'Was steht heute an?'] };
}
// Ist die Nachricht nur eine Korrektur (Zeit/Dauer/Tag), oder schon etwas Neues?
function onlyTweak(raw, dt, tm, du) {
  let r = raw; if (dt) r = cut(r, dt.m); if (tm) r = cut(r, tm.m); if (du) r = cut(r, du.m);
  r = r.replace(/\b(dauert|dauer|braucht|doch|lieber|eher|besser|nur|ca|etwa|ungefähr|verschieb\w*|auf|dann|bitte|um|ab|am|ja|nein|okay|ok|geht|das|es|stattdessen|später|früher)\b/gi, ' ').replace(/[\s.,!?]+/g, '');
  return r.length === 0;
}
// Anderen Tag VOR der Frist suchen (erst danach ein Tag nach der Frist)
function otherDaySlot(dur, cur, due) {
  const today = todayStr(), last = due && due >= today ? due : ymd(addDays(new Date(), 7));
  for (let d = parseYmd(today); ymd(d) <= last; d = addDays(d, 1)) {
    const k = ymd(d); if (k === cur) continue;
    const s = proposeSlot(dur, { startDate: k, due: k }); if (s && s.date === k) return s;
  }
  return null;
}
function slotReply(r, slot, due) {
  return slot ? `${emojiFor(r, '✅')} „${r}“${due ? ` (bis ${relDay(due)})` : ''} ist eingetragen. Ich hab’s dir ${relDay(slot.date)} von ${slot.time} bis ${hm(slot.e)} eingeplant – passt das?`
    : `${emojiFor(r, '✅')} „${r}“ ist eingetragen. ${due ? 'Bis dahin' : 'In den nächsten Tagen'} ist leider kein Platz mehr frei – ich lege es automatisch in die nächste Lücke.`;
}
const SLOT_CHIPS = ['Passt ✓', 'Anderer Tag', 'Später', 'Nicht fix einplanen'];
function handlePending(p, raw, low) {
  const yes = /^(ja|jo|jup|passt|ok|okay|super|perfekt|gut|genau|klingt gut|mach( das)?|gern)/.test(low);
  const no = /^(nein|nö|nee|lieber nicht|nicht|kein|abbrechen|vergiss)/.test(low);
  if (p.type === 'slot') {
    const r = S.reminders.find(x => x.id === p.remId); if (!r) return null;
    if (yes) { AS.pending = null; return { reply: `Perfekt 👍 „${r.title}“ steht fix ${relDay(r.planDate)} um ${r.planTime}.`, follow_up: false }; }
    if (/nicht fix|automatisch|egal|irgendwann/.test(low) || no) { AS.pending = null; return { reply: 'Okay, dann lege ich es automatisch in eine passende Lücke.', actions: [{ type: 'plan_reminder', id: r.id, date: null }], follow_up: false }; }
    if (/anderer tag|anderen tag|nächste[nr]? tag|andermal|anderes mal/.test(low)) {
      const s = otherDaySlot(p.dur, r.planDate, p.due);
      if (!s) return { reply: `Vor der Frist${p.due ? ' (' + relDay(p.due) + ')' : ''} ist sonst leider kein Tag frei. Sag mir einfach Tag und Uhrzeit, wenn du es trotzdem verschieben willst.`, suggestions: ['Passt ✓', 'Später', 'Nicht fix einplanen'] };
      return { reply: `Wie wäre es ${relDay(s.date)} von ${s.time} bis ${hm(s.e)}?`, actions: [{ type: 'plan_reminder', id: r.id, date: s.date, time: s.time }], suggestions: SLOT_CHIPS };
    }
    const dt = parseDateDe(raw), tm = parseTimeDe(dt ? cut(raw, dt.m) : raw);
    if ((dt || tm) && onlyTweak(raw, dt, tm, null)) {
      const d = dt?.date || r.planDate || todayStr();
      const time = tm?.time || proposeSlot(p.dur, { startDate: d, due: d })?.time;
      if (!time) return { reply: `${relDay(d).replace(/^./, c => c.toUpperCase())} ist leider alles voll. Anderer Tag?`, suggestions: SLOT_CHIPS };
      const late = p.due && d > p.due ? ` Achtung: Das ist nach der Frist (${relDay(p.due)}).` : '';
      return { reply: `Okay, ${relDay(d)} um ${time}.${late} Passt das so?`, actions: [{ type: 'plan_reminder', id: r.id, date: d, time }], suggestions: SLOT_CHIPS };
    }
    if (/später|andere (uhr)?zeit|früher|anders/.test(low)) {
      const d = r.planDate || todayStr();
      const s = proposeSlot(p.dur, { startDate: d, afterMin: toMin(r.planTime || '00:00') + 30, due: d }) || proposeSlot(p.dur, { startDate: ymd(addDays(parseYmd(d), 1)) });
      if (!s) return { reply: 'Später ist leider nichts mehr frei. Sag mir einfach eine Uhrzeit.', suggestions: ['Passt ✓', 'Anderer Tag'] };
      return { reply: `Dann ${relDay(s.date)} um ${s.time}–${hm(s.e)}. Besser?`, actions: [{ type: 'plan_reminder', id: r.id, date: s.date, time: s.time }], suggestions: SLOT_CHIPS };
    }
    return null;
  }
  if (p.type === 'event_time') {
    const dt = parseDateDe(raw), tm = parseTimeDe(dt ? cut(raw, dt.m) : raw);
    if ((tm && onlyTweak(raw, dt, tm, null)) || /^(ganztägig|ganzer tag|den ganzen tag)/.test(low)) {
      AS.pending = null;
      const d = dt?.date || p.draft.date, id = uid();
      AS.pending = { type: 'event_edit', id };
      return { reply: `📅 „${p.draft.title}“ ist ${relDay(d)}${tm ? ' um ' + tm.time : ' ganztägig'} eingetragen.`, actions: [{ type: 'add_event', _id: id, title: p.draft.title, date: d, time: tm?.time, end_time: tm?.end, minutes: p.draft.minutes }], suggestions: ['Passt ✓', 'Dauert 2 Stunden'] };
    }
    if (no) { AS.pending = null; return { reply: 'Okay, dann lassen wir das.', follow_up: false }; }
    return null;
  }
  if (p.type === 'event_edit') {
    if (yes) { AS.pending = null; return { reply: 'Super, ist eingetragen. 👍', follow_up: false }; }
    const dt = parseDateDe(raw), rest = dt ? cut(raw, dt.m) : raw, tm = parseTimeDe(rest), du = parseDurDe(tm ? cut(rest, tm.m) : rest);
    if ((du || tm || dt) && onlyTweak(raw, dt, tm, du)) {
      const ev = S.events.find(e => e.id === p.id);
      return { reply: `Hab ich geändert${ev ? `: „${ev.title}“` : ''}${du ? ', dauert ' + durLabel(du.min) : ''}${tm ? ', um ' + tm.time : ''}${dt ? ', ' + relDay(dt.date) : ''}.`, actions: [{ type: 'update_event', id: p.id, minutes: du?.min, time: tm?.time, end_time: tm?.end, date: dt?.date }], suggestions: ['Passt ✓'] };
    }
    return null;
  }
  if (p.type === 'study') {
    if (yes || /\d/.test(low)) {
      AS.pending = null;
      const n = +(low.match(/(\d)/) || [])[1] || 3, du = parseDurDe(raw);
      return { reply: `🧠 Fertig: ${n} Lerneinheiten bis ${relDay(p.due)} – ich zeig sie dir.`, actions: [{ type: 'study_plan', title: p.title, due_date: p.due, count: n, minutes: du?.min || 45 }], follow_up: false };
    }
    if (no) { AS.pending = null; return { reply: 'Alles klar, kein Lernplan. Viel Erfolg beim Test! 🍀', follow_up: false }; }
    return null;
  }
  return null;
}
function localAssistant(text) {
  const raw = text.replace(/^✨\s*/, '').trim(), low = raw.toLowerCase();
  const base = ui.tab === 'plan' ? ui.plan.date : todayStr();
  if (AS.pending) { const r = handlePending(AS.pending, raw, low); if (r) return r; AS.pending = null; }
  if (/^(hilfe|help|\?|was kannst du|wie geht das|was geht)/.test(low)) return { reply: HELP_TEXT, suggestions: DEFAULT_CHIPS };
  if (/^(plane?|plan) (meinen|den|mir den) tag|^neu planen|^tag planen/.test(low)) {
    const ov = overview(base);
    return { ...ov, reply: `🔄 Ich habe deinen Tag neu geplant. ${ov.reply}`, actions: [{ type: 'replan', date: base }, { type: 'navigate', tab: 'plan', date: base }] };
  }
  const dt0 = parseDateDe(raw);
  if ((/^(hi|hallo|hey|servus|grüß|moin|guten (morgen|tag|abend))\b/.test(low) && low.length < 25) || /was (steht|hab ich|habe ich|ist)( heute| morgen| übermorgen)? ?(an|los|vor)|wie sieht (mein|der) (tag|plan)|was mache ich (heute|morgen)/.test(low)) return overview(dt0?.date || base);
  if (/\b(müde|kaputt|erschöpft|keine energie|schlapp|fertig mit der welt)\b/.test(low)) return { reply: '😴 Okay, heute machen wir’s entspannter: Leichtes zuerst, mehr Pausen und weniger Programm. Den Rest schiebe ich auf später.', actions: [{ type: 'set_energy', level: 'müde', date: dt0?.date || base }], follow_up: false };
  if (/\b(bin|fühl).*\b(fit|motiviert|voller energie|ausgeschlafen)\b/.test(low)) return { reply: '⚡ Stark! Dann kommen die schweren Sachen zuerst.', actions: [{ type: 'set_energy', level: 'fit', date: dt0?.date || base }], follow_up: false };
  if (/(zu spät|hinterher|verspät|länger gedauert|später dran|im verzug|verschlafen)/.test(low)) return { reply: '⏰ Kein Problem – alles Offene ist ab jetzt nach hinten gerutscht. Fixtermine bleiben.', actions: [{ type: 'replan', date: todayStr() }], follow_up: false };
  if (/(früher fertig|schneller fertig|schon fertig)/.test(low)) return { reply: '🏁 Super! Der Rest ist ab jetzt nach vorne gerückt.', actions: [{ type: 'replan', date: todayStr() }], follow_up: false };
  if (/\b(erledigt|geschafft|abgehakt|hab ich gemacht|bin fertig mit)\b/.test(low) && !/\bbis\b|muss|soll/.test(low)) {
    const q = cleanTitle(raw.replace(/\b(ist|sind|hab|habe|ich|schon|erledigt|geschafft|abgehakt|gemacht|bin fertig mit|fertig)\b/gi, ' '));
    const r = fuzzyFind(S.reminders.filter(x => !x.done), q);
    if (r) return { reply: `🎉 Super, „${r.title}“ ist abgehakt!`, actions: [{ type: 'complete_reminder', id: r.id }], follow_up: false };
    return { reply: `Ich finde keine offene Aufgabe zu „${q}“. Wie heißt sie genau?`, suggestions: S.reminders.filter(x => !x.done).slice(0, 3).map(x => x.title + ' erledigt') };
  }
  if (/^(lösch|entfern|streich|kein |keine |ohne |sag .* ab|absagen)/.test(low)) {
    const q = cleanTitle(cut(raw.replace(/^(lösch(e)?|entfern(e)?|streich(e)?|kein(e|en)?|ohne|sag|absagen)\s*/i, '').replace(/\bab\b/i, ''), dt0?.m));
    const d = dt0?.date || base;
    const p = getPlan(d), x = fuzzyFind(p.extras, q), rt = fuzzyFind(S.routines.filter(r => routineApplies(r, d)), q);
    if (x || rt) return { reply: `➖ „${(x || rt).title}“ ist ${relDay(d)} raus. Der Rest rückt nach.`, actions: [{ type: 'remove_extra', title: q, date: d }], follow_up: false };
    const r = fuzzyFind(S.reminders.filter(z => !z.done), q);
    if (r) return { reply: `🗑️ „${r.title}“ ist gelöscht. (Unten kannst du es rückgängig machen.)`, actions: [{ type: 'delete_reminder', id: r.id }], follow_up: false };
    const ev = fuzzyFind(S.events.filter(e => e.end >= todayStr()), q);
    if (ev) return { reply: `🗑️ Termin „${ev.title}“ ist gelöscht.`, actions: [{ type: 'delete_event', id: ev.id }], follow_up: false };
    return { reply: `Ich finde nichts zu „${q}“.`, follow_up: false };
  }
  if (/^(zeig|öffne|geh zu|geh in|wechsel)/.test(low) && !/(trag|eintragen|erinner)/.test(low)) {
    const tab = /kalender|termin|woche|monat/.test(low) ? 'calendar' : /erinnerung|aufgaben|liste/.test(low) ? 'reminders' : 'plan';
    return { reply: 'Bitte schön 👀', actions: [{ type: 'navigate', tab, date: dt0?.date || (tab === 'plan' ? base : todayStr()), view: /woche/.test(low) ? 'week' : /monat/.test(low) ? 'month' : undefined }], follow_up: false };
  }
  // Stundenplan-Änderungen: "Mathe entfällt morgen", "morgen schulfrei", "Vertretung in Englisch: Deutsch"
  if (/(schulfrei|keine schule|kein unterricht)/.test(low)) {
    const d = dt0?.date || base;
    return { reply: `🎉 ${relDay(d).replace(/^./, c => c.toUpperCase())} ist schulfrei eingetragen – ich plane den Tag ohne Schule.`, actions: [{ type: 'add_event', title: 'Schulfrei', date: d }, { type: 'navigate', tab: 'plan', date: d }], follow_up: false };
  }
  if (/(entfällt|entfallen|fällt\b.*\baus|ausfall|frei(stunde)?\b|supplier|vertretung)/.test(low)) {
    const d = dt0?.date || base, ls = lessonsOn(d, true);
    const l = ls.find(x => low.includes((x.origSubject || x.subject || '').toLowerCase()));
    if (l) {
      const subst = low.match(/(?:vertretung|supplier\w*)[^:]*:\s*(.+)$/);
      if (subst) return { reply: `🔁 ${relDay(d).replace(/^./, c => c.toUpperCase())} ist in ${l.subject} Vertretung (${subst[1]}).`, actions: [{ type: 'substitute_lesson', date: d, title: l.subject, notes: subst[1].replace(/^./, c => c.toUpperCase()) }], follow_up: false };
      return { reply: `🚫 ${l.subject} entfällt ${relDay(d)} (${l.start}–${l.end}). Ich hab deinen Nachmittag angepasst.`, actions: [{ type: 'cancel_lesson', date: d, title: l.subject }], follow_up: false };
    }
    if (ls.length) return { reply: `Welche Stunde entfällt ${relDay(d)}?`, suggestions: [...new Set(ls.map(x => x.subject))].slice(0, 4).map(s => `${s} entfällt ${relDay(d)}`) };
  }
  // Datum, Uhrzeit und Dauer herauslösen
  const deadline = /\bbis\b(?!\s*\d{1,2}\s*(uhr|:))/.test(low) || /\b(abgeben|abgabe|fällig|erledigt sein|fertig sein|spätestens)\b/.test(low);
  let rest = dt0 ? cut(raw, dt0.m) : raw;
  const tm = parseTimeDe(rest); if (tm) rest = cut(rest, tm.m);
  const du = parseDurDe(rest); if (du) rest = cut(rest, du.m);
  const after = rest.match(/\bnach (?:der |dem |den )?(schule|training|probe|heimfahrt|essen|[a-zäöüß]+)\b/i);
  if (after && !/hause/i.test(after[1])) rest = cut(rest, after[0]);
  // Routinen: "jeden Schultag ...", "immer nach der Schule ..."
  if (/\b(jeden|jede|immer|täglich)\b/.test(low)) {
    const days = /schultag|nach der schule/.test(low) ? 'school' : /wochenende/.test(low) ? 'weekend' : /werktag|wochentag|unter der woche/.test(low) ? 'weekdays' : 'daily';
    const title = cleanTitle(rest.replace(/\b(jeden|jede|immer|täglich|tag|schultag|werktag|wochentag|wochenende|abend|nach der schule|unter der woche)\b/gi, ' '));
    if (title) return { reply: `🔁 „${title}“ kommt ab jetzt automatisch in deinen Plan (${ROUTINE_DAYS[days]}${tm ? ', um ' + tm.time : after ? ', nach ' + after[1] : ''}).`, actions: [{ type: 'add_routine', title, minutes: du?.min, time: tm?.time, after: after ? 'Schule' : (tm ? null : 'Schule'), repeat: days }], follow_up: false };
  }
  const title = cleanTitle(rest);
  if (!title) return { reply: 'Das habe ich nicht ganz verstanden. ' + HELP_TEXT, suggestions: DEFAULT_CHIPS };
  const isTest = /(schularbeit|\btest\b|-test\b|prüfung|klausur|\bsa\b)/.test(low) && !/lernen|üben/.test(low);
  const isEvent = /(termin|arzt|zahnarzt|treffen|party|feier|kino|geburtstag|training|probe|nachhilfe|konzert|ausflug|elternabend|friseur|frisör|essen gehen|date|turnier|spiel gegen|match)/.test(low);
  const isTask = deadline || /(\bhü\b|hausübung|hausaufgabe|aufgabe|lernen|üben|wiederholen|erinner|kaufen|aufräumen|anrufen|mitnehmen|vorbereiten|schreiben|lesen|machen|abgeben|ausdrucken)/.test(low);
  const isExtra = /(heimfahrt|heimweg|fahrt|\bbus\b|mittagessen|essen\b|jause|pause|abendessen|duschen|freizeit|zocken|chillen)/.test(low) && !isEvent && !deadline;
  if (isTest && dt0) {
    AS.pending = { type: 'study', title, due: dt0.date };
    return { reply: `📝 „${title}“ ${relDay(dt0.date)} ist eingetragen – ich zähle für dich runter. Soll ich dir einen Lernplan machen?`, actions: [{ type: 'add_reminder', title, due_date: dt0.date, priority: 3, flagged: true, list: 'Schule' }], suggestions: ['Ja, 3 Einheiten', 'Ja, 2 Einheiten', 'Nein danke'] };
  }
  if (isExtra) {
    const d = dt0?.date || base, mins = du?.min || guessExtraDur(title);
    const p = getPlan(d), same = fuzzyFind([...p.extras, ...S.routines.filter(r => routineApplies(r, d) && !p.skipRoutines.includes(r.id))], title.replace(/\s*(dauert|braucht|ist)\b.*$/i, ''));
    if (same && du) return { reply: `⏱ „${same.title}“ dauert ${relDay(d)} ${durLabel(du.min)} – alles danach rückt nach.`, actions: [{ type: 'set_duration', title: same.title, minutes: du.min, date: d }], follow_up: false };
    return { reply: `${emojiFor(title, '🟣')} „${title}“ (${mins} min) ist ${relDay(d)} eingeplant${tm ? ' um ' + tm.time : after ? ' nach ' + after[1] : ''}. Alles Flexible rückt nach, Fixtermine bleiben.`, actions: [{ type: 'add_extra', title, minutes: mins, time: tm?.time, after: after?.[1], date: d }], follow_up: false };
  }
  if ((tm && (dt0 || isEvent) && !isTask) || (isEvent && !isTask)) {
    const d = dt0?.date || base;
    if (!tm) { AS.pending = { type: 'event_time', draft: { title, date: d, minutes: du?.min } }; return { reply: `Um wie viel Uhr ist „${title}“ ${relDay(d)}?`, suggestions: ['09:00', '14:00', '16:00', 'Ganztägig'] }; }
    const id = uid(); AS.pending = { type: 'event_edit', id };
    return { reply: `📅 „${title}“ ist ${relDay(d)} um ${tm.time}${tm.end ? ' bis ' + tm.end : ''} eingetragen. Alles Flexible plant sich drum herum.`, actions: [{ type: 'add_event', _id: id, title, date: d, time: tm.time, end_time: tm.end, minutes: du?.min }], suggestions: ['Passt ✓', 'Dauert 2 Stunden', 'Zeig mir den Tag'] };
  }
  // Standard: Aufgabe mit (optionaler) Frist – selbst einplanen und nachfragen
  const dur = du?.min || guessTaskDur(title), due = dt0 && (deadline || !tm) ? dt0.date : null, id = uid();
  let slot = null;
  if (tm) { const d = dt0?.date || base; slot = { date: d, time: tm.time, e: toMin(tm.time) + dur }; }
  else slot = proposeSlot(dur, { due, startDate: todayStr() });
  AS.pending = { type: 'slot', remId: id, dur, due };
  return {
    reply: slotReply(title, slot, due),
    actions: [{ type: 'add_reminder', _id: id, title, due_date: due, minutes: du?.min, date: slot?.date, time: slot?.time }],
    suggestions: slot ? SLOT_CHIPS : [],
  };
}
