/**
 * #1944 (ADR-3D-321) — «משולש ABC · מ-A מורידים אנך לבסיס» minted the foot EXACTLY ON A.
 *
 * `perp-to-base` resolved "the base" to the single solid's first three ids without asking whether that
 * solid is a FLAT polygon — the host's own plane. The foot of the perpendicular from a ring vertex onto
 * its own plane is that vertex, so E landed on A (measured at `24d49167`: |EA| = 0.00000000 exactly, at
 * seed 0, for the triangle, the trapezoid, the parallelogram, the rectangle, the square, the general
 * quad and the pentagon), a zero-length altitude was drawn GREEN with two labels on one dot, and a
 * stated «אורך AE = 3» was then refused `givens-contradict`.
 *
 * ADR-3D-315's rule one lane further: a flat polygon has no base, so the sentence means what 2-D reads
 * (measured at `24d49167`: `[foot, segment]` onto the side opposite the apex) — the altitude, off the
 * side `flatBaseSide3` picks, the ONE resolution this lane now shares with the sentinel height.
 * Asserted on the DRAWING, through the real `decideSubmit3` seam at 24 starting seeds.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit3, derive3, type Fact3 } from '../store/store3';
import { parse3 } from '../parser/parse3';

type P = { x: number; y: number; z: number };
const sub = (a: P, b: P): P => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: P, b: P) => a.x * b.x + a.y * b.y + a.z * b.z;
const norm = (a: P) => Math.hypot(a.x, a.y, a.z);

const SEEDS = Array.from({ length: 24 }, (_, i) => i);

/** Submit the lines in order through the store's own decision; every line must record. */
function build(lines: readonly string[], seed: number): { facts: Fact3[]; seed: number } {
  let st: { facts: Fact3[]; seed: number } = { facts: [], seed };
  for (const line of lines) {
    const v = decideSubmit3(st, line);
    expect(v.kind, `«${line}» at seed ${seed}: ${JSON.stringify(v)}`).toBe('record');
    if (v.kind === 'record') st = { facts: v.facts, seed: v.seed };
  }
  return st;
}

/** The last line's verdict, after the prefix recorded. */
function lastVerdict(lines: readonly string[], seed = 0) {
  const st = build(lines.slice(0, -1), seed);
  return decideSubmit3(st, lines[lines.length - 1]);
}

/**
 * The drawing: the auto-minted `foot` is ON the segment side[0]side[1], apex→foot ⟂ that side, the foot is
 * DISTINCT from the apex (the whole defect), the figure is flat, and every row is green.
 */
function assertDroppedAltitude(lines: readonly string[], apex: string, foot: string, side: [string, string]) {
  for (const s0 of SEEDS) {
    const st = build(lines, s0);
    const d = derive3(st.facts, st.seed);
    expect(Object.values(d.status).every((x) => x === 'ok'), `seed ${s0}: ${JSON.stringify(d.status)}`).toBe(true);
    const at = (id: string) => d.positions.get(id) as P;
    const F = at(foot), X = at(apex), S0 = at(side[0]), S1 = at(side[1]);
    const scale = Math.max(norm(sub(S1, S0)), norm(sub(X, S0)));
    // the foot lies on the line of the opposite SIDE…
    const e = sub(S1, S0);
    const t = dot(sub(F, S0), e) / dot(e, e);
    const onLine = norm(sub(F, { x: S0.x + t * e.x, y: S0.y + t * e.y, z: S0.z + t * e.z }));
    expect(onLine, `seed ${s0}: ${foot} off line ${side.join('')}`).toBeLessThan(1e-6 * scale);
    // …and is NOT the apex: a zero-length altitude is never drawn (the reported defect)
    const h = sub(F, X);
    expect(norm(h), `seed ${s0}: ${apex}${foot} is a zero-length altitude`).toBeGreaterThan(1e-6 * scale);
    expect(Math.abs(dot(h, e)) / (norm(h) * norm(e)), `seed ${s0}: ${apex}${foot} ⟂ ${side.join('')}`).toBeLessThan(1e-6);
    // the altitude stays IN the polygon's plane — never a perpendicular to it (ADR-3D-315's invariant)
    const ring = lines[0].match(/[A-Z]/g) as string[];
    const n = cross(sub(at(ring[1]), at(ring[0])), sub(at(ring[2]), at(ring[0])));
    expect(Math.abs(dot(sub(F, at(ring[0])), n)) / norm(n), `seed ${s0}: ${foot} off the polygon's plane`).toBeLessThan(1e-6 * scale);
  }
}
const cross = (a: P, b: P): P => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

describe('#1944 — «מ-A מורידים אנך לבסיס» on a flat polygon drops the altitude 2-D draws', () => {
  it('the operator’s exact sequence: on a triangle the foot lands on BC, distinct from A', () => {
    assertDroppedAltitude(['משולש ABC', 'מ-A מורידים אנך לבסיס'], 'A', 'E', ['B', 'C']);
  });

  it.each(['אנך יורד מ-A לבסיס', 'אנך יורד מAלבסיס', 'מ-A הורידו אנך לבסיס', 'drop a perpendicular from A to the base', 'גובה מנקודה A לבסיס'])(
    '«%s» is the same altitude — the whole spelling family',
    (line) => {
      assertDroppedAltitude(['משולש ABC', line], 'A', 'E', ['B', 'C']);
    },
  );

  it('the apex chooses the side: «מ-B …» drops on CA, «מ-C …» on AB (2-D’s rule)', () => {
    assertDroppedAltitude(['משולש ABC', 'מ-B מורידים אנך לבסיס'], 'B', 'E', ['C', 'A']);
    assertDroppedAltitude(['משולש ABC', 'מ-C מורידים אנך לבסיס'], 'C', 'E', ['A', 'B']);
  });

  it('a trapezoid drops on its PARALLEL base DC, not on the first side of the ring', () => {
    assertDroppedAltitude(['טרפז ABCD', 'מ-A מורידים אנך לבסיס'], 'A', 'E', ['D', 'C']);
    assertDroppedAltitude(['טרפז ABCD', 'מ-B מורידים אנך לבסיס'], 'B', 'E', ['D', 'C']);
  });

  it.each(['מקבילית ABCD', 'מרובע ABCD', 'מלבן ABCD', 'ריבוע ABCD'])('«%s · מ-A מורידים אנך לבסיס» drops E on BC', (quad) => {
    assertDroppedAltitude([quad, 'מ-A מורידים אנך לבסיס'], 'A', 'E', ['B', 'C']);
  });

  it('a PENTAGON host: the ring’s letters are taken, so the foot is F — on BC', () => {
    assertDroppedAltitude(['מחומש ABCDE', 'מ-A מורידים אנך לבסיס'], 'A', 'F', ['B', 'C']);
  });

  it('a STATED base that names the flat host’s own plane is the same altitude, not a ⟂ to it', () => {
    assertDroppedAltitude(['משולש ABC', 'גובה מנקודה A לבסיס ABC'], 'A', 'E', ['B', 'C']);
  });

  it('the altitude can carry a LENGTH — the zero-length foot made every such given a contradiction', () => {
    for (const lines of [
      ['משולש ABC', 'מ-A מורידים אנך לבסיס', 'אורך AE = 3'],
      ['טרפז ABCD', 'מ-A מורידים אנך לבסיס', 'אורך AE = 3'],
      ['משולש ABC', 'גובה מנקודה A לבסיס 4'],
    ]) {
      const st = build(lines, 0);
      const d = derive3(st.facts, st.seed);
      expect(Object.values(d.status).every((x) => x === 'ok'), `${JSON.stringify(lines)}: ${JSON.stringify(d.status)}`).toBe(true);
      const A = d.positions.get('A') as P, E = d.positions.get('E') as P;
      expect(norm(sub(E, A))).toBeCloseTo(lines.length === 3 ? 3 : 4, 6);
    }
  });

  it('the parse is unchanged — the reading happens at apply, so saved figures do not drift', () => {
    expect(parse3('מ-A מורידים אנך לבסיס')).toEqual({ ok: true, commands: [{ type: 'perp-to-base', from: 'A' }] });
    expect(parse3('גובה מנקודה A לבסיס ABC')).toEqual({ ok: true, commands: [{ type: 'perp-to-base', from: 'A', face: ['A', 'B', 'C'] }] });
  });
});

describe('#1944 — what the flat host names no base for stays an honest refusal', () => {
  // 2-D measured at 24d49167: «מ-D מורידים אנך לבסיס» is `not-handled` for a D that is not a vertex of
  // the polygon, whether it is a free point or a rider on a side — there is no side opposite it. The
  // reducer refuses rather than invent one, and never draws the ⟂ to the polygon's plane instead.
  it.each([
    [['משולש ABC', 'D(2,2,5)', 'מ-D מורידים אנך לבסיס']],
    [['משולש ABC', 'D על BC', 'מ-D מורידים אנך לבסיס']],
    [['משולש ABC', 'D אמצע BC', 'מ-D מורידים אנך לבסיס']],
  ])('%j → refused, not a perpendicular to the polygon', (lines) => {
    expect(lastVerdict(lines)).toEqual({ kind: 'refused', error: { code: 'unknown-plane', id: 'base' } });
  });

  it('a label that does not exist still refuses by its own name', () => {
    expect(lastVerdict(['משולש ABC', 'מ-D מורידים אנך לבסיס'])).toEqual({ kind: 'refused', error: { code: 'unknown-point', id: 'D' } });
  });

  it('the apex-less «הגובה הוא 4» on a flat polygon keeps refusing — it derives no apex (ADR-3D-142)', () => {
    const v = lastVerdict(['משולש ABC', 'הגובה הוא 4']);
    expect(v.kind).not.toBe('record');
  });
});

describe('#1944 — the ∥ form stays refused in 3-D, because 2-D refuses it too', () => {
  // Measured at 24d49167 by the /decisions pass: every spelling is `not-understood` in 3-D and
  // `not-handled` in 2-D. Parity already holds; this pins it so it cannot silently drift into a
  // reading one builder has and the other does not (CLAUDE.md "one sentence, one verdict").
  it.each(['מ-A מקביל לבסיס', 'מ-A מעבירים ישר מקביל לבסיס', 'דרך A מקביל לבסיס', 'מ-A מעבירים מקביל לבסיס'])(
    '«%s» → not-understood (the AI lane, as in 2-D)',
    (line) => {
      expect(lastVerdict(['משולש ABC', line])).toEqual({ kind: 'not-understood' });
    },
  );
});

describe('#1944 — a SOLID’s base is untouched', () => {
  it('«פירמידה SABC · מ-S מורידים אנך לבסיס»: E in the base plane ABC, SE ⟂ it, non-zero', () => {
    for (const s0 of [0, 1, 2]) {
      const st = build(['פירמידה SABC', 'מ-S מורידים אנך לבסיס'], s0);
      const d = derive3(st.facts, st.seed);
      expect(Object.values(d.status).every((x) => x === 'ok')).toBe(true);
      expect(d.construction.points.get('E')).toEqual({ kind: 'foot-face', from: 'S', face: ['A', 'B', 'C'] });
      const at = (id: string) => d.positions.get(id) as P;
      const [A, B, C, S, E] = ['A', 'B', 'C', 'S', 'E'].map(at);
      const n = cross(sub(B, A), sub(C, A));
      expect(Math.abs(dot(sub(E, A), n)) / norm(n)).toBeLessThan(1e-6);
      expect(norm(sub(E, S))).toBeGreaterThan(1e-6);
    }
  });

  it("«תיבה ABCDA'B'C'D' · מ-A' מורידים אנך לבסיס» still drops onto the base face", () => {
    const st = build(["תיבה ABCDA'B'C'D'", "מ-A' מורידים אנך לבסיס"], 0);
    const d = derive3(st.facts, st.seed);
    expect(Object.values(d.status).every((x) => x === 'ok')).toBe(true);
    expect(d.construction.points.get('E')).toEqual({ kind: 'foot-face', from: "A'", face: ['A', 'B', 'C'] });
  });
});
