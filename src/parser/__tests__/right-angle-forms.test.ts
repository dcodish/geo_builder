/**
 * Right-angle word / glyph forms (#45 / ADR-299).
 *
 * Four prod-failing input families, all fixed at the parse-entry normalization chokepoint or in the one
 * `angle` rule: the ∡/∢ angle glyphs and the ⁰ superscript-degree; uppercase Cyrillic homoglyphs in labels;
 * the WORD form "ישרה" / "right angle" ≡ "= 90"; and a lowercase vertex ("נתון זווית d=90").
 */
import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import type { ParseContext } from '@/parser';
import type { AnyCommand } from '@/engine';

const CTX: ParseContext = { points: ['A', 'B', 'C', 'D', 'E'], neighbors: { B: ['A', 'C'], D: ['A', 'C'], E: ['A', 'C'] } } as ParseContext;
const setAngleOf = (cmds: AnyCommand[]) => cmds.find((c) => c.type === 'set-angle') as { vertex: string; value: number } | undefined;
const ok = (u: string, ctx: ParseContext = CTX) => {
  const r = parse(u, ctx);
  expect(r.ok, `"${u}" should parse`).toBe(true);
  if (!r.ok) throw new Error('unreachable');
  return r.commands;
};

describe('#45 — angle / degree GLYPH variants', () => {
  it('∡ (measured-angle) + ⁰ (superscript degree): ∡CDB=90⁰ → ∠CDB=90', () => {
    expect(setAngleOf(ok('∡CDB=90⁰'))).toMatchObject({ vertex: 'D', value: 90 });
  });
  it('∢ (spherical-angle) glyph reads as ∠', () => {
    expect(setAngleOf(ok('∢CDB=90'))).toMatchObject({ vertex: 'D', value: 90 });
  });
  it('the canonical ∠/° still work (unchanged)', () => {
    expect(setAngleOf(ok('∠CDB=90°'))).toMatchObject({ vertex: 'D', value: 90 });
  });
});

describe('#45 — Cyrillic homoglyph labels', () => {
  it('a diameter named with Cyrillic АВ builds (А,В → A,B)', () => {
    const cmds = ok('מעגל עם קוטר АВ', { points: [] } as ParseContext);
    // the diameter construction: a segment A–B + a circle on it — the labels are LATIN, no Cyrillic leak
    expect(cmds.some((c) => c.type === 'segment' && (c as { a: string }).a === 'A' && (c as { b: string }).b === 'B'), 'segment A–B').toBe(true);
    expect(cmds.some((c) => c.type.startsWith('circle')), 'a circle is created').toBe(true);
    const ids = cmds.flatMap((c) => Object.values(c).filter((v): v is string => typeof v === 'string'));
    expect(ids.every((v) => !/[А-Я]/.test(v)), 'no Cyrillic leaked into a label').toBe(true);
  });
});

describe('#45 — the right-angle WORD form ("ישרה" / "right angle") ≡ = 90', () => {
  it('single vertex: זוית B ישרה', () => expect(setAngleOf(ok('זוית B ישרה'))).toMatchObject({ vertex: 'B', value: 90 }));
  it('vertex-first: E זוית ישרה', () => expect(setAngleOf(ok('E זוית ישרה'))).toMatchObject({ vertex: 'E', value: 90 }));
  it('three-letter: זוית ABC ישרה', () => expect(setAngleOf(ok('זוית ABC ישרה'))).toMatchObject({ vertex: 'B', value: 90 }));
  it('English: angle ABC is a right angle', () => expect(setAngleOf(ok('angle ABC is a right angle'))).toMatchObject({ vertex: 'B', value: 90 }));
});

describe('#45 — lowercase vertex ("נתון זווית d=90")', () => {
  it('נתון זווית d=90 → ∠D = 90 (lowercase adopted, prefix already worked)', () => {
    expect(setAngleOf(ok('נתון זווית d=90'))).toMatchObject({ vertex: 'D', value: 90 });
  });
  it('spaced: זווית d = 90', () => expect(setAngleOf(ok('זווית d = 90'))).toMatchObject({ vertex: 'D', value: 90 }));
});

describe('#45 — NO regressions on existing angle forms', () => {
  it('∠ABC = 37 (numeric three-letter)', () => expect(setAngleOf(ok('∠ABC = 37'))).toMatchObject({ vertex: 'B', value: 37 }));
  it('זווית B = 90 (numeric single vertex)', () => expect(setAngleOf(ok('זווית B = 90'))).toMatchObject({ vertex: 'B', value: 90 }));
  it('a multi-angle GIVENS list still splits (not claimed as one)', () => {
    const cmds = ok('זווית ABC = 40, זווית DEF = 60');
    const angles = cmds.filter((c) => c.type === 'set-angle') as { vertex: string; value: number }[];
    expect(angles.map((a) => `${a.vertex}=${a.value}`).sort()).toEqual(['B=40', 'E=60']);
  });
});
