/**
 * #2874 (ADR-W-210 phase 1) — THE META-LOCK of `fixtures/work-routing-rows.ts`: each way a builder's
 * routing can go wrong is fed to the SAME `routingFaults` the four thin locks call, and must be caught.
 * A check that cannot fail is not a check.
 */
import { describe, expect, it } from 'vitest';
import { routingFaults, setCallsByAction, storeMembersReached, writtenKeysText, type RoutingSubject } from './fixtures/work-routing-rows';

const STORE = `
export const useToyStore = create<Toy>()((set, get) => ({
  lines: [],
  seed: 0,
  name: '',
  addLine: (line) => {
    set({ lines: [...get().lines, line], seed: 0 });
  },
  removeLine: (i) =>
    set((s) => ({
      lines: s.lines.filter((_, k) => k !== i),
    })),
  setName: (name) => set({ name }),
  nextConfig: () => set(({ seed }) => ({ seed: seed + 1 })),
}));
`;

const sound: RoutingSubject = {
  storeActions: ['addLine', 'removeLine', 'setName', 'nextConfig'],
  jobs: ['addLine', 'removeLine', 'nextConfig'],
  free: { setName: 'a label' },
  queued: ['addLine', 'removeLine', 'nextConfig'],
  storeSource: STORE,
  basisFields: ['lines', 'seed'],
  storeName: 'useToyStore',
  standaloneJobs: ['undoToy'],
  uiSources: [{ file: 'App.tsx', text: `const name = useToyStore((s) => s.name);\nconst { setName, lines } = useToyStore();\nact.removeLine(2);` }],
};
const withUi = (text: string): RoutingSubject => ({ ...sound, uiSources: [{ file: 'App.tsx', text }] });

describe('#2874 meta — the routing lock bites', () => {
  it('a sound subject has no fault', () => {
    expect(routingFaults(sound)).toEqual([]);
  });

  it('a NEW store action nobody classified', () => {
    expect(routingFaults({ ...sound, storeActions: [...sound.storeActions, 'mergeLines'] })).toEqual([expect.stringContaining('mergeLines: a store action with no routing class')]);
  });

  it('a stale row, a double row, and a free row with no reason', () => {
    expect(routingFaults({ ...sound, free: { ...sound.free, gone: 'was removed' } })).toEqual([expect.stringContaining('gone: classified, but the store has no such action')]);
    expect(routingFaults({ ...sound, free: { ...sound.free, addLine: 'x' } })).toEqual(expect.arrayContaining([expect.stringContaining('addLine: classified both')]));
    expect(routingFaults({ ...sound, free: { setName: ' ' } })).toEqual([expect.stringContaining('setName: free with no reason')]);
  });

  it('a job the queued table does not offer', () => {
    expect(routingFaults({ ...sound, queued: ['addLine', 'removeLine'] })).toEqual([expect.stringContaining('nextConfig: a job the queued table does not offer')]);
  });

  it('a FREE action that writes the basis — an object key, a multi-line set, an updater, a shorthand', () => {
    const asFree = (name: string) => routingFaults({ ...sound, jobs: sound.jobs.filter((j) => j !== name), queued: sound.queued, free: { ...sound.free, [name]: 'claimed free' } });
    expect(asFree('addLine')).toEqual(expect.arrayContaining([expect.stringContaining('addLine: classified free, but it writes the basis field «lines»')]));
    expect(asFree('removeLine')).toEqual([expect.stringContaining('removeLine: classified free, but it writes the basis field «lines»')]);
    expect(asFree('nextConfig')).toEqual([expect.stringContaining('nextConfig: classified free, but it writes the basis field «seed»')]);
    const shorthand = `export const s = create()((set) => ({\n  load: (lines, seed) => set({ lines, seed }),\n}));`;
    expect(routingFaults({ ...sound, storeActions: ['load'], jobs: [], queued: [], free: { load: 'claimed free' }, storeSource: shorthand }).length).toBe(2);
  });

  it('a free action that only READS the basis is not a fault', () => {
    const reads = `export const s = create()((set, get) => ({\n  setName: (name) => {\n    const { lines, seed } = get();\n    set({ name: name + lines.length + seed });\n  },\n}));`;
    expect(routingFaults({ ...sound, storeActions: ['setName'], jobs: [], queued: [], storeSource: reads })).toEqual([]);
  });

  it('a free action that TAGS a result with the basis, or whose updater only reads it, is not a fault', () => {
    const tagged = `export const s = create()((set, get) => ({\n  viewRelations: async () => {\n    const lines = get().lines;\n    set({ relations: { result: 1, lines } });\n  },\n  toggleDisplay: (i) => set(({ display, lines }) => ({ display: flip(display, i, lines.length) })),\n}));`;
    expect(routingFaults({ ...sound, storeActions: ['viewRelations', 'toggleDisplay'], jobs: [], queued: [], free: { viewRelations: 'a panel', toggleDisplay: 'a view choice' }, storeSource: tagged })).toEqual([]);
    expect(writtenKeysText('set({ a: { lines }, seed: f({ lines }) })')).not.toMatch(/lines/);
    expect(writtenKeysText('set(({ seed }) => ({ seed: seed + 1 }))')).toMatch(/\{ seed:/);
  });

  it('a component that reaches a job action through the store: selector, getState, destructure', () => {
    expect(routingFaults(withUi(`const removeLine = useToyStore((s) => s.removeLine);`))).toEqual([expect.stringContaining('App.tsx: reaches the job action «removeLine»')]);
    expect(routingFaults(withUi(`onClick={() => useToyStore.getState().nextConfig()}`))).toEqual([expect.stringContaining('«nextConfig»')]);
    expect(routingFaults(withUi(`const {\n  lines,\n  addLine,\n  setName,\n} = useToyStore();`))).toEqual([expect.stringContaining('«addLine»')]);
    expect(routingFaults(withUi(`const { removeLine: drop } = useToyStore.getState();`))).toEqual([expect.stringContaining('«removeLine»')]);
  });

  it('a component that names a job function exported beside the store', () => {
    expect(routingFaults(withUi(`import { undoToy } from './store';\nonClick={() => undoToy()}`))).toEqual([expect.stringContaining('names the job function «undoToy»')]);
  });

  it('reading STATE through the store, and calling a free action, are not faults', () => {
    expect(routingFaults(withUi(`const lines = useToyStore((s) => s.lines);\nuseToyStore.getState().setName('x');\nconst n = useToyStore.getState().seed;`))).toEqual([]);
  });

  it('the extractors read what they claim to', () => {
    expect([...setCallsByAction(STORE).keys()]).toEqual(expect.arrayContaining(['addLine', 'removeLine', 'setName', 'nextConfig']));
    expect(setCallsByAction(STORE).get('removeLine')?.[0]).toContain('s.lines.filter');
    expect(storeMembersReached(`useToyStore((st) => st.addLine); useToyStore.getState().seed`, 'useToyStore')).toEqual(['addLine', 'seed']);
  });
});
