/**
 * #1888 item B ([ADR-3D-316](../../docs/06b-decisions-3d.md#adr-3d-316)) — A PART THE READING NEVER READ, in 3-D.
 *
 * The 3-D member over `shell/readExtent.ts` (ADR-W-120), the port of 2-D's `unreadParts` (ADR-603). Both
 * statement seams reach it (`decideCommands3` on the deterministic lane, the ✎ `replaceFact`), so an edit
 * refuses what a submit refuses.
 *
 * WHAT WENT WRONG. 3-D's honesty gates (`lostGivens3`) account TOKENS: a label counts as read wherever any
 * command carries it. So a part of the line the winning rule never looked at was dropped green:
 *  - «משולש ABC ישר זווית ב-A» → the triangle with its right angle at B (the default), «ב-A» unread;
 *  - «משולש ABC שווה שוקיים ב-B» → apex A; «טרפז ABCD ישר זווית ב-B» → right angle at A;
 *  - and the class: a «ב-X» on a prism, a pyramid, a plane through points (72 of 336 catalog sweeps, #1888).
 *
 * THE CHECK. The reading is asked, label by label, whether it depends on what the student typed
 * (`readLabelRuns`: substitute a letter, re-read with `parse3`, compare). Two exemptions: a co-reference
 * (generic, in the shell) and a SCENE NAME — a run right after a polygon, circle, base or face noun whose
 * letters all exist already: on the figure the line is added to («SM הגובה לצלע BC במשולש SBC» on a pyramid),
 * or carried by the line's own reading («פירמידה SABC שבסיסה משולש ABC», "…with a triangle base ABC": the base
 * names the vertices the pyramid declares). Context the statement lives in, never a given of its own — 3-D's
 * form of 2-D's ADR-597 scene exemption (`referencedContextLabels` reads the commands' labels too).
 *
 * THE PARTS. 3-D reads no compound line (#1679), so a line `parse3` READS is one clause; it is cut where its
 * reading stops (`cutAtReading`). An unread run with read labels after it is a lost operand, not a lost part: the
 * existing `dropped-given` refusal names it.
 *
 * A LINE `parse3` FAILS ON (#2088, [ADR-3D-370](../../docs/06b-decisions-3d.md#adr-3d-370)). «משולש ABC ישר זווית
 * ב-B ו-AB = 4» is not read whole, so the member above never ran on it and the line went to the model — losing the
 * one-fact-per-line note its head alone gets. Such a line is cut into clauses ({@link clausesOf3}, 2-D's `clausesOf`
 * ported, never imported), and when its head is refused with a lost-part note and EVERY trailing clause reads on its
 * own ({@link trailingGivens3}), the note carries the trailing clauses as the list's continuation
 * ({@link withTrailing3}). A trailing clause that does not read keeps the line `not-understood`: the note never
 * teaches a line the tool cannot read (docs/17 §9).
 */
import { parse3 } from '../parser/parse3';
import { HE_PREFIX, PART_HE, POLYGON_EN, POLYGON_HE, QUALIFIER_HE } from '../lexicon/nouns3';
import type { Command3 } from '../engine/types';
import { foldConjunctionSpacing } from '../../shell/conjunction';
import { cutAtReading, labelRuns, locate, readLabelRuns, type Occurrence, type PartsCut, type Reader } from '../../shell/readExtent';

/** A 3-D label run: capitals with digits and primes, glued («ABCA'B'C'», «A1»). */
export const LABEL_RUN3 = /(?<![A-Za-z])(?:[A-Z]\d*'*)+(?![A-Za-z])/g;
/** One 3-D label inside a run. */
export const LABEL3 = /[A-Z]\d*'*/g;

const key = (cmds: readonly Command3[]): string => JSON.stringify(cmds);

/** 3-D's reader: the lowering key of a successful `parse3`, null otherwise (context-free by design). */
const reader3: Reader<string> = {
  read: (text) => {
    const r = parse3(text);
    return r.ok && r.commands.length > 0 ? key(r.commands) : null;
  },
  same: (a, b) => a === b,
};

/** The scene nouns a sentence names a shape it lives on with («במשולש SBC», «שבסיסה משולש ABC», "base ABC", «במעגל O»): 3-D's own vocabulary. */
// The shape noun may carry its qualifiers before the name («שבסיסה משולש ישר זווית ושווה שוקיים ABC»). A VERTEX
// noun is no scene: «…ישר זווית בקודקוד B» names where a property sits, which is a part of its own.
const SCENE_HE = [...POLYGON_HE, ...PART_HE.filter((w) => !w.includes('קודקוד')), 'מעגל'].join('|');
const SCENE_NOUN_BEFORE3 = new RegExp(
  `(?:(?<![א-ת])${HE_PREFIX}(?:${SCENE_HE})(?:\\s+${HE_PREFIX}(?:${QUALIFIER_HE.join('|')}))*|\\b(?:${POLYGON_EN}|circles?|bases?|faces?))\\s*$`,
  'i',
);

/** Every label a lowering carries (any string value of its commands). */
function carried(cmds: readonly Command3[]): Set<string> {
  const out = new Set<string>();
  const walk = (x: unknown): void => {
    if (typeof x === 'string') out.add(x);
    else if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === 'object') Object.values(x).forEach(walk);
  };
  walk(cmds);
  return out;
}

export interface UnreadReport3 {
  /** the label runs no reading depends on, as typed */
  readonly unread: readonly Occurrence[];
  /** the line's parts, when every unread run is a lost PART (a tail) — null when one sits inside a statement */
  readonly cut: PartsCut<string> | null;
}

/**
 * The member. Null when the reading reads every label the student typed. `commands` are the line's own
 * lowering (the deterministic lane: they came from reading this utterance); `figure` is the labels of the
 * figure the line is added to.
 */
export function unreadParts3(utterance: string, commands: readonly Command3[], figure: readonly string[]): UnreadReport3 | null {
  const lowering = key(commands);
  // a lowering the reader cannot reproduce (the #866 one-angle repair re-reads a rebuilt sentence) is not
  // this line's reading: there is nothing to compare a substitution with
  if (reader3.read(utterance) !== lowering) return null;
  const known = new Set([...figure, ...carried(commands)]);
  const occ = readLabelRuns(utterance, lowering, {
    ...reader3,
    run: LABEL_RUN3,
    label: LABEL3,
    figureLabels: figure,
    exempt: (o) => SCENE_NOUN_BEFORE3.test(utterance.slice(0, o.at)) && o.parts.every((l) => known.has(l)),
  });
  if (occ.unread.length === 0) return null;
  const clauses = locate(utterance, [utterance.trim()]);
  return { unread: occ.unread, cut: cutAtReading(utterance, clauses, occ, () => reader3) };
}

const numbered = (parts: readonly string[], from = 1): string => parts.map((p, i) => `(${i + from}) ${p}`).join('  ');

/**
 * The lines the right-angle message TEACHES. The locale string carries them as items (1) and (2) of the
 * list, because their nouns («משולש», «triangle», «∠… = 90°») are localized vocabulary and not the
 * student's words; everything the student typed past them continues the SAME list from here.
 *
 * #1962 ([ADR-3D-331](../../docs/06b-decisions-3d.md#adr-3d-331)), the operator's ruling of 2026-10-10:
 * ONE numbered list from (1), in 3-D as in 2-D — never a second list, never a list starting where the
 * student can see no (1). This is 2-D's `TAUGHT_LINES` (ADR-611, `src/app/unreadParts.ts`) ported, and it
 * replaces a hard-coded offset of `3` that encoded the numbering of the PROSE text it has now replaced.
 */
const TAUGHT_LINES = 2;

/** The refusal of a lost part, as a 3-D store error (2-D's `lostPartNote`, ported: the same decision, the same text). */
export type LostPart3 =
  | { code: 'split-statements'; all: string }
  /** `more` is the list's CONTINUATION from (3), already numbered and spaced — 2-D's parameter, not `rest` (ADR-611). */
  | { code: 'right-angle-vertex'; triangle: string; angle: string; more: string };

/**
 * The shared one-input-per-line message listing the parts — except where the lost tail names a VERTEX of the
 * right triangle its reading built («משולש ABC ישר זווית ב-B»). That syntax is TAUGHT (operator ruling
 * 2026-10-08, #1888 follow-up 2, *"Teach the right form"*): the triangle, then the angle at the named vertex
 * with its two neighbours in the triangle's name (∠ABC for ב-B, ∠CAB for ב-A, ∠BCA for ב-C). Decided by the
 * READING: the read part lowered to a RIGHT TRIANGLE and nothing else — the triangle and its shape right angle
 * (2-D's `right-triangle`), the tail one of its vertices. A read part that says more («…ישר זווית ושווה שוקיים»)
 * gets the parts list: the two taught lines would drop what else it says.
 */
export function lostPart3(cut: PartsCut<string>): LostPart3 {
  for (const c of cut.cuts) {
    const tail = labelRuns(c.tail, LABEL_RUN3, LABEL3);
    if (tail.length !== 1 || tail[0].parts.length !== 1) continue;
    const v = tail[0].parts[0];
    const cmds = JSON.parse(c.lowering) as Command3[];
    const tri = cmds.find((x) => x.type === 'solid' && x.kind === 'polygon3' && x.ids.length === 3 && x.ids.includes(v));
    const right = cmds.length === 2 && cmds.some((x) => x.type === 'cos-angle' && x.cos === 0 && x.origin === 'shape');
    if (!tri || tri.type !== 'solid' || !right) continue;
    // The taught pair REPLACES `parts[c.part]` (the read prefix) and `parts[c.part + 1]` (its tail), and the
    // message puts it at (1) and (2) — true only when nothing the student typed comes before it. 2-D's own
    // guard (ADR-611); measured here too: a right-triangle lowering always opens the line. Anything else
    // falls to the plain list, which numbers every part in the order it was typed, so no stated part can be
    // mis-ordered or lost.
    if (c.part !== 0) continue;
    const ids = tri.ids;
    const i = ids.indexOf(v);
    const rest = cut.parts.slice(TAUGHT_LINES);
    return {
      code: 'right-angle-vertex',
      triangle: ids.join(''),
      angle: `${ids[(i + 2) % 3]}${v}${ids[(i + 1) % 3]}`,
      more: rest.length ? `  ${numbered(rest, TAUGHT_LINES + 1)}` : '',
    };
  }
  return { code: 'split-statements', all: numbered(cut.parts) };
}

/**
 * #2088 (ADR-3D-370) — the clause separators, 2-D's `SEPARATORS` (`src/app/independence.ts`) ported byte for
 * byte: a comma, semicolon, newline or sentence stop; «וגם», «ואז», "and", "then", "with"; a «ו» glued to a Hebrew
 * word; a «ו» / «ו-» before a Latin label. «ו-∠…» and «שבו» are not boundaries, so their trailing parts stay inside
 * the line (and the line `not-understood`), as 2-D's own clause cut leaves them.
 */
const SEPARATORS3 = /([,;\n]|(?<!\d)\.|\.(?!\d)|\s+(?:וגם|ואז|and|then|with)\s+|\s+ו(?=[א-ת])|\s+ו-?(?=[A-Z]))/;

/** A piece that only NAMES points — half of an operand pair («AC ו-BD»), never a clause of its own (2-D's `BARE_LABELS`). */
const BARE_LABELS3 = /^(?:ה?נקודות\s+|ה?נקודה\s+|points?\s+)?[A-Z]\d*(?:(?:\s*,\s*|\s+ו-?\s*|\s+and\s+|\s*)[A-Z]\d*)*$/;

/**
 * The line's clauses — 2-D's `clausesOf` (ADR-603's one splitter), read by `parse3`. A boundary is cut only when the
 * text on both sides says more than naming points, and a piece with no subject of its own continues the clause
 * before it when that subject with the piece reads as a statement. The spaced «ו-» spellings are folded first by the
 * shared `shell/conjunction` chokepoint (#1691), as analytic's arm does (ADR-AG-301).
 */
export function clausesOf3(utterance: string): string[] {
  const bits = foldConjunctionSpacing(utterance).split(SEPARATORS3);
  const clean = (p: string) => p.replace(/^\s*[ו]?-?\s*/, '').trim();
  const continues = (prev: string, piece: string): boolean => {
    if (/^[A-Z]/.test(piece)) return false;
    const subject = prev.match(/^(?:[A-Z]\d*)+(?![A-Za-z\d])/)?.[0];
    if (!subject) return false;
    return reader3.read(`${subject} ${piece}`) !== null;
  };
  const out: string[] = [];
  let cur = bits[0] ?? '';
  for (let i = 1; i < bits.length; i += 2) {
    const sep = bits[i];
    const next = bits[i + 1] ?? '';
    if (BARE_LABELS3.test(clean(cur)) || BARE_LABELS3.test(clean(next)) || continues(clean(cur), clean(next))) cur += sep + next;
    else {
      out.push(cur);
      cur = next;
    }
  }
  out.push(cur);
  return out.map(clean).filter((p) => p.length > 1);
}

/**
 * #2088 — a line cut into its HEAD clause and the givens trailing it, when it has trailing clauses and EVERY one of
 * them reads alone (`parse3`, context-free). Null otherwise: the line keeps its verdict.
 */
export function trailingGivens3(utterance: string): { head: string; trailing: string[] } | null {
  const [head, ...trailing] = clausesOf3(utterance);
  if (!head || trailing.length === 0) return null;
  return trailing.every((c) => reader3.read(c) !== null) ? { head, trailing } : null;
}

/**
 * #2088 — the head's lost-part note, continued with the trailing givens in typed order: the right-angle list from
 * (3) (ADR-3D-331's `more`, now reachable), or the plain parts list with them after the head's parts. The same
 * {@link lostPart3}, over the head's cut with the clauses appended, so the two cannot word it apart.
 */
export function withTrailing3(cut: PartsCut<string>, trailing: readonly string[]): LostPart3 {
  return lostPart3({ ...cut, parts: [...cut.parts, ...trailing] });
}
