/**
 * #271: an angle EQUALITY `∠SAB = ∠SAD` must be statable (it was `not-handled`), lowering to the
 * engine's `cos-eq` relation (drives a free-dim solid, verifies a determined one). The chained
 * `∠SAB = ∠SAD = α` and the solo-label form `∠SAB = α` … `∠SBC = α` assert the SAME equality via
 * the shared label — never two cosmetic stickers the figure contradicts (the silent-drop cardinal sin).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { derive3, useGeo3 } from '../store/store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();

/** The angle at `vertex` between arms vertex→x and vertex→y, in degrees, at a given seed. */
function angleAt(vertex: string, x: string, y: string, seed: number): number {
  const pos = derive3(state().facts, seed).positions;
  const V = pos.get(vertex)!;
  const ax = { x: pos.get(x)!.x - V.x, y: pos.get(x)!.y - V.y, z: pos.get(x)!.z - V.z };
  const ay = { x: pos.get(y)!.x - V.x, y: pos.get(y)!.y - V.y, z: pos.get(y)!.z - V.z };
  const dot = ax.x * ay.x + ax.y * ay.y + ax.z * ay.z;
  const na = Math.hypot(ax.x, ax.y, ax.z);
  const nb = Math.hypot(ay.x, ay.y, ay.z);
  return (Math.acos(Math.max(-1, Math.min(1, dot / (na * nb)))) * 180) / Math.PI;
}

describe('#271 — parse: `∠PQR = ∠XYZ` lowers to angles-equal (or shared-label marks)', () => {
  it('symbol form (no label) → angles-equal over the four arm atoms', () => {
    expect(parse3('∠SAB = ∠SAD')).toEqual({
      ok: true,
      commands: [
        {
          type: 'angles-equal',
          a: { kind: 'pair', from: 'A', to: 'S' },
          b: { kind: 'pair', from: 'A', to: 'B' },
          c: { kind: 'pair', from: 'A', to: 'S' },
          d: { kind: 'pair', from: 'A', to: 'D' },
        },
      ],
    });
  });

  for (const u of ['זווית SAB = זווית SAD', 'angle SAB = angle SAD', 'הזווית SAB שווה לזווית SAD', 'angle SAB equals angle SAD']) {
    it(`"${u}" parses to angles-equal`, () => {
      const r = parse3(u);
      expect(r.ok).toBe(true);
      expect(r.ok && r.commands[0].type).toBe('angles-equal');
    });
  }

  it('the general non-shared-vertex form `∠ABC = ∠SAD` is four free atoms', () => {
    expect(parse3('∠ABC = ∠SAD')).toEqual({
      ok: true,
      commands: [
        {
          type: 'angles-equal',
          a: { kind: 'pair', from: 'B', to: 'A' },
          b: { kind: 'pair', from: 'B', to: 'C' },
          c: { kind: 'pair', from: 'A', to: 'S' },
          d: { kind: 'pair', from: 'A', to: 'D' },
        },
      ],
    });
  });

  it('the chained `∠SAB = ∠SAD = α` draws both angle marks with the shared label', () => {
    expect(parse3('∠SAB = ∠SAD = α')).toEqual({
      ok: true,
      commands: [
        { type: 'angle-mark', vertex: 'A', p: 'S', q: 'B', label: 'α' },
        { type: 'angle-mark', vertex: 'A', p: 'S', q: 'D', label: 'α' },
      ],
    });
  });

  it('the existing `AS יוצר זוויות שוות עם AB ו-AD` form is unchanged (angle-eq)', () => {
    const r = parse3('AS יוצר זוויות שוות עם AB ו-AD');
    expect(r.ok).toBe(true);
    expect(r.ok && r.commands[0].type).toBe('angle-eq');
  });
});

describe('#271 — the equality drives a free-dim pyramid so the angles hold', () => {
  beforeEach(reset);

  it('pyramidPar + ∠SAB = ∠SAD ⇒ the two angles are equal in every sampled seed', () => {
    submit('פירמידה שבסיסה מקבילית'); // A,B,C,D base + free apex S
    submit('∠SAB = ∠SAD');
    expect(state().lastError).toBeNull();
    for (let seed = 0; seed < 5; seed++) {
      expect(angleAt('A', 'S', 'B', seed)).toBeCloseTo(angleAt('A', 'S', 'D', seed), 4);
    }
  });

  it('the solo-label form `∠SAB = α` then `∠SAD = α` asserts the SAME equality', () => {
    submit('פירמידה שבסיסה מקבילית');
    submit('∠SAB = α');
    submit('∠SAD = α');
    expect(state().lastError).toBeNull();
    for (let seed = 0; seed < 5; seed++) {
      expect(angleAt('A', 'S', 'B', seed)).toBeCloseTo(angleAt('A', 'S', 'D', seed), 4);
    }
  });
});
