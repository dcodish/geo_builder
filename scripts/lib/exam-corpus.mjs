/**
 * THE EXAM CORPUS — what it is, and which part of it a change touches (#2654 idea 6, ADR-W-172).
 *
 * The exam corpus is every sequence the suite replays that came from a real exam or textbook question
 * (`docs/sample questions/`, the bagrut booklets, the ellipse book, the operator's exam sessions). It is not a
 * new set of tests: every member already replays through its builder's real parse → replay → verify path in
 * one of the nets below, and every net runs in `npm run test:full`. What was missing was the ability to NAME
 * the corpus and to replay only it, so a fix round's item can replay the exams it touches in seconds instead
 * of waiting for the batch's full suite.
 *
 * Two kinds of member:
 *  - `whole`    — a file that is an exam gate end to end (the 471 corpus ratchet, the 3-D exam GATE files,
 *                 the theorem corpus of the booklet questions): it runs whole.
 *  - `filtered` — a builder's general net (its fixtures net, the 2-D scenario shards), of which the exam
 *                 members are the tests whose NAME carries an exam mark: `EXAM_NAME` below. A fixture's name
 *                 is its file name plus (analytic) its envelope name; a scenario's is `[id] title`.
 *
 * So adding an exam needs no registry edit: a fixture or scenario named for its exam («קיץ 2024», «bagrut
 * Q4», `exam-…`, `ellipse-book-…`, `2023-q2`) is in the corpus by its name. Pure: no I/O in this module.
 */

/** An exam mark in a test's full name. Case-explicit, because vitest compiles `-t` without the `i` flag. */
export const EXAM_NAME = [
  '[Bb]agrut', 'בגרות', '[Ee]xam(?!ple)', 'מבחן', 'בחינה', 'קיץ', 'חורף', '[Ss]ummer', '[Ww]inter',
  'ellipse-book', 'ספר האליפסה', '20[12][0-9]-q[0-9]', '\\bQ[0-9]',
].join('|');

/**
 * Per builder: the tree it lives in (BOUNDARIES.json `trees`), extra roots outside that tree, and its members.
 * Paths are repo-relative with forward slashes.
 */
export const EXAM_SETS = {
  '2d': {
    tree: 'src',
    roots: [],
    whole: ['src/theorems/__tests__/corpus.test.ts', 'src/theorems/__tests__/b-corpus.test.ts'],
    filtered: ['src/__tests__/fixtures.test.ts', ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `src/__tests__/scenarios-e2e-${n}.test.ts`)],
  },
  '3d': {
    tree: 'src3d',
    roots: ['fixtures3/'],
    whole: ['src3d/__tests__/scenarios3.test.ts', 'src3d/__tests__/exam-2026-2.test.ts', 'src3d/__tests__/adr-3d-032.test.ts'],
    filtered: ['src3d/__tests__/fixtures3.test.ts'],
  },
  analytic: {
    tree: 'src-analytic',
    roots: [],
    whole: [
      'src-analytic/__tests__/issue-1618-corpus471-ratchet.test.ts',
      'src-analytic/__tests__/issue-2730-corpus572-ratchet.test.ts',
      'src-analytic/__tests__/issue-2391-exam-fixtures.test.ts',
      'src-analytic/__tests__/issue-2393-exam-asks.test.ts',
    ],
    filtered: ['src-analytic/__tests__/fixtures.test.ts'],
  },
  complex: {
    tree: 'src-complex',
    roots: [],
    whole: [],
    filtered: ['src-complex/__tests__/fixtures.test.ts'],
  },
};

export const BUILDERS = Object.keys(EXAM_SETS);

/**
 * Files whose change can move ANY builder's replay: the toolchain and the test runner's own configuration.
 * A doc, a script or the shared server cannot change what an exam replays to, so they select nothing.
 */
const EVERY_BUILDER = /^(package(-lock)?\.json|tsconfig[^/]*\.json|vite[^/]*\.config\.[cm]?[jt]s|vitest[^/]*\.[cm]?[jt]s)$/;

/**
 * Which builders' exams a change touches. A builder is touched when the diff touches its own tree (or one of
 * its extra roots), or a tree its tree may import — read from BOUNDARIES.json's `imports.allowed` edges, never
 * restated here (today: every builder imports `shell/`). `boundaries` is the parsed BOUNDARIES.json.
 * Returns a sorted list.
 */
export function buildersTouched(changedFiles, boundaries) {
  const edges = (boundaries?.imports?.allowed ?? []).filter((e) => e && typeof e.from === 'string');
  const hit = new Set();
  for (const raw of changedFiles) {
    const f = String(raw).replace(/\\/g, '/').replace(/^\.\//, '');
    if (!f) continue;
    if (EVERY_BUILDER.test(f)) {
      BUILDERS.forEach((b) => hit.add(b));
      continue;
    }
    const top = f.split('/')[0];
    for (const b of BUILDERS) {
      const s = EXAM_SETS[b];
      if (top === s.tree || s.roots.some((r) => f.startsWith(r))) hit.add(b);
      else if (edges.some((e) => e.from === s.tree && e.to === top)) hit.add(b);
    }
  }
  return BUILDERS.filter((b) => hit.has(b));
}

/** The vitest invocations that replay the given builders' exams: one for the whole files, one filtered by name. */
export function vitestRuns(builders) {
  const whole = builders.flatMap((b) => EXAM_SETS[b].whole);
  const filtered = builders.flatMap((b) => EXAM_SETS[b].filtered);
  const runs = [];
  if (whole.length) runs.push({ kind: 'whole', files: whole, args: [...whole] });
  if (filtered.length) runs.push({ kind: 'filtered', files: filtered, args: [...filtered, '-t', EXAM_NAME] });
  return runs;
}

const norm = (p) => String(p).replace(/\\/g, '/');

/** The builder a test file belongs to, by the sets above. */
export function builderOf(file) {
  const f = norm(file);
  return BUILDERS.find((b) => [...EXAM_SETS[b].whole, ...EXAM_SETS[b].filtered].some((m) => f.endsWith(m))) ?? null;
}

/**
 * Fold vitest JSON reports (`--reporter=json`) into the per-builder record the runner prints and the ADR quotes:
 * exam units replayed (a fixture's describe, else one test) and the tests that ran (the rest were filtered out), failures, the summed per-test time, and each
 * file's own wall time (first test start to last test end — hooks excluded, so a floor). Pure.
 */
export function summarize(reports) {
  const out = Object.fromEntries(BUILDERS.map((b) => [b, { files: 0, units: 0, tests: 0, failed: 0, testMs: 0, failures: [], slowest: [] }]));
  for (const report of reports) {
    for (const t of report?.testResults ?? []) {
      const b = builderOf(t.name);
      if (!b) continue;
      const ran = t.assertionResults.filter((a) => a.status === 'passed' || a.status === 'failed');
      if (!ran.length && t.status !== 'failed') continue;
      const rec = out[b];
      rec.files += 1;
      rec.tests += ran.length;
      // A unit is one exam sequence: a fixture's describe (several checks each), else the test itself.
      rec.units += new Set(ran.map((a) => (a.ancestorTitles.length >= 2 ? a.ancestorTitles.slice(1).join(' > ') : a.title))).size;
      for (const a of ran) {
        rec.testMs += a.duration ?? 0;
        if (a.status === 'failed') {
          rec.failed += 1;
          rec.failures.push(a.fullName);
        }
        rec.slowest.push({ name: a.fullName, ms: Math.round(a.duration ?? 0) });
      }
      if (t.status === 'failed' && !ran.some((a) => a.status === 'failed')) {
        rec.failed += 1;
        rec.failures.push(`${norm(t.name)} (file-level error)`);
      }
    }
  }
  for (const rec of Object.values(out)) {
    rec.testMs = Math.round(rec.testMs);
    rec.slowest = rec.slowest.sort((a, b) => b.ms - a.ms).slice(0, 5);
  }
  return out;
}
