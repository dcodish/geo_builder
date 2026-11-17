// Builds page.html around geo-bug-life.bpmn (promo video #2887): bpmn-js from the pinned unpkg build,
// its stylesheets inlined (the artifact host allows scripts from unpkg, not stylesheets).
// Run: node gen.mjs && node build.mjs   ·   look: node shot.cjs overview,triage,fix-item,ship,judge,review,conversations
import { readFileSync, writeFileSync } from 'node:fs';
const here = (p) => new URL(p, import.meta.url);
const xml = readFileSync(here('./geo-bug-life.bpmn'), 'utf8');
const BPMN_JS = 'https://unpkg.com/bpmn-js@18.31.1/dist';
const grab = async (p) => { const r = await fetch(`${BPMN_JS}/${p}`); if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.text(); };
const css = (await grab('assets/diagram-js.css')) + '\n' + (await grab('assets/bpmn-js.css'));

// ---------------- choreography (hand-drawn BPMN 2.0 choreography notation) ----------------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function wrap(text, max) {
  const words = text.split(' '); const lines = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > max) { lines.push(cur.trim()); cur = w; } else cur += ' ' + w; }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}
function textLines(x, y, text, max, size = 12, weight = 400) {
  const ls = wrap(text, max); const lh = size + 3; const y0 = y - ((ls.length - 1) * lh) / 2;
  return ls.map((l, i) => `<text x="${x}" y="${y0 + i * lh}" font-size="${size}" font-weight="${weight}" text-anchor="middle" dominant-baseline="middle">${esc(l)}</text>`).join('');
}
// choreography task: x,y top-left; w=170 h=120; bands 26
function chorTask(x, y, init, name, resp, { mi = false, req = '', res = '' } = {}) {
  const w = 170, h = 124, bh = 26;
  let s = `<g>`;
  s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#fff" stroke="#22242a" stroke-width="1.6"/>`;
  s += `<path d="M${x} ${y + bh} H${x + w}" stroke="#22242a" stroke-width="1.2"/>`;
  s += `<path d="M${x} ${y + h - bh} H${x + w} V${y + h - 10} a10 10 0 0 1 -10 10 H${x + 10} a10 10 0 0 1 -10 -10 Z" fill="#d9dce3" stroke="#22242a" stroke-width="1.2"/>`;
  s += textLines(x + w / 2, y + bh / 2 + 1, init, 26, 11.5, 600);
  s += textLines(x + w / 2, y + h - bh / 2, resp, 26, 11.5, 600);
  s += textLines(x + w / 2, y + h / 2 - (mi ? 6 : 0), name, 22, 12.5);
  if (mi) for (let i = -1; i <= 1; i++) s += `<rect x="${x + w / 2 + i * 6 - 1.5}" y="${y + h - bh - 18}" width="3" height="12" fill="#22242a"/>`;
  // request envelope (above, white) and response envelope (below, shaded)
  const env = (cx, cy, fill) => `<g><rect x="${cx - 14}" y="${cy - 9}" width="28" height="18" fill="${fill}" stroke="#22242a" stroke-width="1.2"/><path d="M${cx - 14} ${cy - 9} L${cx} ${cy + 1} L${cx + 14} ${cy - 9}" fill="none" stroke="#22242a" stroke-width="1.2"/></g>`;
  if (req) { s += `<path d="M${x + w / 2} ${y} V${y - 22}" stroke="#22242a" stroke-dasharray="2 3"/>` + env(x + w / 2, y - 32, '#fff') + `<text x="${x + w / 2 + 20}" y="${y - 30}" font-size="11" fill="#3d4250">${esc(req)}</text>`; }
  if (res) { s += `<path d="M${x + w / 2} ${y + h} V${y + h + 22}" stroke="#22242a" stroke-dasharray="2 3"/>` + env(x + w / 2, y + h + 32, '#d9dce3') + `<text x="${x + w / 2 + 20}" y="${y + h + 35}" font-size="11" fill="#3d4250">${esc(res)}</text>`; }
  return s + `</g>`;
}
const circle = (cx, cy, end) => `<circle cx="${cx}" cy="${cy}" r="17" fill="#fff" stroke="#22242a" stroke-width="${end ? 4 : 1.6}"/>`;
const gw = (cx, cy, label) => `<path d="M${cx} ${cy - 25} L${cx + 25} ${cy} L${cx} ${cy + 25} L${cx - 25} ${cy} Z" fill="#fff" stroke="#22242a" stroke-width="1.6"/><path d="M${cx - 8} ${cy - 8} L${cx + 8} ${cy + 8} M${cx + 8} ${cy - 8} L${cx - 8} ${cy + 8}" stroke="#22242a" stroke-width="3"/>` + (label ? `<text x="${cx}" y="${cy - 34}" font-size="11.5" text-anchor="middle">${esc(label)}</text>` : '');
const arrow = (pts, label, lx, ly) => `<path d="M${pts.map((p) => p.join(' ')).join(' L')}" fill="none" stroke="#22242a" stroke-width="1.4" marker-end="url(#arr)"/>` + (label ? `<text x="${lx}" y="${ly}" font-size="11">${esc(label)}</text>` : '');
const title = (x, y, t) => `<text x="${x}" y="${y}" font-size="15" font-weight="700">${esc(t)}</text>`;

function choreography() {
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 760" font-family="Arial, sans-serif" fill="#22242a" role="img" aria-label="Choreography diagrams of the agents' conversations">`;
  s += `<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#22242a"/></marker></defs>`;
  // 1 — the judge exchange
  s += title(30, 34, 'A product question: triage, the judge, and (only if needed) the operator');
  const y1 = 110;
  s += circle(60, y1 + 62);
  s += arrow([[77, y1 + 62], [130, y1 + 62]]);
  s += chorTask(130, y1, 'Triage session', 'Rule on the question', 'Judge agent', { req: 'question, no recommendation', res: 'verdict + quoted ruling, or escalation' });
  s += arrow([[300, y1 + 62], [400, y1 + 62]]);
  s += gw(425, y1 + 62, 'Ruled?');
  s += arrow([[450, y1 + 62], [560, y1 + 62]], 'ruled [judged]', 462, y1 + 54);
  s += circle(577, y1 + 62, true);
  s += arrow([[425, y1 + 87], [425, y1 + 250], [640, y1 + 250]], 'escalated', 432, y1 + 120);
  s += chorTask(640, y1 + 188, 'Triage session', 'Rule on the question', 'Operator', { req: 'question (needs-operator)', res: 'ruling' });
  s += arrow([[810, y1 + 250], [900, y1 + 250]]);
  s += circle(917, y1 + 250, true);
  // 2 — a round
  const y2 = 520;
  s += title(30, y2 - 70, "A fix round: the orchestrator's conversations");
  s += circle(40, y2 + 62);
  s += arrow([[57, y2 + 62], [80, y2 + 62]]);
  s += chorTask(80, y2, 'Operator', 'Start a fix round', 'Orchestrator', { req: 'start round' });
  s += arrow([[250, y2 + 62], [280, y2 + 62]]);
  s += chorTask(280, y2, 'Orchestrator', 'Fix item', 'Fixer agent', { mi: true, req: 'item + plan', res: 'green, or escalation' });
  s += arrow([[450, y2 + 62], [480, y2 + 62]]);
  s += chorTask(480, y2, 'Orchestrator', 'Review the 👁 cases', 'Blind reviewer', { req: 'lines, look-for, screenshot', res: 'pass / fail per case' });
  s += arrow([[650, y2 + 62], [680, y2 + 62]]);
  s += chorTask(680, y2, 'Orchestrator', 'Deploy a wave', 'Production server', { req: 'prod/… tag', res: 'smoke-test result' });
  s += arrow([[850, y2 + 62], [930, y2 + 62]]);
  s += gw(955, y2 + 62, 'Any 🎮 case?');
  s += arrow([[980, y2 + 62], [1050, y2 + 62]], 'yes', 992, y2 + 54);
  s += chorTask(1050, y2, 'Orchestrator', 'Play the batch', 'Operator', { req: 'play sheet + spot audits', res: 'approval, or a bug report' });
  s += arrow([[1220, y2 + 62], [1290, y2 + 62]]);
  s += circle(1307, y2 + 62, true);
  s += arrow([[955, y2 + 87], [955, y2 + 200], [1290, y2 + 200]], 'no — closes itself', 965, y2 + 192);
  s += circle(1307, y2 + 200, true);
  return s + `</svg>`;
}

// ---------------- page ----------------
const VIEWS = [
  { id: 'overview', label: 'Overview', diagram: 'Diagram_Overview',
    lead: 'Five participants. The three system pools are split by what one instance is: a bug, a scan, a round. The agents are lanes inside them.',
    notes: ['A bug enters through one message start event, fed by four senders: your report, a scan\'s bug cluster, a bug a fixer found, and anything wrong in the batch you play.',
      'The judge is a call activity: triage calls it and waits for the verdict. Only an escalation reaches you.',
      'After arming, the bug waits at an event-based gateway: the round either lands the fix or returns the item.',
      'Fix item is a parallel multi-instance sub-process, one fixer per issue. Its escalation boundary event is non-interrupting, so one failed plan does not stop the others.',
      'The round ends without you when no case needs your hands (no 🎮); otherwise you get the play sheet.'],
    chips: ['Message, timer and conditional start events', 'Call activity', 'Event-based gateway', 'Parallel multi-instance', 'Escalation boundary (non-interrupting)', 'Loop sub-process', 'Data store', 'Group'] },
  { id: 'triage', label: 'Triage', root: 'b_sp',
    lead: 'Inside «Triage the report»: dedupe first, then file, diagnose and plan.',
    notes: ['A report that fits an open issue becomes a comment on it, never a second issue.', 'A "bug" that turns out to be a missing capability is relabelled a feature and leaves this process for the PR route.', 'The plan ends with «What the student will see», one tagged line per change.'],
    chips: ['Exclusive gateways', 'Data associations', 'Text annotation'] },
  { id: 'fix-item', label: 'Fix item', root: 'r_mi',
    lead: 'One instance per issue, in parallel, each in its own worktree.',
    notes: ['The plan is re-measured against today\'s code first. If it no longer holds, the item ends in an escalation end event, which the round catches.', 'A red case, or a bug with the same cause, loops back to the fix. A bug with another cause is reported as a new bug.', 'Pre-play happens here, so the operator never receives a red sheet.'],
    chips: ['Escalation end event', 'Loops through a merge gateway', 'Send task'] },
  { id: 'ship', label: 'Ship a wave', root: 'r_sp',
    lead: 'A loop sub-process: a round ships several waves.',
    notes: ['The full suite runs once on the staging tip. If it is red, the breaking item is bisected out and the suite runs again.', 'Deploy and smoke test are the two message flows to the production server on the overview.'],
    chips: ['Send task / receive task', 'Loop marker (on the overview)'] },
  { id: 'judge', label: 'Judge', diagram: 'Diagram_Judge',
    lead: 'The process the call activity «Rule on the question» calls.',
    notes: ['It never sees the session\'s recommendation.', 'It rules only from the operator\'s own dated words, quoting them. Everything else escalates.'],
    chips: ['Called process', 'Text annotation'] },
  { id: 'review', label: 'Blind review', diagram: 'Diagram_Review',
    lead: 'The process the call activity «Blind-review the 👁 cases» calls.',
    notes: ['This is what lets 👁 cases close without the operator. ✅ cases close on an automatic check and need no reviewer.', 'Spot audits keep it honest: a failed audit demotes that kind of case back to the operator.'],
    chips: ['Called process'] },
  { id: 'conversations', label: 'Conversations', svg: true,
    lead: 'Choreography diagrams: the same system, drawn as who says what to whom.',
    notes: ['Each rounded box is one exchange. The top band starts it; the shaded band answers.', 'The white envelope is the request, the shaded one the reply.', 'The three bars on «Fix item» mean many fixers at once.'],
    chips: ['Choreography task', 'Initiating / non-initiating band', 'Multi-instance choreography'] },
];

function page(scriptTag) {
  return `<title>Geo Builder Bug Lifecycle</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
${css}
/* Layout: a spec-sheet page; one white diagram "sheet" carries the drawing, the notes sit under it. */
:root {
  --bg: #eef0f4; --surface: #ffffff; --ink: #1d2230; --muted: #5a6275; --line: #cfd4de;
  --accent: #1f4f9a; --accent-soft: #e3eaf7; --sheet: #ffffff; --sheet-ink: #22242a;
  --font-body: "IBM Plex Sans", "Segoe UI", system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, "Cascadia Mono", Consolas, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #12151c; --surface: #1a1f29; --ink: #e5e8ef; --muted: #9aa3b5; --line: #2e3544;
  --accent: #8fb3f0; --accent-soft: #1f2a40; color-scheme: dark; } }
:root[data-theme="dark"] {
  --bg: #12151c; --surface: #1a1f29; --ink: #e5e8ef; --muted: #9aa3b5; --line: #2e3544;
  --accent: #8fb3f0; --accent-soft: #1f2a40; color-scheme: dark; }
body { background: var(--bg); color: var(--ink); font-family: var(--font-body); font-size: 15px; line-height: 1.5; }
.wrap { max-width: 1400px; margin: 0 auto; padding-block: 28px 48px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); display: grid; gap: 18px; }
header { display: grid; gap: 6px; }
.eyebrow { font-family: var(--font-mono); font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
h1 { margin: 0; font-size: clamp(24px, 3.2vw, 34px); font-weight: 700; letter-spacing: -.01em; text-wrap: balance; }
.sub { margin: 0; color: var(--muted); max-width: 70ch; }
nav { display: flex; flex-wrap: wrap; gap: 6px; border-bottom: 1px solid var(--line); }
nav button { font: 500 14px var(--font-body); color: var(--muted); background: none; border: 0; border-bottom: 3px solid transparent; padding: 8px 12px 9px; cursor: pointer; }
nav button:hover { color: var(--ink); }
nav button[aria-selected="true"] { color: var(--accent); border-bottom-color: var(--accent); }
nav button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }
.level { font-family: var(--font-mono); font-size: 11px; color: var(--muted); margin-left: 4px; }
.sheet { position: relative; background: var(--sheet); color: var(--sheet-ink); border: 1px solid var(--line); border-radius: 6px; height: min(74vh, 820px); min-height: 380px; overflow: hidden; }
#canvas { position: absolute; inset: 0; }
#chor { position: absolute; inset: 0; overflow: auto; padding: 16px; }
#chor svg { width: 100%; min-width: 980px; height: auto; display: block; }
.tools { position: absolute; right: 10px; top: 10px; display: flex; gap: 6px; z-index: 5; }
.tools button { font: 500 13px var(--font-body); background: #fff; color: #22242a; border: 1px solid #c3c8d2; border-radius: 4px; padding: 4px 10px; cursor: pointer; }
.tools button:focus-visible { outline: 2px solid #1f4f9a; outline-offset: 1px; }
.hint { position: absolute; left: 12px; bottom: 10px; font: 12px var(--font-mono); color: #6b7280; z-index: 5; pointer-events: none; }
.notes { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 24px; }
.notes h2 { font-size: 13px; font-family: var(--font-mono); text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 0 0 8px; font-weight: 500; }
.lead { margin: 0 0 8px; font-weight: 500; }
.notes ul { margin: 0; padding-left: 18px; display: grid; gap: 6px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { font: 12.5px var(--font-mono); background: var(--accent-soft); color: var(--accent); border-radius: 3px; padding: 3px 8px; }
.choices { border-top: 1px solid var(--line); padding-top: 16px; }
.choices ul { margin: 0; padding-left: 18px; display: grid; gap: 6px; max-width: 95ch; }
@media (max-width: 760px) { .notes { grid-template-columns: minmax(0, 1fr); } .hint { display: none; } }
</style>

<div class="wrap">
  <header>
    <div class="eyebrow">BPMN 2.0 · draft 2 · issue #2887</div>
    <h1>A bug's life in Geo Builder, from report to production</h1>
    <p class="sub">The process behind the promo video. Start at the overview, then open each level. Drag to pan, scroll to zoom, and use the arrow on a collapsed sub-process to drill in.</p>
  </header>
  <nav role="tablist" aria-label="Diagram levels" id="tabs"></nav>
  <div class="sheet">
    <div id="canvas"></div>
    <div id="chor" hidden>${choreography()}</div>
    <div class="tools" id="tools"><button type="button" id="fit">Fit</button><button type="button" id="zin" aria-label="Zoom in">+</button><button type="button" id="zout" aria-label="Zoom out">−</button></div>
    <div class="hint" id="hint">drag to pan · ctrl + scroll to zoom</div>
  </div>
  <section class="notes">
    <div><h2>Reading this level</h2><p class="lead" id="lead"></p><ul id="notes"></ul></div>
    <div><h2>Notation on this level</h2><div class="chips" id="chips"></div></div>
  </section>
  <section class="choices">
    <h2 class="eyebrow" style="margin:0 0 8px">Modelling choices</h2>
    <ul>
      <li>One pool per kind of instance, not per agent. A round fixes many bugs and a scan finds many, and one pool cannot hold two instance counts. The three system pools sit in one group, «Geo Builder dev system».</li>
      <li>The operator is a white-box pool: the workflow prescribes his steps (play, rule, start a round, approve).</li>
      <li>The production server is a black box: only the deploy and the smoke-test result cross its border.</li>
      <li>The prod-log scan has a timer start, as the operator is about to schedule it. Today it runs on request.</li>
      <li>Today the scan files its bug clusters itself. The diagram shows them entering the same triage as every other report.</li>
      <li>GitHub Issues is the shared data store; its labels (reported, auto-ok, in-round, awaiting-play) are each bug's state.</li>
    </ul>
  </section>
</div>
${scriptTag}
<script>
const BPMN_XML = ${JSON.stringify(xml)};
const VIEWS = ${JSON.stringify(VIEWS)};
const viewer = new BpmnJS({ container: '#canvas' });
let loaded = null;
const tabs = document.getElementById('tabs');
VIEWS.forEach((v, i) => {
  const b = document.createElement('button');
  b.type = 'button'; b.role = 'tab'; b.id = 'tab-' + v.id; b.dataset.view = v.id;
  b.innerHTML = v.label + (i === 0 ? '<span class="level">L0</span>' : v.svg ? '' : '<span class="level">L1</span>');
  b.addEventListener('click', () => { location.hash = v.id; show(v.id); });
  tabs.appendChild(b);
});
async function ensure(diagramId) {
  if (loaded === diagramId) return;
  if (!loaded) await viewer.importXML(BPMN_XML, diagramId); else await viewer.open(diagramId);
  loaded = diagramId;
}
async function show(id) {
  const v = VIEWS.find((x) => x.id === id) || VIEWS[0];
  for (const b of tabs.children) b.setAttribute('aria-selected', String(b.dataset.view === v.id));
  document.getElementById('lead').textContent = v.lead;
  document.getElementById('notes').innerHTML = v.notes.map((n) => '<li>' + n.replace(/</g, '&lt;') + '</li>').join('');
  document.getElementById('chips').innerHTML = v.chips.map((c) => '<span class="chip">' + c + '</span>').join('');
  const chor = document.getElementById('chor'), canvasEl = document.getElementById('canvas');
  chor.hidden = !v.svg; canvasEl.hidden = !!v.svg;
  document.getElementById('tools').hidden = !!v.svg; document.getElementById('hint').hidden = !!v.svg;
  if (v.svg) return;
  try {
    if (v.root) {
      await ensure('Diagram_Overview');
      const canvas = viewer.get('canvas');
      const root = viewer.get('elementRegistry').get(v.root + '_plane');
      if (root) canvas.setRootElement(root);
    } else {
      await ensure(v.diagram);
      if (v.diagram === 'Diagram_Overview') { const canvas = viewer.get('canvas'); const r = viewer.get('elementRegistry').get('Collaboration_BugLife'); if (r) canvas.setRootElement(r); }
    }
    viewer.get('canvas').zoom('fit-viewport', 'auto');
  } catch (e) { document.getElementById('lead').textContent = 'The diagram could not be drawn: ' + e.message; }
}
document.getElementById('fit').onclick = () => viewer.get('canvas').zoom('fit-viewport', 'auto');
document.getElementById('zin').onclick = () => { const c = viewer.get('canvas'); c.zoom(c.zoom() * 1.25); };
document.getElementById('zout').onclick = () => { const c = viewer.get('canvas'); c.zoom(c.zoom() / 1.25); };
const start = () => show((location.hash || '#overview').slice(1));
window.addEventListener('hashchange', start);
start();
</script>`;
}
const tag = `<script src="${BPMN_JS}/bpmn-navigated-viewer.production.min.js"></script>`;
writeFileSync(here('./page.html'), page(tag));
writeFileSync(here('./preview.html'), `<!doctype html><meta charset="utf-8">` + page(tag));
console.log('page.html', readFileSync(here('./page.html')).length, 'bytes');
