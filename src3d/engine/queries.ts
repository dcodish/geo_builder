/**
 * The data-panel QUERY lane (ADR-3D-057, issue #274) — the operator's design: a SEPARATE input where the
 * student asks for a specific quantity («w·v», «|AB|», «∠SAB», «area ABC», «volume SABCD») and sees its
 * value WITHOUT adding anything to the figure. A query is a question, never a fact: it never enters
 * `replay`, never moves a point, never appears in the step list.
 *
 * Honesty (the student's own «only if stable»): a query is answered only when its value is genuinely
 * KNOWLEDGE. Angles are scale-free, so an angle is answered whenever the shape is determined (stable
 * across sampled seeds). A dot product / length / area / volume carries units — it is gauge unless the
 * figure's SCALE is pinned (`scaleKnown3`, ADR-3D-054 / #517), so it is answered only then (except the one
 * scale-invariant value, ~0 — a perpendicular dot is knowledge at any scale). Everything else reports
 * WHY it can't be answered — never a sampled number dressed as a fact (ADR-052).
 */

import { resolve3, scaleKnown3, translationKnown3, vectorFramePinned3 } from './evaluate';
import { basisDecompose, canonicalPlaneEq, cleanNum, coordStr, dataView, decompStr, formatBranches, linePlaneAngleAt, parametricDecomp, parametricPlaneForm, planeEqStr } from './dataView';
import { cross3, dot3, norm3, runNormal, sub3, type Vec3 } from './vec3';
import { resolveSolidSubject, subjectVolume } from './solidSubject';
import { distanceBetween, resolveOperand, type AbsoluteCtx } from './operands';
import { readOperand } from '../parser/operandToken';
import { figureSymbolsOf } from './types';
import type { Construction3, Id, Operand3, Positions3, Requirement3 } from './types';

/** An operand: a declared vector name, or an ordered point pair. */
type Atom = { named: string } | { pair: [Id, Id] };

type Query =
  | { kind: 'line-plane'; a: Id; b: Id; plane: Id[] } // #319: «הזווית בין SB למישור ABC» — the angle itself
  | { kind: 'plane-plane'; p1: Id[]; p2: Id[] } // #319: «הזווית בין מישור ABC למישור SBC» (dihedral, acute)
  | { kind: 'dot'; a: Atom; b: Atom }
  | { kind: 'length'; a: Atom }
  | { kind: 'vector'; a: Atom } // the VECTOR itself — its u/v/w decomposition (+ coords when a frame exists)
  | { kind: 'symbol'; sym: string } // a free parameter «t» from «AE=t·AS» — its solved value (scale-invariant)
  | { kind: 'angle-vertex'; p: Id; q: Id; r: Id }
  | { kind: 'angle-vec'; a: Atom; b: Atom }
  | { kind: 'area'; ids: Id[] }
  | { kind: 'volume'; ids: Id[] }
  // S5 (#378): «המרחק בין D למישור ABC» — the distance itself, no value stated. NOT scale-free:
  // it is reported only when the figure's scale is pinned (the ADR-3D-054 discipline).
  | { kind: 'distance'; a: Operand3; b: Operand3 }
  // #496: a bare POINT label «A» — its coordinates, when they are knowledge. The lane could already
  // answer «m» (a lowercase figure symbol, ADR-3D-119) but not «A», on figures where A is the more
  // natural question.
  | { kind: 'point'; id: Id }
  // #317: «מישור ABC» / «plane ABC» / a named plane — its canonical equation, when it is forced.
  // The exam's «מצאו את משוואת המישור» asked as a QUESTION instead of entered as a figure-changing fact.
  | { kind: 'plane'; name: string | null; ids: Id[] | null };

export interface QueryResult {
  /** The student's query text, verbatim. */
  text: string;
  /** The value (`0`, `6`, `90°`), or null when it can't be answered. */
  answer: string | null;
  /** Why it can't be answered — shown in place of a value. */
  note?: string;
  /** For note `depends`: the free named parameter(s) the quantity is a function of («α»). */
  param?: string;
}

const PT = String.raw`[A-Z]\d*'?`;

/**
 * #642 — the SUBJECT NOUN, in the query lane. `parseQuery`'s heads spell their noun gates inline and
 * came out one entry short exactly as `parse3.ts` did (#640): the point head listed the two COORDINATE
 * nouns and forgot the subject one, so the bare label answered and the named form was «not recognised».
 * A student names the thing they are asking about; that is a gate, not a per-head synonym list.
 *
 * These MIRROR `parse3.ts`'s `HE_SUBJ` / `HE_SEG` and are a second copy — the real debt. `engine/`
 * cannot import from `parser/` (the layering forbids it), so the same Hebrew gates are maintained in
 * two files and have now drifted twice. Hoisting them to a module both may import is a layering
 * decision the operator reserved (#642), so it is recorded rather than taken: see #753.
 */
const Q_SUBJ = String.raw`(?:ה?(?:נקוד[הת]|קודקוד)\s+|(?:the\s+)?(?:point|vertex)\s+)?`;
const Q_SEG = String.raw`(?:ה?(?:קטע|צלע|מקצוע)\s+|(?:the\s+)?(?:segment|edge|side)\s+)?`;

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

  // #319 — LINE↔PLANE angle: «הזווית בין SB למישור ABC» / «angle between SB and plane ABC»
  // (valueless — a QUESTION; the statement form with a value/label is the linePlaneAngle fact rule).
  {
    const lp =
      s.match(new RegExp(`^ה?זו?וית\\s+(?:ש)?בין\\s+(?:ה?ישר\\s+|ה?קטע\\s+|ה?מקצוע\\s+)?(${PT})(${PT})\\s+(?:[לו]?בין\\s+)?[לו]?-?ה?מישור\\s+((?:${PT}){3,4})$`)) ??
      s.match(new RegExp(`^(?:the\\s+)?angle\\s+between\\s+(?:the\\s+)?(?:line\\s+|segment\\s+|edge\\s+)?(${PT})(${PT})\\s+and\\s+(?:the\\s+)?plane\\s+((?:${PT}){3,4})$`, 'i'));
    if (lp) return { kind: 'line-plane', a: lp[1], b: lp[2], plane: lp[3].match(new RegExp(PT, 'g'))! };
    const pp =
      s.match(new RegExp(`^ה?זו?וית\\s+(?:ש)?בין\\s+ה?מישור\\s+((?:${PT}){3,4})\\s+(?:[לו]?בין\\s+)?[לו]?-?ה?מישור\\s+((?:${PT}){3,4})$`)) ??
      s.match(new RegExp(`^(?:the\\s+)?angle\\s+between\\s+(?:the\\s+)?planes?\\s+((?:${PT}){3,4})\\s+and\\s+(?:the\\s+)?(?:plane\\s+)?((?:${PT}){3,4})$`, 'i'));
    if (pp) return { kind: 'plane-plane', p1: pp[1].match(new RegExp(PT, 'g'))!, p2: pp[2].match(new RegExp(PT, 'g'))! };
  }

  // S5 (#378) — DISTANCE, valueless: «המרחק בין D למישור ABC» / «distance between D and plane ABC».
  // The stated form (with a value) is the `distanceGiven` FACT rule; this is the question.
  {
    const dm =
      s.match(/^ה?מרחק\s+(?:ש)?בין\s+(.+?)\s+(?:[לו]בין\s+|ל-?\s*|ו-?\s*)(.+?)$/) ??
      s.match(/^(?:the\s+)?distance\s+(?:from|between)\s+(.+?)\s+(?:and|to)\s+(.+?)$/i);
    if (dm) {
      const oa = readOperand(dm[1]);
      const ob = readOperand(dm[2]);
      if (oa && ob) return { kind: 'distance', a: oa.op, b: ob.op };
    }
  }

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
  const lenWord = s.match(new RegExp(`^(?:אורך|length|the\\s+length\\s+of|גודל|norm)\\s+${Q_SEG}(.+)$`, 'i'));
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

  // #642 — the solid noun, shared by the two volume forms below: the DEFINITE bare reference
  // («volume of the prism») and the vertex-run form, which listed the run alone and so refused the
  // noun a student naturally writes in front of it.
  const Q_SOLID_NOUNS = String.raw`ה?מנסרה|ה?פירמידה|ה?קובייה|ה?תיבה|ה?מקבילון|prism|pyramid|cube|box|parallelepiped`;

  // VOLUME: «volume SABCD» / «נפח SABCD»
  const volM = s.match(new RegExp(`^(?:נפח|volume|the\\s+volume\\s+of)\\s+(?:${Q_SOLID_NOUNS}\\s+)?([A-Z0-9'\\s]+)$`, 'i'));
  if (volM) {
    const ids = volM[1].match(new RegExp(PT, 'g')) ?? [];
    if (ids.length >= 4) return { kind: 'volume', ids };
  }
  // #328: a DEFINITE bare solid NOUN with no vertex run — «נפח המנסרה» / «volume of the prism» — resolves to
  // THE one solid of that kind (the ADR-029 / ADR-3D-048 definite-reference pattern). Zero or several of that
  // kind → fall through to the honest "not recognized" note, never a silent guess.
  const defVolM = s.match(new RegExp(`^(?:נפח|volume(?:\\s+of\\s+the)?)\\s+(${Q_SOLID_NOUNS})$`, 'i'));
  if (defVolM) {
    const noun = defVolM[1];
    const kindRe =
      /מנסרה|מקבילון|prism|parallelepiped/.test(noun) ? /^(prism|parallelepiped)/
      : /פירמידה|pyramid/.test(noun) ? /^(pyramid|tetra)/
      : /קובייה|cube/.test(noun) ? /^cube/
      : /^box/; // תיבה / box
    const matches = c.solids.filter((sd) => kindRe.test(sd.kind));
    if (matches.length === 1) return { kind: 'volume', ids: [...matches[0].ids] };
  }

  // #317 — PLANE: «מישור ABC» / «plane ABC» / «משוואת המישור ABC» / a named plane «π1». The panel
  // already prints a forced plane's equation; the only route to it as a QUESTION was to enter the
  // plane as a FACT, which changes the figure to ask about it. A point RUN needs no declaration — the
  // ring's own plane is derived; a NAME must be one the figure carries.
  {
    const m =
      s.match(new RegExp(`^(?:ה?משוואת\\s+)?ה?מישור\\s+((?:${PT}){3,4})$`)) ??
      s.match(new RegExp(`^(?:the\\s+)?(?:equation\\s+of\\s+(?:the\\s+)?)?plane\\s+((?:${PT}){3,4})$`, 'i'));
    if (m) return { kind: 'plane', name: null, ids: m[1].match(new RegExp(PT, 'g'))! };
    const named =
      s.match(/^(?:ה?משוואת\s+)?ה?מישור\s+(\S+)$/) ??
      s.match(/^(?:the\s+)?(?:equation\s+of\s+(?:the\s+)?)?plane\s+(\S+)$/i);
    const nm = named?.[1] ?? s;
    if (c.planes.has(nm) || c.pointPlanes.has(nm) || c.relPlanes.has(nm)) return { kind: 'plane', name: nm, ids: null };
  }

  // #496 — POINT: a bare label «A», or «שיעורי A» / «coordinates of A» / «A = ?». The label must BE a
  // point of THIS construction, so a stray letter in the query box is never treated as one. No tie with
  // the vector lane is possible: `atomOf` reads a named vector only from a LOWERCASE letter, and a pair
  // needs two labels — an uppercase single letter can only be a point.
  {
    const m = s.match(new RegExp(`^(?:ה?שיעורי[א-ת]*\\s+(?:של\\s+)?|ה?קואורדינ[טת][א-ת]*\\s+(?:של\\s+)?|coordinates\\s+of\\s+)?${Q_SUBJ}(${PT})\\s*(?:=\\s*\\?)?$`, 'i'));
    if (m && c.points.has(m[1])) return { kind: 'point', id: m[1] };
  }

  // VECTOR (last): a bare pair «AE» or a bare declared vector «w» — the vector itself, not its length.
  const bare = s.replace(/^(?:ה?ו?וקטור|vector)\s+/i, '').replace(/[⃗→]/g, '').trim();
  const va = atomOf(c, bare);
  if (va) return { kind: 'vector', a: va };

  // SYMBOL: a bare parameter letter the figure carries — «t» from «AE=t·AS», a pin's open symbol, or the
  // algebraic lane's parameter «m» (NOT a declared vector — those became a vector query above). Its solved
  // value. #480: read from the one registry, so every symbol kind is askable rather than the one this
  // rule's author had in mind; the letter must still BE a symbol of this figure, or every stray `m` in a
  // query box would be treated as one.
  if (/^[a-z]$/.test(bare) && figureSymbolsOf(c).includes(bare)) return { kind: 'symbol', sym: bare };

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

/**
 * A queried solid's volume — through the SHARED subject resolver (#766, ADR-3D-169).
 *
 * This lane already looked the solid up by vertex SET and summed its own faces, which is right; what it
 * could not do is read a BASE run («נפח הפירמידה ABCD» on ABCDS), so the query and claim lanes gave two
 * different answers to one sentence. One resolver now serves both — a query names no noun, so it asks
 * with `'any'` and the letters decide.
 */
function solidVolume(c: Construction3, ids: Id[], pos: Positions3): number | null {
  return subjectVolume(resolveSolidSubject(c, 'any', ids), pos);
}

/** The raw numeric value of a query at one configuration; null when a referenced object is unplaced. */
function evalQuery(c: Construction3, q: Query, pos: Positions3, abs?: AbsoluteCtx): number | null {
  const angleBetween = (u: Vec3, v: Vec3): number | null => {
    const n = norm3(u) * norm3(v);
    return n < 1e-12 ? null : (Math.acos(Math.max(-1, Math.min(1, dot3(u, v) / n))) * 180) / Math.PI;
  };
  switch (q.kind) {
    // #496/#317: a point's coordinates and a plane's equation are not single numbers — `answerQuery`
    // answers both before the numeric path. Listed explicitly so the switch stays exhaustive and a
    // future kind cannot slip through as a silent `undefined`.
    case 'point':
    case 'plane':
      return null;
    case 'distance': {
      const ctx = abs ?? { lines: new Map(), planes: new Map() };
      const at = (id: Id) => pos.get(id) ?? null;
      const ga = resolveOperand(q.a, c, ctx)(at);
      const gb = resolveOperand(q.b, c, ctx)(at);
      return ga && gb ? distanceBetween(ga, gb) : null;
    }
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
    case 'line-plane':
      return linePlaneAngleAt(pos, q.a, q.b, q.plane);
    case 'plane-plane': {
      const ps1 = q.p1.map((id) => pos.get(id));
      const ps2 = q.p2.map((id) => pos.get(id));
      if (ps1.some((x) => !x) || ps2.some((x) => !x)) return null;
      const n1 = runNormal(ps1 as { x: number; y: number; z: number }[]);
      const n2 = runNormal(ps2 as { x: number; y: number; z: number }[]);
      const den = norm3(n1) * norm3(n2);
      if (den < 1e-12) return null;
      return (Math.acos(Math.min(1, Math.abs(dot3(n1, n2)) / den)) * 180) / Math.PI; // acute dihedral
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
 *  coefficients agree across seeds, even with a free scale), its PARAMETRIC form when the coefficients
 *  are affine in the construction's single parameter (#297: «AE» ⇒ `t·w`, shared with the data panel so
 *  a query answer and its panel row can't diverge), and its coordinates (only with a frame). */
function vectorForms(c: Construction3, a: Atom, posArr: Positions3[], seeds: number[]): string[] {
  const parts: string[] = [];
  const basisEntries = [...c.vectors.entries()].slice(0, 3);
  // 1–2 declared vectors are a real basis for a planar/collinear figure (#311); the decomposition
  // itself is the SHARED `basisDecompose` (this function used to carry its own inline 3×3 copy —
  // the exact panel/query duplication #297 was meant to end — so the 3-basis gate lived on here).
  if (basisEntries.length >= 1) {
    const names = basisEntries.map(([n]) => n);
    const basisDefs = basisEntries.map(([, d]) => d);
    const ft: [Id, Id] | null = 'named' in a ? (() => { const d = c.vectors.get(a.named); return d ? ([d.from, d.to] as [Id, Id]) : null; })() : a.pair;
    let pushedDecomp = false;
    if (ft) {
      const coefs = basisDecompose(basisDefs, posArr, ft[0], ft[1]);
      if (coefs) {
        parts.push(decompStr(coefs, names));
        pushedDecomp = true;
      }
    }
    // #297 — the numeric decomposition isn't stable (a driven-parameter vector: AE = t·w): show the
    // PARAMETRIC form instead, the same one the data panel surfaces (shared `parametricDecomp`).
    if (!pushedDecomp && ft) {
      const sym = parametricDecomp(c, ft[0], ft[1], seeds);
      if (sym) parts.push(sym);
    }
  }
  // #315 (ADR-3D-074): a queried VECTOR's coordinates are a difference — translation cancels — so
  // they need the ORIENTATION pinned (two independent pinned directions, or a real point frame, or
  // the atom itself being the injected pair), never just "something was injected" (a single pair pin
  // leaves a residual rotation the pivot's deterministic gauge fixes, which would print as knowledge).
  // #315 amendment (operator-validated): vector coords keep the frame + seed-stability gate — the
  // seeds vary the rotation/dims gauge, so only genuinely-derivable vector coords survive the
  // stability check (u suppressed, v = 3·DE printed). Translation is the one deterministic gauge;
  // POINT-coordinate answers are gated at their own sites.
  // #517: the SHARED frame predicate (evaluate.ts) — the private enumeration here was blind to fresh
  // coordinate points (kind 'coord' in `c.points`, never a pin), refusing `CB` on two injected points.
  const vectorFrame = vectorFramePinned3(c);
  if (vectorFrame) {
    const vs = posArr.map((pos) => atomVec(c, a, pos));
    if (!vs.some((v) => !v) && vs.every((v) => Math.abs(v!.x - vs[0]!.x) < 1e-6 && Math.abs(v!.y - vs[0]!.y) < 1e-6 && Math.abs(v!.z - vs[0]!.z) < 1e-6)) {
      parts.push(coordStr(vs[0]!));
    }
  }
  return parts;
}

/**
 * When a quantity varies, is it a FUNCTION of a free NAMED parameter (α from «∠SAB = α», bounded but
 * unpinned)? Returns a construction with every such parameter PINNED to an in-bound value, plus the
 * parameter names — so the caller can re-check: if the quantity settles once α is fixed, it «depends on α»
 * ([ADR-3D-057](docs/06b-decisions-3d.md)). The tool never SOLVES the relation (t = ⅔cosα needs symbolic
 * algebra, the no-CAS boundary) — it only names the dependency, which is the pedagogical point.
 */
function pinFreeMeasures(c: Construction3): { c: Construction3; params: string } | null {
  const labels = [...new Set(c.angleMarks.map((m) => m.label).filter((l): l is string => !!l))];
  if (labels.length === 0) return null;
  const scalarPins = [...c.scalarPins];
  for (const m of c.angleMarks) {
    if (!m.label) continue;
    const req = c.requirements.find(
      (r): r is Extract<Requirement3, { kind: 'angle-bound' }> =>
        r.kind === 'angle-bound' && r.vertex === m.vertex && ((r.p === m.p && r.q === m.q) || (r.p === m.q && r.q === m.p)),
    );
    const deg = req ? ((req.min ?? (req.max ?? 90) - 30) + (req.max ?? (req.min ?? 0) + 30)) / 2 : 60; // the bound's midpoint, else a generic acute value
    scalarPins.push({ kind: 'vangle', vertex: m.vertex, p: m.p, q: m.q, deg });
  }
  return { c: { ...c, scalarPins }, params: labels.join(', ') };
}

/** Answer one query against the figure — the whole honesty gate (stability + scale) lives here. */
/**
 * #813 (ADR-3D-181) — a PLANE query on a FRAMELESS figure. The equation is honestly refused (its d-term
 * is translation-dependent, #315), but the plane's shape is often fully known — the classic bagrut
 * cross-section. Reports the seed-invariant properties through the SAME lanes the panel and the scalar
 * query use (area and side lengths via `answerQuery` itself; relations via `dataView`'s mutual table),
 * so a row here and a row there can never disagree (the #297 discipline). Only what those lanes call
 * knowledge is reported: an unpinned scale drops the lengths, an unstable relation never appears.
 * The note is set in both outcomes — with an answer it explains why no equation follows, without one
 * it is the whole reply.
 */
function framelessPlane(c: Construction3, text: string, q: Extract<Query, { kind: 'plane' }>, seed: number): QueryResult {
  const ids = q.ids ?? (q.name ? c.pointPlanes.get(q.name) : undefined);
  const label = q.name ?? (ids ? ids.join('') : '');
  const parts: string[] = [];
  if (ids && ids.length >= 3) {
    const area = answerQuery(c, `שטח ${ids.join('')}`, seed);
    if (area.answer !== null) parts.push(`S(${label}) = ${area.answer}`);
    for (let i = 0; i < ids.length; i++) {
      const a = ids[i];
      const b = ids[(i + 1) % ids.length];
      if (ids.length === 3 && i === 2 && ids.length < 3) break;
      const len = answerQuery(c, `|${a}${b}|`, seed);
      if (len.answer !== null) parts.push(`|${a}${b}| = ${len.answer}`);
    }
  }
  const GLYPH: Record<string, string> = { parallel: '∥', perpendicular: '⟂', contained: '⊂', coincident: '=', intersecting: '∩', skew: '⋈' };
  if (label) {
    for (const row of dataView(c, seed).mutual) {
      if (row.a !== label && row.b !== label) continue;
      parts.push(`${row.a} ${GLYPH[row.rel] ?? row.rel} ${row.b}`);
    }
  }
  return { text, answer: parts.length > 0 ? parts.join(' · ') : null, note: 'noFrame' };
}

export function answerQuery(c: Construction3, text: string, seed: number): QueryResult {
  const q = parseQuery(c, text);
  if (!q) return { text, answer: null, note: 'notUnderstood' };
  const seeds = [seed, seed + 1013, seed + 2027, seed + 3041];
  const stableNums = (vals: (number | null)[]): number | null => {
    if (vals.some((v) => v === null || !Number.isFinite(v))) return null;
    const nums = vals as number[];
    return nums.every((v) => Math.abs(v - nums[0]) <= 1e-6 * Math.max(1, Math.abs(nums[0]))) ? nums[0] : null;
  };

  // #480 — the algebraic lane's parameter is answered from its BRANCH SET, not by sampling. The generic
  // numeric path below asks four seeds to agree, which is the right question for a measured quantity but
  // the wrong one here: with two branches the seeds disagree by design and the query would read
  // «undetermined», when the honest answer is that the givens allow exactly ±√2 — the answer the exam
  // wants. A single branch answers as a plain value; none at all (an unpinned parameter) is genuinely
  // undetermined and says so.
  if (q.kind === 'symbol' && q.sym === c.param) {
    const branches = resolve3(c, seed).param?.branches ?? [];
    const shown = formatBranches(branches);
    return shown ? { text, answer: shown } : { text, answer: null, note: 'undetermined' };
  }

  if (q.kind === 'vector') {
    const posArr = seeds.map((s) => resolve3(c, s).positions);
    if (atomVec(c, q.a, posArr[0]) === null) return { text, answer: null, note: 'unavailable' };
    const forms = vectorForms(c, q.a, posArr, seeds);
    if (forms.length) return { text, answer: forms.join('  =  ') };
    // undetermined — but does it settle once a free named parameter α is fixed? Then «depends on α».
    const pin = pinFreeMeasures(c);
    if (pin && vectorForms(pin.c, q.a, seeds.map((s) => resolve3(pin.c, s).positions), seeds).length) {
      return { text, answer: null, note: 'depends', param: pin.params };
    }
    return { text, answer: null, note: 'undetermined' };
  }
  // #496 — a POINT's coordinates, answered from the PANEL'S OWN per-component stability machinery.
  // `dataView.pointCoords` already decides what is knowledge (a coordinate identical in every sampled
  // configuration), prints the partial form when only some components are forced, and upgrades a free
  // component to «+?»/«−?» under a stated sign given. Calling it is the point: a private formatter here
  // would be free to disagree with the ארגון נתונים panel about the same point (the #481 lesson), and
  // the #315 translation anchor would have to be remembered twice.
  if (q.kind === 'point') {
    const entry = dataView(c, seed).pointCoords[q.id];
    return entry ? { text, answer: `${q.id}${entry.text}` } : { text, answer: null, note: 'undetermined' };
  }

  // #317 — a PLANE's canonical equation, through the derivation the panel's planes block shares
  // (`canonicalPlaneEq`). A NAMED plane is read from the resolve; a bare point RUN needs no
  // declaration — the ring's own plane is derived from its positions, which is what makes «מישור ABC»
  // answerable as a QUESTION instead of only as a figure-changing fact.
  if (q.kind === 'plane') {
    // #315: the d-term is translation-dependent, so an equation is gauge until a real point injection
    // anchors the frame. The panel carries this same explicit gate — cross-sample agreement alone does
    // not catch it, because an unanchored figure can still be placed identically at every seed.
    // #813 (ADR-3D-181): NO FRAME is not "not determined by the givens" — nothing is wrong with the
    // givens; the student has not placed the figure in a coordinate system, and everything EXCEPT
    // placement may be known. One note for two states told the student the tool knew nothing about a
    // plane whose area and relations it was printing inches above. The frameless case gets its own
    // note and still reports what IS knowledge (the plane's seed-invariant properties).
    if (!translationKnown3(c)) return framelessPlane(c, text, q, seed);
    const resolvedPer = seeds.map((sd) => resolve3(c, sd));
    const per = resolvedPer.map((r) => {
      if (q.name) return r.planes.get(q.name);
      const pts = q.ids!.map((id) => r.positions.get(id));
      if (pts.some((p) => !p)) return undefined;
      const ring = pts as Vec3[];
      const n = runNormal(ring);
      return norm3(n) < 1e-9 ? undefined : { n, d: -dot3(n, ring[0]) };
    });
    const eq = canonicalPlaneEq(per);
    if (!eq) return { text, answer: null, note: 'undetermined' };
    // A plane has TWO standard representations and the panel has always printed both (operator,
    // 2026-08-15: "whenever giving a plane, always give both representations if possible"). Derived by
    // the SAME helper the panel calls, so the two forms can never describe different planes. "If
    // possible" is the honesty half: the parametric form needs a stable anchor and stable spanning
    // edges, and an equation-given plane has no run at all — in those cases the standard form stands
    // alone rather than a sampled parametrisation being invented to fill the slot.
    const run = q.ids ?? c.pointPlanes.get(q.name!);
    const par = parametricPlaneForm(run, resolvedPer.map((r) => r.positions));
    return { text, answer: par ? `${planeEqStr(eq)}  |  ${par}` : planeEqStr(eq) };
  }

  const vals = seeds.map((s) => {
    const r = resolve3(c, s);
    return evalQuery(c, q, r.positions, { lines: r.lines, planes: r.planes });
  });
  if (vals.some((v) => v === null || !Number.isFinite(v))) return { text, answer: null, note: 'unavailable' };
  const nums = vals as number[];
  const val0 = stableNums(vals);
  if (val0 === null) {
    // undetermined — but does it settle once a free named parameter α is fixed? Then «depends on α».
    const pin = pinFreeMeasures(c);
    if (pin && stableNums(seeds.map((s) => {
      const r = resolve3(pin.c, s);
      return evalQuery(pin.c, q, r.positions, { lines: r.lines, planes: r.planes });
    })) !== null) {
      return { text, answer: null, note: 'depends', param: pin.params };
    }
    return { text, answer: null, note: 'undetermined' };
  }
  // angles and a free PARAMETER «t» (an affine ratio along a segment) are scale-invariant — knowledge
  // whenever they are stable, no scale needed. A dot/length/area/volume still needs the scale pinned.
  const scaleFree = q.kind === 'angle-vertex' || q.kind === 'angle-vec' || q.kind === 'symbol' || q.kind === 'line-plane' || q.kind === 'plane-plane';
  if (!scaleFree && !scaleKnown3(c) && Math.abs(nums[0]) > 1e-9) return { text, answer: null, note: 'scale' };
  const isAngle = q.kind === 'angle-vertex' || q.kind === 'angle-vec' || q.kind === 'line-plane' || q.kind === 'plane-plane';
  return { text, answer: `${cleanNum(nums[0])}${isAngle ? '°' : ''}` };
}
