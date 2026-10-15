/**
 * THE GIVENS FORCED A NARROWER KIND, SAID OUT LOUD (#1996, ADR-AG-276 — the analytic half of ADR-W-129).
 *
 * A declared ring the givens force into a strictly narrower named kind — «מקבילית ABCD · ABCD חסום במעגל» drawn as a
 * rectangle, «מקבילית ABCD · AB = BC» as a rhombus — was drawn as that kind without a word. The decision is shared
 * (`shell/narrowing.ts`: the lattice, the per-sample classifier, the attribution, the cause slot, the sentence); this
 * module is analytic's adapter, the twin of 2-D's `src/replay/narrowing.ts`:
 *
 * - **The declared kind** is the noun as TYPED, adjective included — the polygon fact's registry noun mapped through
 *   `SHAPES[noun].kind`, counted only when the line's own text names that noun. «ABCD חסום במעגל» lowers its ring as
 *   a «מרובע» (the inscription's default phrase), but the student named no noun, so that ring has no declared kind
 *   and never gets the note.
 * - **The forced kind** is read off the CONFIGURATION POOL (`configurationPool`, `POOL_SIZE` seeds, ADR-AG-180) and
 *   only a COMPLETE one. On the page the pool is deferred and completes after the render; an incomplete pool reports
 *   pending (so `poolScheduler` re-renders when it completes) and shows nothing — never a provisional note.
 * - **The cause** is the first statement that forces it plus what it needs (`attributeCause`), each subset judged by
 *   re-deriving the lines with the others removed (as `shapeWarnings` re-derives prefixes): not forced at its first
 *   counterexample seed, forced only on its full pool. Paid only when a narrowing exists.
 *
 * Pure over `(lines, d)` — derived like everything else on the page, so muting the cause line removes the note and
 * re-deriving the same lines says the same. It moves no point.
 */
import { derive, type Derivation } from '../engine/derive';
import { admittedToPool, configurationPool, drawableAt, POOL_SIZE, reportPending, type Figure } from '../engine/evaluate';
import { ANGLE_STEM_HE, EN_SHAPE, normalizeShapeNoun, shapeRow } from '../engine/shapes';
import { CIRCLE_SENTINEL, type Fact, type Id } from '../engine/types';
import { parseLine } from '../parser/parseAnalytic';
import {
  attributeCause,
  causeSlot,
  declaredKindOf,
  forcedUnder,
  isRingRightAngle,
  narrowingOf,
  narrowingSentence,
  narrowRingKey,
  ringKinds,
  silentByValues,
  type CauseClass,
  type NarrowKind,
  type NarrowTranslate,
  type NarrowingNote,
} from '../../shell/narrowing';

/** One forced-narrowing note, with the ACTIVE indices of the lines its cause names (in typed order). */
export interface AnalyticNarrowing {
  ring: string;
  from: NarrowKind;
  to: NarrowKind;
  cause: NarrowingNote['cause'];
  /** The active line index of each given the sentence names — its text is that line as typed. */
  causeLines: number[];
}

/** What one line says, for this module: the nouns it typed (ring + kind), its facts, and its class. */
interface LineInfo {
  nouns: Array<{ ring: Id[]; kind: NarrowKind }>;
  facts: Fact[];
}

const ANGLE_TEXT = new RegExp(`${ANGLE_STEM_HE}ת|∠|\\bangle\\b`, 'i');

/** Does the line's own text name `noun` (any spelling the registry folds, or its English alias)? */
function typesNoun(line: string, noun: string): boolean {
  const key = normalizeShapeNoun(noun);
  if (normalizeShapeNoun(line).includes(key)) return true;
  const low = line.toLowerCase();
  return Object.entries(EN_SHAPE).some(([en, he]) => he === key && new RegExp(`\\b${en}\\b`).test(low));
}

/** Every fact of a line, a described circle's creation included (`the-circle` wraps it). */
const flatFacts = (facts: readonly Fact[]): Fact[] =>
  facts.flatMap((f): Fact[] => (f.t === 'the-circle' ? [f, ...flatFacts(f.create)] : [f]));

function lineInfo(line: string): LineInfo {
  const r = parseLine(line);
  const facts = r.ok ? flatFacts(r.facts) : [];
  const nouns: LineInfo['nouns'] = [];
  for (const f of facts) {
    if (f.t !== 'polygon' || !f.noun) continue;
    const kind = shapeRow(f.noun)?.kind;
    if (kind && typesNoun(line, f.noun)) nouns.push({ ring: [...f.vertices], kind });
  }
  return { nouns, facts };
}

/** An expression with no symbol in it — a stated number. */
const isConst = (e: unknown): boolean => e !== undefined && !JSON.stringify(e).includes('"kind":"sym"');
const isNum = (e: { kind: string } | undefined): boolean => !!e && e.kind === 'num';

/**
 * What one line is, for the sentence. A noun's own lowering (`definition: true` constraints, ADR-AG-225) is the noun,
 * not a given; a line that only creates or names (a noun, «מעגל O», a segment, a point by free parameters) is a definition.
 */
export function lineClass(line: string, facts: readonly Fact[], isCircle: (curve: string) => boolean): CauseClass {
  let circum = false;
  let incircle = false;
  let value = false;
  let relation = false;
  const angleText = ANGLE_TEXT.test(line);
  // The Pitot condition a circle inscribed in a quadrilateral lowers to is that circle's own, not a second given.
  const hasIncircle = facts.some((f) => f.t === 'circle-thru' && f.def.t === 'incircle');
  if (hasIncircle) incircle = true;
  for (const f of facts) {
    switch (f.t) {
      case 'circle-thru':
        if (f.def.t === 'incircle') incircle = true;
        else circum = true;
        break;
      case 'on-kind':
        if (f.kind === 'circle') circum = true;
        else relation = true;
        break;
      case 'point':
        // A coordinate pin STATES a position — a numeric value, as the «נתון:» list already counts it (#1872: «a value
        // always makes a given: coordinates»). A point named only by free parameters («A(a, b)») places nothing.
        if (isConst(f.x) || isConst(f.y)) value = true;
        break;
      case 'right-angle':
        value = true; // «זווית C = 90» / «זווית C ישרה» — a typed 90°
        break;
      case 'vertex-angle':
        if (f.rhs.t === 'value') value = true;
        else relation = true;
        break;
      case 'constraint': {
        if (f.definition) break;
        const k = f.k;
        if (k.t === 'on-curve') {
          if (isCircle(k.curve)) circum = true;
          else relation = true;
        } else if (k.t === 'length-eq') {
          if (hasIncircle) break;
          if (k.left.terms.length === 0 || k.right.terms.length === 0) value = true;
          else relation = true;
        } else if (k.t === 'angle') {
          if (isNum(k.value as { kind: string })) value = true;
          else relation = true;
        } else if (k.t === 'relation' && k.rel === 'perpendicular' && angleText) {
          value = true; // «זווית DAB = 90» lowers to ⊥ — the sentence typed a value
        } else {
          relation = true;
        }
        break;
      }
      case 'polygon':
      case 'selector':
      case 'declare':
      case 'segment':
      case 'param':
      case 'circle-at':
      case 'line-2pt':
      case 'curve':
      case 'the-circle':
        break;
      default:
        relation = true;
    }
  }
  if (relation || (value && (circum || incircle))) return 'relation';
  if (circum) return 'circum';
  if (incircle) return 'incircle';
  if (value) return 'value';
  return 'definition';
}

/** A right angle typed on a triangle ring's own corner — «זווית C = 90», «זווית ACB = 90», «AC ⊥ BC» (card 3). */
function typedRightAngleFact(f: Fact, ring: readonly Id[]): boolean {
  if (ring.length !== 3) return false;
  if (f.t === 'right-angle') {
    const others = ring.filter((p) => p !== f.id);
    return others.length === 2 && isRingRightAngle(ring, f.id, others[0], others[1]);
  }
  if (f.t === 'vertex-angle' && f.rhs.t === 'value' && isNum(f.rhs.value as { kind: string }) && !f.rhs.measure) {
    const v = (f.rhs.value as { value?: number }).value;
    const at = (f.left as { v?: Id; a?: Id; b?: Id });
    if (v !== 90 || !at.v) return false;
    const others = ring.filter((p) => p !== at.v);
    return others.length === 2 && isRingRightAngle(ring, at.v, others[0], others[1]);
  }
  if (f.t === 'constraint' && !f.definition) {
    const k = f.k;
    if (k.t === 'angle' && isNum(k.value as { kind: string }) && (k.value as { value?: number }).value === 90) {
      const at = k.at as { v: Id; a: Id; b: Id };
      return isRingRightAngle(ring, at.v, at.a, at.b);
    }
    if (k.t === 'relation' && k.rel === 'perpendicular' && k.u.k === 'points' && k.v.k === 'points') {
      const s1 = [k.u.a, k.u.b];
      const s2 = [k.v.a, k.v.b];
      const shared = s1.filter((p) => s2.includes(p));
      if (shared.length !== 1) return false;
      const v = shared[0];
      return isRingRightAngle(ring, v, s1.find((p) => p !== v)!, s2.find((p) => p !== v)!);
    }
  }
  return false;
}

/** The structural facts a typed right angle line may carry beside the angle itself (its sides' segments). */
const RIGHT_ANGLE_COMPANIONS = new Set(['segment', 'declare', 'selector']);

const memo = new WeakMap<Derivation, { lines: readonly string[]; notes: AnalyticNarrowing[] }>();

/** The figure's positions by id. */
const positionsOf = (f: Figure): Map<Id, readonly [number, number]> => new Map(f.points.map((p) => [p.id, [p.x, p.y] as const]));

/**
 * Every forced-narrowing note the figure warrants — `[]` while the pool is incomplete (a deferred pool reports
 * pending, so the page re-renders when it completes).
 */
export function narrowingNotesOf(lines: readonly string[], d: Derivation): AnalyticNarrowing[] {
  const hit = memo.get(d);
  if (hit && hit.lines.length === lines.length && hit.lines.every((l, i) => l === lines[i])) return hit.notes;
  const c = d.construction;
  if (!c.objects.some((o) => o.kind === 'polygon')) return [];
  const pool = configurationPool(c);
  if (!pool.complete()) {
    if (pool.deferred) {
      reportPending(c);
      return [];
    }
    pool.fill();
  }
  const notes = compute(lines, d);
  memo.set(d, { lines: [...lines], notes });
  return notes;
}

/** The admitted figures of a construction's pool, evaluated in seed order; `stop` ends the walk early. */
function walkPool(c: Derivation['construction'], visit: (f: Figure) => boolean): void {
  for (let s = 0; s < POOL_SIZE; s += 1) {
    const f = drawableAt(c, s);
    if (!admittedToPool(f)) continue;
    if (!visit(f)) return;
  }
}

function compute(lines: readonly string[], d: Derivation): AnalyticNarrowing[] {
  const infos = lines.map(lineInfo);
  const isCircle = (curve: string): boolean =>
    curve === CIRCLE_SENTINEL || curve.startsWith('circle') || d.figure.curves.some((k) => k.id === curve && k.curve.kind === 'circle');
  const classes = lines.map((l, i) => lineClass(l, infos[i].facts, isCircle));
  // the declared rings: every typed noun over the same ring (any rotation), with the lines that typed them
  const rings = new Map<string, { ids: Id[]; kinds: NarrowKind[]; rows: Set<number> }>();
  infos.forEach((info, i) => {
    for (const n of info.nouns) {
      const rk = narrowRingKey(n.ring);
      const r = rings.get(rk) ?? { ids: n.ring, kinds: [], rows: new Set<number>() };
      r.kinds.push(n.kind);
      r.rows.add(i);
      rings.set(rk, r);
    }
  });
  const seedNames = d.construction.seedNames ?? {};
  const out: AnalyticNarrowing[] = [];
  for (const ring of rings.values()) {
    const carve = lines
      .map((_, i) => i)
      .filter((i) => {
        const fs = infos[i].facts;
        return (
          fs.some((f) => typedRightAngleFact(f, ring.ids)) &&
          fs.every((f) => typedRightAngleFact(f, ring.ids) || RIGHT_ANGLE_COMPANIONS.has(f.t))
        );
      });
    const declared = declaredKindOf(ring.kinds, carve.length > 0);
    if (!declared) continue;
    const kindsIn = (f: Figure): Set<NarrowKind> => {
      const at = positionsOf(f);
      const pts = ring.ids.map((id) => at.get(id));
      return pts.every((p): p is readonly [number, number] => !!p) ? ringKinds(pts) : new Set<NarrowKind>();
    };
    const perSample: Set<NarrowKind>[] = [];
    walkPool(d.construction, (f) => {
      perSample.push(kindsIn(f));
      return true;
    });
    const forced = forcedUnder(declared, perSample);
    const narrowing = forced && narrowingOf(declared, forced);
    if (!narrowing) continue;
    // the anchors: the pure noun lines of this ring and its typed right angle — present in every trial
    const anchors = new Set([...[...ring.rows].filter((i) => classes[i] === 'definition'), ...carve]);
    const candidates = lines.map((_, i) => i).filter((i) => !anchors.has(i));
    if (silentByValues(narrowing.from, candidates.map((i) => classes[i]))) continue; // ruled silent — no search
    const isForced = (chosen: readonly number[]): boolean => {
      const on = new Set([...anchors, ...chosen.map((j) => candidates[j])]);
      const sub = lines.filter((_, i) => on.has(i));
      const c = derive(sub, d.seed, seedNames).construction;
      const kept: Set<NarrowKind>[] = [];
      let counterexample = false;
      walkPool(c, (f) => {
        const k = kindsIn(f);
        // a configuration that IS the declared kind but not the narrower one settles "not forced"
        if (k.has(declared) && !k.has(narrowing.to)) {
          counterexample = true;
          return false;
        }
        kept.push(k);
        return true;
      });
      return !counterexample && (forcedUnder(declared, kept)?.has(narrowing.to) ?? false);
    };
    const { rows: cause } = attributeCause(candidates.length, isForced);
    // the declaring lines alone force it: nothing the GIVENS did, so nothing to say
    if (cause !== null && cause.length === 0) continue;
    const slot = causeSlot(cause, candidates.map((i) => classes[i]), narrowing.from);
    if (slot.kind === 'silent') continue;
    const named = slot.kind === 'given' ? [slot.row] : slot.kind === 'givens' ? slot.rows : [];
    out.push({ ring: ring.ids.join(''), from: narrowing.from, to: narrowing.to, cause: slot, causeLines: named.map((j) => candidates[j]) });
  }
  return out;
}

/**
 * The note as the student reads it — one sentence of the shared family from this product's `narrowed.*` keys. `given`
 * returns the text of an active line as the student typed it (the page passes a fallback-built row's spoken text,
 * isolated); `ring` the ring's label as shown.
 */
export function narrowingText(
  n: AnalyticNarrowing,
  t: NarrowTranslate,
  given: (activeIndex: number) => string,
  ring: (label: string) => string = (s) => s,
): string {
  return narrowingSentence({ ring: ring(n.ring), from: n.from, to: n.to, cause: n.cause, givens: n.causeLines.map(given) }, t, 'narrowed');
}
