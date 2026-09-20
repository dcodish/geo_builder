import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { useGeoStore, replay, letterHolder } from '@/store/geoStore';
import { ctrlBtn } from '@/render/Figure';

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
 * fact**.
 *
 * ## #1199 (ADR-532) — the offer appears wherever a letter is taken
 *
 * #1013 kept the predicate as the offer's SCOPE and called the widening a separate ruling. That ruling
 * came, playing round #1193 T14: *"pressing on D and asking it to be A is refused, but pressing on A and
 * asking it to be D is allowed … I see no difference in the cases so we should always allow switching
 * names of nodes."*
 *
 * The gate read the TARGET’s holder only, so the same pair of letters was refused in one direction and
 * offered in the other. `swappable` is therefore gone — not pinned to `true` — and the rows below that
 * asserted it now assert what they were really about: that the refusal still NAMES its holder, and that
 * the swap still drops nothing.
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
   * T7’s refusal — **and the swap #1199 now offers beside it.** #1013 said in as many words that this
   * swap *"would be mechanically safe here — the triangle’s vertex A and the loose point D could simply
   * exchange names"* and left it to a ruling. The ruling came; the swap is asserted to be as safe as that
   * sentence predicted, on the figure rather than on the prediction.
   */
  it('a letter held by a SHAPE is offered too, and the swap keeps every point (#1199)', () => {
    build(['משולש ABC', 'נקודה D']);
    const h = letterHolder(useGeoStore.getState().facts, 'A')!;
    expect(h.utterance, 'the refusal still names the holder in the student’s wording').toBe('משולש ABC');

    const before = useGeoStore.getState().facts.length;
    expect(useGeoStore.getState().swap('A', 'D').ok, 'the swap the old gate refused').toBe(true);
    const after = useGeoStore.getState();
    expect(after.facts.length, 'NO fact was dropped').toBe(before);
    expect(after.facts.map((f) => f.utterance)).toEqual(['משולש DBC', 'נקודה A']);
  });

  /**
   * THE ASYMMETRY ITSELF, which is what he reported. Asserted as the two directions AGREEING rather than
   * as either one’s answer — the defect was never that one direction was wrong, it was that they differed
   * for the same pair of letters.
   */
  it('the offer is symmetric — the same pair answers the same way both ways', () => {
    const swapFrom = (a: string, b: string) => {
      build(['משולש ABC', 'נקודה D']);
      return useGeoStore.getState().swap(a, b).ok;
    };
    expect(swapFrom('A', 'D')).toBe(swapFrom('D', 'A'));
    expect(swapFrom('A', 'D'), 'and the answer is yes — «always allow switching»').toBe(true);
  });

  /**
   * THE OPERATOR'S OWN SEQUENCE (#1013). Before the fix this left FOUR points and no «נקודה D».
   * Every assertion here is about what SURVIVES, because the defect was a silent loss.
   */
  it('the offer SWAPS the two letters — five points stay five, and both statements survive', () => {
    build(['משולש ABC', 'נקודה D', 'נקודה E']);
    const h = letterHolder(useGeoStore.getState().facts, 'E')!;
    expect(h.utterance, '«נקודה E» is the statement that introduced E').toBe('נקודה E');

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

  /**
   * A letter another statement DEPENDS on. The old gate refused the offer here, because dropping the
   * holder would have taken «AF» with it. Nothing is dropped any more, so #1199 allows it — and what
   * matters is that the dependent statement FOLLOWS the letter rather than being orphaned or lost.
   */
  it('a letter another statement depends on swaps, and that statement follows it (#1199)', () => {
    build(['משולש ABC', 'נקודה D', 'נקודה F', 'AF']);
    const before = useGeoStore.getState().facts.length;
    expect(useGeoStore.getState().swap('F', 'D').ok).toBe(true);
    const after = useGeoStore.getState();
    expect(after.facts.length, 'the dependent statement survives').toBe(before);
    expect(after.facts.map((f) => f.utterance)).toContain('AD');
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

  /**
   * THE OFFER MUST NOT LOOK DISABLED (#1277).
   *
   * Operator, playing this PR: *"the button is grayed so user might think this option is not available"*.
   * Measured in the running app, the swap offer computed `#64748b` — `--color-text-muted`, the token this
   * tree uses for inactive text — because it is nested inside the holder note's muted block and a
   * `<button>` inherits `color`. Nothing was disabled; only the colour said so.
   *
   * The lock CALLS the style ([ADR-W-053](../../../docs/06w-decisions-workspace.md#adr-w-053)) rather than
   * grepping the file, and it asserts the property that fixes the CLASS: the menu's button style declares
   * its own colour, so no control nested in a coloured block can silently go muted. Asserting the literal
   * `#0f172a` would lock the palette instead of the rule — the token is what must be there.
   */
  it('the point-menu button declares its own colour, so a nested one cannot inherit a muted block', () => {
    expect(ctrlBtn.color, 'ctrlBtn must not leave its colour to the cascade').toBeDefined();
    expect(String(ctrlBtn.color)).toContain('--color-text');
    expect(String(ctrlBtn.color)).not.toContain('muted');
  });
});
