/**
 * #1798 ([ADR-598](../../docs/06-decisions.md#adr-598)) — A ONE-LINE COMPOUND IS ALL OR NOTHING.
 *
 * The operator's ruling (2026-10-06): *"when a user enters several clauses in one line and one of them
 * fails, reject the entire line. so we accept all or none"* — while compounds stay allowed («AB=4, CD=3»,
 * «AB=u, AC=v, AS=w») whenever every clause is honoured. Every rejection uses the ONE shared message,
 * `input.scope.split-statements`, which lists the clauses.
 *
 * WHAT WENT WRONG. A whole-line grammar rule can claim a compound line, lower ONE clause and drop the rest
 * with every token still "accounted": «AB מקביל ל-CD ו-D על BC» lowered to the parallel alone — D and B and C
 * are all carried by the parallel's own operands, so no label, number, relation or span gate can see that
 * «D על BC» is gone (the residual ADR-597 named). Nothing on the SUCCESS path asked whether each clause of
 * the line was honoured.
 *
 * THE CHECK. Each clause of the line ({@link clausesOf}, the one splitter) is lowered ALONE, in the context
 * of the figure plus the clauses before it — what the line would mean typed one given per line. A clause
 * that lowers to something the whole-line commands carry no trace of was dropped. A TRACE is a whole-line
 * command of the same type that names every label the clause's command names — never surface text, so a
 * clause the whole line reads in its own spelling still counts. Scaffolding (a plain segment, a free point)
 * is no evidence either way unless it is all the clause says.
 *
 * A missing syntactic trace is not yet a drop: the splitter also cuts noun-phrase operands («מעגל O ומעגל P»)
 * and subject-less continuations («CD אנך ל-AB וחותך אותו בנקודה E»), whose standalone reading is a
 * restatement in another type. So an untraced clause is asked the ENGINE's question — entailment: applied
 * after the whole line's commands, does it add anything? (`entailed`, the dry run's empty / implied outcome,
 * ADR-156 / ADR-542.) Only a clause that still changes the figure was dropped. Measured on the corpus: the
 * type trace alone false-refused 12 of 1497 steps, all such fragments; with entailment, none.
 *
 * A clause that does not lower ALONE is no evidence of a drop on this path: the liberal splitter over-splits
 * («a circle with center O»), and the honesty battery has already accounted every token of the line. Only a
 * clause the tool can read on its own, and then cannot find in the line's lowering, refuses the line.
 */
import { augmentParseCtx, parse } from '@/parser';
import type { ParseContext, ScopeMatch } from '@/parser';
import type { AnyCommand } from '@/engine';
import { clausesOf } from './independence';

interface ClauseReading {
  clause: string;
  /** The clause's lowering alone, in sequence context — null when it does not read on its own. */
  commands: AnyCommand[] | null;
}

/** The uppercase labels a command's VALUES name (`type` excluded), ids split into their labels. */
function labelsOf(c: AnyCommand): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown): void => {
    if (typeof v === 'string') for (const l of v.match(/[A-Z]\d*/g) ?? []) out.add(l);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => k !== 'type' && walk(x));
  };
  Object.entries(c).forEach(([k, x]) => k !== 'type' && walk(x));
  return out;
}

const SCAFFOLD = new Set(['segment', 'free-point']);
/** What a clause's lowering SAYS — its non-scaffolding commands, or all of them when that is all there is. */
const significant = (cmds: AnyCommand[]): AnyCommand[] => {
  const s = cmds.filter((c) => !SCAFFOLD.has(c.type));
  return s.length ? s : cmds;
};

/**
 * Command kinds that only DECLARE an object, stating nothing about it beyond its existence. Restating one
 * the figure already has («מעגל B» inside «G חיתוך מעגל A ומעגל B») names it — a reference, not a given.
 * An incidence on an existing point («D על BC») is never this: it is the M1 constraint the line must carry.
 */
const DECLARATION = new Set(['circle', 'free-point', 'segment', 'triangle', 'quadrilateral', 'square', 'rectangle', 'rhombus', 'trapezoid', 'parallelogram', 'polygon']);

const idOf = (c: AnyCommand): string | undefined => {
  const id = (c as { id?: unknown }).id;
  return typeof id === 'string' ? id : undefined;
};

/** The ids the figure (as the clause sees it) already has: its points, its circles, its lines. */
const knownIds = (ctx: ParseContext): Set<string> =>
  new Set([...(ctx.points ?? []), ...(ctx.circleMembers ?? []).flatMap((e) => (e.id ? [e.id] : [])), ...(ctx.circles ?? []).map((c) => `circle-${c}`), ...(ctx.lines ?? [])]);

/**
 * Does the whole-line lowering carry a reading of this clause, syntactically? Any of the clause's significant
 * commands: (1) a whole-line command of the same type names all its labels; (2) the whole line DEFINES the same
 * object (one id, maybe in another construction — the extension head inside `extend-onto-circle`); (3) it only
 * declares an object the figure already has.
 */
function traced(clause: AnyCommand[], whole: readonly AnyCommand[], known: Set<string>): boolean {
  const wholeLabels = whole.map((w) => ({ type: w.type, labels: labelsOf(w) }));
  const wholeIds = new Set(whole.flatMap((w) => (idOf(w) ? [idOf(w)!] : [])));
  return significant(clause).some((c) => {
    const need = [...labelsOf(c)];
    if (wholeLabels.some((w) => w.type === c.type && need.every((l) => w.labels.has(l)))) return true;
    const id = idOf(c);
    if (id && wholeIds.has(id)) return true;
    if (DECLARATION.has(c.type)) {
      const ids = id ? [id] : ((c as { ids?: unknown }).ids as string[] | undefined) ?? [];
      return ids.length > 0 && ids.every((x) => known.has(x));
    }
    return false;
  });
}

interface ClauseRead extends ClauseReading {
  /** what the figure already had when this clause was read (the figure plus the clauses before it) */
  known: Set<string>;
}

/** Each clause lowered alone, in the figure's context plus the clauses before it. Null for a single clause. */
function readClauses(utterance: string, ctx: ParseContext): ClauseRead[] | null {
  const parts = clausesOf(utterance);
  if (parts.length < 2) return null;
  let cur = ctx;
  return parts.map((clause) => {
    const known = knownIds(cur);
    const r = parse(clause, cur);
    if (!r.ok || r.commands.length === 0) return { clause, commands: null, known };
    cur = augmentParseCtx(cur, r.commands);
    return { clause, commands: r.commands, known };
  });
}

/** The ONE shared compound-line message (operator ruling 2026-10-06), naming the student's own clauses. */
function splitStatements(parts: string[]): ScopeMatch {
  return {
    category: 'split-statements',
    messageKey: 'input.scope.split-statements',
    params: { first: parts[0], second: parts[1], all: parts.map((p, i) => `(${i + 1}) ${p}`).join('  ') },
  };
}

/**
 * The COMMIT path: a cleanly-gated whole-line parse is about to commit. Refuse it (the shared message) when
 * a clause of the line reads on its own and the whole-line lowering carries no trace of it.
 */
export function droppedClause(
  utterance: string,
  commands: readonly AnyCommand[],
  ctx: ParseContext,
  /** the engine's entailment test: true when these commands, applied after the whole line's, add nothing (the
   *  dry run's empty / implied outcome). An error is NOT entailment: a clause that cannot hold beside the line
   *  is a clause the line does not honour. */
  entailed: (clause: AnyCommand[]) => boolean,
): ScopeMatch | null {
  const read = readClauses(utterance, ctx);
  if (!read) return null;
  const dropped = read.some((r) => r.commands !== null && !traced(r.commands, commands, r.known) && !entailed(significant(r.commands)));
  return dropped ? splitStatements(read.map((r) => r.clause)) : null;
}

/**
 * The WEAK path: the whole-line parse dropped stated content (an honesty gate fired), so a clause of this
 * line was not honoured. When the line is a compound whose every clause reads on its own in sequence, the
 * answer is the same shared message — the lines to type are real statements — never a paid call that
 * would re-read the compound. A line whose pieces do not all read alone is not shown as a split.
 */
export function compoundNotHonoured(utterance: string, ctx: ParseContext): ScopeMatch | null {
  const read = readClauses(utterance, ctx);
  if (!read || read.some((r) => r.commands === null)) return null;
  return splitStatements(read.map((r) => r.clause));
}
