/**
 * A LINE CONSTRUCTED THROUGH A POINT (#1093).
 *
 * Operator, 2026-09-15: *"דרך P עובר ישר מקביל ל AB - not supported"*. It was not supported at all —
 * the grammar had no «דרך» rule — so this is a capability, built as a feature rather than patched in
 * under a bug's banner.
 *
 * The design claim under test is that this needs NO new solver machinery: `line-at` is `circle-at`
 * (#1060) one dimension over, and carries no freedom of its own. Its anchor point's DOF are the
 * point's, and its direction is read off an object the figure already determines, so `evaluate`
 * emits the line in closed form.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';

/** A(0,0) B(2,0) is the x-direction; P(1,1) sits off it. */
const BASE = ['A(0,0)', 'B(2,0)', 'נתונה הנקודה P(1,1)'];

type Line = { a: number; b: number; c: number };

const linesOf = (d: ReturnType<typeof derive>): Line[] =>
  d.figure.curves.map((c) => c.curve).filter((c): c is Line & { kind: 'line' } => c.kind === 'line');

const lineOf = (extra: string) => {
  const d = derive([...BASE, extra], 0);
  const drawn = linesOf(d);
  return { d, line: drawn[drawn.length - 1] };
};

/** `ax + by + c = 0` normalised, so two spellings of one line compare equal. */
const asLine = (l: Line | undefined) => {
  if (!l) return null;
  const s = Math.hypot(l.a, l.b) * (l.a < 0 || (Math.abs(l.a) < 1e-12 && l.b < 0) ? -1 : 1);
  return [l.a / s, l.b / s, l.c / s].map((v) => Number(v.toFixed(6)));
};

/** y = 1 — through P(1,1), parallel to the x-direction AB. */
const Y_IS_1 = asLine({ a: 0, b: 1, c: -1 });
/** x = 1 — through P(1,1), perpendicular to AB. */
const X_IS_1 = asLine({ a: 1, b: 0, c: -1 });

describe('#1093 — «דרך P עובר ישר מקביל ל AB» builds the line', () => {
  /**
   * Every spelling, because this tree's most repeated defect is a Hebrew gate that admits one of
   * them and silently drops the rest — five times by #1081's count, six with #1088.
   */
  const PARALLEL = [
    'דרך P עובר ישר מקביל ל AB',
    'דרך P עובר ישר מקביל ל-AB',
    'דרך P עובר ישר מקביל לישר AB',
    'דרך הנקודה P עוברת ישר מקביל ל AB',
    'a line through P is parallel to AB',
    'line through P parallel to AB',
    'the line through P is parallel to AB',
  ];
  for (const spelling of PARALLEL) {
    it(`parallel: ${JSON.stringify(spelling)}`, () => {
      const { d, line } = lineOf(spelling);
      expect(d.faults).toEqual([]);
      expect(asLine(line)).toEqual(Y_IS_1);
    });
  }

  const PERPENDICULAR = [
    'דרך P עובר ישר מאונך ל AB',
    'דרך P עובר ישר ניצב ל AB',
    'דרך P עובר קו מאונך ל AB',
    'line through P perpendicular to AB',
    'the line through P is perpendicular to AB',
  ];
  for (const spelling of PERPENDICULAR) {
    it(`perpendicular: ${JSON.stringify(spelling)}`, () => {
      const { d, line } = lineOf(spelling);
      expect(d.faults).toEqual([]);
      expect(asLine(line)).toEqual(X_IS_1);
    });
  }

  it('an AXIS is a direction like any other — the resolver is the relations own', () => {
    expect(asLine(lineOf('דרך P עובר ישר מקביל לציר ה-x').line)).toEqual(Y_IS_1);
    expect(asLine(lineOf('דרך P עובר ישר מקביל לציר ה-y').line)).toEqual(X_IS_1);
  });

  it('and a NAMED line is too', () => {
    const d = derive(['נתונה הנקודה P(1,1)', 'נתון הישר l1: y=2x', 'דרך P עובר ישר מקביל לישר l1'], 0);
    expect(d.faults).toEqual([]);
    const lines = linesOf(d);
    expect(lines).toHaveLength(2);
    // through (1,1) with slope 2 → y = 2x − 1
    expect(asLine(lines[1])).toEqual(asLine({ a: 2, b: -1, c: -1 }));
  });
});

describe('#1093 — the construction asserts nothing it was not told', () => {
  it('adds NO degrees of freedom (ADR-052 conformance)', () => {
    // The whole design claim in one assertion: the anchor's freedom is the anchor's and the
    // direction is copied, so the object itself contributes none. A construction that added freedom
    // would be a default masquerading as a given.
    const before = derive(BASE, 0);
    const after = derive([...BASE, 'דרך P עובר ישר מקביל ל AB'], 0);
    expect(after.figure.carrierDof).toBe(before.figure.carrierDof);
  });

  it('follows its anchor — a point riding a carrier drags the line with it', () => {
    // P is placed by the solve here, not by coordinates; the line must still pass through wherever
    // it ended up, which is what "reads the PLACED point" means.
    const d = derive(['A(0,0)', 'B(2,0)', 'הנקודה P נמצאת על הישר y=5', 'דרך P עובר ישר מאונך ל AB'], 0);
    expect(d.faults).toEqual([]);
    const p = d.figure.points.find((q) => q.id === 'P')!;
    const through = linesOf(d).find((l) => Math.abs(l.a * p.x + l.b * p.y + l.c) < 1e-6);
    expect(through).toBeDefined();
  });

  it('restating it is already known, not a second line', () => {
    const one = derive([...BASE, 'דרך P עובר ישר מקביל ל AB'], 0);
    const twice = derive([...BASE, 'דרך P עובר ישר מקביל ל AB', 'דרך P עובר ישר מקביל ל AB'], 0);
    expect(twice.faults).toEqual([]);
    expect(twice.figure.curves).toHaveLength(one.figure.curves.length);
  });
});

describe('#1093 — what it refuses, and by name', () => {
  it('an anchor that does not exist is INTRODUCED, with DOF — the operator’s #1066 ruling', () => {
    // «דרך Q» NAMES Q and asserts a line passes through it, which is the same act as «הישר AB»
    // naming A and B. The operator ruled (2026-09-15) that such a name introduces the points rather
    // than refusing, so the figure gains a free vertex and the line rides it.
    const d = derive([...BASE, 'דרך Q עובר ישר מקביל ל AB'], 0);
    expect(d.faults).toEqual([]);
    const q = d.figure.points.find((p) => p.id === 'Q');
    expect(q).toBeDefined();
    // ...and the line really passes through wherever Q was placed.
    const through = linesOf(d).find((l) => Math.abs(l.a * q!.x + l.b * q!.y + l.c) < 1e-6);
    expect(through).toBeDefined();
  });

  it('but the DIRECTION operand is a reference, not a naming — it introduces nothing', () => {
    // The asymmetry is deliberate: relations do not introduce their operands, and a direction is
    // what a relation's operand is. Naming what a construction is ABOUT differs from naming what it
    // is measured against.
    const d = derive(['נתונה הנקודה P(1,1)', 'דרך P עובר ישר מקביל ל CD'], 0);
    expect(d.figure.points.map((p) => p.id)).not.toContain('C');
  });

  it('a direction that is not a direction is an OWNED refusal (ADR-AG-017)', () => {
    // The verb was understood; saying "I did not understand you" about a sentence we parsed would be
    // a false statement to the student, and would route a well-formed given to the LLM seam.
    const d = derive([...BASE, 'דרך P עובר ישר מקביל ל בלה בלה'], 0);
    expect(d.faults.map((f) => f.code)).toEqual(['bad-operand']);
  });
});

describe('#1093 — the case-insensitivity bug it uncovered', () => {
  /**
   * `LINE_NAME` contains `[A-Z][0-9]?[A-Z][0-9]?` and the English line rule carried `/i`, so any two
   * lowercase letters matched as a line's NAME: «the line **th**rough P …» was claimed by the curve
   * rule and the student told their equation («rough P is …») was unreadable. The file's own
   * `TWO_POINTS` comment warns about this exact trap and avoids it the same way.
   */
  it('«the line through P is perpendicular to AB» is a construction, not a bad equation', () => {
    const { d } = lineOf('the line through P is perpendicular to AB');
    expect(d.faults).toEqual([]);
  });

  it('and the named-line rule it guards still works', () => {
    const named = derive(['the line l1 is y=2x'], 0);
    expect(named.faults).toEqual([]);
    expect(named.figure.curves).toHaveLength(1);
    expect(named.figure.curves[0].label.name).toBe('l1');
  });

  it('a LOWERCASE two-letter name is no longer mistaken for one', () => {
    // It was never a legal name — `NAME` is uppercase-only by design — so this must not build a line
    // called «ab».
    const d = derive(['the line ab is y=2x'], 0);
    expect(d.figure.curves.filter((c) => c.label.name === 'ab')).toHaveLength(0);
  });
});
