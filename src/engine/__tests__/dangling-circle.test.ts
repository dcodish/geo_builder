/**
 * #186 belt-and-braces — a command referencing a circle id that exists nowhere refuses HONESTLY,
 * naming the missing circle, instead of building a dangling object the topological evaluator later
 * reports as the cryptic internal "unresolved dependencies for: X" (prod session hqxbjh0x: the raw
 * message reached the student). The parser auto-creates every circle it consumes, so this guard fires
 * only for broken external sources (a raw LLM commit, a hand-edited figure file, a direct engine call).
 */
import { describe, it, expect } from 'vitest';
import { applyStep, emptyConstruction } from '@/engine';
import type { Command } from '@/engine';

describe('#186 — a dangling circle reference refuses with the circle name', () => {
  it('point-on-circle onto a circle that does not exist', () => {
    const r = applyStep(emptyConstruction(), { type: 'point-on-circle', id: 'E', circle: 'circle-O2' } as Command);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("circle 'O2' is not defined");
  });

  it('line-circle-intersection onto a missing circle names the circle, not "unresolved dependencies"', () => {
    let c = emptyConstruction();
    for (const cmd of [
      { type: 'free-point', id: 'A', x: 0, y: 0, free: true },
      { type: 'free-point', id: 'B', x: 5, y: 0, free: true },
      { type: 'line-through', id: 'line-AB', a: 'A', b: 'B' },
    ] as Command[]) {
      const r = applyStep(c, cmd);
      expect(r.ok).toBe(true);
      if (r.ok) c = r.construction;
    }
    const r = applyStep(c, { type: 'line-circle-intersection', id: 'E', line: 'line-AB', circle: 'circle-Q' } as Command);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("circle 'Q' is not defined");
      expect(r.error).not.toMatch(/unresolved dependencies/);
    }
  });

  it('a command referencing the circle it DEFINES itself is untouched', () => {
    const r = applyStep(emptyConstruction(), { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true } as Command);
    expect(r.ok).toBe(true);
  });
});
