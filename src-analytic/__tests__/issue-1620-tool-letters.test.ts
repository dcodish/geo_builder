/**
 * #1620 S6 (ADR-AG-211) — the tool's letters for points the student did not name, and «תיכון ליתר» (#1222).
 *
 * Operator rulings, 2026-10-02 (#1620): (1) a point the student did not name takes 2-D's letter — M for a midpoint,
 * F for a foot, the next free letter when taken — except that analytic uses H for a foot (F is the focus letter,
 * #1167); announced on the row, renameable. (2) «תיכון ליתר» builds when a STATED right angle fixes the vertex, and
 * otherwise asks which side is the hypotenuse — never assumes C.
 *
 * Every assertion goes through the real path — `derive` (the parser, the one letter resolver `engine/toolLetters.ts`,
 * the fold, the solve), `decideSubmit`, `decideRename` — and the geometry is measured on the drawn figure.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { decideSubmit } from '../app/submit';
import { decideRename, type RenameState } from '../app/rename';

type P = { x: number; y: number };
const SEEDS = [0, 1, 2, 3, 4, 5];

const fig = (lines: readonly string[], seed = 0) => {
  const d = derive(lines, seed);
  expect(d.faults, `faults @${seed}: ${lines.join(' | ')}`).toEqual([]);
  return d;
};
const pt = (d: ReturnType<typeof derive>, id: string): P => {
  const p = d.figure.points.find((q) => q.id === id);
  if (!p) throw new Error(`no point ${id} — points: ${d.figure.points.map((q) => q.id).join(' ')}`);
  return p;
};
const mintedIds = (lines: readonly string[]) => fig(lines).minted.map((m) => m.id);
const verdictKey = (lines: readonly string[]): string => {
  const prior: string[] = [];
  let last: ReturnType<typeof decideSubmit> | null = null;
  for (const line of lines) {
    last = decideSubmit(line, prior, 0);
    if (last.kind === 'record') prior.push(last.line);
  }
  return last!.kind === 'refused' ? last!.error.key : last!.kind;
};
const session = (lines: string[]): RenameState => ({ lines, disabled: [], queries: [], spokenFor: {}, seed: 0 });
const midpointOf = (m: P, a: P, b: P) => Math.hypot(m.x - (a.x + b.x) / 2, m.y - (a.y + b.y) / 2);
const cosAt = (a: P, f: P, u: P, v: P) => {
  const p = { x: f.x - a.x, y: f.y - a.y };
  const q = { x: v.x - u.x, y: v.y - u.y };
  return Math.abs(p.x * q.x + p.y * q.y) / (Math.hypot(p.x, p.y) * Math.hypot(q.x, q.y));
};

describe('one role → letter table: the letter, and the next free one when it is taken', () => {
  it.each([
    // a midpoint — a median's foot, a perpendicular bisector's: M, then N, then P (2-D's M, N, P, Q)
    ['median', ['משולש ABC', 'תיכון מ-A במשולש ABC'], ['M']],
    ['median, M taken', ['משולש ABC', 'נקודה M', 'תיכון מ-A במשולש ABC'], ['N']],
    ['median, M and N taken', ['משולש ABC', 'נקודה M', 'נקודה N', 'תיכון מ-A במשולש ABC'], ['P']],
    ['two medians', ['משולש ABC', 'תיכון מ-A במשולש ABC', 'תיכון מ-B במשולש ABC'], ['M', 'N']],
    ['median to a side', ['משולש ABC', 'תיכון לצלע BC'], ['M']],
    ['perpendicular bisector', ['משולש ABC', 'אנך אמצעי ל-AB'], ['M']],
    ['perpendicular bisector, M taken', ['משולש ABC', 'נקודה M', 'אנך אמצעי ל-AB'], ['N']],
    // a midsegment's two ends: 2-D's M, N — and N, P when M is taken (its second end prefers N, P, Q, S)
    ['midsegment', ['קטע האמצעים לצלע BC במשולש ABC'], ['M', 'N']],
    ['midsegment, M taken', ['נקודה M', 'קטע האמצעים לצלע BC במשולש ABC'], ['N', 'P']],
    // a foot — an altitude's, a perpendicular's: H (2-D's F, read H here), then G, then P; F is never offered
    ['altitude', ['משולש ABC', 'גובה מ-A במשולש ABC'], ['H']],
    ['altitude, F taken — F is never the tool’s', ['משולש ABC', 'נקודה F', 'גובה מ-A במשולש ABC'], ['H']],
    ['altitude, H taken', ['משולש ABC', 'נקודה H', 'גובה מ-A במשולש ABC'], ['G']],
    ['altitude, H and G taken', ['משולש ABC', 'נקודה H', 'נקודה G', 'גובה מ-A במשולש ABC'], ['P']],
    ['two altitudes', ['משולש ABC', 'גובה מ-A במשולש ABC', 'גובה מ-B במשולש ABC'], ['H', 'G']],
    ['altitude from a point', ['משולש ABC', 'גובה מנקודה A'], ['H']],
    ['perpendicular', ['משולש ABC', 'האנך מ-C ל-AB'], ['H']],
    ['perpendicular to an axis', ['B(1,14)', 'האנך מהנקודה B לציר ה-x'], ['H']],
  ] as const)('%s → %j', (_w, lines, want) => {
    expect(mintedIds(lines)).toEqual(want);
  });

  it('a coordinate point keeps its own ruling (#1281): the reserved P₁ — not a construct with a role', () => {
    expect(mintedIds(['טרפז ABCD', 'הבסיס CD נמצא על ישר העובר דרך הנקודה (-3,7)'])).toEqual(['P₁']);
  });

  it('the row says so: each tool letter is reported on the line that made it', () => {
    expect(fig(['משולש ABC', 'גובה מ-A במשולש ABC', 'תיכון מ-B במשולש ABC']).minted).toEqual([
      { index: 1, id: 'H' },
      { index: 2, id: 'M' },
    ]);
  });
});

describe('one point, one name (#1153), and stable letters', () => {
  it('the same point reached two ways is ONE point, with the first name', () => {
    expect(fig(['משולש ABC', 'D אמצע BC', 'תיכון מ-A במשולש ABC']).figure.points.map((p) => p.id).sort()).toEqual(['A', 'B', 'C', 'D']);
    expect(fig(['משולש ABC', 'D אמצע BC', 'תיכון מ-A במשולש ABC']).minted).toEqual([]);
    expect(fig(['משולש ABC', 'האנך מ-A ל-BC', 'גובה מ-A במשולש ABC']).figure.points.map((p) => p.id).sort()).toEqual(['A', 'B', 'C', 'H']);
    expect(verdictKey(['משולש ABC', 'גובה מ-A במשולש ABC', 'גובה מנקודה A'])).toBe('already-known');
  });

  it('a later NAME for the tool’s point is #1153’s already-named, naming the tool’s letter', () => {
    const d = derive(['משולש ABC', 'תיכון מ-A במשולש ABC', 'D אמצע BC'], 0);
    expect(d.faults[0]).toMatchObject({ index: 2, code: 'already-named', holder: 'M' });
  });

  it('a later line that uses the letter refers to the tool’s point, and never re-letters it', () => {
    const d = fig(['משולש ABC', 'תיכון מ-A במשולש ABC', 'AM = 3']);
    expect(d.minted).toEqual([{ index: 1, id: 'M' }]);
    const [a, m] = [pt(d, 'A'), pt(d, 'M')];
    expect(Math.hypot(a.x - m.x, a.y - m.y)).toBeCloseTo(3, 6);
    expect(midpointOf(m, pt(d, 'B'), pt(d, 'C'))).toBeLessThan(1e-6);
  });

  it.each([['תיכון מ-A במשולש ABC'], ['גובה מ-A במשולש ABC'], ['תיכון לצלע BC'], ['גובה מנקודה A'], ['אנך אמצעי ל-AB']])(
    'adding «%s» to a FREE triangle moves none of its vertices, seeds 0–5 (the tool’s foot is a derived point)',
    (line) => {
      for (const seed of SEEDS) {
        const before = fig(['משולש ABC'], seed);
        const after = fig(['משולש ABC', line], seed);
        for (const id of ['A', 'B', 'C']) {
          expect(pt(after, id).x, `${line} @${seed} ${id}`).toBeCloseTo(pt(before, id).x, 9);
          expect(pt(after, id).y, `${line} @${seed} ${id}`).toBeCloseTo(pt(before, id).y, 9);
        }
      }
    },
  );

  it('the letter is the same at every seed, and so is what it is', () => {
    for (const seed of SEEDS) {
      const d = fig(['משולש ABC', 'תיכון מ-A במשולש ABC', 'גובה מ-B במשולש ABC'], seed);
      expect(d.minted.map((m) => m.id)).toEqual(['M', 'H']);
      expect(midpointOf(pt(d, 'M'), pt(d, 'B'), pt(d, 'C'))).toBeLessThan(1e-9);
      expect(cosAt(pt(d, 'B'), pt(d, 'H'), pt(d, 'A'), pt(d, 'C'))).toBeLessThan(1e-9);
    }
  });
});

describe('the tool’s letter is the student’s to rename — the sentence is rewritten to name it', () => {
  it.each([
    [['משולש ABC', 'תיכון מ-A במשולש ABC'], 'M', 'תיכון מ-A במשולש ABC פוגש את הצלע בנקודה K'],
    [['משולש ABC', 'גובה מנקודה A'], 'H', 'גובה מנקודה A פוגש את הצלע בנקודה K'],
    [['משולש ישר-זווית ABC', 'זווית C ישרה', 'תיכון ליתר'], 'M', 'תיכון ליתר פוגש את הצלע בנקודה K'],
    // S2 reported `rename-not-typed` for this one: the perpendicular bisector names its midpoint «… חותך אותו בנקודה K»
    [['משולש ABC', 'אנך אמצעי ל-AB'], 'M', 'אנך אמצעי ל-AB חותך אותו בנקודה K'],
    [['B(1,14)', 'האנך מהנקודה B לציר ה-x'], 'H', 'האנך מהנקודה B לציר ה-x חותך אותו בנקודה K'],
  ] as const)('%j — %s → K', (lines, from, expected) => {
    const r = decideRename(from, 'K', session([...lines]));
    expect(r.kind, JSON.stringify(r)).toBe('apply');
    if (r.kind !== 'apply') return;
    expect(r.lines[r.lines.length - 1]).toBe(expected);
    const before = fig(lines);
    const after = fig(r.lines);
    expect(after.minted).toEqual([]);
    expect(pt(after, 'K').x).toBeCloseTo(pt(before, from).x, 9);
    expect(pt(after, 'K').y).toBeCloseTo(pt(before, from).y, 9);
  });
});

describe('«תיכון ליתר» (#1222): a stated right angle fixes the hypotenuse; an open one is asked, never assumed', () => {
  it('the right-triangle noun alone asks which side is the hypotenuse — for the median and the altitude', () => {
    expect(verdictKey(['משולש ישר-זווית ABC', 'תיכון ליתר'])).toBe('ambiguous-hypotenuse');
    expect(verdictKey(['משולש ישר-זווית ABC', 'גובה ליתר'])).toBe('ambiguous-hypotenuse');
    expect(verdictKey(['משולש ישר-זווית ABC', 'the median to the hypotenuse'])).toBe('ambiguous-hypotenuse');
  });

  it('no right angle at all asks too (2-D asks: input.roleSideUnresolved)', () => {
    expect(verdictKey(['משולש ABC', 'תיכון ליתר'])).toBe('ambiguous-no-right-angle');
  });

  it.each([
    ['C', ['משולש ישר-זווית ABC', 'זווית C ישרה', 'תיכון ליתר'], 'C', 'A', 'B'],
    ['A', ['משולש ישר-זווית ABC', 'זווית A ישרה', 'תיכון ליתר'], 'A', 'B', 'C'],
    ['C, on a plain triangle', ['משולש ABC', 'זווית C ישרה', 'תיכון ליתר'], 'C', 'A', 'B'],
  ] as const)('a stated right angle at %s: the median runs from it to the midpoint of the side facing it', (_w, lines, apex, u, v) => {
    for (const seed of SEEDS) {
      const d = fig(lines, seed);
      expect(midpointOf(pt(d, 'M'), pt(d, u), pt(d, v)), `@${seed}`).toBeLessThan(1e-9);
      expect(d.figure.segments.map((s) => [...s.ends].sort().join(''))).toContain([apex, 'M'].sort().join(''));
    }
  });

  it('the altitude to the hypotenuse, right angle at A: the foot H on BC, AH ⟂ BC', () => {
    for (const seed of SEEDS) {
      const d = fig(['משולש ישר-זווית ABC', 'זווית A ישרה', 'גובה ליתר'], seed);
      expect(cosAt(pt(d, 'A'), pt(d, 'H'), pt(d, 'B'), pt(d, 'C'))).toBeLessThan(1e-9);
    }
  });

  it('the taught remedy works: «תיכון ליתר AB» names the hypotenuse, which puts the right angle at C', () => {
    for (const seed of SEEDS) {
      const d = fig(['משולש ישר-זווית ABC', 'תיכון ליתר AB'], seed);
      const [a, b, c, m] = ['A', 'B', 'C', 'M'].map((id) => pt(d, id));
      expect(midpointOf(m, a, b)).toBeLessThan(1e-6);
      expect(cosAt(c, a, c, b)).toBeLessThan(1e-6);
    }
  });

  it('a named hypotenuse that contradicts the stated right angle is refused, naming the sentence', () => {
    expect(verdictKey(['משולש ישר-זווית ABC', 'זווית C ישרה', 'תיכון ליתר AC'])).toBe('unsatisfiable');
  });
});
