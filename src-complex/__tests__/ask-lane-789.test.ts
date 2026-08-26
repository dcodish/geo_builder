/**
 * #789 — THE ASK LANE: a question is never a fact (ADR-3D-057 arriving in complex).
 *
 * The operator's report (2026-08-26): «the complex data panel doesn't have an input box — when I
 * want to see the area of Oz1z2 I have nowhere to enter that». Ruling: the ask box lives in the
 * DATA PANEL; Cut B — questions move OUT of the fact list into their own lane, saved with the
 * file, answered against the current figure by the stage-5d knowledge machinery.
 *
 * Driven through the real entry points (the #658 lesson): the store lane, the submit router, the
 * hydration migration of old files, the fold, and the panel's row model.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { askRowsOf } from '../app/askLane';
import { deriveLines } from '../app/deriveLines';
import { hydrateSession, readAsk, submitLine, submitQuery } from '../app/submit';
import { useComplexStore } from '../store/useComplexStore';

const store = () => useComplexStore.getState();

describe('readAsk — how a line reads as a question', () => {
  it.each([
    ['שטח Oz1z2', 'measure'],
    ['area Oz1z2', 'measure'],
    ['|z1-z2|', 'expr'],
  ] as const)('«%s» is a %s ask', (line, kind) => {
    expect(readAsk(line).kind).toBe(kind);
  });

  it('a GIVEN is a statement, not a question — with or without a value', () => {
    expect(readAsk('שטח Oz1z2 = 6').kind).toBe('statement'); // the equating word makes it state
    expect(readAsk('z1 = 3+4i').kind).toBe('statement');
    expect(readAsk('z2').kind).toBe('statement'); // a declaration states existence
  });

  it('a line the grammar cannot read is unreadable', () => {
    expect(readAsk('שורה שאיננה שאלה ואיננה נתון כלל וכלל').kind).toBe('unreadable');
  });
});

describe('the store lane', () => {
  beforeEach(() => store().clearAll());

  it('adds, dedupes, removes', () => {
    expect(submitQuery('שטח Oz1z2')).toBe(true);
    expect(submitQuery('שטח Oz1z2')).toBe(true); // accepted, but the lane holds it once
    expect(store().queries).toEqual(['שטח Oz1z2']);
    store().addQuery('|z1-z2|');
    store().removeQuery(0);
    expect(store().queries).toEqual(['|z1-z2|']);
  });

  it('a QUESTION typed in the givens box routes to the lane — never recorded as a fact', () => {
    expect(submitLine('z1 = 4')).toBe(true);
    expect(submitLine('שטח Oz1z2')).toBe(true);
    expect(store().lines).toEqual(['z1 = 4']);
    expect(store().queries).toEqual(['שטח Oz1z2']);
    expect(store().lastError).toBeNull();
  });

  it('serialize carries the lane; clearAll empties it', () => {
    submitQuery('שטח Oz1z2');
    expect(store().serialize().queries).toEqual(['שטח Oz1z2']);
    store().clearAll();
    expect(store().queries).toEqual([]);
    expect(store().serialize().queries).toBeUndefined();
  });
});

describe('hydration — old files migrate, new files restore', () => {
  beforeEach(() => store().clearAll());

  it('a v1 file with ask LINES in the fact list migrates them to the lane, audit clean', () => {
    const ok = hydrateSession({
      app: 'complex-builder',
      version: 1,
      lines: ['z1 = 4', 'z2 = 4i', 'שטח Oz1z2'],
      freePos: {},
      seed: 0,
      view: 'cart',
    });
    expect(ok).toBe(true);
    expect(store().lines).toEqual(['z1 = 4', 'z2 = 4i']);
    expect(store().queries).toEqual(['שטח Oz1z2']);
    expect(store().loadAudit).toBeNull();
  });

  it('a MUTED saved ask line migrates too — a question has no mute in the lane model', () => {
    hydrateSession({
      app: 'complex-builder',
      version: 1,
      lines: ['z1 = 4', 'שטח Oz1z2'],
      disabled: [1],
      freePos: {},
      seed: 0,
      view: 'cart',
    });
    expect(store().lines).toEqual(['z1 = 4']);
    expect(store().queries).toEqual(['שטח Oz1z2']);
  });

  it('the lane’s own saved field restores', () => {
    hydrateSession({
      app: 'complex-builder',
      version: 1,
      lines: ['z1 = 4'],
      queries: ['|z1|'],
      freePos: {},
      seed: 0,
      view: 'cart',
    });
    expect(store().queries).toEqual(['|z1|']);
  });
});

describe('the fold answers lane questions — the operator’s exact ask', () => {
  it('«שטח Oz1z2» over a determined figure answers 8, as a lane entry', () => {
    const d = deriveLines(['z1 = 4', 'z2 = 4i'], 0, 0, ['שטח Oz1z2']);
    expect(d.knowledge).toHaveLength(1);
    expect(d.knowledge[0].value).toBe('8');
  });

  it('a lane question can never constrain the figure — a statement in the lane is ignored by the fold', () => {
    const withStatement = deriveLines(['z1 = 4'], 0, 0, ['|z1| = 7']);
    expect(withStatement.contradiction).toBeNull();
    expect(withStatement.points.find((p) => p.name === 'z1')!.modulus).toBe('4');
  });
});

describe('the panel row model', () => {
  it('an answered ask, a statement, and an unreadable line each explain themselves', () => {
    const asks = ['שטח Oz1z2', '|z1| = 7', 'לא שאלה ולא נתון בכלל'];
    const d = deriveLines(['z1 = 4', 'z2 = 4i'], 0, 0, asks);
    const rows = askRowsOf(asks, d.knowledge);
    expect(rows[0]).toMatchObject({ note: null });
    expect(rows[0].row!.value).toBe('8');
    expect(rows[1]).toMatchObject({ note: 'statement', row: null });
    expect(rows[2]).toMatchObject({ note: 'unreadable', row: null });
  });

  it('an ask over an open figure is WITHHELD with its why — never a sampled number', () => {
    const asks = ['אורך z1z3'];
    const d = deriveLines(['z1 = 4', 'z3'], 0, 0, asks);
    const rows = askRowsOf(asks, d.knowledge);
    expect(rows[0]).toMatchObject({ note: null });
    expect(rows[0].row!.value).toBeNull(); // z3 is free — the answer is "not determined", said as one
    expect(rows[0].row!.why).not.toBeNull();
  });
});
