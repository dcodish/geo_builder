/**
 * #776 (ADR-466) — the TERSE label-first intersection: «D מפגש המעגל עם AB» / «D חיתוך המעגל עם AB»
 * / «M מפגש AB ו-CD». Prod (session ah1kqxz5): an otherwise almost fully deterministic bagrut
 * session lost a turn to «D מפגש המעגל עם AB» → LLM → not-understood, and the student discovered
 * the workaround («נקודה D היא מפגש המעגל עם AB») themselves. The construct was fully supported —
 * only the terse spelling was missing, in two owning rules: the circle-crossing lane's
 * `leadingNamedPoint` demanded the «נקודת» descriptor, and `lineLineIntersection`'s label-first
 * slot knew «חיתוך» but not «מפגש».
 */
import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx } from '../index';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';

// the ah1kqxz5 opening
const facts: Fact[] = [];
['מעגל שרדיוסו R ומרכזו O', 'B ו C על המעגל'].forEach((u, gi) => {
  const { construction, positions } = replay(facts, 0);
  const r = parse(u, buildParseCtx(construction, positions));
  if (r.ok) r.commands.forEach((cmd, ci) => facts.push({ id: `g${gi}.${ci}`, utterance: u, group: `g${gi}`, cmd, enabled: true }));
});
const { construction, positions } = replay(facts, 0);
const ctx = buildParseCtx(construction, positions);

describe('#776 — the terse label-first spelling lowers exactly like the copula form', () => {
  it('the prod line: «D מפגש המעגל עם AB» ≡ «נקודה D היא מפגש המעגל עם AB»', () => {
    const workaround = parse('נקודה D היא מפגש המעגל עם AB', ctx);
    expect(workaround.ok).toBe(true);
    for (const terse of ['D מפגש המעגל עם AB', 'D חיתוך המעגל עם AB']) {
      const r = parse(terse, ctx);
      expect(r.ok, terse).toBe(true);
      if (r.ok && workaround.ok) expect(r.commands, terse).toEqual(workaround.commands);
    }
  });

  it('the long noun form is untouched', () => {
    const r = parse('D נקודת המפגש של המעגל עם AB', ctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.commands.map((c) => c.type)).toContain('line-circle-intersection');
  });

  it('the segment×segment carrier: «M מפגש AB ו-CD» ≡ «M חיתוך AB ו-CD», both joiner spellings', () => {
    const baseline = parse('M חיתוך AB ו CD', ctx);
    expect(baseline.ok).toBe(true);
    for (const terse of ['M מפגש AB ו CD', 'M מפגש AB ו-CD']) {
      const r = parse(terse, ctx);
      expect(r.ok, terse).toBe(true);
      if (r.ok && baseline.ok) expect(r.commands, terse).toEqual(baseline.commands);
    }
  });
});
