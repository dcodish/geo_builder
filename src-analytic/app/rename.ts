/**
 * CHANGE A POINT'S LETTER (#1154) — «שנה שם A ל-G» — and SWAP TWO LETTERS (#1303, #1631) —
 * «החלף בין A ל-B».
 *
 * Operator, 2026-09-16: *"we want to allow changing a node letter by clicking on it like the 2d tools
 * mechanism."* And again 2026-10-01, playing a right trapezoid whose default lettering put the right
 * angle on the "wrong" vertex for the exam's labels: *"the ability to click on a node and change its
 * name … would have solved this"*. Then, the same day (#1631): *"if a letter is occupied, it offers to
 * switch letters … we want that same mechanism now for analytics"*.
 *
 * ## A rename rewrites HISTORY, it states nothing
 *
 * This product's source of truth is the student's ordered LINES; the figure is re-derived from them.
 * So a rename is not a fact and not a command — it is a rewrite of every stored line that names the
 * letter, after which replay is exactly what it would have been had the student typed the new letter
 * from the start. That is the 2-D (`renameFacts`, #539) and 3-D (`renameFacts3`, #578) shape; the
 * PATTERN is copied, never imported (`BOUNDARIES.json`).
 *
 * A SWAP is the same rewrite with a two-entry letter map (`A→B`, `B→A`), substituted SIMULTANEOUSLY in
 * one pass — which is what 2-D's NUL-sentinel triple (`A→\0`, `B→A`, `\0→B`) achieves with sequential
 * replaces: no occurrence is rewritten twice. One core (`relabelSession`) serves both, so the swap
 * inherits every proof the rename has.
 *
 * The 2026-09-21 ruling binds both: *"if a letter is changed, change all inputs and data panel items
 * accordingly"* — so the ask rows (`queries`) are rewritten in the SAME commit, by the same token rule,
 * and the AI lane's display sentences (`spokenFor`) with them.
 *
 * ## The rewrite is TEXTUAL, and then PROVEN
 *
 * The lines are text, so the rewrite is a token substitution — but a text rule alone cannot know that
 * the `R` of `x²+y²=R²` is a parameter, or that an English "A" may be an article. So every rewritten
 * line is checked against what it must mean: **the new line must parse to exactly the old line's facts
 * with the point ids mapped** — nothing else may change. Where substituting every occurrence fails that
 * test, the subsets of occurrences are tried (largest first). A line no subset can rewrite faithfully
 * is refused BY NAME rather than rewritten into something the student did not say.
 *
 * The whole figure is then folded once more and its object set compared, mapped: a name the TOOL
 * chooses depends on which letters are free, and a change that silently moved one of those would
 * change the figure behind the student's back.
 *
 * ## A letter the TOOL chose is written into the student's sentence first (#1631 sub-decision a)
 *
 * The canonical circle's centre `O` (ADR-AG-184) and a coordinate point's minted name (`P₁`, the origin's
 * `O`) appear in no line, so there was nothing to rewrite. 2-D lets any letter be renamed (ADR-072). The
 * letter is first MATERIALIZED: the sentence that created the point is rewritten into a form the grammar
 * already reads as naming it («נתון מעגל שמשוואתו …» → «נתון מעגל O שמשוואתו …», «נתונה הנקודה (2,3)» →
 * «נתונה הנקודה P₁(2,3)»), proven to fold to the identical construction, and the ordinary rewrite then
 * runs. A sentence with no such form (an equation with no noun, a coordinate inside a longer sentence) is
 * refused for that sentence only.
 *
 * ## The picture does not move (#1631 sub-decision b)
 *
 * The SEED is kept: a letter is a name, not a configuration (3-D's call). A FREE vertex's default
 * sample is keyed by a name (`evaluate.ts` `freeCoord`), so the change also TRANSPOSES the session's
 * seed-name map (`transposeSeedNames`): the renamed vertex starts where it started before.
 */
import { ANON_ID_RE, parseLine, parseRenameAnalytic, parseSwapAnalytic } from '../parser/parseAnalytic';
import { derive, type Derivation } from '../engine/derive';
import { statedName } from '../engine/names';
import { relabelSymbol } from '../engine/carriers';
import { canonicalConstraint, type Constraint } from '../engine/solve';
import type { Fact } from '../engine/types';
import type { AskedQuestion, InputError } from '../store/useAnalyticStore';
import type { Construction, Id } from '../engine/types';
import { activeOf, rowOf } from './active';
import type { LetterRenameResult } from '../../shell/frame/letterOffer';
import type { SegDisplayMap } from '../../shell/frame/segmentDisplay';
import { segKey } from '../render/scene';

export { parseRenameAnalytic, parseSwapAnalytic };

/** A point's letter, as this grammar names points: one capital, optionally one digit or subscript digit. */
const POINT_NAME = /^[A-Z](?:[0-9]|[₀-₉])?$/;

/** The letter the student typed, as a point name — upper-cased like the siblings; null when it is not one. */
export function normalizePointName(raw: string): string | null {
  const s = raw.trim().replace(/^[«"'(]+|[»"').,]+$/g, '');
  const up = s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
  return POINT_NAME.test(up) ? up : null;
}

/** A letter map — `from → to` for a rename, `{A: B, B: A}` for a swap. Keys passed {@link normalizePointName}. */
export type LetterMap = Readonly<Record<string, string>>;

/**
 * The token rule: a key of `map` as a WHOLE point label inside a string.
 *
 *  - a FOLLOWING digit, subscript, lowercase letter or prime makes it a different token (`A` is not
 *    the `A` of `A1`, `A₁`, `A'` or "Add");
 *  - a PRECEDING lowercase letter or prime likewise ("Point", `l1`);
 *  - an adjacent CAPITAL is fine — that is exactly what a run like `ABC` is — and so is a preceding
 *    digit, which is a coefficient: `2AC` is two times the length AC.
 *
 * Keys passed {@link normalizePointName}, so they carry no regex metacharacter. Longest first, so a
 * map naming both `A` and `A1` reads `A1` whole.
 */
const tokenRe = (map: LetterMap) =>
  new RegExp(`(?<![a-z'])(?:${Object.keys(map).sort((a, b) => b.length - a.length).join('|')})(?![a-z0-9₀-₉'])`, 'g');

/** Rewrite every whole-token occurrence of every key, SIMULTANEOUSLY — the rule for ask rows and display sentences. */
export const relabelMap = (s: string, map: LetterMap): string =>
  Object.keys(map).length === 0 ? s : s.replace(tokenRe(map), (m) => map[m] ?? m);

/** One letter. */
export const relabelText = (s: string, from: string, to: string): string => relabelMap(s, { [from]: to });

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
 * Map the letters across one parsed value: every id-bearing string (`A`, `seg-AB`, `poly-ABC`,
 * `line-AC`), never a raw-text field.
 *
 * A SYMBOL is mapped only where it is spelled from an id (#1667, ADR-AG-205): `r_P`, a centre's radius,
 * follows P — in the parameter declaration AND in every expression node that reads it, through the one
 * owner of those spellings (`relabelSymbol`). A symbol the student wrote is not a point, whatever letter
 * it is, and stays.
 *
 * A CONSTRAINT is compared as the statement it is (`canonicalConstraint`, the engine's own identity of
 * a constraint), never by its raw operand order: the lowering orders a symmetric relation's operands by
 * letter («∢BEC = 90°», a square's right angle), so the same statement under a letter change would
 * otherwise read as a different one.
 */
const relabelId = (map: LetterMap) => (id: Id): Id => canonId(relabelMap(id, map));
function renameIds(v: unknown, map: LetterMap, key: string | null = null): unknown {
  if (key !== null && RAW_FIELDS.has(key)) return undefined;
  if (typeof v === 'string') return key === 'sym' ? relabelSymbol(v, relabelId(map)) : canonId(relabelMap(v, map));
  if (Array.isArray(v)) return v.map((e) => renameIds(e, map));
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (o.kind === 'sym' && typeof o.name === 'string') return { ...o, name: relabelSymbol(o.name, relabelId(map)) };
    if (o.t === 'constraint' && o.k && typeof o.k === 'object') {
      const { k, ...rest } = o;
      return { ...(renameIds(rest, map) as object), k: statementOf(k as Constraint, map) };
    }
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, renameIds(x, map, k)]));
  }
  return v;
}

/** One constraint, its letters mapped, as the statement it is. */
const statementOf = (k: Constraint, map: LetterMap): string => canonicalConstraint(renameIds(k, map) as Constraint);

/**
 * A serialized shape UP TO a consistent renaming of anonymous ids (#1667, ADR-AG-205): each content-hashed id
 * (`ANON_ID_RE`, the parser's own spelling) becomes its order of first appearance. A hash spelled from a
 * letter — «דרך P עובר ישר» hashes `through:P` — changes under a letter change and the letter map cannot
 * follow it; the hash is a name nobody wrote, so two shapes that differ only in it say the same thing.
 */
function upToAnonymous(json: string): string {
  const seen = new Map<string, string>();
  return json.replace(ANON_ID_RE, (id) => {
    if (!seen.has(id)) seen.set(id, `curve-#${seen.size}`);
    return seen.get(id)!;
  });
}

/** A parse's facts with the raw-text fields dropped — the comparable shape. */
const shapeOf = (facts: readonly Fact[]): string => JSON.stringify(renameIds(facts, {}));

/** Does any fact of this parse name `id` as a point (outside raw text and expressions)? */
function factsMention(facts: readonly Fact[], id: string): boolean {
  return shapeOf(facts) !== JSON.stringify(renameIds(facts, { [id]: '#' }));
}

/** Where a key of `map` occurs as a token in `line`, and which key. */
function occurrences(line: string, map: LetterMap): Array<{ at: number; tok: string }> {
  return [...line.matchAll(tokenRe(map))].map((m) => ({ at: m.index ?? 0, tok: m[0] }));
}

/** Substitute only the chosen occurrences. */
function substituteAt(line: string, at: ReadonlyArray<{ at: number; tok: string }>, map: LetterMap): string {
  let out = line;
  for (const o of [...at].sort((a, b) => b.at - a.at)) out = out.slice(0, o.at) + map[o.tok] + out.slice(o.at + o.tok.length);
  return out;
}

/** Above this many occurrences in one line the subset search is not attempted (2^n parses). */
const MAX_SUBSET_OCCURRENCES = 8;

/** How many occurrences of each key one line's rewrite substituted. */
type Counts = Record<string, number>;
const countOf = (sub: ReadonlyArray<{ tok: string }>): Counts => {
  const c: Counts = {};
  for (const o of sub) c[o.tok] = (c[o.tok] ?? 0) + 1;
  return c;
};

/**
 * Rewrite ONE line faithfully under a letter map, or say it cannot be done.
 *
 * A line that does not parse (only a muted line could) has nothing to be faithful TO, so every token
 * occurrence is mapped.
 */
export function rewriteLineMap(line: string, map: LetterMap): { line: string; counts: Counts } | null {
  const at = occurrences(line, map);
  const before = parseLine(line);
  if (!before.ok) return { line: substituteAt(line, at, map), counts: countOf(at) };
  const want = upToAnonymous(JSON.stringify(renameIds(before.facts, map)));
  const faithful = (sub: ReadonlyArray<{ at: number; tok: string }>) => {
    const next = substituteAt(line, sub, map);
    const p = parseLine(next);
    return p.ok && upToAnonymous(shapeOf(p.facts)) === want ? next : null;
  };
  const all = faithful(at);
  if (all !== null) return { line: all, counts: countOf(at) };
  if (at.length === 0 || at.length > MAX_SUBSET_OCCURRENCES) return null;
  // Largest subsets first: the reading that maps the most occurrences while staying faithful.
  const subsets: Array<typeof at> = [];
  for (let mask = (1 << at.length) - 2; mask >= 0; mask--) subsets.push(at.filter((_, k) => mask & (1 << k)));
  subsets.sort((a, b) => b.length - a.length);
  for (const sub of subsets) {
    const ok = faithful(sub);
    if (ok !== null) return { line: ok, counts: countOf(sub) };
  }
  return null;
}

/** One letter — `count` is how many occurrences were renamed. */
export function rewriteLine(line: string, from: string, to: string): { line: string; count: number } | null {
  const r = rewriteLineMap(line, { [from]: to });
  return r && { line: r.line, count: r.counts[from] ?? 0 };
}

/** Every point id the construction holds — stated, derived or free. */
const pointIdsOf = (c: Construction): Id[] =>
  c.objects.filter((o) => o.kind === 'point' || o.kind === 'derived' || o.kind === 'free').map((o) => o.id);

/**
 * THE SEED-NAME MAP UNDER A LETTER CHANGE (#1631 sub-decision b) — a TRANSPOSITION of `a` and `b`.
 *
 * A rename `from → to` and a swap `a ↔ b` are the same operation on this map: the letter that now
 * names the old point takes its seed name, and the letter given up takes the other's. So the map stays
 * a permutation of names — two free vertices can never be seeded by one name, even when the student
 * later reuses the freed letter. Identity entries are dropped, so a change undone by its inverse leaves
 * the map empty and the figure byte-identical to one that was never changed.
 */
export function transposeSeedNames(names: LetterMap, a: string, b: string): Record<string, string> {
  const sa = names[a] ?? a;
  const sb = names[b] ?? b;
  const out: Record<string, string> = { ...names };
  const put = (k: string, v: string) => {
    if (k === v) delete out[k];
    else out[k] = v;
  };
  put(a, sb);
  put(b, sa);
  return out;
}

/** The session a letter change rewrites — the store's slice, read and written as one. */
export interface RenameState {
  lines: readonly string[];
  disabled: readonly number[];
  queries: readonly AskedQuestion[];
  spokenFor: Readonly<Record<number, string>>;
  seed: number;
  /** #1631 — the session's seed-name map (`Construction.seedNames`); absent = none. */
  seedNames?: LetterMap;
  /** #1653 — the segment display map (keyed by endpoint pair); absent = none. */
  segStyle?: SegDisplayMap;
}

/**
 * WHO HOLDS A LETTER — the student's line the UI quotes AND highlights (#1631). `index` is the row in
 * the FULL line list (muted rows included), the same index the fact list renders.
 */
export interface LetterHolder {
  text: string;
  index: number;
}

/** What a letter change commits — the one payload `applyRename` and `applySwap` write. */
export interface RelabelCommit {
  lines: string[];
  queries: AskedQuestion[];
  spokenFor: Record<number, string>;
  seedNames: Record<string, string>;
  /** #1653 — the segment display map, its endpoint-pair keys relabelled: a hidden AB stays hidden as XB. */
  segStyle: SegDisplayMap;
}

/** #1653 — re-key a segment display map under a letter map (a rename's one entry, a swap's two). */
export function relabelSegStyle(style: SegDisplayMap, map: LetterMap): SegDisplayMap {
  const out: SegDisplayMap = {};
  for (const [k, v] of Object.entries(style)) {
    const ends = k.split('|');
    out[ends.length === 2 ? segKey([map[ends[0]] ?? ends[0], map[ends[1]] ?? ends[1]]) : k] = { ...v };
  }
  return out;
}

/** What the rename decided. A taken letter carries its HOLDER as data — the popover quotes it and offers the swap. */
export type RenameVerdict =
  | ({ kind: 'apply'; from: string; to: string } & RelabelCommit)
  | { kind: 'refused'; error: InputError; holder?: LetterHolder };

/** What the swap decided. */
export type SwapVerdict =
  | ({ kind: 'apply'; a: string; b: string } & RelabelCommit)
  | { kind: 'refused'; error: InputError };

/** The derivation a decision compares against: the ACTIVE fold, with the session's seed names. */
const currentOf = (state: RenameState): Derivation =>
  derive(activeOf(state.lines, state.disabled), state.seed, state.seedNames ?? {});

/** The first of the student's lines whose facts name `id`, with its row. */
function typedHolder(lines: readonly string[], id: string): LetterHolder | null {
  for (let index = 0; index < lines.length; index++) {
    const p = parseLine(lines[index]);
    if (p.ok && factsMention(p.facts, id)) return { text: lines[index], index };
  }
  return null;
}

/** The row whose sentence made the TOOL name `id` (a canonical centre, a minted coordinate point), or null. */
function toolRow(state: RenameState, current: Derivation, id: string): number | null {
  const m = current.minted.find((x) => x.id === id);
  if (!m) return null;
  return rowOf(state.lines.length, state.disabled)[m.index] ?? null;
}

/**
 * WHO HOLDS `id` (#1631) — the student's line naming it, or else the line whose sentence made the tool
 * name it (the circle's line for its `O`, the coordinate line for `P₁`). Null for a letter nothing holds.
 * The popover quotes `text` and highlights row `index`, as 2-D's does (`letterHolder`, geoStore.ts).
 */
export function letterHolder(state: RenameState, id: string, current: Derivation = currentOf(state)): LetterHolder | null {
  const typed = typedHolder(state.lines, id);
  if (typed) return typed;
  const row = toolRow(state, current, id);
  return row === null ? null : { text: state.lines[row], index: row };
}

/** Is `id` a name in use — a point of the figure, a named curve, or any letter a line uses? */
export function nameInUse(state: RenameState, current: Derivation, id: string): boolean {
  if (current.construction.objects.some((o) => o.id === id || statedName(o.id) === id)) return true;
  return typedHolder(state.lines, id) !== null;
}

/** Is `id` a point of the figure, or of a muted line? */
function isPoint(state: RenameState, current: Derivation, id: string): boolean {
  if (pointIdsOf(current.construction).includes(id)) return true;
  return state.disabled.some((i) => {
    const p = parseLine(state.lines[i] ?? '');
    return p.ok && factsMention(p.facts, id);
  });
}

/** The comparable shape of a derivation's construction — objects and constraints, raw text dropped. */
const constructionShape = (d: Derivation, map: LetterMap): string => {
  // Anonymous ids are numbered in DECLARATION order, before the object list is sorted (a hash sorts anywhere).
  const [objects, ...rest] = JSON.parse(
    upToAnonymous(
      JSON.stringify([
        d.construction.objects.map((o) => `${o.kind}:${canonId(relabelMap(o.id, map))}`),
        d.construction.constraints.map((k) => statementOf(k, map)),
        renameIds(d.construction.selectors, map),
      ]),
    ),
  ) as [string[], ...unknown[]];
  return JSON.stringify([[...objects].sort(), ...rest]);
};
const faultShape = (d: Derivation): string => d.faults.map((f) => `${f.index}:${f.code}`).sort().join('|');

/**
 * A cevian whose foot the TOOL named (#1222, #1240; ADR-AG-211) — «תיכון מ-A במשולש ABC», «גובה מנקודה A», «תיכון לצלע
 * BC», «תיכון ליתר» — names it after the fact: «… פוגש את הצלע בנקודה M» / "… at M", which the grammar lowers exactly as
 * the tool's own foot (a derived point), so the fold-equality proof below accepts it.
 */
const CEVIAN_ROLE = /^(?:נתון\s+)?ה?(?:תיכון|גובה)\s/;
const CEVIAN_ROLE_EN = /^(?:the\s+|an?\s+)?(?:median|altitude|height)\s/i;
function cevianNamingCandidates(line: string, name: string): string[] {
  if (CEVIAN_ROLE.test(line.trim())) return [`${line} פוגש את הצלע בנקודה ${name}`];
  if (CEVIAN_ROLE_EN.test(line.trim())) return [`${line} at ${name}`];
  return [];
}

/** Insert `name` at each place a sentence can carry it: after a circle noun, before a coordinate pair. */
const CIRCLE_NOUN = /(?:ה?מעגל|[Cc]ircle)(?=[\s:,])/g;
const COORD_PAIR = /(?<![A-Za-z0-9₀-₉])\(\s*[^(),;]+?\s*[,;]\s*[^(),;]+?\s*\)/g;
function namingCandidates(line: string, name: string): string[] {
  const out: string[] = [];
  for (const m of line.matchAll(CIRCLE_NOUN)) {
    const end = (m.index ?? 0) + m[0].length;
    out.push(`${line.slice(0, end)} ${name}${line.slice(end)}`);
  }
  for (const m of line.matchAll(COORD_PAIR)) {
    const at = m.index ?? 0;
    out.push(`${line.slice(0, at)}${name}${line.slice(at)}`);
  }
  // A perpendicular's foot (#1620, ADR-AG-207): «האנך מהנקודה B לציר ה-x» names it «… חותך אותו בנקודה P₁».
  out.push(`${line} חותך אותו בנקודה ${name}`, `${line} meets it at ${name}`);
  return out;
}

/**
 * A shape or midpoint the TOOL lettered (#1622, ADR-AG-217) — «ריבוע שצלעו 4», «מלבן במידות 4*6», «אמצע AB» — names its
 * letters after the fact: the row's whole run of tool letters written after a word of the sentence («ריבוע ABCD שצלעו
 * 4»), or the one letter before it («M אמצע AB»). The fold-equality proof below keeps only the form that draws the same.
 */
function letteringCandidates(line: string, run: readonly string[], name: string): string[] {
  const words = line.split(' ');
  const out: string[] = [`${name} ${line}`];
  for (let i = 1; i <= Math.min(3, words.length); i += 1) {
    out.push([...words.slice(0, i), run.join(''), ...words.slice(i)].join(' '));
  }
  return out;
}

/**
 * MATERIALIZE a letter the TOOL chose (#1631 sub-decision a): rewrite the sentence that made the tool
 * name `id` into a form that names it explicitly, proven to fold to the IDENTICAL construction. Returns
 * the lines with that one row rewritten, or null when the sentence has no such form.
 */
function materialize(state: RenameState, current: Derivation, id: string): string[] | null {
  const row = toolRow(state, current, id);
  if (row === null) return null;
  const want = constructionShape(current, {});
  const wantFaults = faultShape(current);
  const line = state.lines[row];
  const at = current.minted.find((x) => x.id === id)!.index;
  const run = current.minted.filter((x) => x.index === at).map((x) => x.id);
  for (const cand of [...cevianNamingCandidates(line, id), ...namingCandidates(line, id), ...letteringCandidates(line, run, id)]) {
    const p = parseLine(cand);
    if (!p.ok || !factsMention(p.facts, id)) continue;
    const lines = state.lines.map((l, i) => (i === row ? cand : l));
    const after = derive(activeOf(lines, state.disabled), state.seed, state.seedNames ?? {});
    if (constructionShape(after, {}) === want && faultShape(after) === wantFaults) return lines;
  }
  return null;
}

/** Why a session relabel could not be done. */
type RelabelFailure = { why: 'unsafe'; line: string } | { why: 'not-typed'; letter: string };

/**
 * THE CORE — rewrite the whole session under `map`, or say why not. Shared by the rename (one entry)
 * and the swap (two). `pair` is the transposition the seed names take.
 */
function relabelSession(
  map: LetterMap,
  pair: [string, string],
  state: RenameState,
  current: Derivation,
): ({ ok: true } & RelabelCommit) | ({ ok: false } & RelabelFailure) {
  // A letter the tool chose is first written into the sentence that created it (sub-decision a).
  let lines = [...state.lines];
  for (const letter of Object.keys(map)) {
    if (!pointIdsOf(current.construction).includes(letter) || typedHolder(lines, letter)) continue;
    const named = materialize({ ...state, lines }, current, letter);
    if (!named) return { ok: false, why: 'not-typed', letter };
    lines = named;
  }

  const out: string[] = [];
  const counts: Counts = {};
  for (const l of lines) {
    const r = rewriteLineMap(l, map);
    if (!r) return { ok: false, why: 'unsafe', line: l };
    out.push(r.line);
    for (const [k, n] of Object.entries(r.counts)) counts[k] = (counts[k] ?? 0) + n;
  }
  for (const letter of Object.keys(map)) if (!counts[letter]) return { ok: false, why: 'not-typed', letter };

  // The figure must be the SAME construction, mapped — no tool-chosen name may shift because a letter
  // was freed or taken.
  const seedNames = transposeSeedNames(state.seedNames ?? {}, pair[0], pair[1]);
  const after = derive(activeOf(out, state.disabled), state.seed, seedNames);
  if (constructionShape(current, map) !== constructionShape(after, {}) || faultShape(current) !== faultShape(after)) {
    return { ok: false, why: 'unsafe', line: '' };
  }

  return {
    ok: true,
    lines: out,
    queries: state.queries.map((q) => ({ ...q, sentence: relabelMap(q.sentence, map) })),
    spokenFor: Object.fromEntries(Object.entries(state.spokenFor).map(([k, v]) => [k, relabelMap(v, map)])),
    seedNames,
    segStyle: relabelSegStyle(state.segStyle ?? {}, map),
  };
}

/**
 * THE RENAME DECISION — pure over the session and its current derivation (`current` is the ACTIVE fold,
 * as every other decision in `submit.ts` takes it). The component, the popover and the locks call this.
 */
export function decideRename(
  fromRaw: string,
  toRaw: string,
  state: RenameState,
  current: Derivation = currentOf(state),
): RenameVerdict {
  const refuse = (error: InputError, holder?: LetterHolder): RenameVerdict => ({ kind: 'refused', error, ...(holder ? { holder } : {}) });
  const to = normalizePointName(toRaw);
  if (!to) return refuse({ key: 'rename-bad-name', detail: toRaw.trim() });
  const from = normalizePointName(fromRaw);
  if (!from) return refuse({ key: 'rename-unknown', detail: fromRaw.trim() });
  if (from === to) return refuse({ key: 'rename-same', detail: from });
  if (!isPoint(state, current, from)) return refuse({ key: 'rename-unknown', detail: from });

  if (nameInUse(state, current, to)) {
    const holder = letterHolder(state, to, current);
    return refuse({ key: 'rename-taken', detail: to, ...(holder ? { holder: holder.text } : {}) }, holder ?? undefined);
  }

  const r = relabelSession({ [from]: to }, [from, to], state, current);
  if (!r.ok) {
    return r.why === 'not-typed'
      ? refuse({ key: 'rename-not-typed', detail: r.letter })
      : refuse({ key: 'rename-unsafe', detail: r.line, holder: from });
  }
  const { ok: _ok, ...commit } = r;
  return { kind: 'apply', from, to, ...commit };
}

/**
 * THE SWAP DECISION (#1303, #1631) — exchange two letters that BOTH exist, everywhere at once.
 *
 * Always allowed when both are points (ADR-532's «always allow switching»): a swap destroys nothing, so
 * there is no "is this safe to swap" predicate beyond the faithfulness proof every rewrite carries.
 * Symmetric: `decideSwap(a, b)` and `decideSwap(b, a)` commit the same session.
 */
export function decideSwap(
  aRaw: string,
  bRaw: string,
  state: RenameState,
  current: Derivation = currentOf(state),
): SwapVerdict {
  const refuse = (error: InputError): SwapVerdict => ({ kind: 'refused', error });
  const a = normalizePointName(aRaw);
  if (!a) return refuse({ key: 'swap-bad-name', detail: aRaw.trim() });
  const b = normalizePointName(bRaw);
  if (!b) return refuse({ key: 'swap-bad-name', detail: bRaw.trim() });
  if (a === b) return refuse({ key: 'swap-same', detail: a });
  for (const x of [a, b]) if (!isPoint(state, current, x)) return refuse({ key: 'swap-unknown', detail: x });

  const r = relabelSession({ [a]: b, [b]: a }, [a, b], state, current);
  if (!r.ok) {
    return r.why === 'not-typed'
      ? refuse({ key: 'swap-not-typed', detail: r.letter })
      : refuse({ key: 'swap-unsafe', detail: r.line, holder: a, other: b });
  }
  const { ok: _ok, ...commit } = r;
  return { kind: 'apply', a, b, ...commit };
}

/**
 * WHICH CLICKED OBJECT GETS THE LETTER POPOVER (#1631) — the point's letter, or null.
 *
 * The operator, 2026-10-01: *"the letter is replaced without the need to write the text in the input and
 * if a letter is occupied, it offers to switch letters"* — 2-D's mechanism (ADR-072, ADR-520, ADR-532),
 * now the shared `shell/frame/LetterPopover`. It replaces #1154's first surface, which filled the main
 * input with «שנה שם A ל-» (`renameDraftOf`, retired); the typed sentence still works.
 *
 * Offered for EVERY point of the figure, as 2-D offers any letter, including one the tool chose (a circle's
 * automatic O, a minted P₁): whether the rename can be honoured is {@link decideRename}'s question, and its
 * refusal is shown in the popover. A curve or a segment has no letter to change.
 */
/**
 * A RENAME VERDICT IN THE POPOVER'S VOCABULARY (#1631) — what the shared `LetterPopover` is handed, extracted
 * so the §5c lock calls the adapter App calls. A taken letter is answered IN the popover (its holder line,
 * the swap offer); any other refusal carries this tree's own error key as the reason, and App shows that
 * key's sentence in the error line, because it says WHY (a sentence that cannot be rewritten faithfully,
 * a figure the rename would change).
 */
export function letterRenameOf(v: RenameVerdict): LetterRenameResult {
  if (v.kind === 'apply') return { ok: true };
  if (v.error.key === 'rename-taken' && v.holder) return { ok: false, reason: 'taken', holder: { text: v.holder.text } };
  return { ok: false, reason: v.error.key };
}

export function letterTargetOf(c: Construction, what: { kind: 'point' | 'curve' | 'segment'; id: Id }): Id | null {
  return what.kind === 'point' && pointIdsOf(c).includes(what.id) ? what.id : null;
}

/** The store slice the dispatch writes through — the real actions, so the locks drive what App drives. */
export interface RenameActions {
  applyRename: (next: RelabelCommit) => void;
  setError: (e: InputError | null) => void;
}
export interface SwapActions {
  applySwap: (next: RelabelCommit) => void;
  setError: (e: InputError | null) => void;
}

const commitOf = (v: RelabelCommit): RelabelCommit => ({ lines: v.lines, queries: v.queries, spokenFor: v.spokenFor, seedNames: v.seedNames, segStyle: v.segStyle });

/**
 * DISPATCH A RENAME — decide, then write ONE commit (one undo step) or show the refusal.
 * What `App.tsx` calls on a `rename` verdict, what the popover calls, and what the locks call.
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
  else actions.applyRename(commitOf(v));
  return v;
}

/** DISPATCH A SWAP — the same contract as {@link dispatchRename}. */
export function dispatchSwap(
  a: string,
  b: string,
  state: RenameState,
  actions: SwapActions,
  current?: Derivation,
): SwapVerdict {
  const v = decideSwap(a, b, state, current);
  if (v.kind === 'refused') actions.setError(v.error);
  else actions.applySwap(commitOf(v));
  return v;
}

/** A session edit as the typed line states it — what `decideSubmit` reads before the grammar. */
export type SessionEdit = { kind: 'rename'; from: string; to: string } | { kind: 'swap'; a: string; b: string };

/** Read a typed session edit — the swap first, since «בין» is what tells it from a rename. */
export function parseSessionEdit(raw: string): SessionEdit | null {
  const swap = parseSwapAnalytic(raw);
  if (swap) return { kind: 'swap', ...swap };
  const rename = parseRenameAnalytic(raw);
  return rename ? { kind: 'rename', ...rename } : null;
}

/** Decide a typed session edit — one entry point for the catalog guard and the triage replay. */
export function decideSessionEdit(edit: SessionEdit, state: RenameState, current?: Derivation): RenameVerdict | SwapVerdict {
  return edit.kind === 'swap' ? decideSwap(edit.a, edit.b, state, current) : decideRename(edit.from, edit.to, state, current);
}
