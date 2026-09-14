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
 * What is locked here is the rarer class that survives it — and, above all, that **reclaiming can never
 * become a quiet delete**: the letter comes back only when dropping its holder removes the letter and
 * nothing else.
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

  it('a letter held by a SHAPE is NOT reclaimable — dropping it would take the other vertices too', () => {
    build(['משולש ABC', 'נקודה D']);
    const h = letterHolder(useGeoStore.getState().facts, 'A')!;
    expect(h.reclaimable, 'dropping «משולש ABC» would silently remove B and C as well').toBe(false);

    // …and `reclaim` REFUSES it, so the offer can never become a quiet delete.
    const before = useGeoStore.getState().facts.length;
    const res = useGeoStore.getState().reclaim('D', 'A');
    expect(res.ok).toBe(false);
    expect(useGeoStore.getState().facts.length, 'nothing was dropped').toBe(before);
  });

  it('a letter held by a statement that introduces ONLY it IS reclaimable, in one undoable action', () => {
    // «נקודה E» introduces E and nothing else, and nothing is built on E — so E can come back.
    build(['משולש ABC', 'נקודה D', 'נקודה E']);
    const h = letterHolder(useGeoStore.getState().facts, 'E')!;
    expect(h.reclaimable).toBe(true);

    const countBefore = useGeoStore.getState().facts.length;
    const res = useGeoStore.getState().reclaim('D', 'E');
    expect(res.ok, JSON.stringify(res)).toBe(true);

    const after = useGeoStore.getState();
    // Asserted on the fact ID, not the wording: a rename legitimately REWRITES «נקודה D» to read
    // «נקודה E», so the text alone cannot tell the dropped holder from the renamed row.
    expect(after.facts.some((f) => f.id === h.factId), 'the orphaned holder is gone').toBe(false);
    expect(after.facts.length, 'exactly one statement was dropped').toBe(countBefore - 1);
    const d = replay(after.facts, after.seed);
    expect(d.positions.has('E'), 'the letter is now the renamed point').toBe(true);
    expect(d.positions.has('D'), 'the old letter is released').toBe(false);
    expect(d.lastError).toBeNull();
  });

  it('a letter something else DEPENDS on is not reclaimable', () => {
    // F is used by a second statement, so dropping the one that introduced it would break that one.
    build(['משולש ABC', 'נקודה D', 'נקודה F', 'AF']);
    expect(letterHolder(useGeoStore.getState().facts, 'F')!.reclaimable, 'segment AF still needs F').toBe(false);
    expect(useGeoStore.getState().reclaim('D', 'F').ok).toBe(false);
  });

  it('the reclaim is ONE undo entry — the statement and the old letter come back together', () => {
    build(['משולש ABC', 'נקודה D', 'נקודה E']);
    const before = useGeoStore.getState().facts;
    expect(useGeoStore.getState().reclaim('D', 'E').ok).toBe(true);
    useGeoStore.temporal.getState().undo();
    expect(useGeoStore.getState().facts, 'a single undo restores the session exactly').toEqual(before);
  });

  it('a letter nobody holds has no holder — the refusal path is not reached', () => {
    build(['משולש ABC']);
    expect(letterHolder(useGeoStore.getState().facts, 'Z')).toBeNull();
  });
});
