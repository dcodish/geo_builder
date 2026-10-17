import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { parse, buildParseCtx } from '@/parser';
import { useGeoStore, replay } from '@/store/geoStore';

/**
 * #1866 / [ADR-734](../../../docs/06-decisions.md#adr-734) — «הציגו תצורה אחרת» says nothing when it finds
 * another drawing. Operator ruling 2026-10-07: *"user sees on screen what changes and what is fixed"* —
 * "Remove the whole note". This supersedes ADR-517's varied/kept note (#65).
 *
 * Without its keys the note cannot be shown, so the locale lock covers every input (the operator's
 * «משולש ABC», and #2314's «שני מעגלים» with its internal ids) without re-implementing the press. The
 * «אין תצורה אחרת…» note for a press that finds nothing is NOT part of the ruling and stays.
 */

const REMOVED = ['viewChanged', 'viewChangedKept', 'deltaPoint', 'deltaRadius', 'deltaBranch', 'deltaVariant', 'deltaMore'];

function build(utterances: string[]) {
  const st = useGeoStore.getState();
  st.clear();
  for (const u of utterances) {
    const s = useGeoStore.getState();
    const d = replay(s.facts, s.seed);
    const r = parse(u, buildParseCtx(d.construction, d.positions));
    expect(r.ok, `setup «${u}»: ${JSON.stringify(r)}`).toBe(true);
    if (!r.ok) return;
    for (const c of r.commands) s.execute(c, u, `g-${u}`);
  }
}

describe('#1866 — no varied/kept note after «הציגו תצורה אחרת»', () => {
  it.each(['he', 'en'])('the note keys are gone from the %s locale', (lng) => {
    for (const k of REMOVED) expect(i18n.exists(`actions.${k}`, { lng }), `actions.${k}`).toBe(false);
  });

  it('a press that finds another view leaves no delta in the store', () => {
    build(['משולש ABC']);
    expect(useGeoStore.getState().resample(), 'the triangle has another configuration').toBe(true);
    const st = useGeoStore.getState() as unknown as Record<string, unknown>;
    expect('lastViewDelta' in st).toBe(false);
    expect('clearViewDelta' in st).toBe(false);
  });

  it('#2314\'s case: «שני מעגלים» + the press finds another view, and nothing is left to name ctr-O@ / circle-O', () => {
    build(['שני מעגלים']);
    expect(useGeoStore.getState().resample(), 'two circles have another configuration').toBe(true);
    expect('lastViewDelta' in (useGeoStore.getState() as unknown as Record<string, unknown>)).toBe(false);
  });

  it('control: a determined figure still answers the press with «אין תצורה אחרת…»', () => {
    build(['ריבוע ABCD']);
    expect(useGeoStore.getState().resample(), 'a square has no other shape').toBe(false);
    expect(i18n.t('actions.onlyConfig', { lng: 'he' })).toBe('אין תצורה אחרת — הצורה נקבעה (רק הגודל/המיקום משתנים)');
  });
});
