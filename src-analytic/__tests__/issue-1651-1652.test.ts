/**
 * #1651, #1620 item 2, #1652 (ADR-AG-200) — a role noun is a CLAIM, lowered once; a length given draws the pair it names.
 *
 * - #1651: «המיתר BC מקביל לציר ה-x» was `bad-operand` while «הישר BC …» recorded. The circle's nouns (מיתר, קוטר,
 *   רדיוס, משיק) were missing from the straight-noun registry — and each is a claim, not a synonym. Every rule that
 *   resolves a noun through the registry now also states its claim (`claimFacts`): a chord's ends on the circle, a
 *   diameter through the centre, a radius from the centre, a tangent touching.
 * - #1620 item 2: the same mechanism for «שוק» / «בסיס» / «יתר» (a leg is not in the trapezoid's parallel pair, a base
 *   is, the right angle faces the hypotenuse), so ADR-AG-119's refusal of «אורך השוק BC» lifts WITH its claim.
 * - #1652 (operator ruling 2026-10-02): «OC = 15, BC = 3» draws OC and BC; a DISTANCE spelling draws nothing.
 *
 * Every lock calls the real path (`decideSubmit` line by line, `derive`, `parseLine`), never a reproduction.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import type { Figure } from '../engine/evaluate';
import type { Fact } from '../engine/types';
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
const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
/** The figure at a seed, asserting it holds every given. */
const fig = (lines: string[], seed: number) => {
  const d = derive(lines, seed);
  expect(d.faults, `seed ${seed}`).toEqual([]);
  return d;
};
/** The circle-at-M's centre and radius in a figure. */
const circleOf = (f: Figure) => {
  const c = f.curves.find((k) => k.id === 'circle-at-M')!;
  return c;
};
/** The facts, with every `src` (nested ones included) blanked — the lock compares what a line STATES. */
const factsOf = (line: string): Fact[] => {
  const r = parseLine(line);
  if (!r.ok) throw new Error(`${line}: ${r.code}`);
  return JSON.parse(JSON.stringify(r.facts, (k, v) => (k === 'src' ? '' : v)));
};
const CLAIM_KINDS = new Set(['on-kind', 'diameter-of', 'tangent-of', 'role-of']);
const claimsIn = (line: string) => factsOf(line).filter((f) => CLAIM_KINDS.has(f.t) || (f.t === 'selector' && f.sel.kind === 'distinct'));
const SEEDS = [0, 1, 2, 3];

// ---------------------------------------------------------------------------------------------------------------
describe('#1651 — the measured table: every circle noun records, and states its claim', () => {
  const CTX = ['מעגל M', 'B, C על המעגל'];

  it.each(['הישר BC מקביל לציר ה-x', 'BC מקביל לציר ה-x', 'הקטע BC מקביל לציר ה-x'])('control: «%s» records and claims nothing', (line) => {
    expect(last([...CTX, line])).toBe('record');
    expect(claimsIn(line)).toEqual([]);
  });

  it.each(['המיתר BC מקביל לציר ה-x', 'מיתר BC מקביל לציר ה-x', 'המיתר BC מאונך לציר ה-x', 'אורך המיתר BC הוא 3', 'משוואת המיתר BC היא y=1'])(
    '«%s» records, and states the chord: both ends on the circle, two distinct ends',
    (line) => {
      expect(last([...CTX, line])).toBe('record');
      expect(claimsIn(line)).toEqual([
        { t: 'on-kind', id: 'B', kind: 'circle', src: '' },
        { t: 'on-kind', id: 'C', kind: 'circle', src: '' },
        { t: 'selector', sel: { kind: 'distinct', ids: ['B', 'C'] }, src: '' },
      ]);
    },
  );

  it('the chord claim is THE chord sentence’s: the claim facts equal «BC מיתר במעגל» without its introductions and piece', () => {
    const chord = factsOf('BC מיתר במעגל').filter((f) => f.t !== 'declare' && f.t !== 'segment');
    for (const line of ['המיתר BC מקביל לציר ה-x', 'אורך המיתר BC הוא 3', 'משוואת המיתר BC היא y=1']) expect(claimsIn(line)).toEqual(chord);
  });

  it('«המיתר BC מקביל לציר ה-x» with B and C free: the figure puts both on the circle, BC horizontal (4 seeds)', () => {
    const lines = ['נתון מעגל שמרכזו M', 'נקודה B', 'נקודה C', 'המיתר BC מקביל לציר ה-x'];
    expect(play(lines).verdicts).toEqual(['record', 'record', 'record', 'record']);
    for (const seed of SEEDS) {
      const d = fig(lines, seed);
      const q = pts(d.figure);
      const r = dist(q.M, q.B);
      expect(near(dist(q.M, q.C), r)).toBe(true);
      expect(near(q.B.y, q.C.y)).toBe(true);
      expect(dist(q.B, q.C)).toBeGreaterThan(1e-3);
    }
  });

  it('«אורך המיתר BC הוא 3» → |BC| = 3 with both ends on the circle, and BC is drawn', () => {
    const lines = [...CTX, 'אורך המיתר BC הוא 3'];
    for (const seed of SEEDS) {
      const d = fig(lines, seed);
      const q = pts(d.figure);
      expect(near(dist(q.B, q.C), 3)).toBe(true);
      expect(near(dist(q.M, q.B), dist(q.M, q.C))).toBe(true);
      expect(d.construction.objects.map((o) => o.id)).toContain('seg-BC');
    }
  });

  it('«הקוטר BC מקביל לציר ה-x» → the centre is the midpoint of BC (4 seeds)', () => {
    const lines = ['נתון מעגל שמרכזו M', 'נקודה B', 'נקודה C', 'הקוטר BC מקביל לציר ה-x'];
    expect(play(lines).verdicts.at(-1)).toBe('record');
    for (const seed of SEEDS) {
      const q = pts(fig(lines, seed).figure);
      expect(near(q.M.x, (q.B.x + q.C.x) / 2) && near(q.M.y, (q.B.y + q.C.y) / 2)).toBe(true);
      expect(near(q.B.y, q.C.y)).toBe(true);
    }
  });

  it('«הרדיוס MB מקביל לציר ה-x» → B on the circle, MB horizontal; «הרדיוס BM» means the same (the centre end decides)', () => {
    for (const line of ['הרדיוס MB מקביל לציר ה-x', 'הרדיוס BM מקביל לציר ה-x']) {
      const lines = ['נתון מעגל שמרכזו M', 'נקודה B', line];
      expect(play(lines).verdicts.at(-1)).toBe('record');
      for (const seed of SEEDS) {
        const d = fig(lines, seed);
        const q = pts(d.figure);
        const c = circleOf(d.figure);
        expect(c).toBeDefined();
        expect(near(q.M.y, q.B.y)).toBe(true);
        expect(dist(q.M, q.B)).toBeGreaterThan(1e-3);
      }
      expect(claimsIn(line)).toEqual([{ t: 'role-of', role: 'radius', a: line.includes('MB') ? 'M' : 'B', b: line.includes('MB') ? 'B' : 'M', src: '' }]);
    }
  });

  it('«המשיק BC מקביל לציר ה-x» → the LINE BC is drawn, and the circle touches it: |M − line BC| = r (4 seeds)', () => {
    const lines = ['נתון מעגל שמרכזו M', 'B על המעגל', 'נקודה C', 'המשיק BC מקביל לציר ה-x'];
    expect(play(lines).verdicts.at(-1)).toBe('record');
    for (const seed of SEEDS) {
      const d = fig(lines, seed);
      const q = pts(d.figure);
      expect(near(q.B.y, q.C.y)).toBe(true);
      // The line BC is horizontal at y = B.y; the circle through B is tangent to it iff |M.y − B.y| = |MB|.
      expect(near(Math.abs(q.M.y - q.B.y), dist(q.M, q.B))).toBe(true);
      expect(d.figure.curves.some((c) => c.id === 'line-BC')).toBe(true);
    }
  });
});

describe('#1651 — a claim that conflicts is refused, naming the line', () => {
  it('«המיתר BC …» with C placed off the circle → unsatisfiable', () => {
    expect(last(['נתון מעגל שמרכזו M(0,0) ורדיוסו 5', 'B(3,4)', 'C(1,1)', 'המיתר BC מקביל לציר ה-x'])).toBe('refused:unsatisfiable');
  });

  it('…and with C free the claim PINS it: C = (−3, 4)', () => {
    const lines = ['נתון מעגל שמרכזו M(0,0) ורדיוסו 5', 'B(3,4)', 'נקודה C', 'המיתר BC מקביל לציר ה-x'];
    expect(play(lines).verdicts.at(-1)).toBe('record');
    const q = pts(fig(lines, 0).figure);
    expect(near(q.C.x, -3) && near(q.C.y, 4)).toBe(true);
  });

  it('«הרדיוס KB» when the circle’s centre is M → conflicting-restatement (neither end is the centre)', () => {
    expect(last(['נתון מעגל שמרכזו M', 'נקודה B', 'נקודה K', 'הרדיוס KB מקביל לציר ה-x'])).toBe('refused:conflicting-restatement');
  });

  it('«השוק AB» when the student stated AB ∥ DC → conflicting-restatement (a leg is not in the parallel pair)', () => {
    expect(last(['טרפז ABCD', 'AB ∥ DC', 'השוק AB = 5'])).toBe('refused:conflicting-restatement');
  });

  it('a role with no polygon to belong to is refused, never dropped: «השוק AB = 5» over two bare points', () => {
    expect(last(['נקודה A', 'נקודה B', 'השוק AB = 5'])).toBe('refused:ambiguous-shape');
  });

  it('a circle noun with no circle is the contextual refusal: «המיתר BC …» before any circle', () => {
    expect(last(['נקודה B', 'נקודה C', 'המיתר BC מקביל לציר ה-x'])).toBe('refused:ambiguous-shape');
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('#1620 item 2 — שוק / בסיס / יתר state their claims', () => {
  it('a leg of a trapezoid: «השוק AB = 5» displaces the assumed AB ∥ DC — BC ∥ AD in the figure, |AB| = 5', () => {
    const lines = ['טרפז ABCD', 'השוק AB = 5'];
    expect(play(lines).verdicts).toEqual(['record', 'record']);
    for (const seed of SEEDS) {
      const q = pts(fig(lines, seed).figure);
      const cross = (q.C.x - q.B.x) * (q.D.y - q.A.y) - (q.C.y - q.B.y) * (q.D.x - q.A.x);
      expect(near(cross / (dist(q.B, q.C) * dist(q.A, q.D)), 0)).toBe(true);
      expect(near(dist(q.A, q.B), 5)).toBe(true);
    }
  });

  it('the hypotenuse: «היתר AC = 10» in a right triangle seats the right angle at B (4 seeds)', () => {
    const lines = ['משולש ישר זווית ABC', 'היתר AC = 10'];
    for (const seed of SEEDS) {
      const q = pts(fig(lines, seed).figure);
      const dot = (q.A.x - q.B.x) * (q.C.x - q.B.x) + (q.A.y - q.B.y) * (q.C.y - q.B.y);
      expect(near(dot / (dist(q.A, q.B) * dist(q.C, q.B)), 0)).toBe(true);
      expect(near(dist(q.A, q.C), 10)).toBe(true);
    }
  });

  it('the base of an isosceles triangle: «הבסיס BC = 6» → |AB| = |AC| (4 seeds)', () => {
    const lines = ['משולש שווה שוקיים ABC', 'הבסיס BC = 6'];
    for (const seed of SEEDS) {
      const q = pts(fig(lines, seed).figure);
      expect(near(dist(q.A, q.B), dist(q.A, q.C))).toBe(true);
      expect(near(dist(q.B, q.C), 6)).toBe(true);
    }
  });

  it('«הנקודה E נמצאת על השוק AD» in a trapezoid: E between A and D, the leg claim states the parallel pair', () => {
    const lines = ['טרפז ABCD', 'הנקודה E נמצאת על השוק AD'];
    expect(play(lines).verdicts).toEqual(['record', 'record']);
    expect(claimsIn('הנקודה E נמצאת על השוק AD')).toEqual([{ t: 'role-of', role: 'leg', a: 'A', b: 'D', src: '' }]);
    for (const seed of SEEDS) {
      const q = pts(fig(lines, seed).figure);
      expect(near(dist(q.A, q.E) + dist(q.E, q.D), dist(q.A, q.D))).toBe(true);
    }
  });

  it('«תיכון» and «גובה» stay refused in a length — their claim is not lowered, so it is never dropped', () => {
    for (const line of ['התיכון BC = 10', 'הגובה BC = 10', 'אורך התיכון BC הוא 10']) expect(parseLine(line).ok).toBe(false);
  });

  /** The two corpus questions ADR-AG-187 left one role noun short — each line typed in turn, figure as printed. */
  it('corpus 14/5 builds line by line: A(2,3), B(5,5), C(6,3.5) — AC on 8y − x − 22 = 0, right angle at B', () => {
    const { verdicts, kept } = play(corpus('14/5'));
    expect(verdicts.every((v) => v === 'record')).toBe(true);
    const d = fig(kept, 0);
    expect(d.figure.carrierDof).toBe(0);
    const q = pts(d.figure);
    [q.A.x, q.A.y, q.B.x, q.B.y, q.C.x, q.C.y].forEach((v, i) => expect(v).toBeCloseTo([2, 3, 5, 5, 6, 3.5][i], 5));
  });

  it('corpus 22/4 builds line by line: A(4,8), B(0,6), C(−6,0), D(5.2,5.6), |BC| = √72', () => {
    const { verdicts, kept } = play(corpus('22/4'));
    expect(verdicts.every((v) => v === 'record')).toBe(true);
    const d = fig(kept, 0);
    expect(d.figure.carrierDof).toBe(0);
    const q = pts(d.figure);
    [q.A.x, q.A.y, q.B.x, q.B.y, q.C.x, q.C.y, q.D.x, q.D.y].forEach((v, i) => expect(v).toBeCloseTo([4, 8, 0, 6, -6, 0, 5.2, 5.6][i], 5));
    expect(near(dist(q.B, q.C), Math.sqrt(72))).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('#1652 — a length given draws the pair it names; a distance draws nothing', () => {
  const segs = (lines: string[]) => derive(lines, 0).construction.objects.filter((o) => o.kind === 'segment').map((o) => o.id).sort();
  const OBC = ['נקודה O', 'נקודה B', 'נקודה C'];

  it('«OC = 15, BC = 3» draws OC and BC', () => {
    expect(play([...OBC, 'OC = 15, BC = 3']).verdicts.at(-1)).toBe('record');
    expect(segs([...OBC, 'OC = 15, BC = 3'])).toEqual(['seg-BC', 'seg-CO']);
  });

  it.each(['המרחק בין O ל-C הוא 15', 'd_{OC} = 15', '|OC| = 15', 'המרחק OC = 15'])('«%s» states the distance and draws nothing', (line) => {
    const lines = [...OBC, line];
    expect(play(lines).verdicts.at(-1)).toBe('record');
    expect(segs(lines)).toEqual([]);
    const q = pts(fig(lines, 0).figure);
    expect(near(dist(q.O, q.C), 15)).toBe(true);
  });

  it.each([
    ['AB = 2CD', ['seg-AB', 'seg-CD']],
    ['AB + BC = 10', ['seg-AB', 'seg-BC']],
    ['AC:CB = 3:2', ['seg-AC', 'seg-BC']],
    ['אורך הקטע AB הוא 3', ['seg-AB']],
  ])('«%s» draws every pair it names', (line, expected) => {
    const lines = ['נקודה A', 'נקודה B', 'נקודה C', 'נקודה D', line];
    expect(play(lines).verdicts.at(-1)).toBe('record');
    expect(segs(lines)).toEqual(expected);
  });

  it('a named pair beside a distance: «AB = המרחק בין C ל-D» draws AB and not CD', () => {
    const lines = ['נקודה A', 'נקודה B', 'נקודה C', 'נקודה D', 'AB = המרחק בין C ל-D'];
    expect(segs(lines)).toEqual(['seg-AB']);
  });

  it('the length is still a length: the drawn segment is beside it, never instead of it', () => {
    const lines = ['A(0,0)', 'B(3,4)', 'AB = 5'];
    const d = fig(lines, 0);
    expect(d.construction.constraints.some((k) => k.t === 'length-eq')).toBe(true);
    expect(last(['A(0,0)', 'B(3,4)', 'AB = 6'])).toBe('refused:unsatisfiable');
  });

  it('a length over points that do not exist still refuses — the drawn piece never introduces them', () => {
    expect(last(['OC = 15'])).toBe('refused:unknown-reference');
  });
});
