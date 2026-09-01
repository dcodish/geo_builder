/**
 * #343 + #342 (ADR-3D-207) — THE BISECTOR STATED ON ITS OWN, AND THE PERP-BISECTOR'S HONEST END.
 *
 * `bisectorPoint` (V8-f/G11) handles the CARRIER form — «D על AC כך ש-OD חוצה זווית AOC» — where a
 * stated segment determines D. A textbook states the bisector by itself far more often, and every such
 * spelling escaped to the paid LLM lane. Nothing was missing from the geometry; the sentence had no
 * rule.
 *
 * The two halves are one item because they are the same question asked twice: what should an utterance
 * this tool has DECIDED about do? A bisector ray is a capability, so it gets a construct; the
 * perpendicular bisector is a decided NON-feature (#330 already refuses to tokenise «אמצעי» as
 * «אמצע»), so it gets guidance — and stops buying a Haiku call to reach a refusal the tool already knew.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { classifyGuidance3 } from '../parser/scope3';
import { freeDofCount3 } from '../engine/evaluate';
import { parse3 } from '../parser/parse3';

const st = () => useGeo3.getState();
const run = (...lines: string[]) => {
  for (const l of lines) {
    st().submit(l);
    expect(st().lastError, l).toBeNull();
  }
};
const unit = (p: { x: number; y: number; z: number }, q: { x: number; y: number; z: number }) => {
  const v = { x: q.x - p.x, y: q.y - p.y, z: q.z - p.z };
  const n = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / n, y: v.y / n, z: v.z / n };
};
const dot = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => a.x * b.x + a.y * b.y + a.z * b.z;

describe('#343 — the bisector RAY, with a free rider on it', () => {
  beforeEach(() => st().clear());

  /** Every frame from the issue's table that names the angle in full — all `⚠️ LLM` before. */
  it.each([
    'OD חוצה זווית AOC',
    'OD חוצה את זווית AOC',
    'OD is the bisector of angle AOC',
    'OD bisects angle AOC',
  ])('builds: %s', (line) => run('פירמידה משולשת AOCB', line));

  it('the VERTEX-named frame «AD חוצה זווית BAC» builds too', () => run('פירמידה משולשת ABCD', 'AD חוצה זווית BAC'));

  it('the ray really BISECTS — the two arm cosines are equal', () => {
    run('פירמידה משולשת AOCB', 'OD חוצה זווית AOC');
    const d = derive3(st().facts, st().seed);
    const [O, A, C, D] = ['O', 'A', 'C', 'D'].map((id) => d.positions.get(id)!);
    expect(dot(unit(O, D), unit(O, A))).toBeCloseTo(dot(unit(O, D), unit(O, C)), 8);
  });

  /**
   * ADR-052, and the whole reason this is a distinct construct rather than a widened `bisectorPoint`:
   * HOW FAR along the bisector D lies was never stated, so it is a sampled DOF that moves with the
   * seed — never a default.
   */
  it('the distance along the ray is a FREE sampled DOF', () => {
    run('פירמידה משולשת AOCB', 'OD חוצה זווית AOC');
    const at = (seed: number) => {
      const p = derive3(st().facts, seed).positions.get('D')!;
      return `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`;
    };
    expect(new Set([0, 1, 2, 3].map(at)).size, 'D must slide with the seed').toBeGreaterThan(1);
  });

  it('the DOF cue counts that freedom', () => {
    run('פירמידה משולשת AOCB');
    const cue = () => {
      const d = derive3(st().facts, st().seed);
      return freeDofCount3(d.construction, d.resolved);
    };
    const before = cue();
    run('OD חוצה זווית AOC');
    expect(cue(), 'the rider adds exactly one').toBe(before + 1);
  });

  it('the apex is DERIVED from the shared letter, not from position', () => {
    // «OD …AOC» and «AD …BAC» are the same rule; a pair that misses the vertex declines.
    expect(parse3('OD חוצה זווית AOC').ok).toBe(true);
    expect(parse3('AD חוצה זווית BAC').ok).toBe(true);
    expect(parse3('XY חוצה זווית AOC').ok, 'the pair does not touch the vertex').toBe(false);
    expect(parse3('OD חוצה זווית AOD').ok, 'the rider cannot also be a ray endpoint').toBe(false);
  });

  /**
   * M1 duality (decided at apply, because `parse3` is context-free): on an EXISTING point the same
   * sentence is a GIVEN about it, never a re-creation. «AD חוצה זווית BAC» on the pyramid ABCD — where
   * D is already a vertex — says the two arm angles are equal, and that is what it lowers to.
   */
  it('on an EXISTING point the sentence is a GIVEN, not «already defined»', () => {
    run('פירמידה משולשת ABCD', 'AD חוצה זווית BAC');
    const d = derive3(st().facts, st().seed);
    const tag = (x: { kind?: string; type?: string }) => x.kind ?? x.type;
    const stated = [...d.construction.claims, ...d.construction.scalarPins].some((x) => tag(x) === 'cos-eq');
    expect(stated, 'it becomes an equal-angle given').toBe(true);
  });

  it('the CARRIER form is untouched — the longer sentence still wins', () => {
    const r = parse3('D על AC כך ש-OD חוצה זווית AOC');
    expect(r.ok).toBe(true);
    expect(r.ok && r.commands).toEqual([{ type: 'bisector-point', id: 'D', a: 'A', b: 'C', apex: 'O' }]);
  });

  /**
   * NOT built, and recorded rather than forgotten: «AD חוצה את זווית A» names the angle by its vertex
   * alone. In 2-D (ADR-164/261) the figure resolves it, because a vertex there usually has two incident
   * edges; in 3-D a pyramid vertex has three or more, so WHICH two rays the letter names is a genuine
   * ambiguity and an operator's call. It stays an honest escalation rather than a guess.
   */
  it('the single-VERTEX frame is deliberately not guessed at', () => {
    expect(parse3('AD חוצה את זווית A').ok).toBe(false);
  });
});

describe('#342 — the perpendicular bisector is a decided NON-feature, not a gap', () => {
  it.each([
    'אנך אמצעי ל-AB',
    'האנך האמצעי של AB',
    'the perpendicular bisector of AB',
  ])('reaches GUIDANCE instead of the LLM: %s', (line) => {
    expect(parse3(line).ok, 'still not parsed — this is a decision, not a capability').toBe(false);
    expect(classifyGuidance3(line)).toEqual({ category: 'perp-bisector', messageKey: 'scope.perp-bisector' });
  });

  /** The no-theft half: the MIDPOINT — which #330 distinguished from this adjective — must be untouched. */
  it.each(['M אמצע AB', 'אמצע AB', 'M is the midpoint of AB'])('does not steal the midpoint: %s', (line) => {
    expect(classifyGuidance3(line)).toBeNull();
  });

  it('the midpoint still builds', () => {
    st().clear();
    run('פירמידה משולשת ABCD', 'M אמצע AB');
  });
});
