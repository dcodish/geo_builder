/**
 * #2890 ([ADR-830](../../docs/06-decisions.md#adr-830), ADR-W-210 phase 3) — THE PAGE'S SIDE OF AN ACTION DECIDED IN
 * THE GEOMETRY WORKER.
 *
 * The worker runs the whole decision (`store/geoOps.ts`) and answers what it changed and the SETTLED view of the figure
 * it ended on. The page does two things with it, and only these: it ADOPTS the settled view into its own memos (so its
 * render and its resolve gate read it without solving), and it puts the changed fields in its store at the ONE sink,
 * `geoStore.adopt`, checked against the figure the action started on. Everything a student sees is decided by the
 * same code as before; it runs in the other heap.
 *
 * In the page's own heap (node, the suites, a browser with no `Worker`) the operation acted on the page's store
 * directly and answers `applied`: nothing is adopted or set.
 */
import { adoptSettled, hasReplay, peekReplay } from '@/replay/core';
import { useGeoStore, type Fact } from '@/store/geoStore';
import { geoJobs, storeData, type Acted, type ViewArg } from '@/store/geoWork';
import { logDebug } from '@/debug/sessionLog';
import type { DecideView } from './decideDeterministic';
import type { EditDeps } from './editPipeline';

/** The figure an action starts on: what its result may be applied to. */
export interface Basis {
  facts: Fact[];
  seed: number;
}
export const basisNow = (): Basis => {
  const s = useGeoStore.getState();
  return { facts: s.facts, seed: s.seed };
};

/**
 * Put a worker's answer in: adopt its settled view, send what it logged, and set what it changed, as one store
 * transition, only while the store still holds `basis`. Returns whether it applied.
 */
export function applyActed(res: Acted, basis: Basis): boolean {
  if (res.applied) return true;
  if (res.settled) adoptSettled(res.settled);
  for (const event of res.logs) logDebug(event);
  if (Object.keys(res.slice).length === 0) return true;
  return useGeoStore.getState().adopt(res.slice as never, basis);
}

/**
 * The view a line is decided against, as the worker can rebuild it: `'replay'` when the page shows the replay of its
 * own `(facts, seed)` (the worker computes the same), the view itself when the page holds a different one (the
 * keep-prior view of ADR-293, or a paragraph's view). Read without solving.
 */
export function viewArg(view: DecideView): ViewArg {
  const s = useGeoStore.getState();
  return peekReplay(s.facts, s.seed)?.construction === view.construction ? 'replay' : view;
}

/** Run one store action in the worker and put its result in. Returns the action's own value. */
export async function actInWorker(name: string, args: unknown[]): Promise<unknown> {
  const basis = basisNow();
  const res = await geoJobs.act(storeData(), name, args);
  applyActed(res, basis);
  return res.value;
}

/**
 * After an action the page made itself (undo, redo, a view applied): if the page holds no solved view of the figure
 * now in the store, the worker settles it and the page adopts it, so the render does not solve.
 */
export async function ensureSettled(): Promise<void> {
  const { facts, seed } = basisNow();
  if (hasReplay(facts, seed)) return;
  const settled = await geoJobs.settle(facts, seed);
  // under the page's OWN array: the worker answered for a clone of it, and the store holds this one
  if (settled) adoptSettled({ ...settled, facts });
}

/** Replace the worker's translation tokens (`⁣T<n>⁣`) with the page's own `t`, nested ones included. */
export function translateTokens(text: string, keys: [string, Record<string, unknown> | undefined][], t: EditDeps['t']): string {
  const one = (s: string): string =>
    s.replace(/⁣T(\d+)⁣/g, (_m, n: string) => {
      const [key, opts] = keys[Number(n)];
      if (!opts) return t(key);
      const decoded: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(opts)) decoded[k] = typeof v === 'string' ? one(v) : v;
      return t(key, decoded);
    });
  return one(text);
}

/**
 * THE ✎ EDIT, as the App runs it (#2890): the seam (`runEditCommit`) decides and commits in the worker; the page shows
 * its notes in its own language, puts the result in, and launches the post-commit search when the seam asked for it.
 * Answers what the seam answered.
 */
export async function editJob(key: string, text: string, deps: EditDeps): Promise<boolean> {
  const basis = basisNow();
  const res = await geoJobs.edit({ state: storeData(), key, text, centresShown: deps.centresShown?.() === true });
  applyActed(res, basis);
  for (const note of res.value.notes) deps.setInputNote(translateTokens(note, res.value.keys, deps.t));
  if (res.value.resolve) void deps.resolveAfterCommit();
  return res.value.ok;
}

/** A row's tick box (`runSetGroupEnabled`), with the reducer in the worker. */
export async function setGroupEnabledJob(key: string, enabled: boolean, deps: Pick<EditDeps, 'resolveAfterCommit'>): Promise<void> {
  await actInWorker('setGroupEnabled', [key, enabled]);
  logDebug({ kind: 'action', action: 'toggle-group', detail: `${key} → ${enabled}` });
  void deps.resolveAfterCommit();
}
