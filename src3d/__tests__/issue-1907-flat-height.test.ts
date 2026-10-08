/**
 * #1907 (ADR-3D-315) — «משולש ABC · AD גובה» drew AD perpendicular to the TRIANGLE'S PLANE, green.
 *
 * The bare height sentence lowers to `seg-plane-rel` against the base sentinel (`plane: []`), which apply
 * resolved to the single "solid" — the flat triangle itself — so D was minted on the normal at A: off BC
 * and off the plane at every seed, a knee at A, and «D על BC · AD גובה» refused as a collapsed triangle.
 * A flat polygon has no base: its height is its ALTITUDE, read as 2-D reads it (measured at 5edeeca1):
 * the first letter is the apex, the foot drops on the opposite side (a trapezoid's parallel base, else
 * the first side of the ring not touching the apex), and every height sentence 2-D does not read goes
 * to the AI. Asserted on the DRAWING, through the real `decideSubmit3` seam at 24 starting seeds.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit3, derive3, type Fact3 } from '../store/store3';
import { isBareAltitude3, parse3 } from '../parser/parse3';
import { applyCommand3 } from '../engine/apply';
import { rightAngles3 } from '../render/rightAngles';
import type { Command3 } from '../engine/types';

type P = { x: number; y: number; z: number };
const sub = (a: P, b: P): P => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: P, b: P) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: P, b: P): P => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
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
 * The drawing: `foot` is on line side[0]side[1] and in the polygon's plane, apex→foot ⟂ the side, every row
 * green, and no knee stands against the polygon's plane. With `knee`, the right-angle knee sits AT the foot: a minted
 * foot is a constructed foot; a stated rider lowered to «AD ⟂ BC» meets BC at AD's END, which the segment-pair
 * knee does not mark (reported as found work, not this issue).
 */
function assertAltitude(lines: readonly string[], apex: string, foot: string, side: [string, string], knee = true) {
  for (const s0 of SEEDS) {
    const st = build(lines, s0);
    const d = derive3(st.facts, st.seed);
    expect(Object.values(d.status).every((x) => x === 'ok'), `seed ${s0}: ${JSON.stringify(d.status)}`).toBe(true);
    const at = (id: string) => d.positions.get(id) as P;
    const [A, B, C] = ['A', 'B', 'C'].map(at);
    const n = cross(sub(B, A), sub(C, A));
    const F = at(foot), X = at(apex), S0 = at(side[0]), S1 = at(side[1]);
    const scale = Math.max(norm(sub(B, A)), norm(sub(C, A)));
    expect(Math.abs(dot(sub(F, A), n)) / norm(n), `seed ${s0}: ${foot} off the polygon's plane`).toBeLessThan(1e-6 * scale);
    const e = sub(S1, S0);
    const t = dot(sub(F, S0), e) / dot(e, e);
    const onLine = norm(sub(F, { x: S0.x + t * e.x, y: S0.y + t * e.y, z: S0.z + t * e.z }));
    expect(onLine, `seed ${s0}: ${foot} off line ${side.join('')}`).toBeLessThan(1e-6 * scale);
    const h = sub(F, X);
    expect(norm(h), `seed ${s0}: a zero altitude`).toBeGreaterThan(1e-6 * scale);
    expect(Math.abs(dot(h, e)) / (norm(h) * norm(e)), `seed ${s0}: ${apex}${foot} ⟂ ${side.join('')}`).toBeLessThan(1e-6);
    const knees = rightAngles3(d.construction, d.resolved, 1);
    if (knee) expect(knees.some((k) => norm(sub(k.vertex as P, F)) < 1e-6 * scale), `seed ${s0}: the knee at ${foot}`).toBe(true);
    expect(knees.some((k) => k.planeN !== undefined), `seed ${s0}: a knee against the polygon's plane`).toBe(false);
  }
}

describe('#1907 — a bare height on a triangle is its altitude (2-D’s reading)', () => {
  it('the operator’s exact sequence: «משולש ABC · AD גובה» drops D on BC, in the plane, knee at D', () => {
    assertAltitude(['משולש ABC', 'AD גובה'], 'A', 'D', ['B', 'C']);
  });

  it.each(['AD הוא גובה', 'AD is the altitude', 'AD is the height'])('«%s» is the same altitude', (line) => {
    assertAltitude(['משולש ABC', line], 'A', 'D', ['B', 'C']);
  });

  it('«BE גובה» drops E on CA, «CF גובה» F on AB — the side opposite the apex', () => {
    assertAltitude(['משולש ABC', 'BE גובה'], 'B', 'E', ['C', 'A']);
    assertAltitude(['משולש ABC', 'CF גובה'], 'C', 'F', ['A', 'B']);
  });

  it('«D על BC · AD גובה» records — D, already on BC, IS the foot (was refused as a flat triangle)', () => {
    assertAltitude(['משולש ABC', 'D על BC', 'AD גובה'], 'A', 'D', ['B', 'C'], false);
  });

  it('the control «AD גובה לצלע BC» is unchanged', () => {
    assertAltitude(['משולש ABC', 'AD גובה לצלע BC'], 'A', 'D', ['B', 'C']);
  });
});

describe('#1907 — on a quadrilateral, the side 2-D picks', () => {
  it('a trapezoid’s height from A drops on its parallel base CD', () => {
    assertAltitude(['טרפז ABCD', 'AE גובה'], 'A', 'E', ['C', 'D']);
  });
  it.each(['מקבילית ABCD', 'מרובע ABCD', 'מלבן ABCD'])('«%s · AE גובה» drops E on BC', (quad) => {
    assertAltitude([quad, 'AE גובה'], 'A', 'E', ['B', 'C']);
  });
});

describe('#1907 — what 2-D does not read on a flat figure goes to the AI', () => {
  it.each([
    [['משולש ABC', 'AD אנך']],
    [['משולש ABC', 'AD גובה ואורכו 4']],
    [['משולש ABC', 'M אמצע BC', 'MD גובה']],
    [['משולש ABC', 'AD ניצב לבסיס']],
  ])('%j → not-understood', (lines) => {
    expect(lastVerdict(lines).kind).toBe('not-understood');
  });

  it('the reducer never draws a sentinel ⟂ the polygon: an unread one refuses (the AI lane cannot smuggle it in)', () => {
    const st = build(['משולש ABC', 'M אמצע BC'], 0);
    const c = derive3(st.facts, st.seed).construction;
    const cmd: Command3 = { type: 'seg-plane-rel', rel: 'perp', a: 'M', b: 'D', plane: [] };
    expect(applyCommand3(c, cmd)).toEqual({ ok: false, error: { code: 'unknown-plane', id: 'base' } });
  });

  it('the bare-altitude reader is context-free and reads the noun, the solid and the value', () => {
    for (const s of ['AD גובה', 'AD הוא גובה', 'AD is the altitude', 'AD is the height']) expect(isBareAltitude3(s), s).toBe(true);
    for (const s of ['AD אנך', 'AD גובה ואורכו 4', 'SO גובה הפירמידה', 'גובה הפירמידה SO = 4', 'AD is the height of the pyramid', 'AD ניצב לבסיס'])
      expect(isBareAltitude3(s), s).toBe(false);
  });

  it('the parse is unchanged — the reading happens at apply, so saved figures do not drift', () => {
    expect(parse3('AD גובה')).toEqual({ ok: true, commands: [{ type: 'seg-plane-rel', rel: 'perp', a: 'A', b: 'D', plane: [] }] });
    expect(parse3('SO גובה הפירמידה = 4')).toEqual({
      ok: true,
      commands: [
        { type: 'seg-plane-rel', rel: 'perp', a: 'S', b: 'O', plane: [] },
        { type: 'claim', claim: { type: 'length-eq', a: 'S', b: 'O', value: 4 } },
      ],
    });
  });
});

describe('#1907 — a solid’s height is unchanged', () => {
  it('«פירמידה SABC · SO גובה הפירמידה»: O in the base ABC, SO ⟂ the base', () => {
    for (const s0 of [0, 1, 2]) {
      const st = build(['פירמידה SABC', 'SO גובה הפירמידה'], s0);
      const d = derive3(st.facts, st.seed);
      expect(Object.values(d.status).every((x) => x === 'ok')).toBe(true);
      const at = (id: string) => d.positions.get(id) as P;
      const [A, B, C, S, O] = ['A', 'B', 'C', 'S', 'O'].map(at);
      const n = cross(sub(B, A), sub(C, A));
      expect(Math.abs(dot(sub(O, A), n)) / norm(n)).toBeLessThan(1e-6);
      const h = sub(S, O);
      expect(norm(cross(h, n)) / (norm(h) * norm(n))).toBeLessThan(1e-6);
    }
  });
});
