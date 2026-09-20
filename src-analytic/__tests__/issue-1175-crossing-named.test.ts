/**
 * #1175 (ADR-AG-116) — a crossing the student names must not be a point the figure already names.
 *
 * Operator, playing round #1169 T4: *"the data input should have been rejected since point B is
 * already there"*. Measured, «P נקודת החיתוך של הישר AB עם הישר BC» minted `P` at `|PB| = 1.2e-8`
 * with `faults: []` — two letters for one position, and «משולש ABC» had already given it one.
 *
 * It is the #1113 family (*"four ring clicks give four letters on ONE point"*) reached through a
 * typed sentence, and it compounds: `P` becomes a separate object with its own constraints and DOF,
 * so every later statement about `P` is solved against a point the student believes is distinct.
 *
 * **Operator ruling, 2026-09-17: refuse, naming `B`** — *"AB and BC meet at B"* is the information
 * the student is missing.
 *
 * THE COUNTER-DIRECTION IS THE WHOLE RISK, and it is locked below: two lines that genuinely cross
 * where nothing is named must still build and still name the point.
 */
import { describe, expect, it } from 'vitest';
import { parseLine } from '../parser/parseAnalytic';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';

const outcome = (line: string): { code: string; holder?: string } => {
  const r = parseLine(line) as { ok: boolean; code?: string; holder?: string };
  return r.ok ? { code: 'ok' } : { code: r.code!, holder: r.holder };
};

/** The smallest distance between any two distinct points of the figure the steps build. */
const closestPair = (steps: string[]): number => {
  const { figure } = derive(steps, 0) as unknown as { figure: { points: { x: number; y: number }[] } };
  let min = Infinity;
  for (let i = 0; i < figure.points.length; i++) {
    for (let j = i + 1; j < figure.points.length; j++) {
      const a = figure.points[i];
      const b = figure.points[j];
      min = Math.min(min, Math.hypot(a.x - b.x, a.y - b.y));
    }
  }
  return min;
};

const TRI = ['משולש ABC', 'A(2,-5)'];
const REPORTED = 'P נקודת החיתוך של הישר AB עם הישר BC';

describe('ADR-AG-116 — a named crossing is not an existing point (#1175)', () => {
  /** THE OPERATOR'S OWN LINE. */
  it('is refused, and names the point that is already there', () => {
    expect(outcome(REPORTED)).toEqual({ code: 'crossing-already-named', holder: 'B' });
  });

  /**
   * Asserted as a PROPERTY OF THE FIGURE, not as a fault code alone — the issue asks for this
   * explicitly, because a refusal that still left a point behind would satisfy a code-only check.
   */
  it('mints no second point at B’s position', () => {
    const { figure } = derive([...TRI, REPORTED], 0) as unknown as { figure: { points: { id: string }[] } };
    expect(figure.points.map((p) => p.id).sort()).toEqual(['A', 'B', 'C']);
    expect(closestPair([...TRI, REPORTED])).toBeGreaterThan(1e-6);
  });

  /** The holder must survive the trip to the UI, or the message has nothing to name. */
  it('the holder reaches the submit layer', () => {
    const v = decideSubmit(REPORTED, TRI, 0) as { kind: string; error?: { holder?: string } };
    expect(v.kind).toBe('refused');
    expect(v.error?.holder).toBe('B');
  });

  /** Either letter order, either shared vertex — the rule is about the letters, not their spelling. */
  it.each([
    ['reversed on both sides', 'P נקודת החיתוך של הישר BA עם הישר CB', 'B'],
    ['the other shared vertex', 'P נקודת החיתוך של הישר AB עם הישר AC', 'A'],
  ])('%s is refused naming the right letter', (_n, line, holder) => {
    expect(outcome(line as string)).toEqual({ code: 'crossing-already-named', holder });
  });

  /**
   * ⚠ THE COUNTER-DIRECTION — the feature this must not break. Two medians genuinely cross at the
   * centroid, which nothing names, so the sentence is exactly what the student needs.
   */
  it('a genuine crossing where nothing is named still builds and still names P', () => {
    const steps = [
      'משולש ABC',
      'AD תיכון לצלע BC',
      'CE תיכון לצלע AB',
      'P נקודת החיתוך של הישר AD עם הישר CE',
    ];
    const { figure } = derive(steps, 0) as unknown as { figure: { points: { id: string }[] } };
    expect(figure.points.map((p) => p.id)).toContain('P');
    expect(closestPair(steps)).toBeGreaterThan(1e-6);
  });

  /**
   * THE SCOPE, ASSERTED SO IT CANNOT DRIFT SILENTLY. The check is structural only. Two lines given by
   * EQUATIONS that cross where a point already sits is the same defect reached positionally, and the
   * operator's ruling pre-declared that an escalation rather than an expansion — it is #1254.
   *
   * This asserts the CURRENT, KNOWN-INCOMPLETE behaviour on purpose: if a later change starts
   * refusing it, that is #1254 being answered and this row is the prompt to go read that issue's
   * ruling rather than to delete the row.
   */
  it('a POSITIONAL coincidence is still accepted — the documented gap, tracked as #1254', () => {
    const steps = [
      'A(0,0)',
      'משוואת הישר l1 היא y=x',
      'משוואת הישר l2 היא y=-x',
      'P נקודת החיתוך של הישר l1 עם הישר l2',
    ];
    expect(outcome(steps[3]).code).toBe('ok');
  });

  /** Unrelated refusals are untouched — an unreadable operand is still an operand problem. */
  it('an unreadable operand still says so', () => {
    expect(outcome('P נקודת החיתוך של הישר AB עם הפיל').code).toBe('bad-operand');
  });
});
