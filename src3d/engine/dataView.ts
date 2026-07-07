/**
 * The "organize your data" panel (operator, 2026-07-07): derived presentations of
 * the figure's vectors and points, the way a student should lay them out on paper —
 * a basis decomposition (EN⃗ = 1/4·u − 3/4·w), coordinates when a frame exists
 * (EN⃗ = (−3, 6, 3)), stated magnitudes with their squares (|v| = 2, v² = 4). When
 * more than one presentation exists, ALL are shown.
 *
 * Honesty gate (the multi-sample discipline): every displayed value is computed at
 * THREE seeds and shown only when it agrees across them — an under-determined
 * quantity (which varies with the sample) never masquerades as data (ADR-052).
 *
 * This deliberately leans toward showing DERIVED results (the operator's call,
 * overriding the reproduce-don't-solve default for data-organization pedagogy) —
 * which is why the App gates it behind an explicit student checkbox.
 */

import { resolve3 } from './evaluate';
import { sub3, type Vec3 } from './vec3';
import type { Construction3, Id } from './types';

export interface VecEntry {
  /** Display label, e.g. `EN` or a declared name like `w`. */
  label: string;
  /** `1/4·u − 3/4·w` — decomposition in the declared basis (needs 3 named vectors). */
  decomp: string | null;
  /** `(−3, 6, 3)` — the coordinate form, when the figure carries an absolute frame. */
  coords: string | null;
  /** `|w| = 2` — a STATED magnitude (never a sampled one). */
  mag: string | null;
  /** `w² = 4` — the square that rides every stated magnitude. */
  sq: string | null;
}

export interface DataPanel {
  vectors: VecEntry[];
  points: string[]; // `N(6, 6, 6)` — stable coordinates only
}

const EPS = 1e-6;

/** Render a number cleanly: integers plain, small fractions as p/q, else 2 decimals. */
export function cleanNum(x: number): string {
  // tolerances sized for the pivot's numeric floor (~1e-7), far under display grain
  if (Math.abs(x - Math.round(x)) < 1e-6) return String(Math.round(x));
  for (let q = 2; q <= 24; q++) {
    const p = x * q;
    if (Math.abs(p - Math.round(p)) < 1e-5 && Math.abs(Math.round(p)) <= 400) return `${Math.round(p)}/${q}`;
  }
  return x.toFixed(2);
}

const coordStr = (v: Vec3): string => `(${cleanNum(v.x)}, ${cleanNum(v.y)}, ${cleanNum(v.z)})`;

/** Solve M·x = t for 3×3 M given by columns u,v,w; null when singular. */
function solve3x3(u: Vec3, v: Vec3, w: Vec3, t: Vec3): [number, number, number] | null {
  const M = [
    [u.x, v.x, w.x, t.x],
    [u.y, v.y, w.y, t.y],
    [u.z, v.z, w.z, t.z],
  ];
  for (let col = 0; col < 3; col++) {
    let piv = col;
    for (let r = col + 1; r < 3; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-10) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = col + 1; r < 3; r++) {
      const f = M[r][col] / M[col][col];
      for (let k = col; k < 4; k++) M[r][k] -= f * M[col][k];
    }
  }
  const x: number[] = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    let s = M[i][3];
    for (let k = i + 1; k < 3; k++) s -= M[i][k] * x[k];
    x[i] = s / M[i][i];
  }
  return x as [number, number, number];
}

function decompStr(coefs: [number, number, number], names: string[]): string {
  const parts: string[] = [];
  coefs.forEach((cf, i) => {
    if (Math.abs(cf) < 1e-9) return;
    const mag = Math.abs(cf);
    const term = Math.abs(mag - 1) < 1e-9 ? names[i] : `${cleanNum(mag)}·${names[i]}`;
    parts.push(parts.length === 0 ? (cf < 0 ? `−${term}` : term) : cf < 0 ? `− ${term}` : `+ ${term}`);
  });
  return parts.length ? parts.join(' ') : '0';
}

const near = (a: number, b: number) => Math.abs(a - b) < EPS;
const sameVec = (a: Vec3, b: Vec3) => near(a.x, b.x) && near(a.y, b.y) && near(a.z, b.z);

/** Stated magnitudes: |pair| = value, from driving pins and recorded claims. */
function statedLengths(c: Construction3): Map<string, number> {
  const out = new Map<string, number>();
  const key = (a: Id, b: Id) => [a, b].sort().join('|');
  for (const pin of c.scalarPins) if (pin.kind === 'length') out.set(key(pin.a, pin.b), pin.value);
  for (const cl of c.claims) if (cl.type === 'length-eq') out.set(key(cl.a, cl.b), cl.value);
  return out;
}

export function dataView(c: Construction3, seed: number): DataPanel {
  const seeds = [seed, seed + 1013, seed + 2027];
  const resolved = seeds.map((s) => resolve3(c, s));
  const positions = resolved.map((r) => r.positions);
  const at = (i: number, id: Id): Vec3 | undefined => positions[i].get(id);
  const stablePair = (a: Id, b: Id): Vec3 | null => {
    const ds = positions.map((pos) => {
      const p = pos.get(a);
      const q = pos.get(b);
      return p && q ? sub3(q, p) : null;
    });
    if (ds.some((d) => !d)) return null;
    return sameVec(ds[0]!, ds[1]!) && sameVec(ds[0]!, ds[2]!) ? ds[0]! : null;
  };

  // an absolute frame exists only when something was injected — otherwise every
  // coordinate is gauge, and gauge must never print as data
  const hasFrame = c.pins.length > 0 || c.vectorPins.length > 0 || c.pairPins.length > 0;

  const vecNames = [...c.vectors.entries()];
  const basis = vecNames.slice(0, 3);
  // the basis is usable per-seed even when not world-stable: decompose per seed and
  // require the COEFFICIENTS to agree (affine relations are frame-invariant)
  const decompose = (a: Id, b: Id): [number, number, number] | null => {
    if (basis.length < 3) return null;
    const per: ([number, number, number] | null)[] = positions.map((pos, i) => {
      const p = pos.get(a);
      const q = pos.get(b);
      const dirs = basis.map(([, d]) => {
        const f = at(i, d.from);
        const t = at(i, d.to);
        return f && t ? sub3(t, f) : null;
      });
      if (!p || !q || dirs.some((x) => !x)) return null;
      return solve3x3(dirs[0]!, dirs[1]!, dirs[2]!, sub3(q, p));
    });
    if (per.some((x) => !x)) return null;
    const [c0, c1, c2] = per as [number, number, number][];
    const agree = (u: number[], v: number[]) => u.every((x, i) => near(x, v[i]));
    return agree(c0, c1) && agree(c0, c2) ? c0 : null;
  };

  const lengths = statedLengths(c);
  const pairKey = (a: Id, b: Id) => [a, b].sort().join('|');
  const entries: VecEntry[] = [];
  const seen = new Set<string>();
  const basisNames = basis.map(([n]) => n);

  const addEntry = (label: string, a: Id, b: Id, isBasisVec: boolean) => {
    const k = pairKey(a, b);
    if (seen.has(k)) return;
    seen.add(k);
    const coefs = isBasisVec ? null : decompose(a, b);
    const d = stablePair(a, b);
    const stated = lengths.get(k);
    const entry: VecEntry = {
      label,
      decomp: coefs ? decompStr(coefs, basisNames) : null,
      coords: hasFrame && d ? coordStr(d) : null,
      mag: stated !== undefined ? `|${label}| = ${cleanNum(stated)}` : null,
      sq: stated !== undefined ? `${label}² = ${cleanNum(stated * stated)}` : null,
    };
    if (entry.decomp || entry.coords || entry.mag) entries.push(entry);
  };

  // declared vectors first (coords + stated magnitude), then auxiliary segments (decomp + coords)
  for (const [name, d] of vecNames) addEntry(name, d.from, d.to, true);
  for (const [a, b] of c.segments) addEntry(`${a}${b}`, a, b, false);

  // points with STABLE coordinates (needs a frame; a pinned-only figure prints nothing sampled)
  const points: string[] = [];
  if (hasFrame) {
    for (const id of positions[0].keys()) {
      const ps = positions.map((pos) => pos.get(id));
      if (ps.some((p) => !p)) continue;
      if (sameVec(ps[0]!, ps[1]!) && sameVec(ps[0]!, ps[2]!)) points.push(`${id}${coordStr(ps[0]!)}`);
    }
  }
  return { vectors: entries, points };
}
