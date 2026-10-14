/**
 * #2064 Stage 2 ([ADR-644](../../../docs/06-decisions.md#adr-644)) — a height named by two existing vertices whose side
 * the sentence did not state is a CYCLABLE VARIANT: the operator's ruling of 2026-10-14 (option D), *"for מרובע ABCD,
 * AC גובה - this is no issue. we just draw AC perpendicular to BC?"*, the side a free choice «הציגו תצורה אחרת» cycles.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { expandAltitudeChoice, pinnedAltitudeOption, statedRightAngles, variantCountOf, withVariant, cyclableVariant } from '@/engine';
import type { AnyCommand, Command, Vec } from '@/engine';
import { factsOf } from '@/__tests__/scenarios-harness';
import { meetsRequirements } from '@/replay/core';
import { replay, useGeoStore, type Fact } from '@/store/geoStore';
import { decideDeterministic2D } from '@/app/decideDeterministic';
import { commitVerdict } from '@/app/submitPipeline';
import { serializeFigure, deserializeFigure } from '@/store/figureFile';

const st = () => useGeoStore.getState();
type AltCmd = Extract<AnyCommand, { type: 'altitude-choice' }>;

/** |cos| of the angle at `b` between ba and bc in `pos` — 0 is a right angle. */
const cosAt = (pos: Map<string, Vec>, a: string, b: string, c: string) => {
  const A = pos.get(a)!, B = pos.get(b)!, C = pos.get(c)!;
  const u = { x: A.x - B.x, y: A.y - B.y }, w = { x: C.x - B.x, y: C.y - B.y };
  return Math.abs(u.x * w.x + u.y * w.y) / (Math.hypot(u.x, u.y) * Math.hypot(w.x, w.y));
};
/** The distance from P to line XY, over |XY| — 0 is P on that line. */
const offLine = (pos: Map<string, Vec>, p: string, x: string, y: string) => {
  const P = pos.get(p)!, X = pos.get(x)!, Y = pos.get(y)!;
  const l = Math.hypot(Y.x - X.x, Y.y - X.y);
  return Math.abs((Y.x - X.x) * (P.y - X.y) - (Y.y - X.y) * (P.x - X.x)) / (l * l);
};
const choiceOf = (facts: Fact[]) => facts.find((f) => f.cmd.type === 'altitude-choice')!;

async function decideHere(line: string) {
  const f = replay(st().facts, st().seed);
  return decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: f.construction, positions: f.positions } }, line, /[א-ת]/.test(line) ? 'he' : 'en');
}
async function drive(lines: string[]) {
  st().clear();
  for (const l of lines) {
    const v = await decideHere(l);
    expect(v.kind, `«${l}» builds`).toBe('commit');
    commitVerdict(v, l);
  }
}

beforeEach(() => {
  st().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

describe('#2064 Stage 2 — the command', () => {
  const cmd: AltCmd = {
    type: 'altitude-choice',
    options: [
      { apex: 'A', foot: 'C', side: ['C', 'B'] },
      { apex: 'A', foot: 'C', side: ['C', 'D'] },
      { apex: 'C', foot: 'A', side: ['A', 'D'] },
      { apex: 'C', foot: 'A', side: ['A', 'B'] },
    ],
    variant: 0,
  };
  it('is a variant command: one configuration per option, cyclable', () => {
    expect(variantCountOf(cmd)).toBe(4);
    expect(cyclableVariant(cmd)).toBe(true);
    expect(withVariant(cmd, 2).variant).toBe(2);
  });
  it('lowers to the long form of the chosen option — exactly «AC גובה לצלע BC»', () => {
    expect(expandAltitudeChoice(cmd)).toEqual([
      { type: 'segment', a: 'A', b: 'C' },
      { type: 'segment', a: 'C', b: 'B' },
      { type: 'set-perpendicular', a: 'A', b: 'C', c: 'C', d: 'B' },
    ]);
    expect(expandAltitudeChoice({ ...cmd, variant: 2 })).toContainEqual({ type: 'set-perpendicular', a: 'C', b: 'A', c: 'A', d: 'D' });
  });
  it('a stated right angle at an option PINS it (M4) and is not emitted twice', () => {
    const stated = statedRightAngles([{ type: 'set-perpendicular', a: 'A', b: 'C', c: 'C', d: 'D' } as Command]);
    expect(pinnedAltitudeOption(cmd.options, stated)).toBe(1);
    const out = expandAltitudeChoice(cmd, stated);
    expect(out.some((c) => c.type === 'set-perpendicular')).toBe(false);
    expect(out).toContainEqual({ type: 'segment', a: 'C', b: 'D' });
    expect(statedRightAngles([{ type: 'set-angle', vertex: 'A', ray1: 'D', ray2: 'C', value: 90 } as Command])).toEqual([{ vertex: 'A', a: 'D', b: 'C' }]);
    expect(pinnedAltitudeOption(cmd.options, statedRightAngles([{ type: 'set-angle', vertex: 'A', ray1: 'D', ray2: 'C', value: 90 } as Command]))).toBe(2);
    expect(pinnedAltitudeOption(cmd.options, statedRightAngles([{ type: 'set-angle', vertex: 'A', ray1: 'D', ray2: 'C', value: 60 } as Command]))).toBeNull();
  });
});

describe('#2064 Stage 2 — «מרובע ABCD» · «AC גובה» builds AC ⟂ BC, and every side is reachable', () => {
  it('the default is AC ⟂ BC (the operator\'s own example), C stays off the diagonal BD', async () => {
    await drive(['מרובע ABCD', 'AC גובה']);
    const d = replay(st().facts, st().seed);
    expect(d.status[st().facts.at(-1)!.id]).toBe('ok');
    expect(cosAt(d.positions, 'A', 'C', 'B')).toBeLessThan(1e-6);
    expect(offLine(d.positions, 'C', 'B', 'D'), 'C is not moved onto BD').toBeGreaterThan(1e-3);
    expect(llmParseMock).not.toHaveBeenCalled();
  });

  it('each of the four options is a valid figure at some configuration: the right angle at its foot, no straight corner', () => {
    const facts = factsOf(['מרובע ABCD', 'AC גובה']);
    const i = facts.indexOf(choiceOf(facts));
    const cmd = facts[i].cmd as AltCmd;
    expect(cmd.options.map((o) => `${o.apex}${o.foot}⟂${o.side.join('')}`)).toEqual(['AC⟂CB', 'AC⟂CD', 'CA⟂AD', 'CA⟂AB']);
    for (let v = 0; v < 4; v++) {
      const fc = facts.map((f, k) => (k === i ? { ...f, cmd: withVariant(f.cmd, v) } : f));
      const seed = [0, 1, 2, 3, 4, 5, 6, 7].find((s) => meetsRequirements(fc, s));
      expect(seed, `option ${v} is drawable`).toBeDefined();
      const pos = replay(fc, seed!).positions;
      const o = cmd.options[v];
      expect(cosAt(pos, o.apex, o.foot, o.side[1]), `option ${v}: the right angle`).toBeLessThan(1e-6);
    }
  });

  it('the same for «AB גובה» (AB ⟂ BC or AB ⟂ AD) and the two triangles (AB ⟂ BC, AB ⟂ AC, AB ⟂ AD)', () => {
    const quad = choiceOf(factsOf(['מרובע ABCD', 'AB גובה'])).cmd as AltCmd;
    expect(quad.options.map((o) => `${o.apex}${o.foot}⟂${o.side.join('')}`)).toEqual(['AB⟂BC', 'BA⟂AD']);
    const tris = choiceOf(factsOf(['משולש ABC', 'משולש ACD', 'AB גובה'])).cmd as AltCmd;
    expect(tris.options.map((o) => `${o.apex}${o.foot}⟂${o.side.join('')}`)).toEqual(['AB⟂BC', 'BA⟂AC', 'BA⟂AD']);
  });

  it('«הציגו תצורה אחרת» cycles the side: every press keeps a right angle the pair names, and every view meets the givens', async () => {
    await drive(['מרובע ABCD', 'AC גובה']);
    const seen = new Set<number>();
    for (let press = 0; press < 6; press++) {
      const cmd = choiceOf(st().facts).cmd as AltCmd;
      seen.add(cmd.variant % 4);
      const pos = replay(st().facts, st().seed).positions;
      const o = cmd.options[cmd.variant % 4];
      expect(cosAt(pos, o.apex, o.foot, o.side[1]), `press ${press}`).toBeLessThan(1e-6);
      expect(meetsRequirements(st().facts, st().seed), `press ${press}`).toBe(true);
      if (!st().cycleVariant()) break;
    }
    expect(seen.size, 'more than one side is shown').toBeGreaterThan(1);
  });

  it('a later «AC ⟂ CD» moves the choice to CD — nothing is stacked, refused or flattened', async () => {
    await drive(['מרובע ABCD', 'AC גובה', 'AC ⟂ CD']);
    const d = replay(st().facts, st().seed);
    expect(Object.values(d.status).every((s) => s === 'ok')).toBe(true);
    expect(cosAt(d.positions, 'A', 'C', 'D')).toBeLessThan(1e-6);
    expect(cosAt(d.positions, 'A', 'C', 'B'), 'the default yielded').toBeGreaterThan(1e-3);
    // the pinned choice no longer cycles away from the stated right angle
    for (let press = 0; press < 3; press++) {
      st().resample();
      expect(cosAt(replay(st().facts, st().seed).positions, 'A', 'C', 'D')).toBeLessThan(1e-6);
    }
  });

  it('stating the DRAWN side («AC ⟂ BC») records the choice rather than answering «כבר קיים»', async () => {
    await drive(['מרובע ABCD', 'AC גובה']);
    const v = await decideHere('AC ⟂ BC');
    expect(v.kind).toBe('commit');
  });

  it('a default the figure contradicts yields at commit: «זווית ABC = 60» · «AB גובה» draws AB ⟂ AD', async () => {
    await drive(['מרובע ABCD', 'זווית ABC = 60', 'AB גובה']);
    const d = replay(st().facts, st().seed);
    expect(Object.values(d.status).every((s) => s === 'ok')).toBe(true);
    expect(cosAt(d.positions, 'B', 'A', 'D')).toBeLessThan(1e-6);
  });

  it('the variant travels in the saved file', async () => {
    await drive(['מרובע ABCD', 'AC גובה']);
    st().cycleVariant();
    const v = (choiceOf(st().facts).cmd as AltCmd).variant;
    expect(v).not.toBe(0);
    const back = deserializeFigure(serializeFigure({ facts: st().facts, seed: st().seed }));
    expect(back.ok && (choiceOf(back.file.facts).cmd as AltCmd).variant).toBe(v);
  });
});

describe('#2064 Stage 2 — what stays as it was', () => {
  it('«מקבילית ABCD» · «AB גובה» forces the rectangle (the note is #1996\'s, not built yet: drawn silently, as «AB גובה לצלע BC» is)', async () => {
    await drive(['מקבילית ABCD', 'AB גובה']);
    const pos = replay(st().facts, st().seed).positions;
    for (const [a, b, c] of [['A', 'B', 'C'], ['B', 'C', 'D'], ['C', 'D', 'A'], ['D', 'A', 'B']]) expect(cosAt(pos, a, b, c)).toBeLessThan(1e-6);
  });
  it('#2085 item 1: «משולש ABC» · «AB גובה» emits no choice — the right angle stays fixed at B', () => {
    expect(factsOf(['משולש ABC', 'AB גובה']).some((f) => f.cmd.type === 'altitude-choice')).toBe(false);
  });
  it('a stated side through neither letter keeps the refusal: «ריבוע ABCD» · «AB גובה לצלע CD»', async () => {
    await drive(['ריבוע ABCD']);
    const v = await decideHere('AB גובה לצלע CD');
    expect(v.kind === 'refuse' && 'key' in v.note && v.note).toEqual({ key: 'errors.alreadyDefined', params: { id: 'B' } });
  });
});
