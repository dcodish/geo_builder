/**
 * #172 ([ADR-632](../../../docs/06-decisions.md#adr-632)) — a sector's AREA and an arc's LENGTH as first-class
 * measures and constraints, on ADR-118's area seam and ADR-228's perimeter seam.
 *
 * Measured at pickup (`main` 403efe66, `decideDeterministic2D`, the model mocked), after «גזרה AOB»: every sector-area
 * form escalated (not-handled), and "arc length AB = 4π" COMMITTED the chord |AB| = 4π — the segment reading the
 * operator's 2026-08-16 ruling rules out. Every lock here drives the real submit door and reads the replayed figure.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { decideDeterministic2D } from '../decideDeterministic';
import { replay, useGeoStore } from '@/store/geoStore';
import { driveThroughGate } from '../../__tests__/submit-gate';
import { angleDeg, checkLabels, dist, type AnyCommand, type Vec } from '@/engine';
import { operandArea, operandBoundary } from '@/engine/roundMeasure';
import { buildScene } from '@/render/scene';

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

async function decide(prefix: string[], line: string) {
  useGeoStore.getState().clear();
  const { refused } = driveThroughGate(prefix);
  expect(refused, 'the prefix builds').toEqual([]);
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  return decideDeterministic2D({ facts: st.facts, seed: st.seed, view: { construction: d.construction, positions: d.positions } }, line, 'he');
}
const cmds = (v: Awaited<ReturnType<typeof decide>>): AnyCommand[] => (v.kind === 'commit' ? [...v.commands] : []);

/** Build the lines through the gate and read the sector O-A-B at `seed`. */
function sector(lines: string[], seed = 0) {
  useGeoStore.getState().clear();
  const { facts, refused } = driveThroughGate(lines);
  const d = replay(facts, seed);
  const p = (id: string) => d.positions.get(id) as Vec;
  const O = p('O'), A = p('A'), B = p('B');
  const ok = Object.values(d.status).every((s) => s === 'ok') && d.violations.length === 0;
  return { refused: refused.map((r) => r.utterance), ok, r: dist(O, A), angle: angleDeg(O, A, B), d, facts };
}
const sectorArea = (r: number, deg: number) => 0.5 * ((deg * Math.PI) / 180) * r * r;

describe('#172 — the forms read through the real door', () => {
  it.each([
    ['שטח הגזרה AOB הוא 12π', 'measure-area'],
    ['שטח הגזרה AOB = 12π', 'measure-area'],
    ['שטח הגזרה הוא 12π', 'measure-area'],
    ['sector area AOB = 12π', 'measure-area'],
    ['the area of the sector is 12π', 'measure-area'],
    ['אורך הקשת AB הוא 4π', 'measure-perimeter'],
    ['אורך הקשת AB = 4π', 'measure-perimeter'],
    ['arc length AB = 4π', 'measure-perimeter'],
    ['the length of arc AB is 4π', 'measure-perimeter'],
  ])('«%s» → a round %s of the drawn sector', async (line, type) => {
    const c = cmds(await decide(['גזרה AOB'], line));
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ type, ids: ['O', 'A', 'B'], round: {} });
  });

  it.each([
    ['שטח הגזרה AOB = ¼ משטח המעגל', 'set-area-ratio'],
    ['שטח הגזרה AOB הוא רבע משטח המעגל', 'set-area-ratio'],
    ['שטח הגזרה AOB = 1/4 משטח המעגל', 'set-area-ratio'],
    ['אורך הקשת AB = ¼ מהיקף המעגל', 'set-perimeter-ratio'],
    ['אורך הקשת AB הוא רבע מהיקף המעגל', 'set-perimeter-ratio'],
  ])('«%s» → a ratio to the sector’s OWN circle, k = ¼', async (line, type) => {
    const c = cmds(await decide(['גזרה AOB'], line));
    expect(c).toEqual([{ type, ids1: ['O', 'A', 'B'], ids2: ['O', 'A'], k: 0.25, round1: {}, round2: { whole: true } }]);
  });

  it.each(['נסמן את שטח הגזרה ב-S', 'נסמן את שטח הגזרה AOB ב-S'])('«%s» → the sector’s area letter', async (line) => {
    expect(cmds(await decide(['גזרה AOB'], line))).toEqual([{ type: 'measure-area', ids: ['O', 'A', 'B'], expr: { coef: 1, var: 'S' }, round: {} }]);
  });

  it('the drawn arc’s identity travels with the measure: a reflex sector measures its 200° arc', async () => {
    expect(cmds(await decide(['גזרה AOB בזווית 200'], 'שטח הגזרה AOB הוא 12π'))[0]).toMatchObject({ round: { spanDeg: 200 } });
  });

  it('an unnamed sector is «הגזרה» — its anonymous centre is the operand', async () => {
    expect(cmds(await decide(['גזרה'], 'שטח הגזרה הוא 12π'))[0]).toMatchObject({ ids: ['@ctr-O', 'A', 'B'] });
  });

  it('“arc length AB” with no drawn arc is never the chord |AB| (the 2026-08-16 ruling) — it escalates, Hebrew and English', async () => {
    for (const line of ['arc length AB = 4π', 'אורך הקשת AB הוא 4π']) {
      const v = await decide(['מעגל O', 'A על המעגל', 'B על המעגל'], line);
      expect(v.kind, line).toBe('escalate');
    }
  });

  it('a polygon partner is not this statement’s — escalated, never half-read', async () => {
    expect((await decide(['גזרה AOB', 'משולש ABC'], 'שטח הגזרה AOB = 2 שטח המשולש ABC')).kind).toBe('escalate');
  });
});

describe('#172 — what the figure does (scale vs shape, ADR-118)', () => {
  it('a lone sector area RESIZES the sector — the angle is untouched, the area holds, «12π» is printed in it', () => {
    const before = sector(['גזרה AOB']);
    const s = sector(['גזרה AOB', 'שטח הגזרה AOB הוא 12π']);
    expect(s.refused).toEqual([]);
    expect(s.ok).toBe(true);
    expect(s.angle).toBeCloseTo(before.angle, 6);
    expect(sectorArea(s.r, s.angle)).toBeCloseTo(12 * Math.PI, 3);
    expect(s.d.labels.areas).toEqual([{ ids: ['O', 'A', 'B'], round: {}, text: '12π' }]);
  });

  it('a lone arc length resizes too, and prints on the arc', () => {
    const s = sector(['גזרה AOB', 'אורך הקשת AB הוא 4π']);
    expect(s.ok).toBe(true);
    expect(s.angle).toBeCloseTo(70, 6);
    expect(s.r * ((s.angle * Math.PI) / 180)).toBeCloseTo(4 * Math.PI, 3);
    expect(s.d.labels.areas).toEqual([{ ids: ['O', 'A', 'B'], round: {}, of: 'length', text: '4π' }]);
  });

  it.each([
    [['שטח הגזרה AOB הוא 12π', 'אורך הקשת AB הוא 4π']],
    [['אורך הקשת AB הוא 4π', 'שטח הגזרה AOB הוא 12π']],
  ])('two absolute givens fix the angle in either entry order: %j → r = 6, 120°', (lines) => {
    const s = sector(['גזרה AOB', ...lines]);
    expect(s.ok).toBe(true);
    expect(s.r).toBeCloseTo(6, 3);
    expect(s.angle).toBeCloseTo(120, 2);
  });

  it('a stated radius is the second absolute given: OA = 6 + area 12π → 120°', () => {
    const s = sector(['גזרה AOB', 'OA = 6', 'שטח הגזרה AOB הוא 12π']);
    expect(s.ok).toBe(true);
    expect(s.angle).toBeCloseTo(120, 2);
  });

  it.each(['שטח הגזרה AOB = ¼ משטח המעגל', 'אורך הקשת AB = 1/4 מהיקף המעגל'])('«%s» reshapes: the central angle is 90° at every sampled seed', (line) => {
    for (let seed = 0; seed < 24; seed++) {
      const s = sector(['גזרה AOB', line], seed);
      expect(s.ok, `seed ${seed}`).toBe(true);
      expect(s.angle, `seed ${seed}`).toBeCloseTo(90, 2);
    }
  });

  it('a lone area leaves the angle FREE: «show another configuration» still varies it, and the area holds at every seed', () => {
    const angles = new Set<number>();
    for (let seed = 0; seed < 24; seed++) {
      const s = sector(['גזרה AOB', 'שטח הגזרה AOB הוא 12π'], seed);
      expect(s.ok, `seed ${seed}`).toBe(true);
      // the DRAWN wedge (a free sector may sample past 180°, where ∠AOB reads the minor angle)
      const p = (id: string) => s.d.positions.get(id) as Vec;
      expect(operandArea([p('O'), p('A'), p('B')], {}), `seed ${seed}`).toBeCloseTo(12 * Math.PI, 2);
      angles.add(Math.round(s.angle));
    }
    expect(angles.size).toBeGreaterThan(3);
  });

  it('a REFLEX sector’s area is its major wedge: «גזרה בזווית 200» + 12π', () => {
    const s = sector(['גזרה AOB בזווית 200', 'שטח הגזרה AOB הוא 12π']);
    expect(s.ok).toBe(true);
    expect(sectorArea(s.r, 200)).toBeCloseTo(12 * Math.PI, 3);
  });

  it('a quarter circle is a sector: «רבע מעגל OAB» + 9π → r = 6', () => {
    const s = sector(['רבע מעגל OAB', 'שטח הגזרה AOB הוא 9π']);
    expect(s.ok).toBe(true);
    expect(s.r).toBeCloseTo(6, 3);
  });

  it('a ratio the sector cannot meet is refused as over-constrained (a 90° sector said to be ⅓ of its circle)', () => {
    const s = sector(['גזרה AOB בזווית 90', 'שטח הגזרה AOB = ⅓ משטח המעגל']);
    expect(Object.values(s.d.status).some((st) => st !== 'ok')).toBe(true);
    expect(s.angle).toBeCloseTo(90, 3);
  });

  it('a sector letter is printed and changes nothing', () => {
    const s = sector(['גזרה AOB', 'נסמן את שטח הגזרה ב-S']);
    expect(s.ok).toBe(true);
    expect(s.angle).toBeCloseTo(70, 6);
    expect(s.d.labels.areas).toEqual([{ ids: ['O', 'A', 'B'], round: {}, text: 'S' }]);
  });

  it('the sector and the triangle over the same letters are TWO areas: «S» on both is a relation, never silently one operand', () => {
    // a triangle inscribed in its own sector is always smaller — the relation cannot hold, and the figure must say so
    const s = sector(['גזרה AOB', 'נסמן את שטח הגזרה ב-S', 'משולש OAB', 'שטח OAB = S']);
    expect(s.refused.length > 0 || !s.ok).toBe(true);
  });
});

describe('#172 — where the values print (render/scene)', () => {
  it.each([
    ['a free sector', 'גזרה AOB'],
    ['a reflex sector', 'גזרה AOB בזווית 200'],
  ])('%s: the area sits inside the DRAWN wedge, the length on the DRAWN arc', (_n, first) => {
    for (const [line, text] of [['שטח הגזרה AOB הוא 12π', '12π'], ['אורך הקשת AB הוא 4π', '4π']]) {
      const s = sector([first, line]);
      expect(s.ok, line).toBe(true);
      const pos = s.d.positions;
      const scene = buildScene(s.d.construction, pos, s.d.labels);
      const O = pos.get('O')!, A = pos.get('A')!;
      const drawn = scene.arcs[0];
      // the angle of a point measured from the drawn arc's start, along its traversal
      const along = (p: Vec) => {
        const t = (Math.atan2(p.y - O.y, p.x - O.x) - drawn.startAng) * Math.sign(drawn.sweepAng);
        return ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      };
      const m = scene.measures.find((x) => x.text === text)!;
      if (text === '12π') {
        expect(m.kind).toBe('area');
        expect(dist(O, m.pos)).toBeLessThan(dist(O, A));
        expect(along(m.pos)).toBeCloseTo(Math.abs(drawn.sweepAng) / 2, 6);
      } else {
        expect(m.kind).toBe('arc');
        expect(dist(O, m.pos)).toBeCloseTo(dist(O, A), 6);
        expect(along(m.pos)).toBeCloseTo(Math.abs(drawn.sweepAng) / 2, 6);
      }
    }
  });
});

describe('#172 — the measure formulas and the label check (engine)', () => {
  const O = { x: 0, y: 0 }, A = { x: 2, y: 0 }, B = { x: 0, y: 2 };
  it('sector area ½θr², arc length θr, the drawn traversal (minor / stated span / legacy CCW), and the whole circle', () => {
    expect(operandArea([O, A, B], {})).toBeCloseTo(Math.PI, 9); // CCW A→B = 90°, r = 2
    expect(operandArea([O, B, A], {})).toBeCloseTo(3 * Math.PI, 9); // CCW B→A = 270°
    expect(operandArea([O, B, A], { minor: true })).toBeCloseTo(Math.PI, 9);
    expect(operandArea([O, B, A], { spanDeg: 270 })).toBeCloseTo(3 * Math.PI, 9);
    expect(operandBoundary([O, A, B], {})).toBeCloseTo(Math.PI, 9);
    expect(operandArea([O, A], { whole: true })).toBeCloseTo(4 * Math.PI, 9);
    expect(operandBoundary([O, A], { whole: true })).toBeCloseTo(4 * Math.PI, 9);
    expect(operandArea([O, A, B])).toBeCloseTo(2, 9); // no round operand: the polygon (triangle OAB)
  });

  it('a printed decimal on a sector is held to the SECTOR’s area, not the triangle over its letters', () => {
    const pos = new Map<string, Vec>([['O', O], ['A', A], ['B', B]]);
    expect(checkLabels({ lengths: [], angles: [], areas: [{ ids: ['O', 'A', 'B'], round: {}, text: '3.14' }] }, pos)).toEqual([]);
    expect(checkLabels({ lengths: [], angles: [], areas: [{ ids: ['O', 'A', 'B'], round: {}, text: '2' }] }, pos)).toHaveLength(1);
    expect(checkLabels({ lengths: [], angles: [], areas: [{ ids: ['O', 'A', 'B'], round: {}, of: 'length', text: '3.14' }] }, pos)).toEqual([]);
  });
});
