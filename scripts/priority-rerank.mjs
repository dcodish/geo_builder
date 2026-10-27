/**
 * priority-rerank — propose each open issue's priority under the 2026-10-26 scheme (#2556, ADR-W-160).
 *
 * P1     = `wrong-answer` + `reported` (or prod down) — drop everything.
 * P2     = in the roadmap plan's workstreams; any `wrong-answer` outside a Later phase; a `reported`
 *          visible failure in an active product (the Now and Next phases).
 * P3     = maintenance (2-D), unusual cases found internally, polish and debt.
 * later  = a product or topic whose phase has not started (complex; conics and the sphere). Not ranked.
 *
 * `reported` and `wrong-answer` are read from the issue's own text when the label is absent; the
 * reading is a proposal the operator reviews, never applied unreviewed.
 *
 * Usage: node scripts/priority-rerank.mjs <plan.json> <out.json>   (needs `gh` authenticated)
 * Reads GitHub through REST only, like roadmap-snapshot.mjs, so a cloud session can run it too.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const [planPath, outPath, overlayPath] = process.argv.slice(2);
const plan = JSON.parse(readFileSync(planPath, 'utf8'));
// Optional {"<n>": ["label", …]}: labels proposed but not yet applied, so a re-rank can be previewed.
const overlay = overlayPath ? JSON.parse(readFileSync(overlayPath, 'utf8')) : {};
const repo = 'dcodish/geo_builder';
const gh = (args) => execFileSync('gh', ['api', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const open = [];
for (let page = 1; ; page++) {
  const rows = JSON.parse(gh([`repos/${repo}/issues?state=open&per_page=100&page=${page}`]));
  for (const i of rows) if (!i.pull_request) open.push({ number: i.number, title: i.title, body: i.body || '', labels: [...i.labels.map((l) => l.name), ...(overlay[i.number] || [])] });
  if (rows.length < 100) break;
}

// The phases (roadmap, 2026-10-26). Same rule as roadmap-snapshot.mjs, plus the sphere (#1569).
const conic = /ellips|parabol|hyperbol|אליפס|פרבול|היפרבול|מוקד|מדריך|focus|directrix/i;
const sphere = /sphere|ספיר|כדור|round solid|גוף סיבוב|#1569/i;
const phaseOf = (i) => {
  const l = i.labels;
  if (l.includes('analytic')) return conic.test(i.title) ? 'later' : 'now';
  if (l.includes('3d')) return sphere.test(i.title) ? 'later' : 'next';
  if (l.includes('2d')) return 'maint';
  if (l.includes('complex')) return 'later';
  return 'cross';
};

// Who found it: the opening of the body says so (docs/22 §1 body format).
const head = (i) => i.body.slice(0, 700);
// 'yes' = a person hit it (the operator in class or playing, a teacher, a student in the prod logs);
// 'asked' = the operator ruled on it or requested it without hitting it as a failure; 'no' = a
// session found it. An unclear opening counts as 'no': `reported` needs evidence.
const REPORTED = /operator report|report \(operator|reported by the operator|reported \(round|operator play (note|verdict)|operator(,|'s)? (in class|playing|while playing)|\*\*reported:\*\*[^\n]*(operator|prod|student|teacher|user)|prod(uction)? log|log-triage|students? (typed|hit)|teacher|real user|external review of prod|carried-over live row/i;
const ASKED = /operator('s)? (request|ruling|ruled|decision|design question)|request \(operator|operator ruling|operator, \d{4}-\d{2}-\d{2}|asked by the operator|at the operator's/i;
const INTERNAL = /^[\s#*]*(report[\s(]*)?(found|noticed|port of|measured|follow-up|split|debt split|carved out|successor|sibling|phase \d|slice|track [a-z]|parked arm|filed (by|from|rather)|left open|product questions found|two questions found)/i;
// Rulings that say who hit an issue when its body does not (quote the ruling).
const OVERRIDE = {
  2499: 'yes', // D5, 2026-10-26: "#2499 stays P1, because the operator hit it (play case T30)"
};
const reportedOf = (i) => {
  if (i.labels.includes('reported')) return 'yes';
  if (OVERRIDE[i.number]) return OVERRIDE[i.number];
  if (INTERNAL.test(i.body)) return 'no';
  if (REPORTED.test(head(i))) return 'yes';
  return ASKED.test(head(i)) ? 'asked' : 'no';
};

// A wrong answer: a wrong figure shown as correct, a dropped given, lost work (#2556).
const WRONG = /wrong (figure|answer|value|length|angle|point|side|drawing|radius|centre|center|position)|silently (drop|ignor|misread|discard|lose|loses|lost)|dropped given|given (is )?(silently )?dropped|false[^\n]{0,20}contradict|shown as (correct|green)|drawn green|green (✓ )?for givens|cannot hold|lost work|data loss|misread[s]? |honesty/i;
// Only the label counts. A keyword hit is a 'candidate' for a person to judge: the words also match
// false refusals, which are visible failures, not wrong answers.
const wrongOf = (i) => {
  if (i.labels.includes('wrong-answer')) return 'yes';
  if (!i.labels.includes('bug')) return 'no';
  return WRONG.test(i.title + '\n' + i.body.slice(0, 2500)) ? 'candidate' : 'no';
};

const inPlan = new Set(plan.workstreams.flatMap((w) => w.issues));
const prioOf = (l) => ['P1', 'P2', 'P3', 'later'].find((p) => l.includes(p)) || 'none';

const rows = open.map((i) => {
  const phase = phaseOf(i); const reported = reportedOf(i); const wrong = wrongOf(i);
  const type = ['bug', 'feature', 'debt'].find((t) => i.labels.includes(t)) || 'other';
  const now = prioOf(i.labels);
  const isWrong = wrong === 'yes'; const isRep = reported === 'yes';
  const active = phase === 'now' || phase === 'next';
  let to; let why;
  if (phase === 'later') { to = 'later'; why = isWrong ? 'later-phase wrong answer (ruling needed)' : 'phase not started'; }
  else if (phase === 'cross') { to = now === 'P1' && !(isWrong && isRep) ? 'P2' : now; why = 'workspace/server: unchanged'; }
  else if (isWrong && isRep) { to = 'P1'; why = 'wrong answer a person hit'; }
  else if (inPlan.has(i.number)) { to = 'P2'; why = 'in the roadmap plan'; }
  else if (isWrong) { to = 'P2'; why = 'wrong answer found internally'; }
  else if (isRep && active && type !== 'debt') { to = 'P2'; why = 'reported, active product'; }
  else if (reported === 'asked' && active) { to = now === 'none' ? 'P3' : now; why = 'operator asked, active product: unchanged'; }
  else if (type === 'debt' && now === 'P2' && active) { to = 'P2'; why = 'debt blocking scheduled work: unchanged'; }
  else { to = 'P3'; why = phase === 'maint' ? '2-D maintenance' : 'found internally'; }
  return { n: i.number, t: i.title, type, phase, reported, wrong, inPlan: inPlan.has(i.number), from: now, to, why, labels: i.labels };
});

writeFileSync(outPath, JSON.stringify(rows, null, 1));
const tally = {};
for (const r of rows) { const k = `${r.from}→${r.to}`; tally[k] = (tally[k] || 0) + 1; }
console.log(`${rows.length} open`, tally);
