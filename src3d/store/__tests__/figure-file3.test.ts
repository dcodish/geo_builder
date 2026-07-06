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
