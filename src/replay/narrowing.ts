/**
 * #1996 ([ADR-655](../../docs/06-decisions.md#adr-655), the 2-D half of [ADR-W-129](../../docs/06w-decisions-workspace.md#adr-w-129))
 * — THE GIVENS FORCED A NARROWER KIND, SAID OUT LOUD.
 *
 * A declared ring the givens force into a strictly narrower named kind (a parallelogram into a rectangle by a
 * circle through its vertices, into a rhombus by «AB = BC») was drawn as that kind silently. The shared decision
 * (`shell/narrowing.ts`) compares the declared kind with the kind forced across the figure's ONE sample pool (M3)
 * and attributes the statements that forced it; this module is 2-D's adapter:
 *
 * - **The declared kind** of each ring comes from the noun the student typed, adjective included — read by the
 *   PARSER's shape-phrase reader on the row's own utterance ({@link RowNouns}, computed in the store layer,
 *   since replay may not import the parser). Never from the base command: «משולש שווה צלעות ABC» lowers to a
 *   bare `triangle` + two `set-equal`, so a base-command reading would call the equilateral triangle a
 *   narrowed triangle (8 false notes over the saved fixtures, measured on the plan).
 * - **The forced kind** is read off the shared pool, and only a COMPLETE pool (ADR-558): a cut pool over-claims
 *   forcing, so the note is withheld — today's silence, never a provisional claim.
 * - **The cause** is the first statement that forces it plus what it needs (`attributeCause`), each subset judged
 *   on its own pool ({@link NarrowingDeps.subsetSamples}) — paid only when a note exists.
 *
 * Pure over `(facts, pool, nouns)`: the note is DERIVED, so muting the cause removes it and a reload says what
 * typing said; it moves no point.
 */
import type { AnyCommand, Id, Vec } from '@/engine';
import {
  attributeCause,
  causeSlot,
  declaredKindOf,
  silentByValues,
  forcedUnder,
  isRingRightAngle,
  narrowingOf,
  narrowRingKey,
  ringKinds,
  type CauseClass,
  type NarrowKind,
  mergeOf,
  type RingNote,
} from '../../shell/narrowing';

/** The minimal fact shape this module reads (the replay `Fact`, without importing core — no cycle). */
interface NFact {
  id: string;
  utterance?: string;
  group?: string;
  cmd: AnyCommand;
  enabled: boolean;
}
interface NPool {
  samples: Map<Id, Vec>[];
  complete: boolean;
}

/** One noun a row stated over one ring, in the ring's declared order. */
export interface RowNoun {
  ring: Id[];
  kind: NarrowKind;
}
/** The nouns each row (by group key — `group ?? id`) stated, read by the parser's shape-phrase reader. */
export type RowNouns = Record<string, RowNoun[]>;

export interface NarrowingDeps {
  /** The pool of `facts` with some rows muted — NOT the shared memo (the student's own pool stays cached). */
  subsetSamples: (facts: NFact[], counterexample?: (pos: Map<Id, Vec>) => boolean) => NPool;
}

const rowKey = (f: NFact): string => f.group ?? f.id;

/** The commands that only create or name (a noun, a segment, a point, a circle): no relation of their own. */
const VALUE_CMDS = new Set(['set-distance', 'set-angle', 'set-radius', 'set-area', 'set-perimeter']);
const RELATION_CMDS = new Set([
  'set-equal', 'set-parallel', 'set-perpendicular', 'set-ratio', 'set-angle-ratio', 'set-collinear', 'altitude-choice',
  'diameter', 'tangent', 'circles-tangent', 'common-tangent', 'set-length-product', 'set-length-radius', 'set-area-ratio',
  'set-perimeter-ratio', 'set-measure-sum', 'set-radius-ratio', 'set-line',
]);
const CIRCUM_CMDS = new Set(['circumcircle', 'set-concyclic', 'concyclic', 'show-circle']);

/** Every point id a command names (its string fields that look like a point label). */
function pointsOf(cmd: AnyCommand): Id[] {
  const out: Id[] = [];
  for (const [k, v] of Object.entries(cmd)) {
    if (k === 'type' || k === 'expr') continue;
    if (typeof v === 'string' && /^[A-Z]\d*$/.test(v)) out.push(v);
    else if (Array.isArray(v)) for (const x of v) if (typeof x === 'string' && /^[A-Z]\d*$/.test(x)) out.push(x);
  }
  return out;
}

/** A right angle typed on a triangle ring's own corner — «זווית C = 90» or «AC ⊥ BC» (card 3's carve-out). */
function isTypedRightAngle(cmd: AnyCommand, ring: readonly Id[]): boolean {
  if (ring.length !== 3) return false;
  if (cmd.type === 'set-angle') return Math.abs(cmd.value - 90) < 1e-9 && !cmd.arcOf && isRingRightAngle(ring, cmd.vertex, cmd.ray1, cmd.ray2);
  if (cmd.type === 'set-perpendicular') {
    const s1 = [cmd.a, cmd.b];
    const s2 = [cmd.c, cmd.d];
    const shared = s1.filter((p) => s2.includes(p));
    if (shared.length !== 1) return false;
    const v = shared[0];
    return isRingRightAngle(ring, v, s1.find((p) => p !== v)!, s2.find((p) => p !== v)!);
  }
  return false;
}

/**
 * What one row is, for the sentence. A relation among the row's OWN declared ring (a noun's lowering — the
 * equilateral's two equal pairs, the isosceles trapezoid's legs, an inscribed trapezoid's parallel pair) is the
 * noun, not a given.
 */
export function rowClass2D(cmds: readonly AnyCommand[], ownRings: readonly (readonly Id[])[]): CauseClass {
  let circum = false;
  let incircle = false;
  let value = false;
  let relation = false;
  const own = (cmd: AnyCommand) => {
    const pts = pointsOf(cmd);
    return pts.length > 0 && ownRings.some((r) => pts.every((p) => r.includes(p)));
  };
  for (const cmd of cmds) {
    if (cmd.type === 'set-equal' && (cmd.soft || cmd.trapezoidLegs)) continue; // a noun's own default / legs
    if (CIRCUM_CMDS.has(cmd.type)) circum = true;
    else if (cmd.type === 'point-on-circle') {
      if (!cmd.id.startsWith('@')) circum = true; // a STUDENT point on the circle (a machine foot is the incircle's)
    } else if (cmd.type === 'circle-through') {
      if (cmd.through.startsWith('@f-')) incircle = true; // the circle through a foot on a side — tangent to it
    } else if (VALUE_CMDS.has(cmd.type)) {
      if (!own(cmd)) value = true;
    } else if (RELATION_CMDS.has(cmd.type)) {
      if (!own(cmd)) relation = true;
    }
  }
  if (relation || (value && (circum || incircle))) return 'relation';
  if (circum) return 'circum';
  if (incircle) return 'incircle';
  if (value) return 'value';
  return 'definition';
}

let memo: { key: string; notes: RingNote[] } | null = null;

/**
 * Every forced-narrowing note the figure warrants. `keyOf` is the fold key of the facts (content-keyed memo:
 * the detect op is asked once per layer, and attribution is paid once per figure).
 */
export function narrowingNotes2D(facts: NFact[], pool: NPool, nouns: RowNouns, deps: NarrowingDeps, keyOf: (facts: NFact[]) => string): RingNote[] {
  const key = keyOf(facts) + '|' + JSON.stringify(nouns) + '|' + (pool.complete && pool.samples.length > 0);
  if (memo?.key === key) return memo.notes;
  const notes = compute(facts, pool, nouns, deps);
  memo = { key, notes };
  return notes;
}

function compute(facts: NFact[], pool: NPool, nouns: RowNouns, deps: NarrowingDeps): RingNote[] {
  // the enabled rows, in typed order
  const rows: string[] = [];
  const cmdsOf = new Map<string, AnyCommand[]>();
  const textOf = new Map<string, string>();
  for (const f of facts) {
    if (!f.enabled) continue;
    const k = rowKey(f);
    if (!cmdsOf.has(k)) {
      rows.push(k);
      cmdsOf.set(k, []);
      if (f.utterance) textOf.set(k, f.utterance.trim());
    }
    cmdsOf.get(k)!.push(f.cmd);
  }
  // the declared rings: every noun over the same ring (in any rotation), with the rows that stated them
  const rings = new Map<string, { ids: Id[]; kinds: NarrowKind[]; rows: Set<string> }>();
  for (const k of rows) {
    for (const n of nouns[k] ?? []) {
      const rk = narrowRingKey(n.ring);
      const r = rings.get(rk) ?? { ids: n.ring, kinds: [], rows: new Set<string>() };
      r.kinds.push(n.kind);
      r.rows.add(k);
      rings.set(rk, r);
    }
  }
  const ownRingsOf = (k: string) => (nouns[k] ?? []).map((n) => n.ring);
  const classOf = new Map(rows.map((k) => [k, rowClass2D(cmdsOf.get(k)!, ownRingsOf(k))]));
  const out: RingNote[] = [];
  // #1993 (ADR-656): two nouns the ring carries together — the kind both name, said once; read off the nouns alone,
  // so it needs no pool
  for (const ring of rings.values()) {
    const m = mergeOf(ring.kinds);
    if (m) out.push({ ring: ring.ids.join(''), ...m });
  }
  if (!pool.complete || pool.samples.length === 0) return out; // a cut pool over-claims forcing (ADR-558)
  for (const ring of rings.values()) {
    const carve = rows.filter((k) => {
      const cmds = cmdsOf.get(k)!;
      return cmds.some((c) => isTypedRightAngle(c, ring.ids)) && cmds.every((c) => isTypedRightAngle(c, ring.ids) || rowClass2D([c], []) === 'definition');
    });
    const declared = declaredKindOf(ring.kinds, carve.length > 0);
    if (!declared) continue;
    const kindsAt = (pos: Map<Id, Vec>) => {
      const pts = ring.ids.map((id) => pos.get(id));
      return pts.every((p): p is Vec => !!p) ? ringKinds(pts.map((p) => [p.x, p.y])) : new Set<NarrowKind>();
    };
    const forced = forcedUnder(declared, pool.samples.map(kindsAt));
    const narrowing = forced && narrowingOf(declared, forced);
    if (!narrowing) continue;
    // the anchors: the pure noun rows of this ring and its typed right angle — always enabled in a trial
    const anchors = new Set([...[...ring.rows].filter((k) => classOf.get(k) === 'definition'), ...carve]);
    const candidates = rows.filter((k) => !anchors.has(k));
    if (silentByValues(narrowing.from, candidates.map((k) => classOf.get(k)!))) continue; // ruled silent — no search
    const isForced = (chosen: readonly number[]): boolean => {
      const on = new Set([...anchors, ...chosen.map((i) => candidates[i])]);
      const sub = facts.map((f) => (f.enabled && !on.has(rowKey(f)) ? { ...f, enabled: false } : f));
      // a sample that IS the declared kind but not the narrower one settles "not forced" (the probe's early out)
      const p = deps.subsetSamples(sub, (pos) => {
        const k = kindsAt(pos);
        return k.has(declared) && !k.has(narrowing.to);
      });
      return p.complete && (forcedUnder(declared, p.samples.map(kindsAt))?.has(narrowing.to) ?? false);
    };
    const { rows: cause } = attributeCause(candidates.length, isForced);
    // the declaring rows alone force it: the noun as the parser read it already means the narrower kind (a reading
    // of the phrase this module could not see) — nothing the GIVENS did, so nothing to say
    if (cause !== null && cause.length === 0) continue;
    const slot = causeSlot(cause, candidates.map((k) => classOf.get(k)!), narrowing.from);
    if (slot.kind === 'silent') continue;
    const named = slot.kind === 'given' ? [slot.row] : slot.kind === 'givens' ? slot.rows : [];
    out.push({ ring: ring.ids.join(''), from: narrowing.from, to: narrowing.to, cause: slot, givens: named.map((i) => textOf.get(candidates[i]) ?? '') });
  }
  return out;
}
