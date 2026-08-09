/**
 * #438 / #440 — **a stated OBJECT must materialise.**
 *
 * The class, in one sentence: *a sentence states two objects — a shape and a construct on it — the one
 * rule that recognises its own noun claims the whole utterance, emits only its own object, and silently
 * discards the rest of the sentence.* Three independent instances landed in a single triage
 * (2026-08-08): `cubeOrBox` reading `תיבה` and discarding `עם אלכסון תיבה` (#438, typed by two prod users
 * as their opening move), the flat-polygon rule reading `משולש` and discarding `חסום במעגל` (#440), and
 * the pyramid base qualifier (#435). None of the four honesty gates could see any of them: they ask
 * about labels, numbers, base-shape nouns and triangle qualifiers, and **nothing asked whether a stated
 * object materialised at all.**
 *
 * So this file locks the two halves of the fix together:
 *  - the CAPABILITY — the rules that own those sentences now emit both objects;
 *  - the MECHANISM — `droppedConstructNoun3`, which refuses honestly wherever a construct noun is stated
 *    and the commands carry nothing but the bare shape. It is bound to the EVENT, not to a commit path,
 *    because both reported drops were GRAMMAR-rule drops where the LLM-seam gates never run.
 *
 * Assertions are GEOMETRIC on the resolved figure — a space diagonal by the box identity
 * |AC'|² = |AB|² + |AD|² + |AA'|², a circle by its own defining property — never "a command was emitted".
 */
import { describe, expect, it } from 'vitest';
import he from '../i18n/locales/he.json';
import en from '../i18n/locales/en.json';
import { derive3, useGeo3 } from '../store/store3';
import { droppedConstructNoun3 } from '../parser/honesty3';
import { parse3 } from '../parser/parse3';
import { norm3, sub3, type Vec3 } from '../engine/vec3';

function build(lines: string[], seed = 0) {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
  for (const l of lines) useGeo3.getState().submit(l);
  const st = useGeo3.getState();
  const d = derive3(st.facts, seed);
  return { st, d, pos: d.positions, c: d.construction, circles: d.resolved?.circles3 ?? [] };
}

const dist = (p: Vec3, q: Vec3) => norm3(sub3(p, q));
const SEEDS = [0, 1, 2, 3];

// ---------------------------------------------------------------------------
// #440 — the polygon half. ADR-3D-112 built the circle and took the utterance off `planarPolygon`,
// which made the POLYGON the newly-dropped half: as an OPENING move the circle referenced A, B, C that
// nothing had declared.
// ---------------------------------------------------------------------------
describe('#440 — an inscription statement declares BOTH the polygon and its circle', () => {
  it.each([
    ['חסום במעגל (circum)', 'משולש ABC חסום במעגל'],
    ['חוסם במעגל — the operator mixed marker', 'משולש ABC חוסם במעגל'],
    ['מעגל חוסם את (circum)', 'מעגל חוסם את משולש ABC'],
    ['חוסם מעגל (incircle)', 'משולש ABC חוסם מעגל'],
    ['מעגל חסום ב (incircle)', 'מעגל חסום במשולש ABC'],
    ['English inscribed', 'triangle ABC inscribed in a circle'],
    ['English circle-in', 'circle inscribed in triangle ABC'],
  ])('%s builds from EMPTY — the stated triangle exists too', (_label, line) => {
    const { st, c, circles, pos } = build([line]);
    expect(st.lastError).toBeNull();
    expect(st.facts).toHaveLength(1);
    // the TRIANGLE the student stated — the half that used to vanish (`unknown-point A`)
    expect(c.solids.map((s) => `${s.kind}[${s.ids.join('')}]`)).toEqual(['polygon3[ABC]']);
    for (const id of ['A', 'B', 'C']) expect(pos.get(id), `${id} exists`).toBeDefined();
    // and the circle
    expect(circles).toHaveLength(1);
  });

  it('the ring is declared ONCE — a second statement is an M1 no-op, never a duplicate solid', () => {
    const { st, c } = build(['משולש ABC', 'משולש ABC חסום במעגל']);
    expect(st.lastError).toBeNull();
    expect(c.solids).toHaveLength(1);
  });

  it("the operator's pyramid-base case does not gain a polygon on top of the solid (M1)", () => {
    const { st, c } = build(['פירמידה ABCD', 'משולש ABC חסום במעגל']);
    expect(st.lastError).toBeNull();
    expect(c.solids.map((s) => s.kind)).toEqual(['tetra']); // the base ring is a FACE, not a new solid
  });

  it('a stated triangle QUALIFIER still lowers on this rule too (#424 one-vocabulary)', () => {
    const { st, pos } = build(['משולש שווה שוקיים ABC חסום במעגל']);
    expect(st.lastError).toBeNull();
    const [A, B, C] = ['A', 'B', 'C'].map((i) => pos.get(i)!);
    expect(dist(A, B)).toBeCloseTo(dist(A, C), 6);
  });
});

// ---------------------------------------------------------------------------
// #438 — the box diagonal half.
// ---------------------------------------------------------------------------
describe('#438 — a stated SPACE DIAGONAL is drawn, not discarded', () => {
  it.each([
    ['the prod utterance (2 users, opening move)', 'תיבה מלבנית עם אלכסון תיבה'],
    ['cube', "קובייה עם אלכסון קובייה"],
    ['labelled box', "תיבה ABCDA'B'C'D' עם אלכסון תיבה"],
    ['English', 'a box with a space diagonal'],
  ])('%s', (_label, line) => {
    for (const seed of SEEDS) {
      const { st, c, pos } = build([line], seed);
      expect(st.lastError).toBeNull();
      expect(c.solids).toHaveLength(1);
      // exactly one auxiliary segment, and it is a SPACE diagonal: base vertex → the top vertex
      // diagonally opposite. Asserted by the box identity, never by the ids.
      expect(c.segments).toHaveLength(1);
      const [a, b] = c.segments[0];
      const [A, B, C, D, A2] = ['A', 'B', 'C', 'D', "A'"].map((i) => pos.get(i)!);
      const d2 = dist(pos.get(a)!, pos.get(b)!) ** 2;
      expect(d2).toBeCloseTo(dist(A, B) ** 2 + dist(B, C) ** 2 + dist(A, A2) ** 2, 6);
      // …and it is genuinely longer than any FACE diagonal, which is what makes it the SPACE one
      expect(d2).toBeGreaterThan(dist(A, C) ** 2 + 1e-9);
      expect(d2).toBeGreaterThan(dist(B, D) ** 2 + 1e-9);
    }
  });

  it('a plain box is unchanged — no diagonal appears unasked (ADR-052)', () => {
    const { st, c } = build(['תיבה מלבנית']);
    expect(st.lastError).toBeNull();
    expect(c.segments).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// The MECHANISM — the class net, which is what closes the members nobody reported.
// ---------------------------------------------------------------------------
describe('droppedConstructNoun3 — a stated construct that no command produced refuses honestly', () => {
  it.each([
    // AMBIGUOUS on purpose: a bare «אלכסון» on a box could be a FACE diagonal, and guessing would
    // assert a given the student never gave (ADR-052). Honest refusal → the LLM lane, never a silent ✓.
    ['a bare diagonal on a cube', 'קובייה עם אלכסון'],
    ['a bare diagonal on a box', 'תיבה מלבנית ובה אלכסון'],
    // the pyramid HEIGHT is a real missing capability (#448) — the gate turns its silent drop honest
    ['a pyramid height (#448 capability)', 'פירמידה ABCD עם גובה'],
    ['English', 'a cube with a diagonal'],
  ])('%s', (_label, line) => {
    const { st } = build([line]);
    expect(st.facts).toHaveLength(0); // keep-prior: nothing silently committed
    expect(st.lastError).toMatchObject({ code: 'dropped-given' });
  });

  it('names the STATEMENT that was lost, never internal state (honesty invariant)', () => {
    const { st } = build(['קובייה עם אלכסון']);
    expect((st.lastError as { items: string }).items).toContain('אלכסון');
  });

  it('a bare shape with NO construct noun is untouched', () => {
    for (const line of ['תיבה מלבנית', 'קובייה ABCDA\'B\'C\'D\'', 'משולש ABC', 'פירמידה ABCD']) {
      const { st } = build([line]);
      expect(st.lastError, line).toBeNull();
    }
  });

  it('is GENEROUS — any command beyond the bare shape accounts for the noun', () => {
    // the measured false-positive families of the first draft: a diagonal lowered to a POINT, a height
    // lowered to a PERPENDICULARITY, a height carried as a FIELD of a revolution solid.
    for (const line of [
      'O נקודת חיתוך אלכסוני הבסיס',
      'חרוט שקודקודו S ומרכז בסיסו O, רדיוסו 5 וגובהו 12',
      "אלכסון BD'",
    ]) {
      const p = parse3(line);
      expect(p.ok, line).toBe(true);
      if (p.ok) expect(droppedConstructNoun3(line, p.commands), line).toEqual([]);
    }
  });
});

/**
 * #459 — the refusal SENTENCE, not the refusal.
 *
 * `droppedConstructNoun3` shares the `dropped-given` error code with the four older gates, and that one
 * string opened with "part of the input did not reach the figure" and closed with "nothing was added".
 * The operator read the two clauses as contradicting each other, and they do: **every one of the five
 * gates returns before committing**, so no path has ever added part of an utterance. The "part" framing
 * was written for the number/label gates and was inaccurate for all of them; the construct-noun gate is
 * simply where a reader first noticed, because a dropped OBJECT is visible in a way a number is not.
 */
describe('#459 — the shared refusal message claims no partial commit', () => {
  it.each([['he', he], ['en', en]])('%s', (_loc, bundle) => {
    const msg = (bundle as { err: { droppedGiven: string } }).err.droppedGiven;
    expect(msg).toContain('{{items}}'); // still NAMES the lost statement (the honesty invariant)
    // No path commits partially, so the copy must not imply one did.
    for (const partial of ['חלק מהקלט', 'Part of the input', 'part of the input']) {
      expect(msg, `must not claim a partial commit: ${partial}`).not.toContain(partial);
    }
  });
});
