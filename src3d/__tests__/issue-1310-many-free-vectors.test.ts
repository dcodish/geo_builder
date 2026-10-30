/**
 * #1310 ([ADR-3D-397](../../docs/06b-decisions-3d.md#adr-3d-397)) — AS MANY FREE VECTORS AS THE STUDENT WANTS.
 *
 * **Operator, 2026-09-21:** *"we need to be able to create as many free vectors as we want"*. Confirmed in a browser on
 * 2026-10-30: «וקטור AB» then «וקטור CD» drew only CD — the AB arrow the student had drawn vanished and line 1 turned
 * red (`unknown-point A`).
 *
 * Root cause: the arrow lane minted its own endpoints under an apply-time predicate (`canStartFigure`: no points, no
 * solids), and the #1467 mint pass refolds with the points it created for LATER rows already placed — so row 1 met C
 * and D, the predicate said "not empty", and row 1 failed. The refold only re-checked rows that minted through the
 * pass. Fix: the arrow lane never mints (the mint pass is the one mechanism), the "first vector announces nothing"
 * rule moves to the notice filter (read in list order), and the refold checks every row the fold had made ok.
 *
 * Every row drives the real `useGeo3.submit` path and reads `derive3`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, deriveStats3, useGeo3 } from '../store/store3';
import { deserializeFigure3 } from '../store/figureFile3';

const st = () => useGeo3.getState();
const reset = () => useGeo3.setState({ facts: [], seed: 0, lastError: null, lastNotice: null, lastCreated: null } as never);
beforeEach(reset);

const build = (lines: readonly string[]) => {
  reset();
  for (const l of lines) st().submit(l);
  const d = derive3(st().facts, st().seed);
  return {
    err: st().lastError as { code?: string } | null,
    facts: st().facts.length,
    statuses: st().facts.map((f) => d.status[f.id]),
    arrows: d.construction.arrows.map((a) => a.join('')),
    d,
  };
};
/** What the «נוצרו נקודות חדשות …» notice shows for the line just typed. */
const shown = () => {
  const n = st().lastCreated;
  return n && st().facts[st().facts.length - 1]?.id === n.factId ? [...n.ids] : null;
};

describe('#1310 — every vector stays drawn, every line stays green', () => {
  const ROWS: [string[], string[]][] = [
    [['וקטור AB', 'וקטור CD'], ['AB', 'CD']],
    [['חץ AB', 'חץ CD'], ['AB', 'CD']],
    [['וקטור AB', 'וקטור CD', 'וקטור EF'], ['AB', 'CD', 'EF']],
    [['וקטור u', 'וקטור AB', 'וקטור CD'], ['AB', 'CD']],
    [['וקטור AB', 'וקטור BC'], ['AB', 'BC']],
    [['וקטור AB', 'וקטור CD', 'נסמן: AB = u'], ['AB', 'CD']],
  ];
  it.each(ROWS)('%j draws %j', (lines, arrows) => {
    const r = build(lines);
    expect(r.err).toBeNull();
    expect(r.facts).toBe(lines.length);
    expect(r.statuses.every((s) => s === 'ok'), JSON.stringify(r.statuses)).toBe(true);
    expect(r.arrows).toEqual(arrows);
  });

  it('the endpoints are free and move on «הציגו תצורה אחרת» (ADR-052)', () => {
    const r = build(['וקטור AB', 'וקטור CD']);
    for (const id of ['A', 'B', 'C', 'D']) expect(r.d.construction.points.get(id)?.kind).toBe('free3');
    const at = (seed: number) => {
      const p = derive3(st().facts, seed).positions;
      return ['A', 'B', 'C', 'D'].map((id) => `${p.get(id)!.x.toFixed(4)},${p.get(id)!.y.toFixed(4)},${p.get(id)!.z.toFixed(4)}`).join('|');
    };
    expect(new Set([0, 1, 2, 3].map(at)).size).toBeGreaterThan(1);
  });

  it('«וקטור AB» · «וקטור BC» shares B and creates only C', () => {
    build(['וקטור AB', 'וקטור BC']);
    expect(shown()).toEqual(['C']);
  });

  it('«וקטור AB» · «DC→=3AB→» builds C and D with DC→ = 3·AB→ (C − D = 3(B − A))', () => {
    const r = build(['וקטור AB', 'DC→=3AB→']);
    expect(r.statuses).toEqual(['ok', 'ok']);
    for (const seed of [0, 1, 2]) {
      const p = derive3(st().facts, seed).positions;
      const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((id) => p.get(id)!);
      expect(C.x - D.x).toBeCloseTo(3 * (B.x - A.x), 6);
      expect(C.y - D.y).toBeCloseTo(3 * (B.y - A.y), 6);
      expect(C.z - D.z).toBeCloseTo(3 * (B.z - A.z), 6);
    }
  });

  it('«נסמן: AB = u» after two vectors puts u in the basis', () => {
    const r = build(['וקטור AB', 'וקטור CD', 'נסמן: AB = u']);
    expect([...r.d.construction.vectors.keys()]).toEqual(['u']);
  });

  it('«וקטור AB» typed above «A(1,2,3)» binds A to the coordinate', () => {
    const r = build(['וקטור AB', 'A(1,2,3)']);
    expect(r.statuses).toEqual(['ok', 'ok']);
    const A = r.d.positions.get('A')!;
    expect([A.x, A.y, A.z].map((v) => +v.toFixed(6))).toEqual([1, 2, 3]);
  });

  it('«וקטור AB» typed above a cube uses the cube’s A and B', () => {
    const r = build(['וקטור AB', "קובייה ABCDA'B'C'D'"]);
    expect(r.err).toBeNull();
    expect(r.statuses).toEqual(['ok', 'ok']);
    expect(r.arrows).toEqual(['AB']);
  });
});

describe('#1310 — the created-points notice (02b FR-VC-1b), read in list order', () => {
  it('the first vector on an empty canvas announces nothing', () => {
    build(['וקטור AB']);
    expect(shown()).toBeNull();
  });

  it('…nor after a positionless vector, which holds no point', () => {
    build(['וקטור u', 'וקטור AB']);
    expect(shown()).toBeNull();
  });

  it('a second vector names its new endpoints', () => {
    build(['וקטור AB', 'וקטור CD']);
    expect(shown()).toEqual(['C', 'D']);
  });

  it('a third one too', () => {
    build(['וקטור AB', 'וקטור CD', 'חץ EF']);
    expect(shown()).toEqual(['E', 'F']);
  });

  it('«חץ QZ» after «נקודה P(0,0,0)» names Q and Z', () => {
    build(['נקודה P(0,0,0)', 'חץ QZ']);
    expect(shown()).toEqual(['Q', 'Z']);
  });
});

/**
 * THE CLASS GUARD (step 3 of the plan): the mint pass's refold must never break a row the fold had made ok. Counted by
 * the pass itself (`deriveStats3.refoldBroke`) over every saved figure and every sequence above — a future lane
 * predicate that reads a later row's points fails here, red, instead of turning a student's line red silently.
 */
describe('#1310 — the mint pass never breaks a row that was ok before it', () => {
  it('over every fixtures3 figure', () => {
    const dir = join(__dirname, '..', '..', 'fixtures3');
    const before = deriveStats3.refoldBroke;
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.geo3.json'))) {
      const r = deserializeFigure3(readFileSync(join(dir, file), 'utf8'));
      if (!r.ok) continue;
      derive3(r.facts, r.seed);
    }
    expect(deriveStats3.refoldBroke - before).toBe(0);
  });

  it('over the vector sequences', () => {
    const before = deriveStats3.refoldBroke;
    for (const lines of [
      ['וקטור AB', 'וקטור CD'],
      ['וקטור AB', 'וקטור BC'],
      ['וקטור AB', 'DC→=3AB→'],
      ['נקודה P(0,0,0)', 'חץ QZ'],
      ['קטע AB', 'קטע CD'],
      // ADR-3D-387: an EARLIER row's created points refuse the later «וקטור u» — list order's verdict, never counted
      ['נסמן: AB = u', 'וקטור u'],
    ])
      build(lines);
    expect(deriveStats3.refoldBroke - before).toBe(0);
  });
});
