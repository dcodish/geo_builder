/**
 * #1668 ([ADR-564](../../../docs/06-decisions.md#adr-564)) — ONE CLAIM, ONE VERDICT AT THE DOOR, HOWEVER IT IS
 * SPELLED.
 *
 * Measured on `main` @ c6a412aa through this very door (`runSubmit`, the model mocked — standing rule 2), on
 * «מעגל O · A על המעגל · B אמצע OA · קטע CD» (B the midpoint of a radius, so B can never be on the circle):
 *  - «AB מיתר במעגל O», «מיתר AB» — refused at the door ("|OB| = R cannot hold");
 *  - «המיתר AB מקביל ל-CD», «הקוטר AB מקביל ל-CD», «המיתר AB = 5», «AB קוטר במעגל O» — COMMITTED, every
 *    row red (over-constrained). Same on a right triangle at C: «היתר AC = 5» committed red.
 * Cause: the dry run failed all of them identically; the submit gate then asked `deferralWorthwhile` whether
 * to park the line as "waiting for givens", and that asked whether SOME new constraint in the line still
 * flexes — the ∥ / the length / the collinearity does, so the line was parked. The fold judges each failed
 * fact on its own and had already filed the chord claim as a concluded contradiction. The gate now reads
 * the fold's own per-fact verdict (`Derived.concluded`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { runSubmit } from '../submitPipeline';
import type { SubmitDeps } from '../submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import i18n from '@/i18n';

async function submit(line: string): Promise<{ accepted: boolean; notes: string[] }> {
  const notes: string[] = [];
  let cleared = 0;
  const deps: SubmitDeps = {
    t: (k: string, o?: Record<string, unknown>) => i18n.t(k, { ...o, lng: 'he' }) as string,
    locale: 'he',
    ui: { setInputNote: (m) => { if (m) notes.push(m); }, setRenameNote: () => {}, setLlmDropped: () => {}, clearText: () => { cleared++; }, setBusy: () => {} },
    view: () => {
      const st = useGeoStore.getState();
      const d = replay(st.facts, st.seed);
      return { construction: d.construction, positions: d.positions };
    },
    isBusy: () => false,
    nextPaint: async () => {},
    resolveAfterCommit: () => {},
    llmAbortRef: { current: null },
    explainError: (raw) => String(raw),
  };
  await runSubmit(line, deps);
  return { accepted: cleared === 1, notes };
}

async function setup(lines: string[]): Promise<void> {
  for (const l of lines) expect((await submit(l)).accepted, `«${l}» is accepted`).toBe(true);
}

/** The verdict on `line` after `prefix`: refused (with its note, nothing committed) or committed (every row green). */
async function verdict(prefix: string[], line: string): Promise<{ accepted: boolean; note: string; green: boolean }> {
  useGeoStore.getState().clear();
  await setup(prefix);
  const before = useGeoStore.getState().facts.length;
  const r = await submit(line);
  const st = useGeoStore.getState();
  if (!r.accepted) expect(st.facts.length, `«${line}» refused commits nothing`).toBe(before);
  const d = replay(st.facts, st.seed);
  const green = st.facts.every((f) => d.status[f.id] === 'ok');
  return { accepted: r.accepted, note: r.notes.join(' | ').replace(/[⁦-⁩]/g, ''), green };
}

const MIDPOINT_B = ['מעגל O', 'A על המעגל', 'B אמצע OA', 'קטע CD'];
const ON_CIRCLE_B = ['מעגל O', 'A על המעגל', 'B על המעגל', 'קטע CD'];
/** Every spelling of «B is on circle O» (as a chord or diameter end) the 2-D grammar reads. */
const CHORD_SPELLINGS = ['AB מיתר במעגל O', 'מיתר AB', 'המיתר AB מקביל ל-CD', 'המיתר AB = 5', 'הקוטר AB מקביל ל-CD', 'AB קוטר במעגל O'];

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ commands: [], none: true });
});

describe('#1668 — a chord / diameter claim that cannot hold is refused at the door in every spelling', () => {
  it('B the midpoint of radius OA: every spelling refused, with the SAME conflict note, nothing committed', async () => {
    const notes = new Set<string>();
    for (const line of CHORD_SPELLINGS) {
      const v = await verdict(MIDPOINT_B, line);
      expect(v.accepted, `«${line}» is refused at the door (note: ${v.note})`).toBe(false);
      expect(v.note, `«${line}» names the conflict`).toMatch(/OB.*cannot hold/);
      notes.add(v.note);
    }
    expect([...notes], 'one claim, one refusal').toHaveLength(1);
    expect(llmParseMock, 'a conflict is never escalated').not.toHaveBeenCalled();
  }, 240_000);

  it('B on the circle: the chord spellings are all accepted and green (the gate refuses only the contradiction)', async () => {
    for (const line of ['AB מיתר במעגל O', 'המיתר AB מקביל ל-CD', 'המיתר AB = 5']) {
      const v = await verdict(ON_CIRCLE_B, line);
      expect(v.accepted, `«${line}» is accepted (note: ${v.note})`).toBe(true);
      expect(v.green, `«${line}» leaves every row green`).toBe(true);
    }
  }, 240_000);
});

describe('#1668 — the hypotenuse claim gets the verdict its plain angle gets', () => {
  const RIGHT_AT_C = ['משולש ABC', 'זווית C = 90'];
  it('«היתר AC = 5» on a triangle right-angled at C is refused, exactly like «זווית ABC = 90»', async () => {
    const role = await verdict(RIGHT_AT_C, 'היתר AC = 5');
    const plain = await verdict(RIGHT_AT_C, 'זווית ABC = 90');
    expect(plain.accepted, `the plain angle is refused (note: ${plain.note})`).toBe(false);
    expect(role.accepted, `the role noun is refused (note: ${role.note})`).toBe(false);
    expect(role.note).toBe(plain.note);
  }, 240_000);

  it('«היתר AB = 5» on the same triangle (the hypotenuse IS AB) is accepted and green', async () => {
    const v = await verdict(RIGHT_AT_C, 'היתר AB = 5');
    expect(v.accepted, v.note).toBe(true);
    expect(v.green).toBe(true);
  }, 240_000);
});
