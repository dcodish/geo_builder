/**
 * PRE-PLAYED PLAY SHEETS — the pure half (#1509, ADR-W-092).
 *
 * Operator, 2026-09-28: *"can we do something about my need to test so much? … lets do this
 * mechanism first so i reduce the load of testing from myself."* The play gate covers three jobs
 * and only one needs the operator: "does it build" is already headless, "does it look right"
 * moves to the SESSION (the browser driver in `play-sheet-drive.mjs`), and "is it right for a
 * student" stays the operator's. Every case carries a CLASS saying which job it is:
 *
 *   - `verified` (✅) — mechanically and visually checked by the session; on the sheet for the
 *     record, nothing for the operator to do.
 *   - `look` (👁) — the screenshots are embedded; the operator judges from the image, no typing.
 *   - `play` (🎮) — genuinely needs the operator's hands: new interactions, pedagogy, feel.
 *
 * This module holds everything that needs no browser — spec validation, the bidi-tolerant text
 * matcher, the per-case verdict, and the HTML report — so the locks can hold it without driving
 * one (the `judgeCapture` split in `visual-smoke.mjs`, followed).
 */

/** The classes, in the order the report presents them: the operator's work first. */
export const CASE_CLASSES = ['play', 'look', 'verified'];

export const CLASS_META = {
  play: { icon: '🎮', he: 'לשחק' },
  look: { icon: '👁', he: 'להסתכל' },
  verified: { icon: '✅', he: 'אומת' },
};

/**
 * Strip the characters bidi isolation inserts before matching text.
 *
 * Measured 2026-09-28 on prod: a probe for «משיק לצלע AB» in a page whose fact rows isolate LTR
 * runs (U+2066..U+2069) reported ROW MISSING for a row that was plainly on screen. Every expected-
 * text comparison in this mechanism goes through this strip, so a sheet author writes what the
 * student reads and never the marks the renderer added.
 */
export function stripBidi(s) {
  return String(s ?? '').replace(/[⁦-⁩‎‏؜]/g, '');
}

/** Does `haystack` contain `needle`, ignoring bidi marks and collapsing whitespace? */
export function textIncludes(haystack, needle) {
  const norm = (s) => stripBidi(s).replace(/\s+/g, ' ').trim();
  return norm(haystack).includes(norm(needle));
}

/**
 * Validate one sheet spec. Returns problems as strings — an empty list means drivable.
 *
 * `products` is the driver's descriptor map (which products it can open and ask); injected so
 * this stays pure and the lock can hand it a fake.
 */
export function validateSheet(sheet, products) {
  const problems = [];
  if (!sheet || typeof sheet !== 'object') return ['sheet: not an object'];
  if (!sheet.name || !/^[\w.-]+$/.test(sheet.name)) problems.push('sheet: `name` must be a file-safe token');
  if (!Array.isArray(sheet.cases) || sheet.cases.length === 0) return [...problems, 'sheet: no cases'];
  const ids = new Set();
  for (const c of sheet.cases) {
    const at = `case ${c?.id ?? '(no id)'}`;
    if (!c.id) problems.push(`${at}: missing id`);
    else if (ids.has(c.id)) problems.push(`${at}: duplicate id`);
    ids.add(c.id);
    if (!c.title) problems.push(`${at}: missing title`);
    if (!CASE_CLASSES.includes(c.class)) problems.push(`${at}: class must be one of ${CASE_CLASSES.join('/')}`);
    if (!products[c.product]) problems.push(`${at}: unknown product ${JSON.stringify(c.product)}`);
    if (!c.base || !/^https?:\/\//.test(c.base)) problems.push(`${at}: \`base\` must be the server URL — rule 5 names a server on EVERY case`);
    if (!Array.isArray(c.lines) || c.lines.length === 0) problems.push(`${at}: no utterances`);
    if (!c.lookFor) problems.push(`${at}: missing lookFor — the operator's at-a-glance pass`);
    if (c.asks && products[c.product] && !products[c.product].askHint)
      problems.push(`${at}: asks are not supported for ${c.product} (no ask-box descriptor)`);
    if (c.expectRefusal && c.expect) problems.push(`${at}: expectRefusal and expect are one or the other`);
  }
  return problems;
}

/**
 * The MECHANICAL verdict on one driven case — pure over what the driver measured.
 *
 * `drive` carries: steps [{line, refusals: []}], askSteps [{ask, unread}], bodyText, pageErrors,
 * captureProblems (from judgeCapture, already strings). A refusal case (`expectRefusal`) PASSES
 * exactly when some step was refused with matching text — the easiest thing to leave untested has
 * its polarity flipped on purpose.
 */
export function caseVerdict(spec, drive) {
  const problems = [];
  const refused = drive.steps.flatMap((s) => s.refusals.map((r) => ({ line: s.line, r })));
  if (spec.expectRefusal) {
    if (!refused.some(({ r }) => textIncludes(r, spec.expectRefusal)))
      problems.push(`expected a refusal containing «${spec.expectRefusal}» — none matched (${refused.length} refusal(s) seen)`);
  } else if (refused.length) {
    problems.push(`«${refused[0].line}» was REFUSED — ${refused[0].r}`);
  }
  for (const a of drive.askSteps ?? []) {
    if (a.unread) problems.push(`ask «${a.ask}» was not understood`);
  }
  for (const t of spec.expect ?? []) {
    if (!textIncludes(drive.bodyText, t)) problems.push(`expected text «${t}» is not on the page`);
  }
  for (const t of spec.expectAbsent ?? []) {
    if (textIncludes(drive.bodyText, t)) problems.push(`text «${t}» must NOT be on the page, and is`);
  }
  if (drive.pageErrors?.length) problems.push(`${drive.pageErrors.length} uncaught page error(s) — first: ${drive.pageErrors[0]}`);
  for (const p of drive.captureProblems ?? []) problems.push(p);
  return problems;
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

/**
 * The report page. Self-contained (system fonts, no external loads), RTL Hebrew, both themes.
 * Screenshots are RELATIVE `<img>` references — the driver writes them beside the page, and a
 * publish carries them as files. Cases are grouped by class, the operator's work FIRST, and the
 * 🎮 utterances stay copy-pasteable lines in a code block (the rule-5 contract, kept).
 */
export function renderReport({ sheet, results, generatedAt }) {
  const byClass = new Map(CASE_CLASSES.map((k) => [k, []]));
  for (const c of sheet.cases) byClass.get(c.class).push(c);
  const resultOf = (id) => results.find((r) => r.id === id);
  const failures = results.filter((r) => r.problems.length > 0);

  const caseHtml = (c) => {
    const r = resultOf(c.id);
    const ok = r && r.problems.length === 0;
    const shots = (r?.shots ?? [])
      .map((s) => `<figure><img src="${esc(s.file)}" alt="${esc(s.label)}" loading="lazy"><figcaption>${esc(s.label)}</figcaption></figure>`)
      .join('');
    return `<article class="case ${ok ? 'ok' : 'bad'}" id="${esc(c.id)}">
<h3><span class="badge ${esc(c.class)}">${CLASS_META[c.class].icon} ${CLASS_META[c.class].he}</span> ${esc(c.id)} · ${esc(c.title)}</h3>
<p class="server">שרת: <a href="${esc(c.base)}${esc(c.path ?? '')}" target="_blank" rel="noopener">${esc(c.base)}${esc(c.path ?? '')}</a></p>
<pre class="lines" dir="rtl">${esc([...c.lines, ...(c.asks ?? [])].join('\n'))}</pre>
<p><strong>מה בודקים:</strong> ${esc(c.lookFor)}</p>
${c.before ? `<p class="before"><strong>לפני:</strong> ${esc(c.before)}</p>` : ''}
<p class="verdict">${ok ? '✓ נבדק מכנית וויזואלית על ידי הכלי' : `✗ ${esc(r ? r.problems.join(' · ') : 'לא הורץ')}`}</p>
${shots ? `<div class="shots">${shots}</div>` : ''}
</article>`;
  };

  const section = (cls) => {
    const cases = byClass.get(cls);
    if (cases.length === 0) return '';
    return `<section><h2>${CLASS_META[cls].icon} ${
      cls === 'play' ? 'לשחק — נדרש שיפוט שלך' : cls === 'look' ? 'להסתכל — צילום מסך מספיק' : 'אומת — לתיעוד בלבד'
    } (${cases.length})</h2>${cases.map(caseHtml).join('\n')}</section>`;
  };

  return `<title>${esc(sheet.title ?? sheet.name)}</title>
<style>
:root{--bg:#faf9f7;--card:#ffffff;--ink:#20242e;--muted:#69707d;--line:#e3e0da;--accent:#3d5a80;
--ok:#1a7f42;--bad:#b3382c;--chip-play:#7c3aed;--chip-look:#b45309;--chip-verified:#1a7f42;--code:#f1efe9}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#181a20;--card:#20232c;--ink:#e8e6e1;
--muted:#9aa1ad;--line:#333845;--accent:#8fb3d9;--ok:#4fc47f;--bad:#e0705f;--chip-play:#b79df5;
--chip-look:#e0a353;--chip-verified:#4fc47f;--code:#262a34;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#181a20;--card:#20232c;--ink:#e8e6e1;--muted:#9aa1ad;--line:#333845;
--accent:#8fb3d9;--ok:#4fc47f;--bad:#e0705f;--chip-play:#b79df5;--chip-look:#e0a353;--chip-verified:#4fc47f;
--code:#262a34;color-scheme:dark}
body{background:var(--bg);color:var(--ink);font-family:system-ui,'Segoe UI',sans-serif;
margin:0;padding-block:24px;padding-inline:16px;line-height:1.55}
main{max-width:860px;margin-inline:auto;display:flex;flex-direction:column;gap:28px}
h1{font-size:1.5rem;margin:0;text-wrap:balance}
h2{font-size:1.15rem;border-block-end:1px solid var(--line);padding-block-end:6px;margin:0 0 4px}
.meta{color:var(--muted);font-size:.9rem;margin:0}
.sum{display:flex;gap:10px;flex-wrap:wrap;margin:0;padding:0;list-style:none}
.sum li{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:4px 12px;font-size:.9rem}
.sum .fail{border-color:var(--bad);color:var(--bad);font-weight:600}
section{display:flex;flex-direction:column;gap:16px}
.case{background:var(--card);border:1px solid var(--line);border-inline-start:4px solid var(--line);
border-radius:8px;padding:14px 16px;display:flex;flex-direction:column;gap:8px}
.case.ok{border-inline-start-color:var(--ok)}.case.bad{border-inline-start-color:var(--bad)}
.case h3{margin:0;font-size:1rem}
.badge{font-size:.78rem;border-radius:999px;padding:2px 10px;color:#fff;margin-inline-end:6px;white-space:nowrap}
.badge.play{background:var(--chip-play)}.badge.look{background:var(--chip-look)}.badge.verified{background:var(--chip-verified)}
.server,.before{margin:0;font-size:.9rem;color:var(--muted)}
.server a{color:var(--accent)}
.lines{background:var(--code);border-radius:6px;padding:10px 12px;margin:0;font-size:.95rem;overflow-x:auto}
.case p{margin:0}
.verdict{font-size:.9rem}.case.ok .verdict{color:var(--ok)}.case.bad .verdict{color:var(--bad);font-weight:600}
.shots{display:flex;flex-wrap:wrap;gap:10px}
.shots figure{margin:0;flex:1 1 240px;max-width:100%}
.shots img{width:100%;border:1px solid var(--line);border-radius:6px}
.shots figcaption{font-size:.78rem;color:var(--muted);padding-block-start:2px}
</style>
<main dir="rtl">
<h1>${esc(sheet.title ?? sheet.name)}</h1>
<p class="meta">הופק ${esc(generatedAt)} · כל מקרה הוקלד ונבדק בדפדפן אמיתי לפני שהגיע אליך · ${results.length}/${sheet.cases.length} הורצו</p>
<ul class="sum">
<li>🎮 ${byClass.get('play').length}</li><li>👁 ${byClass.get('look').length}</li><li>✅ ${byClass.get('verified').length}</li>
${failures.length ? `<li class="fail">✗ ${failures.length} מקרים נכשלו מכנית — לא לשחק לפני תיקון</li>` : '<li>כל המקרים עברו את הבדיקה המכנית</li>'}
</ul>
${CASE_CLASSES.map(section).join('\n')}
</main>`;
}
