/**
 * Geo store (Phase 3, extended) — the app's source of truth for the build session.
 *
 * The durable state is the **ordered list of facts** the student entered; the
 * figure is *derived* by replaying the enabled ones through the engine. This is
 * what makes facts independently selectable: a fact can be deselected (kept but
 * turned off) or deleted, and the figure re-derives. A fact whose dependencies
 * are gone simply fails to apply and is flagged inactive — re-selecting the
 * dependency brings it back (auto-drop, reversible — ADR-010). Branch choices
 * for alternatives live in the fact's command, so they survive replay too.
 *
 * Positions are not stored — they're part of the derived view (`replay`), so
 * undo history stays minimal and state/coordinates can't drift apart.
 *
 * See docs/04-design.md §executeCommand and docs/09-implementation-plan.md §Phase 3.
 */

import { create } from 'zustand';
import { temporal } from 'zundo';
import { nanoid } from 'nanoid';
import { stripFormatControls } from '../../shell/bidi';
import type { ValuesPanelResult } from '@/engine/valuesPanel';
import type { AnyCommand, Id, RelationsResult, ShapesResult, StatedShapeEquality } from '@/engine';
import { branchCount, cyclableVariant, deepEqual, variantCountOf, withVariant } from '@/engine';
import { parseValueQuery } from '@/parser/valueQuery';
import type { FigureFile } from './figureFile';

// S1.2 (docs/24): the replay layer moved to src/replay/core.ts — re-exported here so every
// existing consumer path ('@/store/geoStore') keeps working; the store is now a thin stateful shell.
export * from '@/replay/core';
import { replay, groupKey, firstSatisfyingSeed, meetsRequirements, findValidConfig, searchAnotherView, settleVariantDefaults, pointsDistinct, commandPointIds, extensionsClear, intersectionsWithinSegments, BRANCH_CYCLE_KINDS } from '@/replay/core';
import type { DetectAllResult, Fact } from '@/replay/core';
import { geoWork, geoValues, isCancelled } from './geoWork';

/**
 * Run the shared detection sweep for `facts` off the main thread and return its verdicts, or null when
 * the answer must be discarded ([ADR-401](docs/06-decisions.md#adr-401)): the fact list changed while we
 * sampled (a step/undo raced us — a layer for another figure must never be written), or the sweep was
 * superseded/cancelled. The three detection actions share one in-flight sweep per fact list.
 */
async function detectFor(facts: Fact[], get: () => GeoState): Promise<DetectAllResult | null> {
  try {
    const r = await geoWork.detect(facts);
    return get().facts === facts ? r : null;
  } catch (err) {
    if (isCancelled(err)) return null;
    throw err;
  }
}

/** Flip one display flag (hidden/dashed) on a segment's style entry, keeping only the TRUE flags
 *  (so the entry stays minimal — `{dashed:true}`, not `{dashed:true,hidden:false}`); drop it when empty. */
function setSegFlag(style: Record<Id, { hidden?: boolean; dashed?: boolean }>, id: Id, flag: 'hidden' | 'dashed'): Record<Id, { hidden?: boolean; dashed?: boolean }> {
  const cur = style[id] ?? {};
  const next: { hidden?: boolean; dashed?: boolean } = { ...cur, [flag]: !cur[flag] };
  const clean: { hidden?: boolean; dashed?: boolean } = {};
  if (next.hidden) clean.hidden = true;
  if (next.dashed) clean.dashed = true;
  const out = { ...style };
  if (!clean.hidden && !clean.dashed) delete out[id];
  else out[id] = clean;
  return out;
}

/** Rewrite a seg-id key (`seg-AB`, `seg-O1O2`) under a point rename — TOKENIZE the endpoint run
 *  (`[A-Z]\d*` labels, the same shape `relabelId` uses) and re-derive the renamed, re-sorted key so it
 *  still matches the renderer's id. Subscripted endpoints included (E6/STO-7 — the old 2-char slice
 *  left them stale). */
function renameSegKey(key: Id, from: Id, to: Id): Id {
  if (!key.startsWith('seg-')) return key;
  const eps = key.slice(4).match(/[A-Z]\d*/g);
  if (!eps || eps.length !== 2) return key;
  const [a, b] = eps.map((e) => (e === from ? to : e));
  return `seg-${[a, b].sort().join('')}`;
}

/** Apply a point rename to every seg-id key in a segment-style map. */
function renameSegStyle(style: Record<Id, { hidden?: boolean; dashed?: boolean }>, from: Id, to: Id): Record<Id, { hidden?: boolean; dashed?: boolean }> {
  return Object.fromEntries(Object.entries(style).map(([k, v]) => [renameSegKey(k, from, to), v]));
}

/**
 * Rewrite every WHOLE point label `from`→`to` inside a string — a bare point id ("O"), OR a label EMBEDDED
 * in a structured id ("circle-O", "bis-XOY", "line-O1O2", "tan-O", "sec-EO", "par-T-AB", "chord-AB").
 * TOKENIZE the string into label tokens (`[A-Z]\d*` — a maximal capital+digits run) and replace exact-match
 * tokens: inside a concatenated tail like "bis-ABC" the tokens are A, B, C, so renaming B rewrites the
 * MIDDLE letter too. (The previous lookbehind `(?<![A-Za-z])` could never match a label that follows
 * another label, so "bis-ABC" under rename B→P kept its stale id while the bare fields renamed —
 * deterministic-id idempotency broke into duplicate constructions, the exact PAR-9 class; review
 * 2026-07-03, S1.) Structured-id prefixes are lowercase + "-", so they are never tokens. The swap
 * sentinel (U+0000, not a label shape) falls back to a literal replace.
 */
function relabelId(v: string, from: Id, to: Id): string {
  if (!/^[A-Z]\d*$/.test(from)) return v.split(from).join(to); // the swap TMP sentinel — literal, unique, safe
  return v.replace(/[A-Z]\d*/g, (tok) => (tok === from ? to : tok));
}

/** Rewrite one point letter to another across a single command — bare point fields AND the letters embedded
 *  in structured ids (`circle-O`, `bis-XYZ`, …), via {@link relabelId}. The `expr` measure text is skipped. */
function renameInCommand(cmd: AnyCommand, from: Id, to: Id): AnyCommand {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(cmd)) {
    if (k === 'expr') out[k] = v; // a measure expr holds a variable/text, not point ids — never rewrite
    else if (typeof v === 'string') out[k] = relabelId(v, from, to);
    else if (Array.isArray(v)) out[k] = v.map((e) => (typeof e === 'string' ? relabelId(e, from, to) : e));
    else out[k] = v;
  }
  return out as AnyCommand;
}

/**
 * Rewrite a point label in the DISPLAYED utterance, matching WHOLE labels only. A label is a capital
 * letter + optional digits (`C`, `C1`, `O1`), so renaming `C`→`D` must NOT touch the `C` inside a `C1`.
 * The previous `utterance.split(from).join(to)` did a substring replace and corrupted multi-char labels
 * (it turned `CC1`→`DD1` during a swap-via-temp dance — operator report 2026-06-25). The `(?!\d)` guard
 * stops the match from eating into a subscripted label; the commands themselves are rewritten by id
 * (`renameInCommand`), so this only keeps the row text in sync.
 */
const relabelUtterance = (utt: string | undefined, from: Id, to: Id): string | undefined =>
  utt ? utt.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?!\\d)', 'g'), to) : utt;

/** Outcome of a relabel request, so the UI can explain a no-op. */
export type RenameResult = { ok: true } | { ok: false; reason: 'same' | 'no-source' | 'target-taken' };

/**
 * The PURE fact-list core of the `rename` store action — the `nameCentreFacts` precedent, point
 * edition (#539): extracted so the point naming-by-use binding (`impliedPointBinding`) can run on
 * plain fact arrays in the App's submit loop, the scenario harness, and the log-triage verifier with
 * THE SAME implementation (a re-implementation is the ADR-346 drift class this repo keeps paying for).
 */
export function renameFacts(facts: Fact[], from: Id, to: Id): { ok: true; facts: Fact[] } | { ok: false; reason: 'same' | 'no-source' | 'target-taken' } {
  const F = from.toUpperCase();
  const T = to.toUpperCase();
  if (F === T) return { ok: false, reason: 'same' };
  const all = new Set(facts.flatMap((f) => commandPointIds(f.cmd)));
  if (!all.has(F)) return { ok: false, reason: 'no-source' };
  if (all.has(T)) return { ok: false, reason: 'target-taken' }; // would merge two distinct points
  return {
    ok: true,
    facts: facts.map((f) => ({
      ...f,
      cmd: renameInCommand(f.cmd, F, T),
      // The step row shows the utterance; relabel the letter there too (whole labels only,
      // so a `C1`/`O1` isn't corrupted — Hebrew words and lowercase keywords are untouched).
      utterance: relabelUtterance(f.utterance, F, T),
    })),
  };
}

/**
 * The PURE fact-list core of the `nameCentre` store action (ADR-342 / #186): resolve the centre token
 * `from` (a letter, or a raw '@ctr-…' id) to the owning circle's real centre and rename it — plus the
 * circle's reference id letter-half and the auto-centre reveal — to `to`, across every fact. Extracted
 * so the log-triage verifier can mirror the App's #186 name-binding step on its plain fact arrays with
 * THE SAME implementation (a re-implementation is the ADR-346 drift class this repo keeps paying for).
 */
export function nameCentreFacts(
  facts: Fact[],
  from: Id,
  to: Id,
): { ok: true; facts: Fact[]; source: string; letter: string; anon: boolean } | { ok: false; reason: 'same' | 'no-source' | 'target-taken' } {
  const F = from.startsWith('@') ? from : from.toUpperCase();
  const T = to.toUpperCase();
  let source: string | null = null;
  let letter: string | null = null; // the circle-id letter half (`circle-<letter>`)
  for (const f of facts) {
    const c = f.cmd as { type?: string; center?: string };
    if ((c.type !== 'circle' && c.type !== 'circle-through') || !c.center) continue;
    const tok = c.center.startsWith('@ctr-') ? c.center.slice(5) : c.center;
    if (tok === F || c.center === F) {
      source = c.center;
      letter = tok;
      break;
    }
  }
  const all = new Set(facts.flatMap((f) => commandPointIds(f.cmd)));
  if (!source) {
    // legacy: renaming a centre letter that IS a plain point (a named centre being re-lettered)
    if (!all.has(F)) return { ok: false, reason: 'no-source' };
    source = F;
    letter = F;
  }
  if (source === T) return { ok: false, reason: 'same' }; // promoting a token to its OWN letter ('@ctr-O'→'O') is a real change
  if (all.has(T)) return { ok: false, reason: 'target-taken' };
  const anon = source.startsWith('@');
  // The circle-id follow must match the WHOLE id (or its `-`-suffixed concentric inner), never a
  // substring: `renameInCommand`'s literal fallback turned `circle-O1` into `circle-O21` when the
  // renamed circle was `circle-O` → `circle-O2` (the ADR-122 split/join corruption class, latent here
  // until #186 made same-letter-prefixed circle names routine).
  const followCircleId = (cmd: AnyCommand, fromId: string, toId: string): AnyCommand => {
    const map = (v: unknown): unknown =>
      typeof v === 'string' ? (v === fromId ? toId : v.startsWith(`${fromId}-`) ? toId + v.slice(fromId.length) : v) : Array.isArray(v) ? v.map(map) : v;
    return Object.fromEntries(Object.entries(cmd).map(([k, v]) => [k, k === 'expr' ? v : map(v)])) as AnyCommand;
  };
  const mapped = facts.map((f) => {
    let cmd = renameInCommand(f.cmd, source!, T);
    // An anonymous centre's rename only touched the point id — the circle's REFERENCE id keeps the
    // letter half, so «מעגל T» must resolve after naming: rename `circle-<letter>` → `circle-<T>`
    // too (whole-id exact, so a student's own point <letter> and a sibling `circle-<letter>1` are
    // untouched; the concentric inner `circle-<letter>-2` follows by prefix).
    if (anon && letter && letter !== T) cmd = followCircleId(cmd, `circle-${letter}`, `circle-${T}`);
    // reveal the renamed circle's centre: the circle command whose centre is now T drops autoCenter
    const revealed =
      (cmd.type === 'circle' || cmd.type === 'circle-through') && (cmd as { center?: string }).center === T && (cmd as { autoCenter?: boolean }).autoCenter
        ? (() => {
            const { autoCenter: _drop, ...rest } = cmd as Record<string, unknown>;
            return rest as AnyCommand;
          })()
        : cmd;
    return { ...f, cmd: revealed, utterance: anon ? f.utterance : relabelUtterance(f.utterance, source!, T) };
  });
  return { ok: true, facts: mapped, source, letter: letter!, anon };
}

/** Outcome of a swap request (exchange two existing labels), so the UI can explain a no-op. */
export type SwapResult = { ok: true } | { ok: false; reason: 'same' | 'no-source' };

/** Outcome of a merge request (fold one point into another), so the UI can explain a no-op. */
export type MergeResult = { ok: true } | { ok: false; reason: 'same' | 'no-source' | 'no-target' | 'source-in-shape' };

/**
 * A command that has collapsed to a geometric no-op because two of its required-distinct
 * points became the same id (the typical fallout of folding F into E: a `segment EF` → `EE`,
 * an `angle EFG` → `EEG`). Such facts are dropped during a merge so the figure stays clean.
 */
function collapsedDegenerate(cmd: AnyCommand): boolean {
  const c = cmd as unknown as Record<string, Id | undefined>; // #784: the union now carries an optional `consumed` object, so the direct cast no longer overlaps
  switch (cmd.type) {
    case 'segment':
    case 'set-distance':
    case 'point-on-segment':
    case 'foot':
    case 'midpoint':
      return c.a === c.b;
    case 'set-equal':
    case 'set-ratio':
    case 'set-parallel':
    case 'set-perpendicular':
      return c.a === c.b || c.c === c.d;
    case 'set-angle':
    case 'measure-angle':
      return c.vertex === c.ray1 || c.vertex === c.ray2 || c.ray1 === c.ray2;
    case 'measure-length':
      return c.a === c.b;
    default:
      return false;
  }
}

export interface GeoState {
  facts: Fact[];
  /** The fact currently selected for inspection (highlighted on the canvas); UI-only, not undoable. */
  selectedId: string | null;
  /** Sampling seed for the figure's residual freedom (ADR-018); 0 = canonical. IN the undo history
   *  (E5/STO-5): undo restores the view the student actually saw, not the reverted facts at a later seed. */
  seed: number;
  /** Show measure labels on the figure (ADR-031); UI-only, not undoable. Default true. */
  showMeasures: boolean;
  /** Reveal every circle's centre + label (ADR-059); UI-only, not undoable. Default false.
   *  A display preference grouped with `showMeasures` in the sidebar (was a ⊙ button on the canvas). */
  showCenters: boolean;
  /** Dialed free-circle radii (the DOF sliders): circle id → radius. A viewing scratchpad — UI-only,
   *  not undoable, cleared by "show another configuration". */
  radiusOverrides: Record<Id, number>;
  /** Point ids whose label + vertex dot are hidden on the figure — a DISPLAY preference (the point still
   *  participates in the construction; segments through it still draw). UI-only, not undoable: the student
   *  un-hides by clicking the ghost again. Rewritten by `rename`/`merge` so it tracks the renamed letter. */
  hidden: Id[];
  /** Per-segment display style (keyed by seg id, e.g. `seg-AB`) — hidden and/or dashed. A DISPLAY
   *  preference like {@link hidden}: UI-only, not undoable; rewritten by `rename`/`merge`; reset by `clear`. */
  segStyle: Record<Id, { hidden?: boolean; dashed?: boolean }>;
  /** Circle ids (e.g. `circle-O`) hidden on the figure — a DISPLAY preference like {@link hidden} (the
   *  circle still constrains its points; it's just not drawn). UI-only, not undoable; rewritten by
   *  `rename`/`merge` (the id carries the centre letter); reset by `clear`. (ADR-088) */
  hiddenCircles: Id[];
  /** The "view relations" ground-truth layer ([ADR-134](docs/06-decisions.md#adr-134)): the detected
   *  equalities, cached with the EXACT `facts` array they were computed from. UI-only, not undoable.
   *  Ground truths are invariant across configurations, so the layer survives "show another configuration"
   *  (seed change keeps the same `facts` ref); any FACT change makes a new `facts` array, so a selector that
   *  checks `relations.facts === facts` auto-clears it (no edits to the mutating actions needed). */
  relations: { result: RelationsResult; stated: StatedShapeEquality[]; facts: Fact[] } | null;
  /** #217 (ADR-410): the VALUES panel — every fixed/known value, stated + derived, computed on user
   *  request from the shared sample pool (off-thread). Tagged by facts so a stale result never shows. */
  values: { result: ValuesPanelResult; facts: Fact[] } | null;
  /** #477: the student's own value QUERIES, verbatim as typed, in ask order. A question, never a fact —
   *  they never enter `replay`, never move a point and never appear in the step list; they only ride the
   *  values computation. Persisted with the figure, so a saved worksheet reopens with its questions. */
  queries: string[];

  /** The "detect shapes" layer ([FR-SH](docs/02-requirements.md)): the named shapes (kite, rhombus,
   *  isosceles triangle, …) the figure geometrically contains, cached with the EXACT `facts` array they
   *  were computed from — same caching/auto-clear contract as `relations` (a selector checking
   *  `shapes.facts === facts` drops it on any fact change; it survives "show another configuration"). */
  shapes: { result: ShapesResult; facts: Fact[] } | null;
  /** The crossing-dot forcedness verdict (#228): the operand-pair keys whose crossing holds in EVERY valid
   *  configuration, plus the facts they were computed from (same staleness contract as `shapes`). Until it
   *  is computed for the current facts the renderer offers NO dots — an unverified candidate is exactly the
   *  one that vanishes on "show another configuration". */
  crossings: { forced: Set<string>; facts: Fact[] } | null;

  /** Append a fact (enabled). Commands sharing a `group` display as one step row. */
  execute: (cmd: AnyCommand, utterance?: string, group?: string) => void;
  /** Commit ONE user action's whole command group in ONE set — one undo entry removes the whole step
   *  (E4/STO-4; the per-command `execute` loop recorded N entries, so one undo peeled one command off a
   *  step whose row still showed ✓). Applies the same idempotency/move-in-place policy per command. */
  executeMany: (cmds: AnyCommand[], utterance?: string) => void;
  /** Undo/redo wrappers (E5/STO-5): zundo restores `facts` + `seed` (the figure the student SAW — the
   *  seed is in the temporal state, so an auto-advanced/resampled view rolls back with its facts), and
   *  any dialed radii are cleared (a viewing scratchpad can't outlive the state it annotated). */
  undo: () => void;
  redo: () => void;
  /** Replace a fact's command *in place* (same list position) — an edit (ADR-015). */
  update: (id: string, cmd: AnyCommand, utterance?: string) => void;
  /** Flip a fact's selected/deselected state. */
  toggle: (id: string) => void;
  /** Remove a fact permanently. */
  remove: (id: string) => void;
  /** Enable/disable every fact in a step group at once (one undo entry). */
  setGroupEnabled: (key: string, enabled: boolean) => void;
  /** Delete every fact in a step group. */
  removeGroup: (key: string) => void;
  /** Replace a whole step group with freshly-parsed commands, in place (edit a multi-command step). */
  replaceGroup: (key: string, cmds: AnyCommand[], utterance?: string) => void;
  /** Select a fact for inspection (or clear, if it was already selected). */
  select: (id: string | null) => void;
  /** The figure's NAME (issue #42) — shown on the page, used as the save filename, derived from the
   *  loaded file's name. UI-level session metadata: NOT in the undo history (renaming the diagram is
   *  not a construction step — the partialize slice is facts+seed only); reset by `clear`. */
  figureName: string;
  setFigureName: (name: string) => void;
  /** Compute the ground-truth relations of the current figure and turn the layer ON (ADR-134). Synchronous
   *  (samples the figure); the caller paints a busy state first. A no-op-safe re-press recomputes. */
  /** #157/ADR-401: async — the sample sweep runs in the geometry worker (shared with the other layers). */
  viewRelations: () => Promise<void>;
  /** Turn the relations layer off. */
  clearRelations: () => void;
  /** #217: compute the values panel (pull-only — req 4: never in the submit path). */
  viewValues: () => Promise<void>;
  clearValues: () => void;
  /** #477: ask for / drop a specific quantity in the values panel. */
  addQuery: (text: string) => void;
  removeQuery: (text: string) => void;
  /** Detect the named shapes of the current figure and turn the badges layer ON ([FR-SH]). Synchronous
   *  (samples the figure); the caller paints a busy state first. A re-press recomputes. */
  detectShapes: () => Promise<void>;
  /** Turn the shape-badges layer off. */
  clearShapes: () => void;
  /** Recompute which crossings of the drawn ink are FORCED (#228). Always-on affordance, so the App calls
   *  this after every fact change; async + shared-pool so it never blocks the figure's paint. */
  detectCrossings: () => Promise<void>;
  /** Advance an intersection point to its next configuration (stored in the fact's command). */
  cycleAlt: (pointId: Id) => void;
  /** Step the equal-pair VARIANT of a kite/isosceles shape ([ADR-138](docs/06-decisions.md#adr-138)) — so
   *  "show another configuration" also cycles WHICH sides are equal. Returns `true` if it stepped a variant
   *  (always a real change), `false` if no cyclable (≥2-variant) shape is present. */
  cycleVariant: () => boolean;
  /** Re-sample the figure's residual freedom — a different valid drawing (ADR-018). Returns `true` if it
   *  found a genuinely DIFFERENT drawing, `false` if the shape is determined (only size/placement vary). */
  resample: () => boolean;
  /** Before drawing, if the figure doesn't meet every requirement, search alternative configurations
   *  (seeds + branches) for one that does and apply it ([ADR-106](docs/06-decisions.md#adr-106)).
   *  Returns `true` if the figure now meets every requirement, `false` if none was found (kept as-is). */
  autoResolve: () => boolean;
  /** #41 (ADR-290): apply a view decided OFF-thread (a worker resample / auto-resolve outcome) as ONE
   *  undo-tracked transition — the async twin of `resample`/`autoResolve`'s own `set` (clears dialed radii
   *  like every fresh view). */
  applyView: (patch: { facts?: Fact[]; seed: number }) => void;
  /** Dial a free circle's radius directly (a DOF slider). Cleared on resample. */
  setRadius: (circle: Id, value: number) => void;
  /** Show/hide measure labels on the figure (ADR-031). */
  setShowMeasures: (show: boolean) => void;
  /** Show/hide every circle's centre + label (ADR-059). */
  setShowCenters: (show: boolean) => void;
  /** Toggle a point's label + dot hidden/shown on the figure (a display preference, not geometry). */
  toggleHidden: (id: Id) => void;
  /** Toggle a segment hidden/shown on the figure (a display preference, not geometry). */
  toggleSegHidden: (id: Id) => void;
  /** Toggle a segment dashed/solid on the figure (a display preference, not geometry). */
  toggleSegDashed: (id: Id) => void;
  /** Toggle a circle hidden/shown on the figure (a display preference, not geometry). */
  toggleCircleHidden: (id: Id) => void;
  /** Relabel a point everywhere (e.g. E → G) — rewrites every fact, one undo entry. */
  rename: (from: Id, to: Id) => RenameResult;
  /** NAME an auto-assigned circle centre (issue #112): rename the hidden centre `from`→`to` across every
   *  fact AND reveal it (a named centre always shows, FR-RN-8). One undo entry — «מרכז המעגל הוא P» on a
   *  circle the student drew unnamed, instead of a second circle. */
  nameCentre: (from: Id, to: Id) => RenameResult;
  /** PROMOTE an anonymous constructed point (`@`-prefixed, #32 / [ADR-297](docs/06-decisions.md#adr-297) —
   *  a decomposition touch/tangency point the student didn't name, shown as a clickable dot) to a real
   *  named point: assign the next free capital letter and rewrite the `@`-id → that letter everywhere. One
   *  undo entry. Returns the assigned letter, or null if the id isn't a promotable anon point / A–Z is full. */
  promote: (auxId: Id) => Id | null;
  /** Exchange two existing labels (A ↔ B) everywhere — what rename can't do (taken target). One undo entry. */
  swap: (a: Id, b: Id) => SwapResult;
  /** Fold one point into another (e.g. F → E, both already present) — drops F's definition,
   *  rewrites F→E everywhere, drops facts that collapsed; one undo entry. */
  merge: (from: Id, to: Id) => MergeResult;
  /** Reset to no facts and wipe undo/redo history. */
  clear: () => void;
  /** Replace the whole session with a saved figure file (FR-HS-10): the facts, the seed, the dialed
   *  radii, and any saved display preferences — ONE state transition, so a single undo restores the
   *  session that was open before the load (loading is never destructive). */
  loadFigure: (file: FigureFile) => void;
}


/**
 * THE store-side ingest invariant (#751, ADR-W-029): a fact's `utterance` holds WHAT THE STUDENT
 * STATED — never presentation characters.
 *
 * The app wraps LTR technical runs in Unicode isolates so Hebrew UI strings lay out correctly; that
 * is a DISPLAY transform, and it used to reach the fact list whenever a `t()`-derived string was
 * submitted as a command (the empty-canvas chips). The fact list is the source of truth — it is
 * saved to `.geo.json`, logged to the prod corpus, exported to `.docx` (where Word draws U+2066 as
 * a missing-glyph box), and compared byte-for-byte by dedup and drift nets. So the strip belongs
 * HERE, at the boundary of the module that owns the list, and not in any one consumer.
 *
 * The parser strips the same set at ITS boundary for its own reason (#531/ADR-3D-144: a display
 * transform must never reach the grammar). Two boundaries, one shared definition of the set
 * (`shell/bidi`), because the two copies protect different things.
 */
const cleanUtterance = (u: string | undefined): string | undefined =>
  u === undefined ? undefined : stripFormatControls(u);

/**
 * Fold ONE command into the fact list per the execute policy: idempotent duplicate (FR-EN-9 — re-issuing
 * re-enables a deselected twin, never stacks), a free-point move updates its fact in place (ADR-011), and
 * re-stating a STANDALONE circle resizes it in place (a circle inside a bigger step falls through to an
 * override append, keeping that step's label intact). Returns the same array when nothing changed.
 */
function foldFact(facts: Fact[], cmd: AnyCommand, utterance?: string, group?: string): Fact[] {
  utterance = cleanUtterance(utterance);
  const dup = facts.find((f) => deepEqual(f.cmd, cmd));
  if (dup) return dup.enabled ? facts : facts.map((f) => (f.id === dup.id ? { ...f, enabled: true } : f));
  if (cmd.type === 'free-point') {
    const prev = facts.find((f) => f.cmd.type === 'free-point' && f.cmd.id === cmd.id);
    if (prev) return facts.map((f) => (f.id === prev.id ? { ...f, cmd, utterance, enabled: true } : f));
  }
  if (cmd.type === 'circle' || cmd.type === 'circle-through') {
    const prev = facts.find((f) => (f.cmd.type === 'circle' || f.cmd.type === 'circle-through') && f.cmd.id === cmd.id);
    if (prev && !facts.some((f) => f.id !== prev.id && groupKey(f) === groupKey(prev)))
      return facts.map((f) => (f.id === prev.id ? { ...f, cmd, utterance, enabled: true } : f));
  }
  return [...facts, { id: nanoid(), cmd, utterance, group, enabled: true }];
}

/**
 * Commit a batch of commands as ONE state transition (E4/STO-4): fold each through {@link foldFact}, then
 * a single `set` carrying the new facts AND — when a newly-appended step broke an extension's directional
 * order or a segment-meet (ADR-098/166) — the auto-advanced seed in the SAME transition, so zundo records
 * exactly one entry per user action and undo restores both the facts and the view they were seen at (E5).
 */
function commitCommands(
  get: () => GeoState,
  set: (p: Partial<GeoState>) => void,
  cmds: AnyCommand[],
  utterance?: string,
  group?: string,
): void {
  const facts = get().facts;
  let next = facts;
  for (const cmd of cmds) next = foldFact(next, cmd, utterance, group);
  if (next === facts) return; // every command was an idempotent duplicate — nothing to record
  // Settle a NEWLY-appended cyclable variant's default configuration (ADR-339) before the seed search,
  // in the same transaction — one undo restores the pre-step state whole.
  if (next.length > facts.length) {
    const known = new Set(facts.map((f) => f.id));
    next = settleVariantDefaults(next, (f) => !known.has(f.id), get().seed);
  }
  const patch: Partial<GeoState> = { facts: next };
  // The seed auto-advance applies only when the batch APPENDED a step (matching the old per-command
  // behaviour: a free-point move / circle resize never re-seeds), and only when the current view is
  // actually broken — searching upward from the current seed keeps a valid hand-picked view.
  if (next.length > facts.length) {
    const seed = get().seed;
    const fig = replay(next, seed);
    // The trigger covers DISTINCTNESS too (#232 / ADR-378): a default collision at the current seed
    // (a bare «נקודה D» stacked on A — the ADR-378 collector now honestly refuses to certify it) must
    // start the same search the extension/meet breaks do; before, the gate never asked, so the stack
    // was drawn even though seeds that separate the pair exist.
    if (
      fig.lastError === null &&
      (!extensionsClear(next, fig) || !intersectionsWithinSegments(fig) || !pointsDistinct(fig.construction, fig.positions, fig.coincidences))
    ) {
      const s = firstSatisfyingSeed(next, seed);
      if (s !== seed) {
        patch.seed = s;
        patch.radiusOverrides = {};
      }
    }
  }
  set(patch);
}

export const useGeoStore = create<GeoState>()(
  temporal(
    (set, get) => ({
      facts: [],
      selectedId: null,
      figureName: '',
      seed: 0,
      showMeasures: true,
      showCenters: false,
      radiusOverrides: {},
      hidden: [],
      segStyle: {},
      hiddenCircles: [],
      relations: null,
      values: null,
      queries: [],
      shapes: null,
      crossings: null,

      execute: (cmd, utterance, group) => {
        commitCommands(get, set, [cmd], utterance, group);
      },

      executeMany: (cmds, utterance) => {
        // One utterance → one group id → ONE set → one undo entry for the whole step (E4/STO-4).
        commitCommands(get, set, cmds, utterance, cmds.length > 1 ? nanoid() : undefined);
      },

      undo: () => {
        useGeoStore.temporal.getState().undo();
        // A dialed radius is a viewing scratchpad on the state it annotated — never carry it across (E5).
        if (Object.keys(get().radiusOverrides).length) set({ radiusOverrides: {} });
      },

      redo: () => {
        useGeoStore.temporal.getState().redo();
        if (Object.keys(get().radiusOverrides).length) set({ radiusOverrides: {} });
      },

      update: (id, cmd, utterance) => {
        utterance = cleanUtterance(utterance);
        // Replace the fact's command at its existing position. Because replay
        // applies it where it already sits (before any dependents), changing a
        // parameter just re-derives downstream; an incompatible change makes
        // dependents auto-drop, reversibly — no redefinition conflict, since the
        // edited id isn't yet present at its own slot during replay (ADR-015).
        //
        // PARITY CAVEAT (docs/24 S4.2, docs/23 finding): unlike `replaceGroup` (the ✎ edit path the
        // App actually uses), this single-fact action runs NO settle-variant/seed-advance pass — the
        // view can be left on a seed violating extension/distinctness requirements until a later
        // search. No UI caller exists today; if one is ever added, route it through `replaceGroup`'s
        // parity dance (the ADR-241 edit-path class) rather than calling this raw action.
        set({ facts: get().facts.map((f) => (f.id === id ? { ...f, cmd, utterance } : f)) });
      },

      toggle: (id) => {
        set({ facts: get().facts.map((f) => (f.id === id ? { ...f, enabled: !f.enabled } : f)) });
      },

      remove: (id) => {
        set({
          facts: get().facts.filter((f) => f.id !== id),
          selectedId: get().selectedId === id ? null : get().selectedId,
        });
      },

      setGroupEnabled: (key, enabled) => {
        set({ facts: get().facts.map((f) => (groupKey(f) === key ? { ...f, enabled } : f)) });
      },

      removeGroup: (key) => {
        set({
          facts: get().facts.filter((f) => groupKey(f) !== key),
          selectedId: get().selectedId === key ? null : get().selectedId,
        });
      },

      replaceGroup: (key, cmds, utterance) => {
        utterance = cleanUtterance(utterance);
        const facts = get().facts;
        const start = facts.findIndex((f) => groupKey(f) === key);
        if (start < 0) return;
        let end = start; // the group's commands are a contiguous run (appended together, edited in place)
        while (end < facts.length && groupKey(facts[end]) === key) end++;
        const group = cmds.length > 1 ? nanoid() : undefined; // multi-command edits stay one step
        const replacement: Fact[] = cmds.map((cmd) => ({ id: nanoid(), cmd, utterance, group, enabled: true }));
        let next = [...facts.slice(0, start), ...replacement, ...facts.slice(end)];
        // Edit-path parity: an edited step re-lowers with the parser's default variant — settle it like a
        // newly-typed one (ADR-339).
        const replaced = new Set(replacement.map((f) => f.id));
        next = settleVariantDefaults(next, (f) => replaced.has(f.id), get().seed);
        const patch: Partial<GeoState> = {
          facts: next,
          selectedId: get().selectedId === key ? null : get().selectedId,
        };
        // Edit-path parity with the submit path (commitCommands): an edited command can break an
        // extension's directional order, a segment-meet, or point DISTINCTNESS (#232/ADR-378) at the
        // current seed just like an appended one — search upward for a satisfying view in the SAME
        // transition (one undo restores both, ADR-241).
        const seed = get().seed;
        const fig = replay(next, seed);
        if (
          fig.lastError === null &&
          (!extensionsClear(next, fig) || !intersectionsWithinSegments(fig) || !pointsDistinct(fig.construction, fig.positions, fig.coincidences))
        ) {
          const s = firstSatisfyingSeed(next, seed);
          if (s !== seed) {
            patch.seed = s;
            patch.radiusOverrides = {};
          }
        }
        set(patch);
      },

      select: (id) => {
        set({ selectedId: get().selectedId === id ? null : id });
      },

      setFigureName: (name) => {
        set({ figureName: name });
      },

      viewRelations: async () => {
        // #157 ([ADR-401](docs/06-decisions.md#adr-401)): the sample sweep runs in the geometry WORKER,
        // shared with detectShapes/detectCrossings through `geoWork.detect` (M3's one-sampler law, now
        // across the thread boundary). It used to run SYNCHRONOUSLY here — measured at ~9 s uncapped /
        // the full 5 s `SAMPLE_BUDGET_MS` on the #157 trapezoid-midsegment figure, with the tab frozen
        // for all of it. Sampling contract unchanged (ADR-138 variant configs, requirement-satisfying
        // base seed per ADR-166); only the thread and the memo key (content, not identity) differ.
        const facts = get().facts;
        const r = await detectFor(facts, get);
        if (!r) return; // superseded/cancelled — never overwrite with a layer for another figure
        set({ relations: { result: r.relations, stated: r.stated, facts } });
      },

      clearRelations: () => set({ relations: null }),

      viewValues: async () => {
        // #217 (ADR-410): the 2-D dataView. Off-thread, pull-only (req 4) — the detect lane's worker
        // computes the rows from the shared pool (a pure classification pass when the sweep is warm).
        const facts = get().facts;
        const asked = get().queries;
        try {
          const result = await geoValues(facts, asked.map((text) => ({ text, q: parseValueQuery(text) })));
          if (get().facts !== facts || get().queries !== asked) return; // superseded — never show another figure's values
          set({ values: { result, facts } });
        } catch (err) {
          if (!isCancelled(err)) throw err;
        }
      },
      clearValues: () => set({ values: null }),

      /** #477: ask for a quantity. The panel recomputes so the answer comes from the same pool as the
       *  rows; a duplicate question is a no-op rather than a second identical line. */
      addQuery: (text: string) => {
        const t = text.trim();
        if (!t || get().queries.includes(t)) return;
        set({ queries: [...get().queries, t] });
        void get().viewValues();
      },
      removeQuery: (text: string) => {
        set({ queries: get().queries.filter((q) => q !== text) });
        void get().viewValues();
      },

      detectShapes: async () => {
        // Same shared sweep as viewRelations/detectCrossings — one solve pass between all three layers.
        // (Before ADR-401 this ran on the main thread in batches that yielded every 4 samples; the yield
        // granularity assumed cheap samples, and on a coupled figure ONE sample can be seconds — so the
        // "non-blocking" path still froze the tab in multi-second chunks.)
        const facts = get().facts;
        const r = await detectFor(facts, get);
        if (!r) return;
        set({ shapes: { result: r.shapes, facts } });
      },

      clearShapes: () => set({ shapes: null }),

      detectCrossings: async () => {
        // The crossing-dot affordance is ALWAYS on, so unlike the relations/shapes layers this runs after
        // every step rather than behind a toggle — which is exactly why its sweep must not be on the main
        // thread (issue #157): every step paid it. The figure draws immediately and the dots resolve a
        // beat later; until then the previous step's verdict is still displayed and stale-guarded below,
        // so a dot never flashes onto a figure it was not computed for.
        const facts = get().facts;
        if (get().crossings?.facts === facts) return;
        const r = await detectFor(facts, get);
        if (!r) return;
        set({ crossings: { forced: r.crossings, facts } });
      },

      cycleAlt: (pointId) => {
        const { facts, seed } = get();
        const { construction } = replay(facts, seed);
        const n = branchCount(construction, pointId) || 1;
        const flip = (by: number): Fact[] =>
          facts.map((f) =>
            f.enabled && BRANCH_CYCLE_KINDS.has(f.cmd.type) && 'id' in f.cmd && f.cmd.id === pointId
              ? { ...f, cmd: { ...f.cmd, branch: (((f.cmd as { branch?: number }).branch ?? 0) + by) % n } }
              : f,
          );
        // ADR-340 gate: a branch step must never turn a requirement-SATISFYING view into a violating one
        // (#175 — the two-tangent-circles figure where flipping D collapsed it onto B and broke the stated
        // tangency). Walk to the NEXT branch that keeps the view valid; with none, keep the view. An
        // already-amber view cycles ungated (it can't be made worse, and exploration stays free).
        if (meetsRequirements(facts, seed)) {
          for (let by = 1; by < n; by++) {
            const fc = flip(by);
            if (meetsRequirements(fc, seed)) {
              set({ facts: fc });
              return;
            }
          }
          return; // every alternative branch breaks a currently-valid figure — no-op
        }
        set({ facts: flip(1) });
      },

      cycleVariant: () => {
        const { facts, seed } = get();
        // Step the FIRST cyclable variant fact (kite: 2 axes; isosceles: 3 apexes; inscribe: side/mirror
        // placements). The variant lives in the fact's command (survives replay/undo — positions are never
        // stored), so this is a pure fact rewrite, like cycleAlt's branch step. Not gated by `shapeDiffers`:
        // a variant step is always a genuine change.
        const target = facts.find((f) => f.enabled && cyclableVariant(f.cmd));
        if (!target) return false;
        const count = variantCountOf(target.cmd);
        const cur = (target.cmd as { variant: number }).variant;
        const at = (v: number): Fact[] => facts.map((f) => (f === target ? { ...f, cmd: withVariant(f.cmd, v) } : f));
        // ADR-340 gate — the variant twin of cycleAlt's: from a valid view, step to the next variant that
        // keeps the figure requirement-satisfying (a forced ADR-123 coincidence passes — `pointsDistinct`
        // allows it — so e.g. the corner square stays reachable); skip variants that would violate.
        if (meetsRequirements(facts, seed)) {
          for (let by = 1; by < count; by++) {
            const fc = at((cur + by) % count);
            if (meetsRequirements(fc, seed)) {
              set({ facts: fc });
              return true;
            }
          }
          return false; // every other variant breaks a currently-valid figure
        }
        set({ facts: at((cur + 1) % count) });
        return true;
      },

      resample: () => {
        // The composite search (ADR-340): branch/variant steps are part of the SEARCHED candidate, never a
        // post-hoc mutation — the applied view is always validated as a whole.
        const found = searchAnotherView(get().facts, get().seed);
        if (found === null) return false; // determined (or nothing valid/shape-different in budget)
        set({ ...(found.facts !== get().facts ? { facts: found.facts } : {}), seed: found.seed, radiusOverrides: {} });
        return true;
      },

      applyView: (patch) => {
        set({ ...(patch.facts ? { facts: patch.facts } : {}), seed: patch.seed, radiusOverrides: {} });
      },

      autoResolve: () => {
        const { facts, seed } = get();
        if (meetsRequirements(facts, seed)) return true; // already meets every requirement — nothing to search
        const found = findValidConfig(facts, 0);
        if (found) {
          set({ facts: found.facts, seed: found.seed, radiusOverrides: {} });
          return true;
        }
        return false; // no fully-valid configuration found in budget — keep the current figure (shown amber)
      },

      setRadius: (circle, value) => {
        const { facts, seed, radiusOverrides } = get();
        const candidate = { ...radiusOverrides, [circle]: value };
        // A playable DOF must not be draggable into an IMPOSSIBLE figure (operator requirement): accept a
        // value only if the figure still BUILDS (no error) AND still honours its stated RADIUS RELATIONS —
        // a `set-radius-order` (R>r) / `set-radius-ratio` given is a REQUIREMENT the verifier flags but that
        // leaves `lastError` null, so an order-only check let the slider drag the small circle past the big
        // one (operator report 2026-07-13). Reject a candidate that introduces a radius-order/ratio
        // violation, so the slider STOPS at the R>r boundary. Other (pre-existing) violations don't freeze
        // the slider — only radius-relation ones, which dialing this radius directly controls.
        const fig = replay(facts, seed, candidate);
        const radiusViolated = fig.violations.some(
          (v) => v.relation === 'radius-order' || v.relation === 'radius-ratio' || v.relation === 'circles-disjoint' || v.relation === 'circle-contained',
        );
        if (fig.lastError === null && !radiusViolated) set({ radiusOverrides: candidate });
      },

      setShowMeasures: (show) => set({ showMeasures: show }),
      setShowCenters: (show) => set({ showCenters: show }),

      toggleHidden: (id) => {
        const I = id.toUpperCase();
        const h = get().hidden;
        set({ hidden: h.includes(I) ? h.filter((x) => x !== I) : [...h, I] });
      },

      toggleSegHidden: (id) => set({ segStyle: setSegFlag(get().segStyle, id, 'hidden') }),
      toggleSegDashed: (id) => set({ segStyle: setSegFlag(get().segStyle, id, 'dashed') }),

      toggleCircleHidden: (id) => {
        const h = get().hiddenCircles;
        set({ hiddenCircles: h.includes(id) ? h.filter((x) => x !== id) : [...h, id] });
      },

      rename: (from, to) => {
        const F = from.toUpperCase();
        const T = to.toUpperCase();
        const r = renameFacts(get().facts, F, T); // the pure core (#539) — shared with the harness/triage mirrors
        if (!r.ok) return r;
        set({
          facts: r.facts,
          hidden: get().hidden.map((h) => (h === F ? T : h)), // a hidden point keeps its hidden state under the new letter
          segStyle: renameSegStyle(get().segStyle, F, T), // a styled segment keeps its style under the renamed endpoint
          hiddenCircles: get().hiddenCircles.map((c) => (c === `circle-${F}` ? `circle-${T}` : c)), // a hidden circle tracks its renamed centre
          // a dialed radius (keyed `circle-X`) tracks its renamed centre too — else the override orphans
          // and the circle silently snaps back to its seed radius (review 2026-07-03, S2)
          radiusOverrides: Object.fromEntries(Object.entries(get().radiusOverrides).map(([k, v]) => [relabelId(k, F, T), v])),
          selectedId: null,
        });
        return { ok: true };
      },

      /**
       * NAME an auto-assigned circle centre (issue #112) — the student drew an unnamed circle (hidden
       * auto-centre `from`) and now names it `to`. Mechanically a rename (`from`→`to` across every fact,
       * via the same `renameInCommand` id-remap — which rewrites `circle-O`→`circle-P` and `center:O`→P)
       * PLUS a REVEAL: the just-named centre's circle drops its `autoCenter` flag so the point shows
       * (FR-RN-8). One `set` → one undo entry. Never mints a second circle.
       */
      nameCentre: (from, to) => {
        const r = nameCentreFacts(get().facts, from, to);
        if (!r.ok) return { ok: false, reason: r.reason };
        const { source, letter, anon } = r;
        const T = to.toUpperCase();
        set({
          facts: r.facts,
          hidden: get().hidden.map((h) => (h === source ? T : h)),
          segStyle: renameSegStyle(get().segStyle, source, T),
          hiddenCircles: get().hiddenCircles.map((c) => (c === `circle-${letter}` ? `circle-${T}` : c)),
          radiusOverrides: Object.fromEntries(
            Object.entries(get().radiusOverrides).map(([k, v]) => [
              // whole-id (or concentric `-`-suffix) mapping — never substring (the ADR-122 class, see nameCentreFacts)
              anon ? (k === `circle-${letter}` ? `circle-${T}` : k.startsWith(`circle-${letter}-`) ? `circle-${T}` + k.slice(`circle-${letter}`.length) : k) : relabelId(k, source, T),
              v,
            ]),
          ),
          selectedId: null,
        });
        return { ok: true };
      },

      /**
       * PROMOTE an anonymous constructed point (#32 / ADR-297). The decomposition minted it with a
       * `@`-prefixed id (e.g. `@f-AB`, an incircle touch point) so it never occupied a student letter and
       * rendered as a clickable dot; when the student clicks it, it becomes a real named point at the next
       * free capital letter. Mechanically it's a rename `@f-AB → F` across every command (via the same
       * `renameInCommand` id-remap; the `@`-id is a literal, not a letter token, so only its exact
       * occurrences are rewritten). The utterance carries no `@`-id, so the step row text is untouched.
       */
      promote: (auxId) => {
        if (!auxId.startsWith('@')) return null; // only an anon point is promotable
        const facts = get().facts;
        const used = new Set(facts.flatMap((f) => commandPointIds(f.cmd))); // student letters in use (never `@`-ids)
        let to = '';
        for (let k = 0; k < 26; k++) {
          const ch = String.fromCharCode(65 + k);
          if (!used.has(ch)) { to = ch; break; }
        }
        if (!to) return null; // A–Z all taken (won't happen in practice)
        // An anonymous CIRCLE CENTRE ('@ctr-…', ADR-342) promotes through the naming flow — the same
        // rename + circle-id follow + autoCenter reveal «מרכז המעגל הוא X» does.
        if (auxId.startsWith('@ctr-')) {
          const res = get().nameCentre(auxId, to);
          return res.ok ? to : null;
        }
        set({
          facts: facts.map((f) => ({ ...f, cmd: renameInCommand(f.cmd, auxId, to) })),
          selectedId: null,
        });
        return to;
      },

      /**
       * SWAP two EXISTING labels (A↔B) across every fact — the natural "put C where D is, and D where
       * C is" that `rename` can't do (it refuses a taken target, to avoid an accidental merge). Built on
       * the rename primitives via a `\0` sentinel so the two exchanges don't collide. (ADR-122.)
       */
      swap: (a, b) => {
        const A = a.toUpperCase();
        const B = b.toUpperCase();
        if (A === B) return { ok: false, reason: 'same' };
        const facts = get().facts;
        const all = new Set(facts.flatMap((f) => commandPointIds(f.cmd)));
        if (!all.has(A) || !all.has(B)) return { ok: false, reason: 'no-source' }; // both must exist
        const TMP = '\u0000'; // a sentinel that can never be a real label or appear in an utterance
        const swapCmd = (cmd: AnyCommand) => renameInCommand(renameInCommand(renameInCommand(cmd, A, TMP), B, A), TMP, B);
        const swapUtt = (u: string | undefined) => relabelUtterance(relabelUtterance(relabelUtterance(u, A, TMP), B, A), TMP, B);
        const swapKey = (k: string) => relabelId(relabelId(relabelId(k, A, TMP), B, A), TMP, B);
        set({
          facts: facts.map((f) => ({ ...f, cmd: swapCmd(f.cmd), utterance: swapUtt(f.utterance) })),
          hidden: get().hidden.map((h) => (h === A ? B : h === B ? A : h)),
          segStyle: renameSegStyle(renameSegStyle(renameSegStyle(get().segStyle, A, TMP), B, A), TMP, B),
          hiddenCircles: get().hiddenCircles.map((c) => (c === `circle-${A}` ? `circle-${B}` : c === `circle-${B}` ? `circle-${A}` : c)),
          // dialed radii (keyed `circle-X`) swap with their centres (review 2026-07-03, S2)
          radiusOverrides: Object.fromEntries(Object.entries(get().radiusOverrides).map(([k, v]) => [swapKey(k), v])),
          selectedId: null,
        });
        return { ok: true };
      },

      merge: (from, to) => {
        const F = from.toUpperCase();
        const T = to.toUpperCase();
        if (F === T) return { ok: false, reason: 'same' };
        const facts = get().facts;
        const all = new Set(facts.flatMap((f) => commandPointIds(f.cmd)));
        if (!all.has(F)) return { ok: false, reason: 'no-source' };
        if (!all.has(T)) return { ok: false, reason: 'no-target' }; // merging into a NEW letter is a rename, not a merge
        // F must have its OWN single-point definition (a command with `id === F`) to fold;
        // a shape vertex (in an `ids[]` tuple) or an auto-created endpoint has none and can't
        // be cleanly absorbed without tearing apart the construct that introduced it.
        const defining = facts.find((f) => (f.cmd as { id?: Id }).id === F);
        if (!defining) return { ok: false, reason: 'source-in-shape' };
        const merged = facts
          .filter((f) => f.id !== defining.id) // drop F's own definition — T survives, F is absorbed
          .map((f) => ({
            ...f,
            cmd: renameInCommand(f.cmd, F, T),
            // token-aware, like rename/swap — the old substring split/join corrupted multi-char labels
            // (`F1`→`E1` when folding F→E), and ✎-edit re-parses this text (STO-6)
            utterance: relabelUtterance(f.utterance, F, T),
          }))
          .filter((f) => !collapsedDegenerate(f.cmd)); // drop facts that collapsed (segment EF → EE, …)
        set({
          facts: merged,
          hidden: [...new Set(get().hidden.map((h) => (h === F ? T : h)))],
          segStyle: renameSegStyle(get().segStyle, F, T),
          hiddenCircles: [...new Set(get().hiddenCircles.map((c) => (c === `circle-${F}` ? `circle-${T}` : c)))],
          // a dialed radius follows the fold (review 2026-07-03, S2)
          radiusOverrides: Object.fromEntries(Object.entries(get().radiusOverrides).map(([k, v]) => [relabelId(k, F, T), v])),
          selectedId: null,
        });
        return { ok: true };
      },

      clear: () => {
        set({ facts: [], selectedId: null, figureName: '', seed: 0, radiusOverrides: {}, hidden: [], segStyle: {}, hiddenCircles: [], relations: null, values: null, shapes: null, queries: [] });
        useGeoStore.temporal.getState().clear();
      },

      loadFigure: (file) => {
        // ONE `set` — zundo records a single entry (facts + seed are the tracked slice), so undo
        // brings back whatever session was open before the load. The dialed radii are applied but
        // stay a scratchpad (cleared by undo/"show another", exactly as if the student dialed them).
        set({
          facts: file.facts,
          seed: file.seed,
          radiusOverrides: file.radiusOverrides,
          queries: file.queries ?? [],
          selectedId: null,
          relations: null,
          shapes: null,
          hidden: file.display?.hidden ?? [],
          segStyle: file.display?.segStyle ?? {},
          hiddenCircles: file.display?.hiddenCircles ?? [],
          ...(file.display?.showMeasures !== undefined ? { showMeasures: file.display.showMeasures } : {}),
          ...(file.display?.showCenters !== undefined ? { showCenters: file.display.showCenters } : {}),
        });
      },
    }),
    {
      // The fact list AND the seed participate in undo/redo (E5/STO-5): `execute` can auto-advance the
      // seed and `autoResolve`/`resample` set it, so restoring facts at a DIFFERENT seed showed the
      // student a figure they never saw — undo now rolls the view back with the data. Transient
      // selection and the dialed-radius scratchpad stay out (the store's `undo`/`redo` wrappers clear
      // the overrides instead — a per-drag slider value must not flood the history).
      partialize: (s) => ({ facts: s.facts, seed: s.seed }),
      // Skip history entries when neither changed (e.g. selecting a fact only sets selectedId).
      equality: (a, b) => a.facts === b.facts && a.seed === b.seed,
      limit: 100,
    },
  ),
);
