/**
 * #1748 ([ADR-578](../../../docs/06-decisions.md#adr-578)) — re-typing an UNTICKED row's statement
 * re-enables the row, as the commit always did; the submit dry run now models the same list.
 *
 * Measured on c098af9b through the real submit path (`runSubmit`, LLM mocked) + the row's tick
 * (`runSetGroupEnabled`):
 *
 * ```
 * משולש ABC · M אמצע AB · untick the triangle · משולש ABC          -> refused «A, B, C is no longer available»
 * משולש ABC · untick · משולש ABC                                    -> refused the same way
 * קטע AB · untick · קטע AB                                          -> refused «A, B …»
 * משולש ABC · AM תיכון · untick the median · AM תיכון               -> refused «M …»
 * ריבוע ABCD · E נקודת חיתוך האלכסונים · untick E · the same line   -> refused «E …»
 * ```
 *
 * Root cause: `trialFacts` dropped a re-typed command only when it duplicated an ENABLED fact, so the trial
 * held the unticked fact (which claims its points in the fold, ADR-010) AND a fresh copy; the commit's
 * `foldFact` re-enables the twin. One shared rule (`foldCommand`) now decides both. A DIFFERENTLY spelled
 * statement over the unticked row's letters keeps the ADR-010 reservation and is refused naming the row.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...args: unknown[]) => llmParseMock(...args) }));

import i18n from '@/i18n';
import { humanizeError } from '@/i18n/humanizeError';
import { foldCommand, groupKey, replay, trialChanges, trialFacts, useGeoStore, type Fact } from '@/store/geoStore';
import { runSetGroupEnabled } from '@/app/editPipeline';
import { runSubmit, type SubmitDeps } from '@/app/submitPipeline';
import { parse } from '@/parser';
import type { AnyCommand } from '@/engine';
import { ctxOf } from '../../__tests__/scenario-pipeline';

const st = () => useGeoStore.getState();
const notes: string[] = [];

function deps(): SubmitDeps {
  return {
    t: (key, o) => (o ? `${key}:${JSON.stringify(o)}` : key),
    locale: 'he',
    ui: {
      setInputNote: (m) => { if (m) notes.push(m); },
      setRenameNote: () => {},
      setLlmDropped: () => {},
      clearText: () => {},
      setBusy: () => {},
    },
    view: () => {
      const s = st();
      const d = replay(s.facts, s.seed);
      return { construction: d.construction, positions: d.positions };
    },
    isBusy: () => false,
    nextPaint: async () => {},
    resolveAfterCommit: () => {},
    llmAbortRef: { current: null },
    explainError: (raw) => raw ?? '',
  };
}

const submit = async (...lines: string[]) => { for (const l of lines) await runSubmit(l, deps()); };
const untick = (u: string) => runSetGroupEnabled(groupKey(st().facts.find((f) => f.utterance === u)!), false, { resolveAfterCommit: () => {} });
const statuses = () => { const d = replay(st().facts, st().seed); return st().facts.map((f) => d.status[f.id]); };

beforeEach(() => {
  st().clear();
  notes.length = 0;
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ ok: false, reason: 'test: no live calls' });
});

describe('#1748 — an identical re-type re-enables the unticked row (the issue\'s four sequences)', () => {
  const SEQUENCES: { pre: string[]; row: string }[] = [
    { pre: ['משולש ABC', 'M אמצע AB'], row: 'משולש ABC' },
    { pre: ['משולש ABC'], row: 'משולש ABC' },
    { pre: ['קטע AB'], row: 'קטע AB' },
    { pre: ['משולש ABC', 'AM תיכון'], row: 'AM תיכון' },
    { pre: ['ריבוע ABCD', 'E נקודת חיתוך האלכסונים'], row: 'E נקודת חיתוך האלכסונים' },
  ];
  for (const { pre, row } of SEQUENCES) {
    it(`${pre.join(' · ')} · untick «${row}» · «${row}»`, async () => {
      await submit(...pre);
      const before = st().facts.length;
      untick(row);
      expect(st().facts.some((f) => !f.enabled), 'the row is unticked').toBe(true);
      notes.length = 0;
      await submit(row);
      expect(notes.join(' | '), 'no refusal note').toBe('');
      expect(st().facts.length, 'the twin is re-enabled, never stacked').toBe(before);
      expect(st().facts.every((f) => f.enabled), 'every row is ticked again').toBe(true);
      expect(statuses().every((s) => s === 'ok'), JSON.stringify(statuses())).toBe(true);
    });
  }
});

describe('#1748 — a differently spelled re-type over an unticked row is refused NAMING the row (ADR-010 kept)', () => {
  const he = (k: string, o?: Record<string, unknown>) => i18n.t(k, o) as string;
  for (const line of ['משולש ACB', 'משולש שווה שוקיים ABC']) {
    it(`«משולש ABC» · untick · «${line}»`, async () => {
      await submit('משולש ABC');
      untick('משולש ABC');
      notes.length = 0;
      await submit(line);
      expect(st().facts.map((f) => [f.utterance, f.enabled]), 'nothing committed; the row stays unticked').toEqual([['משולש ABC', false]]);
      expect(notes).toHaveLength(1);
      expect(notes[0]).toMatch(/belong to the unticked row «משולש ABC» — tick it again or delete it$/);
      const shown = humanizeError(notes[0], he).replace(/[\u2066-\u2069]/g, ''); // the bidi isolates are display
      expect(shown).toContain('שייכות לשורה המבוטלת «משולש ABC»');
      expect(shown).toContain('סמנו אותה שוב או מחקו אותה');
      expect(shown).not.toMatch(/כבר אינה זמינה/);
    });
  }

  it('re-ticking the row afterwards restores it (the reservation is what ADR-010 promises)', async () => {
    await submit('משולש ABC');
    untick('משולש ABC');
    await submit('משולש ACB');
    runSetGroupEnabled(groupKey(st().facts[0]), true, { resolveAfterCommit: () => {} });
    expect(statuses()).toEqual(['ok']);
  });
});

describe('#1748 — the shared fold rule: the trial IS the list the commit saves', () => {
  /** The commit's list with ids/groups/utterances dropped — what a dry run must model. */
  const shape = (facts: Fact[]) => facts.map((f) => ({ cmd: f.cmd, enabled: f.enabled }));
  const cmdsOf = (line: string, facts: Fact[]): AnyCommand[] => {
    const r = parse(line, ctxOf(facts));
    expect(r.ok, line).toBe(true);
    return r.ok ? r.commands : [];
  };

  it('foldCommand: an unticked twin is re-enabled in place; an enabled twin is a no-op (same array)', () => {
    const tri: AnyCommand = { type: 'triangle', ids: ['A', 'B', 'C'] };
    const mint = (cmd: AnyCommand): Fact => ({ id: 'new', enabled: true, cmd });
    const on: Fact[] = [{ id: 'f1', enabled: true, cmd: tri }];
    expect(foldCommand(on, tri, mint)).toBe(on);
    const off: Fact[] = [{ id: 'f1', enabled: false, cmd: tri }];
    const re = foldCommand(off, tri, mint);
    expect(re).toEqual([{ id: 'f1', enabled: true, cmd: tri }]);
    expect(trialChanges(off, re), 'the re-enabled twin is the step\'s change').toEqual([re[0]]);
    expect(trialChanges(on, foldCommand(on, tri, mint)), 'a no-op changes nothing').toEqual([]);
  });

  it('trialFacts over an unticked twin equals the committed list (same commands, same ticks)', async () => {
    await submit('משולש ABC', 'M אמצע AB');
    untick('משולש ABC');
    const prior = st().facts;
    const trial = trialFacts(prior, cmdsOf('משולש ABC', prior));
    await submit('משולש ABC');
    expect(shape(trial)).toEqual(shape(st().facts));
    expect(trialChanges(prior, trial).map((f) => f.cmd.type), 'the trial judges the re-enabled triangle').toEqual(['triangle']);
  });

  it('a command repeated inside ONE step folds once in the trial, as in the commit', () => {
    const seg: AnyCommand = { type: 'segment', a: 'A', b: 'B' };
    expect(trialFacts([], [seg, seg])).toHaveLength(1);
  });
});
