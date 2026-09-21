/**
 * THE 572 FAMILY (ADR-AG-144) — six issues on ONE seam: a non-vertex unknown in the solve vector.
 *
 *  - #1317  a curve's PARAMETER is never solved — «N על הישר l3» on `(k+1)x+2y-12+5k=0` reported
 *           unsatisfiable though k = 2 solves it exactly
 *  - #1319  a line through a point with a FREE direction — «דרך N עובר ישר»
 *  - #1320  «M אמצע AB» about an M that already exists — a derivation restated is a CONDITION
 *  - #1318  «נתון הישר II: …» minted a PHANTOM point I; a Roman numeral names a line
 *  - #1298  a DIGIT names a line — «משוואת ישר 1 היא 2x-y+8=0», «N על הישר 3»
 *  - #1323  the SIGN of a slope — «שיפוע הישר l5 שלילי» — a selector inside validity
 *
 * Operator, 2026-09-21 (#1317): *"All three, one piece of work. One design pass over the solver, then
 * build all three, so a student can build the whole 572 figure."* — grown to six the same day.
 *
 * Every case is the operator's own sentence or the exam's, measured on `main` @ 1d9a1892 before the
 * change (the "before" lines in each block) and asserted after it.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { parseLine } from '../parser/parseAnalytic';
import { isKnowledge, knownCurve } from '../engine/evaluate';
import { reportedDof } from '../engine/carriers';
import { decideSubmit } from '../app/submit';
import { COMMAND_CATALOG_ANALYTIC } from '../parser/catalogAnalytic';

const codes = (lines: string[], seed = 0) => derive(lines, seed).faults.map((f) => f.code);
const pointOf = (lines: string[], id: string, seed = 0) => {
  const p = derive(lines, seed).figure.points.find((q) => q.id === id);
  return p ? { x: p.x, y: p.y } : null;
};
const freedom = (lines: string[]) => {
  const d = derive(lines);
  return reportedDof(d.construction, d.figure.carrierDof);
};
const parseOk = (line: string) => parseLine(line).ok;
const parseCode = (line: string) => {
  const r = parseLine(line);
  return r.ok ? 'ok' : r.code;
};

// ---------------------------------------------------------------------------
// #1317 — a given that determines a parameter is HONOURED
// ---------------------------------------------------------------------------

describe('#1317 — the solve vector holds every unknown, so a given can pin a parameter', () => {
  const PIN = ['k הוא פרמטר', 'נתון הישר l3: (k+1)x+2y-12+5k=0', 'N(-2,4)', 'N על הישר l3'];

  it('the exam’s part (א): N on the parametric line pins k = 2 exactly, at every seed — before: unsatisfiable at every seed', () => {
    for (const seed of [0, 1, 2, 3]) {
      const d = derive(PIN, seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      expect(d.figure.env.k, `seed ${seed}`).toBeCloseTo(2, 5);
    }
  });

  it('k is KNOWLEDGE, and so is the line’s equation (3x + 2y − 2 = 0) — the panel prints both', () => {
    const d = derive(PIN);
    const k = isKnowledge(d.construction, (f) => f.env.k ?? null);
    expect(k.known && Math.abs(k.value - 2) < 1e-5).toBe(true);
    const line = knownCurve(d.construction, 'line-l3');
    expect(line?.kind).toBe('line');
    if (line?.kind === 'line') {
      // (k+1)x + 2y + (5k − 12) = 3x + 2y − 2 at k = 2
      expect(line.a / line.b).toBeCloseTo(3 / 2, 5);
      expect(line.c / line.b).toBeCloseTo(-1, 5);
    }
    expect(freedom(PIN)).toBe(0);
  });

  it('the CLASS, not the incidence: a slope given pins k just as exactly — before: unsatisfiable', () => {
    const lines = ['k הוא פרמטר', 'נתון הישר l3: (k+1)x+2y-12+5k=0', 'שיפוע הישר l3 הוא -1.5'];
    expect(codes(lines)).toEqual([]);
    expect(derive(lines).figure.env.k).toBeCloseTo(2, 5);
  });

  it('…and a parameter inside a POINT’s coordinates — «A(a,0)» with «AB = 2» — is the same class', () => {
    const lines = ['a הוא פרמטר', 'A(a,0)', 'B(0,0)', 'AB = 2'];
    const seen = new Set<number>();
    for (const seed of [0, 1, 2, 3, 4, 5]) {
      const d = derive(lines, seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      seen.add(Math.round(d.figure.env.a * 1000) / 1000);
    }
    // TWO roots (a² = 4), reached by different configurations — the ADR-AG-047 branch question,
    // answered by the seed exactly as a crossing's is. Neither root is knowledge; the set is.
    expect([...seen].sort()).toEqual([-2, 2]);
  });

  it('a DOMAIN filters the roots silently (D7 kind 1): «a > 0» keeps only a = 2 — never a refusal', () => {
    const lines = ['a > 0', 'A(a,0)', 'B(0,0)', 'AB = 2'];
    for (const seed of [0, 1, 2, 3, 4, 5]) {
      const d = derive(lines, seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      expect(d.figure.env.a, `seed ${seed}`).toBeCloseTo(2, 5);
    }
  });

  it('an UNPINNED parameter is never moved by the solve — the free `a` of the bisector stays the seed’s (ADR-052 both ways)', () => {
    // A parameter in the vector is a knob; measured, a one-stage joint solve drove `a` to 0 here (B
    // onto A, where |MA| = |MB| holds trivially) — a collapsed figure drawn as the configuration.
    // The vertices are solved first and the parameters join only when the vertices cannot.
    const lines = ['A(0,0)', 'B(8a,0)', 'נקודה M', 'MA = MB'];
    const as = new Set<number>();
    for (const seed of [0, 1, 2]) {
      const d = derive(lines, seed);
      expect(d.faults).toEqual([]);
      expect(Math.abs(d.figure.env.a)).toBeGreaterThan(0.5); // never collapsed
      as.add(Math.round(d.figure.env.a * 100) / 100);
    }
    expect(as.size).toBeGreaterThan(1); // and still moves with the seed
  });

  describe('the honesty half — the three defects of the crossing form', () => {
    const EXAM = [
      'נתון הישר l1: 2x-y+8=0',
      'נתון הישר l2: x+3y-10=0',
      'N נקודת החיתוך של הישר l1 עם הישר l2',
      'k הוא פרמטר',
      'נתון הישר l3: (k+1)x+2y-12+5k=0',
      'N על הישר l3',
    ];

    it('builds with NO fault, N at (−2, 4) on all three lines — before: line 2 blamed twice and N drawn on none of them', () => {
      for (const seed of [0, 1]) {
        const d = derive(EXAM, seed);
        expect(d.faults, `seed ${seed}`).toEqual([]);
        const n = d.figure.points.find((p) => p.id === 'N')!;
        expect(n.x).toBeCloseTo(-2, 4);
        expect(n.y).toBeCloseTo(4, 4);
        expect(d.figure.env.k).toBeCloseTo(2, 4);
      }
    });

    it('a genuine contradiction blames the sentence that made it one, at the submit gate — never an earlier innocent line', () => {
      const prefix = ['k הוא פרמטר', 'נתון הישר l3: (k+1)x+2y-12+5k=0', 'N(-2,4)', 'N על הישר l3'];
      expect(codes(prefix)).toEqual([]);
      const v = decideSubmit('שיפוע הישר l3 הוא 7', prefix, 0);
      expect(v.kind).toBe('refused');
      if (v.kind === 'refused') {
        expect(v.error.key).toBe('unsatisfiable');
        expect(v.error.detail).toBe('שיפוע הישר l3 הוא 7');
      }
    });

    it('a fault is reported ONCE per line (the #1287 shape)', () => {
      const d = derive([...EXAM.slice(0, 5), 'N על הישר l3', 'שיפוע הישר l3 הוא 7']);
      const per = new Map<number, number>();
      for (const f of d.faults) per.set(f.index, (per.get(f.index) ?? 0) + 1);
      for (const [index, n] of per) expect(n, `line ${index}`).toBe(1);
    });
  });

  it('REGRESSION — a figure with no parameters solves exactly as before', () => {
    const d = derive(['משולש ABC', 'A(0,0)', 'B(6,0)', 'שטח המשולש ABC הוא 12']);
    expect(d.faults).toEqual([]);
    expect(freedom(['משולש ABC', 'A(0,0)', 'B(6,0)', 'שטח המשולש ABC הוא 12'])).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// #1319 — a line through a point with a FREE direction
// ---------------------------------------------------------------------------

describe('#1319 — «דרך N עובר ישר» creates a line whose direction is unknown', () => {
  it.each([
    'דרך N עובר ישר',
    'דרך הנקודה N עובר ישר',
    'דרך N עובר ישר l3',
    'דרך N עובר ישר 3',
    'a line through N',
    'line l4 through M',
    'the line l4 passes through point M',
  ])('%s parses to a declaration and a constructed line — before: not-handled', (line) => {
    const r = parseLine(line);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.facts.map((f) => f.t)).toEqual(['declare', 'line-at']);
  });

  it('the parallel/perpendicular members (#1093) are untouched', () => {
    const r = parseLine('דרך N עובר ישר מקביל ל-AB');
    expect(r.ok && r.facts.find((f) => f.t === 'line-at')).toMatchObject({ dir: { k: 'points', a: 'A', b: 'B' } });
  });

  it('the line is drawn through the point, carries ONE degree of freedom, and TURNS on «הציגו תצורה אחרת»', () => {
    const lines = ['N(1,2)', 'דרך N עובר ישר l4'];
    expect(freedom(lines)).toBe(1);
    const slopes = new Set<number>();
    for (const seed of [0, 1, 2]) {
      const d = derive(lines, seed);
      expect(d.faults).toEqual([]);
      const l = d.figure.curves.find((c) => c.id === 'line-l4')!;
      expect(l.label.name).toBe('l4');
      expect(l.curve.kind).toBe('line');
      if (l.curve.kind === 'line') {
        expect(l.curve.a * 1 + l.curve.b * 2 + l.curve.c).toBeCloseTo(0, 9); // through N(1,2)
        slopes.add(Math.round((-l.curve.a / l.curve.b) * 1000) / 1000);
      }
    }
    expect(slopes.size).toBeGreaterThan(1);
    // Its equation is NOT knowledge while the direction is free — no invented given reaches the panel.
    expect(knownCurve(derive(lines).construction, 'line-l4')).toBeNull();
  });

  it('the direction angle is a free DOF the tool owns — counted, never listed as a parameter row', () => {
    const d = derive(['N(1,2)', 'דרך N עובר ישר l4']);
    const syms = Object.keys(d.figure.env);
    expect(syms.some((s) => s.startsWith('θ_'))).toBe(true);
  });

  it('a NAMED free line can be crossed, referred to and measured against, like a stated line', () => {
    const lines = ['N(1,2)', 'דרך N עובר ישר l4', 'נתון הישר l1: y=0', 'A נקודת החיתוך של הישר l4 עם הישר l1'];
    const d = derive(lines);
    expect(d.faults).toEqual([]);
    const a = d.figure.points.find((p) => p.id === 'A')!;
    expect(a.y).toBeCloseTo(0, 6);
  });

  it('a later given PINS the direction — «AB» through it with a stated slope — and the equation becomes knowledge', () => {
    const lines = ['N(1,2)', 'דרך N עובר ישר l4', 'שיפוע הישר l4 הוא 2'];
    expect(codes(lines)).toEqual([]);
    expect(freedom(lines)).toBe(0);
    const line = knownCurve(derive(lines).construction, 'line-l4');
    expect(line?.kind).toBe('line');
    if (line?.kind === 'line') expect(-line.a / line.b).toBeCloseTo(2, 6);
  });
});

// ---------------------------------------------------------------------------
// #1320 — a derivation restated about an existing point is a CONDITION
// ---------------------------------------------------------------------------

describe('#1320 — «M אמצע AB» about a point that already exists', () => {
  it('the operator’s own case: three named points, then the midpoint — builds and pins M — before: name-kind-clash', () => {
    const lines = ['נקודה A', 'נקודה B', 'נקודה M', 'M אמצע AB'];
    for (const seed of [0, 1]) {
      const d = derive(lines, seed);
      expect(d.faults).toEqual([]);
      const at = (id: string) => d.figure.points.find((p) => p.id === id)!;
      expect(at('M').x).toBeCloseTo((at('A').x + at('B').x) / 2, 5);
      expect(at('M').y).toBeCloseTo((at('A').y + at('B').y) / 2, 5);
    }
    expect(freedom(lines)).toBe(4); // A and B free, M determined by them
  });

  it('the exam’s order — M a crossing first, then the midpoint — is the same statement', () => {
    const lines = ['נתון הישר l1: y=x+1', 'M נקודת החיתוך של הישר l1 עם ציר ה-y', 'נקודה A', 'נקודה B', 'M אמצע AB'];
    const d = derive(lines);
    expect(d.faults).toEqual([]);
    const at = (id: string) => d.figure.points.find((p) => p.id === id)!;
    expect(at('M').x).toBeCloseTo(0, 6);
    expect(at('M').y).toBeCloseTo(1, 6);
    expect(at('M').x).toBeCloseTo((at('A').x + at('B').x) / 2, 5);
  });

  it('a FALSE restatement about placed points is refused as unsatisfiable, naming the sentence', () => {
    expect(codes(['A(0,0)', 'B(4,0)', 'M(1,1)', 'M אמצע AB'])).toEqual(['unsatisfiable']);
    expect(codes(['A(0,0)', 'B(4,0)', 'M(2,0)', 'M אמצע AB'])).toEqual([]);
  });

  it('the CLASS: every derived rule — a centroid restated about a placed M', () => {
    expect(codes(['A(0,0)', 'B(6,0)', 'C(3,6)', 'M(3,2)', 'M מפגש התיכונים במשולש ABC'])).toEqual([]);
    expect(codes(['A(0,0)', 'B(6,0)', 'C(3,6)', 'M(3,5)', 'M מפגש התיכונים במשולש ABC'])).toEqual(['unsatisfiable']);
  });

  it('an EXACT restatement is still absorbed as known (#1045), not counted as a new given', () => {
    const d = derive(['A(8,1)', 'B(-2,-5)', 'M אמצע AB', 'M אמצע AB']);
    expect(d.outcomes).toEqual(['created', 'created', 'created', 'known']);
  });

  it('REGRESSION — «M אמצע AB» with no M yet still DEFINES M (a derived point)', () => {
    const d = derive(['A(8,1)', 'B(-2,-5)', 'M אמצע AB']);
    expect(d.construction.objects.find((o) => o.id === 'M')?.kind).toBe('derived');
    expect(freedom(['A(8,1)', 'B(-2,-5)', 'M אמצע AB'])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// #1318 / #1298 — a numeral names a line
// ---------------------------------------------------------------------------

describe('#1318 / #1298 — the exam’s own line names: «הישר 1», «הישר I»', () => {
  it.each([
    ['נתון הישר I: 2x-y+8=0', 'line-I', 'ישר I'],
    ['נתון הישר II: x+3y-10=0', 'line-II', 'ישר II'],
    ['נתון הישר III: y=x', 'line-III', 'ישר III'],
    ['נתון הישר 1: y=x', 'line-1', 'ישר 1'],
    ['משוואת ישר 1 היא 2x-y+8=0', 'line-1', 'ישר 1'],
    ['משוואת הישר 3 היא (k+1)x+2y-12+5k=0', 'line-3', 'ישר 3'],
    ['line 1: y=x', 'line-1', 'line 1'],
    ['line II: y=x', 'line-II', 'line II'],
  ])('%s declares the line and NO point — before: not-handled / bad-equation / a phantom I', (line, id, name) => {
    const d = derive([line]);
    expect(d.faults).toEqual([]);
    expect(d.figure.curves.map((c) => [c.id, c.label.name])).toEqual([[id, name]]);
    expect(d.figure.points).toEqual([]);
    // A phantom point would be two degrees of freedom; a parametric equation's own `k` is one.
    expect(freedom([line])).toBe(line.includes('k') ? 1 : 0);
  });

  it('«II» mints no phantom point I (the two-point reading is closed to numerals)', () => {
    const d = derive(['נתון הישר II: x+3y-10=0']);
    expect(d.construction.objects.map((o) => o.id)).toEqual(['line-II']);
  });

  it('a two-point name that REPEATS its letter names no line — refused, never a phantom', () => {
    expect(parseCode('נתון הישר AA: y=x')).toBe('repeated-vertex');
  });

  it.each([
    'N נמצאת על ישר 3',
    'N על הישר 3',
    'N נמצאת על הישר I',
    'N is on line 3',
  ])('%s REFERS to the numeral-named line — before: not-handled', (line) => {
    const r = parseLine(line);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.facts.find((f) => f.t === 'constraint')).toMatchObject({ k: { t: 'on-curve', curve: expect.stringMatching(/^line-(3|I)$/) } });
  });

  it('the operator’s sentence end to end: two digit-named lines and their crossing', () => {
    const lines = ['נתון הישר 1: 2x-y+8=0', 'נתון הישר 2: x+3y-10=0', 'N נקודת החיתוך של הישר 1 עם הישר 2'];
    const d = derive(lines);
    expect(d.faults).toEqual([]);
    expect(pointOf(lines, 'N')).toMatchObject({ x: expect.closeTo(-2, 5), y: expect.closeTo(4, 5) });
  });

  it('a reference to a line called 7 that does not exist names the missing line, not the sentence', () => {
    expect(codes(['N על הישר 7'])).toEqual(['unknown-reference']);
  });

  it('REGRESSION — a bare equation opening with a digit is still an equation, not a line named 2', () => {
    const d = derive(['נתון הישר 2x-y+8=0']);
    expect(d.faults).toEqual([]);
    expect(d.figure.curves[0].id.startsWith('curve-')).toBe(true);
    expect(parseCode('line 4x+3y=0')).toBe('ok');
  });

  it('REGRESSION — the six point-first incidence spellings still work, and a Roman numeral without the line noun is still a circle', () => {
    for (const line of ['N נמצאת על הישר l3', 'N על הישר l3', 'N נמצאת על ישר l3', 'הנקודה N נמצאת על הישר l3', 'N נמצאת על l3', 'הנקודה N על הישר l3']) {
      expect(parseOk(line), line).toBe(true);
    }
    const d = derive(['משוואת I היא x^2+y^2=9']);
    expect(d.figure.curves.map((c) => c.id)).toEqual(['circle-I']);
  });
});

// ---------------------------------------------------------------------------
// #1323 — the SIGN of a derived quantity
// ---------------------------------------------------------------------------

describe('#1323 — «שיפוע הישר l1 שלילי» is a selector inside validity', () => {
  it.each([
    'שיפוע הישר l1 הוא שלילי',
    'שיפוע הישר l1 שלילי',
    'השיפוע של l1 שלילי',
    'שיפועו של l1 שלילי',
    'שיפוע l1 קטן מ-0',
    'שיפוע l1 < 0',
    'the slope of l1 is negative',
  ])('%s parses to a sign selector — before: not-handled', (line) => {
    const r = parseLine(line);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.facts).toEqual([{ t: 'selector', sel: { kind: 'sign', q: { k: 'slope', u: { k: 'curve', id: 'line-l1' } }, positive: false }, src: line }]);
  });

  it('«the slope of l1 is negative» was ACCEPTED AS AN EXPRESSION before (n·e·g·a·t·i·v·e) — the #1321 trap on this sentence, closed', () => {
    const r = parseLine('the slope of l1 is negative');
    expect(r.ok && r.facts[0].t).toBe('selector');
  });

  it('a sign a stated line contradicts is refused, naming the sentence; one it satisfies is accepted', () => {
    expect(codes(['נתון הישר l1: y=2x', 'שיפוע הישר l1 שלילי'])).toEqual(['unsatisfiable']);
    expect(codes(['נתון הישר l1: y=-2x', 'שיפוע הישר l1 שלילי'])).toEqual([]);
    expect(codes(['נתון הישר l1: y=2x', 'שיפוע הישר l1 חיובי'])).toEqual([]);
  });

  it('the sign PICKS THE ROOT of a pin with two roots — the exam’s part (ג), and no seed contradicts it (#818’s failure mode)', () => {
    // A free line through B; the area pins its direction to two roots (one each side of the x-axis
    // crossing); the sign says which. Every configuration the tool draws honours the sign.
    const lines = ['A(-4,0)', 'B(4,2)', 'דרך B עובר ישר l5', 'C נקודת החיתוך של הישר l5 עם ציר ה-x', 'שיפוע הישר l5 שלילי', 'שטח המשולש ABC הוא 8.5'];
    for (const seed of [0, 1, 2, 3]) {
      const d = derive(lines, seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      const l = d.figure.curves.find((c) => c.id === 'line-l5')!.curve;
      if (l.kind === 'line') expect(-l.a / l.b, `seed ${seed}`).toBeLessThan(0);
      expect(d.figure.points.find((p) => p.id === 'C')!.x, `seed ${seed}`).toBeCloseTo(4.5, 4);
    }
    // …and with the OTHER sign, the other root: C = (4 − 2/m, 0) with |8 − 2/m| = 8.5 gives m = −4
    // (C at 4.5) or m = 4/33 (C at −12.5) — the positive slope is the far root.
    const other = [...lines.slice(0, 4), 'שיפוע הישר l5 חיובי', 'שטח המשולש ABC הוא 8.5'];
    const d = derive(other);
    expect(d.faults).toEqual([]);
    expect(d.figure.points.find((p) => p.id === 'C')!.x).toBeCloseTo(-12.5, 4);
  });

  it('«m<0» is still a parameter DECLARATION (F11) — it is not made to mean a slope, and it is not silent', () => {
    // The corpus declares before use («0<k<6» then the parabola), so the bare form cannot be refused.
    // What changes is visibility: the panel row for a symbol nothing uses says so (App.tsx, `paramUnused`).
    const r = parseLine('m<0');
    expect(r.ok && r.facts[0].t).toBe('param');
    expect(freedom(['נתון הישר l1: y=2x', 'm<0'])).toBe(1); // the declared m is a reported freedom
  });

  it('a sign about a two-point direction whose points do not exist names the missing point', () => {
    expect(codes(['שיפוע הישר AB הוא חיובי'])).toEqual(['unknown-reference']);
    expect(codes(['משולש ABC', 'שיפוע הישר AB הוא חיובי'])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// THE 572 FIGURE — end to end, as the exam prints it (the operator’s acceptance case)
// ---------------------------------------------------------------------------

describe('the 572 figure (מבחן 20 עמ׳ 566 תרגיל 1) builds end to end', () => {
  const PART_B = [
    'נתון הישר 1: 2x-y+8=0',
    'נתון הישר 2: x+3y-10=0',
    'N נקודת החיתוך של הישר 1 עם הישר 2',
    'k הוא פרמטר',
    'נתון הישר 3: (k+1)x+2y-12+5k=0',
    'N על הישר 3',
    'M נקודת החיתוך של הישר 3 עם ציר ה-y',
    'דרך M עובר ישר l4',
    'A נקודת החיתוך של הישר l4 עם הישר 1',
    'B נקודת החיתוך של הישר l4 עם הישר 2',
    'M אמצע AB',
  ];
  const PART_C = [...PART_B, 'דרך B עובר ישר l5', 'C נקודת החיתוך של הישר l5 עם ציר ה-x', 'שיפוע הישר l5 שלילי', 'שטח המשולש ABC הוא 8.5'];

  it('parts (א)–(ב): k = 2, N(−2,4), M(0,1), A(−4,0), B(4,2) — every line green, nothing left free', () => {
    for (const seed of [0, 1, 2]) {
      const d = derive(PART_B, seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      const at = (id: string) => d.figure.points.find((p) => p.id === id)!;
      expect(d.figure.env.k).toBeCloseTo(2, 4);
      expect(at('N')).toMatchObject({ x: expect.closeTo(-2, 4), y: expect.closeTo(4, 4) });
      expect(at('M')).toMatchObject({ x: expect.closeTo(0, 4), y: expect.closeTo(1, 4) });
      expect(at('A')).toMatchObject({ x: expect.closeTo(-4, 4), y: expect.closeTo(0, 4) });
      expect(at('B')).toMatchObject({ x: expect.closeTo(4, 4), y: expect.closeTo(2, 4) });
    }
    expect(freedom(PART_B)).toBe(0);
    // The line the exam withholds is now knowledge: through M(0,1) and A(−4,0), slope 1/4.
    const l4 = knownCurve(derive(PART_B).construction, 'line-l4');
    expect(l4?.kind).toBe('line');
    if (l4?.kind === 'line') expect(-l4.a / l4.b).toBeCloseTo(0.25, 5);
  });

  it('every line is recorded by the submit gate in order — the play sheet’s sequence passes the real gate', () => {
    const typed: string[] = [];
    for (const line of PART_C) {
      const v = decideSubmit(line, typed, 0);
      expect(v.kind, line).toBe('record');
      typed.push(line);
    }
  });

  it('part (ג): C(4.5, 0) on the negative-slope root, and the whole figure is determined', () => {
    const d = derive(PART_C);
    expect(d.faults).toEqual([]);
    expect(d.figure.points.find((p) => p.id === 'C')).toMatchObject({ x: expect.closeTo(4.5, 3), y: expect.closeTo(0, 4) });
    expect(freedom(PART_C)).toBe(0);
  });

  it('the catalog carries the family’s sentences (the coverage map and the LLM’s vocabulary)', () => {
    const he = COMMAND_CATALOG_ANALYTIC.map((e) => e.he);
    for (const s of ['דרך P עובר ישר', 'דרך P עובר ישר l3', 'נתון הישר 1: 2x-y+8=0', 'נתון הישר I: 2x-y+8=0', 'N על הישר 3', 'שיפוע הישר AB שלילי']) {
      expect(he, s).toContain(s);
    }
  });
});
