/**
 * Issue #315 / ADR-3D-074 — WHICH coordinate family a pin determines is semantic (the ADR-3D-054
 * class, coordinate edition). A pure pair/vector injection fixes direction+scale, never
 * translation: the pivot roots the figure at a deterministic gauge origin, which DEFEATS the
 * seed-invariance knowledge gate — the operator's `DE=(0,2,0)` printed `A(0, 0, 0)` as a derived
 * fact the givens don't determine («why does setting DE=(0,2,0) place A in (0,0,0)»).
 *
 * The gates now split: POINT coordinates + plane equations need TRANSLATION pinned (a real point
 * injection); a VECTOR's coordinates (a difference — translation cancels) need the ORIENTATION
 * pinned (two independent pinned directions, or a point frame, or being the injected pair itself).
 */
import { describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { derive3, type Fact3 } from '../store/store3';
import { dataView } from '../engine/dataView';
import { answerQuery } from '../engine/queries';

function build(utts: string[]): Fact3[] {
  return utts.map((u, i) => {
    const r = parse3(u);
    expect(r.ok, `parse: ${u}`).toBe(true);
    return { id: `f${i}`, utterance: u, cmds: r.ok ? r.commands : [], enabled: true };
  });
}

const BASE = ['פירמידה משולשת ABCS', 'SD=(2/3)SB', 'F אמצע SC', 'BC=v', 'SB=u', 'FE=u/6-v/6', 'DE'];

describe('#315 — a pure pair injection must not mint point coordinates', () => {
  const d = derive3(build([...BASE, 'DE=(0,2,0)']), 0);
  const panel = dataView(d.construction, 0);

  it('the figure builds and the pin itself holds', () => {
    for (const [id, st] of Object.entries(d.status)) expect(st, id).toBe('ok');
  });

  it('NO point coordinate prints — A(0,0,0) was the pivot’s gauge, not knowledge', () => {
    expect(panel.points).toEqual([]);
  });

  it('the injected pair’s OWN coordinates still print (they are literally the given)', () => {
    const de = panel.vectors.find((v) => v.label === 'DE');
    expect(de?.coords).toBe('(0, 2, 0)');
  });

  it('another vector’s coordinates do NOT print (residual rotation is gauge)', () => {
    for (const v of panel.vectors) {
      if (v.label === 'DE') continue;
      expect(v.coords, v.label).toBeNull();
    }
  });

  it('the query lane agrees: DE answers its coords/decomp, u does not answer coords', () => {
    const de = answerQuery(d.construction, 'DE', 0);
    expect(de.answer).toBeTruthy();
    const u = answerQuery(d.construction, 'וקטור u', 0);
    expect(u.answer ?? '').not.toMatch(/\(/); // a decomposition at most — never gauge coordinates
  });
});

describe('#315 — a real point injection still enables point coordinates (the positive direction)', () => {
  it('with D(0,0,0) injected alongside, the panel prints D — translation is anchored', () => {
    const d = derive3(build([...BASE, 'DE=(0,2,0)', 'D(0,0,0)']), 0);
    const panel = dataView(d.construction, 0);
    expect(panel.points.some((p) => p.startsWith('D('))).toBe(true);
  });
});
