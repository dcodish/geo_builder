/**
 * #1566 ([ADR-3D-398](../../docs/06b-decisions-3d.md#adr-3d-398), [ADR-3D-399](../../docs/06b-decisions-3d.md#adr-3d-399))
 * — the guide click on an empty canvas, and the two mint rows that let an example build there.
 *
 * Measured at 216cf8bb through `useGeo3.submit` on a blank canvas: «הישר d מאונך לישר ℓ1 ולישר ℓ2» → `unknown-line ℓ1`
 * (the line-slot walk read only the key `line`, and the common perpendicular's lines sit in `line1`/`line2`);
 * «נפח הפירמידה ABCDS = 11» → `no-such-solid ABCDS` (#2048 S2(c), ruled and never delivered); «גובה הפירמידה» and 36
 * other examples with nothing to create → refused (card d6 and the 2026-10-30 ruling 3A: they load the line they need).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { guideTryLines3 } from '../app/guideTry3';
import { COMMAND_CATALOG_3D } from '../parser/catalog3';
import { lineSlotNames3, mintableSolid3 } from '../engine/mintable';
import { parse3, solidDeclaration3 } from '../parser/parse3';
import { resolveSolidSubject, subjectVolume } from '../engine/solidSubject';
import type { Command3 } from '../engine/types';

const st = () => useGeo3.getState();
const reset = () => useGeo3.setState({ facts: [], seed: 0, lastError: null, lastNotice: null, lastCreated: null } as never);
const run = (...lines: string[]) => {
  reset();
  for (const l of lines) st().submit(l);
};
const d = () => derive3(st().facts, st().seed);
const green = () => Object.values(d().status).every((s) => s === 'ok');
const cmds = (u: string): Command3[] => {
  const r = parse3(u);
  if (!r.ok) throw new Error(u);
  return r.commands;
};
const solids = () => d().construction.solids.map((s) => `${s.kind}:${s.ids.join('')}`);
const volume = (ids: string) => subjectVolume(resolveSolidSubject(d().construction, 'any', [...ids]), d().positions);

beforeEach(reset);

describe('#1566 S1 — what a guide click submits', () => {
  const height = COMMAND_CATALOG_3D.find((e) => e.he === 'גובה הפירמידה')!;
  const plain = COMMAND_CATALOG_3D.find((e) => e.he === "תיבה ABCDA'B'C'D'")!;

  it('an empty canvas: the lines it needs, then the example — in the UI language', () => {
    expect(guideTryLines3(height, 'he', 0)).toEqual(['פירמידה ABCDS', 'גובה הפירמידה']);
    expect(guideTryLines3(height, 'en', 0)).toEqual(['pyramid ABCDS', 'the height of the pyramid']);
  });

  it('a figure on the canvas: the example alone (the student is adding to their own figure)', () => {
    expect(guideTryLines3(height, 'he', 1)).toEqual(['גובה הפירמידה']);
    expect(guideTryLines3(height, 'en', 3)).toEqual(['the height of the pyramid']);
  });

  it('an example that needs nothing is submitted alone on any canvas', () => {
    expect(guideTryLines3(plain, 'he', 0)).toEqual(["תיבה ABCDA'B'C'D'"]);
  });

  it('the click builds: two rows, both green (before: «גובה הפירמידה» refused on a blank canvas)', () => {
    run(...guideTryLines3(height, 'he', 0));
    expect(st().lastError).toBeNull();
    expect(st().facts.map((f) => f.utterance)).toEqual(['פירמידה ABCDS', 'גובה הפירמידה']);
    expect(green()).toBe(true);
  });

  it('every one of the 37 examples that card d6 and ruling 3A name carries its lines', () => {
    expect(COMMAND_CATALOG_3D.filter((e) => e.needs).length).toBe(37);
  });
});

describe('#1566 S2 (C4) — every line slot of a command is minted, whatever its field is called', () => {
  it('the common perpendicular reads both of its lines', () => {
    expect([...lineSlotNames3(cmds('הישר d מאונך לישר ℓ1 ולישר ℓ2'))].sort()).toEqual(['ℓ1', 'ℓ2']);
  });

  it.each([
    ['he', 'הישר d מאונך לישר ℓ1 ולישר ℓ2'],
    ['en', 'd is the common perpendicular of ℓ1 and ℓ2'],
  ])('%s: a blank canvas creates ℓ1 and ℓ2 and draws d — and a created line is never in the notice', (_, line) => {
    run(line);
    expect(st().lastError).toBeNull();
    expect(st().facts).toHaveLength(1);
    expect(green()).toBe(true);
    expect([...d().construction.lines.keys()].sort()).toEqual(['d', 'ℓ1', 'ℓ2']);
    expect(st().lastCreated).toBeNull();
  });

  it('one existing line: only the missing one is created', () => {
    run('ישר ℓ1', 'הישר d מאונך לישר ℓ1 ולישר ℓ2');
    expect(st().lastError).toBeNull();
    expect(green()).toBe(true);
    expect([...d().construction.lines.keys()].sort()).toEqual(['d', 'ℓ1', 'ℓ2']);
  });
});

describe('#1566 S3 (C5) — a solid named by its letters is created (#2048 ruling A, S2(c))', () => {
  it.each([
    ['he', 'נפח הפירמידה ABCDS = 11'],
    ['en', 'volume of pyramid ABCDS = 11'],
  ])('%s: a blank canvas creates pyramid ABCDS of volume 11, and the notice names its points', (_, line) => {
    run(line);
    expect(st().lastError).toBeNull();
    expect(st().facts).toHaveLength(1);
    expect(green()).toBe(true);
    // the same solid «פירמידה ABCDS» declares
    expect(solids()).toEqual(cmds('פירמידה ABCDS').map((k) => (k.type === 'solid' ? `${k.kind}:${k.ids.join('')}` : '')));
    expect(volume('ABCDS')).toBeCloseTo(11, 6);
    expect(st().lastCreated?.ids).toEqual(['A', 'B', 'C', 'D', 'S']);
  });

  it('the class: every solid noun whose declaration the grammar reads — the cube, the box, a 4-letter pyramid', () => {
    for (const [line, ids, v] of [
      ['נפח הקובייה ABCDEFGH = 8', 'ABCDEFGH', 8],
      ['נפח התיבה ABCDEFGH = 24', 'ABCDEFGH', 24],
      ['נפח הפירמידה ABCD = 11', 'ABCD', 11],
      ['נפח הטטראדר ABCD = 5', 'ABCD', 5],
    ] as const) {
      run(line);
      expect(st().lastError, line).toBeNull();
      expect(green(), line).toBe(true);
      expect(volume(ids), line).toBeCloseTo(v, 6);
      expect(solids(), line).toEqual(cmds(`${line.split(' ')[1].replace(/^ה/, '')} ${ids}`).map((k) => (k.type === 'solid' ? `${k.kind}:${k.ids.join('')}` : '')));
    }
  });

  it('a noun that names no family, or a run no declaration reads, creates nothing and keeps its refusal', () => {
    expect(solidDeclaration3('prism', [...'ABCDEF'])).toBeNull(); // «מנסרה ABCDEF» is not a declaration the grammar reads
    run('נפח המנסרה ABCDEF = 11');
    expect(st().lastError).toEqual({ code: 'no-such-solid', id: 'ABCDEF' });
    run('נפח הגוף ABCDE = 11');
    expect(st().lastError).toEqual({ code: 'no-such-solid', id: 'ABCDE' });
    expect(mintableSolid3({ code: 'no-such-solid', id: 'ABCDE' }, cmds('נפח הגוף ABCDE = 11'))).toBeNull();
  });

  it('on a figure too (ADR-W-162, "create everywhere + notice"): new letters create their solid, and the notice names them', () => {
    run('פירמידה SABCD', 'נפח הפירמידה WXYZ = 11');
    expect(st().lastError).toBeNull();
    expect(green()).toBe(true);
    expect(solids()).toHaveLength(2);
    expect(st().lastCreated?.ids).toEqual(['W', 'X', 'Y', 'Z']);
  });

  it('the solid on the canvas is used, never created again', () => {
    run('פירמידה ABCDS', 'נפח הפירמידה ABCDS = 11');
    expect(st().lastError).toBeNull();
    expect(solids()).toHaveLength(1);
    expect(st().lastCreated).toBeNull();
  });

  it('ATOMIC: a line whose solid cannot be created leaves no solid and no point', () => {
    run('נפח הפירמידה ABCDS = -3'); // a negative volume: refused as the declared-first figure refuses it
    expect(st().lastError).toEqual({ code: 'claim-refuted' });
    expect(st().facts).toHaveLength(0);
    run('A(0,0,0)', 'נפח הפירמידה ABCDS = 11'); // the declaration's own clash, as «A(0,0,0)» · «פירמידה ABCDS»
    expect(st().lastError).toEqual({ code: 'already-defined', id: 'A' });
    expect(st().facts).toHaveLength(1);
    expect(solids()).toEqual([]);
    expect([...d().construction.points.keys()]).toEqual(['A']);
  });

  it('a later line that contradicts the created solid is refused as the contradiction it is (never «no solid ABCDS»)', () => {
    run('פירמידה ABCDS', 'נפח הפירמידה ABCDS = 11', 'נפח הפירמידה ABCDS = 12');
    const declaredFirst = st().lastError;
    run('נפח הפירמידה ABCDS = 11', 'נפח הפירמידה ABCDS = 12');
    expect(st().lastError).toEqual(declaredFirst);
    expect(st().lastError).toEqual({ code: 'claim-refuted' });
    expect(solids()).toHaveLength(1); // the first line keeps its pyramid
  });

  it('a later line builds on the created solid', () => {
    run('נפח הפירמידה ABCDS = 11', 'גובה הפירמידה');
    expect(st().lastError).toBeNull();
    expect(green()).toBe(true);
  });
});
