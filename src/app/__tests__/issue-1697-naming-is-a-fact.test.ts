/**
 * #1697 ([ADR-588](../../../docs/06-decisions.md#adr-588)) — A NAMING BY USE IS A FACT OF THE LINE THAT MADE IT.
 *
 * Operator report (2026-10-03, playing PR #1695 T4): «נקודה C על מעגל P» names the second circle P; "if i erase this
 * line, the P still stays there and it should be removed … it was created by the line so erasing the line should
 * remove it". The naming was a store RENAME applied beside the line's commit, so it belonged to no line.
 *
 * Every case runs through the REAL submit pipeline (`runSubmit`, the model mocked and never asked — standing rule 2)
 * and then the store's own delete / undo / mute / edit / save-load paths, and reads the replayed figure.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn(async () => ({ built: [], dropped: [] }));
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...(a as [])) }));

import { runSubmit, type SubmitDeps } from '../submitPipeline';
import { runEditCommit } from '../editPipeline';
import { groupKey, replay, useGeoStore, type Fact } from '@/store/geoStore';
import { deserializeFigure, serializeFigure } from '@/store/figureFile';
import { auditLoadedFigure, refreshLoadedFigure } from '@/store/loadAudit';

const st = () => useGeoStore.getState();
const notes: string[] = [];
const deps: SubmitDeps = {
  t: (k, o) => (o ? `${k}:${JSON.stringify(o)}` : k),
  locale: 'he',
  ui: { setInputNote: (m) => { if (m) notes.push(m); }, setRenameNote: (m) => { if (m) notes.push(m); }, setLlmDropped: () => {}, clearText: () => {}, setBusy: () => {} },
  view: () => {
    const d = replay(st().facts, st().seed);
    return { construction: d.construction, positions: d.positions };
  },
  isBusy: () => false,
  nextPaint: async () => {},
  resolveAfterCommit: () => {},
  llmAbortRef: { current: null },
  explainError: (r) => `explain:${r}`,
};
async function type(...lines: string[]) {
  for (const l of lines) await runSubmit(l, deps);
}
const fig = (facts: Fact[] = st().facts) => replay(facts, st().seed);
/** The circles as drawn: `id@centre`, the hidden (anonymous) centres as `@ctr-…`. */
const circles = (facts?: Fact[]) =>
  fig(facts)
    .construction.objects.filter((o) => o.kind === 'circle')
    .map((o) => `${o.id}@${(o as unknown as { center: string }).center}`)
    .sort();
const groupOf = (utterance: string) => {
  const f = st().facts.find((x) => x.utterance === utterance);
  expect(f, `the row «${utterance}»`).toBeDefined();
  return groupKey(f!);
};
const hasPoint = (id: string) => fig().positions.has(id);

const PAIR = 'שני מעגלים נחתכים בנקודות A ו B';
const NAMES_P = 'נקודה C על מעגל P';
const DIAMETER = 'AB קוטר';
const NAMES_K = 'C על מעגל K';

beforeEach(() => {
  st().clear();
  useGeoStore.temporal.getState().clear();
  notes.length = 0;
  llmParseMock.mockClear();
});

describe('#1697 — erasing the line that named a circle takes the name with it', () => {
  it('the operator’s sequence: «נקודה C על מעגל P» names a circle of a fresh pair; erasing the line un-names it', async () => {
    await type(PAIR, NAMES_P);
    expect(circles()).toContain('circle-P@P');
    // the naming is a fact IN the line's group, not a rewrite of the first line
    const line2 = st().facts.filter((f) => groupKey(f) === groupOf(NAMES_P));
    expect(line2.some((f) => f.cmd.type === 'name-by-use'), 'the naming is owned by the line').toBe(true);
    expect(st().facts.filter((f) => f.utterance === PAIR).every((f) => !JSON.stringify(f.cmd).includes('"P"')), 'the first line is stored as typed').toBe(true);
    st().removeGroup(groupOf(NAMES_P));
    expect(circles()).toEqual(['circle-O@@ctr-O', 'circle-P@@ctr-P']); // both unnamed again, as after line 1
    expect(hasPoint('P')).toBe(false);
  });

  it('prod’s own row (since ADR-347): «AB קוטר» · «C על מעגל K» — erasing the line un-names K', async () => {
    await type(DIAMETER, NAMES_K);
    expect(circles()).toEqual(['circle-K@K']);
    st().removeGroup(groupOf(NAMES_K));
    expect(circles()).toEqual(['circle-O@@ctr-O']);
    expect(hasPoint('K')).toBe(false);
  });

  it('undo removes the name with the line, and redo restores both', async () => {
    await type(DIAMETER, NAMES_K);
    st().undo();
    expect(circles()).toEqual(['circle-O@@ctr-O']);
    st().redo();
    expect(circles()).toEqual(['circle-K@K']);
  });

  it('muting the line un-names the circle; ticking it back names it again', async () => {
    await type(DIAMETER, NAMES_K);
    const key = groupOf(NAMES_K);
    st().setGroupEnabled(key, false);
    expect(circles()).toEqual(['circle-O@@ctr-O']);
    st().setGroupEnabled(key, true);
    expect(circles()).toEqual(['circle-K@K']);
  });

  it('editing the line to another name renames; editing the name away un-names', async () => {
    await type(DIAMETER, NAMES_K);
    expect(runEditCommit(groupOf(NAMES_K), 'C על מעגל L', { t: (k) => k, setInputNote: () => {}, resolveAfterCommit: () => {} })).toBe(true);
    expect(circles()).toEqual(['circle-L@L']);
    expect(runEditCommit(groupOf('C על מעגל L'), 'C על המעגל', { t: (k) => k, setInputNote: () => {}, resolveAfterCommit: () => {} })).toBe(true);
    expect(circles()).toEqual(['circle-O@@ctr-O']);
    expect(fig().status[st().facts[st().facts.length - 1].id]).toBe('ok');
  });

  it('a name never leaks backwards: replaying the lines BEFORE the naming line shows no name', async () => {
    await type(DIAMETER, NAMES_K, 'D על מעגל K');
    const start = st().facts.findIndex((f) => f.utterance === NAMES_K);
    expect(circles(st().facts.slice(0, start))).toEqual(['circle-O@@ctr-O']);
    expect(circles()).toEqual(['circle-K@K']);
  });

  it('a later line that uses the name fails honestly once the naming line is erased — it never re-mints K', async () => {
    await type(DIAMETER, NAMES_K, 'D על מעגל K');
    st().removeGroup(groupOf(NAMES_K));
    const later = st().facts.find((f) => f.utterance === 'D על מעגל K')!;
    expect(fig().status[later.id]).not.toBe('ok');
    expect(circles()).toEqual(['circle-O@@ctr-O']);
  });

  it('save → load round-trips the naming as the line’s fact: the load refresh keeps it, the audit is silent, erase still un-names', async () => {
    await type(PAIR, NAMES_P);
    const loaded = deserializeFigure(serializeFigure({ facts: st().facts, seed: st().seed }));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const { facts } = loaded.file;
    expect(refreshLoadedFigure(facts).refreshed).toEqual([]);
    expect(auditLoadedFigure(facts).findings).toEqual([]);
    st().loadFigure(loaded.file);
    expect(circles()).toContain('circle-P@P');
    st().removeGroup(groupOf(NAMES_P));
    expect(circles()).toEqual(['circle-O@@ctr-O', 'circle-P@@ctr-P']);
  });
});

describe('#1697 — the class: every naming by use is the line’s, and a line that commits nothing names nothing', () => {
  it('a REFUSED line names nothing (it used to rename the circle K and then refuse)', async () => {
    await type(DIAMETER, 'AB = 6');
    const before = st().facts;
    await type('רדיוס מעגל K הוא 5');
    expect(notes.join(' ')).toMatch(/over-constrained/);
    expect(st().facts).toBe(before);
    expect(circles()).toEqual(['circle-O@@ctr-O']);
  });

  it('a line whose only effect is the naming («A על מעגל K», A already on it) is a row that owns the name', async () => {
    await type(DIAMETER, 'A על מעגל K');
    expect(circles()).toEqual(['circle-K@K']);
    st().removeGroup(groupOf('A על מעגל K'));
    expect(circles()).toEqual(['circle-O@@ctr-O']);
  });

  it('the #539 POINT naming: «ישר A O1 E O2 C» names the auto-named touch E; erasing the line gives the touch back its own letter', async () => {
    await type('שני מעגלים משיקים מבחוץ', 'היקף מעגל O1 הוא 6π', 'שטח מעגל O2 הוא 81π', 'A על מעגל O1', 'AD משיק למעגל O2 בנקודה D', 'B על המשך AD', 'BC משיק למעגל O2 בנקודה C');
    expect(hasPoint('M')).toBe(true);
    await type('ישר A O1 E O2 C');
    expect(st().facts.some((f) => f.cmd.type === 'name-by-use' && f.cmd.op === 'point' && f.cmd.from === 'M' && f.cmd.to === 'E')).toBe(true);
    expect(hasPoint('E')).toBe(true);
    expect(hasPoint('M')).toBe(false);
    st().removeGroup(groupOf('ישר A O1 E O2 C'));
    expect(hasPoint('M')).toBe(true);
    expect(hasPoint('E')).toBe(false);
  });

  it('an explicit relabel after a naming by use reads the figure the student sees («שנה שם P ל-X»)', async () => {
    await type(PAIR, NAMES_P);
    await type('שנה שם P ל-X');
    expect(circles()).toContain('circle-X@X');
    expect(circles()).not.toContain('circle-P@P');
  });
});
