/**
 * SAVE, LOAD AND THE DRIFT NET (#1087) — the chrome the operator named.
 *
 * Operator, 2026-09-15: *"I want the visualization of the tool to match that of the other tools.
 * currently the buttons are not located in same locations and there is no load and save and stuff
 * we have on other tools"*.
 *
 * What a save HOLDS here is the LINE LIST, and that is the whole design: no position and no
 * parameter value is stored, so a load replays the student's own sentences through the real parse
 * path. A saved figure is therefore also a parser-drift net — one that stops loading is a grammar
 * that changed under a student's own work — and a load can be AUDITED line by line, naming what it
 * could not restore instead of dropping it in silence (ADR-242's rule, which only a line-list
 * format makes answerable by name).
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import {
  ANALYTIC_APP,
  ANALYTIC_SAVE_VERSION,
  useAnalyticStore,
} from '../store/useAnalyticStore';
import { figureNameFromFileName, readEnvelope, savedFileName } from '../../shell/save';

const LINES = [
  'נתונה הנקודה A(2,6)',
  'נתון מעגל O שמשוואתו (x-3)^2+(y-5)^2=25',
  'נתון הישר l1: y=x',
];

const fresh = () => {
  useAnalyticStore.getState().clearAll();
  return useAnalyticStore.getState();
};

describe('#1087 — a session survives a round trip', () => {
  it('serialize → readEnvelope → restore returns the same figure', () => {
    fresh();
    for (const l of LINES) useAnalyticStore.getState().recordLine(l);
    useAnalyticStore.getState().setName('בגרות קיץ');
    const saved = useAnalyticStore.getState().serialize();
    expect(saved.app).toBe(ANALYTIC_APP);
    expect(saved.lines).toEqual(LINES);

    const env = readEnvelope(JSON.parse(JSON.stringify(saved)), {
      app: ANALYTIC_APP,
      maxVersion: ANALYTIC_SAVE_VERSION,
    });
    expect(env.ok).toBe(true);

    fresh();
    useAnalyticStore.getState().restore({ lines: saved.lines, seed: saved.seed, name: saved.name });
    expect(useAnalyticStore.getState().lines).toEqual(LINES);
    expect(useAnalyticStore.getState().name).toBe('בגרות קיץ');

    // and the figure it rebuilds is the same one, point for point
    const before = derive(LINES, 0);
    const after = derive(useAnalyticStore.getState().lines, 0);
    expect(after.faults).toEqual([]);
    expect(after.figure.points).toEqual(before.figure.points);
  });

  it('every saved line still builds — the drift net, on the corpus this product ships', () => {
    // If a grammar change ever breaks one of these, it breaks it HERE rather than in a student's
    // own saved file.
    const replayed = derive(LINES, 0);
    expect(replayed.faults).toEqual([]);
  });

  it('a load names each line it could not restore', () => {
    const withBroken = [...LINES, 'שורה שהכלי אינו מבין כלל'];
    const replayed = derive(withBroken, 0);
    const audit = {
      total: withBroken.length,
      failed: replayed.faults.map((f) => ({ line: withBroken[f.index] ?? '', reason: f.code })),
    };
    expect(audit.total).toBe(4);
    expect(audit.failed).toHaveLength(1);
    expect(audit.failed[0].line).toBe('שורה שהכלי אינו מבין כלל');
  });

  it('clearing the canvas clears the NAME too', () => {
    fresh();
    useAnalyticStore.getState().setName('משהו');
    useAnalyticStore.getState().clearAll();
    expect(useAnalyticStore.getState().name).toBe('');
  });
});

describe('#1087 — the envelope refuses by NAME', () => {
  const read = (data: unknown) =>
    readEnvelope(data, { app: ANALYTIC_APP, maxVersion: ANALYTIC_SAVE_VERSION });

  it("another builder's file says whose it is", () => {
    expect(read({ app: 'geo-builder', version: 1 })).toEqual({ ok: false, reason: 'wrong-app' });
  });

  it('a newer format says to refresh, rather than half-loading it', () => {
    expect(read({ app: ANALYTIC_APP, version: ANALYTIC_SAVE_VERSION + 1 })).toEqual({
      ok: false,
      reason: 'newer-version',
    });
  });

  it('something that is not a save file at all', () => {
    expect(read([1, 2, 3]).ok).toBe(false);
    expect(read('nope').ok).toBe(false);
  });
});

describe('#1087 — the suite naming convention (docs/22 §9)', () => {
  it('a named figure keeps its name and takes this product’s suffix', () => {
    expect(savedFileName('בגרות קיץ', new Date('2026-09-16'), 'analytic')).toContain('-analytic.json');
  });

  it('and the name comes back off the filename when the file carried none', () => {
    expect(figureNameFromFileName('בגרות קיץ-analytic.json', 'analytic')).toBe('בגרות קיץ');
  });
});
