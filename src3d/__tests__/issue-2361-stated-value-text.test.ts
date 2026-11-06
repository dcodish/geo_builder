/**
 * #2361 ([ADR-3D-416](../../docs/06b-decisions-3d.md#adr-3d-416)) — A STATED LENGTH READS ONE TEXT, IN THE HOUSE DECIMALS.
 *
 * The report: «AC = 7.9999» shows «8» on the edge and in the panel. The operator ruled that correct (sr-22,
 * ADR-W-175, 2026-11-02): *"the tool should display two decimals after the point whenever needed. But it should
 * calculate the full number."* What the re-measure found under it, in 3-D only (2-D already reads «4.1»):
 *  - a typed DECIMAL was dressed by the exact-form tier: «AC = 4.1» read «41/10», «2.5» read «5/2»;
 *  - the canvas printed a stated value at 3 places and the panel at 2: «4.005» vs «4.01».
 * Root: the stated value reached both surfaces as a bare number, and each re-formatted it on its own. Now the
 * parser keeps the spelling (#1497 / ADR-3D-426 replaced this file's `decimal` mark with `src`), and `statedLengths`
 * carries the one text both surfaces print.
 *
 * Driven through the real store (`submit`), the real canvas (`buildScene3`) and the real panel (`dataView`).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { buildScene3 } from '../render/scene3';
import { HOME_CAMERA } from '../render/camera';
import { dataView, statedMagText } from '../engine/dataView';
import { parse3 } from '../parser/parse3';

const st = () => useGeo3.getState();
function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
/** The label on pair `pair` on the canvas, and its `|pair| = …` row in the panel. */
function read(us: string[], pair: string) {
  reset();
  for (const u of us) st().submit(u);
  expect(st().lastError, us.join(' · ')).toBeNull();
  const d = derive3(st().facts, st().seed);
  const s = buildScene3(d.construction, d.resolved, HOME_CAMERA, { width: 640, height: 460 }, 1);
  const key = [...pair].sort().join('');
  const canvas = s.measures.find((m) => [m.a, m.b].sort().join('') === key)?.text ?? null;
  const p = dataView(d.construction, 0);
  const row = [...p.vectors.map((v) => v.mag), ...p.stated].find((r) => r?.startsWith(`|${pair}| = `)) ?? null;
  return { canvas, panel: row ? row.slice(`|${pair}| = `.length) : null, rows: p };
}

const TRI = ['משולש ABC', 'AB = 5', 'BC = 3'];

describe('#2361 — the operator’s sequence', () => {
  beforeEach(reset);

  it('«AC = 7.9999» reads «8» on the edge and in the panel (sr-22: two decimals when needed)', () => {
    expect(read([...TRI, 'AC = 7.9999'], 'AC')).toMatchObject({ canvas: '8', panel: '8' });
  });

  it('…and is computed with the full value: AC² is 7.9999², not 64', () => {
    const { rows } = read([...TRI, 'AC = 7.9999'], 'AC');
    const sq = rows.vectors.find((v) => v.label === 'AC')?.sq;
    expect(sq).toBe(`AC² = ${statedMagText(7.9999 * 7.9999, String(7.9999 * 7.9999))}`); // 63.9984 → «64» at two places, from the full value
  });
});

describe('#2361 — a typed decimal is never dressed as a fraction', () => {
  beforeEach(reset);

  it.each([
    ['AC = 4.1', '4.1'],
    ['AC = 2.25', '2.25'],
    ['AC = 2.5', '2.5'],
    ['AC = 4.005', '4.01'],
    ['AC = 4.123', '4.12'],
    ['AC = 7.001', '7'],
  ])('«%s» reads «%s» on both surfaces', (line, text) => {
    expect(read([...TRI, line], 'AC')).toMatchObject({ canvas: text, panel: text });
  });

  it.each([
    ['|AB| = 2.5'],
    ['אורך AB הוא 2.5'],
    ['AB = 2.5'],
  ])('every spelling of a stated length: «%s» reads «2.5»', (line) => {
    expect(read(['משולש ABC', line], 'AB')).toMatchObject({ canvas: '2.5', panel: '2.5' });
  });

  it('a stated height carries it too: «גובה הפירמידה SO = 2.5», «גובה הפירמידה 2.5»', () => {
    expect(read(['פירמידה SABCD', 'גובה הפירמידה SO = 2.5'], 'SO')).toMatchObject({ canvas: '2.5', panel: '2.5' });
    reset();
    for (const u of ['פירמידה SABCD', 'גובה הפירמידה 2.5']) st().submit(u);
    const d = derive3(st().facts, st().seed);
    const s = buildScene3(d.construction, d.resolved, HOME_CAMERA, { width: 640, height: 460 }, 1);
    expect(s.measures.map((m) => m.text)).toEqual(['2.5']);
  });

  it('a stated magnitude of a free vector: «|u| = 2.5» reads «2.5» on every panel row', () => {
    reset();
    for (const u of ['וקטור u', '|u| = 2.5']) st().submit(u);
    expect(st().lastError).toBeNull();
    const p = dataView(derive3(st().facts, st().seed).construction, 0);
    const rows = JSON.stringify(p).match(/\|u\| = [^"]*/g);
    expect(rows).not.toBeNull();
    expect(new Set(rows)).toEqual(new Set(['|u| = 2.5']));
  });

  it('an equal-length class row prints the stated text too: «|AB| = |AD| = 2.5» on a cube', () => {
    const { rows } = read(["קובייה ABCDA'B'C'D'", 'AB = 2.5', 'קטע AD'], 'AB');
    const cls = rows.relations.filter((r) => r.includes('|AB|') && r.includes('|AD|'));
    expect(cls.length).toBeGreaterThan(0);
    for (const r of cls) expect(r).toMatch(/= 2.5$/);
  });

  it('a box edge at 3 places reads the house 2 on the canvas too — one text per stated value', () => {
    expect(read(["תיבה ABCDA'B'C'D'", 'AB = 2.3333'], 'AB')).toMatchObject({ canvas: '2.33', panel: '2.33' });
  });
});

describe('#2361 — controls: an exact form as typed is unchanged', () => {
  beforeEach(reset);

  it.each([
    ['AC = 7', '7'],
    ['AC = √20', '√20'], // #1497: was «2√5»; a typed root stays as typed (ruling 2026-09-28)
    ['AC = 2√3', '2√3'],
    ['AC = 9/2', '9/2'],
    ['AC = 3√7/2', '3√7/2'],
  ])('«%s» reads «%s» on both surfaces', (line, text) => {
    expect(read([...TRI, line], 'AC')).toMatchObject({ canvas: text, panel: text });
  });

  it('a computed magnitude («2|AB| = 5» states |AB| = 5/2) keeps the exact tier', () => {
    const r = parse3('2|u| = 5');
    expect(r.ok && r.commands.some((c) => 'src' in c || 'decimal' in c)).toBe(false);
  });
});

describe('#2361 → #1497 — the parser carries the spelling of what was typed', () => {
  const claimOf = (line: string) => {
    const r = parse3(line);
    if (!r.ok) throw new Error(line);
    return r.commands.find((c) => c.type === 'claim' || c.type === 'vec-mag' || c.type === 'mag-val' || c.type === 'perp-to-base');
  };
  it.each(['AB = 4.1', '|AB| = 4.1', 'אורך AB הוא 4.1', 'AB = -4.1', 'AS גובה הפירמידה = 4.1'])('«%s» carries it', (line) => {
    expect(JSON.stringify(claimOf(line))).toContain('"src":');
  });
  it.each([['AB = 41/10', '41/10'], ['AB = √2', '√2'], ['AB = 2.5√2', '2.5√2'], ['|AB| = 3/4', '3/4']])('«%s» carries «%s»', (line, src) => {
    expect(JSON.stringify(claimOf(line))).toContain(`"src":"${src}"`);
  });
  it('an integer spells itself in every tier, so it carries nothing', () => {
    expect(JSON.stringify(claimOf('AB = 4'))).not.toContain('src');
  });
  it('«|w| = 2.5» on a named vector and «גובה הפירמידה 2.5» carry it to their own command', () => {
    expect(claimOf('|w| = 2.5')).toMatchObject({ type: 'vec-mag', src: '2.5' });
    expect(claimOf('גובה הפירמידה 2.5')).toMatchObject({ type: 'perp-to-base', lenSrc: '2.5' });
  });
});
