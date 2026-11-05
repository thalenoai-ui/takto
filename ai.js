// KI-Planer: spricht mit Claude über das offizielle Anthropic-SDK.
// Die KI entscheidet WAS gemacht wird (Aktionen, Reihenfolge, Dauer),
// die App rechnet danach die genauen Uhrzeiten aus – so bleiben Fixtermine sicher fix.

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.0.0/+esm';
let sdk = null;

const SYSTEM = `Du bist der Planungsassistent in der App "Tagwerk". Die Person, die dir schreibt, geht zur Schule und will ihren Tag sinnvoll planen.
Du bekommst den Tag als JSON: Fixtermine (Schule, Training, Bandprobe, Kalendertermine), flexible Einträge aus dem Chat, offene Aufgaben aus den Erinnerungen und den aktuellen Plan.

So funktioniert die App, das musst du wissen:
- Fixtermine werden NIE verschoben.
- Flexible Einträge ("add_extra") legt die App der Reihe nach hintereinander in freie Zeit (eine Kette). Mit "after" hängst du einen Eintrag an einen Fixtermin (z. B. after="Schule"), mit "at" (HH:MM) gibst du eine feste Startzeit vor.
- Aufgaben verteilt die App in der Reihenfolge von "task_order" auf die freien Lücken nach der Schule bzw. ab jetzt. "durations" setzt realistische Minuten pro Aufgabe.
- Du rechnest also keine Uhrzeiten für Aufgaben aus, sondern bestimmst Reihenfolge und Dauer.

Aktionen (actions):
- add_extra: etwas Flexibles einplanen (Heimfahrt, Essen, Pause, Duschen …). title, minutes, optional at oder after.
- remove_extra: einen flexiblen Eintrag entfernen (title = Teil des Namens).
- clear_extras: alle flexiblen Einträge des Tages entfernen.
- add_fixed: neuer Fixtermin im Kalender (title, at=Start HH:MM, end=Ende HH:MM, optional date YYYY-MM-DD).
- add_reminder: neue Aufgabe in den Erinnerungen (title, optional minutes, date).
- set_duration: Dauer einer Aufgabe oder eines flexiblen Eintrags ändern (title = Aufgaben-ID oder Name, minutes).
- replan: ab jetzt neu planen.
Nicht benötigte Felder setzt du auf null.

Beim Planen ("modus": "plan") oder wenn um eine Planung gebeten wird:
- Wähle in task_order die Aufgaben-IDs, die heute sinnvoll sind: Überfälliges und bald Fälliges zuerst (Tests/Schularbeiten früh genug lernen), hohe Priorität und Markierte bevorzugen, Schweres eher früher am Nachmittag, nicht alles auf einmal – lieber realistisch.
- Wenn nach der Schule noch keine Heimfahrt oder kein Essen im Plan steht, darfst du das NICHT einfach erfinden; schlage es höchstens im reply vor.
- Gib realistische durations an (Hausübung meist 20–40 min, Lernen für Tests 45–60 min).
Im normalen Chat: setze die Wünsche genau als Aktionen um. task_order nur ändern, wenn die Nachricht das betrifft, sonst leeres Array.

reply: kurz, freundlich, auf Deutsch in Du-Form, 1–3 Sätze. Sag, was du geändert hast. Keine Listen mit Uhrzeiten (die sieht man im Plan).`;

const nullable = t => ({ type: [t, 'null'] });
const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['reply', 'actions', 'task_order', 'durations'],
  properties: {
    reply: { type: 'string' },
    actions: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['type', 'title', 'minutes', 'at', 'end', 'after', 'date'],
        properties: {
          type: { type: 'string', enum: ['add_extra', 'remove_extra', 'clear_extras', 'add_fixed', 'add_reminder', 'set_duration', 'replan'] },
          title: nullable('string'), minutes: nullable('integer'), at: nullable('string'),
          end: nullable('string'), after: nullable('string'), date: nullable('string'),
        },
      },
    },
    task_order: { type: 'array', items: { type: 'string' } },
    durations: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['id', 'minutes'], properties: { id: { type: 'string' }, minutes: { type: 'integer' } } },
    },
  },
};

function parseJSON(text) {
  try { return JSON.parse(text); } catch { }
  const m = text.match(/\{[\s\S]*\}/);
  if (m) return JSON.parse(m[0]);
  throw new Error('Antwort war kein JSON');
}

async function run(context, message, settings) {
  if (!sdk) sdk = (await import(SDK_URL)).default;
  const client = new sdk({ apiKey: settings.apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
  const base = {
    model: settings.model || 'claude-opus-5-5',
    max_tokens: 16000,
    system: SYSTEM,
    messages: [{ role: 'user', content: `Tagesdaten:\n${JSON.stringify(context, null, 1)}\n\nNachricht: ${message}` }],
    output_config: { effort: settings.aiEffort || 'low', format: { type: 'json_schema', schema: SCHEMA } },
  };
  let res;
  try {
    // Serverseitiger Fallback, falls ein Modell ablehnt
    res = await client.beta.messages.create({ ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
  } catch (e) {
    if (e instanceof sdk.AuthenticationError) throw new Error('API-Schlüssel ungültig');
    if (e instanceof sdk.RateLimitError) throw new Error('zu viele Anfragen, kurz warten');
    if (e instanceof sdk.BadRequestError) {
      // z. B. wenn das gewählte Modell Fallbacks nicht unterstützt
      res = await client.messages.create(base);
    } else throw e;
  }
  if (res.stop_reason === 'refusal') throw new Error('Anfrage wurde abgelehnt');
  const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const out = parseJSON(text);
  out.actions = (out.actions || []).map(a => Object.fromEntries(Object.entries(a).filter(([, v]) => v !== null)));
  return out;
}

window.TagwerkAI = { run };
// App neu zeichnen, damit der Knopf "Mit KI planen" erscheint, sobald dieses Modul geladen ist
window.Tagwerk?.render();
