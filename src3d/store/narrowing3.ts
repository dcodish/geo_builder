/**
 * #1996 ([ADR-3D-343](../../docs/06b-decisions-3d.md#adr-3d-343), the 3-D half of
 * [ADR-W-129](../../docs/06w-decisions-workspace.md#adr-w-129)) — THE GIVENS FORCED A NARROWER KIND, SAID OUT LOUD.
 *
 * Before this, 3-D's two notices (`base-constrained`, `inscribed-constrained`) were keyed on the declared noun's
 * BASE through `CYCLIC_MEMBER`: they fired when nothing was narrowed (a declared «טרפז שווה שוקיים», #1915), named
 * the circle when a typed right angle had already done it, and said nothing about any other given («מקבילית ABCD ·
 * |AB| = |BC|» drew a rhombus silently). The shared decision (`shell/narrowing.ts`) compares the kind DECLARED with
 * the kind FORCED across the claims' own sample bar, and attributes the statements that forced it; this module is
 * 3-D's adapter — the reference is 2-D's `src/replay/narrowing.ts`:
 *
 * - **The declared kind** of each ring is the noun as typed, adjective included: a quad's `quad-shape` /
 *   quad-pyramid base through {@link declaredKind3} (the `adj` the phrase consumed), a triangle's from the
 *   lexicon's ONE shape-phrase reader on the row's own utterance (a triangle's adjective lowers to bare relations,
 *   so the construction cannot say it). A ring no noun named has no declared kind and never gets the note.
 * - **The forced kind** is read off `knowledgeSamples3(c, claimSeeds(seed))` — every base seed × every parameter
 *   branch, the claims' invariance bar — in 3-D coordinates (`ringKinds` takes any dimension), widened by further
 *   claim-bar groups only while too few samples are the declared kind ({@link KEPT_WANTED}). Unplaced samples
 *   (`pivot.solutions === 0`) are no configuration and are skipped.
 * - **The cause** is the first statement that forces it plus what it needs (`attributeCause`), each subset judged
 *   on its own construction (a subset derive — the same fold, rows muted with `enabled: false`), paid only when a
 *   note exists, memoized on the facts array.
 *
 * Pure over `(facts, seed)`: the note is DERIVED, so muting the cause removes it and a reload says what typing
 * said; it moves no point.
 */
import {
  attributeCause,
  CO_CAUSE_CAP,
  causeSlot,
  declaredKindOf,
  forcedUnder,
  isRingRightAngle,
  mergeOf,
  narrowingOf,
  narrowRingKey,
  ringKinds,
  silentByValues,
  type CauseClass,
  type NarrowKind,
  type NarrowingNote,
} from '../../shell/narrowing';
import { claimSeeds } from '../engine/claims';
import { knowledgeSamples3 } from '../engine/evaluate';
import { sampleStats } from '../engine/rng';
import { declaredKind3, QUAD_PYRAMIDS } from '../engine/baseShapes';
import { readShapePhrase3 } from '../lexicon/shapePhrase3';
import type { Command3, Construction3, Id, Positions3 } from '../engine/types';
import type { NarrowedRing3 } from '../engine/notices';

/** The fact shape this module reads (the store's `Fact3`, without importing the store — no cycle). */
export interface NFact3 {
  id: string;
  utterance: string;
  cmds: Command3[];
  enabled: boolean;
}

/** Commands that only create or name (a point, a segment, a circle, a plane, a noun): no relation of their own. */
const DEFINITION_CMDS = new Set<string>([
  'solid', 'quad-shape', 'rect-complete', 'segment3', 'point-on-segment3', 'midpoint-auto', 'name-vector',
  'angle-mark', 'length-mark', 'centroid3', 'diag-intersection', 'seg-crossing3', 'quad-diagonals', 'point-in-span', 'param-decl',
  'param-sign', 'plane3', 'free-plane', 'free-line', 'line3', 'circle3', 'plane-through', 'line-through', 'draw-arrow',
  'revolution', 'plane-plane-line', 'line-plane-point', 'foot-on-plane', 'foot-on-line', 'line-projection',
  'line-common-perp', 'bisector-ray',
]);
/** Commands that state a NUMBER on the figure (a length, an angle, an area, a volume, a coordinate). */
const VALUE_CMDS = new Set<string>(['vertex-angle', 'vec-mag', 'mag-val', 'distance-rel', 'symbol-value', 'inject-vector', 'inject-pair', 'dot-given']);
/** The claim kinds that state a number (every other claim relates two things). */
const VALUE_CLAIMS = new Set<string>([
  'length-eq', 'area-eq', 'coords-eq', 'angle-seg-eq', 'vertex-angle-eq', 'volume-eq', 'lateral-area-eq', 'surface-area-eq',
  'volume-poly', 'cos-angle-eq', 'vec-val', 'dot-val', 'mag-val', 'line-plane-angle', 'plane-eq',
]);

/**
 * What one row is, for the sentence: a circle through every vertex of a ring, a right pyramid over its base, a
 * numeric value, any other relation, or a definition. A noun's OWN lowering (`origin: 'shape'` — the equilateral's
 * equal pairs, the isosceles trapezoid's diagonals, the one-line inscription's cyclic fix — and a `soft` default) is
 * the noun, never a given.
 */
export function rowClass3(cmds: readonly Command3[]): CauseClass {
  let circum = false;
  let rightPyramid = false;
  let value = false;
  let relation = false;
  for (const cmd of cmds) {
    if (('origin' in cmd && cmd.origin === 'shape') || ('soft' in cmd && cmd.soft)) continue;
    if (cmd.type === 'circle3') {
      if (cmd.def.kind === 'circum') circum = true;
    } else if (cmd.type === 'concyclic' || cmd.type === 'point-on-circle3') circum = true;
    else if (cmd.type === 'solid') {
      if (QUAD_PYRAMIDS[cmd.kind]?.right) rightPyramid = true;
    } else if (cmd.type === 'point3') {
      if (cmd.x !== null || cmd.y !== null || cmd.z !== null || cmd.syms?.some((x) => x !== null)) value = true; // «A(0,2,-1)» states numbers
    } else if (DEFINITION_CMDS.has(cmd.type)) continue;
    else if (VALUE_CMDS.has(cmd.type)) value = true;
    else if (cmd.type === 'claim') {
      if (VALUE_CLAIMS.has(cmd.claim.type)) value = true;
      else relation = true;
    } else if (cmd.type === 'cos-angle') {
      if (Math.abs(cmd.cos) < 1e-12) relation = true; // «AC ⊥ BC»
      else value = true; // «cos∠ACB = 3/4»
    } else if (cmd.type === 'line-plane-angle') {
      if (cmd.deg !== undefined) value = true;
    } else relation = true; // any other statement relates its operands — never silently a definition
  }
  if (relation || (circum && rightPyramid) || (value && (circum || rightPyramid))) return 'relation';
  if (circum) return 'circum';
  if (rightPyramid) return 'rightPyramid';
  if (value) return 'value';
  return 'definition';
}

/** A right angle typed on a triangle ring's own corner — «זווית C = 90», «זווית ACB = 90» or «AC ⊥ BC» (card 3). */
function isTypedRightAngle3(cmd: Command3, ring: readonly Id[]): boolean {
  if (ring.length !== 3) return false;
  const others = (v: Id) => ring.filter((x) => x !== v);
  if (cmd.type === 'vertex-angle') return Math.abs(cmd.deg - 90) < 1e-9 && ring.includes(cmd.vertex) && isRingRightAngle(ring, cmd.vertex, others(cmd.vertex)[0], others(cmd.vertex)[1]);
  if (cmd.type === 'claim' && cmd.claim.type === 'vertex-angle-eq') return Math.abs(cmd.claim.deg - 90) < 1e-9 && isRingRightAngle(ring, cmd.claim.vertex, cmd.claim.p, cmd.claim.q);
  const sidesMeet = (s1: readonly Id[], s2: readonly Id[]): boolean => {
    const shared = s1.filter((p) => s2.includes(p));
    if (shared.length !== 1) return false;
    const v = shared[0];
    return isRingRightAngle(ring, v, s1.find((p) => p !== v)!, s2.find((p) => p !== v)!);
  };
  if (cmd.type === 'claim' && cmd.claim.type === 'angle-seg-eq')
    return Math.abs(cmd.claim.deg - 90) < 1e-9 && sidesMeet([cmd.claim.a1, cmd.claim.b1], [cmd.claim.a2, cmd.claim.b2]);
  if (cmd.type === 'cos-angle' && !cmd.soft && !cmd.origin && Math.abs(cmd.cos) < 1e-12 && cmd.u.kind === 'pair' && cmd.v.kind === 'pair')
    return sidesMeet([cmd.u.from, cmd.u.to], [cmd.v.from, cmd.v.to]);
  return false;
}

/** The triangle kind a row's own words state («משולש שווה שוקיים ABC» → isosceles), through the ONE lexicon reader. */
function triangleNoun3(utterance: string): NarrowKind | null {
  const p = readShapePhrase3(utterance);
  if (!p || p.arity !== 3) return null;
  const has = (a: string) => (p.consumed as readonly string[]).includes(a);
  if (has('equilateral')) return 'equilateral-triangle';
  if (has('right') && has('isosceles')) return 'right-isosceles-triangle';
  if (has('right')) return 'right-triangle';
  if (has('isosceles')) return 'isosceles-triangle';
  return 'triangle';
}

/** Every ring a row's commands DECLARE with a noun, and the kind each noun states. */
function rowNouns3(f: NFact3): { ring: Id[]; kind: NarrowKind }[] {
  const out: { ring: Id[]; kind: NarrowKind }[] = [];
  for (const cmd of f.cmds) {
    if (cmd.type === 'quad-shape') out.push({ ring: [...cmd.ids], kind: declaredKind3(cmd) });
    else if (cmd.type === 'rect-complete') out.push({ ring: [...cmd.ids], kind: 'rectangle' });
    else if (cmd.type === 'solid') {
      const spec = QUAD_PYRAMIDS[cmd.kind];
      if (spec && cmd.ids.length >= 4) out.push({ ring: cmd.ids.slice(0, 4), kind: declaredKind3({ base: spec.base, adj: cmd.baseAdj }) });
      else if (cmd.kind === 'polygon3') {
        const k = triangleNoun3(f.utterance);
        if (k) out.push({ ring: [...cmd.ids], kind: k });
      }
    }
  }
  return out;
}

/** Kinds that have nothing narrower — a ring declared one of these is never narrowed, so it costs no sample. */
const LEAST: ReadonlySet<NarrowKind> = new Set<NarrowKind>(['square', 'equilateral-triangle', 'right-isosceles-triangle']);

/** The kinds of a ring at one sample (empty when a vertex is unplaced — that sample shows no such ring). */
const kindsAt = (ids: readonly Id[], pos: Positions3): Set<NarrowKind> => {
  const pts = ids.map((id) => pos.get(id));
  return pts.every((p) => !!p) ? ringKinds(pts.map((p) => [p!.x, p!.y, p!.z])) : new Set<NarrowKind>();
};

/**
 * How many configurations OF THE DECLARED KIND the verdict needs, and how many claim-bar groups it may draw to find
 * them. A declared trapezoid's exclusive half is a drawing preference, not a solve (#1918), so «טרפז ABCD ·
 * |AD| = |BC|» samples parallelograms too — none of them is the trapezoid the student declared (`forcedUnder`
 * sets them aside). At some seeds three of the four claim samples are parallelograms; one trapezoid agreeing with
 * itself proves nothing, so the pool widens by further claim-bar groups until it holds {@link KEPT_WANTED} (only when
 * the claims' own bar held at least one — none at all is an out-of-family or collapsed ring, not thin evidence).
 */
const KEPT_WANTED = 3;
const MAX_GROUPS = 2;
/** The base seed of claim-bar group `g` (group 0 is the claims' own bar, `claimSeeds(seed)`). */
const groupSeed = (seed: number, g: number) => seed + g * 6007;

/** A construction's placed samples, drawn one claim-bar group at a time and kept (the student's own figure's are
 *  shared by every ring). */
function samplePool(c: Construction3, seed: number) {
  const groups: Positions3[][] = [];
  const group = (g: number): Positions3[] =>
    (groups[g] ??= claimSeeds(groupSeed(seed, g)).flatMap((s) => knowledgeSamples3(c, [s]).filter((r) => !(r.pivot && r.pivot.solutions === 0)).map((r) => r.positions)));
  /**
   * The ring's kinds over the pool, widened until it holds {@link KEPT_WANTED} samples of `declared`. `counter`
   * stops at the first sample that IS the declared kind but not that narrower one — "not forced", settled.
   */
  return (ids: readonly Id[], declared: NarrowKind, counter?: NarrowKind): Set<NarrowKind>[] | 'counterexample' => {
    const kinds: Set<NarrowKind>[] = [];
    let kept = 0;
    // widen only THIN evidence: no sample of the declared kind on the claims' own bar is an out-of-family or
    // collapsed ring there (`forcedUnder` says null), and more seeds of an expensive solve would not change that
    for (let g = 0; g < MAX_GROUPS && (g === 0 || (kept > 0 && kept < KEPT_WANTED)); g++) {
      for (const pos of group(g)) {
        const k = kindsAt(ids, pos);
        if (k.has(declared)) {
          if (counter && !k.has(counter)) return 'counterexample';
          kept++;
        }
        kinds.push(k);
      }
    }
    return kinds;
  };
}

export interface Narrowing3Deps {
  /** The construction of `facts` with some rows muted — the store's own fold, without this pass (no recursion). */
  construct: (facts: NFact3[]) => Construction3;
}

const memo = new WeakMap<readonly NFact3[], NarrowedRing3[]>();

/** The pass's cost seam (the `deriveStats3` idiom): wall time of the uncached passes and the subset folds they ran. */
export const narrowingStats3 = { ms: 0, subsetFolds: 0, solidCalls: 0 };
/** #1996 (ADR-3D-343): the most subset trials one note's cause search may pay in 3-D (~0.3 s budget, the plan's bar). */
export const NARROW_TRIALS_3D = 4;

/**
 * Every forced-narrowing note the figure warrants. `c` is the construction `facts` already folded to, `ok` says
 * which rows applied (a red row declares nothing). Memoized on the facts array: «הציגו תצורה אחרת» re-derives the
 * same list at another seed and pays nothing.
 */
export function narrowingNotes3(facts: readonly NFact3[], seed: number, c: Construction3, ok: (id: string) => boolean, deps: Narrowing3Deps): NarrowedRing3[] {
  const hit = memo.get(facts);
  if (hit) return hit;
  const t0 = performance.now();
  const s0 = sampleStats.solidCalls;
  const notes = compute(facts, seed, c, ok, deps);
  narrowingStats3.ms += performance.now() - t0;
  // the pass's own knowledge pool and subset folds, apart from the derive's — the #863 canary holds each to its own bar
  narrowingStats3.solidCalls += sampleStats.solidCalls - s0;
  memo.set(facts, notes);
  return notes;
}

function compute(facts: readonly NFact3[], seed: number, c: Construction3, ok: (id: string) => boolean, deps: Narrowing3Deps): NarrowedRing3[] {
  const rows = facts.filter((f) => f.enabled && ok(f.id));
  // the declared rings: every noun over the same ring (any rotation or direction), with the rows that stated them
  const rings = new Map<string, { ids: Id[]; kinds: NarrowKind[]; rows: Set<string> }>();
  for (const f of rows) {
    for (const n of rowNouns3(f)) {
      const rk = narrowRingKey(n.ring);
      const r = rings.get(rk) ?? { ids: n.ring, kinds: [], rows: new Set<string>() };
      r.kinds.push(n.kind);
      r.rows.add(f.id);
      rings.set(rk, r);
    }
  }
  if (!rings.size) return [];
  const classOf = new Map(rows.map((f) => [f.id, rowClass3(f.cmds)]));
  const enabledIds = new Set(facts.filter((f) => f.enabled).map((f) => f.id));
  const out: NarrowedRing3[] = [];
  // #2171 (ADR-3D-345, 2-D's ADR-656 #4): two nouns the ring carries together — the kind both name, said once; read off
  // the nouns alone, so it needs no pool. The narrowing below then starts from that kind, so it is the only note.
  for (const ring of rings.values()) {
    const m = mergeOf(ring.kinds);
    if (m) out.push({ ids: ring.ids, note: { ring: ring.ids.join(''), ...m } });
  }
  const full = samplePool(c, seed); // the student's own figure's samples, drawn once for every ring
  for (const ring of rings.values()) {
    const carve = rows.filter(
      (f) => f.cmds.some((k) => isTypedRightAngle3(k, ring.ids)) && f.cmds.every((k) => isTypedRightAngle3(k, ring.ids) || rowClass3([k]) === 'definition'),
    );
    const declared = declaredKindOf(ring.kinds, carve.length > 0);
    if (!declared || LEAST.has(declared)) continue;
    const forced = forcedUnder(declared, full(ring.ids, declared) as Set<NarrowKind>[]);
    const narrowing = forced && narrowingOf(declared, forced);
    if (!narrowing) continue;
    // the anchors: the pure noun rows of this ring and its typed right angle — always enabled in a trial
    const anchors = new Set([...[...ring.rows].filter((id) => classOf.get(id) === 'definition'), ...carve.map((f) => f.id)]);
    const candidates = rows.filter((f) => !anchors.has(f.id));
    if (silentByValues(narrowing.from, candidates.map((f) => classOf.get(f.id)!))) continue; // ruled silent — no search
    const isForced = (chosen: readonly number[]): boolean => {
      const on = new Set([...anchors, ...chosen.map((i) => candidates[i].id)]);
      if (on.size === 0) return false; // nothing on: no ring, nothing forced — no fold to pay
      const sub = facts.map((f) => (enabledIds.has(f.id) && !on.has(f.id) ? { ...f, enabled: false } : f));
      narrowingStats3.subsetFolds++;
      const subC = deps.construct(sub);
      const kinds = samplePool(subC, seed)(ring.ids, declared, narrowing.to);
      if (kinds === 'counterexample') return false; // a configuration of the declared kind that is not the narrower one
      return forcedUnder(declared, kinds)?.has(narrowing.to) ?? false;
    };
    // a 3-D subset trial is a pivot-solved fold plus its claim-bar resolves (~0.1 s on a pyramid figure): bounded
    // by COUNT (the sentence stays a function of the input, M3) — past it «בגלל הנתונים, …» (card 5)
    const { rows: cause } = attributeCause(candidates.length, isForced, CO_CAUSE_CAP, NARROW_TRIALS_3D);
    // the declaring rows alone force it: the noun as read already means the narrower kind — nothing the GIVENS did
    if (cause !== null && cause.length === 0) continue;
    const slot = causeSlot(cause, candidates.map((f) => classOf.get(f.id)!), narrowing.from);
    if (slot.kind === 'silent') continue;
    const named = slot.kind === 'given' ? [slot.row] : slot.kind === 'givens' ? slot.rows : [];
    const note: NarrowingNote = { ring: ring.ids.join(''), from: narrowing.from, to: narrowing.to, cause: slot, givens: named.map((i) => candidates[i].utterance.trim()) };
    out.push({ ids: ring.ids, note });
  }
  return out;
}
