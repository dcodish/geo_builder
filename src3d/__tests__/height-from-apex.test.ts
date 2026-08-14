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

describe('#503 (ADR-3D-142) — the apex-less form and the imperative/relative-clause phrasing', () => {
  it.each([
    ['apex-less, the prod row', 'גובה הפירמידה'],
    ['apex-less, definite של form', 'הגובה של הפירמידה'],
    ['apex-less English', 'the height of the pyramid'],
  ])('%s: «%s» derives the apex from the solid (apex-last)', (_label, line) => {
    const { st, pos } = build(['פירמידה ABCD', line]);
    expect(st.lastError, `«${line}» must build`).toBeNull();
    const foot = autoFoot(pos, ['A', 'B', 'C', 'D']);
    isHeightOnto(pos, 'D', foot, ['A', 'B', 'C']);
  });

  it.each([
    ['the prod imperative + relative clause + base-with-solid-noun', 'שרטט גובה לפירמידה שיוצא מהקודקוד D לבסיס הפירמידה'],
    ['imperative on the plain apex form', 'שרטט גובה לפירמידה מ-D'],
    ['English mirror', 'draw a height of the pyramid that goes from vertex D to the base of the pyramid'],
  ])('%s: «%s»', (_label, line) => {
    const { st, pos } = build(['פירמידה ABCD', line]);
    expect(st.lastError, `«${line}» must build`).toBeNull();
    const foot = autoFoot(pos, ['A', 'B', 'C', 'D']);
    isHeightOnto(pos, 'D', foot, ['A', 'B', 'C']);
  });

  it('the prod SESSION context — the label-less right-triangle-base pyramid, then the bare height', () => {
    const { st, c } = build(['פירמידה עם בסיס משולש ישר זווית', 'גובה הפירמידה']);
    expect(st.lastError, 'the exact prod pair must build').toBeNull();
    // the height materialised: a segment from the solid's apex to a minted foot
    const apex = c.solids[0].ids[c.solids[0].ids.length - 1];
    expect(c.segments.some(([a, b]) => a === apex || b === apex), 'apex→foot segment drawn').toBe(true);
  });

  it('«גובה המנסרה» does NOT ride along — a prism has no apex to derive (ADR-052)', () => {
    for (const line of ['גובה המנסרה', 'the height of the prism']) {
      expect(parse3(line).ok, line).toBe(false);
    }
  });

  it('the apex-less form beside TWO solids refuses as ambiguous', () => {
    const { st } = build(['פירמידה ABCD', "תיבה EFGHE'F'G'H'", 'גובה הפירמידה']);
    expect(st.lastError, 'two solids — no honest apex/base').not.toBeNull();
  });
});

describe('#579 (ADR-3D-146) — the NAMED new foot: «SO גובה הפירמידה» creates O', () => {
  // The class: a ⟂-to-plane statement naming its segment where exactly ONE endpoint is a
  // not-yet-defined label uniquely determines the foot — creation, not a reference error.
  it.each([
    ['the operator utterance', 'SO גובה הפירמידה'],
    ['bare אנך', 'SO אנך'],
    ['מאונך לבסיס', 'SO מאונך לבסיס'],
    ['מאונך למישור, 4-point run', 'SO מאונך למישור ABCD'],
    ['English', 'SO is the height of the pyramid'],
    ['reversed letters — ⟂ is symmetric', 'OS גובה הפירמידה'],
  ])('%s: «%s»', (_label, line) => {
    const { st, pos, c } = build(['פירמידה ABCDS שבסיסה ריבוע', line]);
    expect(st.lastError, `«${line}» must build`).toBeNull();
    expect(pos.has('O'), "the student's letter O exists").toBe(true);
    expect(pos.has('E'), 'no auto-minted E rides along').toBe(false);
    expect(c.points.get('O'), 'O is the height foot from S').toMatchObject({ kind: 'foot-face', from: 'S' });
    isHeightOnto(pos, 'S', 'O', ['A', 'B', 'C']);
    expect(
      c.segments.some(([a, b]) => (a === 'S' && b === 'O') || (a === 'O' && b === 'S')),
      'SO is drawn'
    ).toBe(true);
  });

  it('the apex-less mint is unchanged — bare «גובה הפירמידה» still mints E', () => {
    const { st, pos } = build(['פירמידה ABCDS שבסיסה ריבוע', 'גובה הפירמידה']);
    expect(st.lastError).toBeNull();
    expect(autoFoot(pos, ['A', 'B', 'C', 'D', 'S'])).toBe('E');
  });

  it('refusal preserved: BOTH letters unknown determines nothing', () => {
    const { st } = build(['פירמידה ABCDS שבסיסה ריבוע', 'XY גובה הפירמידה']);
    expect(st.lastError, 'two unknown letters must refuse').not.toBeNull();
  });

  it('refusal preserved: ∥ with a new letter does not invent a point', () => {
    const { st } = build(['פירמידה ABCDS שבסיסה ריבוע', 'SQ מקביל לבסיס']);
    expect(st.lastError, 'a whole plane of points satisfies ∥ — no unique Q').not.toBeNull();
  });

  it('both-exist keeps its existing routing — nothing minted, nothing re-created', () => {
    const { st, pos } = build(['פירמידה ABCDS שבסיסה ריבוע', 'SA גובה הפירמידה']);
    expect(st.lastError).toBeNull();
    expect([...pos.keys()].sort()).toEqual(['A', 'B', 'C', 'D', 'S']);
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
