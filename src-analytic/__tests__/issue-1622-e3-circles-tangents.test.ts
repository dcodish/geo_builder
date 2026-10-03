/**
 * #1622 slice E3 + #1693 (ADR-AG-219) — the circle and tangent sentences 2-D reads, read the same way here, and the
 * #1688 ruling: two fresh interchangeable circles are named by order on first mention.
 *
 * Operator rulings: *"analytics and 2d should have same user experience"* (2026-10-02, the standing rule; each row's
 * 2-D verdict measured through `decideDeterministic2D`); on #1688 (2026-10-02): *"First mention names one"* — the
 * first new letter names the first-drawn circle of an interchangeable pair, the next new letter names the other, and
 * circles a statement tells apart still ask which; and ADR-AG-210 / #1686: an unnamed centre never answers to a
 * letter until a sentence names it.
 *
 * Every assertion CALLS the real decision (`decideSubmit`, `derive`), and checks the GEOMETRY at several seeds — a
 * sentence that records but draws the wrong figure is the defect, not the pass.
 */
import { describe, expect, it } from 'vitest';
import { derive, type Derivation } from '../engine/derive';
import { decideSubmit } from '../app/submit';
import { parseLine } from '../parser/parseAnalytic';

function typed(lines: readonly string[], seed = 0): { kinds: string[]; recorded: string[] } {
  const recorded: string[] = [];
  const kinds: string[] = [];
  for (const l of lines) {
    const v = decideSubmit(l, recorded, seed);
    kinds.push(v.kind === 'refused' ? `refused:${v.error.key}` : v.kind);
    if (v.kind === 'record') recorded.push(l);
  }
  return { kinds, recorded };
}
const builds = (lines: readonly string[]) => expect(typed(lines).kinds, lines.join(' · ')).toEqual(lines.map(() => 'record'));

type Pt = { x: number; y: number };
type Circ = { id: string; cx: number; cy: number; r: number };
const SEEDS = [0, 1, 2, 3, 5, 8];
const EPS = 1e-5;
const pt = (d: Derivation, id: string): Pt => {
  const p = d.figure.points.find((q) => q.id === id);
  if (!p) throw new Error(`no point ${id}`);
  return p;
};
const circles = (d: Derivation): Circ[] =>
  d.figure.curves.flatMap((c) => (c.curve.kind === 'circle' ? [{ id: c.id, cx: c.curve.cx, cy: c.curve.cy, r: c.curve.r }] : []));
const circle = (d: Derivation, id: string): Circ => {
  const c = circles(d).find((k) => k.id === id);
  if (!c) throw new Error(`no circle ${id} in ${circles(d).map((k) => k.id).join(',')}`);
  return c;
};
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const centre = (c: Circ): Pt => ({ x: c.cx, y: c.cy });
const on = (p: Pt, c: Circ) => Math.abs(dist(p, centre(c)) - c.r) <= EPS * Math.max(1, c.r);
const dot = (a: Pt, b: Pt, c: Pt, d: Pt) => (b.x - a.x) * (d.x - c.x) + (b.y - a.y) * (d.y - c.y);
const perp = (a: Pt, b: Pt, c: Pt, d: Pt) => Math.abs(dot(a, b, c, d)) <= 1e-4 * Math.max(1, dist(a, b) * dist(c, d));
const side = (p: Pt, a: Pt, b: Pt) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
const collinear = (p: Pt, a: Pt, b: Pt) => Math.abs(side(p, a, b)) <= 1e-4 * Math.max(1, dist(a, b) ** 2);
const between = (p: Pt, a: Pt, b: Pt) => collinear(p, a, b) && dot(a, p, a, b) > 0 && dot(b, p, b, a) > 0;

/** Every seed derives clean and `check` holds; `vary` (a fingerprint) takes more than one value — no default (ADR-052). */
function acrossSeeds(lines: readonly string[], check: (d: Derivation) => void, vary?: (d: Derivation) => string) {
  const seen = new Set<string>();
  for (const seed of SEEDS) {
    const d = derive(lines, seed);
    expect(d.faults, `seed ${seed}: ${lines.join(' · ')}`).toEqual([]);
    check(d);
    if (vary) seen.add(vary(d));
  }
  if (vary) expect(seen.size, `${lines.join(' · ')} varies`).toBeGreaterThan(1);
}
const fp = (n: number) => n.toFixed(3);

// ---------------------------------------------------------------------------------------------------------------
// One circle: the centred spellings, a circle sized by its value, a circle with its centre unnamed
// ---------------------------------------------------------------------------------------------------------------

describe('one circle — 2-D’s spellings', () => {
  it('«מעגל סביב O רדיוס 5» is the circle on O with radius 5', () => {
    builds(['מעגל סביב O רדיוס 5']);
    acrossSeeds(['מעגל סביב O רדיוס 5'], (d) => {
      const c = circle(d, 'circle-at-O');
      expect(c.r).toBeCloseTo(5, 9);
      expect(dist(centre(c), pt(d, 'O'))).toBeLessThan(EPS);
    }, (d) => fp(pt(d, 'O').x));
  });

  it('«מעגל עם מרכז O» is «נתון מעגל שמרכזו O»: the same facts, a free radius', () => {
    const a = parseLine('מעגל עם מרכז O');
    const b = parseLine('נתון מעגל שמרכזו O');
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.facts.map(({ src: _s, ...f }) => f)).toEqual(b.facts.map(({ src: _s, ...f }) => f));
    acrossSeeds(['מעגל עם מרכז O'], (d) => expect(circles(d)).toHaveLength(1), (d) => fp(circle(d, 'circle-at-O').r));
  });

  it.each([
    ['מעגל O שהיקפו 6π', 3],
    ['מעגל O ששטחו 9π', 3],
    ['מעגל O שקוטרו 10', 5],
    ['מעגל O בקוטר 10', 5],
    ['circle O with circumference 6π', 3],
    ['circle O with area 9π', 3],
  ])('«%s» sizes the circle on O: radius %d', (line, r) => {
    builds([line]);
    acrossSeeds([line], (d) => expect(circle(d, 'circle-at-O').r).toBeCloseTo(r, 9), (d) => fp(pt(d, 'O').y));
  });

  it('«נתון מעגל שקוטרו BD» still names its diameter by its ends (not a size)', () => {
    const r = parseLine('נתון מעגל שקוטרו BD');
    expect(r.ok && r.facts.some((f) => f.t === 'circle-thru' || f.t === 'diameter-of')).toBe(true);
  });

  it.each(['נתון מעגל', 'מעגל', 'given a circle', 'a circle'])('«%s» draws a NEW circle with its centre unnamed', (line) => {
    builds([line]);
    acrossSeeds([line], (d) => {
      expect(circles(d)).toHaveLength(1);
      expect(d.figure.points).toHaveLength(0); // no tool letter on the centre (#1673, ADR-AG-210)
    }, (d) => fp(circles(d)[0].cx));
  });

  it('«נתון מעגל» twice draws two circles (2-D draws one each time)', () => {
    builds(['נתון מעגל', 'נתון מעגל']);
    expect(circles(derive(['נתון מעגל', 'נתון מעגל'], 0))).toHaveLength(2);
  });

  it.each([
    ['מעגל בקוטר 10', 5],
    ['מעגל שרדיוסו 5', 5],
    ['נתון מעגל ברדיוס 4', 4],
    ['a circle with diameter 10', 5],
  ])('«%s» draws a new circle of radius %d, its centre free', (line, r) => {
    builds([line]);
    acrossSeeds([line], (d) => {
      expect(circles(d)).toHaveLength(1);
      expect(circles(d)[0].r).toBeCloseTo(r, 9);
    }, (d) => fp(circles(d)[0].cx));
  });

  it('«המעגל ברדיוס 5» (definite) is still the radius of THE circle, not a new one', () => {
    builds(['נתון מעגל O', 'המעגל ברדיוס 5']);
    const d = derive(['נתון מעגל O', 'המעגל ברדיוס 5'], 0);
    expect(circles(d)).toHaveLength(1);
    expect(circles(d)[0].r).toBeCloseTo(5, 9);
  });

  it('«מרכז המעגל» binds the circle the figure has, and draws one when there is none', () => {
    expect(typed(['נתון מעגל', 'מרכז המעגל']).kinds).toEqual(['record', 'already-known']);
    builds(['מרכז המעגל']);
    expect(circles(derive(['מרכז המעגל'], 0))).toHaveLength(1);
    expect(typed(['נתון מעגל', 'נתון מעגל', 'מרכז המעגל']).kinds[2]).toBe('refused:ambiguous-shape');
  });

  it('a created circle takes the radius stated after it («A על המעגל» · «רדיוס המעגל הוא 5»)', () => {
    builds(['A על המעגל', 'רדיוס המעגל הוא 5']);
    acrossSeeds(['A על המעגל', 'רדיוס המעגל הוא 5'], (d) => {
      const c = circles(d)[0];
      expect(c.r).toBeCloseTo(5, 6);
      expect(on(pt(d, 'A'), c)).toBe(true);
    }, (d) => fp(pt(d, 'A').x));
  });

  it('«רדיוס המעגל הוא -3» on a created circle is refused naming the line, never drawn', () => {
    expect(typed(['A על המעגל', 'רדיוס המעגל הוא -3']).kinds[1]).toBe('refused:out-of-domain');
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Radius letters
// ---------------------------------------------------------------------------------------------------------------

describe('radius letters — «מעגל O שרדיוסו R», «R > r»', () => {
  it('«מעגל O שרדיוסו R» names the radius R, which stays free', () => {
    builds(['מעגל O שרדיוסו R']);
    acrossSeeds(['מעגל O שרדיוסו R'], (d) => expect(circle(d, 'circle-at-O').r).toBeGreaterThan(0), (d) => fp(circle(d, 'circle-at-O').r));
  });

  it('«R > r» holds at every seed: the circle with radius R is the larger', () => {
    const lines = ['מעגל O שרדיוסו R', 'מעגל P שרדיוסו r', 'R > r'];
    builds(lines);
    acrossSeeds(lines, (d) => expect(circle(d, 'circle-at-O').r).toBeGreaterThan(circle(d, 'circle-at-P').r), (d) => fp(circle(d, 'circle-at-O').r));
    acrossSeeds(['מעגל O שרדיוסו R', 'מעגל P שרדיוסו r', 'R < r'], (d) => expect(circle(d, 'circle-at-O').r).toBeLessThan(circle(d, 'circle-at-P').r));
  });

  it('«R > r» about letters no circle carries is refused naming the letter, never kept', () => {
    expect(typed(['מעגל O', 'מעגל P', 'R > r']).kinds[2]).toBe('refused:unknown-reference');
  });

  it('«x > y» is not a radius order (the plane’s coordinates)', () => {
    const r = parseLine('x > y');
    expect(r.ok && r.facts.some((f) => f.t === 'selector' && f.sel.kind === 'sign' && f.sel.q.k === 'params')).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Two circles: no relation, disjoint, nested, concentric, contained
// ---------------------------------------------------------------------------------------------------------------

describe('two circles', () => {
  it.each(['שני מעגלים', 'two circles'])('«%s» draws two circles, centres unnamed', (line) => {
    builds([line]);
    acrossSeeds([line], (d) => {
      expect(circles(d)).toHaveLength(2);
      expect(d.figure.points).toHaveLength(0);
    }, (d) => fp(circles(d)[0].cx));
  });

  it.each(['שני מעגלים זרים', 'two disjoint circles'])('«%s» keeps each outside the other at every seed', (line) => {
    builds([line]);
    acrossSeeds([line], (d) => {
      const [a, b] = circles(d);
      expect(dist(centre(a), centre(b))).toBeGreaterThan(a.r + b.r);
    }, (d) => fp(circles(d)[1].cx));
  });

  it('…and stays so once points ride both circles («C על מעגל P» · «D על מעגל O»)', () => {
    const lines = ['שני מעגלים זרים', 'C על מעגל P', 'D על מעגל O'];
    builds(lines);
    acrossSeeds(lines, (d) => {
      const [a, b] = circles(d);
      expect(dist(centre(a), centre(b))).toBeGreaterThan(a.r + b.r);
      expect(on(pt(d, 'C'), a)).toBe(true);
      expect(on(pt(d, 'D'), b)).toBe(true);
    });
  });

  it.each(['שני מעגלים מוכלים', 'two nested circles'])('«%s» puts the second strictly inside the first', (line) => {
    builds([line]);
    acrossSeeds([line], (d) => {
      const [a, b] = circles(d);
      expect(a.r - b.r - dist(centre(a), centre(b))).toBeGreaterThan(0);
    }, (d) => fp(circles(d)[1].r));
  });

  it.each(['שני מעגלים בעלי מרכז משותף O', 'two circles with a common center O'])('«%s» — two circles on O, the second the inner', (line) => {
    builds([line]);
    acrossSeeds([line], (d) => {
      const [a, b] = [circle(d, 'circle-at-O'), circle(d, 'circle-at-O-2')];
      expect(dist(centre(a), pt(d, 'O'))).toBeLessThan(EPS);
      expect(dist(centre(b), pt(d, 'O'))).toBeLessThan(EPS);
      expect(a.r).toBeGreaterThan(b.r);
    }, (d) => fp(circle(d, 'circle-at-O-2').r));
  });

  it.each(['מעגל P מוכל בתוך מעגל O', 'מעגל P מוכל במעגל O', 'circle P is contained in circle O'])('«%s» — P’s circle strictly inside O’s at every seed', (line) => {
    builds([line]);
    acrossSeeds([line], (d) => {
      const [o, p] = [circle(d, 'circle-at-O'), circle(d, 'circle-at-P')];
      expect(o.r - p.r - dist(centre(o), centre(p))).toBeGreaterThan(0);
    }, (d) => fp(pt(d, 'P').x));
  });

  it('«מעגל O מוכל בתוך מעגל O» is refused (one circle inside itself)', () => {
    expect(typed(['מעגל O מוכל בתוך מעגל O']).kinds[0]).toBe('refused:repeated-vertex');
  });

  it('«מעגל מוכל בתוך המעגל הגדול» on an empty canvas draws both, the new one inside', () => {
    builds(['מעגל מוכל בתוך המעגל הגדול']);
    acrossSeeds(['מעגל מוכל בתוך המעגל הגדול'], (d) => {
      const [a, b] = circles(d);
      expect(a.r - b.r - dist(centre(a), centre(b))).toBeGreaterThan(0);
    }, (d) => fp(circles(d)[1].r));
  });

  it('«מעגל מוכל בתוך המעגל» beside «מעגל O» draws a new circle inside O’s', () => {
    const lines = ['מעגל O', 'מעגל מוכל בתוך המעגל'];
    builds(lines);
    acrossSeeds(lines, (d) => {
      const o = circle(d, 'circle-at-O');
      const inner = circles(d).find((c) => c.id !== 'circle-at-O')!;
      expect(o.r - inner.r - dist(centre(o), centre(inner))).toBeGreaterThan(0);
    }, (d) => fp(pt(d, 'O').x));
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Two intersecting circles, and the #1688 ruling (#1693)
// ---------------------------------------------------------------------------------------------------------------

describe('two intersecting circles — #1693, named by order (#1688 ruling)', () => {
  it.each(['שני מעגלים נחתכים בנקודות A ו-B', 'שני מעגלים נחתכים בנקודות A ו B', 'two circles intersect at A and B'])(
    '«%s»: A and B on both circles, two different points of two different circles',
    (line) => {
      builds([line]);
      acrossSeeds([line], (d) => {
        const [a, b] = circles(d);
        for (const p of ['A', 'B']) {
          expect(on(pt(d, p), a)).toBe(true);
          expect(on(pt(d, p), b)).toBe(true);
        }
        expect(dist(pt(d, 'A'), pt(d, 'B'))).toBeGreaterThan(1e-3);
        expect(dist(centre(a), centre(b)) + Math.abs(a.r - b.r)).toBeGreaterThan(1e-3);
      }, (d) => fp(pt(d, 'A').x));
    },
  );

  it('«שני מעגלים נחתכים» names its crossings A and B (2-D’s letters); beside an A, B and C', () => {
    builds(['שני מעגלים נחתכים']);
    expect(derive(['שני מעגלים נחתכים'], 0).figure.points.map((p) => p.id).sort()).toEqual(['A', 'B']);
    expect(derive(['נקודה A', 'שני מעגלים נחתכים'], 0).figure.points.map((p) => p.id).sort()).toEqual(['A', 'B', 'C']);
  });

  it('the issue’s sequence builds as typed: P names the first circle, O the other', () => {
    const lines = ['שני מעגלים נחתכים בנקודות A ו B', 'נקודה C על מעגל P', 'המשך CA חותך את מעגל O בנקודה D', 'המשך CB חותך את מעגל O בנקודה E'];
    builds(lines);
    acrossSeeds(lines, (d) => {
      const [first, second] = circles(d);
      expect(dist(pt(d, 'P'), centre(first))).toBeLessThan(EPS);
      expect(dist(pt(d, 'O'), centre(second))).toBeLessThan(EPS);
      expect(on(pt(d, 'C'), first)).toBe(true);
      for (const p of ['D', 'E']) expect(on(pt(d, p), second)).toBe(true);
      expect(collinear(pt(d, 'D'), pt(d, 'C'), pt(d, 'A'))).toBe(true);
      expect(collinear(pt(d, 'E'), pt(d, 'C'), pt(d, 'B'))).toBe(true);
    });
  });

  it('«O מרכז המעגל» · «P מרכז המעגל» name the two circles, by order', () => {
    const lines = ['שני מעגלים נחתכים', 'O מרכז המעגל', 'P מרכז המעגל'];
    builds(lines);
    acrossSeeds(lines, (d) => {
      const [first, second] = circles(d);
      expect(dist(pt(d, 'O'), centre(first))).toBeLessThan(EPS);
      expect(dist(pt(d, 'P'), centre(second))).toBeLessThan(EPS);
    });
  });

  it('once named, the letter means that circle: «D על מעגל P» binds, never a third circle', () => {
    const lines = ['שני מעגלים נחתכים בנקודות A ו-B', 'נקודה C על מעגל P', 'D על מעגל P'];
    builds(lines);
    const d = derive(lines, 0);
    expect(circles(d)).toHaveLength(2);
    expect(on(pt(d, 'D'), circles(d)[0])).toBe(true);
  });

  it('«מעגל O» on its own is a NEW circle beside the pair (2-D draws a third circle)', () => {
    builds(['שני מעגלים נחתכים בנקודות A ו-B', 'מעגל O']);
    expect(circles(derive(['שני מעגלים נחתכים בנקודות A ו-B', 'מעגל O'], 0))).toHaveLength(3);
  });

  it('circles a statement tells apart are not picked between: «C על מעגל P» on a nested pair asks which', () => {
    expect(typed(['שני מעגלים מוכלים', 'C על מעגל P']).kinds[1]).toBe('refused:ambiguous-shape');
    expect(typed(['מעגל מוכל בתוך המעגל הגדול', 'C על מעגל P']).kinds[1]).toBe('refused:ambiguous-shape');
  });

  it('a lone unnamed circle keeps ADR-AG-210’s rule: a named circle beside it is its own circle', () => {
    builds(['AB קוטר', 'A על מעגל O']);
    expect(circles(derive(['AB קוטר', 'A על מעגל O'], 0))).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Lines cutting circles
// ---------------------------------------------------------------------------------------------------------------

describe('secants', () => {
  it.each(['ישר החותך את המעגל בשתי נקודות', 'ישר חותך את המעגל בנקודות C ו-D', 'a line cutting the circle at two points'])(
    '«%s»: C and D, two points of the circle',
    (line) => {
      builds([line]);
      acrossSeeds([line], (d) => {
        const c = circles(d)[0];
        expect(on(pt(d, 'C'), c) && on(pt(d, 'D'), c)).toBe(true);
        expect(dist(pt(d, 'C'), pt(d, 'D'))).toBeGreaterThan(1e-3);
      }, (d) => fp(pt(d, 'C').x));
    },
  );

  it('…beside a C, the ends are D and E; on «מעגל O» it is O’s', () => {
    expect(derive(['נקודה C', 'ישר החותך את המעגל בשתי נקודות'], 0).figure.points.map((p) => p.id).sort()).toEqual(['C', 'D', 'E']);
    builds(['מעגל O', 'ישר החותך את המעגל בשתי נקודות']);
    expect(circles(derive(['מעגל O', 'ישר החותך את המעגל בשתי נקודות'], 0))).toHaveLength(1);
  });

  it('«ישר חותך את שני המעגלים בנקודות C, D, E ו-F»: C, D on the first, E, F on the second, in a row, in order', () => {
    for (const lines of [['ישר חותך את שני המעגלים בנקודות C, D, E ו-F'], ['מעגל O', 'מעגל P', 'ישר חותך את שני המעגלים בנקודות C, D, E ו-F']]) {
      builds(lines);
      acrossSeeds(lines, (d) => {
        const [a, b] = circles(d);
        const [C, D, E, F] = ['C', 'D', 'E', 'F'].map((p) => pt(d, p));
        expect(on(C, a) && on(D, a) && on(E, b) && on(F, b)).toBe(true);
        expect(collinear(D, C, F) && collinear(E, C, F)).toBe(true);
        expect(between(D, C, E) && between(E, D, F)).toBe(true);
      });
    }
  });

  it('«מנקודה E מחוץ למעגל O ישר חותך את המעגל בנקודות A ו-B»: A, B on O, E outside, A between E and B', () => {
    const line = 'מנקודה E מחוץ למעגל O ישר חותך את המעגל בנקודות A ו-B';
    builds([line]);
    acrossSeeds([line], (d) => {
      const o = circle(d, 'circle-at-O');
      expect(on(pt(d, 'A'), o) && on(pt(d, 'B'), o)).toBe(true);
      expect(dist(pt(d, 'E'), centre(o))).toBeGreaterThan(o.r);
      expect(between(pt(d, 'A'), pt(d, 'E'), pt(d, 'B'))).toBe(true);
    }, (d) => fp(pt(d, 'E').x));
  });

  it('«הישר AC פוגש את מעגל P בנקודה E» is «… חותך את …»: E on line AC and on P', () => {
    const lines = ['משולש ישר-זווית ABC', 'הישר AC פוגש את מעגל P בנקודה E'];
    builds(lines);
    acrossSeeds(lines, (d) => {
      expect(on(pt(d, 'E'), circle(d, 'circle-at-P'))).toBe(true);
      expect(collinear(pt(d, 'E'), pt(d, 'A'), pt(d, 'C'))).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Tangents
// ---------------------------------------------------------------------------------------------------------------

describe('tangents', () => {
  it.each(['AB מיתר במעגל O ומשיק למעגל P', 'AB is a chord of circle O and tangent to circle P'])('«%s»: A, B on O, the line AB at distance r_P from P', (line) => {
    const lines = ['מעגל O', 'מעגל P', line];
    builds(lines);
    acrossSeeds(lines, (d) => {
      const [o, p] = [circle(d, 'circle-at-O'), circle(d, 'circle-at-P')];
      const [A, B] = [pt(d, 'A'), pt(d, 'B')];
      expect(on(A, o) && on(B, o)).toBe(true);
      expect(Math.abs(Math.abs(side(centre(p), A, B)) / dist(A, B) - p.r)).toBeLessThan(1e-4 * Math.max(1, p.r));
    }, (d) => fp(pt(d, 'A').x));
  });

  it('«משיק למעגל»: a touch point T on the circle and the tangent there (S beside a T)', () => {
    builds(['משיק למעגל']);
    acrossSeeds(['משיק למעגל'], (d) => {
      expect(on(pt(d, 'T'), circles(d)[0])).toBe(true);
      expect(d.figure.curves.some((c) => c.id === 'tangent-T')).toBe(true);
    }, (d) => fp(pt(d, 'T').x));
    expect(derive(['נקודה T', 'משיק למעגל'], 0).figure.points.map((p) => p.id).sort()).toEqual(['S', 'T']);
  });

  it('«מנקודה E משיק נוגע במעגל O בנקודה D»: D on O, ED ⊥ OD', () => {
    const line = 'מנקודה E משיק נוגע במעגל O בנקודה D';
    builds([line]);
    acrossSeeds([line], (d) => {
      const o = circle(d, 'circle-at-O');
      expect(on(pt(d, 'D'), o)).toBe(true);
      expect(perp(pt(d, 'E'), pt(d, 'D'), pt(d, 'O'), pt(d, 'D'))).toBe(true);
      expect(dist(pt(d, 'E'), pt(d, 'D'))).toBeGreaterThan(1e-3);
    }, (d) => fp(pt(d, 'E').x));
  });

  it('«מנקודה E מחוץ למעגל O שני משיקים נוגעים במעגל בנקודות A ו-B»: both touches, A ≠ B', () => {
    const line = 'מנקודה E מחוץ למעגל O שני משיקים נוגעים במעגל בנקודות A ו-B';
    builds([line]);
    acrossSeeds([line], (d) => {
      const o = circle(d, 'circle-at-O');
      for (const p of ['A', 'B']) {
        expect(on(pt(d, p), o)).toBe(true);
        expect(perp(pt(d, 'E'), pt(d, p), pt(d, 'O'), pt(d, p))).toBe(true);
      }
      expect(dist(pt(d, 'A'), pt(d, 'B'))).toBeGreaterThan(1e-3);
    }, (d) => fp(pt(d, 'E').x));
  });

  it.each([
    [['AB משיק משותף למעגלים O ו-P'], undefined],
    [['AB is a common tangent to circles O and P'], undefined],
    [['AB משיק משותף חיצוני לשני המעגלים'], 'external'],
    [['מעגל O', 'מעגל P', 'AB משיק משותף פנימי לשני המעגלים'], 'internal'],
  ] as const)('%j: A on the first circle, B on the second, AB ⊥ both radii (%s)', (lines, kind) => {
    builds(lines);
    acrossSeeds(lines, (d) => {
      const [c1, c2] = circles(d);
      const [A, B] = [pt(d, 'A'), pt(d, 'B')];
      expect(on(A, c1) && on(B, c2)).toBe(true);
      expect(perp(A, B, centre(c1), A)).toBe(true);
      expect(perp(A, B, centre(c2), B)).toBe(true);
      const sides = side(centre(c1), A, B) * side(centre(c2), A, B);
      if (kind === 'external') expect(sides).toBeGreaterThan(0);
      if (kind === 'internal') expect(sides).toBeLessThan(0);
    }, (d) => fp(pt(d, 'A').x));
  });

  it('«CD משיק משותף למעגלים O ו-P בנקודה M»: the circles touch at M, CD ⊥ OM there, M between C and D', () => {
    const line = 'CD משיק משותף למעגלים O ו-P בנקודה M';
    builds([line]);
    acrossSeeds([line], (d) => {
      const [o, p] = [circle(d, 'circle-at-O'), circle(d, 'circle-at-P')];
      const M = pt(d, 'M');
      expect(on(M, o) && on(M, p)).toBe(true);
      expect(perp(pt(d, 'C'), pt(d, 'D'), pt(d, 'O'), M)).toBe(true);
      expect(between(M, pt(d, 'C'), pt(d, 'D'))).toBe(true);
    });
  });

  it('«מנקודה A יוצאים שני משיקים לשני המעגלים»: two common tangents BC and DE through A', () => {
    const line = 'מנקודה A יוצאים שני משיקים לשני המעגלים';
    builds([line]);
    acrossSeeds([line], (d) => {
      expect(d.figure.points.map((p) => p.id).sort()).toEqual(['A', 'B', 'C', 'D', 'E']);
      const [c1, c2] = circles(d);
      const [A, B, C, D, E] = ['A', 'B', 'C', 'D', 'E'].map((p) => pt(d, p));
      expect(on(B, c1) && on(D, c1) && on(C, c2) && on(E, c2)).toBe(true);
      expect(perp(B, C, centre(c1), B) && perp(B, C, centre(c2), C)).toBe(true);
      expect(perp(D, E, centre(c1), D) && perp(D, E, centre(c2), E)).toBe(true);
      expect(collinear(A, B, C) && collinear(A, D, E)).toBe(true);
      expect(dist(B, D)).toBeGreaterThan(1e-3);
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Every row sentence, both languages, through the submit gate
// ---------------------------------------------------------------------------------------------------------------

describe('the English spellings build too', () => {
  it.each([
    'circle centered at O radius 5',
    'circle with center O',
    'the centre of the circle',
    'circle O with radius R',
    'a circle contained inside the big circle',
    'a line cuts the two circles at points C, D, E and F',
    'from a point E outside circle O a line cuts the circle at A and B',
    'a tangent to the circle',
    'from point E a tangent touches circle O at D',
    'from point E outside circle O two tangents touch the circle at A and B',
    'AB is an external common tangent of the two circles',
    'CD is a common tangent to circles O and P at M',
    'from point A two tangents to the two circles',
  ])('«%s»', (line) => builds([line]));
});
