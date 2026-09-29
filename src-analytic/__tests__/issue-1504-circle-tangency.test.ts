/**
 * CIRCLE-TO-CIRCLE TANGENCY (#1504, ADR-AG-167) — the third member of the tangency family.
 *
 * Operator, playing PR #1502's T9 (2026-09-28): *"passes but when i do build both circles, its
 * still refused."* T9's pass condition WAS the honest refusal — ADR-AG-165 pre-declared this its
 * own capability — and the report is the go-ahead.
 *
 * One equation with a DISCRETE unstated choice: |MK| = r+R (external) or |MK| = |r−R| (internal).
 * The choice cycles under «הציגו תצורה אחרת» (#1049) — never a silently picked seat (ADR-052) —
 * and a branch word collapses it. Seed sweep per ADR-AG-144: a 2/24 pass must not read as done.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { reportedDof } from '../engine/carriers';
import { decideSubmit } from '../app/submit';
import { inDomain } from '../engine/types';

const SEEDS = 12;

const build = (lines: string[], seed = 0) => {
  const d = derive(lines, seed);
  const pt = (id: string) => d.figure.points.find((p) => p.id === id) ?? null;
  const radii = () => d.figure.curves.map((c) => c.curve).filter((c) => c.kind === 'circle').map((c) => (c as { r: number }).r);
  return { d, pt, radii, dof: reportedDof(d.construction, d.figure.carrierDof) };
};

/** Which touch this configuration drew — measured off the figure, not off internals. */
const branchOf = (f: ReturnType<typeof build>) => {
  const [r1, r2] = f.radii();
  const a = f.pt('M')!;
  const b = f.pt('K')!;
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  if (Math.abs(d - (r1 + r2)) < 1e-5 * Math.max(1, d)) return 'external';
  if (Math.abs(d - Math.abs(r1 - r2)) < 1e-5 * Math.max(1, d)) return 'internal';
  return `neither (d=${d}, r=${r1},${r2})`;
};

describe('#1504 — «מעגל M משיק למעגל K» holds one of the two touch equations, at every seed', () => {
  it("the operator's sentence: |MK| = r+R or |r−R| at 12/12 seeds, and BOTH branches are reached", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const f = build(['נתון מעגל K', 'נתון מעגל M', 'מעגל M משיק למעגל K'], seed);
      expect(f.d.faults, `seed ${seed}`).toEqual([]);
      const br = branchOf(f);
      expect(['external', 'internal'], `seed ${seed}: ${br}`).toContain(br);
      seen.add(br);
    }
    // The unstated choice CYCLES — landing on one branch at every seed would be a silently
    // chosen seat, the thing the choice kind exists to prevent.
    expect([...seen].sort()).toEqual(['external', 'internal']);
  });

  it('one equation consumed: two free circles hold 6 DOF, the tangency leaves 5', () => {
    const f = build(['נתון מעגל K', 'נתון מעגל M', 'מעגל M משיק למעגל K']);
    expect(f.d.faults).toEqual([]);
    expect(f.dof).toBe(5);
  });

  it('a branch word PINS the touch — «מבחוץ» external at every seed, «מבפנים» internal', () => {
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const out = build(['נתון מעגל K', 'נתון מעגל M', 'מעגל M משיק למעגל K מבחוץ'], seed);
      expect(out.d.faults, `מבחוץ seed ${seed}`).toEqual([]);
      expect(branchOf(out), `seed ${seed}`).toBe('external');
      const inn = build(['נתון מעגל K', 'נתון מעגל M', 'מעגל M משיק למעגל K מבפנים'], seed);
      expect(inn.d.faults, `מבפנים seed ${seed}`).toEqual([]);
      expect(branchOf(inn), `seed ${seed}`).toBe('internal');
    }
  });
});

describe('#1504 — every order and the contextual forms', () => {
  it.each([
    ['המעגל M משיק למעגל K', ['נתון מעגל K']],
    ['המעגל משיק למעגל K', ['נתון מעגל K', 'נתון מעגל M']],
    ['המעגלים משיקים', ['נתון מעגל K', 'נתון מעגל M']],
    ['שני המעגלים משיקים זה לזה', ['נתון מעגל K', 'נתון מעגל M']],
    ['circle M is tangent to circle K', ['נתון מעגל K']],
    ['the circles are tangent', ['נתון מעגל K', 'נתון מעגל M']],
  ])('«%s» builds and touches', (line, pre) => {
    const f = build([...pre, line]);
    expect(f.d.faults).toEqual([]);
    expect(['external', 'internal']).toContain(branchOf(f));
  });

  it('«המעגלים משיקים מבחוץ» — the plural subject takes the branch word too', () => {
    const f = build(['נתון מעגל K', 'נתון מעגל M', 'המעגלים משיקים מבחוץ']);
    expect(f.d.faults).toEqual([]);
    expect(branchOf(f)).toBe('external');
  });

  it('restating the tangency is idempotent — the same statement, not a second equation', () => {
    const f = build(['נתון מעגל K', 'נתון מעגל M', 'מעגל M משיק למעגל K', 'מעגל K משיק למעגל M']);
    expect(f.dof).toBe(5); // undirected: the restatement consumed nothing
  });
});

describe('#1504 — refusals, never silent drops', () => {
  it('tangency to an EQUATION circle is out of scope, by name — no centre and no radius to pull on', () => {
    const d = derive(['נתון מעגל I שמשוואתו x^2+y^2=9', 'מעגל M משיק למעגל I'], 0);
    expect(d.faults.map((f) => f.code)).toEqual(['out-of-scope']);
  });

  it('a circle named that does not exist is unknown-reference', () => {
    const d = derive(['נתון מעגל M', 'מעגל M משיק למעגל K'], 0);
    // K is minted by the SENTENCE only when it is the subject; as a target it must exist.
    expect(d.faults.map((f) => f.code)).toEqual(['unknown-reference']);
  });

  it('«המעגלים משיקים» with three circles is ambiguous, with one circle too', () => {
    const three = derive(['נתון מעגל K', 'נתון מעגל M', 'נתון מעגל O', 'המעגלים משיקים'], 0);
    expect(three.faults.map((f) => f.code)).toEqual(['ambiguous-shape']);
    const one = derive(['נתון מעגל K', 'המעגלים משיקים'], 0);
    expect(one.faults.map((f) => f.code)).toEqual(['ambiguous-shape']);
  });

  it('a circle is not tangent to itself', () => {
    const d = derive(['נתון מעגל M', 'המעגל M משיק למעגל M'], 0);
    expect(d.faults.map((f) => f.code)).toEqual(['unsatisfiable']);
  });
});

describe('#1504 — the line and axis tangency family is untouched', () => {
  it('«מעגל M משיק לישר l1» still reads distance = radius', () => {
    const f = build(['נתון הישר l1: y=2x+5', 'מעגל M משיק לישר l1']);
    expect(f.d.faults).toEqual([]);
  });

  it('a mixed list — «מעגל M משיק לציר ה-x ולמעגל K» — is the axis AND the circle', () => {
    const f = build(['נתון מעגל K', 'מעגל M משיק לציר ה-x ולמעגל K']);
    expect(f.d.faults).toEqual([]);
    const m = f.pt('M')!;
    const rM = f.radii()[1]; // K declared first, M minted by the tangency sentence
    expect(Math.abs(Math.abs(m.y) - rM)).toBeLessThan(1e-5);
    expect(['external', 'internal']).toContain(branchOf(f));
  });
});

// ---------------------------------------------------------------------------
// Amendment 1 — the 2026-09-29 pre-play (ADR-AG-167 amendment 1)
// ---------------------------------------------------------------------------

/** Drive the REAL submit path, line by line, as the student types — what the play sheet does. */
const submit = (lines: string[], seed = 0) => {
  const kept: string[] = [];
  const verdicts = lines.map((line) => {
    const v = decideSubmit(line, kept, seed);
    if (v.kind === 'record') kept.push(line);
    return v;
  });
  return { kept, verdicts, last: verdicts[verdicts.length - 1] };
};

type NumCircle = { cx: number; cy: number; r: number };
const circlesIn = (d: ReturnType<typeof derive>) =>
  d.figure.curves.map((c) => c.curve).filter((c) => c.kind === 'circle') as unknown as NumCircle[];

/** Which touch the LAST two circles of a derivation make — measured off the figure. */
const touchOf = (d: ReturnType<typeof derive>) => {
  const [a, b] = circlesIn(d).slice(-2);
  const dd = Math.hypot(a.cx - b.cx, a.cy - b.cy);
  const tol = 1e-5 * Math.max(1, dd);
  if (Math.abs(dd - (a.r + b.r)) < tol) return 'external';
  if (Math.abs(dd - Math.abs(a.r - b.r)) < tol) return 'internal';
  return 'neither';
};

describe('#1504 amendment 1 — ONE subject reader: every way a student names the two circles', () => {
  const OM = ['נתון מעגל O', 'נתון מעגל M'];
  it.each([
    // The operator's report, and its neighbours — named, conjoined, plural-named, English.
    ['מעגל O ומעגל M משיקים מבחוץ', 'external'],
    ['מעגל O ומעגל M משיקים זה לזה', null],
    ['המעגל O והמעגל M משיקים', null],
    ['המעגלים O ו-M משיקים', null],
    ['המעגלים O וM משיקים', null],
    ['מעגלים O ו-M משיקים', null],
    ['שני המעגלים O ו-M משיקים מבפנים', 'internal'],
    ['circle O and circle M are tangent', null],
    ['circles O and M are tangent', null],
    ['circles O and M are tangent internally', 'internal'],
  ])('«%s» records and the circles touch', (line, branch) => {
    const run = submit([...OM, line]);
    expect(run.last.kind, JSON.stringify(run.last)).toBe('record');
    const got = touchOf(derive(run.kept, 0));
    if (branch) expect(got).toBe(branch);
    else expect(['external', 'internal']).toContain(got);
  });

  it('a conjoined subject INTRODUCES its circles, exactly as «מעגל M משיק…» introduces M', () => {
    const run = submit(['מעגל O ומעגל M משיקים מבחוץ']);
    expect(run.last.kind).toBe('record');
    expect(touchOf(derive(run.kept, 0))).toBe('external');
  });

  it('a conjoined subject with a TARGET — each circle is tangent to it («…משיקים לציר ה-x»)', () => {
    const run = submit(['מעגל O ומעגל M משיקים לציר ה-x']);
    expect(run.last.kind).toBe('record');
    const d = derive(run.kept, 0);
    for (const id of ['O', 'M']) {
      const p = d.figure.points.find((q) => q.id === id)!;
      const c = d.figure.curves.find((q) => q.id === `circle-at-${id}`)!.curve as unknown as NumCircle;
      expect(Math.abs(Math.abs(p.y) - c.r)).toBeLessThan(1e-5);
    }
  });
});

describe('#1504 amendment 1 — ONE branch-word list, in every position', () => {
  const KM = ['נתון מעגל K', 'נתון מעגל M'];
  it.each([
    ['מעגל M משיק מבחוץ למעגל K', 'external'],
    ['מעגל M משיק חיצונית למעגל K', 'external'],
    ['מעגל M משיק למעגל K חיצונית', 'external'],
    ['מעגל M משיק פנימית למעגל K', 'internal'],
    ['מעגל M משיק למעגל K פנימית', 'internal'],
    ['המעגלים משיקים חיצונית', 'external'],
    ['המעגלים משיקים מבחוץ זה לזה', 'external'],
    ['המעגלים משיקים זה לזה מבפנים', 'internal'],
    ['circle M is externally tangent to circle K', 'external'],
    ['circle M is internally tangent to circle K', 'internal'],
    ['the circles are tangent to each other externally', 'external'],
  ])('«%s» pins the %s touch at every seed', (line, branch) => {
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const run = submit([...KM, line], seed);
      expect(run.last.kind, `seed ${seed}`).toBe('record');
      expect(touchOf(derive(run.kept, seed)), `seed ${seed}`).toBe(branch);
    }
  });

  it.each([
    // A modifier with no circle relation to land on is never dropped — the sentence declines.
    [['נתון מעגל M'], 'מעגל M משיק לציר ה-x מבחוץ'],
    [['נתון מעגל M'], 'מעגל M משיק לציר ה-x בנקודה T'],
    [['נתון מעגל K', 'נתון מעגל M'], 'מעגל M משיק למעגל K זה לזה'],
    // Two branch words at odds with each other in one sentence.
    [['נתון מעגל K', 'נתון מעגל M'], 'מעגל M משיק מבחוץ למעגל K מבפנים'],
  ])('%j + «%s» is REFUSED (not-handled), never recorded with a word dropped', (pre, line) => {
    const run = submit([...pre, line]);
    expect(run.last.kind).toBe('refused');
    expect((run.last as { error: { key: string } }).error.key).toBe('not-handled');
  });
});

describe('#1504 amendment 1 — the touch point, named («בנקודה T»)', () => {
  const KM = ['נתון מעגל K', 'נתון מעגל M'];
  it.each([
    'מעגל M משיק למעגל K בנקודה T',
    'מעגל M משיק למעגל K מבפנים בנקודה T',
    'מעגל M משיק למעגל K בנקודה T מבחוץ',
    'המעגלים משיקים בנקודה T',
    'המעגלים משיקים זה לזה בנקודת ההשקה T',
    'circle M is tangent to circle K at T',
  ])('«%s» — T lies on BOTH circles at 12/12 seeds, whichever touch the seed drew', (line) => {
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const run = submit([...KM, line], seed);
      expect(run.last.kind, `seed ${seed}`).toBe('record');
      const d = derive(run.kept, seed);
      const t = d.figure.points.find((p) => p.id === 'T');
      expect(t, `seed ${seed}`).toBeDefined();
      for (const c of circlesIn(d)) {
        expect(Math.abs(Math.hypot(t!.x - c.cx, t!.y - c.cy) - c.r), `seed ${seed}`).toBeLessThan(1e-5 * Math.max(1, c.r));
      }
    }
  });

  it('T is DERIVED — it spends no freedom (two free circles + tangency stay at 5 DOF)', () => {
    const f = build([...KM, 'מעגל M משיק למעגל K בנקודה T']);
    expect(f.dof).toBe(5);
  });

  it('a touch point named with a letter that already exists is a CONDITION on it (the #1320 rule)', () => {
    const run = submit([...KM, 'A(1,1)', 'מעגל M משיק למעגל K בנקודה A']);
    expect(run.last.kind).toBe('record');
    for (const c of circlesIn(derive(run.kept, 0))) {
      expect(Math.abs(Math.hypot(1 - c.cx, 1 - c.cy) - c.r)).toBeLessThan(1e-5);
    }
  });
});

describe('#1504 amendment 1 — a radius the givens force to ZERO is refused (P1 honesty)', () => {
  const KM = ['נתון מעגל K', 'נתון מעגל M'];
  it.each([
    ['מעגל M משיק למעגל K מבחוץ', 'מעגל M משיק למעגל K מבפנים'],
    ['מעגל M משיק למעגל K מבפנים', 'מעגל M משיק למעגל K מבחוץ'],
    ['המעגלים משיקים מבחוץ', 'המעגלים משיקים מבפנים'],
    ['המעגלים משיקים מבפנים', 'המעגלים משיקים מבחוץ'],
  ])('«%s» then «%s» — the second is refused, naming the sentence (plain unsatisfiable)', (first, second) => {
    const run = submit([...KM, first, second]);
    expect(run.verdicts[2].kind).toBe('record');
    expect(run.last.kind).toBe('refused');
    const error = (run.last as { error: { key: string; detail: string; reusedId?: string } }).error;
    expect(error.key).toBe('unsatisfiable');
    expect(error.detail).toBe(second);
    // The conflict is with the other tangency, not with «נתון מעגל M» — no "pick another letter".
    expect(error.reusedId).toBeUndefined();
    // And the figure the student keeps has no degenerate circle.
    for (const c of circlesIn(derive(run.kept, 0))) expect(c.r).toBeGreaterThan(0.1);
  });

  it('the pre-existing axis case is the same class: M(3,0) + «מעגל M משיק לציר ה-x» is refused', () => {
    const run = submit(['M(3,0)', 'נתון מעגל M', 'מעגל M משיק לציר ה-x']);
    expect(run.last.kind).toBe('refused');
    expect((run.last as { error: { key: string } }).error.key).toBe('unsatisfiable');
  });

  it('the judge: an OPEN bound is met by a value within the floor; a closed bound and floor 0 are exact', () => {
    const open = { min: 0, minOpen: true };
    expect(inDomain(open, 8.6e-11)).toBe(true); // exact judgement — what let the zero radius through
    expect(inDomain(open, 8.6e-11, 1e-3)).toBe(false);
    expect(inDomain(open, 0.5, 1e-3)).toBe(true);
    expect(inDomain({ max: 5, maxOpen: true }, 5 - 1e-10, 1e-3)).toBe(false);
    expect(inDomain({ min: 0 }, 0, 1e-3)).toBe(true); // closed: 0 is IN
    expect(inDomain({ exclude: [0] }, 1e-8, 1e-3)).toBe(false);
  });
});

describe('#1504 amendment 1 — concentric circles are NOT tangent (operator ruling 2026-09-29)', () => {
  const SAME = ['K(0,0)', 'M(0,0)', 'נתון מעגל K', 'נתון מעגל M'];
  it.each([
    'המעגלים משיקים',
    'המעגלים משיקים מבפנים',
    'המעגלים משיקים מבחוץ',
    'מעגל M משיק למעגל K',
    'מעגל M משיק למעגל K מבפנים',
    'מעגל K ומעגל M משיקים',
    'circles K and M are tangent internally',
  ])('same centre + «%s» is refused, naming the sentence', (line) => {
    const run = submit([...SAME, line]);
    expect(run.last.kind).toBe('refused');
    const error = (run.last as { error: { key: string; detail: string } }).error;
    expect(error.key).toBe('unsatisfiable');
    expect(error.detail).toBe(line);
  });
});
