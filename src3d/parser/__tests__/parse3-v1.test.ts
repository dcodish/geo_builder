/**
 * V1 parser tests — the geometric-vector lane rules, both languages, plus the
 * honesty guards (Greek scalars never silently degrade to a free point).
 */

import { describe, expect, it } from 'vitest';
import { parse3, parseVecExpr } from '../parse3';

const cmds = (input: string) => {
  const r = parse3(input);
  expect(r.ok, input).toBe(true);
  return r.ok ? r.commands : [];
};

describe('parseVecExpr', () => {
  it('coefficient forms: fractions, glyphs, decimals, implicit 1, minus', () => {
    expect(parseVecExpr('1/2u + 1/2v + 5/3w')).toEqual([
      { coeff: 0.5, atom: { kind: 'named', name: 'u' } },
      { coeff: 0.5, atom: { kind: 'named', name: 'v' } },
      { coeff: 5 / 3, atom: { kind: 'named', name: 'w' } },
    ]);
    expect(parseVecExpr('-⅓u - ⅓v + ⅓w')).toEqual([
      { coeff: -1 / 3, atom: { kind: 'named', name: 'u' } },
      { coeff: -1 / 3, atom: { kind: 'named', name: 'v' } },
      { coeff: 1 / 3, atom: { kind: 'named', name: 'w' } },
    ]);
    expect(parseVecExpr("2KA'")).toEqual([{ coeff: 2, atom: { kind: 'pair', from: 'K', to: "A'" } }]);
    expect(parseVecExpr('AM')).toEqual([{ coeff: 1, atom: { kind: 'pair', from: 'A', to: 'M' } }]);
    expect(parseVecExpr('0.5·u - w')).toEqual([
      { coeff: 0.5, atom: { kind: 'named', name: 'u' } },
      { coeff: -1, atom: { kind: 'named', name: 'w' } },
    ]);
  });
  it('malformed terms are null (never partially parsed)', () => {
    expect(parseVecExpr('u + שלום')).toBeNull();
    expect(parseVecExpr('')).toBeNull();
  });
});

describe('נסמן / denote — vector naming', () => {
  it('Hebrew list with arrows tolerated; each name AUTO-DRAWS its segment (ADR-3D-003)', () => {
    expect(cmds("נסמן: AA'→ = w, KC→ = v, KB→ = u")).toEqual([
      { type: 'segment3', a: 'A', b: "A'" },
      { type: 'name-vector', name: 'w', from: 'A', to: "A'" },
      { type: 'segment3', a: 'K', b: 'C' },
      { type: 'name-vector', name: 'v', from: 'K', to: 'C' },
      { type: 'segment3', a: 'K', b: 'B' },
      { type: 'name-vector', name: 'u', from: 'K', to: 'B' },
    ]);
  });
  it('English', () => {
    expect(cmds("denote AB = u, AD = v, AA' = w")).toHaveLength(6);
  });
});

describe('claims', () => {
  it('vec-eq: auto-draws its pair segments, then the claim', () => {
    const r = cmds('AM = 1/2u + 1/2v + 5/3w');
    expect(r[0]).toEqual({ type: 'segment3', a: 'A', b: 'M' });
    expect(r[1]).toMatchObject({ type: 'claim', claim: { type: 'vec-eq' } });
  });
  it('perp-plane, Hebrew + English + proof prefix, draws segment + plane triangle', () => {
    for (const input of [
      "CA' מאונך למישור BC'D",
      "הוכיחו כי CA' מאונך למישור BC'D",
      "CA' is perpendicular to plane BC'D",
    ]) {
      const r = cmds(input);
      expect(r).toHaveLength(5);
      expect(r[0]).toEqual({ type: 'segment3', a: 'C', b: "A'" });
      expect(r[4]).toEqual({ type: 'claim', claim: { type: 'perp-plane', seg: ['C', "A'"], plane: ['B', "C'", 'D'] } });
    }
  });
  it('collinear, Hebrew + English', () => {
    expect(cmds("E, C, A' על ישר אחד")).toEqual([{ type: 'claim', claim: { type: 'collinear3', ids: ['E', 'C', "A'"] } }]);
    expect(cmds("E, C, A' are collinear")).toEqual([{ type: 'claim', claim: { type: 'collinear3', ids: ['E', 'C', "A'"] } }]);
  });
});

describe('centroid', () => {
  it('Hebrew + English, draws the triangle then the point', () => {
    for (const input of ["E מפגש התיכונים של משולש BC'D", "E is the centroid of triangle BC'D"]) {
      const r = cmds(input);
      expect(r).toHaveLength(4);
      expect(r[3]).toEqual({ type: 'centroid3', id: 'E', of: ['B', "C'", 'D'] });
    }
  });
});

describe('span-defined point (Greek scalars)', () => {
  it('P על AM כך ש-KP = αu + βv → a DRIVEN point + its segments, both languages', () => {
    for (const input of ['P על AM כך ש-KP = αu + βv', 'P on AM such that KP = αu + βv']) {
      const r = cmds(input);
      expect(r[0]).toEqual({ type: 'point-in-span', id: 'P', a: 'A', b: 'M', vecFrom: 'K', span: ['u', 'v'] });
      expect(r[1]).toEqual({ type: 'segment3', a: 'A', b: 'M' });
      expect(r[2]).toEqual({ type: 'segment3', a: 'K', b: 'P' });
    }
  });
  it('a Greek-scalar utterance that does not fit the span form is REFUSED — never a silent free point', () => {
    expect(parse3('P על AM כך ש-KP = αu')).toEqual({ ok: false, reason: 'not-handled' });
    expect(parse3('P על AM כך ש-QR = αu + βv')).toEqual({ ok: false, reason: 'not-handled' });
  });
});

describe('bare segment', () => {
  it('a lone pair (optionally with קטע/segment) draws an auxiliary segment', () => {
    expect(cmds("CA'")).toEqual([{ type: 'segment3', a: 'C', b: "A'" }]);
    expect(cmds('קטע AM')).toEqual([{ type: 'segment3', a: 'A', b: 'M' }]);
    expect(cmds('segment BD')).toEqual([{ type: 'segment3', a: 'B', b: 'D' }]);
  });
});
