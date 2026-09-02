/**
 * #578 (ADR-3D-211) — re-lettering a point.
 *
 * Operator, prod 2026-08-14: there was no way to change a point letter in 3-D as 2-D allows; the trigger
 * was a pyramid-height foot that came out `E` when they wanted `O`. The operator approved BOTH entry
 * points (2026-08-14): the text command and the click-on-point popover, "sharing the one renameFacts3
 * core" — so the tests below drive the same core from both sides and assert they cannot drift.
 *
 * The property that matters beyond the letters: a rename is a rewrite of HISTORY, so the figure after it
 * must be exactly the figure the student would have had if they had typed the new letter from the start.
 * That is asserted directly — same coordinates, point for point.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { parseRename3 } from '../parser/parse3';
import { normalizeLabel3, pointLabels3, relabelTokens3, renameFacts3 } from '../store/rename3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null, queries: [], planeDisplay: {} });
  useGeo3.temporal.getState().clear();
}
const st = () => useGeo3.getState();
const build = (us: string[]) => {
  reset();
  for (const u of us) st().submit(u);
};
const coords = () => {
  const d = derive3(st().facts, st().seed);
  return new Map([...d.positions].map(([id, p]) => [id, `${p.x.toFixed(9)},${p.y.toFixed(9)},${p.z.toFixed(9)}`]));
};

const CUBE = "קובייה ABCDA'B'C'D'";

describe('#578 — the text command', () => {
  beforeEach(reset);

  it("the operator's case: a height foot named E becomes O, everywhere", () => {
    build(['פירמידה ABCDS שבסיסה ריבוע', 'SE גובה']);
    expect(st().lastError, 'the figure builds first').toBeNull();
    expect([...coords().keys()]).toContain('E');
    st().submit('שנה שם E ל-O');
    expect(st().lastError).toBeNull();
    const after = coords();
    expect([...after.keys()]).toContain('O');
    expect([...after.keys()]).not.toContain('E');
    // the utterance the student reads was rewritten too — a row still saying «SE» would be a lie
    expect(st().facts.map((f) => f.utterance)).toEqual(['פירמידה ABCDS שבסיסה ריבוע', 'SO גובה']);
  });

  it('history is REWRITTEN: the figure equals the one typed with the new letter from the start', () => {
    build(['פירמידה ABCDS שבסיסה ריבוע', 'SE גובה']);
    st().submit('שנה שם E ל-O');
    const renamed = coords();
    build(['פירמידה ABCDS שבסיסה ריבוע', 'SO גובה']);
    const native = coords();
    expect([...renamed.keys()].sort()).toEqual([...native.keys()].sort());
    for (const [id, v] of native) expect(renamed.get(id), `point ${id}`).toBe(v);
  });

  it('a PRIME is its own vertex: renaming A leaves the primed twin alone, and vice versa', () => {
    build([CUBE, 'מישור ABCD']);
    st().submit('שנה שם A ל-M');
    expect(st().lastError).toBeNull();
    expect(st().facts[0].utterance).toBe("קובייה MBCDA'B'C'D'");
    expect(st().facts[0].cmds[0]).toMatchObject({ ids: ['M', 'B', 'C', 'D', "A'", "B'", "C'", "D'"] });

    build([CUBE, 'מישור ABCD']);
    st().submit("שנה שם A' ל-M");
    expect(st().lastError).toBeNull();
    expect(st().facts[0].cmds[0]).toMatchObject({ ids: ['A', 'B', 'C', 'D', 'M', "B'", "C'", "D'"] });
    expect(st().facts[1].cmds[0], 'the plane run keeps its untouched letters').toMatchObject({ name: 'ABCD' });
  });

  it('a point-run plane NAME follows the rename — the plane stays addressable', () => {
    build([CUBE, 'מישור ABCD', 'E אמצע AC', 'BE מוכל במישור ABCD']);
    expect(st().lastError).toBeNull();
    st().submit('שנה שם A ל-M');
    expect(st().lastError).toBeNull();
    expect(st().facts[1].cmds[0]).toMatchObject({ type: 'plane-through', name: 'MBCD', ids: ['M', 'B', 'C', 'D'] });
    // the NESTED operand of the containment claim followed too (the structural walk, not a field list)
    expect(st().facts[3].cmds[0]).toMatchObject({
      type: 'plane-rel',
      a: { kind: 'segment', a: 'B', b: 'E' },
      b: { kind: 'plane-run', ids: ['M', 'B', 'C', 'D'] },
    });
    expect(derive3(st().facts, st().seed).positions.size, 'and it still builds').toBeGreaterThan(0);
  });

  it('English works the same, and so does the other Hebrew verb', () => {
    build([CUBE]);
    st().submit('rename B to K');
    expect(st().lastError).toBeNull();
    expect(st().facts[0].cmds[0]).toMatchObject({ ids: ['A', 'K', 'C', 'D', "A'", "B'", "C'", "D'"] });
    st().submit('החלף K ב-N');
    expect(st().lastError).toBeNull();
    expect(st().facts[0].cmds[0]).toMatchObject({ ids: ['A', 'N', 'C', 'D', "A'", "B'", "C'", "D'"] });
  });

  it('the refusals are TYPED — understood and declined, never escalated as not-understood', () => {
    build([CUBE]);
    st().submit('שנה שם A ל-B');
    expect(st().lastError).toEqual({ code: 'rename-refused', reason: 'target-taken', from: 'A', to: 'B' });
    st().submit('rename Z to M');
    expect(st().lastError).toEqual({ code: 'rename-refused', reason: 'no-source', from: 'Z', to: 'M' });
    // …and nothing was committed by either refusal
    expect(st().facts.length).toBe(1);
    expect(st().facts[0].cmds[0]).toMatchObject({ ids: ['A', 'B', 'C', 'D', "A'", "B'", "C'", "D'"] });
  });

  it('a rename never becomes a FACT — it is a rewrite of history, not a statement', () => {
    build([CUBE]);
    const n = st().facts.length;
    st().submit('שנה שם A ל-M');
    expect(st().facts.length, 'no new row appeared in the step list').toBe(n);
  });

  it('the SEED does not move — re-lettering a vertex must not redraw the figure', () => {
    build([CUBE, 'מישור ABCD']);
    const seed = st().seed;
    st().submit('שנה שם C ל-K');
    expect(st().seed).toBe(seed);
  });

  it('undo restores the old letters in ONE step', () => {
    build([CUBE]);
    st().submit('שנה שם A ל-M');
    expect(st().facts[0].cmds[0]).toMatchObject({ ids: ['M', 'B', 'C', 'D', "A'", "B'", "C'", "D'"] });
    useGeo3.temporal.getState().undo();
    expect(st().facts[0].cmds[0]).toMatchObject({ ids: ['A', 'B', 'C', 'D', "A'", "B'", "C'", "D'"] });
  });

  it('the session state around the figure follows: queries and planeDisplay', () => {
    build([CUBE, 'מישור ABCD']);
    st().addQuery('|AB|');
    st().togglePlaneDisplay('ABCD');
    st().submit('שנה שם A ל-M');
    expect(st().queries, 'a data-panel question about A now asks about M').toEqual(['|MB|']);
    expect(Object.keys(st().planeDisplay), 'the display toggle still addresses a plane that exists').toEqual(['MBCD']);
  });
});

describe('#578 — the canvas entry point runs the SAME core', () => {
  beforeEach(reset);

  it('the store action and the text command produce identical fact lists', () => {
    build([CUBE, 'מישור ABCD', 'E אמצע AC']);
    st().submit('שנה שם E ל-O');
    const viaText = JSON.stringify(st().facts.map((f) => [f.utterance, f.cmds]));

    build([CUBE, 'מישור ABCD', 'E אמצע AC']);
    const res = st().rename('E', 'O');
    expect(res).toEqual({ ok: true });
    expect(JSON.stringify(st().facts.map((f) => [f.utterance, f.cmds]))).toBe(viaText);
  });

  it('the action reports the reason so the popover can explain a no-op', () => {
    build([CUBE]);
    expect(st().rename('A', 'B')).toEqual({ ok: false, reason: 'target-taken' });
    expect(st().rename('Z', 'M')).toEqual({ ok: false, reason: 'no-source' });
    expect(st().rename('A', 'A')).toEqual({ ok: false, reason: 'same' });
    expect(st().rename('A', '3'), 'not a legal label').toEqual({ ok: false, reason: 'no-source' });
  });

  it('a lowercase letter typed in the popover is accepted as the capital it names', () => {
    build([CUBE]);
    expect(st().rename('a', 'm')).toEqual({ ok: true });
    expect(st().facts[0].cmds[0]).toMatchObject({ ids: ['M', 'B', 'C', 'D', "A'", "B'", "C'", "D'"] });
  });
});

describe('#578 — the token boundary (the piece 2-D had to learn twice)', () => {
  it('a whole label only: A does not eat A1, the primed twin, or the A of an English word', () => {
    expect(relabelTokens3("A A' A1 ABCD Add", 'A', 'M')).toBe("M A' A1 MBCD Add");
    expect(relabelTokens3("A A' A1", "A'", 'M')).toBe('A M A1');
    expect(relabelTokens3('B1 B B1C', 'B1', 'K')).toBe('K B KC');
  });

  it('pointLabels3 reads a RUN as its letters and ignores raw source text', () => {
    const run = { type: 'plane-through', name: "A'BCD", ids: ["A'", 'B', 'C', 'D'] };
    expect([...pointLabels3([run as never])].sort()).toEqual(["A'", 'B', 'C', 'D']);
    // an equation's `src` is echoed verbatim and may hold a capital that is not a point (#339)
    const eq = { type: 'plane3', name: 'π1', plane: { src: '4x-3z+D=0' } };
    expect([...pointLabels3([eq as never])]).toEqual([]);
  });

  it('renameFacts3 refuses rather than merging two points onto one letter', () => {
    const facts = [{ id: '1', utterance: 'x', enabled: true, cmds: [{ type: 'solid', kind: 'cube', ids: ['A', 'B'] } as never] }];
    expect(renameFacts3(facts, 'A', 'B')).toEqual({ ok: false, reason: 'target-taken' });
  });

  it('normalizeLabel3 accepts the labels this product uses and nothing else', () => {
    expect(normalizeLabel3('a')).toBe('A');
    expect(normalizeLabel3("a'")).toBe("A'");
    expect(normalizeLabel3('b1')).toBe('B1');
    expect(normalizeLabel3('a’'), 'a typed curly quote is a prime').toBe("A'");
    expect(normalizeLabel3('ab')).toBeNull();
    expect(normalizeLabel3('π1')).toBeNull();
    expect(normalizeLabel3('')).toBeNull();
  });
});

describe('#578 — the grammar', () => {
  it('reads both languages, both verbs, with and without the connector', () => {
    for (const u of ['שנה שם E ל-O', 'שנה E ל O', 'שנה את E ל-O', 'החלף E ב-O', 'rename E to O', 'relabel E O', 'replace E with O', 'rename e to o']) {
      expect(parseRename3(u), u).toEqual({ from: 'E', to: 'O' });
    }
  });

  it('carries the prime through', () => {
    expect(parseRename3("שנה שם A' ל-M")).toEqual({ from: "A'", to: 'M' });
    expect(parseRename3("rename A to M'")).toEqual({ from: 'A', to: "M'" });
  });

  it('declines what is not a rename — a construction sentence is never stolen', () => {
    for (const u of ['קובייה ABCD', 'E אמצע AC', 'מישור ABCD', 'שנה שם E ל-E', "AB מקביל למישור A'B'C'D'"]) {
      expect(parseRename3(u), u).toBeNull();
    }
  });
});
