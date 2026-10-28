/**
 * #2594 ([ADR-3D-389](../../docs/06b-decisions-3d.md#adr-3d-389)) — A LETTER THAT NAMES A LENGTH TAKES THE LENGTH'S SCALE GATE.
 *
 * Measured on PR #2576 (734c312d + main @ de72dd2c) through the store's real `submit` → `derive3` → `dataView`:
 *   «תיבה ABCDA'B'C'D'» · «|AB| = k»                 → «k = 1»   (a bare box's size is the frozen gauge)
 *   «תיבה ABCDA'B'C'D'» · «E(k,1,0)» · «|AB| = k»    → «k = 1»   (the #2580 tie set the parameter from that length)
 *   «משולש ABC» · «AN = k·AC» · «|AB| = k»           → «k = ?» on the panel, but asking «k» answered «1»
 *
 * Operator ruling 2026-10-28 on #2594: *"yes - show k=?"* — until something the student stated fixes the size.
 * Where the size IS fixed (typed coordinates, a stated length, a stated value) the forced value still prints.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { derive3, useGeo3 } from '../store/store3';
import { dataView } from '../engine/dataView';
import { answerQuery } from '../engine/queries';
import { deserializeFigure3 } from '../store/figureFile3';

const BOX = "תיבה ABCDA'B'C'D'";
const CUBE = "קובייה ABCDA'B'C'D'";
const st = () => useGeo3.getState();
function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null } as never);
  useGeo3.temporal.getState().clear();
}
/** Every line must record; the panel's params rows and the ask lane's answer for `sym`, at the session seed. */
function panelOf(lines: string[], sym = 'k') {
  reset();
  for (const l of lines) {
    st().submit(l);
    expect(st().lastError, `«${l}» in ${lines.join(' · ')}`).toBeNull();
  }
  const c = derive3(st().facts, st().seed).construction;
  return { params: dataView(c, st().seed).params.map((p) => p.text), ask: answerQuery(c, sym, st().seed) };
}

beforeEach(reset);

describe('#2594 — the size is a gauge: the letter reads «?» (the issue table)', () => {
  it.each<[string, string[]]>([
    ['the operator\'s box', [BOX, '|AB| = k']],
    ['the #2580 tie, parameter first', [BOX, 'E(k,1,0)', '|AB| = k']],
    ['the #2580 tie, length first', [BOX, '|AB| = k', 'E(k,1,0)']],
    ['a cube', [CUBE, '|AB| = k']],
    ['a flat triangle', ['משולש ABC', '|AB| = k']],
    ['a shared letter on two box edges', [BOX, '|AB| = k', '|AD| = k']],
    ['a coefficient', [CUBE, '|AB| = 2k']],
    ['a vector-definition ratio tied to the length', ['משולש ABC', 'AN = k·AC', '|AB| = k']],
  ])('%s: «k = ?», and asking «k» says it depends on the scale', (_name, lines) => {
    const { params, ask } = panelOf(lines);
    expect(params).toEqual(['k = ?']);
    expect(ask).toMatchObject({ answer: null, note: 'scale' });
  });

  it('every seed agrees: «הציגו תצורה אחרת» never turns the row into a value', () => {
    panelOf([BOX, '|AB| = k']);
    for (const seed of [0, 1, 2, 3]) {
      expect(dataView(derive3(st().facts, seed).construction, seed).params.map((p) => p.text), `seed ${seed}`).toEqual(['k = ?']);
    }
  });
});

describe('#2594 — where the size IS fixed, the forced value still prints (controls)', () => {
  it.each<[string, string[], string, string]>([
    ['typed points (operator T44)', ['C(k,1,0)', 'A(0,0,0)', 'B(1,1,1)', '|AB| = k'], 'k = √3', '√3'],
    ['a stated value', [BOX, '|AB| = k', '|AD| = k', 'k = 3'], 'k = 3', '3'],
    ['a stated value on a cube', [CUBE, '|AB| = k', 'k = 3'], 'k = 3', '3'],
    ['a stated other edge of a cube', [CUBE, '|AB| = k', '|AD| = 3'], 'k = 3', '3'],
    ['a stated diagonal and a coefficient', [CUBE, '|AB| = 2k', "|AC'| = 6"], 'k = 1.73', '1.73'],
    ['the tie with a stated value', [BOX, 'E(k,1,0)', '|AB| = k', 'k = 2'], 'k = 2', '2'],
  ])('%s: %j', (_name, lines, row, answer) => {
    const { params, ask } = panelOf(lines);
    expect(params).toEqual([row]);
    expect(ask.answer).toBe(answer);
  });

  it('«קובייה ABCDA\'B\'C\'D\'» · «C(p,1,0)» · «|AB| = p» still builds (its p is free: «p = ?», undetermined)', () => {
    const { params, ask } = panelOf([CUBE, 'C(p,1,0)', '|AB| = p'], 'p');
    expect(params).toEqual(['p = ?']);
    expect(ask).toMatchObject({ answer: null, note: 'undetermined' });
  });

  it('a letter that names no length is not gated: «|EF| = 3» fixes the box-free parameter, k = 3', () => {
    const { params, ask } = panelOf([BOX, 'E(k,1,0)', 'F(0,1,0)', '|EF| = 3', 'k חיובי']);
    expect(params).toEqual(['k = 3']);
    expect(ask.answer).toBe('3');
  });
});

describe('#2594 — the saved figures load to the same panel (no submit)', () => {
  it.each(['gauge-length-letter-2594.geo3.json', 'gauge-length-letter-tie-2594.geo3.json'])('%s: «k = ?»', (name) => {
    const loaded = deserializeFigure3(readFileSync(resolvePath(__dirname, '../../fixtures3', name), 'utf8'));
    if (!loaded.ok) throw new Error(`${name} did not load`);
    for (const seed of [0, 1, 2]) {
      const d = derive3(loaded.facts, seed);
      expect(Object.values(d.status).every((s) => s === 'ok')).toBe(true);
      expect(dataView(d.construction, seed).params.map((p) => p.text)).toEqual(['k = ?']);
    }
  });
});
