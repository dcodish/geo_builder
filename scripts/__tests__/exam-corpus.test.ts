/**
 * #2654 idea 6 ([ADR-W-172](../../docs/06w-decisions-workspace.md#adr-w-172)) — the exam corpus: what is in it,
 * which builders a change touches, and how a run is summarised. Offline: no vitest run is spawned here.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain .mjs tool scripts, deliberately not part of the TS project
import { BUILDERS, EXAM_NAME, EXAM_SETS, builderOf, buildersTouched, summarize, vitestRuns } from '../lib/exam-corpus.mjs';

const ROOT = path.resolve(__dirname, '..', '..');
const BOUNDARIES = JSON.parse(readFileSync(path.join(ROOT, 'BOUNDARIES.json'), 'utf8'));
const exam = new RegExp(EXAM_NAME);

describe('#2654 — the exam corpus', () => {
  it('every member file exists, and every builder tree is a BOUNDARIES.json tree', () => {
    for (const b of BUILDERS as string[]) {
      const s = EXAM_SETS[b];
      expect(BOUNDARIES.trees, b).toHaveProperty(s.tree);
      for (const f of [...s.whole, ...s.filtered]) expect(existsSync(path.join(ROOT, f)), f).toBe(true);
    }
  });

  it('an exam is recognised by its name, and an ordinary name is not', () => {
    for (const n of [
      '[bagrut-q4-tangent-secant-perpendicular] bagrut Q4: circle R',
      'exam-2553-q6-same-side — #2553 — שאלה 6 ב',
      'issue-2391-q1-exam-wording — #2391 — קיץ 2024: המשפטים של הבחינה',
      'ellipse-book-p1-3-2616 — #2617 — עמוד 1 תרגיל 3',
      'cube-2023-q2',
      '2022-summer-a-issue59',
      'issue-1186-winter25-in-a — #1186 — חורף 25',
    ]) expect(exam.test(n), n).toBe(true);
    for (const n of ['issue-1687-point-on-side — «D על BC»', '[square-abcd] an example square', 'PQ1 on the circle']) expect(exam.test(n), n).toBe(false);
  });

  it('a change selects the builders whose tree it touches, through the BOUNDARIES.json edges', () => {
    expect(buildersTouched(['src-analytic/parser/parseAnalytic.ts'], BOUNDARIES)).toEqual(['analytic']);
    expect(buildersTouched(['src/engine/solve.ts', 'src3d/parser/parse3.ts'], BOUNDARIES)).toEqual(['2d', '3d']);
    expect(buildersTouched(['fixtures3/cube-2023-q2.geo3.json'], BOUNDARIES)).toEqual(['3d']);
    // every builder imports shell/ (the allowed edges), so a shell change replays all four
    expect(buildersTouched(['shell/bidi.ts'], BOUNDARIES)).toEqual(BUILDERS);
    expect(buildersTouched(['package.json'], BOUNDARIES)).toEqual(BUILDERS);
    // a doc, a script or the shared server cannot move a replay
    expect(buildersTouched(['README.md', 'docs' + '/22-workflow.md', 'scripts/test-exams.mjs', 'server/parseHandler.ts', 'CLAUDE.md'], BOUNDARIES)).toEqual([]);
    expect(buildersTouched(['src-complex\\app\\submit.ts'], BOUNDARIES)).toEqual(['complex']);
  });

  it('the runs: whole files as they are, the general nets filtered by the exam name', () => {
    const runs = vitestRuns(['analytic']);
    expect(runs.map((r: { kind: string }) => r.kind)).toEqual(['whole', 'filtered']);
    expect(runs[1].args.slice(-2)).toEqual(['-t', EXAM_NAME]);
    expect(vitestRuns(['complex']).map((r: { kind: string }) => r.kind)).toEqual(['filtered']);
    expect(vitestRuns([])).toEqual([]);
  });

  it('a report folds into per-builder units, tests, failures and time', () => {
    const a = (title: string, ancestors: string[], status: string, duration: number) => ({ title, ancestorTitles: ancestors, fullName: [...ancestors, title].join(' '), status, duration });
    const report = {
      testResults: [
        {
          name: `${ROOT}/src-analytic/__tests__/fixtures.test.ts`,
          status: 'failed',
          assertionResults: [
            a('parses', ['net', 'exam-1 — קיץ'], 'passed', 10),
            a('builds', ['net', 'exam-1 — קיץ'], 'failed', 30),
            a('parses', ['net', 'issue-9'], 'skipped', 0),
          ],
        },
        { name: `${ROOT}/src3d/__tests__/scenarios3.test.ts`, status: 'passed', assertionResults: [a('gate', ['GATE — 2020 קיץ Q2'], 'passed', 500)] },
      ],
    };
    const s = summarize([report]);
    expect(s.analytic).toMatchObject({ files: 1, units: 1, tests: 2, failed: 1, testMs: 40 });
    expect(s.analytic.failures).toEqual(['net exam-1 — קיץ builds']);
    expect(s['3d']).toMatchObject({ files: 1, units: 1, tests: 1, failed: 0, testMs: 500 });
    expect(s['2d'].tests).toBe(0);
    expect(builderOf('C:\\x\\src\\__tests__\\scenarios-e2e-3.test.ts')).toBe('2d');
  });
});
