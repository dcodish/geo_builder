#!/usr/bin/env node
// #2817 — builds the RULINGS INBOX documents (scripts/ruling-inbox/inbox.html) from the repo's own records.
// The session writes the output to the page's database with ONE ArtifactData batch (items/<id>, meta/status);
// the page writes only answers/<id>. Nothing here talks to the network.
//
//   node scripts/ruling-inbox/build-items.mjs --out <dir>
//        [--audits]                         every pending spot audit (scripts/playsheets/spot-audits.json)
//        [--play <sheet.json> ...]          the 🎮 cases of a play sheet
//        [--decisions <decisions.json>]     decision dossiers ({items:[…]}, the decision-dossier agent's shape)
//        [--assets <map.json>]              {"<screenshot basename>": "/_blob/<id>"} from the asset upload
//        [--shots <dir>]                    where the screenshots were captured (matched by "<sheet>_<id>-" or "<id>-")
//        [--server-base https://themathbible.com]   tests point at prod when their change is deployed
//        [--meta <json>]                    meta/status fields to write (round, state, startedAt, wave, lastDeploy, note)
//
// Writes <out>/items/<id>.json per item, <out>/meta/status.json, and <out>/batch.json: the `writes` array for
// ArtifactData batch (file_path entries; add if_version for documents that already exist).
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const args = (k) => argv.flatMap((a, i) => (a === k ? [argv[i + 1]] : []));
const out = arg('--out');
if (!out) { console.error('usage: --out <dir> [--audits] [--play sheet.json] [--decisions file] [--assets map.json] [--shots dir]'); process.exit(2); }

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const assets = arg('--assets') ? readJson(arg('--assets')) : {};
const shotsDir = arg('--shots');
const serverBase = arg('--server-base') || 'https://themathbible.com';
const PROD_PATH = { '2d': '/geo-builder/', '3d': '/3d-builder/', analytic: '/analytic-builder/', complex: '/complex-builder/' };
const BUILDER = { '2d': 'Plane geometry (2-D)', '3d': 'Space geometry (3-D)', analytic: 'Analytic geometry', complex: 'Complex numbers' };
const now = new Date().toISOString();

function shotsFor(sheet, id) {
  if (!shotsDir || !fs.existsSync(shotsDir)) return [];
  const pre = [`${sheet}_${id}-`.replace(/[^A-Za-z0-9_.-]/g, '-'), `${id}-`];
  return fs.readdirSync(shotsDir).filter((f) => f.endsWith('.png') && pre.some((p) => f.startsWith(p))).sort()
    .map((f) => {
      const url = assets[f];
      if (!url) throw new Error(`screenshot ${f} has no uploaded asset url in --assets`);
      const step = f.replace(/\.png$/, '').split('-').slice(-2).join(' ');
      const caption = /built/.test(f) ? 'After the lines' : /refused/.test(f) ? 'A line was refused here' : /config/.test(f) ? 'After «הציגו תצורה אחרת»' : step;
      return { url, caption };
    });
}

function afterSteps(c) {
  const steps = [];
  for (const a of c.after || []) {
    if (a.toggle) steps.push(`Untick the row «${a.toggle}» in the givens list.`);
    else if (a.type) steps.push(`Type «${a.type}».`);
    else if (a.click) steps.push(`Press «${a.click}».`);
    else if (a.clickOn) steps.push(a.say || `Click ${a.clickOn}.`);
    else if (a.typeInto) steps.push(`Type «${a.text}» into the box.`);
  }
  if (c.cycles) steps.push(`Press «הציגו תצורה אחרת» ${c.cycles === 1 ? 'once' : c.cycles + ' times'}, checking each drawing.`);
  for (const q of c.asks || []) steps.push(`In the question box ask «${q}».`);
  return steps;
}

function testItem(sheet, c, testClass, extra = {}) {
  const product = c.product;
  const deployed = extra.deployed !== false;
  const server = deployed ? serverBase + PROD_PATH[product] : (c.base || 'http://localhost:5173') + (c.path || '/');
  return {
    kind: 'test', testClass, status: 'open',
    title: c.title.replace(/\s*\[round T\d+\]$/, ''),
    product, round: (sheet.match(/(\d{4})/) || [])[1] || null,
    server, serverNote: deployed ? `Live site (${BUILDER[product]}). Works from your phone.` : 'The home PC\'s local server: reachable only on that PC.',
    start: 'A fresh page: reload, or type «נקה הכל» first.',
    lines: c.lines || [], after: afterSteps(c), lookFor: c.lookFor || '', before: c.before || '',
    shots: shotsFor(sheet, c.id),
    source: { sheet, case: c.id },
    created: extra.created || now.slice(0, 10), updated: now,
    ...extra.fields,
  };
}

const items = {};
let rank = 1;

for (const sheetPath of args('--play')) {
  const sheet = readJson(sheetPath);
  for (const c of sheet.cases.filter((x) => x.class === 'play')) {
    const id = `t-${sheet.name}-${c.id}`.replace(/[^A-Za-z0-9_-]/g, '-');
    items[id] = testItem(sheet.name, c, 'play', { deployed: false, fields: { rank: rank++, why: c.why || 'This case needs your judgment: no screenshot or automatic check can settle it (ADR-W-201).' } });
  }
}

if (argv.includes('--audits')) {
  const sa = readJson(path.join(ROOT, 'scripts/playsheets/spot-audits.json'));
  for (const p of sa.pending) {
    const spec = readJson(path.join(ROOT, 'scripts/playsheets', p.sheet + '.json')).cases.find((x) => x.id === p.id);
    if (!spec) throw new Error(`spot audit ${p.sheet}:${p.id} has no case in its sheet`);
    const id = `t-${p.sheet}-${p.id}`.replace(/[^A-Za-z0-9_-]/g, '-');
    const how = String(p.kind || '').split(':')[1] || 'assertion';
    items[id] = testItem(p.sheet, spec, 'audit', {
      created: p.queued,
      fields: {
        rank: 100 + rank++,
        why: `A spot check: about one closed case in ten comes to you, so closing cases without you stays honest. The session closed this one ${how === 'assertion' ? 'on an automatic check' : 'on a blind screenshot review'} (${p.sheet}, queued ${p.queued}). A fail demotes that kind of closing until three clean checks.`,
        audit: `${p.sheet}:${p.id}`,
      },
    });
  }
}

if (arg('--decisions')) {
  const d = readJson(arg('--decisions'));
  for (const it of d.items) {
    for (const k of ['id', 'issue', 'title', 'options', 'recommended']) if (it[k] == null) throw new Error(`decision ${it.id || '?'} lacks ${k}`);
    if (!it.options.some((o) => o.key === it.recommended)) throw new Error(`decision ${it.id}: recommended "${it.recommended}" is not an option`);
    const { id, ...rest } = it;
    items[id] = { ...rest, kind: 'decision', status: 'open', created: it.created || now.slice(0, 10), updated: now };
  }
}

fs.mkdirSync(path.join(out, 'items'), { recursive: true });
const writes = [];
for (const [id, doc] of Object.entries(items)) {
  const f = path.join(out, 'items', id + '.json');
  fs.writeFileSync(f, JSON.stringify(doc, null, 1));
  writes.push({ op: 'set', collection: 'items', doc_id: id, file_path: path.resolve(f) });
}
if (arg('--meta')) {
  fs.mkdirSync(path.join(out, 'meta'), { recursive: true });
  const f = path.join(out, 'meta', 'status.json');
  fs.writeFileSync(f, JSON.stringify({ playLimit: 10, hoursLimit: 24, ...JSON.parse(arg('--meta')), lastSync: now }, null, 1));
  writes.push({ op: 'set', collection: 'meta', doc_id: 'status', file_path: path.resolve(f) });
}
fs.writeFileSync(path.join(out, 'batch.json'), JSON.stringify(writes, null, 1));
const n = (k, c) => Object.values(items).filter((i) => i.kind === k && (!c || i.testClass === c)).length;
console.log(`${Object.keys(items).length} items: ${n('decision')} decisions, ${n('test', 'play')} 🎮, ${n('test', 'audit')} spot checks → ${out}/batch.json (${writes.length} writes)`);
