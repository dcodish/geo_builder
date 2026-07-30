/**
 * #217 (ADR-410): the VALUES PANEL — every fixed/known value, stated + derived, from the ONE shared
 * sample pool, printed only under the knowledge discipline (seed-invariance; ADR-295/#88 gate) with
 * exact forms (4√2, 9π) recognized at display time. And the recognizer itself.
 */
import { describe, expect, it } from 'vitest';
import { exactFormOf, formatExactText, formatValue } from '@/format';
import { computeValues, detectAll } from '@/replay/core';
import { freeDofCount } from '@/engine/sample';
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

describe('#414 — היקף rides the same knowledge as the area', () => {
  it("a circle's circumference prints beside its area (6π for r = 3)", () => {
    const facts = factsFrom(['מעגל O שרדיוסו 3']);
    const r = computeValues(facts);
    const per = r.rows.find((x) => x.kind === 'perimeter' && x.label === '(O)');
    expect(per?.value, 'circumference 2πr').toBeCloseTo(6 * Math.PI, 4);
    expect(per?.exact && formatExactText(per.exact), 'exact form').toBe('6π');
    expect(per?.stated, 'derived from the radius, not stated').toBe(false);
    // the pair is the point: printing one and withholding the other was the oversight
    expect(r.rows.some((x) => x.kind === 'area' && x.label === '(O)'), 'area still there').toBe(true);
  });

  it("a sized square's perimeter is 16 beside its area 16", () => {
    const facts = factsFrom(['ריבוע ABCD', 'AB = 4']);
    const r = computeValues(facts);
    const per = r.rows.find((x) => x.kind === 'perimeter' && x.label.split('').sort().join('') === 'ABCD');
    expect(per?.value, 'Σ of the four sides').toBeCloseTo(16, 3);
    expect(per?.stated, 'derived from the side given').toBe(false);
  });

  it('a STATED perimeter is marked נתון', () => {
    const facts = factsFrom(['משולש ABC', 'היקף ABC = 20']);
    const r = computeValues(facts);
    const per = r.rows.find((x) => x.kind === 'perimeter' && x.label.split('').sort().join('') === 'ABC');
    expect(per?.value).toBeCloseTo(20, 3);
    expect(per?.stated, 'the student stated it').toBe(true);
  });

  it('a FREE figure prints no perimeter either (the knowledge gate is not bypassed)', () => {
    const facts = factsFrom(['משולש ABC']);
    const r = computeValues(facts);
    expect(r.rows.filter((x) => x.kind === 'perimeter')).toHaveLength(0);
  });
});

describe('#426 (ADR-421) — an absolute magnitude needs the SCALE pinned, not merely a rigid shape', () => {
  it('a bare square states no size, so it prints no length/area/perimeter — but keeps its right angles', () => {
    const facts = factsFrom(['ריבוע ABCD', 'AC']);
    const r = computeValues(facts);
    // freeDofCount is 0 (rigid UP TO SIMILARITY) and the pool is a single sample, so every magnitude
    // trivially "agreed with itself" and the drawing's arbitrary 5 printed as a given.
    expect(freeDofCount(replay(facts, 0).construction), 'shape-rigid').toBe(0);
    expect(r.rows.filter((x) => x.kind === 'length'), 'no invented lengths').toHaveLength(0);
    expect(r.rows.filter((x) => x.kind === 'area'), 'no invented area').toHaveLength(0);
    expect(r.rows.filter((x) => x.kind === 'perimeter'), 'no invented perimeter').toHaveLength(0);
    // the asymmetry IS the point — angles are scale-free knowledge on the very same figure
    const angles = r.rows.filter((x) => x.kind === 'angle');
    expect(angles.length).toBeGreaterThan(0);
    expect(angles[0].value).toBeCloseTo(90, 3);
  });

  it('the CANVAS half: a bare square offers no definite length either (the #126 labels)', () => {
    const { relations } = detectAll(factsFrom(['ריבוע ABCD', 'AC']));
    expect(relations.definiteLengths, 'the drawing scale is not a length label').toHaveLength(0);
    // …while the equal-side classes, which are ratios, still stand
    expect(relations.equalSegments.length, 'equal sides are scale-free knowledge').toBeGreaterThan(0);
  });

  it('a circle with no stated size prints neither radius nor its derived area/circumference', () => {
    const r = computeValues(factsFrom(['מעגל O']));
    expect(r.rows.filter((x) => x.kind === 'radius')).toHaveLength(0);
    expect(r.rows.filter((x) => x.kind === 'area' || x.kind === 'perimeter')).toHaveLength(0);
  });

  it('ONE size given turns the whole figure back on (the control — nothing else changed)', () => {
    const facts = factsFrom(['ריבוע ABCD', 'AC', 'BC = 4']);
    const r = computeValues(facts);
    const len = (lab: string) => r.rows.find((x) => x.kind === 'length' && [...x.label].sort().join('') === [...lab].sort().join(''));
    expect(len('BC')?.value).toBeCloseTo(4, 4);
    expect(len('AB')?.value, 'derived from the one given').toBeCloseTo(4, 4);
    expect(len('AC')?.value).toBeCloseTo(4 * Math.SQRT2, 4);
    expect(r.rows.find((x) => x.kind === 'area')?.value).toBeCloseTo(16, 3);
    expect(detectAll(facts).relations.definiteLengths.length, 'the canvas prints again too').toBeGreaterThan(0);
  });

  it('a ratio class survives with no absolute anywhere (it never depended on the scale)', () => {
    const r = computeValues(factsFrom(['משולש ABC', 'D אמצע BC', 'משולש ABD', 'משולש ACD']));
    expect(r.areaClasses.length, 'S / S / 2S still reported').toBeGreaterThan(0);
  });
});
