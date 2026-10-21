/**
 * THE NAMING CORES — the pure fact-list rewrites behind every relabel (#1697, [ADR-588](../../docs/06-decisions.md#adr-588)).
 *
 * Moved down from `store/geoStore.ts` (which re-exports them unchanged) because `replay` now needs them:
 * a NAMING BY USE — «נקודה C על מעגל P» naming an unnamed circle P, the #539 point edition, and the
 * #1673 hidden-token step-aside — is no longer a store rename that no line owns. It is a `name-by-use`
 * fact in the naming line's own group, and {@link resolveBinds} applies it during replay through these
 * same cores. Deleting, muting, editing or undoing the line therefore takes the name with it.
 */
import type { AnyCommand, Id, RoleSideBinding } from '@/engine';
import { commandPointIds } from './core';
import type { Fact } from './core';

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
export function renameInCommand(cmd: AnyCommand, from: Id, to: Id): AnyCommand {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(cmd)) {
    if (k === 'expr') out[k] = v; // a measure expr holds a variable/text, not point ids — never rewrite
    // #1810 (ADR-596): a role binding names the triangle it was resolved against — a renamed vertex renames it too
    else if (k === 'roleSide' && v && typeof v === 'object') {
      const b = v as RoleSideBinding;
      out[k] = { ...b, ring: b.ring.map((e) => relabelId(e, from, to)), at: relabelId(b.at, from, to) };
    }
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
export const relabelUtterance = (utt: string | undefined, from: Id, to: Id): string | undefined =>
  utt ? utt.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?!\\d)', 'g'), to) : utt;

/** Outcome of a relabel request, so the UI can explain a no-op. */
/**
 * WHO holds a letter, and whether it can be taken back (#238, [ADR-520](docs/06-decisions.md#adr-520)).
 *
 * The student is on the canvas; the holder is a row in the step list they have no reason to connect to
 * «האות כבר בשימוש». So the refusal carries the holder with it.
 */
export interface LetterHolder {
  /** The fact that INTRODUCED the letter — its id, so the UI can highlight that row. */
  factId: string;
  /** The student's own wording of that statement, to quote back. */
  utterance: string;
}

export type RenameResult = { ok: true } | { ok: false; reason: 'same' | 'no-source' } | { ok: false; reason: 'target-taken'; holder: LetterHolder | null };

/**
 * The statement that introduced `letter` — who to name in «האות כבר בשימוש» (#238).
 *
 * **It no longer decides whether a swap is OFFERED (#1199).** It carried a `swappable` flag for that,
 * and the flag answered a question nobody asks any more: *"is deleting the holder safe?"*, back when
 * the offer deleted the holder’s statement. #1013 (ADR-520 Am. 1) retired the delete and kept the
 * predicate as the offer’s SCOPE, deliberately and on the operator’s earlier approval.
 *
 * The visible residue was an ASYMMETRY, reported playing round #1193 T14: *"pressing on D and asking
 * it to be A is refused, but pressing on A and asking it to be D is allowed … I see no difference in
 * the cases so we should always allow switching names of nodes."* The gate read the TARGET’s holder
 * only, so one pair of letters was refused in one direction and offered in the other — decided by
 * nothing but which of the two the student happened to click first.
 *
 * **Operator ruling, 2026-09-18: always allow switching.** A swap destroys nothing, so no safety
 * question is left for a gate to answer, and the flag is REMOVED rather than pinned to `true`: an
 * always-true predicate is a question the code keeps asking after the answer stopped mattering.
 */
export function letterHolder(facts: Fact[], letter: Id): LetterHolder | null {
  const L = letter.toUpperCase();
  const enabled = facts.filter((f) => f.enabled);
  const idx = enabled.findIndex((f) => commandPointIds(f.cmd).includes(L));
  if (idx < 0) return null;
  const holder = enabled[idx];
  return { factId: holder.id, utterance: holder.utterance ?? '' };
}

/**
 * The PURE fact-list core of the `rename` store action — the `nameCentreFacts` precedent, point
 * edition (#539): extracted so the point naming-by-use binding (`impliedPointBinding`) can run on
 * plain fact arrays in the App's submit loop, the scenario harness, and the log-triage verifier with
 * THE SAME implementation (a re-implementation is the ADR-346 drift class this repo keeps paying for).
 */
export function renameFacts(facts0: Fact[], from: Id, to: Id): { ok: true; facts: Fact[] } | { ok: false; reason: 'same' | 'no-source' } | { ok: false; reason: 'target-taken'; holder: LetterHolder | null } {
  const F = from.toUpperCase();
  const T = to.toUpperCase();
  if (F === T) return { ok: false, reason: 'same' };
  // #1673 (ADR-565): a hidden circle token the student types steps aside before the rename takes the letter
  const facts = stepAsideFacts(facts0, [T]).facts;
  const all = new Set(facts.flatMap((f) => commandPointIds(f.cmd)));
  if (!all.has(F)) return { ok: false, reason: 'no-source' };
  if (all.has(T)) return { ok: false, reason: 'target-taken', holder: letterHolder(facts, T) }; // would merge two distinct points
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
 * #2122 ([ADR-653](../../docs/06-decisions.md#adr-653)) — the MERGE core of a naming by use: the auto-named point
 * `from` takes the student's letter `to`, which ALREADY names a point that a later line made the same point by
 * construction (`impliedIdentityBinding`). Every `from` becomes `to`; the facts that introduced `to` then state
 * things about the named point (M1 lowering). Supported only while `from` is defined before `to` first appears, so
 * the renamed list defines `to` where `from` was; otherwise (an earlier line edited or deleted) nothing is applied.
 */
export function mergeFacts(facts: Fact[], from: Id, to: Id): { ok: true; facts: Fact[] } | { ok: false } {
  const F = from.toUpperCase();
  const T = to.toUpperCase();
  if (F === T) return { ok: false };
  const firstAt = (id: Id) => facts.findIndex((f) => f.enabled && commandPointIds(f.cmd).includes(id));
  const iF = firstAt(F), iT = firstAt(T);
  if (iF < 0 || iT < 0 || iF >= iT) return { ok: false };
  return { ok: true, facts: facts.map((f) => ({ ...f, cmd: renameInCommand(f.cmd, F, T), utterance: relabelUtterance(f.utterance, F, T) })) };
}

/**
 * #1673 / #1688 ([ADR-565](docs/06-decisions.md#adr-565), operator ruling 2026-10-02) — THE HIDDEN CENTRE LETTER
 * STEPS ASIDE. An unnamed circle keeps an internal reference token the tool picked (`O`, then `P`, `Q`, `K`):
 * its centre is `@ctr-O`, its id `circle-O`. The student never saw that letter, so it may never take part in
 * the student's naming. Whenever the student types the letter — as a new point («BO = 5»), a new circle
 * («מעגל O»), a naming target («מרכז המעגל הימני הוא O») — the hidden circle is re-lettered first, to a
 * letter nobody uses, and the student's letter is then simply a fresh letter.
 */

/** The tokens of the circles whose centre is still anonymous (`@ctr-…`, never promoted by a `name-center`). */
export function hiddenCentreTokens(facts: Fact[]): string[] {
  const promoted = new Set(facts.flatMap((f) => (f.cmd.type === 'name-center' ? [(f.cmd as { center: string }).center.toUpperCase()] : [])));
  const out: string[] = [];
  for (const f of facts) {
    const c = f.cmd as { type?: string; center?: string };
    if ((c.type !== 'circle' && c.type !== 'circle-through') || !c.center?.startsWith('@ctr-')) continue;
    const tok = c.center.slice(5);
    if (!promoted.has(tok) && !out.includes(tok)) out.push(tok);
  }
  return out;
}

/** Re-letter ONE hidden circle `from` → `to` across every fact: its anonymous centre and its circle id (with the
 *  concentric `-2` suffix). Whole-value exact, so a student's own point or `circle-<from>1` is untouched. The
 *  utterances never contain the hidden letter, so they stay as typed. */
export function reletterHiddenFacts(facts: Fact[], from: Id, to: Id): Fact[] {
  const ctrFrom = `@ctr-${from}`;
  const ctrTo = `@ctr-${to}`;
  const cFrom = `circle-${from}`;
  const cTo = `circle-${to}`;
  const map = (v: unknown): unknown =>
    typeof v === 'string'
      ? v === ctrFrom ? ctrTo : v === cFrom ? cTo : v.startsWith(`${cFrom}-`) ? cTo + v.slice(cFrom.length) : v
      : Array.isArray(v) ? v.map(map) : v;
  return facts.map((f) => ({ ...f, cmd: Object.fromEntries(Object.entries(f.cmd).map(([k, v]) => [k, k === 'expr' ? v : map(v)])) as AnyCommand }));
}

/**
 * #2362 / #2369 ([ADR-748](../../docs/06-decisions.md#adr-748)) — the commands that CREATE a circle with a centre letter:
 * the free circle, the circle through a point, and the circle through three drawn points. One predicate, shared by the
 * naming cores, so a fourth creation can never be left out of one of them again (the `circumcircle` was).
 */
export function isCircleCreation(cmd: AnyCommand): boolean {
  return cmd.type === 'circle' || cmd.type === 'circle-through' || cmd.type === 'circumcircle';
}

/** The letters the student TYPED somewhere in the list: every Latin word that is a run of labels («BO» → B, O), so an
 *  English word («Triangle») contributes nothing — the parser's `typedLabels` reading, which this layer cannot import. */
function typedInFacts(facts: Fact[]): Set<string> {
  const typed = new Set<string>();
  for (const f of facts) {
    if (!f.enabled || !f.utterance) continue;
    for (const word of f.utterance.match(/[A-Za-z0-9]+/g) ?? []) {
      const w = word.replace(/^\d+/, '');
      if (/^(?:[A-Z]\d*)+$/.test(w)) for (const l of w.match(/[A-Z]\d*/g) ?? []) typed.add(l);
    }
  }
  return typed;
}

/**
 * The real centre letters of circles drawn through drawn points (`circumcircle`) that the TOOL minted and the student
 * has not made theirs: no `autoCenter: false` (named in the sentence, or adopted while shown), no `name-center`
 * promotion, and typed in no line (a legacy file whose later line used the letter as the centre keeps that meaning).
 */
function mintedCircumLetters(facts: Fact[]): string[] {
  const promoted = new Set(facts.flatMap((f) => (f.cmd.type === 'name-center' ? [(f.cmd as { center: string }).center.toUpperCase()] : [])));
  const typed = typedInFacts(facts);
  const out: string[] = [];
  for (const f of facts) {
    const c = f.cmd as { type?: string; center?: string; autoCenter?: boolean };
    if (c.type !== 'circumcircle' || !c.center || c.autoCenter === false || c.center.startsWith('@')) continue;
    if (!promoted.has(c.center) && !typed.has(c.center) && !out.includes(c.center)) out.push(c.center);
  }
  return out;
}

/**
 * #2362 (ADR-748, operator ruling 2026-10-20) — EVERY centre letter the tool picked that the student has not made theirs:
 * the hidden tokens of unnamed circles ({@link hiddenCentreTokens}) and the minted letters of circles drawn through drawn
 * points. Such a letter is not a name the student can bind to unless it was on screen when the line was typed.
 */
export function mintedCentreLetters(facts: Fact[]): string[] {
  return [...hiddenCentreTokens(facts), ...mintedCircumLetters(facts)];
}

/** Re-letter a MINTED circumcircle centre `from` → `to` across the commands (its centre, its circle id, anything the
 *  parser derived from it). The utterances never contain a minted letter, so they stay as typed. */
function reletterMintedFacts(facts: Fact[], from: Id, to: Id): Fact[] {
  return facts.map((f) => ({ ...f, cmd: renameInCommand(f.cmd, from, to) }));
}

/** ADOPT a minted circumcircle centre: the student typed it while it was shown, so it is theirs (drawn at rest). */
function adoptCentreFacts(facts: Fact[], letter: Id): Fact[] {
  return facts.map((f) =>
    f.cmd.type === 'circumcircle' && f.cmd.center === letter && f.cmd.autoCenter !== false ? { ...f, cmd: { ...f.cmd, autoCenter: false } } : f,
  );
}

/** Every letter the fact list already spends — point ids and circle tokens, hidden or not. */
function spentLetters(facts: Fact[]): Set<string> {
  const out = new Set<string>(facts.flatMap((f) => commandPointIds(f.cmd)));
  for (const f of facts) {
    const c = f.cmd as { type?: string; id?: string; center?: string };
    if (typeof c.id === 'string' && c.id.startsWith('circle-')) out.add(c.id.slice(7).replace(/-\d+$/, ''));
    if (typeof c.center === 'string' && c.center.startsWith('@ctr-')) out.add(c.center.slice(5));
  }
  return out;
}

/**
 * Move every hidden token the student is about to use (`letters`) to a fresh letter. Returns the new facts and
 * the moves made (empty when nothing collides). Deterministic: the fresh letter is the first of O, P, Q, K, then
 * A–Z, then A1… that no fact spends and `letters` does not name.
 *
 * #2362 (ADR-748): given `visible` — the letters drawn WITH THEIR LABEL when the line was typed (the scene's own
 * `drawnPointIds` rule, centres shown or not) — the minted letters of circles drawn through drawn points take part
 * too: one the student could see is ADOPTED (`adopted`; it is theirs from then on), one they could not steps aside
 * like a token. Without `visible` (the rename and naming cores, which have no view) only the tokens move, as before.
 */
export function stepAsideFacts(
  facts: Fact[],
  letters: Iterable<string>,
  visible?: ReadonlySet<string>,
): { facts: Fact[]; moves: { from: Id; to: Id }[]; adopted: Id[] } {
  const want = new Set([...letters].map((l) => l.toUpperCase()));
  const tokens = hiddenCentreTokens(facts);
  const hits = (visible ? mintedCentreLetters(facts) : tokens).filter((t) => want.has(t));
  if (!hits.length) return { facts, moves: [], adopted: [] };
  const moves: { from: Id; to: Id }[] = [];
  const adopted: Id[] = [];
  let out = facts;
  for (const from of hits) {
    const token = tokens.includes(from);
    if (!token && visible?.has(from)) {
      out = adoptCentreFacts(out, from);
      adopted.push(from);
      continue;
    }
    const avoid = new Set([...spentLetters(out), ...want]);
    const order = ['O', 'P', 'Q', 'K', ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))];
    let to = order.find((l) => !avoid.has(l));
    for (let cycle = 1; !to; cycle++) to = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i) + cycle).find((l) => !avoid.has(l));
    out = token ? reletterHiddenFacts(out, from, to) : reletterMintedFacts(out, from, to);
    moves.push({ from, to });
  }
  return { facts: out, moves, adopted };
}

/**
 * A point the naming may ABSORB into a circle's centre («BO = 5» then «O מרכז המעגל»): nothing places it —
 * no command defines it except a bare `free-point`, it is no shape's vertex — and it is first used after the
 * circle exists, so the renamed centre is defined before every fact that refers to it.
 */
function absorbablePoint(facts: Fact[], T: Id, centre: Id): boolean {
  const createdAt = facts.findIndex((f) => (f.cmd as { center?: string }).center === centre && isCircleCreation(f.cmd));
  const firstUse = facts.findIndex((f) => commandPointIds(f.cmd).includes(T));
  if (createdAt < 0 || firstUse < 0 || firstUse < createdAt) return false;
  return facts.every((f) => {
    const c = f.cmd as { type: string; id?: unknown; id1?: unknown; id2?: unknown; ids?: unknown; vertices?: unknown };
    if ((c.id === T || c.id1 === T || c.id2 === T) && c.type !== 'free-point') return false;
    if (Array.isArray(c.ids) && c.ids.includes(T)) return false;
    if (Array.isArray(c.vertices) && c.vertices.includes(T)) return false;
    return true;
  });
}

/**
 * The PURE fact-list core of the `nameCentre` store action (ADR-342 / #186): resolve the centre token
 * `from` (a letter, or a raw '@ctr-…' id) to the owning circle's real centre and rename it — plus the
 * circle's reference id letter-half and the auto-centre reveal — to `to`, across every fact. Extracted
 * so the log-triage verifier can mirror the App's #186 name-binding step on its plain fact arrays with
 * THE SAME implementation (a re-implementation is the ADR-346 drift class this repo keeps paying for).
 */
export function nameCentreFacts(
  facts0: Fact[],
  from: Id,
  to: Id,
): { ok: true; facts: Fact[]; source: string; letter: string; anon: boolean } | { ok: false; reason: 'same' | 'no-source' } | { ok: false; reason: 'target-taken'; holder: LetterHolder | null } {
  const F = from.startsWith('@') ? from : from.toUpperCase();
  const T = to.toUpperCase();
  let facts = facts0;
  let source: string | null = null;
  let letter: string | null = null; // the circle-id letter half (`circle-<letter>`)
  // #2362 (ADR-748): naming a MINTED circumcircle centre — its own letter included («מרכז המעגל הוא O» on the hidden O)
  // — is a real change: the letter becomes the student's and the centre is drawn
  const minted = new Set(mintedCircumLetters(facts));
  for (const f of facts) {
    const c = f.cmd as { type?: string; center?: string };
    if (!isCircleCreation(f.cmd) || !c.center) continue;
    const tok = c.center.startsWith('@ctr-') ? c.center.slice(5) : c.center;
    if (tok === F || c.center === F) {
      source = c.center;
      letter = tok;
      break;
    }
  }
  // #1673 / #1688 (ADR-565): the target letter may be ANOTHER unnamed circle's hidden token — the student never saw
  // it, so it steps aside (re-lettered, still hidden) instead of colliding: «מרכז המעגל הימני הוא O» used to
  // rename P's centre onto the left circle's `circle-O` and wipe the figure.
  if (letter !== T && hiddenCentreTokens(facts).includes(T)) facts = stepAsideFacts(facts, [T]).facts;
  let all = new Set(facts.flatMap((f) => commandPointIds(f.cmd)));
  if (!source) {
    // legacy: renaming a centre letter that IS a plain point (a named centre being re-lettered)
    if (!all.has(F)) return { ok: false, reason: 'no-source' };
    source = F;
    letter = F;
  }
  if (source === T && !minted.has(source)) return { ok: false, reason: 'same' }; // promoting a token to its OWN letter ('@ctr-O'→'O') is a real change
  if (all.has(T) && source !== T) {
    // #1673 (ADR-565): «BO = 5» drew a FREE point O; «O מרכז המעגל» then PLACES that O at the centre — the free
    // point is absorbed (its bare `free-point`, if any, dropped) and every fact that used O now uses the centre.
    if (!source.startsWith('@') || !absorbablePoint(facts, T, source)) return { ok: false, reason: 'target-taken', holder: letterHolder(facts, T) };
    facts = facts.filter((f) => !(f.cmd.type === 'free-point' && (f.cmd as { id?: string }).id === T));
    all = new Set(facts.flatMap((f) => commandPointIds(f.cmd)));
  }
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
    // #2369 (ADR-748): a circumcircle's provenance is explicit — absent reads as minted — so its reveal writes `false`
    const revealed =
      cmd.type === 'circumcircle' && cmd.center === T && cmd.autoCenter !== false
        ? ({ ...cmd, autoCenter: false } as AnyCommand)
        : (cmd.type === 'circle' || cmd.type === 'circle-through') && (cmd as { center?: string }).center === T && (cmd as { autoCenter?: boolean }).autoCenter
        ? (() => {
            const { autoCenter: _drop, ...rest } = cmd as Record<string, unknown>;
            return rest as AnyCommand;
          })()
        : cmd;
    return { ...f, cmd: revealed, utterance: anon ? f.utterance : relabelUtterance(f.utterance, source!, T) };
  });
  return { ok: true, facts: mapped, source, letter: letter!, anon };
}

/** A naming-by-use fact (#1697): what the line's naming did, replayed instead of stored as a rewrite. */
export type NameByUse = Extract<AnyCommand, { type: 'name-by-use' }>;

/** `@ctr-P` → `P`: a step-aside carries hidden tokens in their anonymous-centre form, so no letter reader
 *  (`commandPointIds`, the letter-holder lookup) ever mistakes them for a student's point. */
const hiddenLetter = (v: Id): Id => (v.startsWith('@ctr-') ? v.slice(5) : v);

/**
 * Apply ONE naming-by-use to the facts BEFORE it — the same core the submit decision simulated, so the
 * replayed figure is exactly the one the decision parsed against. A naming the earlier facts no longer
 * support (an earlier line was edited or deleted, so the circle or the point it named is gone, or the
 * letter is now taken) applies nothing; the line's own statements then name a letter nothing defines
 * and fail honestly on their row.
 */
export function applyNameByUse(prefix: Fact[], b: NameByUse): Fact[] {
  switch (b.op) {
    case 'centre': {
      const r = nameCentreFacts(prefix, b.from, b.to);
      return r.ok ? r.facts : prefix;
    }
    case 'point': {
      const r = renameFacts(prefix, b.from, b.to);
      return r.ok ? r.facts : prefix;
    }
    case 'merge': {
      const r = mergeFacts(prefix, b.from, b.to);
      return r.ok ? r.facts : prefix;
    }
    case 'step-aside': {
      // only a token that is still HIDDEN steps aside — once it is gone (already moved, or named) there is nothing
      // to move, and `circle-<letter>` may by then be a circle the student named that letter
      const from = hiddenLetter(b.from);
      if (hiddenCentreTokens(prefix).includes(from)) return reletterHiddenFacts(prefix, from, hiddenLetter(b.to));
      // #2362 (ADR-748): a minted circumcircle letter steps aside the same way, while it is still minted
      return mintedCircumLetters(prefix).includes(from) ? reletterMintedFacts(prefix, from, hiddenLetter(b.to)) : prefix;
    }
    case 'adopt': {
      // #2362 (ADR-748): the letter was shown when the line was typed — it is the student's from here on
      const letter = hiddenLetter(b.from);
      return mintedCircumLetters(prefix).includes(letter) ? adoptCentreFacts(prefix, letter) : prefix;
    }
  }
}

const resolvedLists = new WeakSet<Fact[]>();
/** The naming facts a resolution already applied — a copy of a resolved list never applies them twice. */
const appliedNamings = new WeakSet<Fact>();
const resolveMemo = new WeakMap<Fact[], { snapshot: Fact[]; out: Fact[] }>();

/**
 * #1697 ([ADR-588](../../docs/06-decisions.md#adr-588)) — THE FACT LIST AS THE FIGURE READS IT: every enabled
 * `name-by-use` fact applied, in order, to the facts that come BEFORE it. Positional on purpose: a later
 * line was parsed in the world the naming made (it already says P), and a letter the naming freed may be
 * minted again later — rewriting forward would capture it. So replaying a prefix that stops before the
 * naming line never sees the name, and nothing a later line binds leaks backwards into an earlier replay.
 *
 * The naming facts themselves stay in the list (they lower to nothing), so every row keeps its id and
 * status. A list with no naming fact is returned as is — the common case costs one scan. Pure, memoised
 * per list (the store never mutates one), and idempotent twice over: an applied naming is marked, and
 * re-applying one finds nothing to rename (its source is gone from the facts before it).
 */
export function resolveBinds(facts: Fact[]): Fact[] {
  if (resolvedLists.has(facts) || !facts.some((f) => f.cmd.type === 'name-by-use' && !appliedNamings.has(f))) return facts;
  const hit = resolveMemo.get(facts);
  if (hit && hit.snapshot.length === facts.length && hit.snapshot.every((f, i) => f === facts[i])) return hit.out;
  let out: Fact[] = [];
  for (const f of facts) {
    if (f.cmd.type !== 'name-by-use' || appliedNamings.has(f)) {
      out.push(f);
      continue;
    }
    if (f.enabled) out = [...applyNameByUse(out, f.cmd)];
    const applied = { ...f }; // same id, same command — marked so a copy of this list never applies it again
    if (f.enabled) appliedNamings.add(applied);
    out.push(applied);
  }
  resolvedLists.add(out);
  resolveMemo.set(facts, { snapshot: facts.slice(), out });
  return out;
}

/** The `name-by-use` facts a line's naming produced — prepended to the line's own commands, one group. */
export function nameByUseCommands(binds: readonly { op: 'name-centre' | 'rename' | 'merge' | 'step-aside' | 'adopt'; from: Id; to: Id }[]): NameByUse[] {
  return binds.map((b) =>
    b.op === 'step-aside' || b.op === 'adopt'
      ? { type: 'name-by-use', op: b.op, from: `@ctr-${hiddenLetter(b.from)}`, to: `@ctr-${hiddenLetter(b.to)}` }
      : { type: 'name-by-use', op: b.op === 'name-centre' ? 'centre' : b.op === 'merge' ? 'merge' : 'point', from: b.from, to: b.to },
  );
}
