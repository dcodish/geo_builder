/**
 * #2518 ([ADR-AG-414](../../docs/06c-decisions-analytic.md#adr-ag-414), 2-D's ADR-791; operator ruling 2026-11-06: *"its not
 * right to refuse. this shape is possible"*) — through `decideSubmit`, the function `App.tsx` dispatches.
 *
 * Measured at `main` 10331c78: the report's sentence with A on the circle and «OP = 10» was refused `unsatisfiable`, later
 * and typed, because the radius's solve started in a window that never reached 10 and the `beyond` selector rejected every
 * seed. A stated radius is no symbol, so it stays refused.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';

const AO = 'המשך AO חותך את מעגל P בנקודה R';
const OA = 'המשך OA חותך את מעגל P בנקודה R';

function run(steps: readonly string[]) {
  const lines: string[] = [];
  const verdicts = steps.map((line) => {
    const v = decideSubmit(line, lines, 0);
    if (v.kind === 'record') lines.push(v.line);
    return v.kind === 'refused' ? v.error.key : v.kind;
  });
  return { verdicts, lines };
}

/** Where R lies along a → b: past 1 is beyond b. */
function paramOfR(lines: readonly string[], a: string, b: string): number {
  const fig = derive([...lines], 0) as unknown as { figure: { points: { id: string; x: number; y: number }[] } };
  const at = (k: string) => fig.figure.points.find((p) => p.id === k)!;
  const [pa, pb, r] = [at(a), at(b), at('R')];
  return ((r.x - pa.x) * (pb.x - pa.x) + (r.y - pa.y) * (pb.y - pa.y)) / ((pb.x - pa.x) ** 2 + (pb.y - pa.y) ** 2);
}

describe('#2518 — analytic: a free radius holds the side', () => {
  for (const [name, steps] of [
    ['T5, the later line', ['מעגל שמרכזו O', 'מעגל שמרכזו P', 'נקודה A על מעגל P', AO, 'OP = 10']],
    ['«OP = 10» typed first', ['מעגל שמרכזו P', 'נקודה A על מעגל P', 'נקודה O', 'OP = 10', AO]],
  ] as const) {
    it(`${name}: every line records, R past O`, () => {
      const { verdicts, lines } = run(steps);
      expect(verdicts).toEqual(steps.map(() => 'record'));
      expect(paramOfR(lines, 'A', 'O')).toBeGreaterThan(1);
    });
  }

  it('the side with the shared end second still builds, R past A', () => {
    const { verdicts, lines } = run(['מעגל שמרכזו P', 'נקודה A על מעגל P', 'נקודה O', 'OP = 2', OA]);
    expect(verdicts.at(-1)).toBe('record');
    expect(paramOfR(lines, 'O', 'A')).toBeGreaterThan(1);
  });

  it('a stated radius stays refused, later and typed', () => {
    const pin = ['מעגל שמרכזו P ברדיוס 3', 'נקודה A על מעגל P', 'נקודה O'];
    expect(run([...pin, AO, 'OP = 10']).verdicts.at(-1)).toBe('unsatisfiable');
    expect(run([...pin, 'OP = 10', AO]).verdicts.at(-1)).toBe('unsatisfiable');
  });
});
