/**
 * #1670 (ADR-AG-210) — analytic follows 2-D where a sentence names points or a circle the figure does not have yet.
 *
 * Operator rulings, 2026-10-02 (on #1670): rows 1–2 follow 2-D; *"an unlablled circle should not be O automatically. and
 * yes - accept new letter with same logic the 2d tool has"*. Measured on 2-D's `decideDeterministic2D` before porting:
 *
 * 1. «AB קוטר» · «OB רדיוס» — the radius NAMES the unnamed centre with the student's letter (2-D: `name-center`).
 * 2. «A על המעגל» with no circle — the sentence states the circle (centre unnamed, free centre and radius).
 * 3. A NAMED circle the figure lacks («A על המעגל שמרכזו M», «מיתר AB במעגל O», «AB משיק למעגל C») — stated on that centre.
 * 4. New letters in a bare relation («מעגל O» · «BD⊥AC») — minted as free points, in exactly the forms 2-D mints for
 *    (a lowering that draws a segment through them); the forms 2-D refuses keep #1028's refusal.
 *
 * And the #1673 / #1686 rulings: an unlabelled centre never answers to a letter, and a NEW letter beside it is still
 * minted — a free point (*"create a segment BO where B is where we know it is and O is free"*) — which a later
 * «O מרכז המעגל» / «OB רדיוס» PLACES at the centre, with no second point.
 *
 * Every assertion CALLS the real decision (`decideSubmit`, `derive`); nothing re-implements it.
 */
import { describe, expect, it } from 'vitest';
import { derive, type Derivation } from '../engine/derive';
import { decideSubmit } from '../app/submit';

/** Type the lines through the submit gate; every verdict, and the lines it kept. */
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
const builds = (lines: readonly string[]) => expect(typed(lines).kinds, lines.join(' · ')).toEqual(lines.map(() => 'record'));
const pt = (d: Derivation, id: string) => {
  const p = d.figure.points.find((q) => q.id === id);
  if (!p) throw new Error(`no point ${id}`);
  return p;
};
const circles = (d: Derivation) =>
  d.figure.curves.flatMap((c) => (c.curve.kind === 'circle' ? [{ id: c.id, cx: c.curve.cx, cy: c.curve.cy, r: c.curve.r }] : []));
const theCircle = (d: Derivation) => {
  const cs = circles(d);
  expect(cs).toHaveLength(1);
  return cs[0];
};
const close = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
const onCircle = (d: Derivation, id: string) => {
  const c = theCircle(d);
  const p = pt(d, id);
  return close(Math.hypot(p.x - c.cx, p.y - c.cy), c.r);
};
const SEEDS = [0, 1, 2, 3, 5, 8];
/** Every seed derives clean and `check` holds; and the point `free` lands in more than one place (ADR-052). */
function acrossSeeds(lines: readonly string[], check: (d: Derivation) => void, free?: string) {
  const places = new Set<string>();
  for (const seed of SEEDS) {
    const d = derive(lines, seed);
    expect(d.faults, `seed ${seed}: ${lines.join(' · ')}`).toEqual([]);
    check(d);
    if (free) places.add(`${pt(d, free).x.toFixed(4)},${pt(d, free).y.toFixed(4)}`);
  }
  if (free) expect(places.size, `${free} is a free DOF, not a default`).toBeGreaterThan(1);
}

// ---------------------------------------------------------------------------------------------------------------
// Row 1 — the radius names the unnamed centre with the student's letter
// ---------------------------------------------------------------------------------------------------------------

describe('#1670 row 1 — «OB רדיוס» names a centre that has no letter', () => {
  it.each([
    [['AB קוטר', 'OB רדיוס']],
    [['AB קוטר', 'הרדיוס OB']],
    [['AB קוטר', 'OB הוא רדיוס']],
    [['AB קוטר', 'AO רדיוס']],
  ])('%j builds, and O IS the diameter’s midpoint at every seed', (lines) => {
    builds(lines);
    acrossSeeds(
      lines,
      (d) => {
        const [a, b, o] = [pt(d, 'A'), pt(d, 'B'), pt(d, 'O')];
        expect(close(o.x, (a.x + b.x) / 2) && close(o.y, (a.y + b.y) / 2)).toBe(true);
        const c = theCircle(d);
        expect(close(o.x, c.cx) && close(o.y, c.cy)).toBe(true);
      },
      'A',
    );
  });

  it.each([
    [['מיתר AB', 'OA רדיוס']],
    [['A על המעגל', 'OA רדיוס']],
    [['AB ו-BC משיקים למעגל בנקודות A ו-C בהתאמה', 'OA רדיוס']],
  ])('%j builds, and O is the centre of the circle the first sentence stated', (lines) => {
    builds(lines);
    acrossSeeds(lines, (d) => {
      const c = theCircle(d);
      const o = pt(d, 'O');
      expect(close(o.x, c.cx) && close(o.y, c.cy)).toBe(true);
      expect(onCircle(d, 'A')).toBe(true);
    });
  });

  it('the named centre is then the centre: «O מרכז המעגל» is already known, and «BO = 5» builds', () => {
    expect(typed(['AB קוטר', 'OB רדיוס', 'O מרכז המעגל']).kinds.at(-1)).toBe('already-known');
    expect(typed(['AB קוטר', 'OB רדיוס', 'BO = 5']).kinds.at(-1)).toBe('record');
    const d = derive(['AB קוטר', 'OB רדיוס', 'BO = 5'], 0);
    expect(close(theCircle(d).r, 5)).toBe(true);
  });

  it.each([
    // both ends new: nothing says which one is the centre (2-D reads «O» as the centre by convention; ruled out, #1673)
    [['מיתר AB', 'CO רדיוס'], 'refused:out-of-scope'],
    [['(x-1)^2+(y-2)^2=9', 'OA רדיוס'], 'refused:out-of-scope'],
    // no circle at all (2-D refuses too)
    [['OB רדיוס'], 'refused:ambiguous-shape'],
    [['הרדיוס OB'], 'refused:ambiguous-shape'],
  ])('REFUSAL — %j stays refused', (lines, verdict) => {
    expect(typed(lines).kinds.at(-1)).toBe(verdict);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// #1686 — beside an unnamed centre a new letter is minted FREE; a later sentence places it (operator 2026-10-02)
// ---------------------------------------------------------------------------------------------------------------

/** O is the circle's centre, and the figure holds exactly one point called O. */
function oIsTheCentre(d: Derivation) {
  expect(d.figure.points.filter((p) => p.id === 'O')).toHaveLength(1);
  const c = theCircle(d);
  const o = pt(d, 'O');
  expect(close(o.x, c.cx, 1e-5) && close(o.y, c.cy, 1e-5), `O at (${o.x}, ${o.y}), centre (${c.cx}, ${c.cy})`).toBe(true);
}

describe('#1686 — a new letter beside an unnamed centre is a free point until a sentence places it', () => {
  it.each([
    [['AB קוטר', 'BO = 5']],
    [['AB ו-BC משיקים למעגל בנקודות A ו-C בהתאמה', 'BO = 5']],
    [['AB קוטר', 'OC ⊥ AB']],
    [['AB קוטר', 'CD ⊥ AB']],
    [['מיתר AB', 'M אמצע OB']],
  ])('%j builds — the new letters are minted', (lines) => {
    builds(lines);
  });

  it('«AB קוטר» · «BO = 5»: BO is drawn, |BO| = 5, and O is FREE — not the hidden centre', () => {
    const lines = ['AB קוטר', 'BO = 5'];
    let offCentre = 0;
    acrossSeeds(
      lines,
      (d) => {
        const [b, o] = [pt(d, 'B'), pt(d, 'O')];
        expect(close(Math.hypot(b.x - o.x, b.y - o.y), 5, 1e-5)).toBe(true);
        expect(d.figure.segments.some((s) => [...s.ends].sort().join('') === 'BO')).toBe(true);
        const c = theCircle(d);
        if (!close(o.x, c.cx, 1e-3) || !close(o.y, c.cy, 1e-3)) offCentre++;
      },
      'O',
    );
    expect(offCentre, 'O is not silently the centre').toBeGreaterThan(0);
  });

  it.each([
    [['AB קוטר', 'BO = 5', 'O מרכז המעגל']],
    [['AB קוטר', 'BO = 5', 'OB רדיוס']],
    [['AB קוטר', 'BO = 5', 'הרדיוס OB']],
    [['AB ו-BC משיקים למעגל בנקודות A ו-C בהתאמה', 'BO = 5', 'O מרכז המעגל']],
    [['AB קוטר', 'OC ⊥ AB', 'O מרכז המעגל']],
  ])('%j — the later sentence PLACES the free O at the centre, at every seed, and makes no second point', (lines) => {
    builds(lines);
    acrossSeeds(lines, oIsTheCentre);
  });

  it('…and the givens still hold once O is placed: «BO = 5» makes the radius 5', () => {
    acrossSeeds(['AB קוטר', 'BO = 5', 'O מרכז המעגל'], (d) => {
      expect(close(theCircle(d).r, 5, 1e-5)).toBe(true);
      expect(d.figure.points.map((p) => p.id).sort()).toEqual(['A', 'B', 'O']);
    });
  });

  it('a named circle beside an unnamed centre is its own circle on a free letter («AB קוטר» · «A על מעגל O»)', () => {
    builds(['AB קוטר', 'A על מעגל O']);
    expect(circles(derive(['AB קוטר', 'A על מעגל O'], 0))).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Row 2 — «A על המעגל» with no circle states it
// ---------------------------------------------------------------------------------------------------------------

describe('#1670 row 2 — a point on «המעגל» with no circle states the circle', () => {
  it.each(['A על המעגל', 'A על מעגל', 'הנקודה A על המעגל', 'A נמצאת על המעגל', 'A is on the circle', 'A is on a circle'])(
    '«%s» builds: A on a circle whose centre and radius are free',
    (line) => {
      builds([line]);
      acrossSeeds([line], (d) => expect(onCircle(d, 'A')).toBe(true), 'A');
      const centres = new Set(SEEDS.map((s) => theCircle(derive([line], s))).map((c) => `${c.cx.toFixed(4)},${c.cy.toFixed(4)},${c.r.toFixed(4)}`));
      expect(centres.size, 'the circle is not a default either').toBeGreaterThan(1);
    },
  );

  it('several points on «המעגל» are on ONE circle', () => {
    for (const lines of [['A, B ו-C על המעגל'], ['הנקודות A ו-B על המעגל'], ['A על המעגל', 'B על המעגל']]) {
      builds(lines);
      acrossSeeds(lines, (d) => expect(['A', 'B'].every((p) => onCircle(d, p))).toBe(true));
    }
  });

  it('a parabola or an ellipse the figure lacks is still refused — only the circle has a create path', () => {
    expect(typed(['A על הפרבולה']).kinds).toEqual(['refused:ambiguous-shape']);
    expect(typed(['A על האליפסה']).kinds).toEqual(['refused:ambiguous-shape']);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// A NAMED circle the figure lacks — stated on its centre letter
// ---------------------------------------------------------------------------------------------------------------

describe('#1670 — a named circle the figure lacks is stated on that centre', () => {
  it.each([
    [['A על המעגל שמרכזו M'], 'M', ['A']],
    [['A על מעגל O'], 'O', ['A']],
    [['A על המעגל O'], 'O', ['A']],
    [['נקודה O', 'A על מעגל O'], 'O', ['A']],
    [['מיתר AB במעגל O'], 'O', ['A', 'B']],
    [['AB מיתר במעגל O'], 'O', ['A', 'B']],
    [['AB ו-CD מיתרים במעגל O'], 'O', ['A', 'B', 'C', 'D']],
    [['AB ו-CD הם מיתרים במעגל O'], 'O', ['A', 'B', 'C', 'D']],
    [['המיתרים AB ו-CD במעגל O'], 'O', ['A', 'B', 'C', 'D']],
    [['AB and CD are chords of the circle O'], 'O', ['A', 'B', 'C', 'D']],
    [['AB קוטר במעגל O'], 'O', ['A', 'B']],
    [['המשיק למעגל O בנקודה A'], 'O', ['A']],
  ])('%j builds: the circle is centred at %s, the named points on it, the centre free', (lines, centre, on) => {
    builds(lines);
    acrossSeeds(
      lines,
      (d) => {
        const c = theCircle(d);
        const o = pt(d, centre);
        expect(close(o.x, c.cx) && close(o.y, c.cy)).toBe(true);
        for (const p of on) expect(onCircle(d, p), p).toBe(true);
      },
      centre,
    );
  });

  it('«AB קוטר במעגל O» — O is the midpoint of the diameter', () => {
    acrossSeeds(['AB קוטר במעגל O'], (d) => {
      const [a, b, o] = [pt(d, 'A'), pt(d, 'B'), pt(d, 'O')];
      expect(close(o.x, (a.x + b.x) / 2) && close(o.y, (a.y + b.y) / 2)).toBe(true);
    });
  });

  it('«AB משיק למעגל C» (cat-2d-150) — the circle on C is stated and AB touches it', () => {
    for (const line of ['AB משיק למעגל C', 'הישר AB משיק למעגל C']) {
      builds([line]);
      acrossSeeds([line], (d) => {
        const c = theCircle(d);
        const [a, b] = [pt(d, 'A'), pt(d, 'B')];
        const dist = Math.abs((b.x - a.x) * (a.y - c.cy) - (a.x - c.cx) * (b.y - a.y)) / Math.hypot(b.x - a.x, b.y - a.y);
        expect(close(dist, c.r, 1e-5)).toBe(true);
      });
    }
  });

  it('a second named circle beside a named one is its own circle («מעגל O» · «A על מעגל M»)', () => {
    builds(['מעגל O', 'A על מעגל M']);
    expect(circles(derive(['מעגל O', 'A על מעגל M'], 0))).toHaveLength(2);
  });

  it('a NUMERAL that names no circle is still refused (a numeral is no centre letter)', () => {
    expect(typed(['A על מעגל 3']).kinds).toEqual(['refused:unknown-reference']);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Row 4 — new letters in a bare relation, by 2-D's rule
// ---------------------------------------------------------------------------------------------------------------

describe('#1670 row 4 — a bare relation mints its new letters where 2-D does', () => {
  it('«מעגל O» · «BD⊥AC» builds; B, D, A, C are FREE and BD ⊥ AC at every seed', () => {
    const lines = ['מעגל O', 'BD⊥AC'];
    builds(lines);
    acrossSeeds(
      lines,
      (d) => {
        const [a, b, c, dd] = ['A', 'B', 'C', 'D'].map((id) => pt(d, id));
        const dot = (dd.x - b.x) * (c.x - a.x) + (dd.y - b.y) * (c.y - a.y);
        expect(Math.abs(dot)).toBeLessThan(1e-6 * Math.max(1, Math.hypot(dd.x - b.x, dd.y - b.y) * Math.hypot(c.x - a.x, c.y - a.y)));
      },
      'B',
    );
  });

  it('…and «AC קוטר» after it puts the minted A and C on the circle, through O', () => {
    const lines = ['מעגל O', 'BD⊥AC', 'AC קוטר'];
    builds(lines);
    acrossSeeds(lines, (d) => {
      const [a, c, o] = [pt(d, 'A'), pt(d, 'C'), pt(d, 'O')];
      expect(onCircle(d, 'A') && onCircle(d, 'C')).toBe(true);
      expect(close(o.x, (a.x + c.x) / 2) && close(o.y, (a.y + c.y) / 2)).toBe(true);
    });
  });

  // measured on 2-D: every one commits, minting its new letters free
  it.each([
    'BD⊥AC',
    'AB∥CD',
    'AB ⊥ CD',
    'AB ניצב ל-CD',
    'AB מקביל ל-CD',
    'הישרים AB ו-CD מקבילים',
    'AB = CD',
    'AB = 5',
    'AB + BC = 10',
    'זווית ABC = 30',
    'M אמצע AB',
    'E על AB',
    'E על הישר AB',
    'AB חותך את CD בנקודה E',
    'C מחלקת את AB ביחס 3:2',
    'AD גובה במשולש ABC',
  ])('«%s» on an empty canvas builds', (line) => {
    builds([line]);
    acrossSeeds([line], () => undefined);
  });

  it('the givens hold on the minted points: «AB = 5», «M אמצע AB», «זווית ABC = 30»', () => {
    acrossSeeds(['AB = 5'], (d) => expect(close(Math.hypot(pt(d, 'A').x - pt(d, 'B').x, pt(d, 'A').y - pt(d, 'B').y), 5)).toBe(true), 'A');
    acrossSeeds(['M אמצע AB'], (d) => {
      const [a, b, m] = [pt(d, 'A'), pt(d, 'B'), pt(d, 'M')];
      expect(close(m.x, (a.x + b.x) / 2) && close(m.y, (a.y + b.y) / 2)).toBe(true);
    }, 'A');
    acrossSeeds(['זווית ABC = 30'], (d) => {
      const [a, b, c] = [pt(d, 'A'), pt(d, 'B'), pt(d, 'C')];
      const ang = Math.abs(Math.atan2(a.y - b.y, a.x - b.x) - Math.atan2(c.y - b.y, c.x - b.x)) * (180 / Math.PI);
      expect(close(Math.min(ang, 360 - ang), 30, 1e-5)).toBe(true);
    });
  });

  it('a letter a LATER line defines is still defined there — the mint is the last resort (deferral first)', () => {
    const d = derive(['M אמצע AB', 'A(0,0)', 'B(4,0)'], 0);
    expect(d.faults).toEqual([]);
    expect([pt(d, 'M').x, pt(d, 'M').y]).toEqual([2, 0]);
    expect(typed(['BD⊥AC', 'D אמצע AB']).kinds).toEqual(['record', 'record']);
  });

  // measured on 2-D: each is refused — no letter is minted, #1028's refusal holds
  it.each([
    ['AB = 2CD', 'A'],
    ['AB:BC = 2:3', 'A'],
    ['AD גובה לצלע BC', 'B'],
    ['AD תיכון לצלע BC', 'B'],
  ])('REFUSAL — «%s» on an empty canvas mints nothing and names %s', (line, missing) => {
    const { last } = typed([line]);
    expect(last.kind === 'refused' && last.error.key).toBe('unknown-reference');
    expect(last.kind === 'refused' && last.error.detail).toBe(missing);
  });
});
