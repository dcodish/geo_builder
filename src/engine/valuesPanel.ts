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

/**
 * A quantity the student ASKED for — #477, the 3-D query lane ([ADR-3D-057](../../docs/06b-decisions-3d.md#adr-3d-057),
 * #274) ported as a pattern, never imported.
 *
 * Structured, not text: parsing lives in `@/parser/valueQuery` because the engine may not import the
 * parser (the `engine ← replay ← store` layering). The engine is handed what was meant, and answers it.
 */
export type ValueQuery =
  | { kind: 'angle'; vertex: Id; ray1: Id; ray2: Id }
  | { kind: 'length'; a: Id; b: Id }
  | { kind: 'area'; ids: Id[] }
  | { kind: 'perimeter'; ids: Id[] };

/** Why a query could not be answered. Never a sampled number dressed as a fact (ADR-052). */
/**
 * Every reason a query row can carry INSTEAD of a value.
 *
 * A runtime list, with the type derived from it, because each member needs a locale entry in BOTH
 * `he.json` and `en.json` and nothing else can check that: TypeScript erases a bare union, so
 * `values-panel-notes.test.ts` has to be able to iterate the members. #882 is what this shape prevents —
 * #741 introduced a fifth note (`pending`) as an inline literal, the compiler had no union to reject it
 * against, and the student saw the raw key `values.q.pending` on the panel.
 */
export const QUERY_NOTES = [
  /** the text isn't a quantity this lane understands */
  'not-understood',
  /** it parses, but those points aren't in the figure */
  'unavailable',
  /** the givens don't pin it — it differs across sampled configurations */
  'undetermined',
  /** it carries units and the figure's scale is free, with no declared unit to express it in */
  'scale',
  /**
   * #882 — the question is SAVED but its answer is stale: the values layer is invalidated by every new
   * fact (ADR-W-038), and nothing recomputes until the student asks again or presses «חשב ערכים».
   *
   * Deliberately not worded as "computing…", which would be a lie — no work is in flight. The row says
   * what is true (the answer is waiting) and what to do about it, which is guideline 8 in docs/10.
   */
  'pending',
] as const;

export type QueryNote = (typeof QUERY_NOTES)[number];

/** One answered (or honestly refused) query. */
export interface QueryRow {
  /** exactly what the student typed — echoed back so the list reads as their own questions. */
  text: string;
  kind: ValueQuery['kind'] | null;
  /** the canonical label («∠GBC»), or null when the text wasn't understood. */
  label: string | null;
  /** ids to highlight on the canvas, as with a `ValueRow`. */
  ids: Id[];
  value: number | null;
  exact: ExactForm | null;
  unit?: UnitValue;
  note?: QueryNote;
}

/** A query as it arrives: the student's text, plus its parse (null ⇒ not understood). */
export interface QueryInput {
  text: string;
  q: ValueQuery | null;
}

export interface ValuesPanelResult {
  rows: ValueRow[];
  areaClasses: AreaClassRow[];
  sampleCount: number;
  /** answers to the student's own questions (#477) — empty when none were asked. */
  queryRows: QueryRow[];
}

const REL_TOL = 1e-4;

/** The canonical label for a query — the same notation the auto rows use, so the two lists read alike. */
export function queryLabel(q: ValueQuery): string {
  switch (q.kind) {
    case 'angle': return `∠${q.ray1}${q.vertex}${q.ray2}`;
    case 'length': return `${q.a}${q.b}`;
    case 'area': return `(${q.ids.join('')})`;
    case 'perimeter': return `${q.ids.join('')}`;
  }
}

/** The point ids a query refers to — all of them must exist before it can be answered. */
const queryIds = (q: ValueQuery): Id[] =>
  q.kind === 'angle' ? [q.ray1, q.vertex, q.ray2] : q.kind === 'length' ? [q.a, q.b] : q.ids;

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
  /** the student's own questions (#477) — answered from THIS pool, never a second sampler (M3). */
  queries: QueryInput[] = [],
): ValuesPanelResult {
  const c = constructions[0];
  const rows: ValueRow[] = [];
  const areaClasses: AreaClassRow[] = [];
  /** Refuse every query for one reason — the paths that can answer nothing at all. */
  const allRefused = (note: QueryNote): QueryRow[] =>
    queries.map((qi) => ({
      text: qi.text,
      kind: qi.q?.kind ?? null,
      label: qi.q ? queryLabel(qi.q) : null,
      ids: [],
      value: null,
      exact: null,
      note: qi.q ? note : 'not-understood',
    }));
  if (!c || samples.length === 0) return { rows, areaClasses, sampleCount: 0, queryRows: allRefused('undetermined') };
  // the knowledge gate (ADR-295/#88): determined figures print on any pool; sampled ones need ≥4
  const enough = samples.length >= 4 || freeDofCount(c) === 0;
  if (!enough) return { rows, areaClasses, sampleCount: samples.length, queryRows: allRefused('undetermined') };

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
  //
  // #426 (ADR-421) makes that same question the gate on the ABSOLUTE lane too: under the free similarity
  // gauge the solver picks the world scale itself (the default 5), so a length/area/perimeter/radius read
  // off such a figure is a per-drawing measure — printing it asserts a size the question never gave
  // ([ADR-052](docs/06-decisions.md#adr-052)). The seed-invariance gate above cannot catch it: `freeDofCount`
  // deliberately subtracts the free gauge (ADR-101), so a shape-rigid figure samples ONCE and every
  // magnitude trivially agrees with itself. ANGLES and the area RATIO classes are scale-free and keep
  // printing on the very same figure — that asymmetry is the whole point.
  const sized = scalePinned(c);
  const useUnit = !!unit && !sized;
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
   * Emit one MAGNITUDE row (length / radius / area / perimeter). Exactly one lane can speak: with the scale
   * PINNED the absolute is knowledge when seed-invariant (#426); without it only the ratio to a declared
   * unit is (#427), and `value` then carries the current drawing's measurement purely for reference. A
   * figure that is neither sized nor given a unit emits no magnitude at all — that silence IS the fix.
   */
  const magnitude = (
    kind: ValueRow['kind'], ids: Id[], label: string, stated: boolean, pow: 1 | 2, f: Measure,
  ): void => {
    if (!sized && !useUnit) return;
    const vals = samplesOf(f);
    if (vals === null) return;
    const abs = sized ? invariant(vals) : null;
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
  // (the edge sweep is real work — skip it outright when no lane can speak)
  for (const [a, b] of sized || useUnit ? figureEdges(c, samples) : []) {
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

  // ---- the QUERY lane (#477) --------------------------------------------------------------------
  // The student names a quantity and gets it back WHEN IT IS KNOWLEDGE. Answered from the very helpers
  // the rows above use — `samplesOf`/`invariant` for seed-invariance, `sized`/`unitCoefOf` for the
  // scale discipline — because a query resolved by any other path could contradict the rows printed
  // directly above it, which is worse than not answering. That is the M3 "never a second sampler" rule
  // applied to a second CONSUMER, not just a second sampler.
  //
  // The asymmetry is the whole honesty story, and it is the same one the rows obey: an ANGLE is
  // scale-free, so it answers whenever the shape is determined; a LENGTH/AREA/PERIMETER carries units,
  // so under a free similarity gauge the number is only this drawing's scale — refused as `scale`
  // unless the student declared a unit (#427), in which case it answers as a multiple of their own
  // symbol. Everything unanswerable says WHY (ADR-052).
  const known = new Set(samples[0].keys());
  const queryRows: QueryRow[] = queries.map((qi) => {
    const q = qi.q;
    const base = { text: qi.text, kind: q?.kind ?? null, label: q ? queryLabel(q) : null, ids: [] as Id[], value: null, exact: null };
    if (!q) return { ...base, note: 'not-understood' as const };
    const ids = queryIds(q);
    if (ids.some((id) => !known.has(id))) return { ...base, note: 'unavailable' as const };

    const measure: Measure =
      q.kind === 'angle'
        ? (pos) => { const V = pos.get(q.vertex), P = pos.get(q.ray1), Q = pos.get(q.ray2); return V && P && Q ? angleAt(V, P, Q) : null; }
        : q.kind === 'length'
        ? (pos) => { const A = pos.get(q.a), B = pos.get(q.b); return A && B ? dist(A, B) : null; }
        : q.kind === 'perimeter'
        ? (pos) => { const pts = q.ids.map((id) => pos.get(id)); return pts.every(Boolean) ? q.ids.reduce((sum, _id, i) => sum + dist(pts[i]!, pts[(i + 1) % pts.length]!), 0) : null; }
        : (pos) => { const pts = q.ids.map((id) => pos.get(id)); return pts.every(Boolean) ? Math.abs(polygonArea(pts as Vec[])) : null; };

    if (q.kind === 'angle') {
      const val = per(measure);
      return val === null
        ? { ...base, ids, note: 'undetermined' as const }
        : { ...base, ids, value: val, exact: exactOrNull(val) };
    }
    // a magnitude: the scale discipline decides which lane may speak
    if (!sized && !useUnit) return { ...base, ids, note: 'scale' as const };
    const vals = samplesOf(measure);
    if (vals === null) return { ...base, ids, note: 'undetermined' as const };
    const pow = q.kind === 'area' ? 2 : 1;
    const abs = sized ? invariant(vals) : null;
    const u = unitCoefOf(measure, pow);
    if (abs === null && u === null) return { ...base, ids, note: 'undetermined' as const };
    const value = abs ?? vals.reduce((x, y) => x + y, 0) / vals.length;
    return { ...base, ids, value, exact: abs === null ? null : exactOrNull(value), ...(u ? { unit: u } : {}) };
  });

  return { rows, areaClasses, sampleCount: samples.length, queryRows };
}


/**
 * Display text for a row's value — the student's own unit when the row carries one (#427: `a√2` beats
 * `5√2`, whose 5 is only the drawing's scale), else exact when recognized, else the 2-decimal fallback.
 */
export const valueText = (row: ValueRow): string =>
  row.unit ? formatUnitText(row.unit) : row.exact ? formatExactText(row.exact) : formatMeasure(row.value);
