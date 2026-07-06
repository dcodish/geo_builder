/**
 * Figure file save/load (FR-HS-10) — the `.geo.json` serializer + the store's `loadFigure`.
 *
 * The file is the store's replay inputs (facts + seed + dialed radii + display prefs), never
 * positions: a load replays through the normal path, so a loaded figure must be geometrically
 * identical to the session it was saved from, and loading must be a single undoable step that
 * never destroys the session that was open.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { replay, useGeoStore } from '../geoStore';
import { deserializeFigure, figureFileName, serializeFigure, FIGURE_FILE_VERSION } from '../figureFile';
import { parse, buildParseCtx } from '@/parser';

const s = () => useGeoStore.getState();
const fig = () => replay(s().facts, s().seed, s().radiusOverrides);
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** Type an utterance exactly as the app does (parse with the live figure context → executeMany). */
const submit = (u: string) => {
  const { construction, positions } = fig();
  const r = parse(u, buildParseCtx(construction, positions));
  if (!r.ok) throw new Error(`test utterance did not parse: ${u}`);
  s().executeMany(r.commands, u);
};

/** Serialize the CURRENT store session the way App's save button does. */
const saveCurrent = (): string =>
  serializeFigure(
    {
      facts: s().facts,
      seed: s().seed,
      radiusOverrides: s().radiusOverrides,
      display: {
        hidden: s().hidden,
        segStyle: s().segStyle,
        hiddenCircles: s().hiddenCircles,
        showMeasures: s().showMeasures,
        showCenters: s().showCenters,
      },
    },
    { locale: 'he', savedAt: '2026-07-06T00:00:00.000Z' },
  );

beforeEach(() => s().clear());

describe('figure file — serialize/deserialize round trip', () => {
  it('the defining interaction round-trips: same facts, same coordinates, no positions in the file', () => {
    submit('ריבוע ABCD');
    submit('נקודה G על AD');
    submit('זווית GBA = 37');
    const before = fig();
    expect(before.lastError).toBeNull();

    const json = saveCurrent();
    // The file stores replay INPUTS only — a serialized coordinate would defeat "robust to engine changes".
    expect(json).not.toContain('"positions"');
    expect(JSON.parse(json).schemaVersion).toBe(FIGURE_FILE_VERSION);

    const r = deserializeFigure(json);
    if (!r.ok) throw new Error(`round trip refused: ${r.reason}`);
    expect(r.file.facts.map((f) => f.utterance)).toEqual(s().facts.map((f) => f.utterance));
    expect(r.file.facts.map((f) => f.cmd)).toEqual(s().facts.map((f) => f.cmd));
    expect(r.file.seed).toBe(s().seed);

    const after = replay(r.file.facts, r.file.seed, r.file.radiusOverrides);
    expect(after.lastError).toBeNull();
    for (const [id, p] of before.positions) {
      expect(after.positions.get(id), `position of ${id}`).toBeDefined();
      expect(dist(after.positions.get(id)!, p), `position of ${id}`).toBeLessThan(1e-9);
    }
  });

  it('a cycled branch choice (cmd.branch) survives the round trip', () => {
    submit('ריבוע ABCD');
    submit('נקודה G על AD');
    submit('זווית GBA = 37');
    const branched = s().facts.find((f) => f.cmd.type === 'point-on-segment');
    expect(branched).toBeDefined();
    s().cycleAlt('G');
    const cycledCmd = s().facts.find((f) => f.id === branched!.id)!.cmd;
    const gBefore = fig().positions.get('G')!;

    const r = deserializeFigure(saveCurrent());
    if (!r.ok) throw new Error(r.reason);
    const loadedCmd = r.file.facts.find((f) => f.id === branched!.id)!.cmd;
    expect(loadedCmd).toEqual(cycledCmd); // the alternative rides IN the command
    const after = replay(r.file.facts, r.file.seed, r.file.radiusOverrides);
    expect(dist(after.positions.get('G')!, gBefore)).toBeLessThan(1e-9);
  });

  it('the seed and dialed radii ride in the header so the saved CONFIGURATION reloads', () => {
    submit('מעגל O');
    submit('משולש ABC חסום במעגל');
    // Dial the free radius + move off the canonical seed, as a student exploring would.
    const dof = fig().radiusDofs[0];
    if (dof) s().setRadius(dof.circle, dof.base * 1.5);
    const r = deserializeFigure(saveCurrent());
    if (!r.ok) throw new Error(r.reason);
    expect(r.file.seed).toBe(s().seed);
    expect(r.file.radiusOverrides).toEqual(s().radiusOverrides);
  });
});

describe('figure file — refusals (never a corrupt figure)', () => {
  it('rejects non-JSON', () => {
    expect(deserializeFigure('not json at all {')).toEqual({ ok: false, reason: 'bad-json' });
  });

  it('rejects JSON that is not a figure file', () => {
    expect(deserializeFigure('{"hello":"world"}')).toEqual({ ok: false, reason: 'not-figure' });
    expect(deserializeFigure('[1,2,3]')).toEqual({ ok: false, reason: 'not-figure' });
  });

  it('rejects a file from a NEWER app version, gracefully', () => {
    const file = { app: 'geo-builder', schemaVersion: FIGURE_FILE_VERSION + 1, seed: 0, radiusOverrides: {}, facts: [{ cmd: { type: 'square', ids: ['A', 'B', 'C', 'D'] }, enabled: true }] };
    expect(deserializeFigure(JSON.stringify(file))).toEqual({ ok: false, reason: 'newer-version' });
  });

  it('rejects an empty figure and a malformed fact', () => {
    const empty = { app: 'geo-builder', schemaVersion: 1, seed: 0, radiusOverrides: {}, facts: [] };
    expect(deserializeFigure(JSON.stringify(empty))).toEqual({ ok: false, reason: 'no-facts' });
    const mangled = { ...empty, facts: [{ cmd: { noType: true }, enabled: true }] };
    expect(deserializeFigure(JSON.stringify(mangled))).toEqual({ ok: false, reason: 'not-figure' });
  });

  it('tolerates a hand-edited file: missing ids/enabled default, unknown junk is dropped', () => {
    const file = {
      app: 'geo-builder',
      schemaVersion: 1,
      futureField: 'ignored',
      facts: [{ cmd: { type: 'square', ids: ['A', 'B', 'C', 'D'] }, junk: 42 }],
    };
    const r = deserializeFigure(JSON.stringify(file));
    if (!r.ok) throw new Error(r.reason);
    expect(r.file.seed).toBe(0);
    expect(r.file.facts[0].enabled).toBe(true);
    expect(r.file.facts[0].id).toBeTruthy();
    expect('junk' in r.file.facts[0]).toBe(false);
    expect(replay(r.file.facts).lastError).toBeNull();
  });

  it('suggests a date-stamped .geo.json name', () => {
    expect(figureFileName(new Date('2026-07-06T12:34:56Z'))).toBe('figure-2026-07-06.geo.json');
  });
});

describe('store.loadFigure — replaces the session, one undo restores it', () => {
  it('loading replaces facts/seed/display and a single undo brings the previous session back', () => {
    // The figure being SAVED (session B): square + point + angle, with a display tweak.
    submit('ריבוע ABCD');
    submit('נקודה G על AD');
    s().toggleHidden('G');
    const json = saveCurrent();
    const r = deserializeFigure(json);
    if (!r.ok) throw new Error(r.reason);

    // A different session (A) is now open…
    s().clear();
    submit('משולש KLM');
    const aFacts = s().facts;
    expect(fig().positions.has('K')).toBe(true);

    // …and the student opens the file.
    s().loadFigure(r.file);
    expect(s().facts.map((f) => f.utterance)).toEqual(r.file.facts.map((f) => f.utterance));
    expect(s().hidden).toEqual(['G']); // display prefs travel too
    const loaded = fig();
    expect(loaded.lastError).toBeNull();
    expect(loaded.positions.has('G')).toBe(true);
    expect(loaded.positions.has('K')).toBe(false);

    // One undo → session A is back untouched (loading was never destructive).
    s().undo();
    expect(s().facts).toEqual(aFacts);
    expect(fig().positions.has('K')).toBe(true);
  });
});
