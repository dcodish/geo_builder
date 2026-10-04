/**
 * #1620 slice C, stream S2 (ADR-AG-207) — the perpendicular from a point and its foot, the line through a point
 * that cuts a side, references to the drawn perpendicular, and a straight piece as a shared subject.
 *
 * Every lock CALLS the real path (`derive`, `decideSubmit`, `decideRename`) and asserts GEOMETRY: the foot on its
 * line and the perpendicular's residual, the crossing on the side and between its ends, at several seeds; free
 * DOFs still free (ADR-052); adding a perpendicular moves nothing already drawn; and the honest refusals.
 *
 * The corpus questions are typed as the exam prints them, with stream S1's TAUGHT sentences in place of the
 * imperatives («מן הנקודה B הורידו אנך לציר ה-x» → «האנך מהנקודה B לציר ה-x») — the contract S1 lowers onto.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { derive, type Derivation } from '../engine/derive';
import { parseLine } from '../parser/parseAnalytic';
import { decideSubmit } from '../app/submit';
import { decideRename } from '../app/rename';

const SEEDS = [0, 1, 2, 3, 4, 5, 6, 7];
const EPS = 1e-6;

const pt = (d: Derivation, id: string) => {
  const p = d.figure.points.find((q) => q.id === id);
  if (!p) throw new Error(`no point ${id} — points: ${d.figure.points.map((q) => q.id).join(' ')}`);
  return p;
};
const dot = (u: { x: number; y: number }, v: { x: number; y: number }) => u.x * v.x + u.y * v.y;
const sub = (p: { x: number; y: number }, q: { x: number; y: number }) => ({ x: p.x - q.x, y: p.y - q.y });
const cross = (u: { x: number; y: number }, v: { x: number; y: number }) => u.x * v.y - u.y * v.x;
const clean = (d: Derivation) => {
  expect(d.faults, JSON.stringify(d.faults)).toEqual([]);
  return d;
};
/** P lies on the segment AB (collinear and between, closed). */
const between = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
  const ab = sub(b, a);
  const ap = sub(p, a);
  const t = dot(ap, ab) / dot(ab, ab);
  return Math.abs(cross(ab, ap)) <= 1e-6 * Math.max(1, dot(ab, ab)) && t >= -1e-9 && t <= 1 + 1e-9;
};

describe('the perpendicular from a point — the foot, the piece, the tool letter', () => {
  it('«האנך מהנקודה B לציר ה-x» drops a foot on the axis, draws B→foot, and names the foot with a tool letter', () => {
    for (const seed of SEEDS) {
      const d = clean(derive(['משולש ABC', 'האנך מהנקודה B לציר ה-x'], seed));
      const b = pt(d, 'B');
      const f = pt(d, 'H');
      expect(f.y).toBeCloseTo(0, 9);
      expect(f.x).toBeCloseTo(b.x, 9);
      expect(d.figure.segments.some((s) => s.ends.includes('B') && s.ends.includes('H'))).toBe(true);
      expect(d.minted).toEqual([{ index: 1, id: 'H' }]);
    }
  });

  it('the foot on a SIDE is on the line through it, and the perpendicular is perpendicular to it', () => {
    for (const seed of SEEDS) {
      const d = clean(derive(['משולש ABC', 'האנך מהקודקוד C לצלע AB חותך אותה בנקודה D'], seed));
      const [a, b, c, f] = ['A', 'B', 'C', 'D'].map((id) => pt(d, id));
      expect(Math.abs(cross(sub(b, a), sub(f, a)))).toBeLessThan(1e-6 * Math.max(1, dot(sub(b, a), sub(b, a))));
      expect(Math.abs(dot(sub(c, f), sub(b, a)))).toBeLessThan(1e-6 * Math.max(1, dot(sub(b, a), sub(b, a))));
    }
  });

  it('every spelling of the named foot is the same point: «… חותך אותו בנקודה D», «D רגל האנך …», English', () => {
    const spellings = [
      'האנך מהקודקוד C לציר ה-x חותך אותו בנקודה D',
      'האנך מהקודקוד C לציר ה-x, החותך אותו בנקודה D',
      'האנך מ-C לציר ה-x חותך את ציר ה-x בנקודה D',
      'D רגל האנך מ-C לציר ה-x',
      'הנקודה D היא רגל האנך מהקדקוד C לציר ה-x',
      'the perpendicular from C to the x-axis meets it at D',
      'D is the foot of the perpendicular from C to the x-axis',
    ];
    for (const s of spellings) {
      const d = clean(derive(['משולש ABC', s], 2));
      expect(pt(d, 'D').x, s).toBeCloseTo(pt(d, 'C').x, 9);
      expect(pt(d, 'D').y, s).toBeCloseTo(0, 9);
    }
  });

  it('the plural with «בהתאמה» drops one foot per point, in order', () => {
    for (const s of [
      'האנכים מהקודקודים A ו-C לציר ה-x חותכים אותו בנקודות E ו-F בהתאמה',
      'the perpendiculars from A and C to the x-axis meet it at E and F respectively',
    ]) {
      const d = clean(derive(['משולש ABC', s], 3));
      expect(pt(d, 'E').x).toBeCloseTo(pt(d, 'A').x, 9);
      expect(pt(d, 'F').x).toBeCloseTo(pt(d, 'C').x, 9);
      expect(pt(d, 'E').y).toBeCloseTo(0, 9);
      expect(pt(d, 'F').y).toBeCloseTo(0, 9);
    }
  });

  it('«F רגל האנך מ-C ל-AD» (2-D catalog) — the foot of a quadrilateral vertex on the line AD', () => {
    const d = clean(derive(['מרובע ABCD', 'F רגל האנך מ-C ל-AD'], 0));
    const [a, c, dd, f] = ['A', 'C', 'D', 'F'].map((id) => pt(d, id));
    expect(Math.abs(dot(sub(c, f), sub(dd, a)))).toBeLessThan(EPS);
    expect(Math.abs(cross(sub(dd, a), sub(f, a)))).toBeLessThan(EPS);
  });

  it('ADR-052: the perpendicular states nothing about the triangle — its vertices still move with the seed', () => {
    const xs = new Set(SEEDS.map((seed) => pt(derive(['משולש ABC', 'האנך מהנקודה B לציר ה-x'], seed), 'B').x.toFixed(6)));
    expect(xs.size).toBeGreaterThan(1);
  });

  it('STABILITY: adding the perpendicular (or naming its foot) moves no point already drawn', () => {
    for (const s of ['האנך מהנקודה B לציר ה-x', 'D רגל האנך מ-C ל-AB', 'האנך מ-C ל-AB', 'האנכים מהקודקודים A ו-C לציר ה-x חותכים אותו בנקודות E ו-F בהתאמה']) {
      for (const seed of SEEDS) {
        const before = derive(['משולש ABC'], seed);
        const after = clean(derive(['משולש ABC', s], seed));
        for (const id of ['A', 'B', 'C']) {
          expect(Math.hypot(pt(after, id).x - pt(before, id).x, pt(after, id).y - pt(before, id).y), `${s} @${seed} ${id}`).toBeLessThan(EPS);
        }
      }
    }
  });

  it('a perpendicular stated twice is one foot; a later NAME for the tool-lettered foot is #1153’s already-named', () => {
    const twice = clean(derive(['משולש ABC', 'האנך מ-B לצלע AC', 'האנך מהנקודה B לצלע AC'], 0));
    expect(twice.figure.points.map((p) => p.id).sort()).toEqual(['A', 'B', 'C', 'H']);
    expect(twice.outcomes[2]).toBe('known');
    const named = derive(['משולש ABC', 'D רגל האנך מ-B ל-AC', 'האנך מ-B לצלע AC'], 0);
    expect(named.faults).toEqual([]);
    expect(named.figure.points.map((p) => p.id).sort()).toEqual(['A', 'B', 'C', 'D']);
    const later = derive(['משולש ABC', 'האנך מ-B לצלע AC', 'D רגל האנך מ-B ל-AC'], 0);
    expect(later.faults[0]).toMatchObject({ index: 2, code: 'already-named', holder: 'H' });
  });

  it('the tool letter can be renamed — the sentence is rewritten to name the foot', () => {
    const v = decideRename('H', 'D', { lines: ['משולש ABC', 'האנך מהנקודה B לציר ה-x'], disabled: [], queries: [], spokenFor: {}, seed: 0 });
    expect(v.kind).toBe('apply');
    if (v.kind === 'apply') expect(v.lines).toEqual(['משולש ABC', 'האנך מהנקודה B לציר ה-x חותך אותו בנקודה D']);
  });

  it('honest refusals: a point of the line, the point as its own foot, an unknown operand, an unknown point', () => {
    expect(parseLine('האנך מ-A לצלע AB')).toMatchObject({ ok: false, code: 'degenerate-role' });
    expect(parseLine('D רגל האנך מ-D לציר ה-x')).toMatchObject({ ok: false, code: 'degenerate-role' });
    expect(parseLine('האנך מ-A לפיל')).toMatchObject({ ok: false, code: 'bad-operand' });
    expect(derive(['משולש ABC', 'האנך מ-X ל-BC'], 0).faults[0]).toMatchObject({ index: 1, code: 'unknown-reference' });
  });

  it('the perpendicular bisector: the midpoint (a tool letter, or the student’s), and the line through it ⟂ AB', () => {
    const d = clean(derive(['משולש ABC', 'אנך אמצעי ל-AB'], 1));
    const [a, b, m] = ['A', 'B', 'M'].map((id) => pt(d, id));
    expect(m.x).toBeCloseTo((a.x + b.x) / 2, 9);
    const line = d.figure.curves.find((c) => c.curve.kind === 'line' && c.stated);
    expect(line).toBeDefined();
    if (line && line.curve.kind === 'line') {
      // normal (a, b) of the line is parallel to AB, and M is on it
      expect(Math.abs(cross({ x: line.curve.a, y: line.curve.b }, sub(b, a)))).toBeLessThan(1e-6 * Math.hypot(line.curve.a, line.curve.b) * Math.hypot(b.x - a.x, b.y - a.y));
      expect(Math.abs(line.curve.a * m.x + line.curve.b * m.y + line.curve.c)).toBeLessThan(1e-6 * Math.max(1, Math.abs(line.curve.c)));
    }
    const named = clean(derive(['משולש ABC', 'M אמצע AB', 'האנך האמצעי לצלע AB'], 1));
    expect(named.figure.points.map((p) => p.id).sort()).toEqual(['A', 'B', 'C', 'M']);
  });
});

describe('the line through a point that cuts a side — one sentence, two facts', () => {
  const SPELLINGS = [
    'הישר העובר דרך הנקודה E מקביל ל-AC וחותך את הצלע AB בנקודה F',
    'דרך E עובר ישר מקביל ל-AC החותך את הצלע AB בנקודה F',
    'the line through E parallel to AC cuts side AB at F',
  ];
  it('F is on the parallel through E and BETWEEN A and B, at every seed; the line is a carrier, EF is drawn', () => {
    for (const s of SPELLINGS) {
      for (const seed of SEEDS) {
        const d = clean(derive(['משולש ABC', 'E על BC', s], seed));
        const [a, b, c, e, f] = ['A', 'B', 'C', 'E', 'F'].map((id) => pt(d, id));
        expect(Math.abs(cross(sub(f, e), sub(c, a))), `${s} @${seed}`).toBeLessThan(1e-6 * Math.max(1, dot(sub(c, a), sub(c, a))));
        expect(between(f, a, b), `${s} @${seed}: F between A and B`).toBe(true);
        expect(d.figure.segments.some((g) => g.ends.includes('E') && g.ends.includes('F'))).toBe(true);
        expect(d.figure.curves.filter((g) => g.curve.kind === 'line').every((g) => !g.stated)).toBe(true);
      }
    }
  });

  it('a later sentence stating the line itself draws it (the carrier is upgraded, not duplicated)', () => {
    const d = clean(derive(['משולש ABC', 'E על BC', SPELLINGS[0], 'דרך E עובר ישר מקביל ל-AC'], 0));
    expect(d.outcomes[3]).toBe('narrowed');
    expect(d.figure.curves.filter((g) => g.curve.kind === 'line')).toHaveLength(1);
    expect(d.figure.curves.find((g) => g.curve.kind === 'line')?.stated).toBe(true);
  });

  it('the line-first spelling of the plain construction (2-D’s catalog): «ישר דרך P מאונך ל-AB»', () => {
    const d = clean(derive(['משולש ABC', 'נקודה P', 'ישר דרך P מאונך ל-AB'], 0));
    expect(d.figure.curves.some((g) => g.curve.kind === 'line' && g.stated)).toBe(true);
    expect(parseLine('ישר דרך P מאונך ל-AB')).toEqual(
      expect.objectContaining({ ok: true }),
    );
  });

  it('a crossing at the line’s own point is refused by name', () => {
    expect(parseLine('הישר העובר דרך הנקודה E מקביל ל-AC וחותך את הצלע AB בנקודה E')).toMatchObject({ ok: false, code: 'degenerate-role' });
  });
});

describe('«האנך» as a reference — the perpendicular the figure drew', () => {
  it('«E על האנך» / by its description puts E on the line from the point through its foot', () => {
    for (const s of ['E על האנך', 'הנקודה E נמצאת על האנך שהורידו מנקודה B לציר ה-x', 'E is on the perpendicular from B to the x-axis']) {
      const d = clean(derive(['B(1,14)', 'האנך מהנקודה B לציר ה-x', s], 0));
      expect(pt(d, 'E').x, s).toBeCloseTo(1, 6);
    }
  });

  // #1727 (ADR-AG-229, operator ruling 2026-10-03): a perpendicular named IN FULL that matches none is BUILT, not refused
  // — «E על האנך מ-C ל-AB» beside the perpendicular from A draws the one from C. Bare «האנך» still refers.
  it('none or several — refused by name (the «המשיק» rule); a full description that matches none is built (#1727)', () => {
    expect(derive(['משולש ABC', 'E על האנך'], 0).faults[0]).toMatchObject({ code: 'ambiguous-shape', host: { kind: 'perpendicular', found: 0 } });
    expect(derive(['משולש ABC', 'האנך מ-A ל-BC', 'האנך מ-B ל-AC', 'E על האנך'], 0).faults[0]).toMatchObject({
      code: 'ambiguous-shape',
      host: { kind: 'perpendicular', found: 2 },
    });
    const built = clean(derive(['משולש ABC', 'האנך מ-A ל-BC', 'E על האנך מ-C ל-AB'], 0));
    expect(built.figure.points.map((p) => p.id).sort()).toEqual(['A', 'B', 'C', 'E', 'G', 'H']);
    expect(built.figure.segments.map((s) => s.id).filter((id) => id.startsWith('seg-')).sort()).toEqual(['seg-AH', 'seg-CG']);
    // …and a description picks one of several
    const d = clean(derive(['משולש ABC', 'האנך מ-A ל-BC', 'האנך מ-B ל-AC', 'E על האנך מ-B ל-AC'], 0));
    const [a, c, b, e] = ['A', 'C', 'B', 'E'].map((id) => pt(d, id));
    expect(Math.abs(dot(sub(e, b), sub(c, a)))).toBeLessThan(1e-6 * Math.max(1, dot(sub(c, a), sub(c, a))) * Math.max(1, Math.hypot(e.x - b.x, e.y - b.y)));
  });
});

describe('a straight piece as the shared subject — «הצלע CB מקבילה לציר ה-x, וחותכת את ציר ה-y בנקודה E»', () => {
  it('reads as the two sentences, with or without the comma, and the crossing is on the side', () => {
    for (const s of ['הצלע CB מקבילה לציר ה-x, וחותכת את ציר ה-y בנקודה E', 'הצלע CB מקבילה לציר ה-x וחותכת את ציר ה-y בנקודה E']) {
      const d = clean(derive(['משולש ABC', 'B(6,4)', 'C(-2,4)', s], 0));
      expect(pt(d, 'E').x).toBeCloseTo(0, 9);
      expect(pt(d, 'E').y).toBeCloseTo(4, 9);
    }
  });
});

describe('«הקטע EF מקביל ל-DA» NAMES the segment — a new end is a free point the relation constrains', () => {
  /*
   * Every spelling introduces F: «הקטע» by this ADR (operator ruling 2026-10-02 on #1620, "Create F"), and the bare
   * pair, «הצלע» and «הישר» by #1670 row 4 / #1686 (ADR-AG-210 — a two-pair relation mints its new letters, 2-D's rule).
   * 2-D owes all four: it refuses them with a solver conflict, not by rule (#1677).
   */
  it.each(['הקטע EF מקביל ל-AC', 'EF ∥ AC', 'הצלע EF מקבילה ל-AC', 'הישר EF מקביל ל-AC'])('«%s» — F is introduced and slides on the parallel through E', (line) => {
    for (const seed of [0, 1, 2]) {
      const d = clean(derive(['משולש ABC', 'E על BC', line], seed));
      const [a, c, e, f] = ['A', 'C', 'E', 'F'].map((id) => pt(d, id));
      expect(Math.abs(cross(sub(f, e), sub(c, a)))).toBeLessThan(1e-6 * Math.max(1, dot(sub(c, a), sub(c, a))));
    }
  });
});

// ---------------------------------------------------------------------------
// The corpus questions this stream completes (S1's taught lines in place of the imperatives)
// ---------------------------------------------------------------------------

interface CorpusQuestion {
  id: string;
  lines: string[];
}
const CORPUS: CorpusQuestion[] = JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'corpus471.json'), 'utf8'));
/** S1's contract: the line index → the canonical sentence the imperative is taught as. */
const TAUGHT: Record<string, Record<number, string>> = {
  '2/4': { 1: 'הקטע EF מקביל ל-DA', 5: 'הנקודה E נמצאת על הצלע DC' },
  '5/5': { 3: 'המשיק למעגל בנקודה C', 4: 'האנך מהנקודה B לציר ה-x' },
  '13/4': { 8: 'הישר העובר דרך הנקודה E מקביל לציר ה-y וחותך את הצלע AB בנקודה F' },
  '14/4': { 6: 'הישר העובר דרך הנקודה D מקביל לציר ה-x וחותך את הצלע AB בנקודה E' },
  '17/4': { 3: 'האנך מהקודקוד C לציר ה-x חותך אותו בנקודה D (ראו סרטוט)' },
  '20/4': { 2: 'האנכים מהקודקודים A ו-C לציר ה-x חותכים אותו בנקודות E ו-F בהתאמה (ראו סרטוט)' },
  '21/5': { 3: 'המשיק למעגל בנקודה D' },
};
const question = (id: string): string[] => {
  const q = CORPUS.find((c) => c.id === id);
  if (!q) throw new Error(id);
  return q.lines.map((l, i) => TAUGHT[id]?.[i] ?? l);
};
/**
 * Every line lands, and — typed one at a time — the app records each (the submit path, not only the fold). Lines
 * before `from` are taken as the figure already typed (a question whose OWN earlier lines lean on the fold's
 * deferral — 5/5 names B in «הישר MB» a line before giving it — is outside this stream).
 */
const typedInOrder = (lines: readonly string[], skip: readonly number[] = [], from = 0) => {
  const kept: string[] = [];
  lines.forEach((line, i) => {
    if (skip.includes(i)) return;
    if (i < from) {
      kept.push(line);
      return;
    }
    const v = decideSubmit(line, kept, 0);
    expect(v.kind, `«${line}»: ${JSON.stringify(v)}`).toBe('record');
    kept.push(line);
  });
  return kept;
};

describe('corpus 471 — the questions S2 completes', () => {
  it('5/5: D = the tangent at C × the perpendicular from B (1, 7.75); E on it with ME ∥ CD (1, 1.5)', () => {
    const lines = question('5/5');
    const d = clean(derive(typedInOrder(lines, [], 3), 0));
    expect(pt(d, 'C')).toMatchObject({ x: expect.closeTo(4, 6), y: expect.closeTo(10, 6) });
    expect(pt(d, 'D')).toMatchObject({ x: expect.closeTo(1, 6), y: expect.closeTo(7.75, 6) });
    expect(pt(d, 'E')).toMatchObject({ x: expect.closeTo(1, 6), y: expect.closeTo(1.5, 6) });
    expect(pt(d, 'H')).toMatchObject({ x: expect.closeTo(1, 9), y: expect.closeTo(0, 9) });
  });

  it('16/5 as printed: CB ∥ x-axis cuts the y-axis at E (0, 10), with DO/DE = 2/3 and AB ⊥ AC', () => {
    const lines = CORPUS.find((c) => c.id === '16/5')!.lines;
    const d = clean(derive(typedInOrder(lines), 0));
    expect(pt(d, 'E')).toMatchObject({ x: expect.closeTo(0, 6), y: expect.closeTo(10, 6) });
    expect(pt(d, 'C').y).toBeCloseTo(10, 6);
    expect(pt(d, 'B').y).toBeCloseTo(10, 6);
    expect(between(pt(d, 'E'), pt(d, 'C'), pt(d, 'B'))).toBe(true);
    const [a, b, c] = ['A', 'B', 'C'].map((id) => pt(d, id));
    expect(Math.abs(dot(sub(b, a), sub(c, a)))).toBeLessThan(1e-6 * dot(sub(c, a), sub(c, a)));
  });

  it('17/4: D is the foot of C on the x-axis, CD/OB = 5/2', () => {
    const d = clean(derive(typedInOrder(question('17/4')), 0));
    expect(pt(d, 'D').x).toBeCloseTo(pt(d, 'C').x, 9);
    expect(pt(d, 'D').y).toBeCloseTo(0, 9);
    expect(Math.abs(pt(d, 'C').y) / Math.abs(pt(d, 'B').x)).toBeCloseTo(2.5, 6);
  });

  it('20/4: E (4, 0) and F (−4, 0) are the feet of A and C', () => {
    const d = clean(derive(typedInOrder(question('20/4')), 0));
    expect(pt(d, 'E')).toMatchObject({ x: expect.closeTo(4, 6), y: expect.closeTo(0, 6) });
    expect(pt(d, 'F')).toMatchObject({ x: expect.closeTo(-4, 6), y: expect.closeTo(0, 6) });
    expect(pt(d, 'A').x).toBeCloseTo(4, 6);
    expect(pt(d, 'C').x).toBeCloseTo(-4, 6);
  });

  it('2/4: F is on AB with EF ∥ DA — typed in the exam’s order, F before it is placed', () => {
    const d = clean(derive(typedInOrder(question('2/4'), [5]), 0));
    expect(pt(d, 'F').x).toBeCloseTo(pt(d, 'E').x, 6);
    expect(pt(d, 'F').y).toBeCloseTo(10, 6);
    expect(between(pt(d, 'E'), pt(d, 'D'), pt(d, 'C'))).toBe(true);
  });

  it('21/5: the tangent at D cuts the axes at B (10, 0) and A (0, 40/3)', () => {
    const d = clean(derive(typedInOrder(question('21/5')), 0));
    expect(pt(d, 'B')).toMatchObject({ x: expect.closeTo(10, 6), y: expect.closeTo(0, 6) });
    expect(pt(d, 'A')).toMatchObject({ x: expect.closeTo(0, 6), y: expect.closeTo(40 / 3, 6) });
  });

  /* 13/4 and 14/4 land every S2 line; each keeps one slice-D line («שיעור ה-y של …»), skipped here and named. */
  it('13/4 (less its slice-D line 5): F = the parallel to the y-axis through E × side AB, between A and B', () => {
    const lines = question('13/4');
    const kept = typedInOrder(lines, [4]);
    const d = clean(derive(kept, 0));
    expect(pt(d, 'F').x).toBeCloseTo(pt(d, 'E').x, 6);
    expect(between(pt(d, 'F'), pt(d, 'A'), pt(d, 'B'))).toBe(true);
  });

  it('14/4 (less its slice-D line 3): E = the parallel to the x-axis through D × side AB, between A and B', () => {
    const kept = typedInOrder(question('14/4'), [2]);
    const d = clean(derive(kept, 0));
    expect(pt(d, 'E').y).toBeCloseTo(pt(d, 'D').y, 6);
    expect(between(pt(d, 'E'), pt(d, 'A'), pt(d, 'B'))).toBe(true);
  });
});
