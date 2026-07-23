/**
 * The data-panel QUERY lane (ADR-3D-057, issue #274) — the operator's design: a SEPARATE input where the
 * student asks for a specific quantity («w·v», «|AB|», «∠SAB», «area ABC», «volume SABCD») and sees its
 * value WITHOUT adding anything to the figure. A query is a question, never a fact: it never enters
 * `replay`, never moves a point, never appears in the step list.
 *
 * Honesty (the student's own «only if stable»): a query is answered only when its value is genuinely
 * KNOWLEDGE. Angles are scale-free, so an angle is answered whenever the shape is determined (stable
 * across sampled seeds). A dot product / length / area / volume carries units — it is gauge unless the
 * figure's SCALE is pinned (`scalePinned`, ADR-3D-054), so it is answered only then (except the one
 * scale-invariant value, ~0 — a perpendicular dot is knowledge at any scale). Everything else reports
 * WHY it can't be answered — never a sampled number dressed as a fact (ADR-052).
 */

import { resolve3 } from './evaluate';
import { scalePinned } from './solve3';
import { cleanNum, coordStr, decompStr, solve3x3 } from './dataView';
import { centroid3, cross3, dot3, norm3, sub3, type Vec3 } from './vec3';
import type { Construction3, Id, Positions3 } from './types';

/** An operand: a declared vector name, or an ordered point pair. */
type Atom = { named: string } | { pair: [Id, Id] };

type Query =
  | { kind: 'dot'; a: Atom; b: Atom }
  | { kind: 'length'; a: Atom }
  | { kind: 'vector'; a: Atom } // the VECTOR itself — its u/v/w decomposition (+ coords when a frame exists)
  | { kind: 'symbol'; sym: string } // a free parameter «t» from «AE=t·AS» — its solved value (scale-invariant)
  | { kind: 'angle-vertex'; p: Id; q: Id; r: Id }
  | { kind: 'angle-vec'; a: Atom; b: Atom }
  | { kind: 'area'; ids: Id[] }
  | { kind: 'volume'; ids: Id[] };

export interface QueryResult {
  /** The student's query text, verbatim. */
  text: string;
  /** The value (`0`, `6`, `90°`), or null when it can't be answered. */
  answer: string | null;
  /** Why it can't be answered — shown in place of a value. */
  note?: string;
}

const PT = String.raw`[A-Z]\d*'?`;

/** Resolve a token string to an operand against the figure: a declared vector, or a two-point pair. */
function atomOf(c: Construction3, s: string): Atom | null {
  const t = s.trim();
  if (/^[a-z]$/.test(t) && c.vectors.has(t)) return { named: t };
  const m = t.match(new RegExp(`^(${PT})\\s*(${PT})$`));
  return m ? { pair: [m[1], m[2]] } : null;
}

/** The direction vector an atom spans at these positions (named vector's from→to, or the pair). */
function atomVec(c: Construction3, a: Atom, pos: Positions3): Vec3 | null {
  const [from, to] = 'named' in a ? (() => { const d = c.vectors.get(a.named); return d ? [d.from, d.to] : [undefined, undefined]; })() : a.pair;
  if (!from || !to) return null;
  const p = pos.get(from);
  const q = pos.get(to);
  return p && q ? sub3(q, p) : null;
}

/** Parse a query string into a typed request (no coordinates yet), or null if unrecognised. */
export function parseQuery(c: Construction3, raw: string): Query | null {
  const s = raw.replace(/[′’]/g, "'").replace(/\s+/g, ' ').trim();
  if (!s) return null;

  // ANGLE: «∠(u,v)» / «∠SAB» / «זווית SAB» / «angle SAB» / «angle between u and v»
  const angM = s.match(/^(?:∠|∢|זו?וית|the\s+)?\s*angle\s+|^(?:∠|∢|זו?וית)\s*/i);
  const angVec = s.match(/^(?:∠|∢|זו?וית|angle)\s*\(?\s*([a-z]|[A-Z]\d*'?[A-Z]\d*'?)\s*,\s*([a-z]|[A-Z]\d*'?[A-Z]\d*'?)\s*\)?$/i);
  if (angVec) {
    const a = atomOf(c, angVec[1]);
    const b = atomOf(c, angVec[2]);
    if (a && b) return { kind: 'angle-vec', a, b };
  }
  if (angM || /^∠/.test(s)) {
    const body = s.replace(/^(?:∠|∢|זו?וית|the\s+angle|angle|of|של|בין)\s*/gi, '').replace(/\s+/g, '');
    const tri = body.match(new RegExp(`^(${PT})(${PT})(${PT})$`));
    if (tri) return { kind: 'angle-vertex', p: tri[1], q: tri[2], r: tri[3] };
  }

  // DOT: «w·v» / «AB·CD» / «w dot v»
  const dotM = s.match(/^(.+?)\s*(?:·|•|⋅|\*|dot)\s*(.+)$/i);
  if (dotM) {
    const a = atomOf(c, dotM[1]);
    const b = atomOf(c, dotM[2]);
    if (a && b) return { kind: 'dot', a, b };
  }

  // LENGTH: «|AB|» / «|w|» / «אורך AB» / «length w» — the bars/word mark the MAGNITUDE. A BARE «AB» is
  // the vector itself (handled last), following the math convention |AB| = length, AB = the vector.
  const barM = s.match(/^\|\s*(.+?)\s*\|$/);
  const lenWord = s.match(/^(?:אורך|length|the\s+length\s+of|גודל|norm)\s+(.+)$/i);
  const lenTok = barM?.[1] ?? lenWord?.[1];
  if (lenTok) {
    const a = atomOf(c, lenTok);
    if (a) return { kind: 'length', a };
  }

  // AREA: «area ABC» / «שטח ABC» / «S_{ABC}» / «SABC»
  const areaM = s.match(/^(?:שטח|area|the\s+area\s+of)\s+([A-Z0-9'\s]+)$/i) ?? s.match(new RegExp(`^S_?\\{?\\s*((?:${PT}){3,})\\s*\\}?$`));
  if (areaM) {
    const ids = areaM[1].match(new RegExp(PT, 'g')) ?? [];
    if (ids.length >= 3) return { kind: 'area', ids };
  }

  // VOLUME: «volume SABCD» / «נפח SABCD»
  const volM = s.match(/^(?:נפח|volume|the\s+volume\s+of)\s+([A-Z0-9'\s]+)$/i);
  if (volM) {
    const ids = volM[1].match(new RegExp(PT, 'g')) ?? [];
    if (ids.length >= 4) return { kind: 'volume', ids };
  }

  // VECTOR (last): a bare pair «AE» or a bare declared vector «w» — the vector itself, not its length.
  const bare = s.replace(/^(?:ה?ו?וקטור|vector)\s+/i, '').replace(/[⃗→]/g, '').trim();
  const va = atomOf(c, bare);
  if (va) return { kind: 'vector', a: va };

  // SYMBOL: a bare parameter letter «t» from «AE=t·AS» (a lowercase letter that is a vecDef symbol,
  // NOT a declared vector — those became a vector query above). Its solved value.
  if (/^[a-z]$/.test(bare) && c.vecDefs.some((vd) => vd.symbol === bare)) return { kind: 'symbol', sym: bare };

  return null;
}

/** Solve a vec-def's free symbol from the resolved positions: `unknown = from + Σ(k+p·sym)·atom` ⇒
 *  `sym = [(unknown−from) − Σk·atom] · (Σp·atom) / |Σp·atom|²`. Null when the symbol carries no direction. */
function solveSymbol(c: Construction3, sym: string, pos: Positions3): number | null {
  const vd = c.vecDefs.find((d) => d.symbol === sym);
  if (!vd) return null;
  const from = pos.get(vd.from);
  const unknown = pos.get(vd.unknown);
  if (!from || !unknown) return null;
  const termVec = (atom: (typeof vd.terms)[number]['atom']): Vec3 | null => {
    if (atom.kind === 'pair') {
      const a = pos.get(atom.from);
      const b = pos.get(atom.to);
      return a && b ? sub3(b, a) : null;
    }
    const d = c.vectors.get(atom.name);
    const a = d && pos.get(d.from);
    const b = d && pos.get(d.to);
    return a && b ? sub3(b, a) : null;
  };
  let lhs = sub3(unknown, from); // (unknown − from) − Σ k·atom
  let dir = { x: 0, y: 0, z: 0 }; // Σ p·atom  (the direction the symbol scales)
  for (const t of vd.terms) {
    const v = termVec(t.atom);
    if (!v) return null;
    lhs = sub3(lhs, { x: v.x * t.coeff.k, y: v.y * t.coeff.k, z: v.z * t.coeff.k });
    dir = { x: dir.x + v.x * t.coeff.p, y: dir.y + v.y * t.coeff.p, z: dir.z + v.z * t.coeff.p };
  }
  const d2 = dot3(dir, dir);
  return d2 < 1e-12 ? null : dot3(lhs, dir) / d2;
}

/** The convex-solid volume from its face rings (centroid fan → tetra sum; orientation-free). */
function solidVolume(c: Construction3, ids: Id[], pos: Positions3): number | null {
  // a named solid whose vertex SET matches `ids`, else a bare 4-point tetrahedron
  const key = [...ids].sort().join('|');
  const solid = c.solids.find((sd) => [...sd.ids].sort().join('|') === key);
  if (!solid) {
    if (ids.length !== 4) return null;
    const ps = ids.map((id) => pos.get(id));
    if (ps.some((p) => !p)) return null;
    return Math.abs(dot3(sub3(ps[1]!, ps[0]!), cross3(sub3(ps[2]!, ps[0]!), sub3(ps[3]!, ps[0]!)))) / 6;
  }
  const verts = solid.ids.map((id) => pos.get(id));
  if (verts.some((p) => !p)) return null;
  const ctr = centroid3(verts as Vec3[]);
  let V = 0;
  for (const face of solid.faces) {
    const fp = face.map((id) => pos.get(id));
    if (fp.some((p) => !p)) return null;
    for (let i = 1; i + 1 < fp.length; i++) {
      V += Math.abs(dot3(sub3(fp[0]!, ctr), cross3(sub3(fp[i]!, ctr), sub3(fp[i + 1]!, ctr)))) / 6;
    }
  }
  return V;
}

/** The raw numeric value of a query at one configuration; null when a referenced object is unplaced. */
function evalQuery(c: Construction3, q: Query, pos: Positions3): number | null {
  const angleBetween = (u: Vec3, v: Vec3): number | null => {
    const n = norm3(u) * norm3(v);
    return n < 1e-12 ? null : (Math.acos(Math.max(-1, Math.min(1, dot3(u, v) / n))) * 180) / Math.PI;
  };
  switch (q.kind) {
    case 'dot': {
      const u = atomVec(c, q.a, pos);
      const v = atomVec(c, q.b, pos);
      return u && v ? dot3(u, v) : null;
    }
    case 'length': {
      const u = atomVec(c, q.a, pos);
      return u ? norm3(u) : null;
    }
    case 'angle-vertex': {
      const p = pos.get(q.p), qq = pos.get(q.q), r = pos.get(q.r);
      return p && qq && r ? angleBetween(sub3(p, qq), sub3(r, qq)) : null;
    }
    case 'angle-vec': {
      const u = atomVec(c, q.a, pos);
      const v = atomVec(c, q.b, pos);
      return u && v ? angleBetween(u, v) : null;
    }
    case 'area': {
      const ps = q.ids.map((id) => pos.get(id));
      if (ps.some((p) => !p)) return null;
      // triangle: ½|cross|; polygon: Newell fan from vertex 0 (planar or not, the projected area)
      let a = 0;
      for (let i = 1; i + 1 < ps.length; i++) a += 0.5 * norm3(cross3(sub3(ps[i]!, ps[0]!), sub3(ps[i + 1]!, ps[0]!)));
      return a;
    }
    case 'volume':
      return solidVolume(c, q.ids, pos);
    case 'symbol':
      return solveSymbol(c, q.sym, pos);
    case 'vector':
      return null; // handled in answerQuery (a vector isn't a single scalar), never reached here
  }
}

/** The VECTOR forms of a query: its u/v/w decomposition (frame-INVARIANT — knowledge whenever the
 *  coefficients agree across seeds, even with a free scale) and its coordinates (only with a frame). */
function vectorForms(c: Construction3, a: Atom, posArr: Positions3[]): string[] {
  const parts: string[] = [];
  const basis = [...c.vectors.entries()].slice(0, 3);
  if (basis.length === 3) {
    const names = basis.map(([n]) => n);
    const per = posArr.map((pos) => {
      const target = atomVec(c, a, pos);
      const dirs = basis.map(([, d]) => {
        const f = pos.get(d.from);
        const t = pos.get(d.to);
        return f && t ? sub3(t, f) : null;
      });
      return target && !dirs.some((x) => !x) ? solve3x3(dirs[0]!, dirs[1]!, dirs[2]!, target) : null;
    });
    if (!per.some((x) => !x)) {
      const [c0, c1, c2] = per as [number, number, number][];
      const agree = (u: number[], v: number[]) => u.every((x, i) => Math.abs(x - v[i]) < 2e-3);
      if (agree(c0, c1) && agree(c0, c2)) parts.push(decompStr(c0.map((x, i) => (x + c1[i] + c2[i]) / 3) as [number, number, number], names));
    }
  }
  const hasFrame = c.pins.length > 0 || c.vectorPins.length > 0 || c.pairPins.length > 0 || c.planePins.length > 0;
  if (hasFrame) {
    const vs = posArr.map((pos) => atomVec(c, a, pos));
    if (!vs.some((v) => !v) && vs.every((v) => Math.abs(v!.x - vs[0]!.x) < 1e-6 && Math.abs(v!.y - vs[0]!.y) < 1e-6 && Math.abs(v!.z - vs[0]!.z) < 1e-6)) {
      parts.push(coordStr(vs[0]!));
    }
  }
  return parts;
}

/** Answer one query against the figure — the whole honesty gate (stability + scale) lives here. */
export function answerQuery(c: Construction3, text: string, seed: number): QueryResult {
  const q = parseQuery(c, text);
  if (!q) return { text, answer: null, note: 'notUnderstood' };
  const seeds = [seed, seed + 1013, seed + 2027, seed + 3041];

  if (q.kind === 'vector') {
    const posArr = seeds.map((s) => resolve3(c, s).positions);
    if (atomVec(c, q.a, posArr[0]) === null) return { text, answer: null, note: 'unavailable' };
    const forms = vectorForms(c, q.a, posArr);
    // a decomposition/coords the givens don't fix (a free basis, a variable direction) reports undetermined
    return forms.length ? { text, answer: forms.join('  =  ') } : { text, answer: null, note: 'undetermined' };
  }
  const vals = seeds.map((s) => evalQuery(c, q, resolve3(c, s).positions));
  if (vals.some((v) => v === null || !Number.isFinite(v))) return { text, answer: null, note: 'unavailable' };
  const nums = vals as number[];
  const stable = nums.every((v) => Math.abs(v - nums[0]) <= 1e-6 * Math.max(1, Math.abs(nums[0])));
  if (!stable) return { text, answer: null, note: 'undetermined' };
  // angles and a free PARAMETER «t» (an affine ratio along a segment) are scale-invariant — knowledge
  // whenever they are stable, no scale needed. A dot/length/area/volume still needs the scale pinned.
  const scaleFree = q.kind === 'angle-vertex' || q.kind === 'angle-vec' || q.kind === 'symbol';
  if (!scaleFree && !scalePinned(c) && Math.abs(nums[0]) > 1e-9) return { text, answer: null, note: 'scale' };
  const isAngle = q.kind === 'angle-vertex' || q.kind === 'angle-vec';
  return { text, answer: `${cleanNum(nums[0])}${isAngle ? '°' : ''}` };
}
