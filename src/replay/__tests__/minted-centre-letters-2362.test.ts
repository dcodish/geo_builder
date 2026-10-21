/**
 * #2362 / #2369 ([ADR-748](../../../docs/06-decisions.md#adr-748)) — the naming core over a circle drawn through drawn
 * points (`circumcircle`): which centre letters the tool minted, the real-letter step-aside, the `adopt` op, and that a
 * replayed naming applies only while its letter is still minted.
 */
import { describe, expect, it } from 'vitest';
import { applyNameByUse, mintedCentreLetters, nameCentreFacts, resolveBinds, stepAsideFacts } from '@/replay/naming';
import type { Fact } from '@/replay/core';
import type { AnyCommand } from '@/engine';
import { buildParseCtx, impliedCircleBinding } from '@/parser';
import { replay } from '@/store/geoStore';

const fact = (id: string, utterance: string, cmd: AnyCommand): Fact => ({ id, utterance, cmd, enabled: true });
const TRI = fact('t', 'משולש ABC', { type: 'triangle', ids: ['A', 'B', 'C'] });
const circum = (utterance: string, autoCenter?: boolean): Fact =>
  fact('c', utterance, { type: 'circumcircle', id: 'circle-O', center: 'O', a: 'A', b: 'B', c: 'C', ...(autoCenter === undefined ? {} : { autoCenter }) });

describe('mintedCentreLetters', () => {
  it('a minted circumcircle letter is minted; a named one is not; a legacy fact without the flag reads as minted', () => {
    expect(mintedCentreLetters([TRI, circum('משולש ABC חסום במעגל', true)])).toEqual(['O']);
    expect(mintedCentreLetters([TRI, circum('משולש ABC חסום במעגל O', false)])).toEqual([]);
    expect(mintedCentreLetters([TRI, circum('משולש ABC חסום במעגל')])).toEqual(['O']);
  });
  it('a letter a line typed, or a name-center promoted, is the student\'s', () => {
    const minted = circum('משולש ABC חסום במעגל', true);
    expect(mintedCentreLetters([TRI, minted, fact('a', 'זווית BOC = 100', { type: 'set-angle', vertex: 'O', ray1: 'B', ray2: 'C', value: 100 })])).toEqual([]);
    expect(mintedCentreLetters([TRI, minted, fact('n', '', { type: 'name-center', center: 'O' })])).toEqual([]);
  });
  it('the hidden tokens of unnamed circles are still listed', () => {
    expect(mintedCentreLetters([fact('k', 'נתון מעגל', { type: 'circle', id: 'circle-O', center: '@ctr-O', radius: 5, autoCenter: true })])).toEqual(['O']);
  });
});

describe('stepAsideFacts over a minted circumcircle letter', () => {
  const facts = [TRI, circum('משולש ABC חסום במעגל', true)];
  it('without a view (the rename / naming cores) only tokens move — unchanged', () => {
    expect(stepAsideFacts(facts, ['O']).moves).toEqual([]);
  });
  it('not visible: the real letter steps aside across the commands, the utterances untouched', () => {
    const r = stepAsideFacts(facts, ['O'], new Set(['A', 'B', 'C']));
    expect(r.moves).toEqual([{ from: 'O', to: 'P' }]);
    expect(r.facts[1].cmd).toMatchObject({ id: 'circle-P', center: 'P', autoCenter: true });
    expect(r.facts[1].utterance).toBe('משולש ABC חסום במעגל');
  });
  it('visible: the letter is adopted (autoCenter false), nothing moves', () => {
    const r = stepAsideFacts(facts, ['O'], new Set(['A', 'B', 'C', 'O']));
    expect(r.moves).toEqual([]);
    expect(r.adopted).toEqual(['O']);
    expect(r.facts[1].cmd).toMatchObject({ center: 'O', autoCenter: false });
  });
});

describe('applyNameByUse — step-aside and adopt replay only while the letter is still minted', () => {
  const minted = [TRI, circum('משולש ABC חסום במעגל', true)];
  it('a step-aside re-letters a minted letter', () => {
    const out = applyNameByUse(minted, { type: 'name-by-use', op: 'step-aside', from: '@ctr-O', to: '@ctr-P' });
    expect(out[1].cmd).toMatchObject({ id: 'circle-P', center: 'P' });
  });
  it('once adopted, a step-aside applies nothing', () => {
    const adopted = applyNameByUse(minted, { type: 'name-by-use', op: 'adopt', from: '@ctr-O', to: '@ctr-O' });
    expect(adopted[1].cmd).toMatchObject({ center: 'O', autoCenter: false });
    expect(applyNameByUse(adopted, { type: 'name-by-use', op: 'step-aside', from: '@ctr-O', to: '@ctr-P' })).toBe(adopted);
  });
  it('the adopt row in a line\'s group is applied by resolveBinds to the facts BEFORE it', () => {
    const line = [fact('b', 'זווית BOC = 100', { type: 'name-by-use', op: 'adopt', from: '@ctr-O', to: '@ctr-O' })];
    const out = resolveBinds([...minted, ...line]);
    expect(out[1].cmd).toMatchObject({ autoCenter: false });
  });
});

describe('nameCentreFacts over a circumcircle', () => {
  it('naming a minted centre its own letter is a real change: the centre is revealed', () => {
    const r = nameCentreFacts([TRI, circum('משולש ABC חסום במעגל', true)], 'O', 'O');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.facts[1].cmd).toMatchObject({ center: 'O', autoCenter: false });
  });
  it('a named centre renamed to itself is still "same"', () => {
    expect(nameCentreFacts([TRI, circum('משולש ABC חסום במעגל O', false)], 'O', 'O')).toMatchObject({ ok: false, reason: 'same' });
  });
  it('naming a minted centre K renames it and reveals it', () => {
    const r = nameCentreFacts([TRI, circum('משולש ABC חסום במעגל', true)], 'O', 'K');
    expect(r.ok && r.facts[1].cmd).toMatchObject({ id: 'circle-K', center: 'K', autoCenter: false });
  });
});

describe('impliedCircleBinding — the subjects\' circles INTERSECT (amends ADR-347)', () => {
  // two unnamed circles: Q through A, B, E, D and P through A, B, C (B on both, C on P only)
  const PRE: Fact[] = [
    fact('1', 'משולש CDE', { type: 'triangle', ids: ['C', 'D', 'E'] }),
    fact('2', 'A על CD', { type: 'point-on-segment', id: 'A', a: 'C', b: 'D' }),
    fact('3', 'B על CE', { type: 'point-on-segment', id: 'B', a: 'C', b: 'E' }),
    fact('4', 'מרובע ABED חסום במעגל', { type: 'circumcircle', id: 'circle-Q', center: 'Q', a: 'A', b: 'B', c: 'E', autoCenter: true }),
    fact('5', 'מרובע ABED חסום במעגל', { type: 'set-concyclic', points: ['A', 'B', 'E', 'D'] }),
    fact('6', 'משולש ABC חסום במעגל', { type: 'circumcircle', id: 'circle-P', center: 'P', a: 'A', b: 'B', c: 'C', autoCenter: true }),
  ];
  const d = replay(PRE, 0);
  const ctx = buildParseCtx(d.construction, d.positions);
  const cand: AnyCommand = { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true, ifAbsent: true, implied: 'by-member' };
  const on = (id: string): AnyCommand => ({ type: 'point-on-circle', id, circle: 'circle-O' });
  it('{Q,P} ∩ {P} binds P', () => {
    expect(impliedCircleBinding([cand, on('B'), on('C')], ctx)).toEqual({ from: 'P', to: 'O' });
  });
  it('a subject on both circles alone is the crossing — the circles are told apart, so it asks', () => {
    expect(impliedCircleBinding([cand, on('B')], ctx)).toEqual({ clarify: 'unknown-circle', center: 'O' });
  });
  it('subjects on disjoint circles ask, never a new circle', () => {
    expect(impliedCircleBinding([cand, on('E'), on('C')], ctx)).toEqual({ clarify: 'unknown-circle', center: 'O' });
  });
  it('a subject on no circle is skipped', () => {
    expect(impliedCircleBinding([cand, on('X'), on('C')], ctx)).toEqual({ from: 'P', to: 'O' });
  });
});
