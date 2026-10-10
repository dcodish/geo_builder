/**
 * #1888 / #1889 ([ADR-603](../../docs/06-decisions.md#adr-603)) — A PART THE READING NEVER READ.
 *
 * The 2-D battery member over `shell/readExtent.ts` (ADR-W-120). Both commit seams reach it through
 * `honestyGateReport`, so the ✎ edit seam refuses what the submit seam refuses (ADR-461 / ADR-W-006).
 *
 * WHAT WENT WRONG. Every gate on the commit path accounts TOKENS: a label counts as read wherever any
 * command carries it. ADR-598's clause gate sees only the pieces `clausesOf` cuts. So a part of one clause
 * that the winning rule never looked at was dropped green:
 *  - «משולש ABC ישר זווית ב-B» → `right-triangle [A,B,C]`, angle at C (`shapeMacro` strips its vocabulary and
 *    `removeClaimed` erases EVERY occurrence of a claimed vertex, so «ב-B» left only a particle);
 *  - «AC ו-BD נפגשים בנקודה E שהיא אמצע BD» / «…E על AB» → the crossing alone (`lineLineIntersection` never
 *    reads past the point label, and B, D, A ride the diagonals);
 *  - «…, E אמצע BD» → ADR-598's rule (2) counted the clause traced because the line defines the same E.
 *
 * THE CHECK. The reading is asked, label by label, whether it depends on what the student typed
 * (`readLabelRuns`: substitute a letter, re-read, compare). Two exemptions: a co-reference (generic, in the
 * shell) and a SCENE NAME — the run right after a polygon or circle noun whose letters ADR-597's
 * `referencedContextLabels` already reads as context («במשולש ABC», «במעגל O»).
 *
 * THE PARTS. The line's clauses (`clausesOf`, the one splitter), each read alone in the figure plus the
 * clauses before it — what a one-per-line student would type — with an offending clause cut where its
 * reading stops (`cutAtReading`).
 */
import { augmentParseCtx, normalizeUtterance, parse } from '@/parser';
import type { ParseContext } from '@/parser';
import { endsWithSceneNoun, referencedContextLabels } from '@/parser/labelAccounting';
import type { AnyCommand } from '@/engine';
import { cutAtReading, labelRuns, locate, readLabelRuns, type Occurrence, type PartsCut, type Reader } from '../../shell/readExtent';
import { clausesOf } from './independence';

/** A lowering as the probe compares it: the commands without their `consumed` bookkeeping. */
export const loweringKey = (cmds: readonly AnyCommand[]): string =>
  JSON.stringify(
    cmds.map((c) => {
      const { consumed: _consumed, ...rest } = c as AnyCommand & { consumed?: unknown };
      return rest;
    }),
  );

/** 2-D's reader in a context: the lowering key of a successful parse, null otherwise. */
const readerIn = (ctx: ParseContext): Reader<string> => ({
  read: (text) => {
    const r = parse(text, ctx);
    return r.ok && r.commands.length > 0 ? loweringKey(r.commands) : null;
  },
  same: (a, b) => a === b,
});

export interface UnreadReport {
  /** the label runs no reading depends on, as typed */
  unread: readonly Occurrence[];
  /** the line's parts, when every unread run is a lost PART (a tail, or a whole clause) — null when one sits inside a statement */
  cut: PartsCut<string> | null;
  /** what was left unread, in the student's words: the lost parts, else the unread runs */
  items: string[];
}

const numbered = (parts: readonly string[], from = 1): string => parts.map((p, i) => `(${i + from}) ${p}`).join('  ');

/**
 * The lines the right-angle message TEACHES. The locale string carries them as items (1) and (2) of the list,
 * because their nouns («משולש», «triangle», «∠… = 90°») are localized vocabulary and not the student's words;
 * everything the student typed past them continues the SAME list from here (#1957, ADR-611).
 */
const TAUGHT_LINES = 2;

/**
 * The refusal a lost part gets: the one shared one-input-per-line message listing EVERY part of the line as one
 * numbered list from (1) (ADR-598's key and format, the numbering ruled 2026-10-09 — ADR-611) — except where the
 * lost tail names the RIGHT ANGLE'S VERTEX of the triangle its reading built («משולש ABC ישר זווית ב-B»,
 * "right triangle ABC at B"). That syntax is TAUGHT instead (operator ruling 2026-10-08, #1888 follow-up 2:
 * *"Teach the right form"*): the two lines that build it — the triangle, then the angle at the named vertex with
 * its two neighbours in the triangle's name (∠ABC for ב-B, ∠CAB for ב-A, ∠BCA for ב-C). Decided by the READING
 * (the read part lowered to a right triangle, the tail is one of its vertices), never by the spelling.
 *
 * ONE FORMAT, both branches (#1957): the taught pair is items (1) and (2) of the same numbered list, and the
 * line's further parts continue it from (3) — never a second list, never a list that starts where the student
 * can see no (1). A message added to this family inherits the format instead of inventing a third shape.
 */
export function lostPartNote(cut: PartsCut<string>): { key: string; params: Record<string, string> } {
  for (const c of cut.cuts) {
    const tailLabels = labelRuns(c.tail);
    if (tailLabels.length !== 1 || tailLabels[0].parts.length !== 1) continue;
    const v = tailLabels[0].parts[0];
    const tri = (JSON.parse(c.lowering) as AnyCommand[]).find(
      (x): x is AnyCommand & { ids: string[] } => x.type === 'right-triangle' && Array.isArray((x as { ids?: unknown }).ids) && (x as { ids: string[] }).ids.includes(v),
    );
    if (!tri || tri.ids.length !== 3) continue;
    // The taught pair REPLACES `parts[c.part]` (the read prefix) and `parts[c.part + 1]` (its tail), and the
    // message puts it at (1) and (2) — true only when nothing the student typed comes before it. Measured: a
    // right-triangle lowering always opens the line. Anything else falls to the plain list, which numbers every
    // part in the order it was typed, so no stated part can be mis-ordered or lost.
    if (c.part !== 0) continue;
    const i = tri.ids.indexOf(v);
    const angle = `${tri.ids[(i + 2) % 3]}${v}${tri.ids[(i + 1) % 3]}`;
    const rest = cut.parts.slice(TAUGHT_LINES);
    return {
      key: 'input.scope.right-angle-vertex',
      params: {
        triangle: tri.ids.join(''),
        angle,
        more: rest.length ? `  ${numbered(rest, TAUGHT_LINES + 1)}` : '',
      },
    };
  }
  return { key: 'input.scope.split-statements', params: { first: cut.parts[0], second: cut.parts[1], all: numbered(cut.parts) } };
}

/**
 * The member. Null when the reading reads every label the student typed. `ctx` is the context the
 * commands were parsed in (the seam's own `pctx` / `ectx`), so a re-read is comparable.
 */
export function unreadParts(utterance: string, commands: readonly AnyCommand[], ctx: ParseContext): UnreadReport | null {
  const reader = readerIn(ctx);
  const lowering = loweringKey(commands);
  let context: Set<string> | null = null;
  const occ = readLabelRuns(utterance, lowering, {
    ...reader,
    figureLabels: ctx.points ?? [],
    // a SCENE NAME («במשולש ABC», «במעגל O»): context the label accountant already reads, never a given
    exempt: (o) => {
      if (!endsWithSceneNoun(utterance.slice(0, o.at))) return false;
      context ??= referencedContextLabels(normalizeUtterance(utterance), [...commands], {
        existingPoints: ctx.points ?? [],
        circleMembers: ctx.circleMembers,
        polygons: ctx.polygons,
      });
      return o.parts.every((l) => context!.has(l));
    },
  });
  if (occ.unread.length === 0) return null;
  const clauses = locate(utterance, clausesOf(utterance));
  // each clause alone, in the figure plus the clauses before it (ADR-598's reading of a one-per-line student)
  const ctxs: ParseContext[] = [];
  let cur = ctx;
  for (const c of clauses) {
    ctxs.push(cur);
    const r = parse(c.text, cur);
    if (r.ok && r.commands.length) cur = augmentParseCtx(cur, r.commands);
  }
  const cut = cutAtReading(utterance, clauses, occ, (i) => readerIn(ctxs[i]));
  return { unread: occ.unread, cut, items: cut ? cut.lost : occ.unread.map((o) => o.text) };
}
