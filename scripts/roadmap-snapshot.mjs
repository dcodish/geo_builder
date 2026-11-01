/**
 * roadmap-snapshot — the roadmap overview page's numbers, computed from GitHub (#2557, ADR-W-159).
 *
 * The page (https://claude.ai/artifact/2RxjAuuDfhvG5kcNAFw7Ew) reads its own database; it cannot reach
 * GitHub. A session refreshes it with the roadmap-refresh skill: it saves the db doc `plan/current` to a
 * file, runs this script, and writes the two outputs back.
 *
 * Usage: node scripts/roadmap-snapshot.mjs <plan.json> <out-dir>   (needs `gh` authenticated)
 * Reads GitHub through the REST API only (`gh api`): cloud routines refuse GraphQL, which `gh issue list/view` use.
 * Writes <out-dir>/issues.json (db doc state/issues), <out-dir>/snapshot.json (db doc snapshots/<date>) and
 * <out-dir>/history.json (db doc history/open: the open count per day since the first issue, #2652).
 * `issues.json` also carries `outside`: the open P1/P2 issues in a Now or Next tool that no workstream
 * names and nobody has pulled into a week (ADR-W-165). The page offers each one a pull into this week.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const [planPath, outDir] = process.argv.slice(2);
const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const repo = 'dcodish/geo_builder';
const gh = (args) => execFileSync('gh', ['api', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const labelsOf = (i) => i.labels.map((l) => ({ name: l.name }));

const today = new Date().toISOString().slice(0, 10);
const weekOf = (d) => { const i = plan.weeks.filter((w) => w.from <= d).length; return d > plan.end ? 6 : i; };

// Every issue, open and closed (open ones for the phase counts, all of them for the history), plus each
// plan issue's own state.
// The REST issues list includes pull requests; they are dropped, as `gh issue list` did. Pages are
// requested by number, never with `--paginate`: its next-page links use `repositories/{id}/...`
// paths, which the cloud proxy refuses (HTTP 403, dry run 2026-10-27).
const every = [];
for (let page = 1; ; page++) {
  const rows = JSON.parse(gh([`repos/${repo}/issues?state=all&per_page=100&page=${page}`]));
  for (const i of rows) if (!i.pull_request) every.push({ number: i.number, title: i.title, labels: labelsOf(i), created: i.created_at.slice(0, 10), closed: i.state === 'closed' ? (i.closed_at || '').slice(0, 10) || null : null });
  if (rows.length < 100) break;
}
const open = every.filter((i) => !i.closed);
const ids = [...new Set(plan.workstreams.flatMap((w) => w.issues))];
const issues = {};
for (const n of ids) {
  const i = JSON.parse(gh([`repos/${repo}/issues/${n}`]));
  issues[n] = { t: i.title, s: i.state.toUpperCase(), l: i.labels.map((l) => l.name), closedAt: i.closed_at || null };
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
// Only the hyperbola is Later: the ellipse and the parabola are taught this term (ADR-W-166, 2026-10-30).
const conic = /hyperbol|היפרבול/i;
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

// Outside the plan (ADR-W-165): P1/P2, open, in the Now or Next phase, named by no workstream and not
// already pulled into a week. Sorted with the severity marks first, then newest.
const inPlan = new Set([...ids, ...(plan.pulled || []).map((p) => p.issue)]);
const outside = open
  .filter((i) => !inPlan.has(i.number) && ['now', 'next'].includes(phaseOf(i)))
  .map((i) => ({ n: i.number, t: i.title, l: i.labels.map((x) => x.name), created: i.created }))
  .filter((i) => i.l.includes('P1') || i.l.includes('P2'))
  .sort((a, b) => {
    const w = (i) => (i.l.includes('P1') ? 4 : 0) + (i.l.includes('wrong-answer') ? 2 : 0) + (i.l.includes('reported') ? 1 : 0);
    return w(b) - w(a) || b.created.localeCompare(a.created);
  });
for (const p of plan.pulled || []) if (!issues[p.issue]) {
  const i = JSON.parse(gh([`repos/${repo}/issues/${p.issue}`]));
  issues[p.issue] = { t: i.title, s: i.state.toUpperCase(), l: i.labels.map((l) => l.name), closedAt: i.closed_at || null };
}

// Open issues over time (#2652): the count still open at the end of each day since the first issue, for the
// whole system and per group, plus opened and closed per week (weeks start Monday, as the plan's do). An issue
// counts under the tool labels it carries today and by its last close; with two tool labels it counts under each.
const GROUPS = { '2d': ['2d'], '3d': ['3d'], analytic: ['analytic'], complex: ['complex'], infra: ['server', 'workspace'] };
const groupsOf = (i) => { const l = i.labels.map((x) => x.name); return Object.keys(GROUPS).filter((g) => GROUPS[g].some((t) => l.includes(t))); };
const addDays = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const monday = (d) => addDays(d, -((new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7));
const first = every.reduce((m, i) => (i.created < m ? i.created : m), today);
const days = []; for (let d = first; d <= today; d = addDays(d, 1)) days.push(d);
const keys = ['all', ...Object.keys(GROUPS)];
const delta = Object.fromEntries(keys.map((k) => [k, new Array(days.length + 1).fill(0)]));
const weeks = new Map();
const week = (d) => { const m = monday(d); if (!weeks.has(m)) weeks.set(m, Object.fromEntries(keys.map((k) => [k, { opened: 0, closed: 0 }]))); return weeks.get(m); };
const dayIndex = (d) => Math.round((Date.parse(d) - Date.parse(first)) / 864e5);
for (const i of every) {
  const ks = ['all', ...groupsOf(i)];
  for (const k of ks) { delta[k][dayIndex(i.created)]++; week(i.created)[k].opened++; }
  if (i.closed) for (const k of ks) { delta[k][dayIndex(i.closed)]--; week(i.closed)[k].closed++; }
}
const openByDay = Object.fromEntries(keys.map((k) => { let run = 0; return [k, days.map((_, n) => (run += delta[k][n]))]; }));
const history = {
  asOf: today, from: first, days, open: openByDay,
  weeks: [...weeks.keys()].sort().map((from) => ({ from, ...weeks.get(from) })),
  unlabelled: every.filter((i) => !groupsOf(i).length).length,
};

mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/history.json`, JSON.stringify(history));
writeFileSync(`${outDir}/issues.json`, JSON.stringify({ asOf: today, issues, outside }, null, 1));
writeFileSync(`${outDir}/snapshot.json`, JSON.stringify({ date: today, week: weekOf(today), openTotal: open.length, phase, byProduct, ws }, null, 1));
console.log(`snapshot ${today} (week ${weekOf(today)}): ${open.length} open, ${ids.length} plan issues, ${outside.length} outside the plan`);
