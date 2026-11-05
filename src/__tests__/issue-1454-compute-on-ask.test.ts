/**
 * #1454 arm 4 (ADR-788) — submitting an ask computes THAT question's answer; «חשב ערכים» keeps the panel.
 *
 * Operator, 2026-09-27: asked whether 2-D should compute on ask like its siblings — *"Compute on ask"*:
 * the worker path, the panel's value and knowledge rules, a determined value prints, else its WHY; the
 * button stays for the full values panel.
 *
 * Measured at pickup: asking already ran the compute, but through `viewValues`, so it filled the PANEL too:
 * the values card opened and its button left, on an ask and even on removing one. The store owns that
 * split now, so these drive the store, not a copy of it.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { askLaneRows, waitingNote, type QueryRow } from '@/engine/valuesPanel';
import { buildParseCtx, parse } from '@/parser';
import { replay, useGeoStore } from '@/store/geoStore';

const store = () => useGeoStore.getState();

function build(utterances: string[]): void {
  for (const u of utterances) {
    const { construction, positions } = replay(store().facts);
    const r = parse(u, buildParseCtx(construction, positions));
    if (!r.ok) throw new Error(u);
    store().executeMany(r.commands, u);
  }
}

/** The operator's defining interaction: a square, a point sliding on a side, an angle that fixes it. */
const SQUARE = ['ריבוע ABCD', 'G על AD', 'זווית GBA = 37'];

const rowsOf = (computing = false) => {
  const { queries, asks, values, facts } = store();
  return askLaneRows(
    queries,
    asks?.facts === facts ? asks.rows : null,
    values?.facts === facts ? values.result.queryRows : null,
    computing,
  );
};

describe('#1454 — an ask answers itself', () => {
  beforeEach(() => store().clear());

  it('a determined value prints from the ask alone, and the panel stays behind its button', async () => {
    build(SQUARE);
    await store().answerAsks(); // nothing asked yet: an empty run is harmless
    store().addQuery('∠GBC');
    expect(store().asking, 'the row reads «חושב…» while the compute runs').toBe(store().facts);
    await store().answerAsks();
    const [row] = rowsOf();
    expect(row.value).toBeCloseTo(53, 4);
    expect(row.note).toBeUndefined();
    expect(store().asking).toBeNull();
    expect(store().values, 'asking never fills the full panel').toBeNull();
  });

  it('a question the givens do not fix gets its WHY, from the same ask', async () => {
    build(['ריבוע ABCD', 'G על AD']);
    store().addQuery('∠GBC');
    await store().answerAsks();
    const [row] = rowsOf();
    expect(row.value).toBeNull();
    expect(row.note).toBe('undetermined');
    expect(store().values).toBeNull();
  });

  it('the answer equals the panel’s row: «חשב ערכים» answers saved questions from the one pool', async () => {
    build(SQUARE);
    store().addQuery('∠GBC');
    await store().answerAsks();
    const asked = rowsOf()[0];
    await store().viewValues();
    expect(store().values, 'the button still computes the full panel').not.toBeNull();
    expect(store().values!.result.queryRows[0].value).toBe(asked.value);
  });

  it('removing a question computes nothing and leaves the other answers', async () => {
    build(SQUARE);
    store().addQuery('∠GBC');
    store().addQuery('∠GBA');
    await store().answerAsks();
    store().removeQuery('∠GBC');
    expect(store().asking).toBeNull();
    expect(store().values).toBeNull();
    expect(rowsOf().map((r) => r.text)).toEqual(['∠GBA']);
    expect(rowsOf()[0].value).toBeCloseTo(37, 4);
  });

  it('a later ask keeps the earlier answers, and a repeat of an answered question costs nothing', async () => {
    build(SQUARE);
    store().addQuery('∠GBC');
    await store().answerAsks();
    store().addQuery('∠GBC');
    expect(store().asking, 'already answered for this figure').toBeNull();
    store().addQuery('∠GBA');
    await store().answerAsks();
    expect(rowsOf().map((r) => Math.round(r.value!))).toEqual([53, 37]);
  });

  it('a new fact leaves a saved question waiting, and asking it again answers it (unchanged, #882)', async () => {
    build(['ריבוע ABCD', 'G על AD']);
    store().addQuery('∠GBC');
    await store().answerAsks();
    build(['זווית GBA = 37']);
    expect(rowsOf()[0].note).toBe('pending');
    expect(store().queries).toEqual(['∠GBC']);
    store().addQuery('∠GBC'); // the box's dedupe keeps one line; the answer is stale, so it asks
    await store().answerAsks();
    expect(rowsOf()[0].value).toBeCloseTo(53, 4);
  });
});

describe('#1454 — the lane’s rows', () => {
  const answered: QueryRow = { text: 'AB', kind: 'length', label: 'AB', ids: [], value: 5, exact: null };
  const panel: QueryRow = { ...answered, text: 'BC', label: 'BC', value: 7 };

  it('keep the order asked, and read the ask layer and the panel alike', () => {
    expect(askLaneRows(['BC', 'AB'], [answered], [panel], false).map((r) => r.value)).toEqual([7, 5]);
  });

  it('a question neither holds waits, and says which kind of waiting', () => {
    expect(askLaneRows(['AB'], null, null, true)[0].note).toBe(waitingNote(true));
    expect(askLaneRows(['AB'], null, null, false)[0].note).toBe(waitingNote(false));
  });
});
