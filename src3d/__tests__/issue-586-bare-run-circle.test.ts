/**
 * #586 — «מעגל חוסם את ABCD»: the inscription lane's polygon NOUN is OPTIONAL.
 *
 * Operator (playing round #582/#584, 2026-08-14), on the pyramid figure: *"we should have add the option
 * of writing «מעגל חוסם את ABCD» or something similar."* The capability was already there and correct —
 * «מעגל חוסם את ריבוע ABCD» built the circumcircle — so this is the #494/#513/#529 FRAMING class: one
 * rule spelling a single form of a subject students write several ways. `polygonCircle3` hard-required a
 * polygon noun before it would read the ring, and the ring is what actually identifies the polygon.
 *
 * The latent sibling fixed in the same pass: the rule's ARITY MAP knew only משולש/מרובע/מחומש, so a noun
 * it admitted but had not enumerated (ריבוע, מלבן, …) emitted the circle ALONE and refused
 * `unknown-point A` as an opening move — the #440 half-drop, re-opened on the nouns the map forgot. The
 * kind now comes from the RING'S LENGTH; the noun only has to AGREE with it.
 *
 * Asserted geometrically on the resolved figure (the #442 discipline), never by "a command was emitted".
 */
import { describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { cross3, dist3, norm3, sub3, type Vec3 } from '../engine/vec3';
import { parse3 } from '../parser/parse3';

function build(lines: string[], seed = 0) {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
  for (const l of lines) useGeo3.getState().submit(l);
  const st = useGeo3.getState();
  const d = derive3(st.facts, seed);
  return { st, d, circles: d.resolved?.circles3 ?? [], pos: d.positions };
}

const distTo = (p: Vec3, q: Vec3) => norm3(sub3(p, q));
/** Distance from a point to the infinite line through a,b — an incircle's tangency test (#442). */
const distToLine = (p: Vec3, a: Vec3, b: Vec3) => norm3(cross3(sub3(p, a), sub3(b, a))) / norm3(sub3(b, a));

/** Circum vs incircle is decided GEOMETRICALLY (#442), never by reading back the emitted command. */
type Circle = { center: Vec3; radius: number };
function expectCircum(k: Circle, pos: Map<string, Vec3>) {
  for (const id of ['A', 'B', 'C']) expect(distTo(pos.get(id)!, k.center)).toBeCloseTo(k.radius, 6);
}
function expectIncircle(k: Circle, pos: Map<string, Vec3>) {
  const [A, B, C] = ['A', 'B', 'C'].map((i) => pos.get(i)!);
  for (const [p, q] of [[A, B], [B, C], [C, A]] as [Vec3, Vec3][])
    expect(distToLine(k.center, p, q)).toBeCloseTo(k.radius, 6);
  for (const v of [A, B, C]) expect(distTo(v, k.center)).toBeGreaterThan(k.radius);
}
const cmdsOf = (u: string) => {
  const p = parse3(u);
  return p.ok ? p.commands : null;
};

const SEEDS = [0, 1, 2, 3];

describe('#586 — the bare RUN is a polygon (the operator utterance)', () => {
  it('«פירמידה ABCDS שבסיסה ריבוע» → «מעגל חוסם את ABCD» circumscribes the base ring', () => {
    for (const seed of SEEDS) {
      const { st, circles, pos } = build(['פירמידה ABCDS שבסיסה ריבוע', 'מעגל חוסם את ABCD'], seed);
      expect(st.lastError).toBeNull();
      expect(circles).toHaveLength(1);
      const k = circles[0];
      // every base vertex is ON the circle — a square base is cyclic, so this is exact
      for (const id of ['A', 'B', 'C', 'D']) expect(distTo(pos.get(id)!, k.center)).toBeCloseTo(k.radius, 6);
      // the apex is not: the statement is about the base ring only
      expect(Math.abs(distTo(pos.get('S')!, k.center) - k.radius)).toBeGreaterThan(1e-6);
    }
  });

  it('a bare-run TRIANGLE circumcircle, and its incircle twin', () => {
    const circum = build(['משולש ABC', 'מעגל חוסם את ABC']);
    expect(circum.st.lastError).toBeNull();
    expect(circum.circles).toHaveLength(1);
    expectCircum(circum.circles[0], circum.pos);

    const incirc = build(['משולש ABC', 'מעגל חסום ב-ABC']);
    expect(incirc.st.lastError).toBeNull();
    expect(incirc.circles).toHaveLength(1);
    expectIncircle(incirc.circles[0], incirc.pos);
  });

  it('the bare run lowers BYTE-IDENTICALLY to the noun form it abbreviates', () => {
    expect(cmdsOf('מעגל חוסם את ABC')).toEqual(cmdsOf('מעגל חוסם את משולש ABC'));
    expect(cmdsOf('מעגל חוסם את ABCD')).toEqual(cmdsOf('מעגל חוסם את מרובע ABCD'));
  });

  it('English mirrors', () => {
    const circum = build(['triangle ABC', 'a circle circumscribes ABC']);
    expect(circum.st.lastError).toBeNull();
    expect(circum.circles).toHaveLength(1);
    expectCircum(circum.circles[0], circum.pos);

    const incirc = build(['triangle ABC', 'a circle is inscribed in ABC']);
    expect(incirc.st.lastError).toBeNull();
    expect(incirc.circles).toHaveLength(1);
    expectIncircle(incirc.circles[0], incirc.pos);
  });
});

describe('#586 — the arity-map half-drop', () => {
  it('an OPENING-move inscription declares the ring it names (was: unknown-point A)', () => {
    // `מרובע` is generic — nothing to lower, so the whole statement lands in one move
    const { st, circles, d } = build(['מעגל חוסם את מרובע ABCD']);
    expect(st.lastError).toBeNull();
    expect(circles).toHaveLength(1);
    expect(d.construction.solids.map((s: { kind: string }) => s.kind)).toEqual(['polygon4']);
  });

  it('a run the stated noun CONTRADICTS is refused, never half-built', () => {
    // «משולש» over a 4-run: the student wrote two incompatible things, and guessing which half to
    // believe is exactly the silent-wrong-build class. Refusing names the conflict.
    expect(parse3('מעגל חוסם את משולש ABCD').ok).toBe(false);
  });
});

describe('#587 — a stated quad shape LOWERS (ADR-3D-152 supersedes ADR-3D-149\'s interim refusal)', () => {
  // ADR-3D-149 closed the silent-drop half by REFUSING these two utterances: a stated quad noun the
  // flat lane could not lower had to name itself rather than commit a green arbitrary quadrilateral.
  // That was explicitly the interim («the honest interim is nothing special — the forms stay refusals»).
  // ADR-3D-152 built the lowering the refusal was standing in for, so the honest answer is now the
  // FIGURE: what must never happen — a green ✓ on a quadrilateral that is not the stated shape — is
  // asserted here as geometry, which is the stronger form of the same lock.
  it('«המרובע ABCD הוא ריבוע» builds a TRUE square — never a green arbitrary quad', () => {
    const { st, d } = build(['המרובע ABCD הוא ריבוע']);
    expect(st.lastError).toBeNull();
    expect(d.construction.solids.map((s: { kind: string }) => s.kind)).toEqual(['polygon4']);
    const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((p) => d.positions.get(p)!);
    const sides = [dist3(A, B), dist3(B, C), dist3(C, D), dist3(D, A)];
    expect(sides[0]).toBeGreaterThan(1e-6);
    sides.forEach((x) => expect(x).toBeCloseTo(sides[0], 5));
  });

  it('the same holds for the inscription lane — the quad noun rides in and lowers', () => {
    const { st, d } = build(['מעגל חוסם את ריבוע ABCD']);
    expect(st.lastError).toBeNull();
    const [A, B, C] = ['A', 'B', 'C'].map((p) => d.positions.get(p)!);
    expect(dist3(A, B)).toBeCloseTo(dist3(B, C), 5);
  });

  it('a GENERIC quad noun still builds — the gate watches defining properties, not nouns', () => {
    const { st, d } = build(['מרובע ABCD']);
    expect(st.lastError).toBeNull();
    expect(d.construction.solids.map((s: { kind: string }) => s.kind)).toEqual(['polygon4']);
  });

  it('the TRIANGLE lane is untouched — its qualifiers lower, so they never trip the gate', () => {
    const { st } = build(['ABC משולש שווה צלעות']);
    expect(st.lastError).toBeNull();
  });
});
