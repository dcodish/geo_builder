import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { useGeoStore, replay, letterHolder } from '@/store/geoStore';

/**
 * #238 / [ADR-520](../../../docs/06-decisions.md#adr-520) — a taken letter NAMES its holder, and can be
 * taken back when the holder is orphaned.
 *
 * Prod session `ne810woo` (2026-07-20): *"I selected the letter O as intersection between segments but
 * then I did a different config which moved the intersection to different segments. When I tried to
 * assign O now, it is taken. This would be wrong since O is not on the diagram anymore."* The refusal was
 * a flat «האות כבר בשימוש» with no way, from the canvas, to see WHO held the letter or to take it back.
 *
 * ADR-379 closed the common road into that dead end (a clicked crossing can no longer orphan its letter).
 * What is locked here is the rarer class that survives it.
 *
 * ## #1013 (ADR-520 Am. 1) — the offer SWAPS; it never deletes
 *
 * The feature shipped with a destructive offer: *"take the letter and remove that step"*. On «משולש ABC»
 * · «נקודה D» · «נקודה E», asking D → E left **four** points and no «נקודה D» — the student asked to
 * re-letter one point and lost another, plus the statement that created it.
 *
 * Operator ruling, 2026-09-18, playing the PR: *"deleting a phase is a capability I do not want to have
 * automatically done as users will not expect the consequences."* So the destructive path is **retired,
 * not merely guarded** — keeping it behind a stricter gate would still be a delete nobody asked for.
 *
 * What this file now locks is therefore the opposite property: **no path from the letter box drops a
 * fact**. `swappable` keeps the offer's SCOPE exactly where it was (a plain point statement, never a
 * shape) — deliberately not widened, since whether a shape-held letter should become swappable is an
 * open ruling.
 */

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
    expect(r.ok, `setup «${u}»: ${JSON.stringify(r)}`).toBe(true);
    if (!r.ok) return;
    for (const c of r.commands) st.execute(c, u, `g-${u}`);
  }
}

describe('#238 — the refusal names who holds the letter', () => {
  it('a refused rename carries the holder, quoted in the student’s own wording', () => {
    build(['משולש ABC', 'נקודה D']);
    const res = useGeoStore.getState().rename('D', 'A');
    expect(res.ok).toBe(false);
    if (res.ok || res.reason !== 'target-taken') throw new Error(`expected target-taken, got ${JSON.stringify(res)}`);
    expect(res.holder, 'the refusal knows who holds A').not.toBeNull();
    expect(res.holder!.utterance, 'the holder is quoted as the student wrote it').toBe('משולש ABC');
  });

  /**
   * T7's refusal, unchanged. A swap would be mechanically safe here — the triangle's vertex A and the
   * loose point D could simply exchange names — but the operator approved this refusal as it stands, so
   * #1013 does NOT widen the offer to it. That is a separate ruling.
   */
  it('a letter held by a SHAPE is not offered — the refusal stands, unwidened', () => {
    build(['משולש ABC', 'נקודה D']);
    const h = letterHolder(useGeoStore.getState().facts, 'A')!;
    expect(h.swappable, '«משולש ABC» holds A, so no offer appears beside the refusal').toBe(false);
    expect(h.utterance, 'and the refusal still names the holder in the student’s wording').toBe('משולש ABC');
  });

  /**
   * THE OPERATOR'S OWN SEQUENCE (#1013). Before the fix this left FOUR points and no «נקודה D».
   * Every assertion here is about what SURVIVES, because the defect was a silent loss.
   */
  it('the offer SWAPS the two letters — five points stay five, and both statements survive', () => {
    build(['משולש ABC', 'נקודה D', 'נקודה E']);
    const h = letterHolder(useGeoStore.getState().facts, 'E')!;
    expect(h.swappable, '«נקודה E» introduces E and nothing else').toBe(true);

    const countBefore = useGeoStore.getState().facts.length;
    const res = useGeoStore.getState().swap('D', 'E');
    expect(res.ok, JSON.stringify(res)).toBe(true);

    const after = useGeoStore.getState();
    expect(after.facts.length, 'NO fact was dropped — this is the whole point').toBe(countBefore);
    expect(after.facts.some((f) => f.id === h.factId), 'the holder statement is still there').toBe(true);

    const d = replay(after.facts, after.seed);
    expect([...d.positions.keys()].sort(), 'five points, not four').toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(d.lastError).toBeNull();
    // Both «נקודה» rows survive; the two letters have exchanged places, so the list still reads D and E.
    expect(after.facts.map((f) => f.utterance).filter((u) => u?.startsWith('נקודה')).sort()).toEqual([
      'נקודה D',
      'נקודה E',
    ]);
  });

  it('the swap is ONE undo entry — both letters go back together', () => {
    build(['משולש ABC', 'נקודה D', 'נקודה E']);
    const before = useGeoStore.getState().facts;
    expect(useGeoStore.getState().swap('D', 'E').ok).toBe(true);
    useGeoStore.temporal.getState().undo();
    expect(useGeoStore.getState().facts, 'a single undo restores the session exactly').toEqual(before);
  });

  it('a letter something else DEPENDS on is not offered', () => {
    // F is used by a second statement. The offer's SCOPE is unchanged by #1013, deliberately.
    build(['משולש ABC', 'נקודה D', 'נקודה F', 'AF']);
    expect(letterHolder(useGeoStore.getState().facts, 'F')!.swappable, 'segment AF still mentions F').toBe(false);
  });

  /**
   * THE RETIREMENT, asserted rather than assumed. The ruling is that the destructive capability is gone,
   * not merely gated — so the action itself must not be reachable. A test that only checked the button's
   * wording would pass with the delete still sitting in the store for the next caller to find.
   */
  it('there is NO destructive reclaim left on the store', () => {
    expect('reclaim' in useGeoStore.getState(), 'the delete-then-rename path is retired, not re-gated').toBe(false);
  });

  it('a letter nobody holds has no holder — the refusal path is not reached', () => {
    build(['משולש ABC']);
    expect(letterHolder(useGeoStore.getState().facts, 'Z')).toBeNull();
  });
});
