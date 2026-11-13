/**
 * #2874 ([ADR-W-210](../../../docs/06w-decisions-workspace.md#adr-w-210) phase 1) — EVERY ENGINE-RUNNING
 * ACTION GOES THROUGH THE WORK QUEUE, in every builder.
 *
 * The cross-product lock, written the docs/04w way ("How a cross-product wiring guard is written"): the
 * checks live here once, each builder's thin lock hands over its own store, registry and sources, and the
 * meta-lock feeds broken stubs to the same function.
 *
 * It is a guard on the CLASS, not a list of today's actions. Four things can go wrong when someone adds
 * an action, and each is a fault here:
 *
 * 1. **A store action nobody classified.** The store's functions are read at RUNTIME; each must be a job
 *    (it writes the figure's basis, so the figure is re-solved) or free, with a reason. A new action is in
 *    neither list, so the suite fails until someone decides.
 * 2. **A free action that writes the basis.** The store's source is read, each free action's `set(…)`
 *    calls are found, and one that names a basis field is a fault: "free" is a claim, and this checks it.
 * 3. **A component that reaches a job action through the store.** Every non-test source of the tree
 *    outside `store/` and `app/` is scanned for the store spellings a component uses (a selector, a
 *    `getState()` call, a destructured hook) naming a job action, and for a job function imported from
 *    beside the store. A component calls the product's queued table (`act`) instead.
 * 4. **A product that draws the working look itself** (ADR-W-210 Am. 2). The look is shown only after the
 *    threshold, and only the shell's `WorkingFace` can do that while the page's thread is busy. A product
 *    source that renders `<WorkingMark` shows it from the first frame, so a fast action blinks again.
 *
 * What a source scan cannot see (a store handle passed around under another name) the basis guard does,
 * at run time: `watchBasis` reports a figure that changed with no job running. Each page arms it in
 * development, and {@link routingSuite}'s last two rows arm it around the product's real table.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { watchBasis, type WorkQueue } from '../../work';

export interface RoutingSubject {
  /** every function the store exposes, read from its state at run time */
  storeActions: readonly string[];
  /** the registry: the actions that write the basis … */
  jobs: readonly string[];
  /** … and the ones that do not, each with why */
  free: Readonly<Record<string, string>>;
  /** the keys of the product's queued action table */
  queued: readonly string[];
  /** the store's source, and the state fields that are the figure's basis */
  storeSource: string;
  basisFields: readonly string[];
  /** the store hook's name as a component spells it (`useGeoStore`) */
  storeName: string;
  /** job functions exported beside the store rather than on it (3-D's `undo3`, `redo3`) */
  standaloneJobs?: readonly string[];
  /** every non-test source of the tree outside `store/` and `app/` */
  uiSources: readonly { file: string; text: string }[];
}

const ACTION = /^\s*([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?\(/;

/** The text of every `set(…)` / `setState(…)` call inside each store action's body, by action name. */
export function setCallsByAction(storeSource: string): Map<string, string[]> {
  const lines = storeSource.split('\n');
  const bodies = new Map<string, string>();
  let current: string | null = null;
  for (const ln of lines) {
    const m = ACTION.exec(ln);
    if (m) current = m[1];
    if (current) bodies.set(current, (bodies.get(current) ?? '') + ln + '\n');
  }
  const out = new Map<string, string[]>();
  for (const [name, body] of bodies) {
    const calls: string[] = [];
    const open = /\bset(?:State)?\(/g;
    let m: RegExpExecArray | null;
    while ((m = open.exec(body))) {
      let depth = 1;
      let i = m.index + m[0].length;
      for (; i < body.length && depth > 0; i++) {
        if (body[i] === '(') depth++;
        else if (body[i] === ')') depth--;
      }
      calls.push(body.slice(m.index, i));
    }
    out.set(name, calls);
  }
  return out;
}

/**
 * The object a `set(…)` call writes, reduced to its OWN keys: an updater's parameter list is dropped
 * (`set(({ seed }) => …)` reads `seed`, it does not write it), and everything nested inside a value is
 * blanked (`set({ relations: { result, facts } })` tags a result with the facts it was computed for; it
 * does not write `facts`).
 */
export function writtenKeysText(call: string): string {
  const arrow = call.indexOf('=>');
  const firstBrace = call.indexOf('{');
  // an updater: the first `=>` comes before the written object opens, or the first brace is a destructured parameter
  const paramEnd = arrow >= 0 && (firstBrace < 0 || arrow < firstBrace || /^set(?:State)?\(\s*\(\s*\{/.test(call)) ? arrow + 2 : 0;
  let depth = 0;
  let out = '';
  for (const ch of call.slice(paramEnd)) {
    if (ch === '{') {
      depth++;
      out += depth === 1 ? ch : ' ';
    } else if (ch === '}') {
      out += depth === 1 ? ch : ' ';
      depth--;
    } else out += depth === 1 ? ch : ' ';
  }
  return out;
}

/** Does this `set(…)` call write `field`? A key of the written object: `field:`, or the shorthand `{ field,` / `, field }`. */
const writes = (call: string, field: string) => new RegExp(String.raw`[{,]\s*${field}\s*(?::|,|\})`).test(writtenKeysText(call));

/** The store members a source reaches through the hook: `use((s) => s.x)`, `use.getState().x`, `const { x } = use()`. */
export function storeMembersReached(text: string, storeName: string): string[] {
  const found: string[] = [];
  const selector = new RegExp(String.raw`\b${storeName}\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*\1\.(\w+)`, 'g');
  for (const m of text.matchAll(selector)) found.push(m[2]);
  const direct = new RegExp(String.raw`\b${storeName}\.getState\(\)\s*\.\s*(\w+)`, 'g');
  for (const m of text.matchAll(direct)) found.push(m[1]);
  const destructured = new RegExp(String.raw`\{([^{}]*)\}\s*=\s*${storeName}(?:\.getState)?\(\s*\)`, 'g');
  for (const m of text.matchAll(destructured))
    for (const part of m[1].split(',')) {
      const name = part.trim().split(':')[0].trim();
      if (name) found.push(name);
    }
  return found;
}

/** The faults of one builder's routing. Empty = every engine-running action is a job, and no component bypasses the queue. */
export function routingFaults(s: RoutingSubject): string[] {
  const faults: string[] = [];
  const jobs = new Set(s.jobs);
  const free = new Set(Object.keys(s.free));
  for (const a of s.storeActions) {
    if (jobs.has(a) && free.has(a)) faults.push(`${a}: classified both as a job and as free`);
    else if (!jobs.has(a) && !free.has(a)) faults.push(`${a}: a store action with no routing class — is it a job (it writes the basis) or free (say why)?`);
  }
  for (const a of [...jobs, ...free]) if (!s.storeActions.includes(a)) faults.push(`${a}: classified, but the store has no such action (a stale row)`);
  for (const [a, why] of Object.entries(s.free)) if (!why.trim()) faults.push(`${a}: free with no reason`);
  for (const a of s.jobs) if (!s.queued.includes(a)) faults.push(`${a}: a job the queued table does not offer`);

  const calls = setCallsByAction(s.storeSource);
  for (const a of free)
    for (const call of calls.get(a) ?? [])
      for (const field of s.basisFields)
        if (writes(call, field)) faults.push(`${a}: classified free, but it writes the basis field «${field}»`);

  for (const { file, text } of s.uiSources) {
    for (const member of storeMembersReached(text, s.storeName))
      if (jobs.has(member)) faults.push(`${file}: reaches the job action «${member}» through ${s.storeName} — call the queued table instead`);
    for (const fn of s.standaloneJobs ?? [])
      if (new RegExp(String.raw`\b${fn}\b`).test(text)) faults.push(`${file}: names the job function «${fn}» — call the queued table instead`);
    if (/<WorkingMark\b/.test(text)) faults.push(`${file}: draws the working mark itself — render the shell's WorkingFace, which shows it only after the threshold`);
  }
  return faults;
}

/** Every non-test `.ts`/`.tsx` under `treeDir`, except the directories in `skip` (relative to the tree). */
export function sourcesOf(treeDir: string, skip: readonly string[] = ['store', 'app']): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      const rel = path.relative(treeDir, full).replace(/\\/g, '/');
      if (statSync(full).isDirectory()) {
        if (name === '__tests__' || name === 'node_modules' || skip.includes(rel)) continue;
        walk(full);
      } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
        out.push({ file: rel, text: readFileSync(full, 'utf8') });
      }
    }
  };
  walk(treeDir);
  return out;
}

/** The function-valued keys of a store's state: its actions, as they are at run time. */
export const actionsOf = (state: object): string[] => Object.entries(state).flatMap(([k, v]) => (typeof v === 'function' ? [k] : []));

export interface RoutingProbe {
  queue: WorkQueue<unknown>;
  /** the product's basis subscription (its `onBasisChange…`) */
  onBasisChange: (changed: () => void) => () => void;
  /** clear the canvas through the queued table (a clear replaces the basis, whatever the canvas held) … */
  viaQueue: () => Promise<unknown>;
  /** … and by calling the store bare, as a component that bypassed the queue would */
  bare: () => void;
}

/** A builder's thin lock: the static faults, then the product's real table and store under the basis guard. */
export function routingSuite(name: string, subject: () => RoutingSubject, probe: RoutingProbe): void {
  describe(`#2874 — ${name}: every engine-running action goes through the work queue`, () => {
    it('every store action is classified, no free action writes the basis, and no component bypasses the queue', () => {
      expect(routingFaults(subject())).toEqual([]);
    });

    it('the scan read real sources (a lock that read nothing passes by checking nothing)', () => {
      const s = subject();
      expect(s.storeActions.length).toBeGreaterThan(5);
      expect(s.uiSources.length).toBeGreaterThan(3);
      expect(s.uiSources.some((f) => f.text.includes(s.storeName)), 'a component that reads the store was scanned').toBe(true);
      expect([...setCallsByAction(s.storeSource).values()].flat().length, 'the store’s set() calls were found').toBeGreaterThan(5);
    });

    it('an action asked through the queued table changes the figure INSIDE a job', async () => {
      const outside: number[] = [];
      const off = watchBasis(probe.queue, probe.onBasisChange, () => outside.push(1));
      try {
        const asked = probe.viaQueue();
        expect(probe.queue.working(), 'working from the moment of the action').toBe(true);
        await asked;
        expect(probe.queue.working(), 'released when it is done').toBe(false);
        expect(outside, 'the basis changed inside the job').toEqual([]);
      } finally {
        off();
      }
    });

    it('the same store action called bare is what the basis guard reports', async () => {
      const outside: number[] = [];
      const off = watchBasis(probe.queue, probe.onBasisChange, () => outside.push(1));
      try {
        probe.bare();
        expect(outside.length, 'a figure that changed outside a job').toBeGreaterThan(0);
      } finally {
        off();
      }
    });
  });
}
