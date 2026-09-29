/**
 * #1439 (ADR-3D-263) — a relation between two NAMED equation planes is routed by whether a NORMAL
 * carries the parameter, never by its relation word.
 *
 * External review of prod: «הזווית בין המישורים π1 ו-π2 היא 45» was accepted for z = 3 and
 * x + y + z = 1 (true dihedral 54.74°) — and 30°, 0° and 90° too — and the canvas drew an arc labelled
 * with the false value. The angle went to a list only the parameter machinery read, so with no
 * parameter in play it was checked by nothing; with the parameter on a THIRD plane it root-found a
 * constant into `no-roots` (a true angle refused); and the ⟂ / ∥ forms went the other way — claim-only
 * even when a normal carried the parameter, so a satisfiable «π1 ניצב ל-π2» was judged at a sampled m.
 *
 * Every assertion here drives the REAL path (`submit` → `derive3`, `parse3`, `buildScene3`,
 * `deserializeFigure3`, `paramPinningRels`) — no decision is re-implemented in this file.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3, type Fact3 } from '../store/store3';
import { parse3 } from '../parser/parse3';
import { buildScene3 } from '../render/scene3';
import { HOME_CAMERA } from '../render/camera';
import { deserializeFigure3 } from '../store/figureFile3';
import { applyCommand3 } from '../engine/apply';
import { paramPinningRels } from '../engine/operands';
import { emptyConstruction3, type Command3, type Construction3 } from '../engine/types';

const st = () => useGeo3.getState();
const submitAll = (lines: string[]) => {
  for (const l of lines) st().submit(l);
};
const derived = () => derive3(st().facts, st().seed);

const REVIEWER = ['המישור π1: z = 3', 'המישור π2: x + y + z = 1'];
const REVIEWER_EN = ['plane π1: z = 3', 'plane π2: x + y + z = 1'];
/** acos(1/√3) — the true dihedral of z = 3 and x + y + z = 1 */
const TRUE_DEG = '54.7356';

/** Facts exactly as a LOADED file carries them: every line parsed, even one `submit` would refuse. */
const factsOf = (lines: string[]): Fact3[] =>
  lines.map((utterance, i) => {
    const p = parse3(utterance);
    if (!p.ok) throw new Error(`does not parse: ${utterance}`);
    return { id: `f${i}`, utterance, cmds: p.commands, enabled: true };
  });

const angleLabels = (lines: string[]): string[] => {
  const d = derive3(factsOf(lines), 0);
  return buildScene3(d.construction, d.resolved, HOME_CAMERA, { width: 800, height: 600 }).angles.map((a) => a.text);
};

describe('#1439 — a stated angle between equation planes is checked', () => {
  beforeEach(() => st().clear());

  // (a) the reviewer's sequence
  it.each(['45', '30', '0', '90'])('(a) a FALSE angle (%s°) between z = 3 and x + y + z = 1 is refused — claim-refuted, keep-prior', (deg) => {
    submitAll(REVIEWER);
    st().submit(`הזווית בין המישורים π1 ו-π2 היא ${deg}`);
    expect(st().lastError).toEqual({ code: 'claim-refuted' });
    expect(st().facts).toHaveLength(2);
  });

  it('(a) the TRUE angle (54.7356°) verifies', () => {
    submitAll([...REVIEWER, `הזווית בין המישורים π1 ו-π2 היא ${TRUE_DEG}`]);
    expect(st().lastError).toBeNull();
    expect(st().facts).toHaveLength(3);
    expect(Object.values(derived().status).every((s) => s === 'ok')).toBe(true);
  });

  // (b) English mirror
  it('(b) English: the false angle is refused, the true one verifies', () => {
    submitAll(REVIEWER_EN);
    st().submit('the angle between planes π1 and π2 is 45');
    expect(st().lastError).toEqual({ code: 'claim-refuted' });
    st().submit(`the angle between planes π1 and π2 is ${TRUE_DEG}`);
    expect(st().lastError).toBeNull();
    expect(st().facts).toHaveLength(3);
  });

  // (c) the «המישור π1 לבין המישור π2» spelling — was not-understood — and the mirrored slot order
  it.each([
    ['הזווית בין המישור π1 לבין המישור π2 היא', 'the «X לבין Y» frame'],
    ['הזווית בין המישורים π2 ו-π1 היא', 'the mirrored slots'],
    ['הזווית בין מישור π1 ו-π2 היא', 'the singular noun'],
  ])('(c) %s … — behaves identically (%s)', (head) => {
    submitAll(REVIEWER);
    st().submit(`${head} 45`);
    expect(st().lastError).toEqual({ code: 'claim-refuted' });
    st().submit(`${head} ${TRUE_DEG}`);
    expect(st().lastError).toBeNull();
    expect(st().facts).toHaveLength(3);
  });

  it('(c) every spelling lowers to the ONE plane-rel', () => {
    const want = [{ type: 'plane-rel', rel: 'angle', deg: 45, a: { kind: 'plane-named', name: 'π1' }, b: { kind: 'plane-named', name: 'π2' } }];
    for (const u of [
      'הזווית בין המישורים π1 ו-π2 היא 45',
      'הזווית בין המישור π1 לבין המישור π2 היא 45',
      'the angle between planes π1 and π2 is 45',
      'the angle between plane π1 and plane π2 is 45',
    ]) {
      const p = parse3(u);
      expect(p.ok, u).toBe(true);
      if (p.ok) expect(p.commands, u).toEqual(want);
    }
  });
});

describe('#1439 — the parameter is pinned only by a relation whose normal carries it', () => {
  beforeEach(() => st().clear());

  // (d) the false refusal: a parameter on a DIFFERENT plane
  it('(d) a true angle between two parameter-free planes is ok while the parameter lives on a third', () => {
    submitAll(['המישור π1: z = 0', 'המישור π2: x + mz - 1 = 0', 'המישור π3: x + y + z = 1', `הזווית בין המישורים π1 ו-π3 היא ${TRUE_DEG}`]);
    expect(st().lastError).toBeNull();
    expect(st().facts).toHaveLength(4);
    // the parameter stays a FREE sampled DOF — the angle does not pin it (ADR-052)
    expect(derived().resolved.param).toMatchObject({ name: 'm', roots: [], branches: [] });
    expect(paramPinningRels(derived().construction)).toEqual([]);
  });

  it('(d) entry order does not matter — the parameter plane stated AFTER the angle', () => {
    submitAll(['המישור π1: z = 0', 'המישור π3: x + y + z = 1', `הזווית בין המישורים π1 ו-π3 היא ${TRUE_DEG}`, 'המישור π2: x + mz - 1 = 0']);
    expect(st().lastError).toBeNull();
    expect(st().facts).toHaveLength(4);
  });

  it('(d) a FALSE angle between the parameter-free planes is still refused', () => {
    submitAll(['המישור π1: z = 0', 'המישור π2: x + mz - 1 = 0', 'המישור π3: x + y + z = 1']);
    st().submit('הזווית בין המישורים π1 ו-π3 היא 45');
    expect(st().lastError).toEqual({ code: 'claim-refuted' });
  });

  // (e) the #909-class member: ⟂ with the parameter in a normal is ROOT-FOUND, not judged at a sample
  it('(e) «π1 ניצב ל-π2» with π2: x + mz = 0 is ok and pins m = 0', () => {
    submitAll(['המישור π1: z = 0', 'המישור π2: x + mz = 0', 'π1 ניצב ל-π2']);
    expect(st().lastError).toBeNull();
    const p = derived().resolved.param!;
    expect(p.name).toBe('m');
    expect(p.roots).toEqual([0]);
    expect(p.value).toBe(0);
  });

  it('(e) the ∥ twin pins too: «π1 מקביל ל-π2» with π2: mx + z - 5 = 0 → m = 0', () => {
    submitAll(['המישור π1: z = 1', 'המישור π2: mx + z - 5 = 0', 'π1 מקביל ל-π2']);
    expect(st().lastError).toBeNull();
    expect(derived().resolved.param).toMatchObject({ value: 0, roots: [0] });
  });

  it('(e) the angle form of the same pair drives m = ±1', () => {
    submitAll(['המישור π1: z = 0', 'המישור π2: x + mz = 0', 'הזווית בין המישורים π1 ו-π2 היא 45']);
    expect(st().lastError).toBeNull();
    expect(derived().resolved.param?.roots).toEqual([-1, 1]);
  });

  it('(e) a pinning relation no value of m satisfies is the honest no-roots, naming the statement', () => {
    submitAll(['המישור π1: z = 0', 'המישור π2: x + mz = 0']);
    st().submit('π1 מקביל ל-π2'); // (0,0,1) ∥ (1,0,m) for no m
    expect(st().lastError).toMatchObject({ code: 'no-roots', sym: 'm', stated: 'π1 מקביל ל-π2' });
  });

  // (f) the 2022-Q2 scenario is unchanged
  it('(f) 2022-Q2: the 45° pins a = ±1 and the membership selects a = −1', () => {
    submitAll(['המישור π1: z - 3 = 0', 'המישור π2: ay + z - 8 = 0', 'הזווית בין המישורים π1 ו-π2 היא 45', 'A(2,-2,6) נמצאת על אחד המישורים']);
    expect(st().lastError).toBeNull();
    expect(derived().resolved.param).toMatchObject({ name: 'a', value: -1, roots: [-1, 1] });
    // and the 95° impossibility stays the honest no-roots
    st().clear();
    submitAll(['המישור π1: z - 3 = 0', 'המישור π2: ay + z - 8 = 0']);
    st().submit('הזווית בין המישורים π1 ו-π2 היא 95');
    expect(st().lastError).toMatchObject({ code: 'no-roots', sym: 'a' });
  });
});

describe('#1439 — (g) the canvas prints only an angle that holds', () => {
  it('a refused angle leaves no «°» label, even when a loaded file carries it', () => {
    for (const deg of ['45', '30', '0']) {
      expect(angleLabels([...REVIEWER, `הזווית בין המישורים π1 ו-π2 היא ${deg}`]), `${deg}°`).toEqual([]);
    }
    // the loaded fact itself is flagged, not silently green
    const d = derive3(factsOf([...REVIEWER, 'הזווית בין המישורים π1 ו-π2 היא 30']), 0);
    expect(d.status.f2).toEqual({ code: 'claim-refuted' });
  });

  it('a true angle keeps its arc and its value', () => {
    expect(angleLabels([...REVIEWER, `הזווית בין המישורים π1 ו-π2 היא ${TRUE_DEG}`])).toEqual([`${TRUE_DEG}°`]);
  });

  it('a pinned angle keeps its arc (2022-Q2)', () => {
    expect(angleLabels(['המישור π1: z - 3 = 0', 'המישור π2: ay + z - 8 = 0', 'הזווית בין המישורים π1 ו-π2 היא 45'])).toEqual(['45°']);
  });
});

describe('#1439 — `plane-angle` is a load-compat alias of the plane-rel', () => {
  const legacy = { type: 'plane-angle', p1: 'π1', p2: 'π2', deg: 45 } as Command3;
  const planes = (lines: string[]): Construction3 => {
    let c = emptyConstruction3();
    for (const cmd of factsOf(lines).flatMap((f) => f.cmds)) {
      const r = applyCommand3(c, cmd);
      if (!r.ok) throw new Error(JSON.stringify(r.error));
      c = r.next;
    }
    return c;
  };

  it('applies to exactly the construction the plane-rel produces', () => {
    const base = planes(REVIEWER);
    const viaAlias = applyCommand3(base, legacy);
    const viaRel = applyCommand3(base, factsOf(['הזווית בין המישורים π1 ו-π2 היא 45'])[0].cmds[0]);
    expect(viaAlias.ok && viaRel.ok).toBe(true);
    if (viaAlias.ok && viaRel.ok) expect(viaAlias.next.claims).toEqual(viaRel.next.claims);
  });

  it('an OLD saved file with a false `plane-angle` loads and is flagged claim-refuted', () => {
    const file = JSON.stringify({
      schemaVersion: 1,
      app: '3d-builder',
      savedAt: '2026-07-06T00:00:00.000Z',
      seed: 0,
      facts: [...factsOf(REVIEWER).map((f) => ({ utterance: f.utterance, cmds: f.cmds })), { utterance: 'הזווית בין המישורים π1 ו-π2 היא 45', cmds: [legacy] }],
    });
    const r = deserializeFigure3(file);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = derive3(r.facts, r.seed);
    expect(d.status[r.facts[2].id]).toEqual({ code: 'claim-refuted' });
  });

  it('an unknown plane in an old file keeps its unknown-plane refusal', () => {
    const r = applyCommand3(planes(['המישור π1: z = 3']), legacy);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toEqual({ code: 'unknown-plane', id: 'π2' });
  });
});
