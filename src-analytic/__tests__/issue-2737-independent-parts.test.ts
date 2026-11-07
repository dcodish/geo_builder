/**
 * #2737 ([ADR-AG-425](../../docs/06c-decisions-analytic.md#adr-ag-425)) — A FIGURE OF INDEPENDENT PARTS IS SOLVED, WALKED AND
 * JUDGED PART BY PART.
 *
 * Measured on `main` @ 036e907c, typing nine shapes that share nothing, one per line: the ninth took 73 s to accept (2-D: 0.3 s),
 * because every solve, deflation, choice retry and configuration walk ran over every shape at once. The same coupling drew
 * free quadrilaterals CROSSED (no configuration in the walk had every shape whole at once), refused «מקבילית» as
 * `unsatisfiable` beside four other shapes, and moved shapes already drawn when an unrelated one was added.
 *
 * Budgets are OPERATION counts (`evaluateStats`), never a clock (docs/17 §7, M3).
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import { joinChoiceSeeds, splitChoiceSeed, assignmentAt } from '../engine/discreteAxes';
import { partIndexOf, partsOf } from '../engine/components';
import { evaluateStats, type Seed } from '../engine/evaluate';
import { cleanSeed } from '../store/useAnalyticStore';

const NINE = ['מרובע', 'טרפז', 'טרפז שווה שוקיים', 'טרפז ישר זווית', 'מקבילית', 'מלבן', 'מעוין', 'ריבוע', 'דלתון'];

/** The lines as a student types them: each through the submit gate, from the configuration on the screen. */
function typed(lines: readonly string[]): { held: string[]; seed: Seed; refused: string[]; perLine: number[] } {
  const held: string[] = [];
  const refused: string[] = [];
  const perLine: number[] = [];
  let seed: Seed = 0;
  for (const line of lines) {
    const before = evaluateStats.uncached;
    const v = decideSubmit(line, held, seed);
    perLine.push(evaluateStats.uncached - before);
    if (v.kind === 'record') {
      held.push(line);
      seed = v.configuration ?? seed;
    } else refused.push(line);
  }
  return { held, seed, refused, perLine };
}

describe('#2737 — nine separate shapes, typed one per line', () => {
  const run = typed(NINE);

  it('every line records — «מקבילית» beside four shapes is no longer refused as impossible', () => {
    expect(run.refused).toEqual([]);
  });

  it('each line costs a bounded number of evaluations (was up to 290 a line, growing with every shape)', () => {
    // Measured after the fix: 1 3 6 9 20 15 17 19 21. Twice that is the budget.
    for (const [i, n] of run.perLine.entries()) expect(n, NINE[i]).toBeLessThanOrEqual(42);
  });

  it('the figure drawn is whole: no shape crossed, no given unmet', () => {
    const d = derive(run.held, run.seed);
    expect(d.figure.ringFaults).toEqual([]);
    expect(d.figure.unsatisfied).toEqual([]);
    expect(d.faults).toEqual([]);
  });
});

describe('#2737 — free quadrilaterals are drawn simple however many there are', () => {
  it.each([5, 7, 9])('%i free quadrilaterals: no ring crossed', (n) => {
    const d = derive(Array.from({ length: n }, () => 'מרובע'), 0);
    expect(d.figure.ringFaults).toEqual([]);
  });
});

describe('#2737 — adding a shape never moves the shapes already drawn', () => {
  it('six shapes, line by line: every point keeps its position', () => {
    const lines = ['מרובע', 'טרפז ישר זווית', 'מקבילית', 'דלתון', 'משולש ישר זווית', 'מעוין'];
    const run = typed(lines);
    expect(run.refused).toEqual([]);
    let prev: Map<string, string> | null = null;
    let held: string[] = [];
    let seed: Seed = 0;
    for (const line of lines) {
      const v = decideSubmit(line, held, seed);
      held = [...held, line];
      seed = v.kind === 'record' ? (v.configuration ?? seed) : seed;
      const now = new Map(derive(held, seed).figure.points.map((p) => [p.id, `${p.x.toFixed(9)},${p.y.toFixed(9)}`]));
      if (prev) for (const [id, xy] of prev) expect(now.get(id), `${id} after «${line}»`).toBe(xy);
      prev = now;
    }
  });

  it('the configuration names where each part landed, and a saved one loads back whole', () => {
    const run = typed(['מרובע', 'טרפז ישר זווית', 'מקבילית']);
    expect(typeof run.seed === 'object' && run.seed.parts && Object.keys(run.seed.parts).length).toBe(3);
    expect(cleanSeed(JSON.parse(JSON.stringify(run.seed)))).toEqual(run.seed);
    // A hand-edited part entry that is not a configuration is dropped, never loaded.
    expect(cleanSeed({ seed: 0, reach: 1, wide: false, parts: { A: { seed: -1, reach: 1, wide: false, choice: 0 } } })).toBe(0);
  });
});

describe('#2737 — the parts', () => {
  it('a connected figure is ONE part, the very construction — it takes the path it always took', () => {
    const c = derive(['משולש ABC', 'D על BC', 'AD = 3'], 0).construction;
    expect(partsOf(c)).toEqual([c]);
    expect(partsOf(c)[0]).toBe(c);
  });

  it('a line named by its LABEL links the point measured from it («l1» is `line-l1`)', () => {
    const c = derive(['נתון הישר l1: y=0', 'A על הישר x=0', 'המרחק מ-A לישר l1 = 5'], 0).construction;
    expect(partsOf(c)).toHaveLength(1);
  });

  it('a line named by TWO POINTS links them («AB»)', () => {
    const c = derive(['A(0,0)', 'B(10,0)', 'C על הישר x=3', 'המרחק מ-C לישר AB = 4'], 0).construction;
    expect(partsOf(c)).toHaveLength(1);
  });

  it('separate shapes are separate parts, each keeping its statements by identity', () => {
    const c = derive(['מרובע', 'משולש ישר זווית'], 0).construction;
    const parts = partsOf(c);
    expect(parts).toHaveLength(2);
    for (const p of parts) for (const k of p.constraints) expect(c.constraints).toContain(k);
  });
});

describe('#2737 — one choice seed, split across the parts and joined back', () => {
  const c = derive(['טרפז ישר זווית', 'משולש ישר זווית', 'דלתון'], 0).construction;
  const parts = partsOf(c);
  const partOf = partIndexOf(parts);
  const total = assignmentAt(c, 0).total;

  it('the figure has independent choice axes in three parts', () => {
    expect(parts).toHaveLength(3);
    expect(total).toBeGreaterThan(4);
  });

  it('each part draws, at its split seed, exactly the options the whole draws — and joining gives the seed back', () => {
    for (let s = 0; s < total; s += 1) {
      const split = splitChoiceSeed(c, parts.length, partOf, s);
      const whole = assignmentAt(c, s);
      parts.forEach((p, i) => {
        const own = assignmentAt(p, split[i]);
        for (const [k, option] of own.picked) expect(whole.picked.get(k), `seed ${s}, part ${i}`).toBe(option);
      });
      expect(joinChoiceSeeds(c, parts, partOf, split)).toBe(s);
    }
  });
});

