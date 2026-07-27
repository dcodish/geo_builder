/**
 * #126 — hovering a definite-VALUE angle or segment reveals its number (on top of the equality-class hover
 * that already worked). Detection: a length is definite only once a size given pins the scale (a free figure's
 * lengths float across sampled seeds). Pick: hover a side's body → its length; hover into a wedge → its angle.
 */
import { describe, it, expect } from 'vitest';
import { useGeoStore, replay } from '@/store/geoStore';
import { parse } from '@/parser';
import { relationAt, relationsForPick, relationMarks } from '@/render/scene';
import type { RelationsResult } from '@/engine';

async function build(u: string) {
  useGeoStore.setState({ facts: [], seed: 0, relations: null });
  for (const p of u.split(' + ')) {
    const r = parse(p, {} as never);
    if ('ok' in r && r.ok) useGeoStore.getState().executeMany(r.commands, p);
  }
  await useGeoStore.getState().viewRelations();
  const st = useGeoStore.getState() as unknown as { relations: { result: RelationsResult } };
  return { res: st.relations.result, pos: replay(useGeoStore.getState().facts, useGeoStore.getState().seed).positions };
}

describe('definite values on hover (#126)', () => {
  it('a FREE figure has no definite lengths (they float across the scale gauge)', async () => {
    expect((await build('triangle ABC')).res.definiteLengths).toEqual([]);
    // a lone right triangle: the 90° is definite (scale-invariant), but no length is
    const rt = await build('right triangle ABC');
    expect(rt.res.definiteAngles.map((a) => Math.round(a.valueDeg))).toEqual([90]);
    expect(rt.res.definiteLengths).toEqual([]);
  });

  it('a SIZED figure has definite lengths equal to the pinned world lengths (3-4-5)', async () => {
    const { res } = await build('right triangle ABC + AB=5 + AC=4');
    const byPair = Object.fromEntries(res.definiteLengths.map((l) => [[l.a, l.b].sort().join(''), Math.round(l.value)]));
    expect(byPair).toEqual({ AB: 5, AC: 4, BC: 3 });
    expect(res.definiteAngles.map((a) => Math.round(a.valueDeg)).sort((x, y) => x - y)).toEqual([37, 53, 90]);
  });

  it('hovering a side body picks its length; hovering into a wedge picks its angle', async () => {
    const { res, pos } = await build('right triangle ABC + AB=5 + AC=4');
    const A = pos.get('A')!, B = pos.get('B')!, C = pos.get('C')!;
    const seg = 0.5, vert = 0.5; // small screen-proportional reaches
    const midBC = { x: (B.x + C.x) / 2, y: (B.y + C.y) / 2 };
    const segPick = relationAt(res, pos, midBC, seg, vert);
    expect(segPick?.kind).toBe('valueLength');
    // the rendered length label reads BC's length
    const lengths = relationMarks(relationsForPick(res, segPick!), pos).lengths;
    expect(lengths.map((m) => m.text)).toEqual(['3']);
    // hovering just inside the wedge at A picks the angle value
    const bis = { x: (B.x - A.x) + (C.x - A.x), y: (B.y - A.y) + (C.y - A.y) };
    const L = Math.hypot(bis.x, bis.y) || 1;
    const angPick = relationAt(res, pos, { x: A.x + (bis.x / L) * 0.35, y: A.y + (bis.y / L) * 0.35 }, seg, vert);
    expect(angPick?.kind).toBe('valueAngle');
    const vals = relationMarks(relationsForPick(res, angPick!), pos).values;
    expect(vals.map((v) => v.text)).toEqual(['36.87°']); // arctan(3/4), now 2dp (#164, ADR-393)
  });

  it('a forced 90° stays a knee on hover (operator: keep knee, not the number)', async () => {
    const { res, pos } = await build('right triangle ABC');
    const A = pos.get('A')!, B = pos.get('B')!, C = pos.get('C')!;
    // the right angle is at C — hover just inside its wedge
    const bis = { x: (A.x - C.x) + (B.x - C.x), y: (A.y - C.y) + (B.y - C.y) };
    const L = Math.hypot(bis.x, bis.y) || 1;
    const pick = relationAt(res, pos, { x: C.x + (bis.x / L) * 0.3, y: C.y + (bis.y / L) * 0.3 }, 0.4, 0.6);
    expect(pick?.kind).toBe('valueAngle');
    const marks = relationMarks(relationsForPick(res, pick!), pos);
    expect(marks.rightAngles.length, 'a knee, not a value').toBe(1);
    expect(marks.values.length).toBe(0);
  });
});
