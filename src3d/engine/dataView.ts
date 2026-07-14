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
import { dot3, sub3, type Vec3 } from './vec3';
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
  /** Derived equalities among declared vectors, e.g. `|u| = |v| = |w|` (+ stated value). */
  relations: string[];
  vectors: VecEntry[];
  points: string[]; // `N(6, 6, 6)` — stable coordinates only
  /** Named planes whose equation is FORCED (identical up to scale in every sampled
   *  configuration): the standard form `ABB'A': 20x - y + 2z - 5 = 0` the exam asks
   *  for, plus a parametric form when the run's anchor/edges are stable (ADR-3D-032). */
  planes: string[];
  /** id → canvas coordinate label (when a frame exists), judged PER COMPONENT across
   *  every sampled configuration: 'fact' = fully determined; 'partial' = the known
   *  components print and the free ones read '?' (S(?, 0, ?) — its y IS knowledge
   *  while the base still tilts about AB). A point with NO stable component gets no
   *  label — a sample coordinate is not knowledge (operator rule, 2026-07-09). */
  pointCoords: Record<string, { text: string; kind: 'fact' | 'partial' }>;
}

const EPS = 1e-6;

/** Render a number cleanly: integers plain, small fractions as p/q, else 2 decimals. */
export function cleanNum(x: number, tol = 1e-5): string {
  // default tolerance sized for the pivot's numeric floor (~1e-7), far under display
  // grain; coefficients from a DOUBLE-ROOT solve carry the intrinsic √noise (~1e-4)
  // and pass tol = 2e-3 (cleanCoef) — claims still guard correctness at 2e-5
  if (Math.abs(x - Math.round(x)) < tol) return String(Math.round(x));
  for (let q = 2; q <= 24; q++) {
    const p = x * q;
    if (Math.abs(p - Math.round(p)) < tol && Math.abs(Math.round(p)) <= 400) return `${Math.round(p)}/${q}`;
  }
  return x.toFixed(2);
}

const cleanCoef = (x: number): string => cleanNum(x, 2e-3);

const coordStr = (v: Vec3): string => `(${cleanNum(v.x)}, ${cleanNum(v.y)}, ${cleanNum(v.z)})`;

/** Render a UNIT-normalized plane (lead coefficient positive) as `20x - y + 2z - 5 = 0`:
 *  find the smallest integer scaling (the book form); fall back to the 2-decimal unit form. */
export function planeEqStr(u: { x: number; y: number; z: number; d: number }): string {
  const vals = [u.x, u.y, u.z, u.d];
  const minAbs = Math.min(...vals.filter((v) => Math.abs(v) > 1e-6).map(Math.abs));
  let ints: number[] | null = null;
  for (let m = 1; m <= 60 && !ints; m++) {
    const scaled = vals.map((v) => (v * m) / minAbs);
    // tolerance sized for the pivot's numeric floor propagated through the normal
    if (scaled.every((v) => Math.abs(v - Math.round(v)) < 2e-3 * Math.max(1, Math.abs(v))) && scaled.every((v) => Math.abs(v) < 1000)) {
      ints = scaled.map(Math.round);
    }
  }
  const co = ints ?? vals;
  const num = (v: number) => (ints ? String(Math.abs(v)) : cleanNum(Math.abs(v)));
  const parts: string[] = [];
  (['x', 'y', 'z'] as const).forEach((ax, i) => {
    const v = co[i];
    if (Math.abs(v) < 1e-9) return;
    const coef = Math.abs(Math.abs(v) - 1) < 1e-9 ? '' : num(v);
    const term = `${coef}${ax}`;
    parts.push(parts.length === 0 ? (v < 0 ? `-${term}` : term) : `${v < 0 ? '-' : '+'} ${term}`);
  });
  if (Math.abs(co[3]) > 1e-9) parts.push(`${co[3] < 0 ? '-' : '+'} ${num(co[3])}`);
  return `${parts.join(' ')} = 0`;
}

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
    if (Math.abs(cf) < 1e-3) return;
    const mag = Math.abs(cf);
    const term = Math.abs(mag - 1) < 2e-3 ? names[i] : `${cleanCoef(mag)}·${names[i]}`;
    parts.push(parts.length === 0 ? (cf < 0 ? `−${term}` : term) : cf < 0 ? `− ${term}` : `+ ${term}`);
  });
  return parts.length ? parts.join(' ') : '0';
}

/** Render Σ(aᵢ + bᵢ·k)·nameᵢ — the exam's symbolic answer shape. */
function decompSymStr(a: [number, number, number], b: [number, number, number], names: string[], sym: string): string {
  const parts: string[] = [];
  for (let i = 0; i < 3; i++) {
    const ai = Math.abs(a[i]) < 1e-3 ? 0 : a[i];
    const bi = Math.abs(b[i]) < 1e-3 ? 0 : b[i];
    if (ai === 0 && bi === 0) continue;
    let coef: string;
    let neg = false;
    if (bi === 0) {
      neg = ai < 0;
      const m = Math.abs(ai);
      coef = Math.abs(m - 1) < 2e-3 ? '' : `${cleanCoef(m)}·`;
    } else if (ai === 0) {
      neg = bi < 0;
      const m = Math.abs(bi);
      coef = `${Math.abs(m - 1) < 2e-3 ? '' : cleanCoef(m) + '·'}${sym}·`;
    } else if (bi > 0) {
      const kPart = Math.abs(bi - 1) < 2e-3 ? sym : `${cleanCoef(bi)}·${sym}`;
      coef = `(${kPart} ${ai < 0 ? '−' : '+'} ${cleanCoef(Math.abs(ai))})·`;
    } else {
      const kPart = Math.abs(bi + 1) < 2e-3 ? sym : `${cleanCoef(-bi)}·${sym}`;
      coef = `(${cleanCoef(ai)} − ${kPart})·`;
    }
    const term = `${coef}${names[i]}`;
    parts.push(parts.length === 0 ? (neg ? `−${term}` : term) : neg ? `− ${term}` : `+ ${term}`);
  }
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
  const hasFrame = c.pins.length > 0 || c.vectorPins.length > 0 || c.pairPins.length > 0 || c.planePins.length > 0;

  const vecNames = [...c.vectors.entries()];
  const basis = vecNames.slice(0, 3);

  // ONE unpinned symbol (SN = k·SC before anything pins k): a k-dependent quantity is
  // not unstable noise — it is AFFINE in k. Decompose at k=0 and k=1 (a value-pin on a
  // cloned construction) and present the exam's symbolic form: (k − 3/4)·u + k·v + …
  const freeSyms = c.vecDefs.map((vd, i) => ({ vd, i })).filter(({ vd, i }) => vd.symbol && !c.symbolPins.some((p) => p.def === i));
  const freeSym = freeSyms.length === 1 ? freeSyms[0] : null;
  let posAtK: Map<number, typeof positions> | null = null;
  const positionsAtK = (kv: number) => {
    if (!posAtK) posAtK = new Map();
    if (!posAtK.has(kv)) {
      posAtK.set(
        kv,
        seeds.map((s) => resolve3({ ...c, symbolPins: [...c.symbolPins, { rel: 'value', value: kv, def: freeSym!.i }] }, s).positions),
      );
    }
    return posAtK.get(kv)!;
  };
  // the basis is usable per-seed even when not world-stable: decompose per seed and
  // require the COEFFICIENTS to agree (affine relations are frame-invariant)
  const decomposeIn = (posArr: typeof positions, a: Id, b: Id): [number, number, number] | null => {
    if (basis.length < 3) return null;
    const per: ([number, number, number] | null)[] = posArr.map((pos) => {
      const p = pos.get(a);
      const q = pos.get(b);
      const dirs = basis.map(([, d]) => {
        const f = pos.get(d.from);
        const t = pos.get(d.to);
        return f && t ? sub3(t, f) : null;
      });
      if (!p || !q || dirs.some((x) => !x)) return null;
      return solve3x3(dirs[0]!, dirs[1]!, dirs[2]!, sub3(q, p));
    });
    if (per.some((x) => !x)) return null;
    const [c0, c1, c2] = per as [number, number, number][];
    // agreement at the DOUBLE-ROOT precision class (k from a tangency is √noise-precise,
    // ~1e-4); the averaged coefficients then render through the matching cleanCoef
    const agree = (u: number[], v: number[]) => u.every((x, i) => Math.abs(x - v[i]) < 2e-3);
    if (!agree(c0, c1) || !agree(c0, c2)) return null;
    return c0.map((x, i) => (x + c1[i] + c2[i]) / 3) as [number, number, number];
  };
  const decompose = (a: Id, b: Id) => decomposeIn(positions, a, b);
  /** The affine-in-k form when the plain decomposition is k-dependent. */
  const decomposeSym = (a: Id, b: Id): string | null => {
    if (!freeSym) return null;
    const c0 = decomposeIn(positionsAtK(0), a, b);
    const c1 = decomposeIn(positionsAtK(1), a, b);
    if (!c0 || !c1) return null;
    const slope = c1.map((x, i) => x - c0[i]) as [number, number, number];
    if (slope.every((x) => Math.abs(x) < 1e-9)) return null; // not actually k-dependent
    return decompSymStr(c0, slope, basis.map(([n]) => n), freeSym.vd.symbol!);
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
    const symDecomp = !isBasisVec && !coefs ? decomposeSym(a, b) : null;
    const d = stablePair(a, b);
    // a magnitude is knowledge when STATED — or when the frame DERIVES it: identical
    // in every sampled configuration (the |u|=|v| class-value gate; operator 2026-07-09:
    // |BB'| = 18 is forced by the plane given + B, the student never has to type it)
    let mag = lengths.get(k);
    if (mag === undefined && hasFrame) {
      const per = positions.map((pos) => {
        const p = pos.get(a);
        const q = pos.get(b);
        return p && q ? Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) : null;
      });
      if (per.every((m): m is number => m !== null) && per.every((m) => Math.abs(m! - per[0]!) < 1e-6 * Math.max(1, per[0]!))) {
        mag = per[0]!;
      }
    }
    const entry: VecEntry = {
      label,
      decomp: coefs ? decompStr(coefs, basisNames) : symDecomp,
      coords: hasFrame && d ? coordStr(d) : null,
      mag: mag !== undefined ? `|${label}| = ${cleanNum(mag)}` : null,
      sq: mag !== undefined ? `${label}² = ${cleanNum(mag * mag)}` : null,
    };
    if (entry.decomp || entry.coords || entry.mag) entries.push(entry);
  };

  // declared vectors first (coords + stated magnitude), then auxiliary segments (decomp + coords)
  for (const [name, d] of vecNames) addEntry(name, d.from, d.to, true);
  for (const [a, b] of c.segments) addEntry(`${a}${b}`, a, b, false);

  // derived magnitude equalities among the declared vectors: |u| = |v| = |w| — equal in
  // EVERY sampled configuration (each seed has its own scale; the EQUALITY is the fact)
  const relations: string[] = [];
  {
    const mags = vecNames.map(([name, d]) => ({
      name,
      per: positions.map((pos) => {
        const p = pos.get(d.from);
        const q = pos.get(d.to);
        return p && q ? Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) : null;
      }),
    }));
    const used = new Set<string>();
    for (let i = 0; i < mags.length; i++) {
      if (used.has(mags[i].name) || mags[i].per.some((m) => m === null)) continue;
      const cls = [mags[i].name];
      for (let j = i + 1; j < mags.length; j++) {
        if (used.has(mags[j].name) || mags[j].per.some((m) => m === null)) continue;
        const equalEverywhere = mags[i].per.every((m, s) => Math.abs(m! - mags[j].per[s]!) <= 1e-6 * Math.max(1, m!));
        if (equalEverywhere) {
          cls.push(mags[j].name);
          used.add(mags[j].name);
        }
      }
      if (cls.length > 1) {
        const stated = cls.map((n) => lengths.get(pairKey(c.vectors.get(n)!.from, c.vectors.get(n)!.to))).find((v) => v !== undefined);
        // no stated number? a frame can still DERIVE one — append it when the class
        // length is the same in every sampled configuration (scale is pinned)
        const per = mags[i].per as number[];
        const derived =
          stated === undefined && hasFrame && per.every((m) => Math.abs(m - per[0]) < 1e-6 * Math.max(1, per[0])) ? per[0] : undefined;
        const val = stated ?? derived;
        relations.push(cls.map((n) => `|${n}|`).join(' = ') + (val !== undefined ? ` = ${cleanNum(val)}` : ''));
      }
    }
  }

  // derived PERPENDICULARITY among the declared vectors: u·v = 0 (operator, 2026-07-08).
  // The dot product's VALUE is gauge (scale varies per seed), but its being ZERO is a
  // shape property — invariant across every sampled configuration; so a pair reads as
  // perpendicular iff the normalised dot (the cosine) is ~0 in EVERY seed (the same
  // multi-sample discipline the magnitude equalities use). ⊥ from construction (cube /
  // pyramid-height edges) or from a stated ⟂ given both surface identically.
  {
    const dirs = vecNames.map(([name, d]) => ({
      name,
      per: positions.map((pos) => {
        const p = pos.get(d.from);
        const q = pos.get(d.to);
        return p && q ? sub3(q, p) : null;
      }),
    }));
    for (let i = 0; i < dirs.length; i++) {
      for (let j = i + 1; j < dirs.length; j++) {
        const a = dirs[i].per;
        const b = dirs[j].per;
        if (a.some((x) => !x) || b.some((x) => !x)) continue;
        const perp = a.every((x, s) => {
          const va = x!;
          const vb = b[s]!;
          const na = Math.hypot(va.x, va.y, va.z);
          const nb = Math.hypot(vb.x, vb.y, vb.z);
          if (na < EPS || nb < EPS) return false; // a degenerate (zero-length) vector isn't "perpendicular"
          return Math.abs(dot3(va, vb)) / (na * nb) < 1e-4; // |cos θ| ≈ 0
        });
        if (perp) relations.push(`${dirs[i].name}·${dirs[j].name} = 0`);
      }
    }
  }

  // #94 — named-angle MARKERS (`∠SDB` / `∠SDB = α`): the measure, printed ONLY when it agrees across every
  // sampled seed (a determined angle — the same knowledge gate as |u|=|v| and forced plane equations). An
  // under-determined marker draws its arc but shows no value. Labelled `α = 35.26°` when named, else `∠SDB`.
  for (const mk of c.angleMarks) {
    const degs = positions.map((pos) => {
      const v = pos.get(mk.vertex), p = pos.get(mk.p), q = pos.get(mk.q);
      if (!v || !p || !q) return null;
      const u1 = sub3(p, v), u2 = sub3(q, v);
      const n1 = Math.sqrt(dot3(u1, u1)), n2 = Math.sqrt(dot3(u2, u2));
      if (n1 < EPS || n2 < EPS) return null;
      return (Math.acos(Math.max(-1, Math.min(1, dot3(u1, u2) / (n1 * n2)))) * 180) / Math.PI;
    });
    if (degs.some((d) => d === null)) continue;
    const [g0, g1, g2] = degs as number[];
    if (Math.abs(g0 - g1) > 0.05 || Math.abs(g0 - g2) > 0.05) continue; // seed-varying → not knowledge, no value
    relations.push(`${mk.label ?? `∠${mk.p}${mk.vertex}${mk.q}`} = ${cleanNum(g0)}°`);
  }

  // points with STABLE coordinates (needs a frame; a pinned-only figure prints nothing sampled).
  // A coordinate is KNOWLEDGE only when it is identical in EVERY sampled configuration —
  // an unstable (seed-varying) coordinate never prints at all (operator rule, 2026-07-09:
  // a number on a node is read as known; one drawing's sample is not knowledge).
  const points: string[] = [];
  const pointCoords: Record<string, { text: string; kind: 'fact' | 'partial' }> = {};
  if (hasFrame) {
    const axes = ['x', 'y', 'z'] as const;
    for (const id of positions[0].keys()) {
      const ps = positions.map((pos) => pos.get(id));
      if (ps.some((p) => !p)) continue;
      const stableAx = axes.map((ax) => near(ps[0]![ax], ps[1]![ax]) && near(ps[0]![ax], ps[2]![ax]));
      const nStable = stableAx.filter(Boolean).length;
      if (nStable === 3) {
        const cs = coordStr(ps[0]!);
        pointCoords[id] = { text: cs, kind: 'fact' };
        points.push(`${id}${cs}`);
      } else if (nStable > 0) {
        // PARTIALLY determined (S with only A,B injected: y = 0 is a fact while the
        // base tilts about AB): known components print, free ones read '?' — and a
        // STATED sign given upgrades the '?' to '+?'/'−?' (the sign is knowledge too;
        // never inferred from sample coincidence)
        const free = (ax: 'x' | 'y' | 'z'): string => {
          const sg = c.signGivens.find((g) => g.id === id && g.axis === ax);
          return sg ? (sg.positive ? '+?' : '−?') : '?';
        };
        const cs = `(${axes.map((ax, i) => (stableAx[i] ? cleanNum(ps[0]![ax]) : free(ax))).join(', ')})`;
        pointCoords[id] = { text: cs, kind: 'partial' };
        points.push(`${id}${cs}`);
      }
      // no stable axis at all → no label (a sample coordinate is not knowledge)
    }
  }

  // named planes (point-run / rel-plane) whose EQUATION is forced — identical up to
  // scale in EVERY sampled configuration (the same multi-sample gate; operator request
  // 2026-07-09: `מישור ABB'A'` should surface its equation, the exam's מצאו את משוואת
  // המישור). An equation-plane was GIVEN by equation — nothing to derive.
  const planes: string[] = [];
  if (hasFrame) {
    for (const name of [...c.pointPlanes.keys(), ...c.relPlanes.keys()]) {
      const per = resolved.map((r) => r.planes.get(name));
      if (per.some((p) => !p)) continue;
      const canon = per.map((p) => {
        const n = Math.hypot(p!.n.x, p!.n.y, p!.n.z);
        if (n < EPS) return null;
        const u = { x: p!.n.x / n, y: p!.n.y / n, z: p!.n.z / n, d: p!.d / n };
        const lead = [u.x, u.y, u.z].find((v) => Math.abs(v) > 1e-6) ?? 1;
        return lead < 0 ? { x: -u.x, y: -u.y, z: -u.z, d: -u.d } : u;
      });
      if (canon.some((v) => !v)) continue;
      const keys = ['x', 'y', 'z', 'd'] as const;
      if (!canon.every((v) => keys.every((k) => Math.abs(v![k] - canon[0]![k]) < 1e-4))) continue;
      planes.push(`${name}: ${planeEqStr(canon[0]!)}`);
      // the parametric form rides when the run's anchor point and spanning edges are stable
      const run = c.pointPlanes.get(name);
      if (run && run.length >= 3) {
        const p0s = positions.map((pos) => pos.get(run[0]));
        const anchorStable = p0s.every((p): p is Vec3 => !!p) && sameVec(p0s[0]!, p0s[1]!) && sameVec(p0s[0]!, p0s[2]!);
        const e1 = stablePair(run[0], run[1]);
        const e2 = stablePair(run[0], run[run.length - 1]);
        if (anchorStable && e1 && e2) {
          planes.push(`${name}: x = ${coordStr(p0s[0]!)} + t·${coordStr(e1)} + s·${coordStr(e2)}`);
        }
      }
    }
  }

  return { relations, vectors: entries, points, pointCoords, planes };
}
