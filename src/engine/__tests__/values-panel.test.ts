/**
 * #217 (ADR-410): the VALUES PANEL — every fixed/known value, stated + derived, from the ONE shared
 * sample pool, printed only under the knowledge discipline (seed-invariance; ADR-295/#88 gate) with
 * exact forms (4√2, 9π) recognized at display time. And the recognizer itself.
 */
import { describe, expect, it } from 'vitest';
import { exactFormOf, formatExactText, formatValue } from '@/format';
import { computeValues } from '@/replay/core';
import { parse } from '@/parser/parse';
import { buildParseCtx } from '@/parser/context';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
/** Build facts through the real parse path (context threaded per step). */
function factsFrom(steps: string[]): Fact[] {
  let facts: Fact[] = [];
  for (const [gi, u] of steps.entries()) {
    const { construction, positions } = replay(facts, 0);
    const r = parse(u, buildParseCtx(construction, positions));
    if (!r.ok) throw new Error(`no parse: ${u}`);
    for (const cmd of r.commands) facts.push({ id: `g${gi}.${facts.length}`, utterance: u, group: `g${gi}`, cmd, enabled: true });
  }
  return facts;
}

describe('exact-form recognition (#217, ADR-410)', () => {
  it('recognizes the curriculum forms', () => {
    expect(formatExactText(exactFormOf(4 * Math.SQRT2)!)).toBe('4√2');
    expect(formatExactText(exactFormOf(9 * Math.PI)!)).toBe('9π');
    expect(formatExactText(exactFormOf(0.75)!)).toBe('3/4');
    expect(formatExactText(exactFormOf((2 * Math.sqrt(5)) / 3)!)).toBe('2√5/3');
    expect(formatExactText(exactFormOf((Math.sqrt(3) * Math.PI) / 2)!)).toBe('√3π/2');
    expect(formatExactText(exactFormOf(Math.sqrt(12))!)).toBe('2√3'); // simplified, never √12
  });
  it('never dresses a plain decimal as exact; integers stay plain', () => {
    expect(exactFormOf(7.34)).toBeNull();
    expect(formatValue(7.34)).toBe('7.34');
    expect(formatValue(8)).toBe('8');
    expect(formatValue(5.656854249492381)).toBe('4√2');
  });
});

describe('the values panel rows', () => {
  it('a sized square: stated side, derived sides, diagonal 4√2, area 16, right angles', () => {
    const facts = factsFrom(['ריבוע ABCD', 'AB = 4', 'AC']);
    const r = computeValues(facts);
    const len = (lab: string) => r.rows.find((x) => x.kind === 'length' && x.label === lab);
    expect(len('AB')?.value).toBeCloseTo(4, 4);
    expect(len('AB')?.stated).toBe(true);
    const otherSide = r.rows.find((x) => x.kind === 'length' && ['BC', 'CB', 'CD', 'DC'].includes(x.label));
    expect(otherSide?.value, 'derived side').toBeCloseTo(4, 4);
    expect(otherSide?.stated).toBe(false);
    const diag = r.rows.find((x) => x.kind === 'length' && ['AC', 'CA'].includes(x.label));
    expect(diag?.value, 'the diagonal').toBeCloseTo(4 * Math.SQRT2, 4);
    expect(diag?.exact && formatExactText(diag.exact), 'exact form 4√2').toBe('4√2');
    const area = r.rows.find((x) => x.kind === 'area' && x.label.split('').sort().join('') === 'ABCD');
    expect(area?.value, 'shoelace area').toBeCloseTo(16, 3);
    const angle = r.rows.find((x) => x.kind === 'angle');
    expect(angle?.value, 'square corners are right').toBeCloseTo(90, 3);
  });

  it('a circle with a stated radius: radius 3 (stated) + area 9π (derived, exact)', () => {
    const facts = factsFrom(['מעגל O שרדיוסו 3']);
    const r = computeValues(facts);
    const rad = r.rows.find((x) => x.kind === 'radius');
    expect(rad?.value).toBeCloseTo(3, 5);
    expect(rad?.stated).toBe(true);
    const area = r.rows.find((x) => x.kind === 'area' && x.label === '(O)');
    expect(area?.value).toBeCloseTo(9 * Math.PI, 4);
    expect(area?.exact && formatExactText(area.exact)).toBe('9π');
  });

  it('a median halves the triangle: the S/S/2S area-ratio class WITHOUT any absolute size (ADR-052 knowledge)', () => {
    const facts = factsFrom(['משולש ABC', 'D אמצע BC', 'משולש ABD', 'משולש ACD']);
    const r = computeValues(facts);
    expect(r.areaClasses.length, 'a ratio class exists').toBeGreaterThan(0);
    const cls = r.areaClasses[0];
    // ABD and ACD in ratio 1; ABC = 2× either — whichever polygon anchors the class
    expect(cls.labels.length).toBeGreaterThanOrEqual(2);
    const coefSet = new Set(cls.coefs.map((c) => Number(c.toFixed(3))));
    expect([...coefSet].every((c) => [0.5, 1, 2].includes(c)), `coefs ${cls.coefs}`).toBe(true);
    // and NO absolute length/area row leaked — the free triangle has no fixed sizes
    expect(r.rows.filter((x) => x.kind === 'length')).toHaveLength(0);
  });

  it('a FREE figure prints nothing numeric (seed-invariance is the knowledge gate)', () => {
    const facts = factsFrom(['משולש ABC']);
    const r = computeValues(facts);
    expect(r.rows.filter((x) => x.kind === 'length' || x.kind === 'area')).toHaveLength(0);
  });
});
