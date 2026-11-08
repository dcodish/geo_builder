/**
 * #1224 — A SLANTED LOCUS PRINTS ITS EQUATION.
 *
 * Found while verifying PR #1172's own play cases before handing the operator a sheet: the four cases
 * the PR documents all passed, and varying the figure showed the headline feature failing on the
 * ordinary one.
 *
 * ```
 * B(8,0)   bisector x = 4         «ישר · x - 4 = 0»   ✓
 * B(0,8)   bisector y = 4         «ישר · y = 4»   ✓
 * B(6,8)   bisector 3x + 4y = 25  «ישר»           ✗  drawn correctly, no equation
 * B(4,4)   bisector at 45°        «ישר»           ✗
 * B(2,0)   bisector x = 1         «ישר»           ✗  axis-aligned, and still failing
 * ```
 *
 * `B(2,0)` is what ruled out "slanted breaks it": whatever the gate measured was **scale**-sensitive.
 *
 * ## Root cause — an absolute tolerance on a relative quantity
 *
 * Neither candidate the issue named was right. `shapeOfTrace.curve` held the correct line in every
 * case — `x = 1`, and `a=1, b=4/3, c=−8.327` which is `3x + 4y = 25` to three figures. What discarded
 * it was `locusEquation`'s opening `if (!shape.conic) return null`, and `conic` was absent because
 * `snapRational` uses an ABSOLUTE `1e−6` while the trace's accuracy is RELATIVE to how far it walks:
 *
 * ```
 *           traced span   worst deviation from the TRUE line
 * B(2,0)             40   1.9e−5      19× the absolute tolerance
 * B(6,8)           2685   1.5e−2      four orders past it
 * ```
 *
 * The same function's VERIFICATION had always been relative (`1e−6 × scale²`), so the two halves of
 * `snapAndVerify` disagreed about what precision means. The snap now takes its tolerance from the
 * trace's own scatter — the precision this data actually has — and the verification, untouched, is
 * what keeps a wrong snap from being printed.
 *
 * ## The hole that opened, and the lock that caught it
 *
 * A scatter-derived tolerance can be wide, and a wide enough one snaps every coefficient to zero —
 * after which `0 = 0` satisfies the verification at every point. `issue-1176`'s honesty lock caught
 * it. A degenerate snapped conic is now refused; a wrong-but-nonzero one the verification still
 * catches on its own.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { ask } from '../app/ask';
import { locusOf } from '../engine/locus';
import { snapAndVerify } from '../engine/locusFit';
import { askLocus } from '../app/locusChip';
import { fmtAnalytic } from '../format';
import fixture from './fixtures/issue-2734-winter23-surd-centre.analytic.json';

const HE: Record<string, string> = { line: 'ישר', circle: 'מעגל' };
const kind = ((k: string) => HE[k] ?? k) as never;
const bisector = (b: string) =>
  ask(derive(['A(0,0)', b, 'נקודה M', 'MA = MB'], 0), 'המקום הגיאומטרי של M', fmtAnalytic, kind, 'chip').value;

describe('#1224 — a locus states its equation whatever its slope or scale', () => {
  it('a SLANTED bisector prints one — the case the feature is for', () => {
    // 3x + 4y = 25, written with the fractions cleared (#1180) as the panel writes lines.
    expect(bisector('B(6,8)')).toBe('ישר · 3x + 4y - 25 = 0');
    expect(bisector('B(4,4)')).toBe('ישר · x + y - 4 = 0');
  });

  it('and so does the SMALL axis-aligned one that also failed', () => {
    // The case that proved it was scale, not orientation.
    expect(bisector('B(2,0)')).toBe('ישר · x - 1 = 0');
  });

  it('the cases that already worked are unchanged', () => {
    expect(bisector('B(8,0)')).toBe('ישר · x - 4 = 0');
    expect(bisector('B(0,8)')).toBe('ישר · y - 4 = 0');
    expect(bisector('B(10,0)')).toBe('ישר · x - 5 = 0');
  });

  it('the חורף 25 circle is unchanged', () => {
    const v = ask(
      derive(['A(-9,0)', 'B(41,0)', 'נקודה P', 'PA מאונך ל-PB'], 0),
      'המקום הגיאומטרי של P',
      fmtAnalytic,
      kind,
      'chip',
    ).value;
    expect(v).toBe('מעגל · (x − 16)² + y² = 25²'); // right-hand side by #1187; #1224 changed neither side
  });

  // ADR-AG-351 (#1186): a parameterised locus prints its equation IN THE LETTER, verified at every configuration —
  // never a numeric equation, which would state one configuration's set as the answer.
  it('A PARAMETERISED LOCUS NEVER PRINTS A NUMERIC EQUATION — the honesty gate', () => {
    /**
     * The anti-lock, and the one that matters most. A fix that loosened tolerances until everything
     * printed would state an equation for a figure whose locus genuinely differs between
     * configurations — inventing a given the student never gave (ADR-052's cardinal sin).
     */
    for (const seed of [0, 1, 2, 3]) {
      expect(
        ask(
          derive(['A(-9a,0)', 'B(41a,0)', 'נקודה P', 'PA מאונך ל-PB'], seed),
          'המקום הגיאומטרי של P',
          fmtAnalytic,
          kind,
          'chip',
        ).value,
        `seed ${seed}`,
      ).toBe('מעגל · (x − 16a)² + y² = (25a)²');
    }
  });

  it('a DEGENERATE snap is refused — the hole the wider tolerance opened', () => {
    /**
     * Handed a conic that does not describe the trace, the scatter is large, every coefficient snaps
     * to zero, and `0 = 0` verifies at every point. The one wrong answer the verification cannot
     * catch by itself, because it is true everywhere.
     */
    const d = derive(['A(0,0)', 'B(8,0)', 'נקודה M', 'MA = MB'], 0);
    const pts = locusOf(d.construction, 'M', [0, 1], d.box)?.components[0]?.trace.points ?? [];
    expect(pts.length).toBeGreaterThan(1);
    expect(snapAndVerify({ A: 0, B: 0, C: 0, D: 1, E: 0, F: -40 }, pts)).toBeNull();
  });

  it('#1191’s own figure now produces the label that issue is about', () => {
    /**
     * The P1 was filed against `3x + 4y - 25 = 0` rendering as `4 · ישר y = −3x + 25` on the canvas. While
     * #1224 stood, that figure printed «ישר» with nothing after it — so the P1's fix could not be
     * play-verified at all. This is what unblocks it.
     */
    expect(bisector('B(6,8)')).toContain('3x + 4y - 25 = 0');
  });
});

/**
 * #2734 ([ADR-AG-429](../../docs/06c-decisions-analytic.md#adr-ag-429)) — A LOCUS STATES ITS EQUATION WHEN A
 * COEFFICIENT IS A SURD.
 *
 * Exam חורף 2023 Q1: on x²/9 + y²/4.5 = 1, M on F1E extended with EM = EF2 traces the circle about F1 = (−3√2/2, 0) of
 * radius 6. The trace found it exactly and two configurations agreed to 1e-9, but the snap knew only rationals, so the
 * chip answered «מעגל» alone while x²/25 + y²/9 = 1 answered its equation. An equation's numbers stay decimals
 * (ADR-AG-304 D2): the surd was computed from the typed «4.5», never typed (#2741's ruling).
 */
describe('#2734 — a locus states its equation when a coefficient is a surd', () => {
  const chip = (lines: readonly string[], seed: number) =>
    askLocus(derive(lines, seed), 'M', fmtAnalytic, kind).value;
  const winter23 = (fixture as { lines: string[] }).lines;

  it.each(Array.from({ length: 24 }, (_, s) => s))('the operator’s sequence, seed %i: the circle with its equation', (seed) => {
    expect(chip(winter23, seed)).toBe('מעגל · (x + 2.12)² + y² = 6²');
  });

  const ELLIPSE = (eq: string) => [`נתונה אליפסה שמשוואתה ${eq}`, ...winter23.slice(1)];
  const CLASS: Array<[string, readonly string[], string]> = [
    ['a circle about (√2, 0)', ['A(√2,0)', 'נקודה M', 'MA = 3'], 'מעגל · (x − 1.41)² + y² = 3²'],
    ['a circle about (0, √3)', ['A(0,√3)', 'נקודה M', 'MA = 3'], 'מעגל · x² + (y − 1.73)² = 3²'],
    ['the same exam sentences on x²/6 + y²/4 = 1 (centre −√2, r = 2√6)', ELLIPSE('x^2/6+y^2/4=1'), 'מעגל · (x + 1.41)² + y² = 24'],
    ['the bisector of (0,0), (√2,0)', ['A(0,0)', 'B(√2,0)', 'נקודה M', 'MA = MB'], 'ישר · x - 0.71 = 0'],
    ['the bisector of (0,0), (1,√3)', ['A(0,0)', 'B(1,√3)', 'נקודה M', 'MA = MB'], 'ישר · x + 1.73y - 2 = 0'],
    ['the parametric arm: a centre at (√2·a, 0)', ['A(√2a,0)', 'נקודה M', 'MA = 3'], 'מעגל · (x − 1.41a)² + y² = 3²'],
    // Found in round: a surd ratio the loose rational bar alone took (3√2/2 as 70/33), and a surd constant beside a letter.
    ['the parametric arm: a centre at (3√2/2·a, 0)', ['A(3√2a/2,0)', 'נקודה M', 'MA = 3'], 'מעגל · (x − 2.12a)² + y² = 3²'],
    ['the parametric arm: a centre at (√2·a, √3)', ['A(√2a,√3)', 'נקודה M', 'MA = 3'], 'מעגל · (x − 1.41a)² + (y − 1.73)² = 3²'],
    // Controls: rational loci do not move.
    ['control: x²/25 + y²/9 = 1', ELLIPSE('x^2/25+y^2/9=1'), 'מעגל · (x + 4)² + y² = 10²'],
    ['control: a surd radius with a rational r²', ['A(0,0)', 'נקודה M', 'MA = √2'], 'מעגל · x² + y² = 2'],
    ['control: the bisector of (0,0), (8,0)', ['A(0,0)', 'B(8,0)', 'נקודה M', 'MA = MB'], 'ישר · x - 4 = 0'],
    // Counter-direction: a TYPED decimal is the student's number, not a surd (#2742 decides its vocabulary).
    ['counter: a centre at a typed 1.4142', ['A(1.4142,0)', 'נקודה M', 'MA = 3'], 'מעגל'],
    ['counter: a centre at a typed 1.732', ['A(1.732,0)', 'נקודה M', 'MA = 3'], 'מעגל'],
    ['counter: a centre at a typed 3.14159265', ['A(3.14159265,0)', 'נקודה M', 'MA = 3'], 'מעגל'],
    ['counter: the bisector of (0,0), (1.4142,0) — x = 0.7071', ['A(0,0)', 'B(1.4142,0)', 'נקודה M', 'MA = MB'], 'ישר'],
  ];
  it.each(CLASS)('%s', (_label, lines, want) => {
    for (const seed of [0, 1, 2]) expect(chip(lines, seed), `seed ${seed}`).toBe(want);
  });
});
