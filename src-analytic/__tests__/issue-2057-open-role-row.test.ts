/**
 * #2057 ([ADR-AG-406](../../docs/06c-decisions-analytic.md#adr-ag-406)) — the equation stated for a side named by its role
 * reaches the panel and the canvas, and the equal-pair note stays while the role is open.
 *
 * Ruling, 2026-10-13: *"The equation stated for an open role side shows in the panel (and on its line), named as ruled
 * for the kite on the same ballot: the role name while the role is open, the letters once fixed."*
 * Ruling, 2026-10-14: *"The equation text is shown beside the side on the canvas, for every stated side equation, open
 * role or settled, as well as in the panel."*
 *
 * Measured before (28dac0c3): an open role's line was unnamed and undrawn, so `panelListsCurve` dropped it and the
 * panel listed nothing; no scene carried an equation; `unstatedChoices` said nothing once the rider rode the choice.
 */
import { describe, expect, it } from 'vitest';
import { curveParts } from '../app/curveText';
import { curveRowName, panelKnowledge, sideEquationText } from '../app/panelRows';
import { decideSubmit } from '../app/submit';
import { derive, type Derivation } from '../engine/derive';
import { unstatedChoices } from '../engine/unstatedChoices';
import { analyticI18n } from '../i18n';
import { ALL_SHOWN, type CanvasDisplay } from '../render/canvasDisplay';
import { buildScene } from '../render/scene';

const SEEDS = [0, 1, 2, 3, 4, 5];
const ISO = 'משולש שווה שוקיים ABC';
const BASE = 'משוואת הבסיס היא x-2y+6=0';
const he = analyticI18n.getFixedT('he');
const en = analyticI18n.getFixedT('en');
const plain = (s: string) => s.replace(/[⁦-⁩‎‏]/g, '');

const rows = (d: Derivation, t: typeof he = he) =>
  panelKnowledge(d).curves.map((row) => {
    const c = d.figure.curves.find((q) => q.id === row.id)!;
    return `${curveRowName(c, row, (k) => t(k))}: ${row.known ? curveParts(row.known).equation : '?'}`;
  });
const scene = (d: Derivation, display?: CanvasDisplay) =>
  buildScene(d.figure, d.box, 640, 480, { stated: d.stated, sideEquationText: (id) => sideEquationText(d, id), ...(display ? { display } : {}) });
/** What the canvas wrote that is an equation. */
const canvasEquations = (d: Derivation) => scene(d).stated.labels.filter((l) => l.text.includes('=')).map((l) => ({ ...l, text: plain(l.text) }));
const rowEquation = (row: string) => plain(row.slice(row.indexOf(':') + 2));

const OPEN: Array<[string[], string, string]> = [
  [[ISO, BASE], 'הבסיס', 'base'],
  [[ISO, 'משוואת השוק היא y=2x'], 'השוק', 'leg'],
  [['משולש ישר זווית ABC', 'משוואת היתר היא y=2x'], 'היתר', 'hypotenuse'],
  [['טרפז ABCD', 'משוואת הבסיס היא y=1'], 'הבסיס', 'base'],
  [['טרפז ABCD', 'משוואת השוק היא y=2x'], 'השוק', 'leg'],
  [[ISO, 'הבסיס מונח על הישר y=3'], 'הבסיס', 'base'],
];

describe('#2057 — the panel', () => {
  it.each(OPEN)('%j lists one row under the role name, He and En, at every seed', (lines, heName, enName) => {
    for (const s of SEEDS) {
      const d = derive(lines, s);
      expect(d.faults).toEqual([]);
      const list = rows(d);
      expect(list).toHaveLength(1);
      expect(list[0].startsWith(`${heName}: `)).toBe(true);
      expect(rows(d, en)[0].startsWith(`${enName}: `)).toBe(true);
    }
  });

  it("the operator's row, exactly", () => {
    expect(rows(derive([ISO, BASE], 0))).toEqual(['הבסיס: x - 2y + 6 = 0']);
  });

  it('reads the letters once a given fixes the role, in either order', () => {
    for (const s of SEEDS) {
      expect(rows(derive([ISO, BASE, 'AB=AC'], s))).toEqual(['BC: x - 2y + 6 = 0']);
      expect(rows(derive([ISO, 'AB=AC', BASE], s))).toEqual(['BC: x - 2y + 6 = 0']);
    }
  });

  it('keeps #1078: an anonymous carrier still gets no row', () => {
    expect(panelKnowledge(derive(['משולש ABC', 'B על הישר y=x'], 0)).curves).toEqual([]);
  });

  it('records the sentence', () => {
    expect(decideSubmit(BASE, [ISO], 0).kind).toBe('record');
  });
});

describe('#2006 — an unstated choice draws no relation (ADR-W-118 B2, 2-D measured: 0 ticks on both nouns)', () => {
  const ticks = (lines: string[], s: number) => scene(derive(lines, s)).stated.ticks;

  it.each([[[ISO]], [['דלתון ABCD']], [[ISO, BASE]], [['דלתון ABCD', 'משוואת האלכסון הראשי היא y=2x']], [['משולש ABC', 'אורך השוק AB הוא 5']]])(
    '%j draws no equal-side tick at any seed',
    (lines) => {
      for (const s of SEEDS) expect(ticks(lines, s)).toEqual([]);
    },
  );

  it('a stated equality keeps what it drew: the relation layer is B2\'s own ruled change, not this one', () => {
    expect(ticks(['משולש ABC', 'AB = AC'], 0)).toHaveLength(2);
    expect(ticks([ISO, 'AB=AC'], 0)).toHaveLength(2);
  });

  it('a value is not a relation: a stated length on an open seat keeps its value', () => {
    const d = derive(['משולש ABC', 'אורך השוק AB הוא 5'], 0);
    expect(d.stated.lengths.map((l) => [l.a, l.b, l.value])).toEqual([['A', 'B', { num: 5 }]]);
  });

  it("a value inside an open choice is still written, and a seat's knee still drawn", () => {
    const sine = derive(['משולש ABC', 'sin∢ACB = 1/2'], 0);
    expect(sine.stated.angles).toHaveLength(1);
    expect(derive(['משולש ישר זווית ABC'], 0).stated.rights).toHaveLength(1);
  });
});

describe('#2057 — the note the rider silenced', () => {
  it('«הבסיס» keeps the equal-pair note while the apex is open, and it goes with «AB=AC»', () => {
    expect(unstatedChoices(derive([ISO, BASE], 0)).map((c) => c.kind)).toEqual(['equal-pair']);
    expect(unstatedChoices(derive([ISO, BASE, 'AB=AC'], 0))).toEqual([]);
  });

  it('a choice with no equality in it is still not said', () => {
    expect(unstatedChoices(derive(['משולש ישר זווית ABC', 'משוואת היתר היא y=2x'], 0))).toEqual([]);
  });
});

describe('#2057 — the canvas', () => {
  const SIDES: string[][] = [
    ...OPEN.map(([lines]) => lines),
    [ISO, 'AB=AC', BASE],
    ['משולש ABC', 'משוואת הצלע BC היא x-2y+6=0'],
    ['משולש ABC', 'הצלע BC מונחת על הישר y=2x'],
    ['משולש ABC', 'BC: y=2x'],
    ['משולש ABC', 'משוואת הישר AB היא y=2x'],
  ];

  it.each(SIDES.map((s) => [s]))("%j writes one equation, the panel row's, on the drawn side", (lines) => {
    for (const s of SEEDS) {
      const d = derive(lines, s);
      const side = d.stated.sideEquations;
      expect(side).toHaveLength(1);
      const written = canvasEquations(d);
      expect(written).toHaveLength(1);
      expect(written[0].text).toBe(rowEquation(rows(d)[0]));
      // On the side the drawing took: both its ends lie on the stated line.
      const line = d.figure.curves.find((c) => c.id === side[0].curve)!.curve;
      if (line.kind !== 'line') throw new Error('not a line');
      for (const id of [side[0].a, side[0].b]) {
        const p = d.figure.points.find((q) => q.id === id)!;
        expect(Math.abs(line.a * p.x + line.b * p.y + line.c) / Math.hypot(line.a, line.b)).toBeLessThan(1e-6);
      }
    }
  });

  it('moves with the base across the configurations', () => {
    const sides = new Set(
      SEEDS.concat([6, 7, 8, 9, 10, 11]).map((s) => {
        const e = derive([ISO, BASE], s).stated.sideEquations[0];
        return [e.a, e.b].sort().join('');
      }),
    );
    expect(sides.size).toBeGreaterThan(1);
  });

  it('never covers a stated length on the same side', () => {
    for (const s of SEEDS) {
      const sc = scene(derive(['משולש ABC', 'BC = 5', 'משוואת הצלע BC היא x-2y+6=0'], s));
      const len = sc.segments.flatMap((g) => (g.label ? [g.label] : []))[0];
      const eq = sc.stated.labels.find((l) => l.text.includes('='))!;
      expect(len).toBeDefined();
      expect(Math.abs(len.y - eq.y) > 8 || Math.abs(len.x - eq.x) > 60).toBe(true);
    }
  });

  it.each([
    [['משולש ABC', 'l: y=2x+1']],
    [['משולש ABC', 'B על הישר y=x']],
    [['דלתון ABCD', 'משוואת האלכסון הראשי היא y=2x']], // a diagonal is no side
    [['מרובע ABCD', 'משוואת האלכסון AC היא y=2x']],
  ])('%j writes no equation', (lines) => {
    const d = derive(lines, 0);
    expect(d.stated.sideEquations).toEqual([]);
    expect(canvasEquations(d)).toEqual([]);
  });

  it("a parameter equation is written in the student's letters", () => {
    const d = derive(['משולש ABC', 'משוואת הצלע BC היא y=ax+1'], 0);
    expect(canvasEquations(d)[0].text).toContain('a');
  });

  it('the values switch hides it, with every other value', () => {
    const d = derive([ISO, BASE], 0);
    expect(scene(d, { ...ALL_SHOWN, values: false }).stated.labels).toEqual([]);
  });
});
