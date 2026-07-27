/**
 * Save/load a `.geo3.json` (ADR-3D-005): round-trip fidelity, strict refusals,
 * and the non-destructive load (ONE undo restores the prior session).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { deserializeFigure3, serializeFigure3, SCHEMA_VERSION_3D } from '../figureFile3';
import { derive3, undo3, useGeo3 } from '../store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}

const SESSION = ['קובייה ABCD', "נסמן: AB = u, AD = v, AA' = w", "M אמצע BB'"];

describe('figure file (.geo3.json)', () => {
  beforeEach(reset);

  it('round-trips: utterances, lowered commands, enabled flags, seed — with fresh ids', () => {
    SESSION.forEach((u) => useGeo3.getState().submit(u));
    useGeo3.getState().resample(); // seed 1 — the configuration must reload as saved
    useGeo3.getState().toggle(useGeo3.getState().facts[2].id); // one disabled fact travels too
    const { facts, seed } = useGeo3.getState();

    const r = deserializeFigure3(serializeFigure3(facts, seed));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.seed).toBe(seed);
    expect(r.facts.map((f) => f.utterance)).toEqual(facts.map((f) => f.utterance));
    expect(r.facts.map((f) => f.cmds)).toEqual(facts.map((f) => f.cmds));
    expect(r.facts.map((f) => f.enabled)).toEqual(facts.map((f) => f.enabled));
    expect(r.facts.map((f) => f.id)).not.toEqual(facts.map((f) => f.id)); // ids are session-local

    // the reloaded session replays to the same figure
    const before = derive3(facts, seed);
    const after = derive3(r.facts, r.seed);
    expect([...after.positions.entries()]).toEqual([...before.positions.entries()]);
  });

  it('refuses garbage, foreign files, future schemas, empty figures — never half-loads', () => {
    expect(deserializeFigure3('not json {')).toEqual({ ok: false, reason: 'bad-file' });
    expect(deserializeFigure3('{"app":"geo-builder","schemaVersion":1,"seed":0,"facts":[]}')).toEqual({ ok: false, reason: 'bad-file' });
    expect(
      deserializeFigure3(JSON.stringify({ app: '3d-builder', schemaVersion: SCHEMA_VERSION_3D + 1, seed: 0, facts: [{ utterance: 'x', cmds: [{ type: 'solid' }] }] })),
    ).toEqual({ ok: false, reason: 'newer-schema' });
    expect(
      deserializeFigure3(JSON.stringify({ app: '3d-builder', schemaVersion: 1, seed: 0, facts: [] })),
    ).toEqual({ ok: false, reason: 'bad-file' });
    expect(
      deserializeFigure3(JSON.stringify({ app: '3d-builder', schemaVersion: 1, seed: 0, facts: [{ utterance: 'x', cmds: [{ type: 'not-a-command' }] }] })),
    ).toEqual({ ok: false, reason: 'bad-file' });
  });

  it('load is ONE undoable set: undo restores the pre-load session', () => {
    useGeo3.getState().submit('קובייה ABCD');
    const saved = serializeFigure3(useGeo3.getState().facts, useGeo3.getState().seed);

    reset();
    SESSION.slice(0, 2).forEach((u) => useGeo3.getState().submit(u));
    const preLoad = useGeo3.getState().facts.map((f) => f.utterance);

    const r = deserializeFigure3(saved);
    if (!r.ok) throw new Error('deserialize failed');
    useGeo3.getState().loadFigure(r.facts, r.seed);
    expect(useGeo3.getState().facts.map((f) => f.utterance)).toEqual(['קובייה ABCD']);

    undo3();
    expect(useGeo3.getState().facts.map((f) => f.utterance)).toEqual(preLoad);
  });
});

/** Issue #20 — user-named save files with the automatic per-product suffix (3-D twin). */
import { namedFigureFileName3 } from '../figureFile3';

describe('namedFigureFileName3 (issue #20)', () => {
  const now = new Date('2026-07-11T10:00:00Z');
  it('appends the -vectors suffix to a user name', () => {
    expect(namedFigureFileName3('2026summer', now)).toBe('2026summer-vectors.json');
  });
  it('never doubles the suffix and strips a typed extension', () => {
    expect(namedFigureFileName3('2026summer-vectors', now)).toBe('2026summer-vectors.json');
    expect(namedFigureFileName3('old.geo3.json', now)).toBe('old-vectors.json');
  });
  it('empty / cancelled → the date-stamped default (pre-#20 behaviour)', () => {
    expect(namedFigureFileName3('', now)).toBe('figure-3d-2026-07-11.geo3.json');
    expect(namedFigureFileName3(null, now)).toBe('figure-3d-2026-07-11.geo3.json');
  });
});

/**
 * Issue #288 follow-up — the save whitelist must be a TOTAL function over `Command3['type']`,
 * not a hand-maintained list.
 *
 * #288 restored 23 types that had fallen out of the whitelist and added a catalog-driven round-trip
 * guard. But that guard can only reach types some `COMMAND_CATALOG_3D` example happens to emit, so
 * `inject-pair` — the V7-T2 pair-vector injection, emitted by `parse3` and applied by `apply` — stayed
 * missing: the figure SAVED and then failed to RELOAD (`bad-file`), the same silent round-trip data
 * loss #288 was filed for. The structural fix is the exhaustive `COMMAND_SAVEABLE` record, which makes
 * an unclassified command type a COMPILE error; these are its behavioural locks.
 */
import { parse3 } from '../../parser/parse3';

describe('#288 — no save-whitelist drift (structural)', () => {
  it('a pair-vector injection reloads (`BD = (-4,5,12)` — saved fine, could not be re-opened)', () => {
    const r = parse3('BD = (-4,5,12)');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands.some((c) => c.type === 'inject-pair')).toBe(true);

    const json = serializeFigure3([{ id: 'x', utterance: 'BD = (-4,5,12)', cmds: r.commands, enabled: true }], 0);
    const loaded = deserializeFigure3(json);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.facts[0].cmds).toEqual(r.commands);
  });

  it('an unknown command type is still rejected (the gate still gates)', () => {
    const json = serializeFigure3([{ id: 'x', utterance: 'x', cmds: [], enabled: true }], 0);
    const doctored = JSON.parse(json);
    doctored.facts[0].cmds = [{ type: 'not-a-real-command' }];
    expect(deserializeFigure3(JSON.stringify(doctored)).ok).toBe(false);
  });
});
