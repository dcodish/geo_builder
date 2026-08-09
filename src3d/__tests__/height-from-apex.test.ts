/**
 * #448 — the height stated by its APEX, not by its segment.
 *
 * Operator, 2026-08-09: *"I want to be able to support `גובה הפירמידה מנקודה X` … without having to name
 * the segment (of course we can if user wants but tool should understand the meaning)."*
 *
 * Every `גובה` rule the tree had required the segment's two labels FIRST — `AS גובה הפירמידה`,
 * `CD גובה במשולש ABC`, `DE גובה בטטראדר`. That is not how a bagrut question words it: it names the apex
 * and the base, and the FOOT is a point the student never mentions. The foot is exactly what
 * `perp-to-base` already auto-mints (#72), so the whole family is a phrasing gap onto an existing
 * construct — no new geometry.
 *
 * Assertions are GEOMETRIC on the resolved figure (the `src3d/CLAUDE.md` rule): a height is proved by the
 * foot lying IN the base plane and the apex→foot direction being ⟂ to two independent base edges — never
 * by "a command was emitted".
 */
import { describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { parse3 } from '../parser/parse3';
import { cross3, dot3, norm3, sub3, type Vec3 } from '../engine/vec3';

function build(lines: string[], seed = 0) {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
  for (const l of lines) useGeo3.getState().submit(l);
  const st = useGeo3.getState();
  const d = derive3(st.facts, seed);
  return { st, d, pos: d.positions, c: d.construction };
}

const at = (pos: Map<string, Vec3>, id: string): Vec3 => {
  const p = pos.get(id);
  if (!p) throw new Error(`no position for ${id}`);
  return p;
};

/** The point the utterance minted that the student never named. */
function autoFoot(pos: Map<string, Vec3>, known: string[]): string {
  const extra = [...pos.keys()].filter((k) => !known.includes(k));
  expect(extra, `exactly one auto-minted foot (got ${extra.join(',')})`).toHaveLength(1);
  return extra[0];
}

/** apex→foot is ⟂ to the plane through a,b,c, and the foot LIES in it. */
function isHeightOnto(pos: Map<string, Vec3>, apex: string, foot: string, base: [string, string, string]) {
  const [a, b, c] = base.map((id) => at(pos, id));
  const n = cross3(sub3(b, a), sub3(c, a));
  const drop = sub3(at(pos, foot), at(pos, apex));
  expect(norm3(drop), 'the height is not degenerate').toBeGreaterThan(1e-6);
  // foot in the base plane
  expect(Math.abs(dot3(sub3(at(pos, foot), a), n)) / (norm3(n) || 1), 'foot lies in the base plane').toBeLessThan(1e-6);
  // apex→foot parallel to the plane normal ⇒ ⟂ to every direction in the plane
  const cosToNormal = Math.abs(dot3(drop, n)) / (norm3(drop) * norm3(n));
  expect(cosToNormal, 'apex→foot is along the base normal').toBeGreaterThan(1 - 1e-6);
}

describe('#448 — the apex form builds a real height', () => {
  it.each([
    ['solid named', 'גובה הפירמידה מנקודה D'],
    ['solid named, ל- form', 'גובה לפירמידה מנקודה D'],
    ['dash-apex', 'גובה הפירמידה מ-D'],
    ['base implied', 'גובה מנקודה D לבסיס'],
    ['base NAMED', 'גובה מנקודה D לבסיס ABC'],
    ['English', 'height of the pyramid from D'],
  ])('%s: «%s»', (_label, line) => {
    const { st, pos } = build(['פירמידה ABCD', line]);
    expect(st.lastError, `«${line}» must build`).toBeNull();
    const foot = autoFoot(pos, ['A', 'B', 'C', 'D']);
    isHeightOnto(pos, 'D', foot, ['A', 'B', 'C']);
  });
});

describe('#448 — it steals nothing', () => {
  it('the SEGMENT-named forms keep their existing lowerings', () => {
    // Each of these is owned by an earlier rule and must stay there — the apex rule runs last, inside
    // perpToBase, precisely so it can only claim what nothing else wanted.
    for (const [line, type] of [
      ['CD גובה במשולש ABC', 'altitude-foot'],
      ['DE גובה בטטראדר', 'tetra-altitude'],
      ['AS גובה הפירמידה', 'seg-plane-rel'],
      ['גובה המשולש לצלע AB הוא CD', 'altitude-foot'],
    ] as [string, string][]) {
      const p = parse3(line);
      expect(p.ok, line).toBe(true);
      if (p.ok) expect(p.commands.map((c) => c.type), line).toContain(type);
    }
  });

  it('the #72 original still lowers to the same command', () => {
    const p = parse3('האנך היורד מ-M לבסיס');
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.commands).toEqual([{ type: 'perp-to-base', from: 'M' }]);
  });

  it('the BARE «גובה מנקודה D» is still not-handled — the #467 guidance boundary', () => {
    // The operator ruled this form genuinely unclear (no solid, no base, nothing to drop onto). If this
    // rule ever claims it, the guidance register never sees it and the tool starts guessing a base.
    for (const line of ['גובה מנקודה D', 'גובה מ D', 'גובה מהקודקוד S', 'height from D']) {
      expect(parse3(line).ok, line).toBe(false);
    }
  });
});

describe('#448 — a STATED base is honoured, never quietly swapped', () => {
  it('«לבסיס ABC» drops onto ABC even when it is not the solid\'s first face', () => {
    // The apex here is A and the named base is BCD — if apply resolved `solids[0].ids.slice(0,3)` it
    // would build the height onto ABC instead and silently contradict the student's own words.
    const { st, pos } = build(['פירמידה ABCD', 'גובה מנקודה A לבסיס BCD']);
    expect(st.lastError).toBeNull();
    const foot = autoFoot(pos, ['A', 'B', 'C', 'D']);
    isHeightOnto(pos, 'A', foot, ['B', 'C', 'D']);
  });

  it('a base naming a point that does not exist refuses, never invents it', () => {
    const { st } = build(['פירמידה ABCD', 'גובה מנקודה D לבסיס ABZ']);
    expect(st.lastError).not.toBeNull();
  });

  it('an UNSTATED base with more than one solid refuses as ambiguous', () => {
    const { st } = build(['פירמידה ABCD', 'תיבה EFGHE\'F\'G\'H\'', 'גובה הפירמידה מנקודה D']);
    expect(st.lastError, 'two solids — no honest way to pick a base').not.toBeNull();
  });
});
