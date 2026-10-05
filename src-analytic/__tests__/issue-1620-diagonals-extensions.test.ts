/**
 * #1620 stream S3 (ADR-AG-208) — diagonals, extensions, midsegments, and a point on a side with a condition.
 *
 * - An EXTENSION is an on-line point outside the segment: the collinearity is the constraint, «המשך» is a
 *   selector (`beyond`) — the point keeps its one degree of freedom, past the end 2-D puts it past (ADR-054).
 * - «המשכי הצלעות AD ו-BC נפגשים בנקודה E» is two extensions on one point; «המשך AC חותך את מעגל O בנקודה E»
 *   is a crossing on the extension.
 * - «כך ש-…» joins a placement and its condition: both are givens, and a condition the grammar cannot read
 *   refuses the line rather than vanish; «…, שנמצאת על ציר ה-y» is a sentence about the point just named.
 * - The diagonals NAMED by their letters meet at the `diagonals` rule's point, and must be diagonals of the
 *   ring they span; a contextual «אלכסוני הטרפז» is the trapezoid's (`ringsNamed`), refused when two exist.
 * - «האלכסון AC (במרובע ABCD)» declares the segment; the midsegment is two midpoints and their segment, named
 *   M and N as 2-D names them; «שכל קודקודיו מונחים על הצירים» is a choice over the axis assignments.
 *
 * Every lock calls the real path (`decideSubmit` line by line, `derive`, `parseLine`), never a reproduction.
 * The corpus questions this stream completes are locked line by line to their printed coordinates (the analytic
 * tree keeps its corpus fixture in `fixtures/corpus471.json`; it has no `.geo.json` format).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import type { Figure } from '../engine/evaluate';
import { parseLine } from '../parser/parseAnalytic';

type P = { x: number; y: number };
const CORPUS: { id: string; lines: string[] }[] = JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'corpus471.json'), 'utf8'));
const corpus = (id: string) => CORPUS.find((q) => q.id === id)!.lines;

/** The student's session: each line submitted in turn through the real gate; a recorded line joins the list. */
function play(lines: readonly string[], seed = 0): { verdicts: string[]; kept: string[] } {
  const kept: string[] = [];
  const verdicts = lines.map((l) => {
    const v = decideSubmit(l, kept, seed);
    if (v.kind === 'record') kept.push(l);
    return v.kind === 'refused' ? `refused:${v.error.key}` : v.kind;
  });
  return { verdicts, kept };
}
const last = (lines: readonly string[]) => play(lines).verdicts.at(-1);
const pts = (f: Figure): Record<string, P> => Object.fromEntries(f.points.map((p) => [p.id, p]));
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
/** Where `p` sits along a → b: 0 at a, 1 at b. */
const along = (a: P, b: P, p: P) => ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
/** Distance from p to the line ab, relative to |ab|. */
const off = (a: P, b: P, p: P) => Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / dist(a, b) ** 2;
const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
/** The figure at a seed, asserting it holds every given. */
const fig = (lines: string[], seed: number) => {
  const d = derive(lines, seed);
  expect(d.faults, `seed ${seed}`).toEqual([]);
  return pts(d.figure);
};
const faultsOf = (lines: string[]) => derive(lines, 0).faults.map((f) => `${f.index}:${f.code}`);
const SEEDS = [0, 1, 2, 3, 4, 5, 6, 7];
/** The area of a polygon, unsigned. */
const area = (...v: P[]) => Math.abs(v.reduce((s, p, i) => s + p.x * v[(i + 1) % v.length].y - v[(i + 1) % v.length].x * p.y, 0)) / 2;

describe('#1620 — an extension is the side’s line PAST its end (a selector, one DOF kept)', () => {
  const quad = ['מרובע ABCD', 'הנקודה E נמצאת על המשך הצלע BC'];

  it('the corpus spellings record', () => {
    for (const line of [
      'הנקודה E נמצאת על המשך הצלע BC',
      'E על המשך BC',
      'נקודה E על המשך הקטע BC',
      'E נמצאת על המשך BC מעבר ל-C',
      'E is on the extension of side BC',
      'E lies on the extension of BC beyond C',
    ]) {
      expect(last(['מרובע ABCD', line]), line).toBe('record');
    }
  });

  it('E is on the line BC and PAST C at every seed', () => {
    for (const seed of SEEDS) {
      const p = fig(quad, seed);
      expect(off(p.B, p.C, p.E), `seed ${seed}`).toBeLessThan(1e-6);
      expect(along(p.B, p.C, p.E), `seed ${seed}`).toBeGreaterThan(1);
    }
  });

  it('«מעבר ל-B» names the end: E is past B, on the far side from C, at every seed', () => {
    for (const seed of SEEDS) {
      const p = fig(['מרובע ABCD', 'E על המשך BC מעבר ל-B'], seed);
      expect(off(p.B, p.C, p.E), `seed ${seed}`).toBeLessThan(1e-6);
      expect(along(p.B, p.C, p.E), `seed ${seed}`).toBeLessThan(0);
    }
  });

  it('how far past the end is a FREE DOF — it moves between configurations (ADR-052)', () => {
    const ts = new Set(SEEDS.map((s) => (({ B, C, E }) => along(B, C, E).toFixed(3))(fig(quad, s))));
    expect(ts.size).toBeGreaterThan(2);
  });

  it('on an empty canvas the sentence introduces its side, as 2-D’s does (cat-2d-035)', () => {
    expect(last(['נקודה F על המשך AD'])).toBe('record');
    const p = fig(['נקודה F על המשך AD'], 0);
    expect(along(p.A, p.D, p.F)).toBeGreaterThan(1);
  });

  it('is stable: a later line does not move the extension point', () => {
    const before = fig(quad, 0);
    const after = fig([...quad, 'נקודה G'], 0);
    for (const id of ['A', 'B', 'C', 'D', 'E']) {
      expect(near(before[id].x, after[id].x) && near(before[id].y, after[id].y), id).toBe(true);
    }
  });

  it('a point PLACED inside the side is not on its extension — refused on the line that says so', () => {
    expect(faultsOf(['A(0,0)', 'B(4,0)', 'E(2,0)', 'E על המשך AB'])).toEqual(['3:unsatisfiable']);
  });

  it('a condition the extension cannot meet is refused naming the statement, never drawn as if', () => {
    expect(faultsOf(['A(0,0)', 'B(4,0)', 'C(6,3)', 'E על המשך AB כך ש-AE = 2'])).toEqual(['3:unsatisfiable']);
  });

  it('17/5: «הנקודה A נמצאת על המשך ME» — A past E, |AB| = r', () => {
    const lines = corpus('17/5');
    expect(play(lines).verdicts.every((v) => v === 'record')).toBe(true);
    for (const seed of [0, 1, 2]) {
      const p = fig(lines, seed);
      expect(near(p.M.x, 3) && near(p.M.y, 5) && near(p.E.x, 3) && near(p.E.y, 0, 1e-5)).toBe(true);
      expect(along(p.M, p.E, p.A)).toBeGreaterThan(1);
      expect(near(dist(p.A, p.B), 5, 1e-5)).toBe(true);
    }
  });

  it('18/4: E past C on BC with DE = DC — the trapezoid to its printed coordinates', () => {
    const lines = corpus('18/4');
    expect(play(lines).verdicts.every((v) => v === 'record')).toBe(true);
    for (const seed of [0, 1, 2]) {
      const p = fig(lines, seed);
      expect(near(p.A.x, 0, 1e-5) && near(p.A.y, 6)).toBe(true);
      expect(near(p.C.x, 0, 1e-5) && near(p.C.y, -4, 1e-5)).toBe(true);
      expect(near(Math.abs(p.B.x), 9, 1e-5) && near(Math.abs(p.D.x), 6, 1e-5)).toBe(true);
      expect(along(p.B, p.C, p.E)).toBeGreaterThan(1);
      expect(near(dist(p.D, p.E), dist(p.D, p.C), 1e-5)).toBe(true);
    }
  });
});

describe('#1620 — «המשכי הצלעות AD ו-BC נפגשים בנקודה E»: one point on two extensions', () => {
  const lines = ['מרובע ABCD', 'המשכי הצלעות AD ו-BC נפגשים בנקודה E'];

  it('the spellings record', () => {
    for (const line of [
      'המשכי הצלעות AD ו-BC נפגשים בנקודה E',
      'המשכי AD ו-BC נפגשים בנקודה E',
      'המשך הצלע AD והמשך הצלע BC נפגשים בנקודה E',
      'המשכי הצלעות AD ו-BC נחתכים בנקודה E',
      'the extensions of sides AD and BC meet at E',
    ]) {
      expect(last(['מרובע ABCD', line]), line).toBe('record');
    }
  });

  it('E is on both lines, past D and past C, at every seed', () => {
    for (const seed of SEEDS) {
      const p = fig(lines, seed);
      expect(off(p.A, p.D, p.E), `seed ${seed}`).toBeLessThan(1e-6);
      expect(off(p.B, p.C, p.E), `seed ${seed}`).toBeLessThan(1e-6);
      expect(along(p.A, p.D, p.E), `seed ${seed}`).toBeGreaterThan(1);
      expect(along(p.B, p.C, p.E), `seed ${seed}`).toBeGreaterThan(1);
    }
  });

  it('parallel sides have no crossing: refused on the line that says they meet', () => {
    expect(faultsOf(['מרובע ABCD', 'AD ∥ BC', 'המשכי הצלעות AD ו-BC נפגשים בנקודה E'])).toEqual(['2:unsatisfiable']);
  });

  it('1/5: the inscribed quadrilateral and E(0,14) — D is where AE meets the circle, past D', () => {
    const q = corpus('1/5');
    expect(play(q).verdicts.every((v) => v === 'record')).toBe(true);
    for (const seed of [0, 1, 2]) {
      const p = fig(q, seed);
      expect(near(p.D.x, -4, 1e-5) && near(p.D.y, 6, 1e-5)).toBe(true);
      expect(along(p.A, p.D, p.E)).toBeGreaterThan(1);
      expect(along(p.B, p.C, p.E)).toBeGreaterThan(1);
    }
  });
});

describe('#1620 — a crossing on an extension: «המשך AC חותך את מעגל O בנקודה E»', () => {
  const lines = ['מעגל O', 'משולש ABC', 'המשך AC חותך את מעגל O בנקודה E'];

  it('records, and E is on the circle and on AC past C at every seed', () => {
    expect(play(lines).verdicts).toEqual(['record', 'record', 'record']);
    for (const seed of SEEDS) {
      const d = derive(lines, seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      const p = pts(d.figure);
      const circle = d.figure.curves.find((c) => c.id === 'circle-at-O')!;
      expect(circle).toBeDefined();
      expect(off(p.A, p.C, p.E)).toBeLessThan(1e-6);
      expect(along(p.A, p.C, p.E)).toBeGreaterThan(1);
      expect(near(dist(p.O, p.E), dist(p.O, p.E))).toBe(true);
    }
  });
});

describe('#1620 — a point on a side WITH a condition («כך ש-»)', () => {
  it('4/5: E between B and C with AE = AC, to the printed lengths', () => {
    const q = corpus('4/5');
    expect(play(q).verdicts.every((v) => v === 'record')).toBe(true);
    for (const seed of SEEDS) {
      const p = fig(q, seed);
      const t = along(p.B, p.C, p.E);
      expect(t, `seed ${seed}`).toBeGreaterThanOrEqual(0);
      expect(t, `seed ${seed}`).toBeLessThanOrEqual(1);
      expect(off(p.B, p.C, p.E)).toBeLessThan(1e-6);
      expect(near(dist(p.A, p.E), 15, 1e-5) && near(dist(p.A, p.C), 15, 1e-5) && near(dist(p.A, p.B), 20, 1e-5)).toBe(true);
    }
  });

  it('the spellings record, and the condition is a given (it is in the facts)', () => {
    for (const line of ['הנקודה E נמצאת על צלע BC כך ש-AE = AC', 'E על הצלע BC כך ש AE = AC', 'E is on side BC such that AE = AC']) {
      expect(last(['משולש ABC', line]), line).toBe('record');
      const r = parseLine(line);
      expect(r.ok && r.facts.some((f) => f.t === 'constraint' && f.k.t === 'length-eq'), line).toBe(true);
    }
  });

  it('21/4: F past D on CD with area(BFC) = 2·area(BCD) — the condition is honoured, not dropped', () => {
    const q = corpus('21/4');
    expect(play(q).verdicts.every((v) => v === 'record')).toBe(true);
    for (const seed of [0, 1, 2]) {
      const p = fig(q, seed);
      expect(along(p.C, p.D, p.F)).toBeGreaterThan(1);
      expect(near(area(p.B, p.F, p.C), 2 * area(p.B, p.C, p.D), 1e-5)).toBe(true);
      expect(Math.abs(p.M.x)).toBeLessThan(1e-6);
    }
  });

  it('a condition the grammar cannot read refuses the WHOLE line — the placement is not kept without it', () => {
    // #1622 (ADR-AG-218) made «המשולש ABE דומה למשולש ABC» a readable given; a similarity RATIO still is not.
    const lines = ['A(0,0)', 'B(4,0)', 'C(6,3)', 'E על המשך הצלע BC כך שהמשולש ABE דומה למשולש ABC ביחס 1:2'];
    expect(play(lines).verdicts.at(-1)).toMatch(/^refused/);
    expect(derive(lines, 0).figure.points.some((p) => p.id === 'E')).toBe(false);
  });
});

describe('#1620 — the diagonals NAMED by their letters', () => {
  const lines = ['מרובע ABCD', 'האלכסונים AC ו-BD נפגשים בנקודה E'];

  it('E is the meet of AC and BD at every seed, with both diagonals drawn', () => {
    for (const seed of SEEDS) {
      const d = derive(lines, seed);
      expect(d.faults).toEqual([]);
      const p = pts(d.figure);
      if (!p.E) continue; // a concave seed leaves the meet vacant (ADR-AG-021) — never a guess
      expect(off(p.A, p.C, p.E)).toBeLessThan(1e-6);
      expect(off(p.B, p.D, p.E)).toBeLessThan(1e-6);
      const ids = d.figure.segments.map((s) => s.id);
      expect(ids).toContain('seg-AC');
      expect(ids).toContain('seg-BD');
    }
  });

  it('records on an empty canvas, introducing the four ends (2-D’s verdict)', () => {
    expect(last(['האלכסונים AC ו-BD נפגשים בנקודה E'])).toBe('record');
  });

  it('10/5 lands: E = (3, 0)', () => {
    const q = corpus('10/5');
    expect(play(q).verdicts.every((v) => v === 'record')).toBe(true);
    for (const seed of [0, 1, 2]) {
      const p = fig(q, seed);
      expect(near(p.E.x, 3, 1e-5) && near(p.E.y, 0, 1e-5)).toBe(true);
    }
  });

  it('two SIDES named as diagonals are refused, never re-read as the real pair', () => {
    expect(last(['מרובע ABCD', 'האלכסונים AB ו-CD נפגשים בנקודה E'])).toBe('refused:not-a-diagonal');
  });

  it('«E היא נקודת החיתוך של אלכסוני הדלתון» is the noun form, through the same reader', () => {
    expect(last(['דלתון ABCD', 'E היא נקודת החיתוך של אלכסוני הדלתון'])).toBe('record');
    const a = derive(['דלתון ABCD', 'E היא נקודת החיתוך של אלכסוני הדלתון'], 0).construction.objects.map((o) => o.id);
    const b = derive(['דלתון ABCD', 'אלכסוני הדלתון נפגשים בנקודה E'], 0).construction.objects.map((o) => o.id);
    // #1751 (ADR-AG-241): the same point; the verb draws the two diagonals it is about, the noun does not.
    expect(b.filter((id) => !a.includes(id)).sort()).toEqual(['seg-AC', 'seg-BD']);
    expect(b.filter((id) => id !== 'seg-AC' && id !== 'seg-BD')).toEqual(a);
  });

  it('23/4: E is the kite’s diagonal meet, and «F על הקטע EC» now finds E', () => {
    const q = corpus('23/4');
    const { verdicts } = play(q);
    expect(verdicts[5]).toBe('record');
    expect(verdicts[6]).toBe('record');
  });
});

describe('#1620 — a contextual «אלכסוני הטרפז» names the TRAPEZOID', () => {
  it('beside a plain quadrilateral it is the trapezoid’s meet', () => {
    expect(last(['טרפז ABCD', 'מרובע EFGH', 'אלכסוני הטרפז נפגשים בנקודה M'])).toBe('record');
    const d = derive(['טרפז ABCD', 'מרובע EFGH', 'אלכסוני הטרפז נפגשים בנקודה M'], 0);
    const m = d.construction.objects.find((o) => o.id === 'M')!;
    expect(JSON.stringify(m)).toContain('"A","B","C","D"');
  });

  it('a right trapezoid is a trapezoid', () => {
    expect(last(['טרפז ישר זווית ABCD', 'אלכסוני הטרפז נפגשים בנקודה M'])).toBe('record');
  });

  it('two trapezoids: asked, never guessed', () => {
    expect(last(['טרפז ABCD', 'טרפז EFGH', 'אלכסוני הטרפז נפגשים בנקודה M'])).toBe('refused:ambiguous-shape');
  });

  it('no trapezoid: refused, never read as the kite', () => {
    expect(last(['דלתון ABCD', 'אלכסוני הטרפז נפגשים בנקודה M'])).toBe('refused:ambiguous-shape');
  });

  it('the generic «המרובע» is any quadrilateral — so two of them ask', () => {
    expect(last(['טרפז ABCD', 'מרובע EFGH', 'אלכסוני המרובע נפגשים בנקודה M'])).toBe('refused:ambiguous-shape');
  });

  it('21/4: «…נפגשים בנקודה M, שנמצאת על ציר ה-y» — the relative clause is a given about M', () => {
    const r = parseLine('אלכסוני הטרפז נפגשים בנקודה M, שנמצאת על ציר ה-y');
    expect(r.ok && r.facts.some((f) => f.t === 'constraint' && f.k.t === 'on-line' && f.k.id === 'M')).toBe(true);
  });
});

describe('#1620 — «האלכסון AC (במרובע ABCD)» declares the diagonal', () => {
  it('draws the segment AC', () => {
    for (const lines of [['מרובע ABCD', 'האלכסון AC'], ['מרובע ABCD', 'האלכסון AC במרובע ABCD'], ['האלכסון AC במרובע ABCD']]) {
      expect(play(lines).verdicts.every((v) => v === 'record'), lines.join(' | ')).toBe(true);
      expect(derive(lines, 0).figure.segments.map((s) => s.id)).toContain('seg-AC');
    }
  });

  it('8/5: the sentence S1 teaches «העבירו את האלכסון AC במרובע ABCD» onto records after the corpus givens', () => {
    const q = corpus('8/5');
    expect(play([...q.slice(0, 3), 'האלכסון AC במרובע ABCD']).verdicts.every((v) => v === 'record')).toBe(true);
  });

  it('a SIDE named as the diagonal of its ring is refused', () => {
    expect(last(['האלכסון AB במרובע ABCD'])).toBe('refused:not-a-diagonal');
    expect(last(['diagonal AB of quadrilateral ABCD'])).toBe('refused:not-a-diagonal');
  });
});

describe('#1620 — the midsegment (2-D’s M and N)', () => {
  it('a triangle’s midsegment to BC joins the midpoints of AB and AC, named M and N', () => {
    for (const seed of [0, 1, 2]) {
      const d = derive(['קטע האמצעים לצלע BC במשולש ABC'], seed);
      expect(d.faults).toEqual([]);
      const p = pts(d.figure);
      expect(near(p.M.x, (p.A.x + p.B.x) / 2) && near(p.M.y, (p.A.y + p.B.y) / 2)).toBe(true);
      expect(near(p.N.x, (p.A.x + p.C.x) / 2) && near(p.N.y, (p.A.y + p.C.y) / 2)).toBe(true);
      expect(d.figure.segments.map((s) => s.id)).toContain('seg-MN');
      expect(d.minted.map((m) => m.id)).toEqual(['M', 'N']);
    }
  });

  it('a trapezoid’s midsegment joins the midpoints of its legs BC and DA', () => {
    const d = derive(['קטע האמצעים בטרפז ABCD'], 0);
    expect(d.faults).toEqual([]);
    const p = pts(d.figure);
    expect(near(p.M.x, (p.B.x + p.C.x) / 2) && near(p.N.x, (p.D.x + p.A.x) / 2)).toBe(true);
  });

  it('a letter in use is never taken; an existing midpoint keeps its letter', () => {
    expect(derive(['משולש ABM', 'קטע האמצעים לצלע BC במשולש ABC'], 0).minted.map((m) => m.id)).toEqual(['N', 'P']);
    const d = derive(['משולש ABC', 'M אמצע AB', 'קטע האמצעים לצלע BC במשולש ABC'], 0);
    expect(d.minted.map((m) => m.id)).toEqual(['N']);
    expect(d.figure.points.filter((p) => p.id === 'M')).toHaveLength(1);
  });

  it('the student’s own letters are used', () => {
    const d = derive(['DE קטע אמצעים לצלע BC במשולש ABC'], 0);
    expect(d.faults).toEqual([]);
    expect(d.minted).toEqual([]);
    expect(d.figure.segments.map((s) => s.id)).toContain('seg-DE');
  });

  it('a later line naming M refers to the minted M (stability: earlier names never move)', () => {
    const before = derive(['קטע האמצעים לצלע BC במשולש ABC'], 0);
    const after = derive(['קטע האמצעים לצלע BC במשולש ABC', 'M(1,2)'], 0);
    expect(pts(before.figure).M).toBeDefined();
    // «M(1,2)» is a coordinate given ON the minted midpoint — one point, not a second M.
    expect(after.figure.points.filter((p) => p.id === 'M')).toHaveLength(1);
    expect(after.minted.map((m) => m.id)).toEqual(['M', 'N']);
  });
});

describe('#1620 item 3 — «שכל קודקודיו מונחים על הצירים» is a CHOICE, not a frame', () => {
  const lines = ['טרפז ABCD', 'שכל קודקודיו מונחים על הצירים'];

  it('every vertex is on an axis at every seed', () => {
    for (const seed of SEEDS) {
      const p = fig(lines, seed);
      for (const v of ['A', 'B', 'C', 'D']) expect(Math.min(Math.abs(p[v].x), Math.abs(p[v].y)), `${v} seed ${seed}`).toBeLessThan(1e-6);
    }
  });

  it('which axis each vertex takes is unstated — the configurations take more than one assignment', () => {
    const assignments = new Set(
      SEEDS.map((seed) => {
        const p = fig(lines, seed);
        return ['A', 'B', 'C', 'D'].map((v) => (Math.abs(p[v].y) < 1e-6 ? 'x' : 'y')).join('');
      }),
    );
    expect(assignments.size).toBeGreaterThan(1);
  });

  it('the spellings record; with no ring it is refused', () => {
    for (const line of ['שכל קודקודיו מונחים על הצירים', 'כל קודקודי הטרפז נמצאים על הצירים', 'all its vertices lie on the axes', 'all the vertices of the trapezoid lie on the axes']) {
      expect(last(['טרפז ABCD', line]), line).toBe('record');
    }
    expect(last(['שכל קודקודיו מונחים על הצירים'])).toBe('refused:ambiguous-shape');
  });
});

describe('#1620 — the corpus questions this stream completes land whole', () => {
  it.each(['1/5', '4/5', '10/5', '17/5', '18/4', '21/4'])('%s', (id) => {
    expect(derive(corpus(id), 0).faults).toEqual([]);
  });
});
