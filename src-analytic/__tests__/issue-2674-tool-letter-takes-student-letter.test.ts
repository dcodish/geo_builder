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

/**
 * The round #2722 remnants (ADR-AG-404). Card q3 = A (2026-11-04), *"Rename for the reversed spelling too"*: analytic already
 * read it, through `sameDerivation`; locked here. The other two are the 2026-11-03 ruling's *"in every builder"*.
 */
describe('the reversed spelling (card q3 = A)', () => {
  it.each([
    ['a bare midpoint', ['משולש ABC', 'אמצע BC', 'D אמצע CB']],
    ['the tool wrote it backwards', ['משולש ABC', 'אמצע CB', 'D אמצע BC']],
    ['a median’s midpoint', ['משולש ABC', 'תיכון מ-A במשולש ABC', 'D אמצע CB']],
  ])('%s: one point D, no notice', (_t, lines) => {
    const d = figure(lines);
    expect(ids(d)).toEqual(['A', 'B', 'C', 'D']);
    expect(coincidencesOf(d)).toEqual([]);
  });
  it('a different segment does not take over', () => {
    expect(ids(figure(['משולש ABC', 'אמצע BC', 'D אמצע AB']))).toEqual(['A', 'B', 'C', 'D', 'M']);
  });
  it('a typed letter is the student’s: the notice stays', () => {
    expect(coincidencesOf(figure(['משולש ABC', 'תיכון מ-A במשולש ABC', 'AM = 3', 'D אמצע CB']))).toEqual([['M', 'D']]);
  });
});

describe('the next free letter after a takeover is the one the student freed, as in 2-D', () => {
  it.each(['D אמצע BC', 'D אמצע CB'])('«%s»: the next median’s midpoint is M again, and only that row announces it', (line) => {
    const d = figure(['משולש ABC', 'תיכון מ-A במשולש ABC', line, 'תיכון מ-B במשולש ABC']);
    expect(ids(d)).toEqual(['A', 'B', 'C', 'D', 'M']);
    expect(d.minted).toEqual([{ index: 3, id: 'M' }]);
    expect(coincidencesOf(d)).toEqual([]);
  });
  it('M typed in between stays taken: the next midpoint is N', () => {
    const d = figure(['משולש ABC', 'תיכון מ-A במשולש ABC', 'AM = 3', 'D אמצע BC', 'תיכון מ-B במשולש ABC']);
    expect(ids(d)).toEqual(['A', 'B', 'C', 'D', 'M', 'N']);
  });
  it('a second student letter on the point takes nothing over', () => {
    const d = figure(['משולש ABC', 'תיכון מ-A במשולש ABC', 'D אמצע BC', 'E אמצע CB', 'תיכון מ-B במשולש ABC']);
    expect(coincidencesOf(d)).toEqual([['D', 'E']]);
    expect(ids(d)).toEqual(['A', 'B', 'C', 'D', 'E', 'M']);
  });
  it('the median stated again is about D, and adds no point', () => {
    const lines = submitted(['משולש ABC', 'תיכון מ-A במשולש ABC', 'D אמצע BC']);
    expect(decideSubmit('תיכון מ-A במשולש ABC', lines, 0).kind).toBe('already-known');
  });
});

describe('the coordinate point: the tool’s P₁ yields to a student’s fresh letter at those coordinates', () => {
  const T = ['טרפז ABCD', 'הבסיס CD נמצא על ישר העובר דרך הנקודה (-3,7)'];
  it('one point E, no notice, no row announcing P₁', () => {
    const d = figure([...T, 'E(-3,7)']);
    expect(ids(d)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(coincidencesOf(d)).toEqual([]);
    expect(d.minted).toEqual([]);
    expect(pt(d, 'E')).toMatchObject({ x: -3, y: 7 });
  });
  it('P₁ is back in the pool: the next coordinate point takes it', () => {
    const d = figure([...T, 'E(-3,7)', 'נתונה הנקודה (2,2)']);
    expect(d.minted).toEqual([{ index: 3, id: 'P₁' }]);
  });
  it('another point keeps P₁ with its row', () => {
    const d = figure([...T, 'E(1,1)']);
    expect(d.minted).toEqual([{ index: 1, id: 'P₁' }]);
  });
  it('a circle built on the coordinates follows the letter', () => {
    const d = figure(['מעגל שמרכזו בנקודה (2,3) ורדיוסו 2', 'E(2,3)']);
    expect(ids(d)).toContain('E');
    expect(ids(d)).not.toContain('P₁');
    expect(coincidencesOf(d)).toEqual([]);
  });
  it('a letter stated before the coordinates already wins, as it did', () => {
    expect(decideSubmit('נתונה הנקודה (-3,7)', ['E(-3,7)'], 0).kind).toBe('already-known');
  });
});
