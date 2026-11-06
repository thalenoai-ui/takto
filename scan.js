'use strict';
/* =====================================================================
   scan.js – Stundenplan per Screenshot: Bilder → KI liest aus → prüfen → übernehmen
   ===================================================================== */
async function prepImage(file) {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const url = c.toDataURL('image/jpeg', 0.85);
  return { type: 'image/jpeg', data: url.split(',')[1], url };
}
async function readTimetableImages(images, note) {
  const system = 'Du liest Stundenpläne aus Screenshots (meist WebUntis oder Untis Mobile, Wochen- oder Tagesansicht). Antworte ausschließlich mit einem JSON-Objekt, ohne Text davor oder danach.';
  const prompt = `Lies den regulären Wochen-Stundenplan aus diesen Screenshots aus.
Gib jede Unterrichtsstunde einzeln an mit:
- day: 1=Montag, 2=Dienstag, 3=Mittwoch, 4=Donnerstag, 5=Freitag, 6=Samstag
- start, end: Uhrzeit "HH:MM"
- subject: Fachname ausgeschrieben, wenn die Abkürzung eindeutig ist (z. B. "M" → "Mathematik", "D" → "Deutsch", "E" → "Englisch"), sonst wie angezeigt
- room, teacher: falls sichtbar, sonst ""
Regeln:
- Sind nur Stundennummern statt Uhrzeiten sichtbar, nimm diese Stundenzeiten der Schule: ${S.settings.lessonTimes.map((t, i) => `${i + 1}. ${t}`).join(', ')}.
- Doppelstunden als zwei einzelne Stunden angeben.
- Entfall/Vertretung (durchgestrichen, farbig markiert): trotzdem das reguläre Fach eintragen – gesucht ist der normale Wochenplan.
- Stehen mehrere Fächer gleichzeitig (Gruppen, z. B. Religion/Ethik), gib alle an.
- Zeigen mehrere Screenshots dieselben Stunden, jede Stunde nur einmal.
- Hinweis der Person (beachten, z. B. Fächer weglassen): "${String(note || '').replace(/"/g, "'")}"
Format: {"lessons":[{"day":1,"start":"07:50","end":"08:40","subject":"Mathematik","room":"","teacher":""}],"unsure":"kurz, was unklar war – oder leer"}`;
  const out = await window.TagwerkAI.vision({ images: images.map(({ type, data }) => ({ type, data })), system, prompt, settings: S.settings });
  const seen = new Set();
  const lessons = (out.lessons || []).map(l => ({ wd: +l.day, start: normTime(String(l.start || '')), end: normTime(String(l.end || '')), subject: String(l.subject || '').trim(), room: l.room || '', teacher: l.teacher || '' }))
    .filter(l => l.wd >= 1 && l.wd <= 6 && l.start && l.end && l.subject && toMin(l.end) > toMin(l.start))
    .filter(l => { const k = `${l.wd}|${l.start}|${l.subject.toLowerCase()}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.wd - b.wd || toMin(a.start) - toMin(b.start));
  return { lessons, unsure: out.unsure || '' };
}
function openTimetableScan(initialNote = '') {
  const st = { images: [], busy: false, err: '', note: initialNote, lessons: null, off: new Set(), unsure: '', key: '' };
  const { el, close } = openSheet({ title: 'Stundenplan per Screenshot', left: 'Abbrechen', right: '', body: '<div id="scan"></div>' });
  const box = $('#scan', el);
  const keyOf = l => `${l.wd}|${l.start}|${l.subject}`;
  const paint = () => {
    if (!st.lessons) {
      box.innerHTML = `<div class="ux-hero">📸</div><h2 class="ux-h">Screenshot von deinem Stundenplan</h2>
        <p class="help center">Öffne Untis (App oder Webseite), stell die <b>Wochenansicht</b> ein und mach einen Screenshot – bei Bedarf auch zwei (z. B. A- und B-Woche). Die KI liest daraus deinen Stundenplan aus.</p>
        ${!S.settings.apiKey ? `<div class="card"><b>🔑 Dafür braucht ${esc(APP_NAME)} einen Claude-API-Schlüssel</b><p>Den bekommst du auf <i>platform.claude.com</i> (kostenpflichtig – das Auslesen kostet nur ein paar Cent). Er bleibt nur auf diesem Gerät.</p>
          <input type="password" class="scan-key" placeholder="sk-ant-…" autocomplete="off" value="${esc(st.key)}"></div>` : ''}
        <div class="scan-thumbs">${st.images.map((im, i) => `<div class="thumb"><img src="${im.url}" alt=""><button data-rm="${i}" aria-label="Entfernen">×</button></div>`).join('')}
          <label class="thumb add">＋<span>${st.images.length ? 'Noch eins' : 'Screenshot wählen'}</span><input type="file" accept="image/*" multiple hidden data-pick></label></div>
        <div class="group-title">Hinweis <small>(optional)</small></div>
        <div class="group"><div class="cell"><textarea name="note" rows="2" placeholder="z. B. „Religion habe ich nicht, ich bin in Englisch Gruppe 2“">${esc(st.note)}</textarea></div></div>
        ${st.err ? `<div class="banner err">⚠️ <span>${esc(st.err)}</span></div>` : ''}
        <div class="plan-actions"><button class="btn primary" data-go ${st.busy || !st.images.length ? 'disabled' : ''}>${st.busy ? 'Lese aus … (ca. 20 Sek.)' : '✨ Stundenplan auslesen'}</button></div>`;
      return;
    }
    const pattern = st.lessons.map(l => ({ ...l, id: keyOf(l) }));
    const conflicts = findConflicts(pattern);
    const kept = pattern.filter(l => !st.off.has(l.id));
    box.innerHTML = `<div class="ux-ok">✅ ${pattern.length} Stunden erkannt. Tipp auf ein Fach, um es an- oder abzuwählen.</div>
      ${st.unsure ? `<div class="banner">ℹ️ <span>${esc(st.unsure)}</span></div>` : ''}
      ${conflicts.length ? `<div class="group-title">Zur selben Zeit – welches hast du?</div>${conflicts.map(g => `<div class="group pad"><div class="cell-sub">${WD_LONG[g.wd]}, ${g.items[0].start}</div><div class="chips-row">${g.items.map(i => `<button class="pick ${st.off.has(i.id) ? '' : 'on'}" data-tog="${esc(i.id)}">${esc(withEmoji(i.subject))}</button>`).join('')}</div></div>`).join('')}` : ''}
      <div class="group-title">Deine Woche (${kept.length} Stunden)</div>
      <div class="group pad ux-week">${[1, 2, 3, 4, 5, 6].map(wd => { const ls = pattern.filter(l => l.wd === wd); return ls.length ? `<div class="ux-day"><b>${WD[wd]}</b><span>${ls.map(l => `<button class="pick sm ${st.off.has(l.id) ? '' : 'on'}" data-tog="${esc(l.id)}" title="${l.start}–${l.end}">${esc(l.subject)}</button>`).join('')}</span></div>` : ''; }).join('')}</div>
      <p class="help">Uhrzeiten, Räume und Lehrkräfte kannst du danach unter „Selbst eintragen oder bearbeiten“ ändern.</p>
      <div class="plan-actions"><button class="btn secondary" data-again>Nochmal</button><button class="btn primary" data-apply ${kept.length ? '' : 'disabled'}>Übernehmen</button></div>`;
  };
  box.addEventListener('change', async e => {
    if (e.target.dataset.pick !== undefined && e.target.files?.length) {
      st.note = box.querySelector('[name=note]')?.value ?? st.note;
      st.key = box.querySelector('.scan-key')?.value ?? st.key;
      for (const f of e.target.files) { try { st.images.push(await prepImage(f)); } catch { st.err = 'Ein Bild konnte nicht gelesen werden.'; } }
      st.images = st.images.slice(0, 4); paint();
    }
  });
  box.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.rm) { st.images.splice(+b.dataset.rm, 1); paint(); }
    if (b.dataset.tog) { st.off.has(b.dataset.tog) ? st.off.delete(b.dataset.tog) : st.off.add(b.dataset.tog); paint(); }
    if (b.dataset.again !== undefined) { st.lessons = null; st.off.clear(); paint(); }
    if (b.dataset.go !== undefined) {
      st.note = box.querySelector('[name=note]')?.value || '';
      const k = (box.querySelector('.scan-key')?.value || '').trim();
      if (!S.settings.apiKey) { if (!k) { st.err = 'Bitte zuerst den API-Schlüssel eintragen.'; paint(); return; } S.settings.apiKey = k; save(); }
      if (!window.TagwerkAI?.vision) { st.err = 'Die KI wird noch geladen – bitte kurz warten und nochmal tippen.'; paint(); return; }
      st.busy = true; st.err = ''; paint();
      try {
        const r = await readTimetableImages(st.images, st.note);
        if (!r.lessons.length) throw new Error('Ich konnte auf den Bildern keinen Stundenplan erkennen. Probier einen schärferen Screenshot der Wochenansicht.');
        st.lessons = r.lessons; st.unsure = r.unsure;
        // Hinweis zusätzlich lokal anwenden, falls die KI etwas übersehen hat
        const rules = parseImportNote(st.note, [...new Set(r.lessons.map(l => l.subject))]);
        r.lessons.forEach(l => { if (ruleHit(rules.exclude, l.subject)) st.off.add(keyOf(l)); });
      } catch (err) { st.err = err.message || String(err); }
      st.busy = false; paint();
    }
    if (b.dataset.apply !== undefined) {
      const undo = makeUndo();
      const kept = st.lessons.filter(l => !st.off.has(keyOf(l)));
      S.untis = null; // Screenshot ersetzt eine evtl. halbe WebUntis-Verbindung
      S.timetable = kept.map(l => ({ id: uid(), wd: l.wd, subject: l.subject, start: l.start, end: l.end, room: l.room, teacher: l.teacher, week: 'all', source: 'scan' }));
      save(); render(); close();
      toast(`📸 ${kept.length} Stunden übernommen`, { action: 'Rückgängig', onAction: () => doUndo(undo) });
    }
  });
  paint();
}
