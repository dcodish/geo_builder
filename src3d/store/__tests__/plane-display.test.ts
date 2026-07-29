/**
 * #318 — the per-plane patch display preference in the STORE + FILE layers:
 * the toggle action (absent = 'full'; toggling back deletes the key so no
 * redundant defaults are ever stored), undo/redo + clear semantics (the
 * `queries` display-pref pattern), and `.geo3.json` persistence (round-trip,
 * omitted-when-empty, lenient load).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { deserializeFigure3, serializeFigure3 } from '../figureFile3';
import { redo3, undo3, useGeo3 } from '../store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, queries: [], planeDisplay: {}, figureName: '', lastError: null });
  useGeo3.temporal.getState().clear();
}

describe('planeDisplay (#318)', () => {
  beforeEach(reset);

  it("toggle cycles 'full' (absent) → 'face' → 'hidden' → back to absent (never a stored default; #395/ADR-3D-108)", () => {
    // deliberately updated from the two-state #318 cycle: the INTENT this test pins — cycling
    // returns to the default with the key DELETED, never stored — is unchanged; 'hidden' joined.
    useGeo3.getState().togglePlaneDisplay('ABC');
    expect(useGeo3.getState().planeDisplay).toEqual({ ABC: 'face' });
    useGeo3.getState().togglePlaneDisplay('ABC');
    expect(useGeo3.getState().planeDisplay).toEqual({ ABC: 'hidden' });
    useGeo3.getState().togglePlaneDisplay('ABC');
    expect(useGeo3.getState().planeDisplay).toEqual({});
  });

  it('undo/redo travel the display pref; clear resets it', () => {
    useGeo3.getState().submit('קובייה ABCD');
    useGeo3.getState().submit('מישור ABC');
    expect(useGeo3.getState().lastError).toBeNull();
    useGeo3.getState().togglePlaneDisplay('ABC');
    expect(useGeo3.getState().planeDisplay).toEqual({ ABC: 'face' });
    undo3();
    expect(useGeo3.getState().planeDisplay).toEqual({});
    expect(useGeo3.getState().facts).toHaveLength(2); // only the toggle was undone
    redo3();
    expect(useGeo3.getState().planeDisplay).toEqual({ ABC: 'face' });
    useGeo3.getState().clear();
    expect(useGeo3.getState().planeDisplay).toEqual({});
  });

  it('round-trips through the figure file; omitted when empty; garbage values dropped on load', () => {
    useGeo3.getState().submit('קובייה ABCD');
    useGeo3.getState().submit('מישור ABC');
    const { facts, seed } = useGeo3.getState();

    const saved = serializeFigure3(facts, seed, undefined, [], { ABC: 'face' });
    const r = deserializeFigure3(saved);
    expect(r.ok && r.planeDisplay).toEqual({ ABC: 'face' });

    const bare = serializeFigure3(facts, seed);
    expect(JSON.parse(bare).planeDisplay).toBeUndefined(); // omitted when empty (like queries)
    const r2 = deserializeFigure3(bare);
    expect(r2.ok && r2.planeDisplay).toEqual({});

    const tampered = JSON.parse(saved);
    tampered.planeDisplay = { ABC: 'nonsense', DEF: 'face', GHI: 'full' };
    const r3 = deserializeFigure3(JSON.stringify(tampered));
    expect(r3.ok && r3.planeDisplay).toEqual({ DEF: 'face', GHI: 'full' });
  });

  it('loadFigure applies the loaded display pref in ONE undoable set', () => {
    useGeo3.getState().submit('קובייה ABCD');
    useGeo3.getState().submit('מישור ABC');
    const saved = serializeFigure3(useGeo3.getState().facts, useGeo3.getState().seed, undefined, [], { ABC: 'face' });

    reset();
    useGeo3.getState().submit('קובייה ABCD');
    const r = deserializeFigure3(saved);
    if (!r.ok) throw new Error('deserialize failed');
    useGeo3.getState().loadFigure(r.facts, r.seed, r.queries, r.planeDisplay);
    expect(useGeo3.getState().planeDisplay).toEqual({ ABC: 'face' });
    expect(useGeo3.getState().facts).toHaveLength(2);
    undo3(); // ONE undo restores the whole pre-load session, display pref included
    expect(useGeo3.getState().planeDisplay).toEqual({});
    expect(useGeo3.getState().facts).toHaveLength(1);
  });
});
