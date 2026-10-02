/**
 * #1653 — the analytic builder conforms to the shared segment-display contract (docs/28 §5c rule 3).
 *
 * This tree's thin lock on `shell/__tests__/fixtures/segment-display-rows.ts`: the REAL store toggles
 * (`toggleSegHidden` / `toggleSegDashed`, what App wires to the shared `SegmentMenu`), the REAL canvas
 * (`buildScene` with the store's `segStyle`, painted by `render/Figure.tsx` and read off its markup), the
 * real measure menu (`measurablesOf`, what the segment click offers), the store's own undo, and the real
 * save path (`serialize` → `clearAll` → `loadAnalyticSession`) — never a re-implementation of any of them.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAnalyticStore } from '../store/useAnalyticStore';
import { derive } from '../engine/derive';
import { buildScene, segKey } from '../render/scene';
import { Figure } from '../render/Figure';
import { measurablesOf } from '../app/measurable';
import { loadAnalyticSession } from '../app/loadSession';
import { dispatchRename, dispatchSwap } from '../app/rename';
import { segmentDisplayFaults, type InkSeen } from '../../shell/__tests__/fixtures/segment-display-rows';

const store = () => useAnalyticStore.getState();
const current = () => derive(store().lines, store().seed, store().seedNames);

function build(lines: string[]) {
  store().clearAll();
  for (const l of lines) store().recordLine(l);
  useAnalyticStore.temporal.getState().clear();
}

/** The scene id of the drawn segment between `a` and `b`. */
const sceneIdOf = (a: string, b: string): string | undefined => current().figure.segments.find((sg) => segKey(sg.ends) === segKey([a, b]))?.id;

function inkOf(a: string, b: string): InkSeen {
  const d = current();
  const scene = buildScene(d.figure, d.box, 600, 600, { segStyle: store().segStyle });
  const html = renderToStaticMarkup(<Figure scene={scene} onPick={() => {}} />);
  const id = sceneIdOf(a, b);
  if (!id) return 'absent';
  const m = html.match(new RegExp(`data-id="${id}" data-ink="(\\w+)"`));
  return (m?.[1] as InkSeen | undefined) ?? 'absent';
}

const subject = (lines: string[], a: string, b: string) => ({
  setup: () => build(lines),
  toggleHidden: () => store().toggleSegHidden(segKey([a, b])),
  toggleDashed: () => store().toggleSegDashed(segKey([a, b])),
  ink: () => inkOf(a, b),
  measurable: () => {
    const id = sceneIdOf(a, b);
    return !!id && measurablesOf(current().construction, { kind: 'segment', id }).length > 0;
  },
  statements: () => [...store().lines],
  undo: () => store().undo(),
  saveLoad: () => {
    const saved = JSON.parse(JSON.stringify(store().serialize()));
    store().clearAll();
    loadAnalyticSession(saved, 'file');
  },
});

beforeEach(() => {
  store().clearAll();
  useAnalyticStore.temporal.getState().clear();
});

describe('#1653 — the analytic builder conforms to the shared segment-display contract', () => {
  it.each([
    ['a triangle’s side', ['נתונה הנקודה A(2,6)', 'נתונה הנקודה B(8,2)', 'נתונה הנקודה C(4,10)', 'משולש ABC'], 'A', 'B'],
    ['a stated segment', ['A(0,0)', 'B(4,3)', 'הקטע AB'], 'A', 'B'],
  ])('%s', (_name, lines, a, b) => {
    expect(segmentDisplayFaults(subject(lines, a, b))).toEqual([]);
  });
});

describe('#1653 — the analytic segment display follows its letters and its session', () => {
  const TRI = ['נתונה הנקודה A(2,6)', 'נתונה הנקודה B(8,2)', 'נתונה הנקודה C(4,10)', 'משולש ABC'];
  const state = () => {
    const s = store();
    return { lines: s.lines, disabled: s.disabled, queries: s.queries, spokenFor: s.spokenFor, seed: s.seed, seedNames: s.seedNames, segStyle: s.segStyle };
  };

  it('a rename carries a hidden side to its new letter, and one undo puts both back', () => {
    build(TRI);
    store().toggleSegHidden(segKey(['A', 'B']));
    dispatchRename('A', 'D', state(), { applyRename: store().applyRename, setError: store().setError }, current());
    expect(store().lines.at(-1)).toBe('משולש DBC');
    expect(store().segStyle).toEqual({ [segKey(['D', 'B'])]: { hidden: true } });
    expect(inkOf('D', 'B')).toBe('ghost');
    store().undo();
    expect(store().segStyle).toEqual({ [segKey(['A', 'B'])]: { hidden: true } });
    expect(inkOf('A', 'B')).toBe('ghost');
  });

  it('a swap exchanges the styled sides with the letters', () => {
    build(TRI);
    store().toggleSegDashed(segKey(['A', 'B']));
    dispatchSwap('A', 'C', state(), { applySwap: store().applySwap, setError: store().setError }, current());
    expect(store().segStyle).toEqual({ [segKey(['C', 'B'])]: { dashed: true } });
  });

  it('«נקה הכל» clears the display choices with the figure', () => {
    build(TRI);
    store().toggleSegHidden(segKey(['A', 'B']));
    store().clearAll();
    expect(store().segStyle).toEqual({});
  });

  it('a hidden side is still answered by the ask lane path — its length menu is unchanged', () => {
    build(TRI);
    const id = sceneIdOf('A', 'B')!;
    const before = measurablesOf(current().construction, { kind: 'segment', id });
    store().toggleSegHidden(segKey(['A', 'B']));
    expect(measurablesOf(current().construction, { kind: 'segment', id })).toEqual(before);
  });

  it('a hand-edited save cannot inject anything but hidden/dashed flags', () => {
    loadAnalyticSession({ app: 'analytic-builder', version: 1, lines: ['A(0,0)'], seed: 0, segStyle: { 'A|B': { hidden: true, colour: 'red' }, 'B|C': 'x' } }, 'f');
    expect(store().segStyle).toEqual({ 'A|B': { hidden: true } });
  });
});
