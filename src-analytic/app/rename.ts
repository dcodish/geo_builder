/**
 * RENAME A POINT'S LETTER (#1154) — «שנה שם A ל-G», and the «שנה אות» entry of the click menu.
 *
 * Operator, 2026-09-16: *"we want to allow changing a node letter by clicking on it like the 2d tools
 * mechanism."* And again 2026-10-01, playing a right trapezoid whose default lettering put the right
 * angle on the "wrong" vertex for the exam's labels: *"the ability to click on a node and change its
 * name … would have solved this"*.
 *
 * ## A rename rewrites HISTORY, it states nothing
 *
 * This product's source of truth is the student's ordered LINES; the figure is re-derived from them.
 * So a rename is not a fact and not a command — it is a rewrite of every stored line that names the
 * letter, after which replay is exactly what it would have been had the student typed the new letter
 * from the start. That is the 2-D (`renameFacts`, #539) and 3-D (`renameFacts3`, #578) shape; the
 * PATTERN is copied, never imported (`BOUNDARIES.json`).
 *
 * The 2026-09-21 ruling binds it: *"if a letter is changed, change all inputs and data panel items
 * accordingly"* — so the ask rows (`queries`) are rewritten in the SAME commit, by the same token rule,
 * and the AI lane's display sentences (`spokenFor`) with them. A rename that stopped at the lines would
 * fill the data panel with «אין בשרטוט נקודה בשם B» one gesture after the student renamed B.
 *
 * ## The rewrite is TEXTUAL, and then PROVEN
 *
 * The lines are text, so the rewrite is a token substitution — but a text rule alone cannot know that
 * the `R` of `x²+y²=R²` is a parameter, or that an English "A" may be an article. 3-D could rewrite
 * the parsed commands and skip raw fields; here the text IS the record. So every rewritten line is
 * checked against what it must mean: **the new line must parse to exactly the old line's facts with
 * the point id renamed** — nothing else may change. Where substituting every occurrence fails that
 * test, the subsets of occurrences are tried (largest first), so a parameter that happens to share the
 * letter is left alone and the point beside it is renamed. A line no subset can rewrite faithfully is
 * refused BY NAME rather than rewritten into something the student did not say.
 *
 * The whole figure is then folded once more and its object set compared, renamed: a name the TOOL
 * chooses (a canonical circle's centre `O`, a minted letter) depends on which letters are free, and a
 * rename that silently moved one of those would change the figure behind the student's back.
 *
 * The SEED is kept: a letter is a name, not a configuration (3-D's call). Positions of points the
 * student placed are untouched; see the ADR for the one honest exception (a FREE vertex's default
 * sample is keyed by its letter, evaluate.ts `freeCoord`).
 */
import { parseLine, parseRenameAnalytic } from '../parser/parseAnalytic';
import { derive, type Derivation } from '../engine/derive';
import { statedName } from '../engine/names';
import type { Fact } from '../engine/types';
import type { AskedQuestion, InputError } from '../store/useAnalyticStore';
import type { Construction, Id } from '../engine/types';
import { activeOf } from './active';

export { parseRenameAnalytic };

/** A point's letter, as this grammar names points: one capital, optionally one digit or subscript digit. */
const POINT_NAME = /^[A-Z](?:[0-9]|[₀-₉])?$/;

/** The letter the student typed, as a point name — upper-cased like the siblings; null when it is not one. */
export function normalizePointName(raw: string): string | null {
  const s = raw.trim().replace(/^[«"'(]+|[»"').,]+$/g, '');
  const up = s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
  return POINT_NAME.test(up) ? up : null;
}

/**
 * The token rule: `from` as a WHOLE point label inside `s`.
 *
 *  - a FOLLOWING digit, subscript, lowercase letter or prime makes it a different token (`A` is not
 *    the `A` of `A1`, `A₁`, `A'` or "Add");
 *  - a PRECEDING lowercase letter or prime likewise ("Point", `l1`);
 *  - an adjacent CAPITAL is fine — that is exactly what a run like `ABC` is — and so is a preceding
 *    digit, which is a coefficient: `2AC` is two times the length AC.
 *
 * `from` passed {@link normalizePointName}, so it carries no regex metacharacter.
 */
const tokenRe = (from: string) => new RegExp(`(?<![a-z'])${from}(?![a-z0-9₀-₉'])`, 'g');

/** Rewrite every whole-token occurrence — the rule for the ask rows and display sentences. */
export const relabelText = (s: string, from: string, to: string): string => s.replace(tokenRe(from), () => to);

/**
 * A MINTED id compared by its letters, not their order: the parser keys some objects by the SORTED
 * vertex run (`משולש GBC` → `poly-BCG`), so renaming `poly-ABC` letter by letter gives `poly-GBC` for
 * the same polygon. The order the student wrote is kept elsewhere in the fact (`vertices`), so
 * comparing a prefixed id as a letter multiset loses nothing.
 */
const MINTED_RUN = /^([a-z][a-z-]*-)((?:[A-Z](?:[0-9]|[₀-₉])?)+)$/;
const canonId = (s: string): string =>
  s.replace(MINTED_RUN, (_, prefix: string, run: string) => prefix + (run.match(/[A-Z](?:[0-9]|[₀-₉])?/g) ?? []).sort().join(''));

/** Fields of a parsed fact that are RAW TEXT, not ids — the line itself and an equation's source. */
const RAW_FIELDS = new Set(['src', 'eqSrc']);

/**
 * Rename `from`→`to` across one parsed value: every id-bearing string (`A`, `seg-AB`, `poly-ABC`,
 * `line-AC`), never a raw-text field and never an expression's SYMBOL — a parameter is not a point,
 * whatever letter it is.
 */
function renameIds(v: unknown, from: string | null, to: string, key: string | null = null): unknown {
  if (key !== null && RAW_FIELDS.has(key)) return undefined;
  if (typeof v === 'string') return canonId(from === null ? v : relabelText(v, from, to));
  if (Array.isArray(v)) return v.map((e) => renameIds(e, from, to));
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (o.kind === 'sym') return o; // an Expr symbol: a parameter, untouched
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, renameIds(x, from, to, k)]));
  }
  return v;
}

/** A parse's facts with the raw-text fields dropped — the comparable shape. */
const shapeOf = (facts: readonly Fact[]): string => JSON.stringify(renameIds(facts, null, ''));

/** Does any fact of this parse name `id` as a point (outside raw text and expressions)? */
function factsMention(facts: readonly Fact[], id: string): boolean {
  return shapeOf(facts) !== JSON.stringify(renameIds(facts, id, '#'));
}

/** Where `from` occurs as a token in `line`. */
function occurrences(line: string, from: string): number[] {
  return [...line.matchAll(tokenRe(from))].map((m) => m.index ?? 0);
}

/** Substitute only the chosen occurrences. */
function substituteAt(line: string, at: readonly number[], from: string, to: string): string {
  let out = line;
  for (const i of [...at].sort((a, b) => b - a)) out = out.slice(0, i) + to + out.slice(i + from.length);
  return out;
}

/** Above this many occurrences in one line the subset search is not attempted (2^n parses). */
const MAX_SUBSET_OCCURRENCES = 8;

/**
 * Rewrite ONE line faithfully, or say it cannot be done.
 *
 * `count` is how many occurrences were renamed. A line that does not parse (only a muted line could)
 * has nothing to be faithful TO, so every token occurrence is renamed.
 */
export function rewriteLine(line: string, from: string, to: string): { line: string; count: number } | null {
  const at = occurrences(line, from);
  const before = parseLine(line);
  if (!before.ok) return { line: substituteAt(line, at, from, to), count: at.length };
  const want = JSON.stringify(renameIds(before.facts, from, to));
  const faithful = (sub: readonly number[]) => {
    const next = substituteAt(line, sub, from, to);
    const p = parseLine(next);
    return p.ok && shapeOf(p.facts) === want ? next : null;
  };
  const all = faithful(at);
  if (all !== null) return { line: all, count: at.length };
  if (at.length === 0 || at.length > MAX_SUBSET_OCCURRENCES) return null;
  // Largest subsets first: the reading that renames the most occurrences while staying faithful.
  const subsets: number[][] = [];
  for (let mask = (1 << at.length) - 2; mask >= 0; mask--) subsets.push(at.filter((_, k) => mask & (1 << k)));
  subsets.sort((a, b) => b.length - a.length);
  for (const sub of subsets) {
    const ok = faithful(sub);
    if (ok !== null) return { line: ok, count: sub.length };
  }
  return null;
}

/** Every point id the construction holds — stated, derived or free. */
const pointIdsOf = (c: Construction): Id[] =>
  c.objects.filter((o) => o.kind === 'point' || o.kind === 'derived' || o.kind === 'free').map((o) => o.id);

/** The session a rename rewrites — the store's slice, read and written as one. */
export interface RenameState {
  lines: readonly string[];
  disabled: readonly number[];
  queries: readonly AskedQuestion[];
  spokenFor: Readonly<Record<number, string>>;
  seed: number;
}

/** What the rename decided. */
export type RenameVerdict =
  | { kind: 'apply'; from: string; to: string; lines: string[]; queries: AskedQuestion[]; spokenFor: Record<number, string> }
  | { kind: 'refused'; error: InputError };

/** The student's own line that holds `id`, or null when no line names it (a letter the tool chose). */
function holderLine(lines: readonly string[], id: string): string | null {
  for (const l of lines) {
    const p = parseLine(l);
    if (p.ok && factsMention(p.facts, id)) return l;
  }
  return null;
}

/** Is `id` a name in use — a point of the figure, a named curve, or any letter a muted line uses? */
function nameInUse(state: RenameState, current: Derivation, id: string): boolean {
  if (current.construction.objects.some((o) => o.id === id || statedName(o.id) === id)) return true;
  return holderLine(state.lines, id) !== null;
}

/**
 * THE DECISION — pure over the session and its current derivation (`current` is the ACTIVE fold, as
 * every other decision in `submit.ts` takes it). The component and the locks call this same function.
 */
export function decideRename(
  fromRaw: string,
  toRaw: string,
  state: RenameState,
  current: Derivation = derive(activeOf(state.lines, state.disabled), state.seed),
): RenameVerdict {
  const refuse = (error: InputError): RenameVerdict => ({ kind: 'refused', error });
  const to = normalizePointName(toRaw);
  if (!to) return refuse({ key: 'rename-bad-name', detail: toRaw.trim() });
  const from = normalizePointName(fromRaw);
  if (!from) return refuse({ key: 'rename-unknown', detail: fromRaw.trim() });
  if (from === to) return refuse({ key: 'rename-same', detail: from });

  const mutedNames = state.disabled.some((i) => {
    const p = parseLine(state.lines[i] ?? '');
    return p.ok && factsMention(p.facts, from);
  });
  if (!pointIdsOf(current.construction).includes(from) && !mutedNames) return refuse({ key: 'rename-unknown', detail: from });

  if (nameInUse(state, current, to)) {
    const holder = holderLine(state.lines, to);
    return refuse({ key: 'rename-taken', detail: to, ...(holder ? { holder } : {}) });
  }

  const lines: string[] = [];
  let renamed = 0;
  for (const l of state.lines) {
    const r = rewriteLine(l, from, to);
    if (!r) return refuse({ key: 'rename-unsafe', detail: l, holder: from });
    lines.push(r.line);
    renamed += r.count;
  }
  // The letter is in the figure but in none of the student's lines: a name the TOOL chose (a canonical
  // circle's centre, a minted letter). There is nothing of theirs to rewrite.
  if (renamed === 0) return refuse({ key: 'rename-not-typed', detail: from });

  // The figure must be the SAME construction, renamed — no tool-chosen name may shift because a
  // letter was freed or taken.
  const after = derive(activeOf(lines, state.disabled), state.seed);
  const objs = (d: Derivation, map: (id: string) => string) =>
    d.construction.objects.map((o) => `${o.kind}:${canonId(map(o.id))}`).sort().join('|');
  const faults = (d: Derivation) => d.faults.map((f) => `${f.index}:${f.code}`).sort().join('|');
  if (objs(current, (id) => relabelText(id, from, to)) !== objs(after, (id) => id) || faults(current) !== faults(after)) {
    return refuse({ key: 'rename-unsafe', detail: '', holder: from });
  }

  return {
    kind: 'apply',
    from,
    to,
    lines,
    queries: state.queries.map((q) => ({ ...q, sentence: relabelText(q.sentence, from, to) })),
    spokenFor: Object.fromEntries(Object.entries(state.spokenFor).map(([k, v]) => [k, relabelText(v, from, to)])),
  };
}

/**
 * THE CLICK MENU'S ENTRY (#1154) — the draft «שנה אות» puts in the input box, or null.
 *
 * The 2026-09-16 ruling: rename lives IN the #1048 menu, and the entry composes a typed sentence like
 * every other entry («two surfaces, one grammar», ADR-AG-048) — so clicking it fills the input with
 * «שנה שם A ל-» and the student types the new letter. Offered only for a point whose letter the
 * student actually WROTE: the menu offers what would resolve (measurable.ts), and a letter the tool
 * chose would only be refused.
 *
 * The sentence is GRAMMAR, composed here like every measurable sentence (always the Hebrew catalog
 * spelling, as the measure entries are) and never through `t()`: the locale wraps Latin runs in bidi
 * isolates, which have no place inside the student's input box.
 */
export function renameDraftOf(
  lines: readonly string[],
  c: Construction,
  what: { kind: 'point' | 'curve' | 'segment'; id: Id },
): string | null {
  if (what.kind !== 'point' || !pointIdsOf(c).includes(what.id)) return null;
  return lines.some((l) => occurrences(l, what.id).length > 0) ? `שנה שם ${what.id} ל-` : null;
}

/** The store slice the dispatch writes through — the real actions, so the locks drive what App drives. */
export interface RenameActions {
  applyRename: (next: { lines: string[]; queries: AskedQuestion[]; spokenFor: Record<number, string> }) => void;
  setError: (e: InputError | null) => void;
}

/**
 * DISPATCH A RENAME — decide, then write ONE commit (one undo step) or show the refusal.
 * What `App.tsx` calls on a `rename` verdict, and what the locks call.
 */
export function dispatchRename(
  from: string,
  to: string,
  state: RenameState,
  actions: RenameActions,
  current?: Derivation,
): RenameVerdict {
  const v = decideRename(from, to, state, current);
  if (v.kind === 'refused') actions.setError(v.error);
  else actions.applyRename({ lines: v.lines, queries: v.queries, spokenFor: v.spokenFor });
  return v;
}
