/**
 * T4 — the OBSERVED lane (ADR-247; docs/18 §3/§7): `detectTheorems` accepts the sampled layers'
 * outputs (`observed`: relations classes + ADR-224 similar/congruent classes) and a few matchers
 * gain L3 evidence paths. Everything observed is L3 — amber, dial-gated, never the L1 default —
 * per the §7a cutoff ("known only by measuring the sampled drawings"). The observed inputs here are
 * SYNTHETIC (the layers' output shape, hand-built), so the tests stay fast and deterministic; the
 * sampling itself is the relations/shapes layers' own tested business.
 */

import { describe, it, expect } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';
import { detectTheorems } from '../detect';
import type { ObservedInputs, TheoremFeedEntry } from '../types';

function factsOf(utterances: string[]): Fact[] {
  const facts: Fact[] = [];
  let g = 0;
  for (const u of utterances) {
    const { construction, positions } = replay(facts);
    const r = parse(u, buildParseCtx(construction, positions));
    if (!r.ok) throw new Error(`did not parse: ${u}`);
    const group = `g${g++}`;
    for (const cmd of r.commands as AnyCommand[]) facts.push({ id: `${group}.${facts.length}`, utterance: u, group, cmd, enabled: true });
  }
  return facts;
}
function feedWith(utterances: string[], observed?: ObservedInputs): TheoremFeedEntry[] {
  const facts = factsOf(utterances);
  const { construction } = replay(facts);
  return detectTheorems({ facts, construction, observed });
}
const REL_EMPTY = { equalSegments: [], equalAngles: [], definiteAngles: [], samplesUsed: 4 };

describe('T4 observed lane (ADR-247)', () => {
  it('an observed SIMILAR class fires 69 at L3 amber; without observed it stays silent', () => {
    const base = ['triangle ABC', 'triangle DEF'];
    expect(feedWith(base).some((e) => e.id === 69)).toBe(false);
    const feed = feedWith(base, { similar: [{ kind: 'similar', triangles: [['A', 'B', 'C'], ['D', 'E', 'F']] }] });
    const e69 = feed.find((e) => e.id === 69);
    expect(e69?.level).toBe(3);
    expect(e69?.tier).toBe('possible');
  });

  it('an observed CONGRUENT class fires SSS (20) at L3 amber', () => {
    const feed = feedWith(['triangle ABC', 'triangle DEF'], { similar: [{ kind: 'congruent', triangles: [['A', 'B', 'C'], ['D', 'E', 'F']] }] });
    const e20 = feed.find((e) => e.id === 20);
    expect(e20?.level).toBe(3);
    expect(e20?.tier).toBe('possible');
  });

  it('a FORCED 90° (never stated) fires Pythagoras (28) at L3 amber', () => {
    const base = ['triangle ABC'];
    expect(feedWith(base).some((e) => e.id === 28)).toBe(false);
    const feed = feedWith(base, { relations: { ...REL_EMPTY, definiteAngles: [{ vertex: 'B', a: 'A', b: 'C', valueDeg: 90 }] } });
    const e28 = feed.find((e) => e.id === 28);
    expect(e28?.level).toBe(3);
    expect(e28?.tier).toBe('possible');
  });

  it('a forced NON-right angle does not fire 28', () => {
    const feed = feedWith(['triangle ABC'], { relations: { ...REL_EMPTY, definiteAngles: [{ vertex: 'B', a: 'A', b: 'C', valueDeg: 60 }] } });
    expect(feed.some((e) => e.id === 28)).toBe(false);
  });

  it('an observed equal-segment class sharing an endpoint fires isosceles (22) at L3', () => {
    const base = ['triangle ABC'];
    expect(feedWith(base).some((e) => e.id === 22)).toBe(false);
    const feed = feedWith(base, { relations: { ...REL_EMPTY, equalSegments: [[['A', 'B'], ['A', 'C']]] } });
    const e22 = feed.find((e) => e.id === 22);
    expect(e22?.level).toBe(3);
  });

  it('an equal-segment class with DISJOINT members (no shared apex) does not read as isosceles', () => {
    const feed = feedWith(['quadrilateral ABCD'], { relations: { ...REL_EMPTY, equalSegments: [[['A', 'B'], ['C', 'D']]] } });
    expect(feed.some((e) => e.id === 22)).toBe(false);
  });

  it('every observed entry is level 3 — the D4 default (L1) never shows it', () => {
    const feed = feedWith(['triangle ABC', 'triangle DEF'], {
      similar: [{ kind: 'similar', triangles: [['A', 'B', 'C'], ['D', 'E', 'F']] }],
      relations: { ...REL_EMPTY, definiteAngles: [{ vertex: 'B', a: 'A', b: 'C', valueDeg: 90 }] },
    });
    const observedIds = [69, 28];
    for (const id of observedIds) {
      const e = feed.find((x) => x.id === id);
      expect(e?.level, `#${id}`).toBe(3);
    }
    const l1View = feed.filter((e) => e.level <= 1).map((e) => e.id);
    for (const id of observedIds) expect(l1View).not.toContain(id);
  });
});
