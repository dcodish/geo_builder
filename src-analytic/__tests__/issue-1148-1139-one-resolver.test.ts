/**
 * #1148 + #1139 — ONE RESOLVER, EVERY SURFACE.
 *
 * Operator, 2026-09-16, on `A(0,0)` `B(6,0)` `C(3,5)` + «משולש ABC»: *"now the line is drawn but data
 * panel still refuses"*, and *"the line itself is not clickable in this state and it should be —
 * allowing to show distance, equation, slope."*
 *
 * Measured on `main` before the fix, and this is the whole case in five lines:
 *
 * ```
 * AB                  -> 6          the measure grammar sees the line
 * שיפוע AB            -> 0          the slope branch sees the line
 * משוואת AB           -> MISSING    the equation branch does not
 * המרחק מ-C לישר AB   -> 5          the ask lane answers it
 * menu(C)             -> ["C"]      ...and the click menu never offers it
 * ```
 *
 * So the locks below are deliberately NOT four separate snapshots of four answers. The defect was
 * that the resolvers DISAGREED, so what is asserted is that they agree — the three questions in one
 * `it`, and the menu compared against the ask lane by calling both rather than by re-listing the
 * strings either one is expected to produce (ADR-W-053 / #1102: a test that re-implements the
 * decision it guards stays green through the change that kills the feature).
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { ask } from '../app/ask';
import { lineNamed, lineNamesOf, segmentName } from '../app/lines';
import { measurablesOf } from '../app/measurable';
import { lineText } from '../App';
import { fmtNum } from '../../shell/format';

const fmt = (n: number) => fmtNum(n);
/** The caller's curve formatter, as `App.tsx` injects it — the ask lane must not grow its own. */
const describeCurve = (name: string, c: { kind: string; a?: number; b?: number; c?: number }) =>
  c.kind === 'line' ? `${name ? `${name}: ` : ''}${lineText(c.a!, c.b!, c.c!)}` : JSON.stringify(c);

const TRI = ['A(0,0)', 'B(6,0)', 'C(3,5)', 'משולש ABC'];
/** Both points slide along their own carriers, so the line through them is genuinely undetermined. */
const VARIES = ['A על הישר y=x', 'B על הישר y=2x+1'];
/** `B` slides along `y = x` — its POSITION is open, but the line `AB` is the same line every time. */
const SLIDES = ['A(0,0)', 'B על הישר y=x'];

const answer = (lines: string[], q: string, seed = 0) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ask(derive(lines, seed), q, fmt, describeCurve as any);

describe('#1148 — the equation branch resolves what every other branch resolves', () => {
  it('a line through two points answers ALL THREE questions, and they agree', () => {
    // One `it` on purpose: the bug was one of these disagreeing with the other two.
    expect(answer(TRI, 'AB').value).toBe('6');
    expect(answer(TRI, 'שיפוע AB').value).toBe('0');
    expect(answer(TRI, 'משוואת AB').value).toBe('y = 0');
  });

  it('every side of the triangle has an equation, in the form a textbook prints', () => {
    // Not decimals: `A(0,0)`–`C(3,5)` must not come back as «0.86x - 0.51y = 0», which is what
    // normalizing by hypot(a, b) produces — 5/√34 is a surd and no scaling can clear it.
    expect(answer(TRI, 'משוואת AC').value).toBe('5x - 3y = 0');
    expect(answer(TRI, 'משוואת BC').value).toBe('5x + 3y - 30 = 0');
  });

  it('the honesty gate comes with it: a line that is not determined stays OPEN', () => {
    // Not a refusal and not a sampled equation — the open answer (ADR-052).
    const a = answer(VARIES, 'משוואת AB');
    expect(a.value).toBeNull();
    expect(a.missing).toBeUndefined();
    expect(a.unreadable).toBeUndefined();
  });

  it('a name the figure has not got is still reported MISSING, not answered', () => {
    expect(answer(TRI, 'משוואת QR').missing).toEqual({ name: 'QR', kind: 'curve' });
  });

  it('a line is knowledge even when its POINTS are not — and the length still is not', () => {
    /**
     * The property normalization buys, and the reason it is not cosmetic. `B` slides along `y = x`,
     * so `AB`'s raw coefficients scale with wherever the sampler put it; only the RATIO is invariant.
     * Judged raw, this determined line would have been called unknown.
     */
    expect(answer(SLIDES, 'משוואת AB').value).toBe('x - y = 0');
    expect(answer(SLIDES, 'AB').value).toBeNull();
  });

  it('a curve the student STATED is untouched — it still answers from its own equation', () => {
    expect(answer(['נתון הישר l1: 3x-4y+1=0'], 'משוואת l1').value).toBe('3x - 4y + 1 = 0');
  });
});

describe('#1139 — the click menu sees what the ask lane sees', () => {
  it('clicking a vertex offers the height, and the OPPOSITE side comes first', () => {
    const d = derive(TRI, 0);
    const opts = measurablesOf(d.construction, { kind: 'point', id: 'C' }).map((m) => m.sentence);
    expect(opts).toContain('המרחק מ-C לישר AB');
    // The height is the question a student came to ask; the two sides through C answer 0.
    expect(opts[1]).toBe('המרחק מ-C לישר AB');
  });

  it('EVERY sentence the menu offers is one the ask lane answers', () => {
    /**
     * The menu's contract, asserted by calling BOTH surfaces rather than by listing what either is
     * expected to say. An option whose answer would be «לא הבנתי» is the menu lying about the figure,
     * and this is what makes that a test failure instead of a bug report.
     */
    const d = derive(TRI, 0);
    const picks = [
      ...['A', 'B', 'C'].map((id) => ({ kind: 'point' as const, id })),
      ...d.figure.segments.map((s) => ({ kind: 'segment' as const, id: s.id })),
    ];
    let checked = 0;
    for (const what of picks) {
      const items = measurablesOf(d.construction, what);
      expect(items.length).toBeGreaterThan(0);
      for (const m of items) {
        const a = answer(TRI, m.sentence);
        expect(a.unreadable, `«${m.sentence}» was not understood`).toBeUndefined();
        expect(a.missing, `«${m.sentence}» named something absent`).toBeUndefined();
        checked++;
      }
    }
    // An oracle with nothing to check passes by checking nothing.
    expect(checked).toBeGreaterThanOrEqual(15);
  });

  it('a drawn SIDE is clickable, and offers the operator’s three questions', () => {
    const d = derive(TRI, 0);
    const side = d.figure.segments.find((s) => segmentName(d.construction, s.id) === 'BC');
    expect(side, 'the triangle draws BC as a segment').toBeDefined();
    expect(measurablesOf(d.construction, { kind: 'segment', id: side!.id }).map((m) => m.sentence)).toEqual([
      'משוואת הישר BC',
      'שיפוע הישר BC',
      'BC',
    ]);
  });

  it('a stated «קטע AB» is the same click as a polygon side', () => {
    const d = derive(['A(0,0)', 'B(6,0)', 'קטע AB'], 0);
    const seg = d.figure.segments[0];
    expect(segmentName(d.construction, seg.id)).toBe('AB');
    expect(measurablesOf(d.construction, { kind: 'segment', id: seg.id }).map((m) => m.sentence)).toContain(
      'משוואת הישר AB',
    );
  });

  it('every name the enumeration offers RESOLVES — the two halves cannot drift apart', () => {
    const d = derive(TRI, 0);
    const names = lineNamesOf(d.construction);
    expect(names).toEqual(['AB', 'BC', 'CA']);
    for (const n of names) expect(lineNamed(d.figure, n), `«${n}» was offered but does not resolve`).not.toBeNull();
  });

  it('#1048’s guard survives: a point with nothing to measure to offers only its own name', () => {
    const d = derive(['נתונה הנקודה A(2,5)'], 0);
    expect(measurablesOf(d.construction, { kind: 'point', id: 'A' }).map((m) => m.sentence)).toEqual(['A']);
  });
});
