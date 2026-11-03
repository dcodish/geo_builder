/**
 * #2674 (ADR-AG-387) — A STUDENT'S FRESH LETTER ON THE TOOL'S POINT TAKES THE TOOL'S LETTER OVER, WITH NO NOTICE.
 *
 * Operator ruling, 2026-11-03 (decisions page, card d3, option A): *"Rename the tool's letter to the student's, no message
 * (2-D's way, in every builder)"*; standing ruling sr-07: *"A letter the student put on the object wins"*. 2-D, measured
 * at `2142a8d1` through `run-sequence.mjs`: «תיכון מ-A במשולש ABC» · «D אמצע BC» is one point D (ADR-653's identity
 * binding renames the auto-named M), and «AM = 3» between keeps M and D (M is then the student's letter).
 *
 * Every assertion goes through the real path: `decideSubmit` for the operator's lines, `derive` for the figure, and
 * `coincidencesOf` for the notice the page shows.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { typedLetters } from '../engine/toolLetters';
import { coincidencesOf } from '../app/coincidences';
import { decideSubmit } from '../app/submit';

type P = { x: number; y: number };
const SEEDS = [0, 1, 2, 3, 4, 5];

/** Submit the lines in order, as the app does; every line must record. */
const submitted = (lines: readonly string[], seed = 0): string[] => {
  const prior: string[] = [];
  for (const line of lines) {
    const r = decideSubmit(line, prior, seed);
    expect(r.kind, `«${line}» after ${JSON.stringify(prior)}`).toBe('record');
    if (r.kind === 'record') prior.push(r.line);
  }
  return prior;
};
const figure = (lines: readonly string[], seed = 0) => {
  const d = derive(submitted(lines, seed), seed);
  expect(d.faults, lines.join(' | ')).toEqual([]);
  return d;
};
const ids = (d: ReturnType<typeof derive>) => d.figure.points.map((p) => p.id).sort();
const pt = (d: ReturnType<typeof derive>, id: string): P => {
  const p = d.figure.points.find((q) => q.id === id);
  if (!p) throw new Error(`no point ${id}: ${ids(d).join(' ')}`);
  return p;
};
const near = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);

describe('the operator’s two lines: one point D, no message', () => {
  it.each(SEEDS)('seed %i: D is the midpoint of BC, M is gone, and the page says nothing', (seed) => {
    const d = figure(['תיכון מ-A במשולש ABC', 'D אמצע BC'], seed);
    expect(ids(d)).toEqual(['A', 'B', 'C', 'D']);
    expect(coincidencesOf(d)).toEqual([]);
    expect(d.minted).toEqual([]);
    const [b, c, m] = [pt(d, 'B'), pt(d, 'C'), pt(d, 'D')];
    expect(near(m, { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 })).toBeLessThan(1e-9);
    // the median the tool drew now runs to D
    expect(d.construction.objects.some((o) => o.kind === 'segment' && o.id === 'seg-AD' && [o.a, o.b].sort().join('') === 'AD')).toBe(true);
  });

  it('adding the naming line moves none of the triangle (stability)', () => {
    for (const seed of SEEDS) {
      const before = figure(['תיכון מ-A במשולש ABC'], seed);
      const after = figure(['תיכון מ-A במשולש ABC', 'D אמצע BC'], seed);
      for (const id of ['A', 'B', 'C']) expect(near(pt(before, id), pt(after, id)), `${id} @${seed}`).toBeLessThan(1e-9);
      expect(near(pt(before, 'M'), pt(after, 'D'))).toBeLessThan(1e-9);
    }
  });

  it('a later sentence about the segment is about the one drawn (re-keyed AD), and adds nothing', () => {
    expect(decideSubmit('הקטע AD', ['תיכון מ-A במשולש ABC', 'D אמצע BC'], 0).kind).not.toBe('record');
  });
});

describe('the class: every tool that letters a point the student then names', () => {
  it.each([
    ['a median to a side', ['משולש ABC', 'תיכון לצלע BC', 'D אמצע BC'], ['A', 'B', 'C', 'D']],
    ['a midsegment’s first end', ['משולש ABC', 'קטע האמצעים לצלע BC במשולש ABC', 'D אמצע AB'], ['A', 'B', 'C', 'D', 'N']],
    ['a midsegment’s second end', ['משולש ABC', 'קטע האמצעים לצלע BC במשולש ABC', 'D אמצע AC'], ['A', 'B', 'C', 'D', 'M']],
    ['an altitude’s foot, named by a cevian', ['משולש ABC', 'גובה מ-A במשולש ABC', 'AD גובה במשולש ABC'], ['A', 'B', 'C', 'D']],
    ['a median’s foot, named by a cevian', ['משולש ABC', 'תיכון מ-A במשולש ABC', 'AD תיכון במשולש ABC'], ['A', 'B', 'C', 'D']],
    ['a perpendicular’s foot, named by an altitude', ['משולש ABC', 'האנך מ-C ל-AB', 'CD גובה במשולש ABC'], ['A', 'B', 'C', 'D']],
    ['a perpendicular’s foot, named as the foot', ['משולש ABC', 'האנך מ-B לצלע AC', 'D רגל האנך מ-B ל-AC'], ['A', 'B', 'C', 'D']],
    ['a bare midpoint of two placed points', ['A(1,2)', 'B(5,6)', 'אמצע AB', 'D אמצע AB'], ['A', 'B', 'D']],
  ] as const)('%s → %j, no notice', (_w, lines, want) => {
    for (const seed of [0, 1, 2]) {
      const d = figure(lines, seed);
      expect(ids(d)).toEqual([...want].sort());
      expect(coincidencesOf(d)).toEqual([]);
    }
  });
});

describe('what stays: two letters the STUDENT wrote keep the notice (ADR-AG-372)', () => {
  it('a tool letter the student has typed is theirs: «AM = 3» then «D אמצע BC» keeps M and D, with the notice', () => {
    const d = figure(['משולש ABC', 'תיכון מ-A במשולש ABC', 'AM = 3', 'D אמצע BC']);
    expect(ids(d)).toEqual(['A', 'B', 'C', 'D', 'M']);
    expect(coincidencesOf(d)).toEqual([['M', 'D']]);
  });

  it('two midpoints the student named: «M אמצע BC» · «N אמצע BC» keep the notice', () => {
    const d = figure(['משולש ABC', 'M אמצע BC', 'N אמצע BC']);
    expect(coincidencesOf(d)).toEqual([['M', 'N']]);
  });

  it('a second student letter after the takeover is two of the student’s letters: D and E, with the notice', () => {
    const d = figure(['משולש ABC', 'תיכון מ-A במשולש ABC', 'D אמצע BC', 'E אמצע BC']);
    expect(ids(d)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(coincidencesOf(d)).toEqual([['D', 'E']]);
  });

  it('a student’s point first keeps its letter, and the tool runs to it (#1153, unchanged)', () => {
    const d = figure(['משולש ABC', 'D אמצע BC', 'תיכון מ-A במשולש ABC']);
    expect(ids(d)).toEqual(['A', 'B', 'C', 'D']);
    expect(d.minted).toEqual([]);
  });
});

describe('typedLetters — the letters a sentence types (2-D’s autoNamedLabels, per sentence)', () => {
  it.each([
    ['AM = 3', ['A', 'M']],
    ['D אמצע BC', ['B', 'C', 'D']],
    ["קובייה ABCDA'B'C'D'", ["A", "A'", 'B', "B'", 'C', "C'", 'D', "D'"]],
    ['O1 מרכז המעגל', ['O1']],
    ['The midpoint of AB is M', ['A', 'B', 'M']],
    ['מעגל x^2+y^2=25', []],
  ] as const)('«%s» → %j', (src, want) => {
    expect([...typedLetters(src)].sort()).toEqual([...want].sort());
  });
});
