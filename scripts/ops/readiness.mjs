#!/usr/bin/env node
/**
 * UNIT READINESS — measure each teaching unit's questions and write `ops/readiness.json` (#2868 Addition A,
 * ADR-W-208). The management page reads that file from GitHub; the server cannot run tests.
 *
 *   npm run ops:readiness            (takes the suite lock; ~3 min)
 *   node scripts/ops/readiness.mjs --dry   (prints, writes nothing)
 *
 * The unit map `ops/units.json` lists every question of each unit, transcribed or not. A question's members
 * are the repo's transcriptions of it: a corpus entry (`corpus471`/`corpus572`, measured per question by
 * `measure-corpus.ts`, the ratchets' own reading), a saved fixture (its fixtures net), or a named test.
 *
 *   green    — every member passes
 *   partial  — some member passes, not all (a part of the question, or its printed wording, still fails)
 *   red      — it has members and none passes
 *   untried  — nobody has transcribed it yet: counted, never dropped
 *
 * History: each run appends {date, green per unit} (one entry per day), so the page shows the weekly change.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dry = process.argv.includes('--dry');
const rel = (p) => path.join(ROOT, p);
const units = JSON.parse(readFileSync(rel('ops/units.json'), 'utf8'));

/** The fixtures net a fixture file is replayed by, and the describe title that names it. */
export function fixtureNet(file) {
  const base = path.basename(file);
  if (file.startsWith('src-analytic/')) return { net: 'src-analytic/__tests__/fixtures.test.ts', match: (t) => t.startsWith(`${base.replace(/\.analytic\.json$/, '')} — `) };
  if (file.startsWith('fixtures3/')) return { net: 'src3d/__tests__/fixtures3.test.ts', match: (t) => t === base };
  if (file.startsWith('src-complex/')) return { net: 'src-complex/__tests__/fixtures.test.ts', match: (t) => t === base.replace(/\.complex\.json$/, '') };
  if (file.startsWith('src/')) return { net: 'src/__tests__/fixtures.test.ts', match: (t) => t.includes(base.replace(/\.geo\.json$/, '')) };
  throw new Error(`no fixtures net for ${file}`);
}

/** Pure: a question's state from its members' verdicts. `verdict(m)` → {green, failing?} or null (not measured). */
export function questionState(q, verdict) {
  const members = [q.member, ...(q.otherMembers ?? [])].filter(Boolean);
  if (!members.length) return { status: 'untried' };
  const vs = members.map((m) => ({ m, v: verdict(m) }));
  const missing = vs.filter((x) => !x.v);
  if (missing.length) throw new Error(`${q.id}: member not measured: ${JSON.stringify(missing[0].m)}`);
  const green = vs.filter((x) => x.v.green).length;
  const firstFail = vs.find((x) => !x.v.green);
  const failing = firstFail ? `${firstFail.m.kind === 'fixture' ? path.basename(firstFail.m.file) : firstFail.m.kind === 'test' ? `${path.basename(firstFail.m.file)}${firstFail.m.name ? ` › ${firstFail.m.name}` : ''}` : `${firstFail.m.kind} ${firstFail.m.ref}`}${firstFail.v.failing ? `: ${firstFail.v.failing}` : ''}` : undefined;
  const status = green === vs.length ? 'green' : green > 0 ? 'partial' : 'red';
  return failing ? { status, failing } : { status };
}

/** Pure: fold vitest JSON reports into per-member verdicts. */
export function memberVerdicts(reports, members) {
  const files = reports.flatMap((r) => r.testResults ?? []);
  const norm = (p) => p.replace(/\\/g, '/');
  const out = new Map();
  for (const m of members) {
    if (m.kind === 'fixture') {
      const { net, match } = fixtureNet(m.file);
      const tr = files.find((t) => norm(t.name).endsWith(net));
      if (!tr) continue;
      const as = tr.assertionResults.filter((a) => a.ancestorTitles.some(match));
      if (!as.length) throw new Error(`fixture ${m.file}: no test in ${net} names it`);
      const bad = as.find((a) => a.status === 'failed');
      out.set(JSON.stringify(m), bad ? { green: false, failing: bad.title } : { green: as.every((a) => a.status === 'passed') });
    } else if (m.kind === 'test') {
      const tr = files.find((t) => norm(t.name).endsWith(m.file));
      if (!tr) continue;
      const as = m.name ? tr.assertionResults.filter((a) => [...a.ancestorTitles, a.title].some((t) => t.includes(m.name))) : tr.assertionResults;
      if (!as.length) throw new Error(`test ${m.file} › ${m.name}: no such test`);
      const bad = as.find((a) => a.status === 'failed');
      out.set(JSON.stringify(m), bad ? { green: false, failing: bad.title } : { green: as.every((a) => a.status === 'passed') });
    }
  }
  return out;
}

function main() {
  const questions = units.units.flatMap((u) => u.questions);
  const members = questions.flatMap((q) => [q.member, ...(q.otherMembers ?? [])]).filter(Boolean);
  for (const m of members) if (m.file && !existsSync(rel(m.file))) throw new Error(`member file missing: ${m.file}`);

  // 1. The corpora, per question.
  const corpus = JSON.parse(execFileSync(process.execPath, [rel('node_modules/vite-node/vite-node.mjs'), rel('scripts/ops/measure-corpus.ts')], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] }));

  // 2. The fixture nets and named tests, one vitest run with a JSON report.
  const runFiles = [...new Set(members.flatMap((m) => (m.kind === 'fixture' ? [fixtureNet(m.file).net] : m.kind === 'test' ? [m.file] : [])))];
  const out = path.join(mkdtempSync(path.join(tmpdir(), 'readiness-')), 'report.json');
  try {
    execFileSync(process.execPath, [rel('node_modules/vitest/vitest.mjs'), 'run', ...runFiles, '--reporter=json', `--outputFile=${out}`], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  } catch {
    /* a failing test is a verdict, not an error: the report holds it */
  }
  const report = JSON.parse(readFileSync(out, 'utf8'));
  const tests = memberVerdicts([report], members);
  const verdict = (m) => (m.kind === 'corpus471' || m.kind === 'corpus572' ? corpus[m.kind]?.[m.ref] ?? null : tests.get(JSON.stringify(m)) ?? null);

  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const measuredAt = new Date().toISOString();
  const result = { measuredAt, commit, units: {} };
  for (const u of units.units) result.units[u.id] = { questions: u.questions.map((q) => ({ id: q.id, ...questionState(q, verdict) })) };

  const prevPath = rel('ops/readiness.json');
  const prev = existsSync(prevPath) ? JSON.parse(readFileSync(prevPath, 'utf8')) : null;
  const today = measuredAt.slice(0, 10);
  const green = Object.fromEntries(Object.entries(result.units).map(([id, u]) => [id, u.questions.filter((q) => q.status === 'green').length]));
  result.history = [...(prev?.history ?? []).filter((h) => h.date !== today), { date: today, green }].slice(-60);

  for (const u of units.units) {
    const qs = result.units[u.id].questions;
    const c = (s) => qs.filter((q) => q.status === s).length;
    console.log(`${u.id.padEnd(14)} ${c('green')}/${qs.length} green · ${c('partial')} partial · ${c('red')} red · ${c('untried')} untried`);
  }
  if (!dry) {
    writeFileSync(prevPath, JSON.stringify(result, null, 2) + '\n');
    console.log(`wrote ops/readiness.json (${commit.slice(0, 8)})`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
