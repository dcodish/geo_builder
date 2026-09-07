/**
 * #926 (ADR-483, ADR-W-044) — a value whose defining row is deleted, muted or edited away is a FACT IN
 * ERROR, never a green ✓ that constrains nothing.
 *
 * Measured at the pre-fix HEAD (`82d87c6`, 2026-09-07):
 *
 *   משולש ABC · ∠ABC = α · α = 70            → labels.angles [{B, A, C, "70°"}]         ✔
 *   drop «∠ABC = α», keep «α = 70»            → status ok / ok, lastError null, labels.angles []
 *
 * `set-var` lowers to NOTHING, so nothing downstream could notice that its letter had no owner: the
 * symbol table simply carried a value nobody read. The fold now asks `isSymbolBound` (one predicate,
 * next to the table it reads) and stamps the row into the same register as a point whose defining step
 * is gone; the ✎ seam, which returns `true` for a committed edit, names the rows the edit orphaned. The
 * whole-list table is position-independent, so a definition re-added AFTER the value row binds it again
 * with no retyping (the armed ruling).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { factsOf, replayFacts } from './scenario-pipeline';
import { runEditCommit, type EditDeps } from '@/app/editPipeline';
import { groupKey, replay, useGeoStore } from '@/store/geoStore';
import { buildParseCtx, parse } from '@/parser';
import { humanizeError } from '@/i18n/humanizeError';
import { dryRunOutcome } from '@/replay/core';

const UNBOUND = /^variable (\S+) is not defined by any statement/;

describe('#926 — the fold: a set-var whose letter nothing binds is a fact in error', () => {
  it('the operator\'s sequence: dropping «∠ABC = α» turns «α = 70» red and the banner names it', () => {
    const facts = factsOf(['משולש ABC', '∠ABC = α', 'α = 70']);
    const before = replayFacts(facts);
    expect(before.labels.angles.map((a) => a.text)).toEqual(['70°']);
    for (const f of facts) expect(before.status[f.id]).toBe('ok');

    const dropped = facts.filter((f) => f.utterance !== '∠ABC = α');
    const fig = replayFacts(dropped);
    const value = dropped.find((f) => f.utterance === 'α = 70')!;
    expect(fig.status[value.id]).toMatch(UNBOUND);
    expect(fig.status[value.id]).toContain('variable α');
    // ADR-104's register, not a contradiction: the row is marked with its reason and the figure-level cue
    // reads "recorded, not yet in effect" — no hard error banner, because the same state is reachable
    // honestly by typing the value FIRST (below).
    expect(fig.lastError).toBeNull();
    expect(fig.pending).toBe(true);
    expect(fig.labels.angles, 'the figure does not pretend the value applies').toEqual([]);
  });

  it('typing the value FIRST is still accepted (data the student may state early) — marked, not refused, then bound', () => {
    const early = factsOf(['משולש ABC', 'x = 4']);
    const outcome = dryRunOutcome([early[0]], [early[1].cmd]);
    expect(outcome.produced, 'the submit dry-run commits a lone value as data-only').toBe(true);
    const fig = replayFacts(early);
    expect(fig.status[early[1].id], 'the row says the letter is not (yet) defined').toMatch(UNBOUND);
    expect(fig.pending).toBe(true);
    expect(fig.lastError).toBeNull();
    const bound = factsOf(['משולש ABC', 'x = 4', 'AB = x']);
    const fig2 = replayFacts(bound);
    for (const f of bound) expect(fig2.status[f.id], f.utterance).toBe('ok');
    expect(fig2.pending).toBe(false);
  });

  it('muting the definition is the same class', () => {
    const facts = factsOf(['משולש ABC', '∠ABC = α', 'α = 70']).map((f) => (f.utterance === '∠ABC = α' ? { ...f, enabled: false } : f));
    const fig = replayFacts(facts);
    expect(fig.status[facts[1].id]).toBe('disabled');
    expect(fig.status[facts[2].id]).toMatch(UNBOUND);
  });

  it('the length lane: «x = 4» after «AB = x» is gone', () => {
    const facts = factsOf(['משולש ABC', 'AB = x', 'x = 4']).filter((f) => f.utterance !== 'AB = x');
    const fig = replayFacts(facts);
    expect(fig.status[facts[1].id]).toMatch(/variable x is not defined/);
  });

  it('re-adding the definition AFTER the value row binds it again — no retyping (the armed ruling)', () => {
    const facts = factsOf(['משולש ABC', 'α = 70', '∠ABC = α']);
    const fig = replayFacts(facts);
    for (const f of facts) expect(fig.status[f.id], f.utterance).toBe('ok');
    expect(fig.lastError).toBeNull();
    expect(fig.labels.angles.map((a) => a.text)).toEqual(['70°']);
  });

  it('unchanged guard: a valued letter with its definition present is exactly as before', () => {
    const facts = factsOf(['משולש ABC', 'AB = 3x', 'AC = x', 'x = 4', '∠BAC = α', 'α = 70']);
    const fig = replayFacts(facts);
    for (const f of facts) expect(fig.status[f.id], f.utterance).toBe('ok');
    expect(fig.lastError).toBeNull();
  });

  it('the message reaches the student translated, naming the letter and nothing internal', () => {
    const t = (key: string, opts?: Record<string, unknown>) => `${key}:${JSON.stringify(opts ?? {})}`;
    expect(humanizeError('variable α is not defined by any statement (the step that defined it was removed, muted or failed)', t)).toBe('errors.unboundVariable:{"name":"α"}');
  });
});

describe('#926 — the ✎ edit seam is not a bare success when it orphans a row', () => {
  function makeDeps() {
    const notes: string[] = [];
    const deps: EditDeps = {
      t: (key, opts) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
      setInputNote: (m) => notes.push(m),
    };
    return { deps, notes };
  }
  function submitStep(utterance: string): string {
    const st = useGeoStore.getState();
    const view = replay(st.facts, st.seed);
    const r = parse(utterance, buildParseCtx(view.construction, view.positions));
    expect(r.ok, `precondition: «${utterance}» must parse`).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    useGeoStore.getState().executeMany(r.commands, utterance);
    const facts = useGeoStore.getState().facts;
    return groupKey(facts[facts.length - 1]);
  }
  const statusOf = (utterance: string) => {
    const st = useGeoStore.getState();
    const f = st.facts.find((x) => x.utterance === utterance)!;
    return replay(st.facts, st.seed).status[f.id];
  };

  beforeEach(() => useGeoStore.getState().clear());

  it('editing «∠ABC = α» to «∠ABC = 40» commits (true) and the note names «α = 70»', () => {
    submitStep('משולש ABC');
    const key = submitStep('∠ABC = α');
    submitStep('α = 70');
    const { deps, notes } = makeDeps();

    expect(runEditCommit(key, '∠ABC = 40', deps)).toBe(true);

    // (a step may lower to several facts sharing one utterance — compare the distinct wording, in order)
    expect([...new Set(useGeoStore.getState().facts.map((f) => f.utterance))]).toEqual(['משולש ABC', '∠ABC = 40', 'α = 70']);
    expect(notes.at(-1)).toMatch(/^steps\.editBrokeDependents/);
    expect(notes.at(-1)).toContain('«α = 70»');
    expect(statusOf('α = 70')).toMatch(UNBOUND);
  });

  it('editing it back restores the value and clears the note', () => {
    submitStep('משולש ABC');
    const key = submitStep('∠ABC = α');
    submitStep('α = 70');
    const { deps, notes } = makeDeps();
    runEditCommit(key, '∠ABC = 40', deps);
    const edited = groupKey(useGeoStore.getState().facts[1]);
    expect(runEditCommit(edited, '∠ABC = α', deps)).toBe(true);
    expect(notes.at(-1)).toBe('');
    expect(statusOf('α = 70')).toBe('ok');
  });

  it('unchanged guard: an edit that orphans nothing keeps the empty note', () => {
    submitStep('משולש ABC');
    submitStep('∠ABC = α');
    submitStep('α = 70');
    const key = submitStep('AB = 5');
    const { deps, notes } = makeDeps();
    expect(runEditCommit(key, 'AB = 6', deps)).toBe(true);
    expect(notes.at(-1)).toBe('');
    expect(statusOf('α = 70')).toBe('ok');
  });
});
