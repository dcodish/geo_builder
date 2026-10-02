/**
 * #1661 ([ADR-563](../../../docs/06-decisions.md#adr-563)) — A ROLE NOUN IS A CLAIM: STATED, OR THE SENTENCE IS
 * REFUSED. Never a bare segment with the claim dropped, and never a claim the words did not make.
 *
 * Measured on `main` @ e92b671f through this very door (`runSubmit`, the model mocked — standing rule 2):
 *  - «המיתר BC מקביל ל-AD» / «הקוטר BC מקביל ל-AD» / «המיתר BC = 5» on a figure with NO circle committed a
 *    bare segment + the relation — the chord / diameter claim dropped (the reported case);
 *  - the same beside TWO circles: dropped silently, while «BC מיתר» asks which circle;
 *  - with ONE circle the chord post-pass recovered the claim by WORD PRESENCE, so it also INVENTED one —
 *    «המיתר BC מקביל ל-AD» put A and D on the circle (AD is no chord);
 *  - «המיתר OB …» (O the centre) and «הרדיוס BC …» (neither end the centre) dropped the claim silently;
 *  - «היתר AB = 5», «השוק AB = 3», «הבסיס AB = 5», «השוק BC מקביל ל-AD» built the plain segment and dropped
 *    the polygon role.
 * The claim now comes from ONE registry (`src/parser/roleNouns.ts`) and ONE lowering (`withRoleClaims`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const llmParseMock = vi.fn();
vi.mock('@/parser/llm', () => ({ llmParse: (...a: unknown[]) => llmParseMock(...a) }));

import { runSubmit } from '../submitPipeline';
import type { SubmitDeps } from '../submitPipeline';
import { replay, useGeoStore } from '@/store/geoStore';
import type { AnyCommand, Vec } from '@/engine';
import { buildParseCtx, parse } from '@/parser';
import { roleOperands } from '@/parser/roleNouns';
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

/** Every line accepted; the figure and the commands the LAST line committed. */
async function build(lines: string[]) {
  for (const l of lines) {
    const r = await submit(l);
    expect(r.accepted, `«${l}» is accepted (notes: ${r.notes.join(' | ')})`).toBe(true);
  }
  const st = useGeoStore.getState();
  const last = st.facts.filter((f) => f.group === st.facts[st.facts.length - 1].group).map((f) => f.cmd);
  return { d: replay(st.facts, st.seed), last, all: st.facts.map((f) => f.cmd) };
}

/** Every line but the last accepted; the last REFUSED and committing nothing. */
async function refusedLast(lines: string[]): Promise<string> {
  for (const l of lines.slice(0, -1)) expect((await submit(l)).accepted, `«${l}» is accepted`).toBe(true);
  const before = useGeoStore.getState().facts.length;
  const r = await submit(lines[lines.length - 1]);
  expect(r.accepted, `«${lines[lines.length - 1]}» is refused`).toBe(false);
  expect(useGeoStore.getState().facts.length, 'nothing committed').toBe(before);
  return r.notes.join(' | ').replace(/[⁦-⁩]/g, '');
}

const at = (d: { positions: Map<string, Vec> }, id: string): Vec => {
  const p = d.positions.get(id);
  expect(p, `${id} is placed`).toBeDefined();
  return p!;
};
const dist = (p: Vec, q: Vec) => Math.hypot(p.x - q.x, p.y - q.y);
const cross = (p: Vec, q: Vec, r: Vec) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
const sin = (p: Vec, q: Vec, r: Vec, s: Vec) =>
  ((q.x - p.x) * (s.y - r.y) - (q.y - p.y) * (s.x - r.x)) / (dist(p, q) * dist(r, s));
const cos = (p: Vec, q: Vec, r: Vec, s: Vec) =>
  ((q.x - p.x) * (s.x - r.x) + (q.y - p.y) * (s.y - r.y)) / (dist(p, q) * dist(r, s));
const onCircle = (cmds: AnyCommand[], id: string) => cmds.some((c) => c.type === 'point-on-circle' && c.id === id);
/** The one circle's centre position (named O, or the hidden auto centre). */
const centre = (d: { positions: Map<string, Vec> }) => d.positions.get('O') ?? d.positions.get('@ctr-O')!;

beforeEach(() => {
  useGeoStore.getState().clear();
  llmParseMock.mockReset();
  llmParseMock.mockResolvedValue({ built: [], dropped: [] });
});

const CIRCLE_AD = ['מעגל O', 'קטע AD'];

describe('#1661 — the chord / diameter claim on a circle that is drawn', () => {
  for (const [line, rel, diameter] of [
    ['המיתר BC מקביל ל-AD', 'par', false],
    ['הקוטר BC מקביל ל-AD', 'par', true],
    ['המיתר BC מאונך ל-AD', 'perp', false],
    ['הקוטר BC מאונך ל-AD', 'perp', true],
    ['מיתר BC מקביל ל-AD', 'par', false],
    ['AD מקביל למיתר BC', 'par', false],
    ['AD מקביל לקוטר BC', 'par', true],
    ['the chord BC is parallel to AD', 'par', false],
    ['the diameter BC is perpendicular to AD', 'perp', true],
  ] as const) {
    it(`«${line}»: B and C on the circle${diameter ? ', BC through the centre' : ''}, the relation holds, A and D stay off it`, async () => {
      const { d, all } = await build([...CIRCLE_AD, line]);
      expect(d.violations).toEqual([]);
      const o = centre(d), b = at(d, 'B'), c = at(d, 'C'), a = at(d, 'A'), dd = at(d, 'D');
      expect(dist(o, b)).toBeCloseTo(dist(o, c), 6);
      if (diameter) expect(Math.abs(cross(b, c, o)) / dist(b, c), 'O on BC').toBeLessThan(1e-6);
      if (rel === 'par') expect(Math.abs(sin(b, c, a, dd)), 'BC ∥ AD').toBeLessThan(1e-6);
      else expect(Math.abs(cos(b, c, a, dd)), 'BC ⟂ AD').toBeLessThan(1e-6);
      // The over-claim the word-presence pass made: AD is a plain segment, never put on the circle.
      expect(onCircle(all, 'A') || onCircle(all, 'D'), 'A and D are not claimed onto the circle').toBe(false);
    });
  }

  it('the claim the relation states is exactly the chord sentence\'s («BC מיתר במעגל O»)', async () => {
    const { d } = await build(CIRCLE_AD);
    const ctx = buildParseCtx(d.construction, d.positions);
    const sentence = parse('BC מיתר במעגל O', ctx);
    const relation = parse('המיתר BC מקביל ל-AD', ctx);
    expect(sentence.ok && relation.ok).toBe(true);
    const claims = (r: typeof sentence) => (r.ok ? r.commands.filter((c) => c.type === 'point-on-circle') : []);
    expect(claims(sentence)).toHaveLength(2);
    expect(claims(relation)).toEqual(claims(sentence));
  });

  it('«המיתר BC = 5» and «הקוטר BC = 6»: the length on a chord / a diameter (r = 3)', async () => {
    const { d } = await build([...CIRCLE_AD, 'המיתר BC = 5']);
    expect(dist(at(d, 'B'), at(d, 'C'))).toBeCloseTo(5, 6);
    expect(dist(centre(d), at(d, 'B'))).toBeCloseTo(dist(centre(d), at(d, 'C')), 6);
    useGeoStore.getState().clear();
    const e = (await build([...CIRCLE_AD, 'הקוטר BC = 6'])).d;
    expect(dist(centre(e), at(e, 'B'))).toBeCloseTo(3, 6);
    expect(dist(centre(e), at(e, 'C'))).toBeCloseTo(3, 6);
  });

  it('«E על המיתר BC» and «המיתר BC חותך את AD בנקודה E» keep the chord claim', async () => {
    const { d } = await build([...CIRCLE_AD, 'E על המיתר BC']);
    expect(dist(centre(d), at(d, 'B'))).toBeCloseTo(dist(centre(d), at(d, 'C')), 6);
    useGeoStore.getState().clear();
    const e = (await build([...CIRCLE_AD, 'המיתר BC חותך את AD בנקודה E'])).d;
    expect(dist(centre(e), at(e, 'B'))).toBeCloseTo(dist(centre(e), at(e, 'C')), 6);
    expect(Math.abs(cross(at(e, 'B'), at(e, 'C'), at(e, 'E')))).toBeLessThan(1e-6);
  });

  it('«מיתר BC = מיתר AD» claims both pairs (both nouns are typed)', async () => {
    const { all } = await build(['מעגל O', 'קטע AD', 'קטע BC', 'מיתר BC = מיתר AD']);
    for (const p of ['A', 'B', 'C', 'D']) expect(onCircle(all, p), p).toBe(true);
  });

  it('a radius from the centre puts its other end on the circle', async () => {
    const { all } = await build(['מעגל O', 'קטע AD', 'קטע BC', 'AD מאונך לרדיוס OB']);
    expect(onCircle(all, 'B')).toBe(true);
  });
});

describe('#1661 — with no circle drawn, a chord / diameter introduces it (as «מיתר BC» and «BC קוטר» do)', () => {
  it('«המיתר BC מקביל ל-AD» — the reported case: one circle, B and C on it', async () => {
    const { d, last } = await build(['המיתר BC מקביל ל-AD']);
    expect(d.violations).toEqual([]);
    expect(last.filter((c) => c.type === 'circle')).toHaveLength(1);
    expect(dist(centre(d), at(d, 'B'))).toBeCloseTo(dist(centre(d), at(d, 'C')), 6);
    expect(Math.abs(sin(at(d, 'B'), at(d, 'C'), at(d, 'A'), at(d, 'D')))).toBeLessThan(1e-6);
  });

  it('«הקוטר BC מקביל ל-AD» — the centre is on BC', async () => {
    const { d } = await build(['הקוטר BC מקביל ל-AD']);
    const o = centre(d), b = at(d, 'B'), c = at(d, 'C');
    expect(dist(o, b)).toBeCloseTo(dist(o, c), 6);
    expect(Math.abs(cross(b, c, o)) / dist(b, c)).toBeLessThan(1e-6);
  });

  it('«המיתר BC = 5» — on the introduced circle', async () => {
    const { d } = await build(['המיתר BC = 5']);
    expect(dist(at(d, 'B'), at(d, 'C'))).toBeCloseTo(5, 6);
    expect(dist(centre(d), at(d, 'B'))).toBeCloseTo(dist(centre(d), at(d, 'C')), 6);
  });
});

describe('#1661 — refusals name the statement and commit nothing', () => {
  it('beside two circles the chord asks which circle (as «BC מיתר» does)', async () => {
    const note = await refusedLast(['מעגל O', 'מעגל P', 'קטע AD', 'המיתר BC מקביל ל-AD']);
    expect(note).toContain('O, P');
  });

  it('a chord through the centre «המיתר OB …» is refused', async () => {
    const note = await refusedLast([...CIRCLE_AD, 'המיתר OB מקביל ל-AD']);
    expect(note).toContain('המיתר OB');
    expect(note).toContain('מרכז המעגל');
  });

  it('a radius neither of whose ends is the centre «הרדיוס BC …» is refused', async () => {
    const note = await refusedLast([...CIRCLE_AD, 'הרדיוס BC מאונך ל-AD']);
    expect(note).toContain('הרדיוס BC');
  });

  it('a radius with no circle «הרדיוס OB …» is refused and teaches «מעגל O»', async () => {
    const note = await refusedLast(['הרדיוס OB מאונך ל-AD']);
    expect(note).toContain('מעגל O');
  });

  it('…and the taught remedy builds: «מעגל O» then the same radius line', async () => {
    const { all } = await build(['מעגל O', 'הרדיוס OB מאונך ל-AD']);
    expect(onCircle(all, 'B')).toBe(true);
  });

  it('a chord claim on a point that cannot be on the circle is a conflict, never a silent segment', async () => {
    // #1668 (ADR-564): refused at the door, exactly as «AB מיתר במעגל O» is — this lock used to accept
    // either outcome (the line committed with its rows red); the spellings now share one verdict
    // (src/app/__tests__/issue-1668-claim-gate-parity.test.ts).
    const note = await refusedLast(['מעגל O', 'A על המעגל', 'B אמצע OA', 'קטע CD', 'המיתר AB מקביל ל-CD']);
    expect(note).toMatch(/OB.*cannot hold/);
  });

  it('«המשיק BC מקביל ל-AD» is never committed as a bare segment', async () => {
    const { length } = useGeoStore.getState().facts;
    for (const l of CIRCLE_AD) await submit(l);
    const before = useGeoStore.getState().facts.length;
    expect(before).toBeGreaterThan(length);
    const r = await submit('המשיק BC מקביל ל-AD');
    expect(r.accepted).toBe(false);
    expect(useGeoStore.getState().facts.length).toBe(before);
  });
});

describe('#1661 — the polygon roles lower to their canonical sentences', () => {
  it('«היתר AB = 5» on a triangle: the angle at C is right', async () => {
    const { d } = await build(['משולש ABC', 'היתר AB = 5']);
    expect(Math.abs(cos(at(d, 'C'), at(d, 'A'), at(d, 'C'), at(d, 'B')))).toBeLessThan(1e-6);
    expect(dist(at(d, 'A'), at(d, 'B'))).toBeCloseTo(5, 6);
  });

  it('«היתר AC = 5» on «משולש ישר זווית ABC» re-seats the right angle at B', async () => {
    const { d } = await build(['משולש ישר זווית ABC', 'היתר AC = 5']);
    expect(d.violations).toEqual([]);
    expect(Math.abs(cos(at(d, 'B'), at(d, 'A'), at(d, 'B'), at(d, 'C')))).toBeLessThan(1e-6);
  });

  it('«הבסיס AB = 5» on «משולש שווה שוקיים ABC» makes C the apex (CA = CB)', async () => {
    const { d } = await build(['משולש שווה שוקיים ABC', 'הבסיס AB = 5']);
    expect(d.violations).toEqual([]);
    expect(dist(at(d, 'C'), at(d, 'A'))).toBeCloseTo(dist(at(d, 'C'), at(d, 'B')), 6);
  });

  it('«השוק AB = 3» on «טרפז ABCD» makes BC ∥ DA the bases', async () => {
    const { d } = await build(['טרפז ABCD', 'השוק AB = 3']);
    expect(d.violations).toEqual([]);
    expect(Math.abs(sin(at(d, 'B'), at(d, 'C'), at(d, 'D'), at(d, 'A')))).toBeLessThan(1e-6);
    expect(dist(at(d, 'A'), at(d, 'B'))).toBeCloseTo(3, 6);
  });

  it('«הבסיס AB = 5» on «טרפז ABCD» states AB ∥ CD', async () => {
    const { last } = await build(['טרפז ABCD', 'הבסיס AB = 5']);
    expect(last).toContainEqual({ type: 'set-parallel', a: 'A', b: 'B', c: 'C', d: 'D' });
  });

  it('«השוק BC מקביל ל-AD» on a trapezoid shows the contradiction (both pairs parallel)', async () => {
    const { d } = await build(['טרפז ABCD', 'השוק BC מקביל ל-AD']);
    expect(d.violations.length).toBeGreaterThan(0);
  });

  it('«הבסיס BC = 5» on a plain triangle names a side and claims nothing more', async () => {
    const { last } = await build(['משולש ABC', 'הבסיס BC = 5']);
    expect(last.map((c) => c.type).sort()).toEqual(['segment', 'set-distance']);
  });

  it('«השוק AB = 5» on a triangle is refused: which end is the apex is not said', async () => {
    const note = await refusedLast(['משולש ABC', 'השוק AB = 5']);
    expect(note).toContain('AB = AC');
  });

  it('…and the taught equality builds', async () => {
    const { d } = await build(['משולש ABC', 'AB = AC']);
    expect(dist(at(d, 'A'), at(d, 'B'))).toBeCloseTo(dist(at(d, 'A'), at(d, 'C')), 6);
  });

  it('«היתר AB = 5» with no triangle is refused', async () => {
    const note = await refusedLast(['היתר AB = 5']);
    expect(note).toContain('היתר AB');
  });
});

describe('#1661 — the registry reads which pair a noun is attached to', () => {
  it('«מיתר» is never «יתר» with a clitic', () => {
    expect(roleOperands('המיתר AB מקביל ל-CD').map((o) => o.role)).toEqual(['chord']);
    expect(roleOperands('מיתר AB').map((o) => o.role)).toEqual(['chord']);
    expect(roleOperands('היתר AB = 5').map((o) => o.role)).toEqual(['hypotenuse']);
  });

  it('only the pair the noun is attached to', () => {
    expect(roleOperands('המיתר BC מקביל ל-AD').map((o) => o.a + o.b)).toEqual(['BC']);
    expect(roleOperands('AD מקביל למיתר BC').map((o) => o.a + o.b)).toEqual(['BC']);
    expect(roleOperands('המשולש ABC שבו AB = 5')).toEqual([]);
  });

  it('a plural list and the predicate order', () => {
    expect(roleOperands('המיתרים AB ו-CD נפגשים בנקודה E').map((o) => o.a + o.b)).toEqual(['AB', 'CD']);
    expect(roleOperands('AB ו-CD מיתרים מקבילים').map((o) => o.a + o.b).sort()).toEqual(['AB', 'CD']);
    expect(roleOperands('AB is a chord').map((o) => o.a + o.b)).toEqual(['AB']);
  });

  it('a noun with no adjacent pair binds nothing; an English word after a noun is never a pair', () => {
    expect(roleOperands('קוטר המעגל היוצא מנקודה F')).toEqual([]);
    expect(roleOperands('מעגל בקוטר 10')).toEqual([]);
    expect(roleOperands('the base is BC')).toEqual([]);
    expect(roleOperands('משולש שווה שוקיים ABC')).toEqual([]);
  });
});
