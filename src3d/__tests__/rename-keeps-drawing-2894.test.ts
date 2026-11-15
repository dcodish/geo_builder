/**
 * #2894 part 2 B ([ADR-3D-497](../../docs/06b-decisions-3d.md#adr-3d-497)) — A RENAME OR A SWAP KEEPS THE DRAWING.
 * pipeline-lock: an invariant over EVERY fixture (a rename and a swap keep each one's drawing bit for bit) that no fixture or scenario harness can state, since they replay a figure as saved and never rename it; not one fix's figure.
 *
 * Operator, 2026-11-15: *"Keep the drawing (Recommended)"* and *"Yes, store the first name (Recommended)"*. Every seeded
 * sample is keyed by the letters of the points it samples, so a rename (which rewrites every letter of the facts,
 * ADR-3D-211) keyed them all anew and the figure jumped to another configuration. Each row now records the first names
 * of its renamed letters (`Fact3.as`) and the figure is sampled under them (`Construction3.sampleNames`, `rng.ts`).
 *
 * The locks:
 *  - over EVERY fixture, a rename of its first point and a swap of its first two leave every position bit for bit where
 *    it was, under its new letter, and every row's status as it was;
 *  - a figure that was never renamed (every fixture as loaded) carries no first name and no sampling names, so it is the
 *    content it always was: it keys, solves and draws exactly as before this change;
 *  - the first names ride the facts: undo restores them with the letters, and a saved file or link carries them;
 *  - a new point given a renamed-away letter is sampled under a name of its own (two points never share a sample).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deserializeFigure3, serializeFigure3, serializeFigure3ForLink } from '../store/figureFile3';
import { derive3, useGeo3, type Fact3 } from '../store/store3';
import { pointLabels3, renameFacts3, sampleNames3, swapSession3 } from '../store/rename3';
import { sampleKey3 } from '../engine/rng';
import type { Positions3 } from '../engine/types';

const DIR = join(__dirname, '..', '..', 'fixtures3');
const FIXTURES = readdirSync(DIR).filter((f) => f.endsWith('.geo3.json')).sort();

const F64 = new Float64Array(1);
const U64 = new BigUint64Array(F64.buffer);
const bits = (v: number): string => ((F64[0] = v), U64[0].toString(16));
const at = (p: { x: number; y: number; z: number }): string => `${bits(p.x)},${bits(p.y)},${bits(p.z)}`;

/** Every point of `before` stands bit for bit at its new letter in `after`; the ids that do not. */
function moved(before: Positions3, after: Positions3, letter: (id: string) => string): string[] {
  const out: string[] = [];
  for (const [id, p] of before) {
    const q = after.get(letter(id));
    if (!q || at(p) !== at(q)) out.push(id);
  }
  return out;
}
const statuses = (facts: readonly Fact3[], seed: Parameters<typeof derive3>[1]): string[] => {
  const d = derive3(facts as Fact3[], seed);
  return facts.map((f) => {
    const s = d.status[f.id];
    return typeof s === 'string' ? s : s.code;
  });
};

/**
 * The figures whose letters the TOOL chose (an unlettered solid noun, an indefinite shape): their letters are chosen
 * again by every fold, from the letters free at that point, so a rename that frees a letter re-letters them (on `main`
 * too). Their points are not the student's letters to keep; the lock covers every other fixture.
 */
const TOOL_LETTERED = (facts: readonly Fact3[], seed: Parameters<typeof derive3>[1]): boolean => {
  const d = derive3(facts as Fact3[], seed);
  return Object.keys(d.relettered ?? {}).length > 0 || Object.keys(d.resolvedCmds).length > 0;
};

describe('#2894 B — every fixture keeps its drawing through a rename and a swap', () => {
  it.each(FIXTURES)('%s', (file) => {
    const r = deserializeFigure3(readFileSync(join(DIR, file), 'utf8'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // a file without first names is the figure it always was: no first name, no sampling names
    expect(r.facts.some((f) => 'as' in f), 'a file saved before this change carries no first name').toBe(false);
    const before = derive3(r.facts, r.seed);
    expect('sampleNames' in before.construction, 'a figure never renamed is sampled under its own letters').toBe(false);
    if (TOOL_LETTERED(r.facts, r.seed)) return;
    const letters = [...new Set(r.facts.flatMap((f) => [...pointLabels3(f.cmds)]))].filter((l) => before.positions.has(l));
    if (letters.length < 2) return;
    const [a, b] = letters;
    const free = [...'QWZXYKLMN'].find((l) => !letters.includes(l))!;
    const renamed = renameFacts3(r.facts, a, free);
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) return;
    const afterRename = derive3(renamed.facts, r.seed);
    expect(moved(before.positions, afterRename.positions, (l) => (l === a ? free : l)), `rename ${a}→${free}`).toEqual([]);
    expect(statuses(renamed.facts, r.seed)).toEqual(statuses(r.facts, r.seed));
    const swapped = swapSession3({ facts: r.facts, queries: [], planeDisplay: {} }, a, b);
    expect(swapped.ok).toBe(true);
    if (!swapped.ok) return;
    const afterSwap = derive3(swapped.facts, r.seed);
    expect(moved(before.positions, afterSwap.positions, (l) => (l === a ? b : l === b ? a : l)), `swap ${a}↔${b}`).toEqual([]);
    expect(statuses(swapped.facts, r.seed)).toEqual(statuses(r.facts, r.seed));
  });
});

function reset(): void {
  useGeo3.setState({ facts: [], seed: 0, lastError: null, queries: [], planeDisplay: {} });
  useGeo3.temporal.getState().clear();
}
const st = () => useGeo3.getState();
const drawn = () => derive3(st().facts, st().seed).positions;

describe('#2894 B — the first names ride the facts', () => {
  beforeEach(reset);

  it("the operator's report: a triangle with two sides and an angle (two configurations) keeps its drawing", () => {
    for (const u of ['משולש ABC', 'AB = 5', 'BC = 4', '∠BAC = 40°']) st().submit(u);
    const before = drawn();
    st().submit('שנה שם A ל-Q');
    expect(st().lastError).toBeNull();
    expect(moved(before, drawn(), (l) => (l === 'A' ? 'Q' : l))).toEqual([]);
    st().submit('החלף בין B ל-C');
    expect(st().lastError).toBeNull();
    expect(moved(before, drawn(), (l) => (l === 'A' ? 'Q' : l === 'B' ? 'C' : l === 'C' ? 'B' : l))).toEqual([]);
  });

  it('a rename writes the first name on every row that names the letter, and renaming back removes it', () => {
    for (const u of ['קובייה ABCD', 'E על AB']) st().submit(u);
    st().submit('שנה שם A ל-Q');
    expect(st().facts.map((f) => f.as)).toEqual([{ Q: 'A' }, { Q: 'A' }]);
    st().submit('שנה שם Q ל-M');
    expect(st().facts.map((f) => f.as), 'a second rename keeps the FIRST name').toEqual([{ M: 'A' }, { M: 'A' }]);
    st().submit('שנה שם M ל-A');
    expect(st().facts.every((f) => !('as' in f)), 'back on its first name, the row is as typed').toBe(true);
  });

  it('a swap gives each letter the other point’s first name', () => {
    st().submit('משולש ABC');
    st().submit('החלף בין A ל-B');
    expect(st().facts[0].as).toEqual({ B: 'A', A: 'B' });
  });

  it('undo restores the letters and the first names in one step, and the drawing with them', () => {
    for (const u of ['משולש ABC', 'AB = 5', 'BC = 4', '∠BAC = 40°']) st().submit(u);
    const before = drawn();
    st().submit('שנה שם A ל-Q');
    useGeo3.temporal.getState().undo();
    expect(st().facts.some((f) => f.as)).toBe(false);
    expect(moved(before, drawn(), (l) => l)).toEqual([]);
  });

  it('a saved file (and so a link) carries the first names, and draws the renamed figure where it was', () => {
    for (const u of ['משולש ABC', 'AB = 5', 'BC = 4', '∠BAC = 40°']) st().submit(u);
    st().submit('שנה שם A ל-Q');
    const here = drawn();
    for (const payload of [serializeFigure3(st().facts, st().seed), serializeFigure3ForLink(st().facts, st().seed)]) {
      const file = JSON.parse(payload) as { facts: { as?: Record<string, string> }[] };
      expect(file.facts.map((f) => f.as)).toEqual([{ Q: 'A' }, { Q: 'A' }, undefined, { Q: 'A' }]);
      const back = deserializeFigure3(payload);
      expect(back.ok).toBe(true);
      if (!back.ok) return;
      expect(back.facts.map((f) => f.as)).toEqual(st().facts.map((f) => f.as));
      expect(moved(here, derive3(back.facts, back.seed).positions, (l) => l)).toEqual([]);
    }
  });

  it('a malformed first name in a file is dropped, never refused', () => {
    st().submit('משולש ABC');
    const file = JSON.parse(serializeFigure3(st().facts, st().seed)) as { facts: Record<string, unknown>[] };
    file.facts[0].as = { A: 7, b: 'Q', C: 'C', B: 'Z' };
    const back = deserializeFigure3(JSON.stringify(file));
    expect(back.ok && back.facts[0].as).toEqual({ B: 'Z' });
  });

  it('a new point given a renamed-away letter is sampled under a name of its own', () => {
    const facts: Fact3[] = [
      { id: 'f1', utterance: 'משולש QBC', cmds: [{ type: 'solid', kind: 'polygon3', ids: [...'QBC'] }], enabled: true, as: { Q: 'A' } },
      { id: 'f2', utterance: 'משולש ADE', cmds: [{ type: 'solid', kind: 'polygon3', ids: [...'ADE'] }], enabled: true },
    ];
    const names = sampleNames3(facts)!;
    expect(names).toEqual({ Q: 'A', A: 'A~' });
    expect(sampleKey3('solid-polygon3-QBC', names)).toBe('solid-polygon3-ABC');
    expect(sampleKey3('solid-polygon3-ADE', names)).toBe('solid-polygon3-A~DE');
  });

  it('a key is read token by token with the rename’s own boundaries: a prime, a digit and a lowercase word are other tokens', () => {
    const names = { A: 'X', "A'": 'Y', B1: 'Z' };
    expect(sampleKey3("solid-cube-ABCDA'B'C'D'", names)).toBe("solid-cube-XBCDYB'C'D'");
    expect(sampleKey3('t-B1-A-B', names)).toBe('t-Z-X-B');
    expect(sampleKey3('placement-0-ax', names)).toBe('placement-0-ax');
    expect(sampleKey3('free3sgn-x-A', names)).toBe('free3sgn-x-X');
  });
});
