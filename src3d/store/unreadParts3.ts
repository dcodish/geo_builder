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
 * THE PARTS. 3-D reads no compound line (#1679), so the line is one clause; it is cut where its reading
 * stops (`cutAtReading`). An unread run with read labels after it is a lost operand, not a lost part: the
 * existing `dropped-given` refusal names it.
 */
import { parse3 } from '../parser/parse3';
import { HE_PREFIX, PART_HE, POLYGON_EN, POLYGON_HE, QUALIFIER_HE } from '../lexicon/nouns3';
import type { Command3 } from '../engine/types';
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

/** The refusal of a lost part, as a 3-D store error (2-D's `lostPartNote`, ported: the same decision, the same text). */
export type LostPart3 =
  | { code: 'split-statements'; all: string }
  | { code: 'right-angle-vertex'; triangle: string; angle: string; rest: string };

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
    const ids = tri.ids;
    const i = ids.indexOf(v);
    const rest = cut.parts.filter((_, k) => k !== c.part && k !== c.part + 1);
    return { code: 'right-angle-vertex', triangle: ids.join(''), angle: `${ids[(i + 2) % 3]}${v}${ids[(i + 1) % 3]}`, rest: rest.length ? numbered(rest, 3) : '' };
  }
  return { code: 'split-statements', all: numbered(cut.parts) };
}
