/**
 * #1659 · #1665 · #1663 (ADR-AG-203) — three analytic circle defects, each locked at its mechanism.
 *
 * - #1659: an open curve row printed the TOOL's own symbols («(x − θ_circle-touched.a)² + …»). The row's text is
 *   `openCurveText` (extracted from `App.tsx` so this lock CALLS it); an expression reading a `θ_` symbol is "not
 *   determined by the givens" and prints the panel's dash. Swept over the 471 corpus and every sequence here.
 * - #1665: «AB קוטר במעגל» was refused `out-of-scope` on every circle with no centre LETTER (the only lowering
 *   stated the centre as a point). Now: both ends on the circle, distinct, AB along the radius at A — the chord
 *   through the centre — for an equation circle, a created circle and a computed one. 24-seed sweeps.
 * - #1663: a computed circle among several had no name. «המעגל החוסם את המשולש ABC» / «המעגל החסום במשולש ABC»
 *   (and «המעגל שמרכזו M» after a preposition) fold to the circle-name slot every circle sentence reads, resolved
 *   at M1 by what the figure states; the #1598 centre click offers the ring with that sentence.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { derive, type Derivation } from '../engine/derive';
import { decideSubmit } from '../app/submit';
import { openCurveText, panelListsCurve } from '../app/panelRows';
import { centreSentenceOf, centresOf } from '../engine/crossings';
import { parseLine } from '../parser/parseAnalytic';

/** Type the lines one by one through the submit gate; every verdict, and the lines it recorded. */
function typed(lines: readonly string[], seed = 0): { kinds: string[]; recorded: string[]; last: ReturnType<typeof decideSubmit> } {
  const recorded: string[] = [];
  const kinds: string[] = [];
  let last: ReturnType<typeof decideSubmit> = { kind: 'ignored' };
  for (const l of lines) {
    last = decideSubmit(l, recorded, seed);
    kinds.push(last.kind === 'refused' ? `refused:${last.error.key}` : last.kind);
    if (last.kind === 'record') recorded.push(l);
  }
  return { kinds, recorded, last };
}

const pt = (d: Derivation, id: string) => {
  const p = d.figure.points.find((q) => q.id === id);
  if (!p) throw new Error(`no point ${id}`);
  return p;
};
const circleOf = (d: Derivation, id?: string) => {
  const cu = d.figure.curves.find((c) => c.curve.kind === 'circle' && (id === undefined || c.id === id));
  if (!cu || cu.curve.kind !== 'circle') throw new Error('no circle');
  return cu.curve;
};
const close = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
const SEEDS = Array.from({ length: 24 }, (_, i) => i);

// ---------------------------------------------------------------------------------------------------------------
// #1659
// ---------------------------------------------------------------------------------------------------------------

const TOUCH_1659 = [
  'משולש AOB ישר זווית',
  'O ראשית הצירים',
  'הצלע AO נמצאת על ציר ה-x',
  'הצלע BO נמצאת על ציר ה-y',
  'הצלעות AO ו-BO משיקות למעגל בנקודות D ו-E בהתאמה',
];

/** What no panel row may print: a tool symbol, or an internal id. */
const INTERNAL = /θ_|\b(?:circle|curve|line|poly|seg)-[A-Za-z0-9]/;

/** Every curve row the panel prints open, for a derivation — the panel's own list and its own text. */
const openRows = (d: Derivation): string[] =>
  d.figure.curves.filter(panelListsCurve).map((cu) => openCurveText(d.construction, cu.id));

describe('#1659 — an undetermined curve row never prints the tool’s symbols', () => {
  it('the issue’s touch-created circle reads as the dash', () => {
    const t = typed(TOUCH_1659);
    expect(t.kinds.every((k) => k === 'record')).toBe(true);
    const d = derive(t.recorded, 0);
    expect(d.construction.objects.some((o) => o.id === 'circle-touched')).toBe(true);
    expect(openCurveText(d.construction, 'circle-touched')).toBe('—');
    for (const row of openRows(d)) expect(row).not.toMatch(INTERNAL);
  });

  it('a student’s own open equation still prints symbolically (#1023 unchanged)', () => {
    const d = derive(['נתונה פרבולה שמשוואתה y^2=2px'], 0);
    const rows = openRows(d);
    expect(rows.some((r) => /p/.test(r) && r.includes('= 0'))).toBe(true);
  });

  it('a circle on a centre letter still prints its centre and radius', () => {
    const d = derive(['נתון מעגל שמרכזו M'], 0);
    expect(openRows(d)).toContain('O(M), r = r_M');
  });

  it('sweep: no open row of the 471 corpus or of this file’s sequences carries a tool symbol or an id', () => {
    const corpus: { lines: string[] }[] = JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'corpus471.json'), 'utf8'));
    const sequences = [
      ...corpus.map((q) => q.lines),
      TOUCH_1659,
      [...TOUCH_1659, 'P על המעגל', 'Q על המעגל', 'PQ קוטר במעגל'],
      ['הצלעות AO ו-AB משיקות למעגל בנקודות D ו-E בהתאמה'],
      ...SEQUENCES_1663,
    ];
    let rows = 0;
    for (const lines of sequences) {
      for (const row of openRows(derive(lines, 0))) {
        rows += 1;
        expect(row, lines.join(' · ')).not.toMatch(INTERNAL);
      }
    }
    expect(rows).toBeGreaterThan(20); // the sweep checked something
  });
});

// ---------------------------------------------------------------------------------------------------------------
// #1665
// ---------------------------------------------------------------------------------------------------------------

const EQ = ['x^2+y^2=25', 'A על המעגל', 'B על המעגל'];

describe('#1665 — a diameter on a circle with no centre letter', () => {
  it.each([['AB קוטר במעגל'], ['הקוטר AB מקביל לציר ה-y'], ['הקוטר AB = 10']])('«%s» on an equation circle records', (line) => {
    expect(typed([...EQ, line]).kinds).toEqual(['record', 'record', 'record', 'record']);
  });

  it('24 seeds: on the circle, distinct, through the centre (an equation circle)', () => {
    for (const seed of SEEDS) {
      const d = derive([...EQ, 'AB קוטר במעגל'], seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      const [a, b] = [pt(d, 'A'), pt(d, 'B')];
      expect(close(Math.hypot(a.x, a.y), 5), `seed ${seed}`).toBe(true);
      expect(close(Math.hypot(b.x, b.y), 5), `seed ${seed}`).toBe(true);
      expect(close(Math.hypot(a.x - b.x, a.y - b.y), 10), `seed ${seed}`).toBe(true);
    }
  });

  it('the noun forms hold too: AB vertical, and |AB| = 10', () => {
    for (const seed of [0, 5, 11]) {
      const d = derive([...EQ, 'הקוטר AB מקביל לציר ה-y'], seed);
      expect(d.faults).toEqual([]);
      const [a, b] = [pt(d, 'A'), pt(d, 'B')];
      expect(close(a.x, 0, 1e-6) && close(b.x, 0, 1e-6)).toBe(true);
      expect(close(Math.abs(a.y - b.y), 10)).toBe(true);
    }
  });

  it('24 seeds: a circle a tangency CREATED (centre unnamed) — PQ through its centre', () => {
    const lines = [...TOUCH_1659, 'P על המעגל', 'Q על המעגל', 'PQ קוטר במעגל'];
    expect(typed(lines).kinds.every((k) => k === 'record')).toBe(true);
    let whole = 0;
    for (const seed of SEEDS) {
      const d = derive(lines, seed);
      if (d.faults.length > 0) continue;
      whole += 1;
      const c = circleOf(d);
      const [p, q] = [pt(d, 'P'), pt(d, 'Q')];
      expect(close((p.x + q.x) / 2, c.cx, 1e-5) && close((p.y + q.y) / 2, c.cy, 1e-5), `seed ${seed}`).toBe(true);
      expect(close(Math.hypot(p.x - q.x, p.y - q.y), 2 * c.r, 1e-5), `seed ${seed}`).toBe(true);
    }
    expect(whole).toBe(24);
  });

  it('24 seeds: a computed circle (the circumcircle) — the antipode of A', () => {
    const lines = ['A(0,0)', 'B(6,0)', 'C(2,4)', 'משולש ABC חסום במעגל', 'D על המעגל', 'AD קוטר במעגל'];
    expect(typed(lines).kinds.every((k) => k === 'record')).toBe(true);
    for (const seed of SEEDS) {
      const d = derive(lines, seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      const dd = pt(d, 'D');
      expect(close(dd.x, 6, 1e-6) && close(dd.y, 2, 1e-6), `seed ${seed}: D=(${dd.x},${dd.y})`).toBe(true);
    }
  });

  it('a named centre keeps its exact lowering (the centre is the midpoint)', () => {
    const d = derive(['נתון מעגל שמרכזו M', 'A על המעגל', 'B על המעגל', 'AB קוטר במעגל'], 0);
    expect(d.faults).toEqual([]);
    const [a, b, m] = [pt(d, 'A'), pt(d, 'B'), pt(d, 'M')];
    expect(close((a.x + b.x) / 2, m.x) && close((a.y + b.y) / 2, m.y)).toBe(true);
  });

  it('a RADIUS on a centre with no letter stays refused (operator ruling pending)', () => {
    const t = typed(['(x-3)^2+(y-1)^2=25', 'A על המעגל', 'B על המעגל', 'הרדיוס AB = 5']);
    expect(t.kinds.slice(0, 3)).toEqual(['record', 'record', 'record']);
    expect(t.kinds[3]).toMatch(/^refused:/);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// #1663
// ---------------------------------------------------------------------------------------------------------------

const TWO = ['A(0,0)', 'B(6,0)', 'C(2,4)', 'משולש ABC חסום במעגל', 'x^2+y^2=16'];
const INC = ['A(0,0)', 'B(6,0)', 'C(2,4)', 'במשולש ABC חסום מעגל', 'x^2+y^2=16'];
const SEQUENCES_1663 = [
  [...TWO, 'X מרכז המעגל החוסם את המשולש ABC'],
  [...INC, 'X מרכז המעגל החסום במשולש ABC'],
  [...TWO, 'D על המעגל החוסם את המשולש ABC'],
];

/** The circumcentre of A(0,0) B(6,0) C(2,4), and the incentre. */
const CIRCUM = { x: 3, y: 1, r: Math.sqrt(10) };
const INCENTRE = (() => {
  const [A, B, C] = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 2, y: 4 }];
  const a = Math.hypot(B.x - C.x, B.y - C.y);
  const b = Math.hypot(A.x - C.x, A.y - C.y);
  const c = Math.hypot(A.x - B.x, A.y - B.y);
  return { x: (a * A.x + b * B.x + c * C.x) / (a + b + c), y: (a * A.y + b * B.y + c * C.y) / (a + b + c) };
})();

describe('#1663 — a computed circle among several is named by its ring', () => {
  it('the issue’s sentence records, and names the circumcentre', () => {
    const t = typed([...TWO, 'X מרכז המעגל החוסם את המשולש ABC']);
    expect(t.kinds).toEqual(['record', 'record', 'record', 'record', 'record', 'record']);
    const x = pt(derive(t.recorded, 0), 'X');
    expect(close(x.x, CIRCUM.x) && close(x.y, CIRCUM.y)).toBe(true);
  });

  it.each([
    ['X היא מרכז המעגל החוסם את המשולש ABC'],
    ['X מרכז המעגל החוסם את ABC'],
    ['X is the centre of the circumcircle of triangle ABC'],
    ['X is the centre of the circle circumscribing triangle ABC'],
  ])('«%s» is the same statement', (line) => {
    const t = typed([...TWO, line]);
    expect(t.kinds.at(-1)).toBe('record');
    const x = pt(derive(t.recorded, 0), 'X');
    expect(close(x.x, CIRCUM.x) && close(x.y, CIRCUM.y)).toBe(true);
  });

  it('the contextual «X מרכז המעגל» is still ambiguous among two circles', () => {
    expect(typed([...TWO, 'X מרכז המעגל']).kinds.at(-1)).toBe('refused:ambiguous-shape');
  });

  it('the incircle among several: «X מרכז המעגל החסום במשולש ABC» names the incentre', () => {
    for (const line of ['X מרכז המעגל החסום במשולש ABC', 'X is the centre of the incircle of triangle ABC']) {
      const t = typed([...INC, line]);
      expect(t.kinds.at(-1)).toBe('record');
      const x = pt(derive(t.recorded, 0), 'X');
      expect(close(x.x, INCENTRE.x) && close(x.y, INCENTRE.y)).toBe(true);
    }
  });

  it('a ring no circle passes through is refused, never recorded', () => {
    expect(typed([...INC, 'X מרכז המעגל החוסם את המשולש ABC']).kinds.at(-1)).toBe('refused:unknown-reference');
  });

  it('24 seeds: «D על המעגל החוסם את המשולש ABC» puts D on the circumcircle, not on x²+y²=16', () => {
    const lines = [...TWO, 'D על המעגל החוסם את המשולש ABC'];
    expect(typed(lines).kinds.at(-1)).toBe('record');
    for (const seed of SEEDS) {
      const d = derive(lines, seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      const p = pt(d, 'D');
      expect(close(Math.hypot(p.x - CIRCUM.x, p.y - CIRCUM.y), CIRCUM.r), `seed ${seed}`).toBe(true);
    }
  });

  it('the chord, the tangency and the diameter sentences name it too', () => {
    // a chord: both ends on the circumcircle
    const chord = [...TWO, 'DE מיתר במעגל החוסם את המשולש ABC'];
    expect(typed(chord).kinds.at(-1)).toBe('record');
    const dc = derive(chord, 0);
    for (const id of ['D', 'E']) {
      const p = pt(dc, id);
      expect(close(Math.hypot(p.x - CIRCUM.x, p.y - CIRCUM.y), CIRCUM.r)).toBe(true);
    }
    // a tangency at a named point: the radius to D is perpendicular to DE
    const tangent = [...TWO, 'E(10,10)', 'הישר DE משיק למעגל החוסם את המשולש ABC בנקודה D'];
    expect(typed(tangent).kinds.at(-1)).toBe('record');
    const dt = derive(tangent, 0);
    const [d, e] = [pt(dt, 'D'), pt(dt, 'E')];
    expect(Math.abs((d.x - CIRCUM.x) * (e.x - d.x) + (d.y - CIRCUM.y) * (e.y - d.y))).toBeLessThan(1e-6);
    expect(close(Math.hypot(d.x - CIRCUM.x, d.y - CIRCUM.y), CIRCUM.r)).toBe(true);
    // a diameter (#1665's lowering on the named computed circle)
    const diam = [...TWO, 'AF קוטר במעגל החוסם את המשולש ABC'];
    expect(typed([...TWO, 'F על המעגל החוסם את המשולש ABC', 'AF קוטר במעגל החוסם את המשולש ABC']).kinds.slice(-2)).toEqual(['record', 'record']);
    // A diameter INTRODUCES the end it names (#1669, ADR-AG-204 — was `unknown-reference`): F is A's antipode, (6,2).
    expect(typed(diam).kinds.at(-1)).toBe('record');
    const f = pt(derive(diam, 0), 'F');
    expect(close(f.x, 6) && close(f.y, 2)).toBe(true);
  });

  it('a circle REFERRED TO by its centre: «על המעגל שמרכזו M» ≡ «על מעגל M»', () => {
    const strip = (r: ReturnType<typeof parseLine>) => (r.ok ? JSON.stringify(r.facts.map(({ src: _s, ...f }) => f)) : r.code);
    expect(strip(parseLine('A על המעגל שמרכזו M'))).toBe(strip(parseLine('A על מעגל M')));
    expect(strip(parseLine('הישר BC משיק למעגל שמרכזו M בנקודה B'))).toBe(strip(parseLine('הישר BC משיק למעגל M בנקודה B')));
    expect(strip(parseLine('A is on the circle with centre M'))).toBe(strip(parseLine('A is on circle M')));
    const t = typed(['נתון מעגל שמרכזו M', 'x^2+y^2=16', 'A על המעגל שמרכזו M', 'B נמצאת מחוץ למעגל שמרכזו M']);
    expect(t.kinds).toEqual(['record', 'record', 'record', 'record']);
  });

  it('the description standing alone is still the inscription STATEMENT, and the creations are untouched', () => {
    const whole = parseLine('המעגל החוסם את המשולש ABC');
    expect(whole.ok && whole.facts.some((f) => f.t === 'circle-thru' || f.t === 'the-circle')).toBe(true);
    for (const line of ['במעגל שמרכזו M חסום משולש ABC', 'משולש ABC חסום במעגל שמרכזו M', 'המעגל שמרכזו C החסום במשולש ABC', 'נתון מעגל שמרכזו M']) {
      expect(parseLine(line).ok, line).toBe(true);
    }
    expect(typed(['A(0,0)', 'B(6,0)', 'C(2,4)', 'המעגל שמרכזו K החסום במשולש ABC']).kinds.at(-1)).toBe('record');
  });

  it('#1598: the centre click offers the ring of a computed circle among several, with the sentence that reads back', () => {
    for (const [base, want, at] of [
      [TWO, 'K מרכז המעגל החוסם את המשולש ABC', CIRCUM],
      [INC, 'K מרכז המעגל החסום במשולש ABC', INCENTRE],
    ] as const) {
      const d = derive(base, 0);
      const offers = centresOf(d.figure, 'K');
      expect(offers.map((o) => o.sentence)).toEqual([want]);
      const offer = offers[0];
      expect(close(offer.x, at.x) && close(offer.y, at.y)).toBe(true);
      expect(centreSentenceOf(d.figure, offer.id, 'Q')).toBe(want.replace(/^K/, 'Q'));
      expect(decideSubmit(want, base, 0, d).kind).toBe('record');
      const k = pt(derive([...base, want], 0), 'K');
      expect(close(k.x, offer.x) && close(k.y, offer.y)).toBe(true);
      // named: the ring is withdrawn
      expect(centresOf(derive([...base, want], 0).figure, 'L')).toEqual([]);
    }
  });
});
