/**
 * The VALUES PANEL (#217, ADR-410) — the 2-D "organize your data" derivation: every fixed/known
 * value the figure carries, stated and derived alike, computed from the ONE shared sample pool
 * (M3 — never a second sampler) and printed only under the knowledge discipline: a number is shown
 * when it is IDENTICAL across every sampled configuration (`freeDofCount === 0` figures accept any
 * pool; sampled figures need ≥ 4 agreeing samples — the ADR-295/#88 gate). The 3-D `dataView`
 * precedent, COPIED never imported (docs/20 §12).
 *
 * Pure and thread-agnostic: takes constructions + positions samples (+ per-sample circles), returns
 * small rows. The replay layer wires it to `sharedSamples` and the worker (`computeValues`); the
 * App renders rows (exact forms via the shared recognizer in @/format — #164's formatter extended,
 * never a sixth ad-hoc one).
 */

import { exactFormOf, formatExactText, formatMeasure, formatUnitText, type ExactForm, type UnitValue } from '@/format';
import { figureEdges } from './relations';
import { freeDofCount, scalePinned } from './sample';
import { polygonArea } from './geometry';
import type { AnyCommand, Construction, Id, Vec } from './types';

export interface ValueRow {
  kind: 'length' | 'angle' | 'radius' | 'area' | 'perimeter';
  /** ids to highlight on the canvas when the row is clicked (endpoints / wedge / polygon / centre). */
  ids: Id[];
  /** the math label — 'AB', '∠ABC', 'O' (radius), 'ABC' (area). The App adds the i18n dressing. */
  label: string;
  value: number;
  /** the recognized exact form (4√2, 9π, 3/4) — the UI typesets it (MathML); null ⇒ 2-decimal fallback. */
  exact: ExactForm | null;
  /** נתון (stated by the student) vs נגזר (forced by the figure). */
  stated: boolean;
  /**
   * The value in the student's DECLARED unit (#427) — `a`, `a√2`, `a²`. Present only when the figure
   * carries a unit ({@link declaredLengthUnit}) and this row's ratio to it is seed-invariant; the UI
   * prints it INSTEAD of `value`, which under a free similarity gauge is only the drawing's scale.
   */
  unit?: UnitValue;
}

/**
 * The student's declared length unit (#427): `AB = a` binds the unit `a` to |AB|; `AB = 3x` binds `x`
 * to |AB|/3. Read off the same symbol table the lowering uses ([ADR-031](docs/06-decisions.md#adr-031),
 * `lower.ts`) so the panel and the engine can never disagree about what the symbol means.
 */
export interface DeclaredUnit {
  sym: string;
  /** the representative segment: |a→b| = `coef` · sym, so the unit length is |a→b| / coef. */
  a: Id;
  b: Id;
  coef: number;
  /** every segment the student annotated with this symbol — those rows are נתון, not נגזר. */
  statedRefs: [Id, Id][];
}

/**
 * Which symbol (if any) the figure's magnitudes should be expressed in.
 *
 * A var qualifies as a unit when it is a LENGTH binding that stays symbolic: no value given (a valued
 * var is lowered to real distances — the scale is then pinned and plain numbers are the right answer),
 * exponent 1 and no additive constant (`12√x` / `k+2` are not linear multiples of a unit, so expressing
 * other lengths in them would be arithmetic the student never wrote).
 *
 * TWO independent symbols withhold rather than guess (the operator's scoping call): on a determined
 * figure |CD|/|AB| is fixed, so everything COULD be printed in `a` — but a student who named `b` did not
 * ask to read `CD` as `1.5a`.
 */
export function declaredLengthUnit(cmds: AnyCommand[]): DeclaredUnit | null {
  const valued = new Set<string>();
  for (const c of cmds) if (c.type === 'set-var') valued.add(c.name);
  const bySym = new Map<string, DeclaredUnit>();
  for (const c of cmds) {
    if (c.type !== 'measure-length' || !('var' in c.expr)) continue;
    const e = c.expr;
    if (valued.has(e.var) || (e.pow ?? 1) !== 1 || (e.const ?? 0) !== 0 || !(e.coef > 0)) continue;
    const cur = bySym.get(e.var);
    if (cur) cur.statedRefs.push([c.a, c.b]);
    else bySym.set(e.var, { sym: e.var, a: c.a, b: c.b, coef: e.coef, statedRefs: [[c.a, c.b]] });
  }
  return bySym.size === 1 ? [...bySym.values()][0] : null;
}

/** Areas in a fixed small-rational ratio though neither absolute value is known: S, 2S, ½S… */
export interface AreaClassRow {
  /** polygon labels, e.g. ['ABD', 'ACD'] */
  labels: string[];
  /** the coefficient of each polygon's area relative to the base (first) one. */
  coefs: number[];
  /** the letter — the student's own binding when one exists (ADR-121), else S. */
  letter: string;
  /** ids per polygon for highlight. */
  idsPer: Id[][];
}

export interface ValuesPanelResult {
  rows: ValueRow[];
  areaClasses: AreaClassRow[];
  sampleCount: number;
}

const REL_TOL = 1e-4;

const invariant = (vals: number[]): number | null => {
  if (vals.length === 0 || vals.some((v) => !Number.isFinite(v))) return null;
  const mn = Math.min(...vals);
  const mx = Math.max(...vals);
  return mx - mn <= REL_TOL * Math.max(Math.abs(mx), 1) ? (mn + mx) / 2 : null;
};

const dist = (a: Vec, b: Vec): number => Math.hypot(b.x - a.x, b.y - a.y);
const segKey = (a: Id, b: Id): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
const angleAt = (v: Vec, p: Vec, q: Vec): number => {
  const d1 = { x: p.x - v.x, y: p.y - v.y };
  const d2 = { x: q.x - v.x, y: q.y - v.y };
  const den = Math.max(Math.hypot(d1.x, d1.y) * Math.hypot(d2.x, d2.y), 1e-12);
  return (Math.acos(Math.max(-1, Math.min(1, (d1.x * d2.x + d1.y * d2.y) / den))) * 180) / Math.PI;
};

const exactOrNull = (v: number): ExactForm | null => {
  const f = exactFormOf(v);
  return f && (f.root > 1 || f.pi) ? f : null;
};

export function computeValuesPanel(
  constructions: Construction[],
  samples: Map<Id, Vec>[],
  circlesPerSample: Map<Id, { center: Vec; r: number }>[],
  /** the student's own area letter («נסמן את שטח ABCD ב-S», ADR-121) when one was bound. */
  areaLetter?: string | null,
  /** the declared length unit («AB = a», #427) — every magnitude is then reported as a multiple of it. */
  unit?: DeclaredUnit | null,
): ValuesPanelResult {
  const c = constructions[0];
  const rows: ValueRow[] = [];
  const areaClasses: AreaClassRow[] = [];
  if (!c || samples.length === 0) return { rows, areaClasses, sampleCount: 0 };
  // the knowledge gate (ADR-295/#88): determined figures print on any pool; sampled ones need ≥4
  const enough = samples.length >= 4 || freeDofCount(c) === 0;
  if (!enough) return { rows, areaClasses, sampleCount: samples.length };

  type Measure = (pos: Map<Id, Vec>, i: number) => number | null;
  const samplesOf = (f: Measure): number[] | null => {
    const vals: number[] = [];
    for (const [i, pos] of samples.entries()) {
      const v = f(pos, i);
      if (v === null) return null;
      vals.push(v);
    }
    return vals;
  };
  const per = (f: Measure): number | null => {
    const vals = samplesOf(f);
    return vals === null ? null : invariant(vals);
  };

  // ---- the declared-unit lane (#427) -----------------------------------------------------------
  // The measure divided by the unit length (squared, for an area) in EVERY sample. A ratio is invariant
  // under the similarity gauge, so this survives on figures whose absolute magnitudes are only the
  // drawing's scale — which is exactly when the student's own symbol is the honest thing to print.
  // A pinned SCALE yields to real numbers: once a size given exists the absolute IS knowledge, and the
  // student who wrote «AB = a, BC = 4» is better served learning a = 4 than reading `a` back.
  const useUnit = !!unit && !scalePinned(c);
  const unitCoefOf = (f: Measure, pow: 1 | 2): UnitValue | null => {
    if (!unit || !useUnit) return null;
    const vals: number[] = [];
    for (const [i, pos] of samples.entries()) {
      const v = f(pos, i);
      const pa = pos.get(unit.a);
      const pb = pos.get(unit.b);
      if (v === null || !pa || !pb) return null;
      const u = dist(pa, pb) / unit.coef;
      if (!(u > 1e-9)) return null;
      vals.push(v / Math.pow(u, pow));
    }
    const k = invariant(vals);
    return k === null ? null : { sym: unit.sym, pow, coef: k, exact: exactFormOf(k) };
  };

  // The segments the student themself annotated with the symbol are נתון, not נגזר.
  const unitStated = new Set((unit?.statedRefs ?? []).map(([a, b]) => segKey(a, b)));

  /**
   * Emit one MAGNITUDE row (length / radius / area / perimeter). The row survives when its ABSOLUTE is
   * seed-invariant (as before) OR when only its ratio to the declared unit is — in which case `value`
   * carries the current drawing's measurement for reference and `unit` is what the UI prints.
   */
  const magnitude = (
    kind: ValueRow['kind'], ids: Id[], label: string, stated: boolean, pow: 1 | 2, f: Measure,
  ): void => {
    const vals = samplesOf(f);
    if (vals === null) return;
    const abs = invariant(vals);
    const u = unitCoefOf(f, pow);
    if (abs === null && u === null) return;
    const value = abs ?? vals.reduce((x, y) => x + y, 0) / vals.length;
    rows.push({ kind, ids, label, value, exact: abs === null ? null : exactOrNull(value), stated, ...(u ? { unit: u } : {}) });
  };

  // ---- stated markers (נתון) from the construction's own constraints/objects --------------------
  const statedLen = new Set<string>();
  const statedAng = new Set<string>();
  const statedArea = new Set<string>();
  const statedPerim = new Set<string>();
  for (const con of c.constraints) {
    if (con.type === 'distance') statedLen.add(segKey(con.a, con.b));
    if (con.type === 'angle' && !con.arcOf) statedAng.add(`${con.vertex}|${con.ray1}|${con.ray2}`);
    if (con.type === 'area') statedArea.add([...con.ids].sort().join(''));
    if (con.type === 'perimeter') statedPerim.add([...con.ids].sort().join(''));
  }

  // ---- lengths over the figure's edge universe (the detection layers' own, scaffold-filtered) ---
  for (const [a, b] of figureEdges(c, samples)) {
    magnitude('length', [a, b], `${a}${b}`, statedLen.has(segKey(a, b)) || unitStated.has(segKey(a, b)), 1, (pos) => {
      const p = pos.get(a);
      const q = pos.get(b);
      return p && q ? dist(p, q) : null;
    });
  }

  // ---- angles at polygon corners + stated wedges ------------------------------------------------
  const wedges = new Map<string, [Id, Id, Id]>();
  for (const o of c.objects) {
    if (o.kind === 'polygon') {
      const ids = o.vertices;
      for (let i = 0; i < ids.length; i++) {
        const v = ids[i];
        const p = ids[(i - 1 + ids.length) % ids.length];
        const q = ids[(i + 1) % ids.length];
        wedges.set(`${v}|${p}|${q}`, [v, p, q]);
      }
    }
  }
  for (const con of c.constraints) {
    if (con.type === 'angle' && !con.arcOf) wedges.set(`${con.vertex}|${con.ray1}|${con.ray2}`, [con.vertex, con.ray1, con.ray2]);
  }
  const seenWedge = new Set<string>();
  for (const [, [v, p, q]] of wedges) {
    const canonical = `${v}|${[p, q].sort().join('|')}`;
    if (seenWedge.has(canonical)) continue;
    seenWedge.add(canonical);
    const val = per((pos) => {
      const V = pos.get(v);
      const P = pos.get(p);
      const Q = pos.get(q);
      return V && P && Q ? angleAt(V, P, Q) : null;
    });
    if (val === null) continue;
    rows.push({
      kind: 'angle', ids: [p, v, q], label: `∠${p}${v}${q}`, value: val, exact: null,
      stated: statedAng.has(`${v}|${p}|${q}`) || statedAng.has(`${v}|${q}|${p}`),
    });
  }

  // ---- radii ------------------------------------------------------------------------------------
  for (const o of c.objects) {
    if (o.kind !== 'circle') continue;
    const radiusAt = (_pos: Map<Id, Vec>, i: number) => circlesPerSample[i]?.get(o.id)?.r ?? null;
    // a STATED radius stays via 'length' (free/through/tangent are derived)
    magnitude('radius', [o.center], o.center, o.radius.via === 'length', 1, radiusAt);
    // The circle's area AND circumference ride the same knowledge — both are the same one-step derivation
    // from the same radius, so printing one and withholding the other read as an oversight (#414). ADR-228
    // already lowers a STATED circumference to a radius (r = C/2π); this is that constant forwards.
    magnitude('area', [o.center], `(${o.center})`, false, 2, (pos, i) => {
      const r = radiusAt(pos, i);
      return r === null ? null : Math.PI * r * r;
    });
    magnitude('perimeter', [o.center], `(${o.center})`, false, 1, (pos, i) => {
      const r = radiusAt(pos, i);
      return r === null ? null : 2 * Math.PI * r;
    });
  }

  // ---- polygon areas + ratio classes ------------------------------------------------------------
  const polys = c.objects.filter((o) => o.kind === 'polygon');
  const areaOf = (ids: Id[], pos: Map<Id, Vec>): number | null => {
    const pts = ids.map((id) => pos.get(id));
    return pts.every((p): p is Vec => !!p) ? Math.abs(polygonArea(pts)) : null;
  };
  const perPolyVals: (number[] | null)[] = polys.map((o) => {
    const vals: number[] = [];
    for (const pos of samples) {
      const v = areaOf(o.vertices, pos);
      if (v === null) return null;
      vals.push(v);
    }
    return vals;
  });
  polys.forEach((o) => {
    magnitude('area', [...o.vertices], o.vertices.join(''), statedArea.has([...o.vertices].sort().join('')), 2, (pos) =>
      areaOf(o.vertices, pos),
    );
  });
  // The polygon twin of the circle's circumference (#414): `perimeter` is a first-class measure and
  // constraint (ADR-228), so a determined polygon's Σ of sides is knowledge the panel should carry beside
  // its area. Same invariance gate as every other row — a figure whose sides are not all fixed prints none.
  polys.forEach((o) => {
    magnitude('perimeter', [...o.vertices], o.vertices.join(''), statedPerim.has([...o.vertices].sort().join('')), 1, (pos) => {
      let sum = 0;
      for (let k = 0; k < o.vertices.length; k++) {
        const p = pos.get(o.vertices[k]);
        const q = pos.get(o.vertices[(k + 1) % o.vertices.length]);
        if (!p || !q) return null;
        sum += dist(p, q);
      }
      return sum;
    });
  });
  // ratio classes (req 3): a fixed small-rational ratio in EVERY sample, even when absolutes vary.
  // Denominator ≤ 4 per the operator's ruling; classes are similarity-gauge-invariant knowledge.
  const rational = (x: number): { p: number; q: number } | null => {
    for (let q = 1; q <= 4; q++) {
      const p = Math.round(x * q);
      if (p >= 1 && p <= 16 && Math.abs(x - p / q) <= 1e-4 * Math.max(x, 1)) return { p, q };
    }
    return null;
  };
  const letter = areaLetter ?? 'S';
  const used = new Set<number>();
  for (let i = 0; i < polys.length; i++) {
    if (used.has(i) || !perPolyVals[i]) continue;
    const cls = { labels: [polys[i].vertices.join('')], coefs: [1], idsPer: [[...polys[i].vertices]] };
    for (let j = i + 1; j < polys.length; j++) {
      if (used.has(j) || !perPolyVals[j]) continue;
      const ratios = perPolyVals[j]!.map((v, k) => v / perPolyVals[i]![k]);
      const rv = invariant(ratios);
      const rat = rv !== null ? rational(rv) : null;
      if (rat) {
        cls.labels.push(polys[j].vertices.join(''));
        cls.coefs.push(rat.p / rat.q);
        cls.idsPer.push([...polys[j].vertices]);
        used.add(j);
      }
    }
    if (cls.labels.length >= 2) {
      used.add(i);
      areaClasses.push({ ...cls, letter });
    }
  }

  return { rows, areaClasses, sampleCount: samples.length };
}


/**
 * Display text for a row's value — the student's own unit when the row carries one (#427: `a√2` beats
 * `5√2`, whose 5 is only the drawing's scale), else exact when recognized, else the 2-decimal fallback.
 */
export const valueText = (row: ValueRow): string =>
  row.unit ? formatUnitText(row.unit) : row.exact ? formatExactText(row.exact) : formatMeasure(row.value);
