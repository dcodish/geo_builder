/**
 * T5 — the principles lane (ADR-248; docs/18 §6/§9.4): the operator-authored teacher tips with
 * intent archetypes as a boosting subspecies. Locks:
 *  - the catalog↔table integrity guard (docs/10-pedagogy.md is the operator-editable source of
 *    truth; PRINCIPLE_TABLE must match it byte-for-byte — the 07 pattern on the operator's text);
 *  - the operator's motivating scenario: equalities over two triangles → the congruence-hunt
 *    archetype activates and lifts the criteria to band 0 (intent-aligned);
 *  - the D5 guardrails hold structurally: an archetype's tip is family-direction text (no object
 *    ids), and boosts only lift ids that FIRED (nothing is invented into the feed);
 *  - the ≤2-boosting / ≤3-visible anti-flood constants.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';
import { detectTheorems } from '../detect';
import { detectPrinciples, activeBoosts, PRINCIPLE_TABLE, BOOSTING_PRINCIPLES, PRINCIPLES_VISIBLE } from '../principles';

const here = dirname(fileURLToPath(import.meta.url));
const pedagogy = readFileSync(resolve(here, '../../../docs/10-pedagogy.md'), 'utf8');

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
function principlesOf(utterances: string[]) {
  const facts = factsOf(utterances);
  const { construction } = replay(facts);
  return { facts, construction, principles: detectPrinciples({ facts, construction }) };
}

describe('T5 principles lane (ADR-248)', () => {
  describe('the catalog↔table integrity guard (D7 — the operator-editable source of truth)', () => {
    const rows = new Map<string, { he: string; en: string }>();
    for (const line of pedagogy.split('\n')) {
      const m = line.match(/^\|\s*([a-z][a-z0-9-]*)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$/);
      if (m && m[1] !== 'slug') rows.set(m[1], { he: m[2], en: m[3] });
    }

    it('the catalog section exists and parses', () => {
      expect(rows.size).toBeGreaterThan(0);
    });

    it('is TOTAL both ways: every table entry is in the catalog and vice versa', () => {
      for (const def of PRINCIPLE_TABLE) expect(rows.has(def.id), `${def.id} missing from the 10-pedagogy catalog`).toBe(true);
      for (const slug of rows.keys()) expect(PRINCIPLE_TABLE.some((d) => d.id === slug), `catalog row ${slug} has no table entry`).toBe(true);
    });

    for (const def of PRINCIPLE_TABLE) {
      it(`${def.id}: tips are byte-equal to the catalog`, () => {
        const row = rows.get(def.id);
        expect(def.he).toBe(row?.he);
        expect(def.en).toBe(row?.en);
      });
    }

    it("D5 guardrail: an archetype's tip names a FAMILY direction, never an instantiated object", () => {
      // No uppercase point-label runs in any tip (a tip like "△ABE ≅ △DCE" would breach the ruling).
      for (const def of PRINCIPLE_TABLE) {
        expect(/[A-Z]{2,}/.test(def.he.replace(/90°|°/g, '')), `${def.id} he tip instantiates labels`).toBe(false);
      }
    });
  });

  describe("the operator's motivating scenario (§9.4's first gate)", () => {
    const script = ['triangle ABC', 'triangle DEF', 'AB = DE', 'BC = EF', 'CA = FD'];

    it('equalities over two triangles activate congruence-hunt', () => {
      const { principles } = principlesOf(script);
      expect(principles.some((p) => p.id === 'congruence-hunt')).toBe(true);
    });

    it('the active archetype lifts the fired criteria to band 0 (intent-aligned), top of the feed', () => {
      const { facts, construction, principles } = principlesOf(script);
      const feed = detectTheorems({ facts, construction, boosts: activeBoosts(principles) });
      const e20 = feed.find((e) => e.id === 20);
      expect(e20?.band).toBe(0);
      expect(e20?.rankTrace).toContain('intent-aligned');
      const headline = feed.filter((e) => e.salience === 'headline');
      expect(headline[0]?.id).toBe(20);
    });

    it('boosts only LIFT what fired — they never invent an entry', () => {
      const { facts, construction } = principlesOf(['triangle ABC', 'triangle DEF', 'AB = DE']);
      // congruence-hunt is not active (1 equality) and nothing fires 19 — boosting it adds nothing.
      const feed = detectTheorems({ facts, construction, boosts: [19] });
      expect(feed.some((e) => e.id === 19)).toBe(false);
    });
  });

  describe('archetype activations', () => {
    it('a stated bisector activates bisector-setup and lifts 78/80-family ids that fired', () => {
      const { facts, construction, principles } = principlesOf(['triangle ABC', 'AD bisects angle BAC']);
      expect(principles.some((p) => p.id === 'bisector-setup')).toBe(true);
      const feed = detectTheorems({ facts, construction, boosts: activeBoosts(principles) });
      expect(feed.find((e) => e.id === 78)?.band).toBe(0);
    });

    it('two side midpoints activate midsegment-setup BEFORE the joining segment exists', () => {
      const { principles } = principlesOf(['triangle ABC', 'D is the midpoint of AB', 'E is the midpoint of AC']);
      expect(principles.some((p) => p.id === 'midsegment-setup')).toBe(true);
    });

    it('a stated diameter with inscribed vertices activates thales-chain', () => {
      const { principles } = principlesOf(['circle O', 'C on circle O', 'diameter AB in circle O']);
      expect(principles.some((p) => p.id === 'thales-chain')).toBe(true);
    });

    it('a bare triangle activates NO archetype', () => {
      const { principles } = principlesOf(['triangle ABC']);
      expect(principles).toHaveLength(0);
    });
  });

  describe('anti-flood constants (§6)', () => {
    it('at most the top 2 principles boost; at most 3 render', () => {
      expect(BOOSTING_PRINCIPLES).toBe(2);
      expect(PRINCIPLES_VISIBLE).toBe(3);
    });

    it('activeBoosts unions only the top-2 principles', () => {
      const { principles } = principlesOf([
        'circle O',
        'C on circle O',
        'diameter AB in circle O',
        'M is the midpoint of AC',
        'N is the midpoint of AB',
        'AK bisects angle CAB',
      ]);
      expect(principles.length).toBeGreaterThanOrEqual(3);
      const boostsUnion = activeBoosts(principles);
      const fromTop2 = new Set(principles.slice(0, 2).flatMap((p) => p.boosts ?? []));
      expect(new Set(boostsUnion)).toEqual(fromTop2);
    });
  });
});
