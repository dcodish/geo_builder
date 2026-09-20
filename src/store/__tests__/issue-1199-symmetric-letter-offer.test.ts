/**
 * #1199 — THE LETTER OFFER IS SYMMETRIC. «Always allow switching names of nodes.»
 *
 * **Operator, 2026-09-18, playing round #1193 T14:** *"this one is weird. pressing on D and asking it to
 * be A is refused, but pressing on A and asking it to be D is allowed (offers to switch between them). I
 * see no difference in the cases so we should always allow switching names of nodes."*
 *
 * That is the ruling [ADR-520 Am. 1](../../../docs/06-decisions.md#adr-520) deliberately left open.
 *
 * ## Why it was asymmetric
 *
 * `letterHolder` carried a `swappable` flag and the offer gated on it. The flag was written to answer
 * *"is deleting the holder safe?"* — back when the offer DELETED the holder's statement. #1013 retired
 * the delete and kept the flag as the offer's scope, on his earlier approval. The gate read the
 * **target's** holder only, so the same pair of letters was refused in one direction and offered in the
 * other, decided by nothing but which of the two he clicked first.
 *
 * With the delete gone the flag was answering a question nobody asks. It is removed rather than pinned
 * to `true`.
 *
 * ## The within-a-ring sub-case, measured — and the issue body has it BACKWARDS
 *
 * The issue flagged «מרובע ABCD» `swap(A,C)` as silently becoming a different, crossed quadrilateral,
 * *"because A and C are opposite vertices"*. Measured on the construction rather than reasoned about,
 * the opposite is true:
 *
 * ```
 * swap(A,C) → «מרובע CBAD»   sides  seg-AB seg-AD seg-BC seg-CD   ← IDENTICAL to ABCD's
 * swap(B,D) → «מרובע ADCB»   sides  seg-AB seg-AD seg-BC seg-CD   ← identical
 * swap(A,B) → «מרובע BACD»   sides  seg-AB seg-AC seg-BD seg-CD   ← the diagonals: a DIFFERENT ring
 * ```
 *
 * Exchanging two OPPOSITE vertices reverses the ring, and a ring equals its own reverse — so those two
 * swaps are pure relabellings. It is the ADJACENT pair that re-declares the shape, and the issue did not
 * flag it. Recorded here because the sub-case it warned about is not the sub-case that exists.
 *
 * Option (1) of the arming comment is taken — allow it, the declaration follows the letters — and the
 * rows below are why that is safe rather than merely permitted.
 */
import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { useGeoStore, replay, letterHolder } from '@/store/geoStore';
import { swapOffered } from '@/render/Figure';

function ctxOf() {
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  return buildParseCtx(d.construction, d.positions);
}

function build(utterances: string[]) {
  const st = useGeoStore.getState();
  st.clear();
  for (const u of utterances) {
    const r = parse(u, ctxOf());
    expect(r.ok, `setup «${u}»`).toBe(true);
    if (!r.ok) return;
    for (const c of r.commands) st.execute(c, u, `g-${u}`);
  }
}

/** The figure's side set, which is what "a different quadrilateral" actually means. */
const sidesOf = () => {
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed) as unknown as { construction: { objects: { kind: string; id: string }[] } };
  return d.construction.objects
    .filter((o) => o.kind === 'segment')
    .map((o) => o.id)
    .sort()
    .join(' ');
};

describe('#1199 — the same pair of letters answers the same way in both directions', () => {
  const swapOn = (setup: string[], a: string, b: string) => {
    build(setup);
    return useGeoStore.getState().swap(a, b).ok;
  };

  /**
   * The operator's own case. Asserted as the two directions AGREEING — the defect was never that one
   * direction was wrong, it was that they differed.
   */
  it('D→A and A→D agree on «משולש ABC» + «נקודה D»', () => {
    const setup = ['משולש ABC', 'נקודה D'];
    expect(swapOn(setup, 'A', 'D')).toBe(swapOn(setup, 'D', 'A'));
    expect(swapOn(setup, 'A', 'D'), 'and the answer is «always allow»').toBe(true);
  });

  it.each([
    ['a shape vertex and a loose point', ['משולש ABC', 'נקודה D'], 'A', 'D'],
    ['two vertices of one shape', ['משולש ABC'], 'A', 'B'],
    ['a letter another statement depends on', ['משולש ABC', 'נקודה D', 'נקודה F', 'AF'], 'F', 'D'],
    ['two loose points', ['נקודה D', 'נקודה E'], 'D', 'E'],
  ])('%s: both directions agree', (_name, setup, a, b) => {
    expect(swapOn(setup, a, b)).toBe(swapOn(setup, b, a));
  });

  /**
   * And the holder is still NAMED, which is what #238 built and what the refusal message needs. Removing
   * `swappable` must not remove the reason `letterHolder` exists.
   */
  it('a taken letter still names its holder, in the student’s own wording', () => {
    build(['משולש ABC', 'נקודה D']);
    expect(letterHolder(useGeoStore.getState().facts, 'A')).toMatchObject({ utterance: 'משולש ABC' });
    const res = useGeoStore.getState().rename('D', 'A');
    expect(res.ok).toBe(false);
    if (!res.ok && res.reason === 'target-taken') {
      expect(res.holder?.utterance).toBe('משולש ABC');
    }
  });
});

/**
 * NOTHING IS DESTROYED, which is the property #1013's ruling actually protects and the one a widened
 * offer could put at risk. Every swap keeps every statement, and one undo puts everything back.
 */
/**
 * THE GATE ITSELF — the rows above pass on the OLD code too, and that is the point of this block.
 *
 * The store’s `swap` was always symmetric; the asymmetry lived in the OFFER, one layer up, where
 * the letter box gated its swap button on the target holder’s `swappable` flag. A lock that only drives
 * the store therefore proves nothing about the defect he reported — it was vacuous when first written
 * here, and measured as such before this block was added.
 *
 * So the decision is EXTRACTED (`swapOffered`, called by the JSX gate) and asserted through the real
 * `letterHolder` output, per the locks-must-call rule.
 */
describe('#1199 — the OFFER, which is where the asymmetry actually lived', () => {
  const holderOf = (setup: string[], letter: string) => {
    build(setup);
    return letterHolder(useGeoStore.getState().facts, letter);
  };

  it.each([
    ['a SHAPE-held letter — refused before the ruling', ['משולש ABC', 'נקודה D'], 'A'],
    ['a plain point statement — offered before it too', ['משולש ABC', 'נקודה D'], 'D'],
    ['a letter another statement depends on', ['משולש ABC', 'נקודה D', 'נקודה F', 'AF'], 'F'],
  ])('%s: the swap is OFFERED', (_name, setup, letter) => {
    expect(swapOffered(holderOf(setup, letter))).toBe(true);
  });

  it('and a letter nobody holds offers nothing — the predicate is not simply true', () => {
    expect(swapOffered(holderOf(['משולש ABC'], 'Z'))).toBe(false);
  });
});

describe('#1199 — the widened offer still drops nothing', () => {
  it.each([
    ['a shape vertex and a loose point', ['משולש ABC', 'נקודה D'], 'A', 'D'],
    ['two vertices of one shape', ['מרובע ABCD'], 'A', 'B'],
    ['a depended-on letter', ['משולש ABC', 'נקודה D', 'נקודה F', 'AF'], 'F', 'D'],
  ])('%s: every fact survives, and one undo restores the session', (_name, setup, a, b) => {
    build(setup);
    const before = useGeoStore.getState().facts;
    expect(useGeoStore.getState().swap(a, b).ok).toBe(true);
    expect(useGeoStore.getState().facts.length, 'no fact dropped').toBe(before.length);
    useGeoStore.temporal.getState().undo();
    expect(useGeoStore.getState().facts, 'one undo, both letters back').toEqual(before);
  });

  it('a dependent statement FOLLOWS its letter rather than being orphaned', () => {
    build(['משולש ABC', 'נקודה D', 'נקודה F', 'AF']);
    expect(useGeoStore.getState().swap('F', 'D').ok).toBe(true);
    expect(useGeoStore.getState().facts.map((f) => f.utterance)).toContain('AD');
  });
});

/**
 * THE RING SUB-CASE, measured rather than argued. This is the block that would have caught the issue's
 * mistake, and it is stated as a property of the SIDE SET — what "a different quadrilateral" means —
 * rather than as a claim about which letters are opposite.
 */
describe('#1199 — swapping within one declared ring', () => {
  const sidesAfter = (a: string, b: string) => {
    build(['מרובע ABCD']);
    const before = sidesOf();
    useGeoStore.getState().swap(a, b);
    return { before, after: sidesOf(), utterance: useGeoStore.getState().facts[0].utterance };
  };

  it.each([
    ['A', 'C'],
    ['B', 'D'],
  ])('OPPOSITE vertices %s↔%s only relabel — the ring is its own reverse', (a, b) => {
    const r = sidesAfter(a, b);
    expect(r.after, `«${r.utterance}» draws the same sides`).toBe(r.before);
  });

  /**
   * The ADJACENT pair genuinely re-declares the shape — the sub-case the issue meant to flag. Allowed
   * under «always allow switching», and asserted here so the consequence is on the record rather than
   * discovered: the declaration follows the letters, and the result is still a legitimate quadrilateral
   * over four free points, not an error.
   */
  it('ADJACENT vertices A↔B re-declare the ring, and that is allowed and clean', () => {
    const r = sidesAfter('A', 'B');
    expect(r.utterance).toBe('מרובע BACD');
    expect(r.after, 'the side set really did change — this is the sub-case').not.toBe(r.before);
    expect(useGeoStore.getState().facts, 'and it is still one statement, not two').toHaveLength(1);
  });
});
