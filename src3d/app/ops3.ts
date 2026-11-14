/**
 * #2890 round 2 ([ADR-3D-493](../../docs/06b-decisions-3d.md#adr-3d-493); ADR-W-210 phase 3) — 3-D's OPERATIONS: what
 * its worker runs, as ONE table. The worker entry (`worker3.ts`) serves it; the work-meter gate loads it a second time,
 * as a browser's worker heap (`shell/workerExecutor`'s `isolatedExecutor`).
 *
 * There is one operation, `act`: run a student's action the way the page will run it, then the page's readers, and
 * hand back what that WROTE into the content-keyed memos (`store/journal3.ts`), in two messages:
 *  - the part `figure`: the action and the figure's readers (`readers3.ts`);
 *  - the value: the values' readers (the open data panel, the saved questions).
 * The page adopts each and runs its OWN action and readers over it: nothing there is solved again. Nothing here is
 * applied to the page as a result, so a step this heap gets wrong costs the page a solve, never a wrong figure.
 *
 * The page sends all a job needs (the store's data, the steps, the row ids it drew), so a worker can be replaced
 * between any two jobs. Its checkpoint (`takeCheckpoint3`) is a journal of what the page holds for the figure on
 * screen.
 */
import type { OpContext } from '../../shell/workerProtocol';
import { useGeo3, derive3, decideCommands3, type Fact3, type Geo3State } from '../store/store3';
import type { Command3 } from '../engine/types';
import type { Seed3 } from '../engine/components3';
import { adoptJournal3, recordJournal3, type Journal3 } from '../store/journal3';
import { useRowIds3 } from '../store/rowIds3';
import { deserializeFigure3 } from '../store/figureFile3';
import { auditLoad3 } from '../store/loadAudit3';
import { decideDeterministic3 } from './decideDeterministic3';
import { answerQuery } from '../engine/queries';
import { readFigure3, readValues3 } from './readers3';

/** The store's data a job is run on: everything an action or a reader of the figure reads. */
export type StoreData3 = Pick<Geo3State, 'facts' | 'seed' | 'queries' | 'planeDisplay' | 'displayMode' | 'dihedralShown'>;

/** The store actions a job may name. Each is the store's own, called with the job's arguments. */
export type StoreAction3 = 'submit' | 'dispatchVerdict' | 'submitSteps' | 'toggle' | 'remove' | 'replaceFact' | 'rename' | 'swap' | 'clear' | 'resample' | 'loadFigure' | 'addQuery';

/** One step of a student's action, as both heaps run it. */
export type Step3 =
  /** A typed sentence: App3's deterministic decision, dispatched unless the line is guided. */
  | { kind: 'line'; raw: string }
  /** A store action by name. */
  | { kind: 'action'; name: StoreAction3; args: unknown[] }
  /** A saved file, a shared link or a restored session: read, loaded, and audited as App3 does. */
  | { kind: 'open'; text: string }
  /** A figure's rows put in the store as they were saved (the slow corpus's load), then audited as App3 does. */
  | { kind: 'load'; facts: Fact3[]; seed: Seed3 }
  /** A row committed from its saved commands (the work meter's walk, for a row the grammar no longer records). */
  | { kind: 'saved'; utterance: string; cmds: Command3[] }
  /** A question for the ask lane: saved, and answered for the row it points at. */
  | { kind: 'ask'; text: string };

export interface ActArgs3 {
  state: StoreData3;
  steps: Step3[];
  /** The new rows' ids, drawn on the page: both heaps name a new row alike. */
  ids: string[];
  /** The data panel is open: the values are read. */
  panel: boolean;
}

/** Run one step on this heap's store. */
export function runStep3(step: Step3): void {
  const store = useGeo3.getState();
  switch (step.kind) {
    case 'line': {
      const v = decideDeterministic3(store, step.raw);
      if (v.kind !== 'guided') useGeo3.getState().dispatchVerdict(v);
      return;
    }
    case 'action':
      (store[step.name] as (...a: unknown[]) => unknown)(...step.args);
      return;
    case 'open': {
      const r = deserializeFigure3(step.text);
      if (!r.ok) return;
      store.loadFigure(r.facts, r.seed, r.queries, r.planeDisplay, r.displayMode, r.dihedralShown);
      auditLoad3(r.facts, r.seed);
      return;
    }
    case 'load':
      store.loadFigure(step.facts, step.seed);
      auditLoad3(step.facts, step.seed);
      return;
    case 'saved': {
      const v = decideCommands3(store, step.utterance, step.cmds, { twins: false, seedSearch: true });
      if (v.kind === 'record') useGeo3.getState().dispatchVerdict(v);
      return;
    }
    case 'ask': {
      store.addQuery(step.text);
      const { facts, seed } = useGeo3.getState();
      answerQuery(derive3(facts, seed).construction, step.text, seed);
      return;
    }
  }
}

/** A reader that throws throws on the page too, where the App handles it; here it must not lose the journal. */
const quietly = (fn: () => void): void => {
  try {
    fn();
  } catch {
    /* the page meets the same throw in its own render */
  }
};

export function ops3() {
  return {
    act(args: ActArgs3, ctx: OpContext): Journal3 {
      const rec = recordJournal3();
      try {
        useGeo3.setState({ ...args.state, lastError: null, lastNotice: null, lastCreated: null });
        useGeo3.temporal.getState().clear(); // a worker's store keeps no history: every job brings its state
        useRowIds3(args.ids);
        try {
          for (const step of args.steps) quietly(() => runStep3(step));
        } finally {
          useRowIds3([]);
        }
        quietly(readFigure3);
        ctx.part('figure', rec.take());
        quietly(() => readValues3(args.panel));
        return rec.take();
      } finally {
        rec.stop();
      }
    },
  };
}
export type Ops3 = ReturnType<typeof ops3>;

/** The page's checkpoint for a fresh worker: a journal of the figure on screen (`heldJournal3`). */
export function takeCheckpoint3(checkpoint: unknown): void {
  adoptJournal3(checkpoint as Journal3);
}
