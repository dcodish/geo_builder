/**
 * ADR-475 / #875 — magnitude dialing is a decided NON-feature.
 *
 * The radius slider was the only magnitude control the 2-D app ever had, and all three of its
 * observable behaviours were wrong (inert on a lone circle, frozen on a radius a given pinned, absent
 * on the one figure that had a visible freedom). It is removed, and exploring an unstated magnitude is
 * «הצג תצורה אחרת» alone, while STATING one is typing it — a fact, not a viewing scratchpad.
 *
 * This file is the lock the ADR promises: the affordance cannot come back by accident, the stated
 * given it is often confused with still works, and a figure saved BEFORE the removal still loads.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { replay, useGeoStore } from '@/store/geoStore';
import { deserializeFigure, FIGURE_FILE_VERSION } from '@/store/figureFile';
import { parse, buildParseCtx } from '@/parser';

const SRC = path.resolve(__dirname, '..');
const sources: string[] = [];
(function walk(d: string) {
  for (const e of readdirSync(d)) {
    const p = path.join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(e)) sources.push(p);
  }
})(SRC);

const hits = (re: RegExp) =>
  sources
    .filter((f) => f !== path.resolve(__dirname, 'no-magnitude-slider.test.ts'))
    .flatMap((f) => {
      const rel = path.relative(SRC, f).replace(/\\/g, '/');
      return readFileSync(f, 'utf8')
        .split('\n')
        .map((l, i) => ({ rel, line: i + 1, text: l }))
        .filter((r) => re.test(r.text));
    });

describe('#875 / ADR-475 — the magnitude slider stays gone (structural)', () => {
  it('the ONLY <input type="range"> in the 2-D tree is the viewport rotation control', () => {
    const ranges = hits(/type="range"/);
    // A magnitude slider would add a second one. The survivor is a VIEW control (it rotates how the
    // figure is displayed and changes no geometry), which is why it is allowed to stay.
    expect(ranges.map((r) => r.rel)).toEqual(['render/Figure.tsx']);
  });

  it('the radius-DOF machinery is gone — no dead mechanism left behind (docs/17)', () => {
    expect(hits(/\bradiusDofs\b|\bRadiusDof\b/).map((r) => `${r.rel}:${r.line}`)).toEqual([]);
    expect(hits(/\.setRadius\(/).map((r) => `${r.rel}:${r.line}`)).toEqual([]);
  });

  it('`replay` takes (facts, seed) only — the overrides input is gone', () => {
    expect(replay.length).toBe(1); // facts; `seed = 0` is defaulted, so it is not counted
    const d = replay([], 0) as unknown as Record<string, unknown>;
    expect('radiusDofs' in d, 'Derived no longer publishes a slider list').toBe(false);
  });
});

describe('#875 — what the removal must NOT have touched', () => {
  const s = () => useGeoStore.getState();
  const submit = (u: string) => {
    const { construction, positions } = replay(s().facts, s().seed);
    const r = parse(u, buildParseCtx(construction, positions));
    if (!r.ok) throw new Error(`test utterance did not parse: ${u}`);
    s().executeMany(r.commands, u);
  };
  beforeEach(() => s().clear());

  it('the STATED radius given still builds and still pins — «רדיוס המעגל 4»', () => {
    submit('מעגל O');
    submit('רדיוס המעגל 4');
    const d = replay(s().facts, s().seed);
    expect(d.lastError).toBeNull();
    expect(d.circles.get('circle-O')?.r).toBeCloseTo(4, 6);
    // …and it is a FACT, which is the whole point: it survives in the ordered list the figure derives from.
    expect(s().facts.some((f) => f.utterance === 'רדיוס המעגל 4')).toBe(true);
  });

  it('a lone circle still builds, with nothing to dial', () => {
    submit('מעגל');
    const d = replay(s().facts, s().seed);
    expect(d.lastError).toBeNull();
    expect(d.circles.size).toBe(1);
  });

  it('an unstated radius still VARIES across configurations — «הצג תצורה אחרת» is the mechanism now', () => {
    submit('מעגל O');
    submit('משולש ABC חסום במעגל');
    const radii = new Set<string>();
    for (let seed = 0; seed < 8; seed++) {
      const d = replay(s().facts, seed);
      const c = d.circles.get('circle-O');
      if (d.lastError === null && c) radii.add(`${[...d.positions.values()].map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).sort().join(' ')}`);
    }
    expect(radii.size, 'the figure still offers genuinely different valid drawings').toBeGreaterThan(1);
  });
});

describe('#875 — backward compatibility: a figure saved BEFORE the removal still loads', () => {
  it('a file carrying `radiusOverrides` is accepted, and the field is simply discarded', () => {
    const old = {
      app: 'geo-builder',
      schemaVersion: FIGURE_FILE_VERSION,
      seed: 3,
      // The removed mechanism's field, exactly as pre-ADR-475 saves wrote it.
      radiusOverrides: { 'circle-O': 12.5 },
      facts: [{ id: 'f1', utterance: 'מעגל O', cmd: { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true }, enabled: true }],
    };
    const r = deserializeFigure(JSON.stringify(old));
    if (!r.ok) throw new Error(`a pre-removal save must still load, got: ${r.reason}`);
    expect(r.file.seed, 'the rest of the header is untouched').toBe(3);
    expect('radiusOverrides' in r.file, 'the dead field does not ride into the session').toBe(false);
    // The figure draws at its REPLAYED radius, not the dialed 12.5 — correct, since ADR-048 called a
    // dialed value a viewing aid and never a given, so nothing the student stated is lost.
    const d = replay(r.file.facts, r.file.seed);
    expect(d.lastError).toBeNull();
    expect(d.circles.get('circle-O')?.r).not.toBeCloseTo(12.5, 6);
  });
});
