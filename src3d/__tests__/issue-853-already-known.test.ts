/**
 * #853 (ADR-3D-209) — «true, and already known» is ONE channel.
 *
 * Four notices used to say the same sentence to the student, each with its own kind, its own string
 * and its own detection: `shape-redundant` (#612), `redundant-relation` (#396),
 * `containment-redundant` (#842) and `relation-entailed` (#850). Each was added because the previous
 * one did not cover the case at hand — which is also the definition of an enumeration growing by one
 * member per report.
 *
 * The per-case behaviour is locked where it was written (issue-612-615, panel-bundle, issue-842,
 * issue-850 — all four still assert their own figures). What THIS file locks is the convergence: the
 * four cases arrive on one channel, and the fifth case is one list entry plus its wording, with the
 * suite refusing a `rel` that has no message in either language.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { ALREADY_KNOWN_RELS, type BuildNotice3 } from '../engine/notices';
import he from '../i18n/locales/he.json';
import en from '../i18n/locales/en.json';

const st = () => useGeo3.getState();
function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const build = (us: string[]) => {
  reset();
  for (const u of us) st().submit(u);
};
const known = (): Extract<BuildNotice3, { kind: 'already-known' }>[] =>
  derive3(st().facts, st().seed).notices.filter(
    (n): n is Extract<BuildNotice3, { kind: 'already-known' }> => n.kind === 'already-known',
  );

const CUBE = "קובייה ABCDA'B'C'D'";

describe('#853 — the four cases are ONE channel', () => {
  beforeEach(reset);

  /** One figure per case, each the figure its own issue reported. */
  const CASES: { name: string; steps: string[]; rel: string }[] = [
    { name: '#612 a shape the figure already held', steps: ['פירמידה ABCDS שבסיסה ריבוע', 'ריבוע ABCD'], rel: 'shape' },
    { name: '#396 two self-determined objects', steps: ['המישור π1: z = 0', 'המישור π2: x = 0', 'π1 ניצב ל-π2'], rel: 'objects' },
    { name: '#842 a containment both endpoints already met', steps: [CUBE, 'מישור ABCD', 'E אמצע AC', 'BE מוכל במישור ABCD'], rel: 'contained' },
    { name: '#850 a ∥ the figure implies', steps: [CUBE, "AB מקביל למישור A'B'C'D'"], rel: 'parallel' },
  ];

  for (const c of CASES) {
    it(`${c.name} → one 'already-known' notice, rel '${c.rel}'`, () => {
      build(c.steps);
      expect(st().lastError, 'true and already known is never an error').toBeNull();
      const ks = known();
      expect(ks.map((k) => k.rel), JSON.stringify(ks)).toContain(c.rel);
      // …and it is the ONLY channel: no legacy kind survives anywhere in the notice list
      const kinds = derive3(st().facts, st().seed).notices.map((n) => n.kind);
      for (const legacy of ['shape-redundant', 'redundant-relation', 'containment-redundant', 'relation-entailed']) {
        expect(kinds, `${legacy} must not come back as its own kind`).not.toContain(legacy);
      }
    });
  }

  it('every reported case carries the subject in the STUDENT’s letters, never internal state', () => {
    for (const c of CASES) {
      build(c.steps);
      for (const k of known()) {
        expect(k.subject.length, JSON.stringify(k)).toBeGreaterThan(0);
        expect(k.subject, JSON.stringify(k)).not.toMatch(/[~@]/); // no machinery ids
        if (k.rel !== 'shape') expect(k.object, JSON.stringify(k)).toBeTruthy();
      }
    }
  });

  it('the conservative direction survives: a relation that DROVE the figure still says nothing', () => {
    // #500's figure — a free plane is absolute but NOT self-determined; the relation is what orients
    // it, so calling the given redundant would assert the opposite of the truth.
    build(['π1', 'π2', 'π1 ניצב ל-π2']);
    expect(st().lastError).toBeNull();
    expect(known().filter((k) => k.rel === 'objects')).toEqual([]);
  });

  it('THE RATCHET: every rel in the list has both halves of the message, in both languages', () => {
    // A fifth case is one entry in ALREADY_KNOWN_RELS plus its wording. This is what makes that
    // cheap AND correct: add the entry without the strings and the suite fails here, instead of the
    // student meeting a raw i18n key on the canvas.
    for (const [lang, dict] of [['he', he], ['en', en]] as const) {
      const notice = (dict as { notice: Record<string, Record<string, string>> & { alreadyKnown?: string } }).notice;
      expect(notice.alreadyKnown, `${lang}: the one template must exist`).toBeTruthy();
      expect(notice.alreadyKnown).toContain('{{statement}}');
      expect(notice.alreadyKnown).toContain('{{why}}');
      for (const rel of ALREADY_KNOWN_RELS) {
        expect(notice.stated?.[rel], `${lang}: notice.stated.${rel} is missing`).toBeTruthy();
        expect(notice.follows?.[rel], `${lang}: notice.follows.${rel} is missing`).toBeTruthy();
      }
    }
  });

  it('the retired keys are gone from both locales — no dead strings left behind', () => {
    for (const [lang, dict] of [['he', he], ['en', en]] as const) {
      const notice = (dict as { notice: Record<string, unknown> }).notice;
      for (const dead of ['shapeRedundant', 'redundantRelation', 'containmentRedundant', 'entailedPerp', 'entailedParallel']) {
        expect(notice[dead], `${lang}: ${dead} should have been retired with its notice kind`).toBeUndefined();
      }
    }
  });
});
