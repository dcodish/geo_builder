/**
 * #1952 ([ADR-625](../../../docs/06-decisions.md#adr-625)) — unticking a row must drop only its OWN
 * objects: a row below it that declares the letters itself keeps building, exactly as DELETING the row
 * leaves it building. Untick and delete must not disagree about the same figure.
 *
 * The operator, playing round #1940 T11: *"on same test, after the 2nd line is there, i remove the first
 * line (the square) and get an error. there is no error. this is a bug."*
 *
 * Measured on `06fc51dd` through the real store path (`runSubmit` with the LLM mocked →
 * `runSetGroupEnabled` / `removeGroup` → `replay`):
 *
 * ```
 * ריבוע ABCD · משולש ABC · untick the square -> «can't build: A, B, C belong to the unticked row …»; figure EMPTY
 *                          delete the square -> the triangle ok, A B C drawn
 * משולש ABC · ריבוע ABCD · untick the triangle -> the same refusal          (delete: the square ok)
 * משולש ABC · AB = 5     · untick the triangle -> the same refusal          (delete: both rows ok, A B drawn)
 * משולש ABC · AM תיכון   · untick the triangle -> «A belong to the unticked row …» (delete: «M is no longer available»)
 * ```
 *
 * Root cause: a disabled fact claimed every point it introduced in the fold (ADR-010/015, read back by
 * ADR-578's `mutedOwnerOf`), so the fold's `broken` cascade fired on a row that needs no earlier
 * definition at all. The reservation is a COMMIT-SEAM rule — a NEW differently-spelled row taking an
 * unticked row's letters would make re-ticking it conflict (#1748) — and it now lives only there
 * (`mutedRowHolding`, read by `dryRunOutcome`). The fold reserves nothing; the cascade muting MUST
 * produce still arrives through the muted row's own red riders.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...args: unknown[]) => llmParseMock(...args) }));

import i18n from '@/i18n';
import { humanizeError } from '@/i18n/humanizeError';
import { groupKey, mutedRowHolding, replay, trialFacts, useGeoStore } from '@/store/geoStore';
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
const rowOf = (u: string) => st().facts.find((f) => f.utterance === u)!;
const untick = (u: string) => runSetGroupEnabled(groupKey(rowOf(u)), false, { resolveAfterCommit: () => {} });
const retick = (u: string) => runSetGroupEnabled(groupKey(rowOf(u)), true, { resolveAfterCommit: () => {} });
const del = (u: string) => st().removeGroup(groupKey(rowOf(u)));
const fig = () => replay(st().facts, st().seed);
/** What a student SEES of the rows that are still ticked, plus the points drawn — the one comparable
 *  shape for "untick says the same as delete" (the unticked row itself has no delete counterpart). */
const shown = () => {
  const d = fig();
  return {
    rows: st().facts.filter((f) => f.enabled).map((f) => `${f.utterance} => ${d.status[f.id]}`),
    points: [...d.positions.keys()].sort().join(''),
    violations: d.violations.map((v) => `${v.relation} ${v.ids.join('')}`),
  };
};

beforeEach(() => {
  st().clear();
  notes.length = 0;
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ ok: false, reason: 'test: no live calls' });
});

describe("#1952 — the operator's exact interaction: untick the square, the triangle stands on its own", () => {
  it('«ריבוע ABCD» · «משולש ABC» · untick the square → the triangle builds green and verifies', async () => {
    await submit('ריבוע ABCD', 'משולש ABC');
    untick('ריבוע ABCD');
    const d = fig();
    expect(d.status[rowOf('ריבוע ABCD').id], 'the square is the only row that is off').toBe('disabled');
    expect(d.status[rowOf('משולש ABC').id], JSON.stringify(d.status)).toBe('ok');
    expect(d.lastError, 'no error banner').toBe(null);
    expect(d.violations, 'the givens verifier is clean').toEqual([]);
    expect([...d.positions.keys()].sort().join(''), 'the triangle is drawn').toBe('ABC');
  });

  it('re-ticking the square brings the figure back EXACTLY (ADR-010 reversibility)', async () => {
    await submit('ריבוע ABCD', 'משולש ABC');
    const at = (d: ReturnType<typeof fig>) =>
      [...d.positions].map(([k, p]) => `${k}:${p.x.toFixed(6)},${p.y.toFixed(6)}`).sort().join(' ');
    const before = at(fig());
    untick('ריבוע ABCD');
    retick('ריבוע ABCD');
    const after = fig();
    expect(at(after)).toBe(before);
    expect(st().facts.map((f) => after.status[f.id])).toEqual(['ok', 'ok']);
  });
});

/**
 * THE CLASS, stated as the measurement that defines it (rule 7 `[2-D]`): whatever a student sees after
 * DELETING a row, they see after UNTICKING it. Deletion is the 2-D reference, measured right here in the
 * same run — so this stays a parity assertion rather than a frozen transcript.
 */
describe('#1952 — untick says exactly what delete says (every row that is still ticked)', () => {
  const SEQUENCES: { name: string; pre: string[]; target: string }[] = [
    { name: 'the square under a triangle that re-declares A B C', pre: ['ריבוע ABCD', 'משולש ABC'], target: 'ריבוע ABCD' },
    { name: 'the triangle under a square that re-declares A B C', pre: ['משולש ABC', 'ריבוע ABCD'], target: 'משולש ABC' },
    { name: 'the triangle under a side length that re-declares A B', pre: ['משולש ABC', 'AB = 5'], target: 'משולש ABC' },
    { name: 'the triangle under a midpoint that CANNOT stand alone', pre: ['משולש ABC', 'D אמצע BC'], target: 'משולש ABC' },
    { name: 'the triangle under a median that cannot stand alone', pre: ['משולש ABC', 'AM תיכון'], target: 'משולש ABC' },
    { name: 'a circle under its rider and the rider\'s own dependent (ADR-015 cascade)', pre: ['מעגל O', 'נקודה P על מעגל O', 'קטע PQ'], target: 'מעגל O' },
  ];
  for (const { name, pre, target } of SEQUENCES) {
    it(`${name}`, async () => {
      await submit(...pre);
      untick(target);
      const unticked = shown();
      st().clear();
      notes.length = 0;
      await submit(...pre);
      del(target);
      expect(unticked, `untick «${target}» vs delete it`).toEqual(shown());
    });
  }
});

describe('#1952 — the reservation survives where it belongs: the commit seam (#1748, ADR-578)', () => {
  const he = (k: string, o?: Record<string, unknown>) => i18n.t(k, o) as string;

  for (const line of ['משולש ACB', 'משולש שווה שוקיים ABC']) {
    it(`a NEW differently spelled row over an unticked row's letters is still refused: «${line}»`, async () => {
      await submit('משולש ABC');
      untick('משולש ABC');
      notes.length = 0;
      await submit(line);
      expect(st().facts.map((f) => [f.utterance, f.enabled]), 'nothing committed; the row stays unticked').toEqual([['משולש ABC', false]]);
      expect(notes).toHaveLength(1);
      expect(notes[0]).toMatch(/belong to the unticked row «משולש ABC» — tick it again or delete it$/);
      const text = humanizeError(notes[0], he).replace(/[⁦-⁩]/g, ''); // the bidi isolates are display
      expect(text).toContain('שייכות לשורה המבוטלת «משולש ABC»');
      expect(text).toContain('סמנו אותה שוב או מחקו אותה');
    });
  }

  it('an IDENTICAL re-type still re-enables the row rather than being refused', async () => {
    await submit('משולש ABC', 'M אמצע AB');
    untick('משולש ABC');
    notes.length = 0;
    await submit('משולש ABC');
    expect(notes.join(' | '), 'no refusal note').toBe('');
    expect(st().facts.every((f) => f.enabled), 'every row is ticked again').toBe(true);
  });

  it('letters an ENABLED row defines are free — the unticked twin reserves nothing of them', async () => {
    await submit('משולש ABC', 'ריבוע ABCD');
    untick('משולש ABC');
    notes.length = 0;
    await submit('משולש ACB');
    expect(notes.join(' | '), 'the square defines A, B, C — no muted-row refusal').not.toMatch(/unticked row/);
  });
});

describe('#1952 — `mutedRowHolding`: the rule, once, at the seam', () => {
  const cmdsOf = (line: string) => {
    const r = parse(line, ctxOf(st().facts));
    expect(r.ok, line).toBe(true);
    return r.ok ? r.commands : ([] as AnyCommand[]);
  };

  it('names the unticked row that introduced the letters a NEW row would take', async () => {
    await submit('ריבוע ABCD');
    untick('ריבוע ABCD');
    const facts = st().facts;
    const all = trialFacts(facts, cmdsOf('מרובע ADCB'));
    expect(mutedRowHolding(facts, all, replay(facts, st().seed).construction)).toEqual({ ids: ['A', 'D', 'C', 'B'], utterance: 'ריבוע ABCD' });
  });

  it('answers null when the fold changed nothing, and for a re-enable in place', async () => {
    await submit('משולש ABC');
    untick('משולש ABC');
    const facts = st().facts;
    const before = replay(facts, st().seed).construction;
    expect(mutedRowHolding(facts, facts, before), 'nothing changed').toBe(null);
    const reenabled = trialFacts(facts, cmdsOf('משולש ABC'));
    expect(mutedRowHolding(facts, reenabled, before), 'the step re-enables its own twin').toBe(null);
  });
});
