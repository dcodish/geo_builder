/**
 * #2890 ([ADR-3D-492](../../docs/06b-decisions-3d.md#adr-3d-492) part 2; ADR-W-210 phase 3) — A JOB'S JOURNAL, AND ITS
 * ADOPTION.
 *
 * Phase 3 moves a student action's solving off the page. In 3-D the page keeps its store action and its readers, and
 * 82–94 % of an action's solving is inside the store action, before any render. So what leaves the solving heap is not
 * a figure: it is everything the action WROTE into the content-keyed memos (ADR-3D-491) — every derive, every resolved
 * figure, every seed verdict, every ring reach, every segment-equation reading. The other heap takes those entries in
 * under the same content keys and then runs the SAME action: each solve is a memo hit. An entry that is missing is
 * never a wrong figure: that heap solves it, and the work meter counts it.
 *
 *   const rec = recordJournal3();          // the solving heap
 *   store.remove(id); readers();           // the action, then the page's readers
 *   const journal = rec.take();            // plain data: `structuredClone` or `postMessage` takes it as it is
 *   rec.stop();
 *
 *   adoptJournal3(journal);                // the other heap, on the clone
 *   store.remove(id); readers();           // the same action: no solve
 *
 * `take()` may be called more than once: each returns what was written since the one before (the figure first, the
 * values after). A lazy value computed on a figure an earlier take already carried follows in the later one.
 *
 * THREE THINGS A JOURNAL MUST CARRY THAT ARE NOT IN THE ENTRIES THEMSELVES:
 *  - **The pin origins.** `scalarPinOrigin3` maps a scalar pin OBJECT to the row and the claim it came from. It is part
 *    of a construction's content, and a clone has new pin objects with no entry: such a construction is "not settled"
 *    and keeps the identity rule, so nothing adopted under it would ever be found (63 of the 176 fixtures). Each
 *    construction a journal names is listed once in `figures` with its origins as an array aligned with
 *    `c.scalarPins`, in the SAME message, so that the claim an origin points at is the object in `c.claims`.
 *  - **The new row's id.** It is part of `derive3`'s key. Two heaps running one submit must name the row alike, so the
 *    caller draws the id and gives it to both (`store.submit(text, newId)`, `decideDeterministic3(st, raw, newId)`).
 *  - **One message.** Entries share objects (a derive's construction is the figure of its resolved entries). A clone
 *    keeps that sharing only inside one `structuredClone` call: never split a take across messages.
 *
 * Inert until a worker exists: nothing in the product records or adopts yet.
 */
import {
  adoptEngineJournal3,
  pinOrigins3,
  recordEngineJournal3,
  takeEngineJournal3,
  writePinOrigins3,
  type EngineJournal3,
  type PinOrigins3,
} from '../engine/evaluate';
import type { Construction3 } from '../engine/types';
import { adoptStoreJournal3, recordStoreJournal3, takeStoreJournal3, type StoreJournal3 } from './store3';

/** What an action wrote into the content-keyed memos, as plain data. */
export interface Journal3 extends EngineJournal3, StoreJournal3 {
  /** The journal's shape. A heap that meets another number drops the journal and solves for itself. */
  v: 1;
  /** Every construction an entry names, once, with its pin origins beside it. */
  figures: { c: Construction3; origins: PinOrigins3 }[];
}

export interface JournalRecorder3 {
  /** What was written since the last take (or since the recording began). The recording goes on. */
  take(): Journal3;
  /** End the recording. What was written since the last take is dropped. */
  stop(): void;
}

/** Start recording what this heap's memos are given. One recording at a time. */
export function recordJournal3(): JournalRecorder3 {
  recordEngineJournal3(true);
  try {
    recordStoreJournal3(true);
  } catch (e) {
    recordEngineJournal3(false);
    throw e;
  }
  return {
    take: () => {
      const engine = takeEngineJournal3();
      const store = takeStoreJournal3();
      const seen = new Set<Construction3>();
      const figures: Journal3['figures'] = [];
      const note = (c: Construction3): void => {
        if (seen.has(c)) return;
        seen.add(c);
        figures.push({ c, origins: pinOrigins3(c) });
      };
      for (const d of store.derives) note(d.out.construction);
      for (const r of engine.resolves) note(r.figure);
      for (const v of engine.verdicts) note(v.figure);
      for (const r of engine.reaches) note(r.figure);
      for (const l of engine.lazies) note(l.figure);
      return { v: 1, figures, ...store, ...engine };
    },
    stop: () => {
      recordEngineJournal3(false);
      recordStoreJournal3(false);
    },
  };
}

/**
 * Take a journal's entries into this heap's memos. Idempotent: an entry already held is kept, so a journal adopted
 * twice, or after this heap solved the same content itself, changes nothing a reader can see.
 */
export function adoptJournal3(journal: Journal3): void {
  if (journal.v !== 1) return;
  for (const f of journal.figures) writePinOrigins3(f.c, f.origins); // first: they are part of each construction's content
  adoptEngineJournal3(journal);
  adoptStoreJournal3(journal);
}
