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
import { fmtAnalytic } from '../format';

const HE: Record<string, string> = { line: 'ישר', circle: 'מעגל' };
const kind = ((k: string) => HE[k] ?? k) as never;
const bisector = (b: string) =>
  ask(derive(['A(0,0)', b, 'נקודה M', 'MA = MB'], 0), 'המקום הגיאומטרי של M', fmtAnalytic, kind).value;

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
    ).value;
    expect(v).toBe('מעגל · (x − 16)² + y² = 25²'); // right-hand side by #1187; #1224 changed neither side
  });

  it('A PARAMETERISED LOCUS STILL PRINTS THE KIND ALONE — the honesty gate', () => {
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
        ).value,
        `seed ${seed}`,
      ).toBe('מעגל');
    }
  });

  it('a DEGENERATE snap is refused — the hole the wider tolerance opened', () => {
    /**
     * Handed a conic that does not describe the trace, the scatter is large, every coefficient snaps
     * to zero, and `0 = 0` verifies at every point. The one wrong answer the verification cannot
     * catch by itself, because it is true everywhere.
     */
    const d = derive(['A(0,0)', 'B(8,0)', 'נקודה M', 'MA = MB'], 0);
    const pts = locusOf(d.construction, 'M', [0, 1], d.box)?.trace.points ?? [];
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
