/**
 * A CLICKED CROSSING'S TEXT KNOWS EVERY OPERAND KIND (#1489, ADR-550).
 *
 * Operator, playing round #1488 (2026-09-27): clicking the crossing of segment EO with circle O
 * created the point correctly, but its fact row read «A = חיתוך undefinedundefined ו-EO» — the
 * text lowering lived inline in `markIntersection` and knew 2 of the 4 operand kinds (segments,
 * `line1`), so every circle operand interpolated the literal word `undefined`.
 *
 * The fix is the ADR-346/ADR-379 one-seam discipline extended to the TEXT: `crossingUtterance`
 * lives beside `crossingCommands` in `inkCrossings.ts` and names every operand kind in catalog
 * phrasing. These locks hold the seam to three duties:
 *
 *   1. TOTALITY — no operand kind, and no drawn-line spec, ever prints `undefined` (the class).
 *   2. ROUND-TRIP — per pair kind, the utterance PARSES (he and en) and its lowering places the
 *      same named point at the same position as the clicked lowering. Exact command equality is
 *      NOT the bar: measured 2026-09-28, the typed forms mint their own carrier ids (`chord-EO`
 *      vs `line-EO`), state the pick as `avoid`/`onSegment` (vs `branch`/`order`), and add
 *      idempotent segment draws — for every kind including the pre-#1489 segment×segment one.
 *      Circle×circle alone round-trips byte-identically, and is held to that.
 *   3. THE OPERATOR'S SEQUENCE — his exact figure and click, text and reload both right.
 */
import { describe, expect, it } from 'vitest';
import type { AnyCommand, CrossingRef, Id, Vec } from '@/engine';
import { crossingCommands, crossingUtterance, drawnCircles, drawnPointIds, evaluate, findInkCrossings, resolveDrawnLines } from '@/engine';
import { parse, buildParseCtx } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import { serializeFigure, deserializeFigure } from '@/store/figureFile';
import { factsOf } from '@/__tests__/scenarios-corpus';

/** The drawn-ink crossing candidates of a figure, computed the way `Figure.tsx` computes them. */
function crossingsOf(facts: Fact[]) {
  const { construction } = replay(facts);
  const ev = evaluate(construction);
  if (!ev.ok) throw new Error(`figure did not evaluate: ${ev.error}`);
  const drawn = drawnPointIds(construction, ev.positions);
  const { infinite, trimmed } = resolveDrawnLines(construction, ev.positions, ev.circles, drawn);
  const crossings = findInkCrossings(construction, ev.positions, {
    lines: infinite,
    trimmed,
    circles: drawnCircles(construction, ev.circles),
  });
  return { construction, positions: ev.positions, crossings };
}

const dist = (p: Vec, q: Vec) => Math.hypot(p.x - q.x, p.y - q.y);

/**
 * The round-trip duty: in BOTH languages the utterance parses, and replaying the figure + the
 * PARSED commands places `id` where the figure + the CLICKED commands place it, both green.
 */
function roundTrips(setup: Fact[], x: CrossingRef, id: Id) {
  const { construction, positions } = replay(setup);
  for (const lang of ['he', 'en'] as const) {
    const u = crossingUtterance(x, id, lang, construction);
    expect(u, `${lang} utterance`).not.toContain('undefined');
    const p = parse(u, buildParseCtx(construction, positions));
    expect(p.ok, `"${u}" must parse (${lang})`).toBe(true);
    if (!p.ok) continue;
    const clicked = replay([...setup, ...asFacts(crossingCommands(x, id), u, 'clicked')]);
    const typed = replay([...setup, ...asFacts([...p.commands], u, 'typed')]);
    expect(clicked.lastError, `clicked lowering of "${u}"`).toBeNull();
    expect(typed.lastError, `typed lowering of "${u}"`).toBeNull();
    const pc = clicked.positions.get(id);
    const pt = typed.positions.get(id);
    expect(pc, `clicked ${id}`).toBeTruthy();
    expect(pt, `typed ${id}`).toBeTruthy();
    expect(dist(pc!, pt!), `"${u}" (${lang}): typed and clicked place ${id} together`).toBeLessThan(1e-6);
  }
}

const asFacts = (cmds: AnyCommand[], utterance: string, group: string): Fact[] =>
  cmds.map((cmd, i) => ({ id: `${group}.${i}`, cmd, utterance, group, enabled: true }));

describe('#1489 — the operator’s exact figure and click', () => {
  const setup = () => factsOf(['מעגל O', 'E מחוץ למעגל', 'EO = 10']);

  it('the EO × circle crossing is offered, and its Hebrew row names the circle — never `undefined`', () => {
    const facts = setup();
    const { construction, crossings } = crossingsOf(facts);
    const x = crossings.find((k) => k.circle1);
    expect(x, 'the EO × circle-O crossing is a candidate').toBeTruthy();
    expect(crossingUtterance(x!, 'A', 'he', construction)).toBe('A = חיתוך מעגל O ו-EO');
    expect(crossingUtterance(x!, 'A', 'en', construction)).toBe('A = intersection of circle O and EO');
  });

  it('the clicked row round-trips: the text parses and places A where the click did', () => {
    const facts = setup();
    const { crossings } = crossingsOf(facts);
    const x = crossings.find((k) => k.circle1)!;
    roundTrips(facts, x, 'A');
  });

  it('a saved figure with the clicked crossing reloads and reproduces A (plan step 4)', () => {
    const facts = setup();
    const { construction, crossings } = crossingsOf(facts);
    const x = crossings.find((k) => k.circle1)!;
    const u = crossingUtterance(x, 'A', 'he', construction);
    const all = [...facts, ...asFacts(crossingCommands(x, 'A'), u, 'click')];
    const r = deserializeFigure(serializeFigure({ facts: all, seed: 0 }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const fig = replay(r.file.facts, r.file.seed);
    expect(fig.lastError).toBeNull();
    expect(fig.positions.get('A'), 'A survives the save/load round trip').toBeTruthy();
  });

  it('an OLD saved row (the pre-fix `undefined` text) still reloads — load replays commands, not text', () => {
    const facts = setup();
    const { crossings } = crossingsOf(facts);
    const x = crossings.find((k) => k.circle1)!;
    const broken = [...facts, ...asFacts(crossingCommands(x, 'A'), 'A = חיתוך undefinedundefined ו-EO', 'click')];
    const r = deserializeFigure(serializeFigure({ facts: broken, seed: 0 }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const fig = replay(r.file.facts, r.file.seed);
    expect(fig.lastError).toBeNull();
    expect(fig.positions.get('A')).toBeTruthy();
  });
});

describe('#1489 — round-trip per pair kind', () => {
  it('segment × segment (the pre-#1489 kind stays right)', () => {
    const facts = factsOf(['מקבילית ABCD', 'אלכסון AC', 'אלכסון BD']);
    const { construction, crossings } = crossingsOf(facts);
    const x = crossings.find((k) => k.a && k.c);
    expect(x, 'the diagonals’ crossing is a candidate').toBeTruthy();
    const u = crossingUtterance(x!, 'M', 'he', construction);
    expect(u).toMatch(/^M = חיתוך [A-Z]{2} ו-[A-Z]{2}$/);
    roundTrips(facts, x!, 'M');
  });

  it('circle × circle round-trips BYTE-IDENTICALLY at branch 0 — and branch 1 differs only there', () => {
    const facts = factsOf(['מעגל O ברדיוס 5', 'מעגל P ברדיוס 5', 'OP = 6']);
    const { construction, positions } = replay(facts);
    const x: CrossingRef = { circle1: 'circle-O', circle2: 'circle-P', branch: 0 };
    for (const lang of ['he', 'en'] as const) {
      const u = crossingUtterance(x, 'G', lang, construction);
      const p = parse(u, buildParseCtx(construction, positions));
      expect(p.ok, `"${u}" must parse (${lang})`).toBe(true);
      if (p.ok) expect([...p.commands]).toEqual(crossingCommands(x, 'G'));
    }
    expect(crossingUtterance(x, 'G', 'he', construction)).toBe('G = חיתוך מעגל O ומעגל P');
    // The OTHER root: the sentence cannot say which root, so its re-parse differs from the click
    // in `branch` alone — the stored commands (what load replays) keep the student's actual dot.
    const u1 = crossingUtterance({ ...x, branch: 1 }, 'G', 'he', construction);
    expect(u1).toBe('G = חיתוך מעגל O ומעגל P');
    const p1 = parse(u1, buildParseCtx(construction, positions));
    expect(p1.ok).toBe(true);
    if (p1.ok) expect([...p1.commands]).toEqual(crossingCommands(x, 'G')); // branch 0, not 1
  });

  it('drawn tangent LINE × segment: the text names the tangent by its touch point and parses to the SAME line', () => {
    const facts = factsOf(['מעגל O', 'AB קוטר', 'משיק למעגל בנקודה A', 'נקודה C', 'נקודה D', 'CD']);
    const { construction, positions } = replay(facts);
    const x: CrossingRef = { line1: 'tan-A', c: 'C', d: 'D' };
    for (const lang of ['he', 'en'] as const) {
      const u = crossingUtterance(x, 'E', lang, construction);
      expect(u).not.toContain('undefined');
      const p = parse(u, buildParseCtx(construction, positions));
      expect(p.ok, `"${u}" must parse (${lang})`).toBe(true);
      if (!p.ok) continue;
      // Same MEANING: the parsed intersection is of the same tangent line with the same carrier.
      const inter = [...p.commands].find((cc) => cc.type === 'line-intersection');
      expect(inter && 'line1' in inter && inter.line1, `"${u}" crosses tan-A`).toBe('tan-A');
    }
    expect(crossingUtterance(x, 'E', 'he', construction)).toBe('E = חיתוך המשיק בנקודה A ו-CD');
  });
});

describe('#1489 — totality: no operand kind and no line spec ever prints `undefined` (the class)', () => {
  it('every pair kind × both languages, over synthetic refs with every LineSpec flavor', () => {
    const facts = factsOf([
      'מעגל O', 'AB קוטר', 'משיק למעגל בנקודה A', // tangent line tan-A
      'משולש PQR',
    ]);
    const { construction } = replay(facts);
    const refs: [string, CrossingRef][] = [
      ['segment × segment', { a: 'A', b: 'B', c: 'P', d: 'Q' }],
      ['circle × segment', { circle1: 'circle-O', c: 'P', d: 'Q' }],
      ['circle × line', { circle1: 'circle-O', line2: 'tan-A' }],
      ['circle × circle', { circle1: 'circle-O', circle2: 'circle-X' }], // circle-X: not in the figure — name stays readable
      ['line × line', { line1: 'tan-A', line2: 'tan-A' }],
      ['line × segment', { line1: 'tan-A', c: 'P', d: 'Q' }],
      ['unknown line id', { line1: 'no-such-line', c: 'P', d: 'Q' }],
    ];
    for (const [name, x] of refs) {
      for (const lang of ['he', 'en'] as const) {
        expect(crossingUtterance(x, 'Z', lang, construction), `${name} (${lang})`).not.toContain('undefined');
      }
    }
  });

  it('each LineSpec flavor names itself readably', () => {
    // A construction stub carrying one line of each spec — the switch must be total.
    const c = {
      objects: [
        { kind: 'line', id: 'l1', spec: { via: 'through', a: 'A', b: 'B' } },
        { kind: 'line', id: 'l2', spec: { via: 'bisector', vertex: 'V', p: 'P', q: 'Q' } },
        { kind: 'line', id: 'l3', spec: { via: 'perpendicular', through: 'T', a: 'A', b: 'B' } },
        { kind: 'line', id: 'l4', spec: { via: 'parallel', through: 'T', a: 'A', b: 'B' } },
        { kind: 'line', id: 'l5', spec: { via: 'tangent', circle: 'circle-O', at: 'K' } },
      ],
    } as never;
    expect(crossingUtterance({ line1: 'l1', c: 'C', d: 'D' }, 'Z', 'he', c)).toBe('Z = חיתוך הישר AB ו-CD');
    expect(crossingUtterance({ line1: 'l2', c: 'C', d: 'D' }, 'Z', 'he', c)).toBe('Z = חיתוך חוצה הזווית PVQ ו-CD');
    expect(crossingUtterance({ line1: 'l3', c: 'C', d: 'D' }, 'Z', 'he', c)).toBe('Z = חיתוך האנך ל-AB דרך T ו-CD');
    expect(crossingUtterance({ line1: 'l4', c: 'C', d: 'D' }, 'Z', 'he', c)).toBe('Z = חיתוך המקביל ל-AB דרך T ו-CD');
    expect(crossingUtterance({ line1: 'l5', c: 'C', d: 'D' }, 'Z', 'en', c)).toBe('Z = intersection of the tangent at K and CD');
  });
});
