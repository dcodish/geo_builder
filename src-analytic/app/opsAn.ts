/**
 * THE ANALYTIC WORKER'S OPERATIONS (#2890, [ADR-AG-478](../../docs/06c-decisions-analytic.md#adr-ag-478); ADR-W-210
 * phase 3, "settle, then hand over").
 *
 * Every solve the page used to make is one of these. Each takes plain data (the store's basis, a sentence, an index)
 * and answers plain data: its value, and the SETTLED content it solved on the way (`engine/settle.ts`), which the page
 * adopts so that its own synchronous readers find every answer already solved. Served by the worker
 * (`app/analyticWorker.ts`, `shell/workerHost`), or in process where there is no `Worker` (`app/workerAn.ts`).
 *
 * - **Decisions** (`submit`, `edit`, `toggle`, `another`, `letter`, `audit`, `fallbackExisting`, `fallbackJudge`): the
 *   function the page called before, called here, unchanged.
 * - **`show`**: a figure, FIRST, then its values (operator ruling 2026-11-14, #2890 question 1: *"Figure first"*). The
 *   `figure` part is the derivation and what its paint reads with the pool HELD (`readFigure`); the value is the same
 *   figure with its configuration pool complete, every reader run again and the two notes of the paint
 *   (`readAfterPaint`). With `ticks` the pool is filled one configuration per tick, and a newer request ends it early
 *   (`complete: false`): what was solved is kept and handed over, and the page asks again while it still shows that
 *   figure.
 *
 * No store, no React (`__tests__/off-page-graph.test.ts`).
 */
import { derive, type Derivation } from '../engine/derive';
import { configurationPool, type Seed } from '../engine/evaluate';
import { adoptSettled, settledOf, settling, type Settled } from '../engine/settle';
import type { OpContext } from '../../shell/workerProtocol';
import { isNotDecided, type NotDecided } from '../../shell/notDecided';
import { decideWithin, type ResumeAn } from '../engine/workLimitAn';
import { activeOf, activePins } from './active';
import { decideEditHost, decideSubmit, decideToggle } from './submit';
import { anotherConfiguration } from './another';
import { decideRename, decideSwap, type RenameState } from './rename';
import { decideCentreName, decideCentreSwap } from './centreName';
import { auditLoadedLines } from './loadAudit';
import { existingNamesOf, judgeAnswer } from './fallback';
import { readAfterPaint, readFigure, type ReaderInputs } from './figureReaders';
import type { LlmStepsOutcome } from '../parser/llmAnalytic';

/** The store fields `derive` reads (`app/workAn.ts` `BASIS_FIELDS_AN`): the figure's whole identity. */
export interface BasisAn {
  lines: readonly string[];
  disabled: readonly number[];
  seed: Seed;
  seedNames: Readonly<Record<string, string>>;
  hosts: Readonly<Record<number, readonly string[]>>;
}

export const activeLinesOf = (b: BasisAn): string[] => activeOf(b.lines, b.disabled);
export const pinsOf = (b: BasisAn): Record<number, readonly string[]> => activePins(b.hosts, b.lines.length, b.disabled);
/** The figure a basis shows: what the page's render derives. */
export const derivationOf = (b: BasisAn): Derivation => derive(activeLinesOf(b), b.seed, b.seedNames, pinsOf(b));

/** A decision's answer: its value, and what it solved on the way, for the page to adopt. */
export interface Decided<V> {
  value: V;
  settled: Settled;
}
/**
 * #2893 (ADR-AG-479): every decision is one search under the work limit (`engine/workLimitAn`). A round that reaches it
 * answers "not decided" and hands nothing over: what it finished stays in this heap's memos for the next round.
 */
function decided<V>(fn: () => V, round = 1): Decided<V | NotDecided<ResumeAn>> {
  const { value, keys } = settling(() => decideWithin(fn, round));
  return { value, settled: settledOf(isNotDecided(value) ? [] : keys) };
}
/** Which round of a search this is: 1, or 2, 3, … for each «המשיכו לחפש». */
export interface Round {
  round?: number;
}

export interface ShowArgs {
  basis: BasisAn;
  inputs: ReaderInputs;
  /** Fill the pool one configuration per tick, giving way to a newer request (a real worker). */
  ticks?: boolean;
}
export interface Shown {
  settled: Settled;
  /** The pool is complete and every reader has run on it: the page may show the values. */
  complete: boolean;
}

/** The figure: the derivation and what its paint reads, with the pool held. */
function figureStage(args: ShowArgs, keys: Set<string>): Settled {
  const { keys: touched } = settling(() => {
    const d = derivationOf(args.basis);
    configurationPool(d.construction).hold();
    // the questions are values: a held page shows them pending, and asks the figure nothing for them
    readFigure(d, activeLinesOf(args.basis), { ...args.inputs, asks: [] });
  });
  for (const k of touched) keys.add(k);
  return settledOf([...keys]);
}

/** The values, once the pool is complete: every reader again, and the notes the page reads after its paint. */
function valueStage(args: ShowArgs, d: Derivation, keys: Set<string>): Shown {
  const { keys: touched } = settling(() => {
    readFigure(d, activeLinesOf(args.basis), args.inputs);
    readAfterPaint(d, activeLinesOf(args.basis), args.basis.seed, args.basis.seedNames);
  });
  for (const k of touched) keys.add(k);
  return { settled: settledOf([...keys]), complete: true };
}

function showNow(args: ShowArgs, ctx: OpContext): Shown {
  const keys = new Set<string>();
  ctx.part('figure', figureStage(args, keys));
  const { value: d, keys: touched } = settling(() => {
    const view = derivationOf(args.basis);
    configurationPool(view.construction).fill();
    return view;
  });
  for (const k of touched) keys.add(k);
  return valueStage(args, d, keys);
}

async function showYielding(args: ShowArgs, ctx: OpContext): Promise<Shown> {
  const keys = new Set<string>();
  ctx.part('figure', figureStage(args, keys));
  const { value: d, keys: touched } = settling(() => derivationOf(args.basis));
  for (const k of touched) keys.add(k);
  const pool = configurationPool(d.construction);
  while (!pool.complete()) {
    pool.step();
    if (!pool.complete() && (await ctx.tick())) return { settled: settledOf([...keys]), complete: false };
  }
  return valueStage(args, d, keys);
}

/** What a letter popover or a typed rename asks. */
export type LetterRequest =
  | { kind: 'rename'; from: string; to: string }
  | { kind: 'swap'; a: string; b: string }
  | { kind: 'centreName'; offerId: string; to: string }
  | { kind: 'centreSwap'; offerId: string; taken: string };

const stateDerivation = (state: RenameState): Derivation =>
  derive(activeOf(state.lines, state.disabled), state.seed, state.seedNames ?? {}, activePins(state.hosts ?? {}, state.lines.length, state.disabled));

/** The operation table: what `app/analyticWorker.ts` serves and `app/workerAn.ts` runs in process. */
export const opsAn = {
  show: (args: ShowArgs, ctx: OpContext): Shown | Promise<Shown> => (args.ticks ? showYielding(args, ctx) : showNow(args, ctx)),
  /** The figure stage alone (a page with no worker draws its first figure from it, in the same task). */
  figure: (args: ShowArgs): Settled => figureStage(args, new Set()),
  submit: ({ raw, basis, round }: { raw: string; basis: BasisAn } & Round) => decided(() => decideSubmit(raw, activeLinesOf(basis), basis.seed, derivationOf(basis)), round),
  edit: ({ index, text, basis, round }: { index: number; text: string; basis: BasisAn } & Round) =>
    decided(() => decideEditHost(index, text, basis.lines, basis.disabled, basis.seed, basis.seedNames, basis.hosts), round),
  toggle: ({ index, basis, round }: { index: number; basis: BasisAn } & Round) =>
    decided(() => decideToggle(index, basis.lines, basis.disabled, basis.seed, derivationOf(basis), basis.hosts), round),
  another: ({ basis, round }: { basis: BasisAn } & Round) => decided(() => anotherConfiguration(activeLinesOf(basis), basis.seed, undefined, basis.seedNames, pinsOf(basis)), round),
  letter: ({ request, state, round }: { request: LetterRequest; state: RenameState } & Round) =>
    decided(() => {
      const current = stateDerivation(state);
      switch (request.kind) {
        case 'rename':
          return { kind: 'rename' as const, verdict: decideRename(request.from, request.to, state, current) };
        case 'swap':
          return { kind: 'swap' as const, verdict: decideSwap(request.a, request.b, state, current) };
        case 'centreName':
          return { kind: 'centreName' as const, verdict: decideCentreName(request.offerId, request.to, state, current) };
        case 'centreSwap':
          return { kind: 'centreSwap' as const, verdict: decideCentreSwap(request.offerId, request.taken, state, current) };
      }
    }, round),
  audit: ({ lines, disabled, hosts, round }: { lines: readonly string[]; disabled: readonly number[]; hosts: Readonly<Record<number, readonly string[]>> } & Round) =>
    decided(() => auditLoadedLines(lines, disabled, hosts), round),
  fallbackExisting: ({ lines, seed, round }: { lines: readonly string[]; seed: Seed } & Round) => decided(() => existingNamesOf(lines, seed), round),
  fallbackJudge: ({ utterance, lines, seed, answer, existing, round }: { utterance: string; lines: readonly string[]; seed: Seed; answer: LlmStepsOutcome | null; existing: ReadonlySet<string> } & Round) =>
    decided(() => judgeAnswer(utterance, lines, seed, answer, existing), round),
};
export type OpsAn = typeof opsAn;

/** A fresh worker's checkpoint: the page's own settled store (`settledOf(heldLineListKeys())`), adopted. */
export const takeCheckpointAn = (checkpoint: unknown): void => adoptSettled(checkpoint as Settled);
