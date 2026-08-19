/**
 * #751 (ADR-W-029) — THE store-side ingest invariant, complex half.
 *
 * This product's chips were already clean (they come from `toolConfig.quickCommands` /
 * `EXAMPLE_LINES`, never from a post-processed `t()`), so the defect was not observable here. The
 * invariant is still enforced at this store: `lines` is the source of truth that is saved, replayed
 * and exported, and the next surface that hands it a `t()`-derived string must not be able to
 * poison it. A rule that holds in two products and is left to habit in the third is not a rule.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useComplexStore } from '../useComplexStore';
import { hydrateSession, submitLine } from '../../app/submit';

const LRI = String.fromCharCode(0x2066);
const PDI = String.fromCharCode(0x2069);
const CONTROLS = /[؜​-‏‪-‮⁦-⁩﻿]/;

const store = () => useComplexStore.getState();

describe('#751 — the complex line list never holds presentation characters', () => {
  beforeEach(() => store().clearAll());

  it('a submitted line is stored cleaned', () => {
    expect(submitLine(`${LRI}z1 = 3+4i${PDI}`)).toBe(true);
    expect(store().lines).toEqual(['z1 = 3+4i']);
  });

  it('a muted line records cleaned', () => {
    store().recordDisabledLine(`${LRI}z2 = 1+i${PDI}`);
    expect(store().lines[0]).toBe('z2 = 1+i');
  });

  it('replaceLine (the edit path) cleans too', () => {
    expect(submitLine('z1 = 3+4i')).toBe(true);
    store().replaceLine(0, `${LRI}z1 = 5${PDI}`, 0);
    expect(store().lines[0]).toBe('z1 = 5');
  });

  it('a session saved BEFORE the fix hydrates clean', () => {
    // A REAL envelope from the store's own serializer, then dirtied exactly as a pre-fix session
    // would have written it — so this cannot rot against a hand-written shape.
    expect(submitLine('z1 = 3+4i')).toBe(true);
    const saved = store().serialize();
    const dirty = { ...saved, lines: saved.lines.map((l) => `${LRI}${l}${PDI}`) };
    store().clearAll();

    expect(hydrateSession(dirty)).toBe(true);
    expect(store().lines.every((l) => !CONTROLS.test(l))).toBe(true);
    expect(store().lines[0]).toBe('z1 = 3+4i');
  });
});
