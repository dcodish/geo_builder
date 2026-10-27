/**
 * roadmap-snapshot — the roadmap overview page's numbers, computed from GitHub (#2557, ADR-W-159).
 *
 * The page (https://claude.ai/artifact/2RxjAuuDfhvG5kcNAFw7Ew) reads its own database; it cannot reach
 * GitHub. A session refreshes it with the roadmap-refresh skill: it saves the db doc `plan/current` to a
 * file, runs this script, and writes the two outputs back.
 *
 * Usage: node scripts/roadmap-snapshot.mjs <plan.json> <out-dir>   (needs `gh` authenticated)
 * Writes <out-dir>/issues.json (db doc state/issues) and <out-dir>/snapshot.json (db doc snapshots/<date>).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const [planPath, outDir] = process.argv.slice(2);
const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const repo = 'dcodish/geo_builder';
const gh = (args) => JSON.parse(execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));

const today = new Date().toISOString().slice(0, 10);
const weekOf = (d) => { const i = plan.weeks.filter((w) => w.from <= d).length; return d > plan.end ? 6 : i; };

// Every open issue (for phase counts) plus each plan issue's own state (closed ones too).
const open = gh(['issue', 'list', '--repo', repo, '--state', 'open', '--limit', '2000', '--json', 'number,title,labels']);
const ids = [...new Set(plan.workstreams.flatMap((w) => w.issues))];
const issues = {};
for (const n of ids) {
  const i = gh(['issue', 'view', String(n), '--repo', repo, '--json', 'number,title,state,labels,closedAt']);
  issues[n] = { t: i.title, s: i.state, l: i.labels.map((l) => l.name), closedAt: i.closedAt || null };
}

const kind = (l) => (l.includes('bug') ? 'bug' : l.includes('feature') ? 'feature' : l.includes('debt') ? 'debt' : 'other');
const ws = {};
for (const w of plan.workstreams) {
  const c = { bugOpen: 0, bugClosed: 0, featureOpen: 0, featureClosed: 0, otherOpen: 0, otherClosed: 0, needsYou: 0 };
  for (const n of w.issues) {
    const i = issues[n]; const k = kind(i.l) === 'debt' ? 'other' : kind(i.l);
    c[k + (i.s === 'OPEN' ? 'Open' : 'Closed')]++;
    if (i.s === 'OPEN' && i.l.includes('needs-operator')) c.needsYou++;
  }
  ws[w.id] = c;
}

// The whole queue by teaching phase (same rule as the roadmap map: most urgent phase wins).
const conic = /ellips|parabol|hyperbol|אליפס|פרבול|היפרבול|מוקד|מדריך|focus|directrix/i;
const phaseOf = (i) => {
  const l = i.labels.map((x) => x.name);
  if (l.includes('analytic') && !conic.test(i.title)) return 'now';
  if (l.includes('3d')) return 'next';
  if (l.includes('analytic')) return 'later';
  if (l.includes('2d')) return 'maint';
  if (l.includes('complex')) return 'later';
  return 'cross';
};
const phase = {};
for (const i of open) {
  const p = phaseOf(i); const k = kind(i.labels.map((x) => x.name));
  phase[p] = phase[p] || { bug: 0, feature: 0, debt: 0, other: 0, total: 0 };
  phase[p][k]++; phase[p].total++;
}

// The whole queue by tool × priority × type. An issue with several tool labels counts under each of them.
const TOOLS = ['analytic', '3d', '2d', 'complex', 'workspace', 'server'];
const byProduct = {};
for (const i of open) {
  const l = i.labels.map((x) => x.name);
  const pr = ['P1', 'P2', 'P3'].find((p) => l.includes(p)) || 'none';
  for (const t of TOOLS.filter((t) => l.includes(t))) {
    const c = (byProduct[t] = byProduct[t] || { P1: 0, P2: 0, P3: 0, none: 0, bug: 0, feature: 0, debt: 0, other: 0, total: 0, needsYou: 0 });
    c[pr]++; c[kind(l)]++; c.total++; if (l.includes('needs-operator')) c.needsYou++;
  }
}

mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/issues.json`, JSON.stringify({ asOf: today, issues }, null, 1));
writeFileSync(`${outDir}/snapshot.json`, JSON.stringify({ date: today, week: weekOf(today), openTotal: open.length, phase, byProduct, ws }, null, 1));
console.log(`snapshot ${today} (week ${weekOf(today)}): ${open.length} open, ${ids.length} plan issues`);
