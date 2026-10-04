/**
 * #1241 ([ADR-AG-237](../../docs/06c-decisions-analytic.md#adr-ag-237)) — A STATED ALTITUDE DRAWS ITS KNEE AT THE FOOT.
 *
 * Operator, 2026-09-19: *"when we do a height, I want the knee to show since this is a direct request from the user.
 * if the angle is calculated as 90 we don't show it since its derived"*. #1714 (ADR-AG-225) delivered the knee for a
 * stated right angle; re-measured 2026-10-04 (round #1736) and again at this pickup (c098af9b), an ALTITUDE drew none:
 *
 *   «משולש ABC» · «AD גובה לצלע BC»                 → 0 knees, seeds 0–2   (the `perpendicular` constraint fell to `default`)
 *   «משולש ABC» · «AD גובה במשולש ABC»              → 0 knees
 *   «משולש ABC» · «∢BAC = 120» · «AD גובה לצלע BC»  → 0 knees
 *   «משולש ABC» · «הגובה מ-A לצלע BC»               → 0 knees              (a derived `foot`, no constraint at all)
 *
 * Every case goes through the app's path — `derive` → `buildScene(…, { stated })` — and the knee's SHAPE is checked by
 * the shared `kneeFaults` (docs/28 §5c): a square corner at the foot, one leg toward A and one along BC.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { buildScene, type Scene } from '../render/scene';
import { kneeFaults, pointsOf } from '../../shell/__tests__/fixtures/mark-geometry-rows';
import type { MarkPt } from '../../shell/marks';

const SEEDS = [0, 1, 2, 3, 4, 5];

function scene(lines: string[], seed = 0): Scene {
  const d = derive(lines, seed);
  expect(d.faults, lines.join(' · ')).toEqual([]);
  return buildScene(d.figure, d.box, 600, 400, { stated: d.stated });
}
const knees = (s: Scene) => s.stated.marks.filter((m) => m.kind === 'right');
const screen = (s: Scene, id: string): MarkPt => {
  const p = s.points.find((q) => q.id === id)!;
  return { x: p.cx, y: p.cy };
};
const far = (s: Scene, v: string, a: string, b: string) => {
  const V = screen(s, v);
  const da = Math.hypot(screen(s, a).x - V.x, screen(s, a).y - V.y);
  const db = Math.hypot(screen(s, b).x - V.x, screen(s, b).y - V.y);
  return da >= db ? a : b;
};
/** Exactly one knee, square at `foot`, one leg toward `apex` and one along the side (toward its farther end). */
function expectKneeAtFoot(lines: string[], foot: string, apex = 'A', side: [string, string] = ['B', 'C']) {
  for (const seed of SEEDS) {
    const s = scene(lines, seed);
    const k = knees(s);
    expect(k, `${lines.join(' · ')} seed ${seed}`).toHaveLength(1);
    const along = far(s, foot, side[0], side[1]);
    expect(kneeFaults(pointsOf(k[0].d), screen(s, foot), screen(s, apex), screen(s, along), 1e-2), `seed ${seed}`).toEqual([]);
  }
}

describe('#1241 — an altitude the student states draws one knee, at its foot', () => {
  it('«AD גובה לצלע BC» → a knee at D', () => expectKneeAtFoot(['משולש ABC', 'AD גובה לצלע BC'], 'D'));

  it('«AD גובה במשולש ABC» → a knee at D', () => expectKneeAtFoot(['משולש ABC', 'AD גובה במשולש ABC'], 'D'));

  it('the operator’s obtuse case «∢BAC = 120» · «AD גובה לצלע BC» → a knee at D', () =>
    expectKneeAtFoot(['משולש ABC', '∢BAC = 120', 'AD גובה לצלע BC'], 'D'));

  it('a foot BEYOND C («∢ACB = 120») → the knee sits at D on the extension, its leg running back along the line', () => {
    const lines = ['משולש ABC', '∢ACB = 120', 'AD גובה לצלע BC'];
    expectKneeAtFoot(lines, 'D');
    // The foot really is outside the side: C lies between B and D.
    const d = derive(lines, 0).figure.points;
    const P = (id: string) => d.find((p) => p.id === id)!;
    const [B, C, D] = [P('B'), P('C'), P('D')];
    expect(Math.hypot(D.x - B.x, D.y - B.y)).toBeGreaterThan(Math.hypot(C.x - B.x, C.y - B.y));
  });

  it('the unnamed «הגובה מ-A לצלע BC» → a knee at the foot the tool named', () => {
    const d = derive(['משולש ABC', 'הגובה מ-A לצלע BC'], 0);
    const foot = d.construction.objects.find((o) => o.kind === 'derived' && o.rule.t === 'foot')!.id;
    expectKneeAtFoot(['משולש ABC', 'הגובה מ-A לצלע BC'], foot);
  });

  it('a perpendicular’s foot «D רגל האנך מ-A ל-BC» is a stated perpendicular too → a knee at D', () =>
    expectKneeAtFoot(['משולש ABC', 'D רגל האנך מ-A ל-BC'], 'D'));

  it('one right angle, one knee: the altitude restated, or with «זווית ADB ישרה» in either order', () => {
    for (const lines of [
      ['משולש ABC', 'AD גובה לצלע BC', 'AD גובה לצלע BC'],
      ['משולש ABC', 'AD גובה לצלע BC', 'זווית ADB ישרה'],
      ['משולש ABC', 'AD גובה לצלע BC', 'זווית ADC ישרה'],
      ['משולש ABC', 'זווית ADB ישרה', 'AD גובה לצלע BC'],
    ]) {
      for (const seed of [0, 1, 2]) expect(knees(scene(lines, seed)), lines.join(' · ')).toHaveLength(1);
    }
  });
});

describe('#1241 — the controls: a 90° the tool DERIVED draws no knee; the stated right angle is unchanged', () => {
  it.each([
    [['A(0,0)', 'B(6,0)', 'C(0,8)', 'משולש ABC']],
    [['מעגל O: x^2+y^2=25', 'A(-5,0)', 'B(5,0)', 'C(3,4)', 'משולש ABC']],
    [['משולש ABC', 'AD תיכון לצלע BC']],
    [['מלבן ABCD']],
  ])('%j → no knee', (lines) => {
    for (const seed of [0, 1, 2]) expect(knees(scene(lines, seed))).toHaveLength(0);
  });

  it('«זווית ABC ישרה» still draws exactly one knee at B', () => {
    for (const seed of SEEDS) {
      const s = scene(['משולש ABC', 'זווית ABC ישרה'], seed);
      expect(knees(s)).toHaveLength(1);
      expect(kneeFaults(pointsOf(knees(s)[0].d), screen(s, 'B'), screen(s, 'A'), screen(s, 'C'), 1e-2)).toEqual([]);
    }
  });
});
