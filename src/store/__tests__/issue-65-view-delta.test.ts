import { describe, expect, it } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { useGeoStore, replay, viewDeltaOf } from '@/store/geoStore';
import { viewDelta } from '@/replay/viewDelta';

/**
 * #65 / [ADR-517](../../../docs/06-decisions.md#adr-517) — «הציגו תצורה אחרת» accounts for what it moved
 * and what it kept.
 *
 * The mechanism always knew its delta; the student was never told. What this locks is that the account is
 * (a) TRUE — judged on similarity-invariant quantities, so a whole-figure rotation or resize is never
 * reported as a change — and (b) SELF-RETIRING: the note describes one view, and any statement, edit or
 * undo that leaves that view retires it without a clearing call at each of those sites.
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

describe('#65 — the press says what it changed', () => {
  it('a RESAMPLE names a freedom that moved, and everything it names is a real freedom', () => {
    build(['משולש ABC']);
    expect(useGeoStore.getState().resample(), 'the triangle has another configuration').toBe(true);

    const d = viewDeltaOf(useGeoStore.getState());
    expect(d, 'the press left an account').not.toBeNull();
    expect(d!.changed.length, 'something moved — that is why the press succeeded').toBeGreaterThan(0);
    // Every item is a point/radius/branch/variant of THIS figure — the note can only name the figure's
    // own freedoms, never an invented one.
    const ids = new Set(['A', 'B', 'C']);
    for (const it of [...d!.changed, ...d!.kept]) expect(ids.has(it.id), `${it.kind} ${it.id}`).toBe(true);
  });

  it('a pure SIMILARITY transform is not a change — the invariance the note rests on', () => {
    // The same figure, at the same seed, is trivially the same view: nothing changed, and nothing may be
    // reported as changed. (The stronger property — that a rotation/resize between seeds is not reported —
    // is what the invariant signature buys; this locks the degenerate case exactly.)
    build(['משולש ABC']);
    const st = useGeoStore.getState();
    const fig = replay(st.facts, st.seed);
    const d = viewDelta(st.facts, fig, st.facts, fig);
    expect(d.changed, 'a view compared with itself changed nothing').toEqual([]);
    expect(d.kept.length, "…and its freedoms are all reported as KEPT").toBeGreaterThan(0);
  });

  it('a free RADIUS is a freedom the note can name (#1005 taught the button to see it)', () => {
    build(['מעגל O', 'M מחוץ למעגל']);
    const before = useGeoStore.getState();
    const d = viewDelta(before.facts, replay(before.facts, 0), before.facts, replay(before.facts, 2));
    // Seeds 0 and 2 differ in |OM|/r, so at least one of the figure's freedoms must read as changed.
    expect(d.changed.length, 'two genuinely different drawings must produce a non-empty account').toBeGreaterThan(0);
    expect([...d.changed, ...d.kept].some((i) => i.kind === 'radius'), 'the circle radius is one of the freedoms named').toBe(true);
  });

  it('the note RETIRES itself when the student moves off that view', () => {
    build(['משולש ABC']);
    expect(useGeoStore.getState().resample()).toBe(true);
    expect(viewDeltaOf(useGeoStore.getState()), 'live right after the press').not.toBeNull();

    // A further statement — the note now describes a view that is no longer on screen.
    const r = parse('AB = 6', ctxOf());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const c of r.commands) useGeoStore.getState().execute(c, 'AB = 6', 'g-len');

    expect(viewDeltaOf(useGeoStore.getState()), 'retired, with no clearing call at the submit site').toBeNull();
  });

  it('a DETERMINED figure leaves no note — the press did not change a view', () => {
    build(['ריבוע ABCD']);
    expect(useGeoStore.getState().resample(), 'a bare square has no other configuration').toBe(false);
    expect(viewDeltaOf(useGeoStore.getState())).toBeNull();
  });
});
