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
import { resolve3 } from '../engine/evaluate';
import type { Vec3 } from '../engine/vec3';

const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

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

  it('a vector PARALLEL to the pin prints its derivable coords; a non-parallel one stays gauge (the operator-screenshot asymmetry)', () => {
    // v ∥ DE (DE = ⅓v) ⇒ v = 3·DE = (0, 6, 0) is genuinely derivable — must print.
    const v = panel.vectors.find((x) => x.label === 'v');
    expect(v?.coords).toBe('(0, 6, 0)');
    // u is NOT parallel to the pin — its coords are rotation gauge; the seeds vary it → no print.
    const u = panel.vectors.find((x) => x.label === 'u');
    expect(u?.coords ?? null).toBeNull();
  });

  it('the query lane agrees: DE and v answer coords, u never gets gauge coordinates', () => {
    const de = answerQuery(d.construction, 'DE', 0);
    expect(de.answer).toBeTruthy();
    const vq = answerQuery(d.construction, 'וקטור v', 0);
    expect(vq.answer ?? '').toContain('(0, 6, 0)');
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

/**
 * #639 — the knowledge frame-gate was an ENUMERATION («a pin, or a coordinate point»), and it was one
 * member short for the whole ALGEBRAIC lane: a figure framed by an equation plane and a parametric line
 * has neither, so every knowledge surface was withheld while the engine held the point exactly. The exam
 * asks «מצאו את שיעורי הנקודה A» and the tool answered «לא נקבע על ידי הנתונים» about A = (2, 0, −10).
 *
 * The gate now asks the placement funnel's own question — is the gauge-placed content SAMPLED (or is
 * there none) — so a newly-added absolute carrier is covered by construction rather than by a list.
 */
describe('#639 — the algebraic lane is an absolute frame', () => {
  // bagrut 35582 חורף תשפ"ד Q2: ℓ ⟂ π forces m = −5, and A is their crossing
  const EXAM = [
    'הישר l: x=(-1,5,-11)+t(-6,10,-2)',
    'מישור π: 3x+my+(m+6)z+4=0',
    'l מאונך למישור π',
    'A נקודת החיתוך של l עם π',
  ];

  it('the crossing point is knowledge on every surface — panel, query, and identically per seed', () => {
    const d = derive3(build(EXAM), 0);
    for (const [id, st] of Object.entries(d.status)) expect(st, id).toBe('ok');
    expect(dataView(d.construction, 0).points).toEqual(['A(2, 0, -10)']);
    expect(answerQuery(d.construction, 'A', 0).answer).toBe('A(2, 0, -10)');
    expect(answerQuery(d.construction, 'A', 0).note).toBeUndefined();
    for (const seed of [1, 2, 7, 99]) expect(dataView(d.construction, seed).points).toEqual(['A(2, 0, -10)']);
  });

  it("the plane the student typed answers its own equation (the second symptom, same gate)", () => {
    const d = derive3(build(EXAM), 0);
    expect(answerQuery(d.construction, 'מישור π', 0).answer).toBe('3x - 5y + z + 4 = 0');
  });

  /**
   * THE OVER-REACH GUARD — the assertion that decides whether this fix is correct or merely green. With a
   * cube in the same figure, the cube's vertices are placed by the SAMPLED gauge and are not knowledge;
   * only the Lane-A crossing is. A fix that opened the gate figure-wide would pass the exam case above and
   * commit the ADR-052 cardinal sin — #611's defect in the opposite direction.
   */
  it('a gauge-placed vertex still prints NOTHING while the Lane-A crossing prints', () => {
    const mixed = [
      "קובייה ABCDA'B'C'D'",
      'הישר l: x=(-1,5,-11)+t(-6,10,-2)',
      'מישור π: 3x+my+(m+6)z+4=0',
      'l מאונך למישור π',
      'A1 נקודת החיתוך של l עם π',
    ];
    const d = derive3(build(mixed), 0);
    const panel = dataView(d.construction, 0);
    expect(panel.points).toEqual(['A1(2, 0, -10)']); // and NOT one of A…D'
    expect(answerQuery(d.construction, 'A1', 0).answer).toBe('A1(2, 0, -10)');
    expect(answerQuery(d.construction, 'A', 0)).toMatchObject({ answer: null, note: 'undetermined' });
    // the mechanism: the cube genuinely roams while the crossing does not
    const posOf = (seed: number) => resolve3(d.construction, seed).positions;
    const [p0, p1] = [posOf(0), posOf(1)];
    expect(dist(p0.get('A')!, p1.get('A')!)).toBeGreaterThan(0.01);
    expect(dist(p0.get('A1')!, p1.get('A1')!)).toBeLessThan(1e-9);
  });

  it('a figure with NO absolute object is untouched (#315 must not regress)', () => {
    const d = derive3(build(["קובייה ABCDA'B'C'D'"]), 0);
    expect(dataView(d.construction, 0).points).toEqual([]);
    expect(answerQuery(d.construction, 'A', 0)).toMatchObject({ answer: null, note: 'undetermined' });
  });

  /**
   * The other direction of the same rule: an absolute object is present, but a MEMBERSHIP pins the
   * placement, so the funnel FREEZES it instead of sampling it. Frozen coordinates are seed-stable
   * without being knowledge, so the gate must stay shut — this is why the predicate asks the funnel's
   * question rather than "is there an absolute object anywhere".
   */
  it('a membership-pinned figure stays silent — frozen is not sampled', () => {
    const d = derive3(build(["קובייה ABCDA'B'C'D'", 'מישור π: 3x+2y+z-4=0', 'A על המישור π']), 0);
    expect(dataView(d.construction, 0).points).toEqual([]);
    expect(answerQuery(d.construction, 'A', 0)).toMatchObject({ answer: null, note: 'undetermined' });
  });
});
