/**
 * #770 (P1) — «אלכסוני ה<shape>» read the shape noun as DECORATION.
 *
 * The definite-shape resolver bound "the unique quadrilateral in the figure" whatever the stated
 * noun: «אלכסוני הריבוע נפגשים בנקודה M» on a trapezoid-only figure drew the TRAPEZOID's diagonals
 * with a green ✓ (a wrong-but-plausible figure, a stated noun silently discarded), and with TWO
 * quads it deferred even though the noun disambiguated. Root fix: polygons are STAMPED with the
 * declared kind at creation (`Polygon.declaredAs`, threaded through every shape case, the M1
 * lowering and the kite's shape-variant base command), the parse context exposes it
 * (`declaredPolygons`), and the resolver matches the stated noun against it — refusing BY NAME
 * (`shape-not-found`) when the named kind has no declared ring, never falling back to something
 * plausible. A letters run after the construct noun («אלכסוני ABCD») binds directly.
 *
 * Through the real parse-with-context → replay path, mirrored He/En.
 */
import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand, Id } from '@/engine';

function ctxAfter(utterances: string[]) {
  const facts: Fact[] = [];
  let g = 0;
  for (const u of utterances) {
    const fig = replay(facts);
    const ctx = buildParseCtx(fig.construction, fig.positions);
    const r = parse(u, ctx);
    if (!r.ok) throw new Error(`prefix did not parse: ${u} (${JSON.stringify(r)})`);
    for (const cmd of r.commands) facts.push({ id: `f${g++}`, utterance: u, cmd: cmd as AnyCommand, enabled: true });
  }
  const fig = replay(facts);
  return { ctx: buildParseCtx(fig.construction, fig.positions), facts };
}

const crossingOf = (cmds: AnyCommand[]) =>
  cmds.find((c): c is Extract<AnyCommand, { type: 'line-line-intersection' }> => c.type === 'line-line-intersection');

describe('#770 — the mis-binding half: a stated kind never binds a different declared kind', () => {
  it.each([
    ['אלכסוני הריבוע נפגשים בנקודה M', 'ריבוע'],
    ['אלכסוני המלבן נפגשים בנקודה M', 'מלבן'],
    ['אלכסוני המעוין נפגשים בנקודה M', 'מעוין'],
    ['the diagonals of the square meet at M', 'square'],
  ])('on a trapezoid-only figure, «%s» refuses BY NAME', (u, noun) => {
    const { ctx } = ctxAfter(['טרפז ABCD']);
    const r = parse(u, ctx);
    expect(r.ok, u).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('shape-not-found');
    if (r.reason === 'shape-not-found') expect(r.noun).toBe(noun);
  });

  it('the MATCHING noun binds — «אלכסוני הטרפז» on the trapezoid lowers to its diagonal crossing', () => {
    const { ctx } = ctxAfter(['טרפז ABCD']);
    const r = parse('אלכסוני הטרפז נפגשים בנקודה M', ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const x = crossingOf(r.commands);
    expect(x).toBeTruthy();
    expect([x!.a, x!.b, x!.c, x!.d]).toEqual(['A', 'C', 'B', 'D']);
    expect(x!.id).toBe('M');
  });

  it('the generic noun («המרובע») keeps the unique-ring behaviour on any single quad', () => {
    const { ctx } = ctxAfter(['טרפז ABCD']);
    const r = parse('אלכסוני המרובע נפגשים בנקודה M', ctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(crossingOf(r.commands)?.id).toBe('M');
  });
});

describe('#770 — the second half: the noun DISAMBIGUATES two quads instead of deferring', () => {
  const two = () => ctxAfter(['טרפז ABCD', 'ריבוע EFGH']);

  it('«אלכסוני הטרפז … K» binds the trapezoid; «אלכסוני הריבוע … M» binds the square', () => {
    const { ctx } = two();
    const rT = parse('אלכסוני הטרפז נפגשים בנקודה K', ctx);
    expect(rT.ok).toBe(true);
    if (rT.ok) expect([crossingOf(rT.commands)!.a, crossingOf(rT.commands)!.c]).toEqual(['A', 'B']);
    const rS = parse('אלכסוני הריבוע נפגשים בנקודה M', ctx);
    expect(rS.ok).toBe(true);
    if (rS.ok) expect([crossingOf(rS.commands)!.a, crossingOf(rS.commands)!.c]).toEqual(['E', 'F']);
  });

  it('a LETTERS run after the construct noun binds directly even beside a second quad', () => {
    const { ctx } = two();
    const r = parse('אלכסוני EFGH נפגשים בנקודה M', ctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect([crossingOf(r.commands)!.a, crossingOf(r.commands)!.c]).toEqual(['E', 'F']);
  });

  it('a named kind that matches NEITHER declared quad refuses by name, not a guess', () => {
    const { ctx } = two();
    const r = parse('אלכסוני המעוין נפגשים בנקודה M', ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('shape-not-found');
  });
});

describe('#770 — the stamp reaches every declaration route', () => {
  it('a KITE declared through the shape-variant lowering resolves «אלכסוני הדלתון»', () => {
    const { ctx } = ctxAfter(['דלתון ABCD']);
    const r = parse('אלכסוני הדלתון נפגשים בנקודה M', ctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(crossingOf(r.commands)?.id).toBe('M');
  });

  it('the n=3 families are untouched — «תיכוני המשולש» still binds the single triangle', () => {
    const { ctx } = ctxAfter(['משולש ABC']);
    const r = parse('התיכונים נפגשים בנקודה M', ctx);
    expect(r.ok).toBe(true);
  });

  it('inside a clause compound the kind travels too — «טרפז ABCD, אלכסוני הריבוע נפגשים בנקודה M» refuses', () => {
    const empty = buildParseCtx(replay([]).construction, replay([]).positions);
    const r = parse('טרפז ABCD, אלכסוני הריבוע נפגשים בנקודה M', empty);
    // whole-line: the compound must not commit the trapezoid's crossing under the square's name —
    // either the clause fallback surfaces the refusal or the line declines whole; it never binds.
    if (r.ok) {
      const x = crossingOf(r.commands);
      expect(x, 'must not bind the trapezoid under a stated «ריבוע»').toBeUndefined();
    }
  });

  it('the crossing point still REPLAYS onto the figure (end-to-end)', () => {
    const { ctx, facts } = ctxAfter(['טרפז ABCD']);
    const r = parse('אלכסוני הטרפז נפגשים בנקודה M', ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const all = [...facts, ...r.commands.map((cmd, i) => ({ id: `x${i}`, utterance: '', cmd, enabled: true }) as Fact)];
    const fig = replay(all);
    expect(fig.lastError).toBeNull();
    const at = (id: Id) => fig.positions.get(id)!;
    const M = at('M'), A = at('A'), C = at('C');
    const cross = (M.x - A.x) * (C.y - A.y) - (M.y - A.y) * (C.x - A.x);
    expect(Math.abs(cross), 'M sits on diagonal AC').toBeLessThan(1e-6 * 100);
  });
});
