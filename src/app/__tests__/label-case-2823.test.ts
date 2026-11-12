/**
 * #2823 ([ADR-828](../../../docs/06-decisions.md#adr-828), ADR-W-208; the operator's rulings of 2026-11-10 and
 * 2026-11-12) — 2-D reads a lowercase letter that can only be a point in capitals, before the parse, and says so;
 * every other lowercase label keeps the ask.
 *
 * Measured at b9f8b916 through `decideDeterministic2D`: every line below was refused with «שמות נקודות נכתבים באות
 * לטינית גדולה. נסו: …», the certain ones included.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/parser/llm', () => ({ llmParse: async () => null }));

import { decideDeterministic2D, labelCaseFold2D } from '../decideDeterministic';
import { commitVerdict } from '../submitPipeline';
import { runEditCommit, type EditDeps } from '../editPipeline';
import { groupKey, replay, useGeoStore } from '@/store/geoStore';
import { LABEL_CASE_ASK, LABEL_CASE_NOTICE } from '../../../shell/labelCase';

const st = () => useGeoStore.getState();

async function submit(line: string) {
  const f = replay(st().facts, st().seed);
  const v = await decideDeterministic2D({ facts: st().facts, seed: st().seed, view: { construction: f.construction, positions: f.positions } }, line, /[א-ת]/.test(line) ? 'he' : 'en');
  if (v.kind === 'commit' || v.kind === 'noop') commitVerdict(v, 'note' in v && v.note && 'key' in v.note && v.note.key === LABEL_CASE_NOTICE ? String(v.note.params?.corrected) : line);
  return v;
}
const lastRow = () => st().facts[st().facts.length - 1]?.utterance;
const noteKey = (v: Awaited<ReturnType<typeof submit>>) => ('note' in v && v.note && 'key' in v.note ? v.note.key : null);

beforeEach(() => st().clear());

describe('#2823 — a certain lowercase label commits in capitals, with the notice', () => {
  it.each([
    [[], 'נקודה j', 'נקודה J'],
    [[], 'נקודה x', 'נקודה X'], // the operator's 2026-11-12 ruling
    [[], 'משולש abc', 'משולש ABC'],
    [[], 'point j', 'point J'],
    [['משולש ABC'], 'm אמצע AB', 'M אמצע AB'],
    [['משולש ABC'], 'x אמצע AB', 'X אמצע AB'], // #1594: an axis is never a midpoint
    [['משולש ABC'], '∠abc = 40', '∠ABC = 40'],
  ] as const)('%j · «%s» → «%s»', async (before, line, row) => {
    for (const l of before) await submit(l);
    const v = await submit(line);
    expect(v.kind, line).toBe('commit');
    expect(noteKey(v)).toBe(LABEL_CASE_NOTICE);
    if (v.kind === 'commit' && v.note && 'key' in v.note) expect(v.note.params?.corrected).toBe(row);
    expect(lastRow()).toBe(row);
  });

  it('a certain run beside an uncertain one keeps the whole line on the ask («∠abc = x»)', async () => {
    await submit('משולש ABC');
    const v = await submit('∠abc = x');
    // «x» after «=» stands in no certain slot, so nothing is read in capitals and nothing silently
    expect(v.kind).toBe('refuse');
  });
});

describe('#2823 — never certain: the ask, as before', () => {
  it('«d על AB» after a triangle is asked in capitals', async () => {
    await submit('משולש ABC');
    const v = await submit('d על AB');
    expect(v.kind).toBe('refuse');
    expect(noteKey(v)).toBe(LABEL_CASE_ASK);
  });

  it('a mixed line («נקודה d על ab») is asked whole', async () => {
    await submit('משולש ABC');
    const v = await submit('נקודה d על ab');
    expect(v.kind).toBe('refuse');
    if (v.kind === 'refuse' && 'key' in v.note) expect(v.note.params?.corrected).toBe('נקודה D על AB');
  });

  it('a letter the figure already uses as a measure is never folded («AB = b» · «נקודה b»)', async () => {
    await submit('משולש ABC');
    await submit('AB = b');
    expect(labelCaseFold2D('נקודה b', st().facts)).toBeNull();
    expect(labelCaseFold2D('נקודה d', st().facts)?.text).toBe('נקודה D');
  });

  it('the ADR-404 measure rows are unchanged: «שרדיוסו r», «AB = b», «זוית B=b»', async () => {
    for (const line of ['מעגל O שרדיוסו r', 'AB = b', 'זוית B=b']) expect(labelCaseFold2D(line, []), line).toBeNull();
  });
});

describe('#2823 — the edit seam reads it the same way', () => {
  it('an edited row typed in lowercase is stored in capitals and says so', async () => {
    await submit('משולש ABC');
    await submit('M אמצע AB');
    const notes: string[] = [];
    const deps: EditDeps = { t: (key, opts) => (opts ? `${key}:${JSON.stringify(opts)}` : key), setInputNote: (m) => notes.push(m), resolveAfterCommit: () => undefined };
    const key = groupKey(st().facts[st().facts.length - 1]);
    expect(runEditCommit(key, 'n אמצע AB', deps)).toBe(true);
    expect(lastRow()).toBe('N אמצע AB');
    expect(notes.at(-1)).toContain(LABEL_CASE_NOTICE);
  });
});
