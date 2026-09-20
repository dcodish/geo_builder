/**
 * #1204 — THE SEMICIRCLE READS A CENTRE-FIRST 3-RUN, LIKE THE REST OF ITS FAMILY.
 *
 * Measured while fixing #1012 in round #1200, which named this as the third member of the family and
 * left it for its own look. On «ABC משולש ישר זוית» · «AC=15» · «BC=10» · «O על AC» · «D על CB»:
 *
 * ```
 * רבע מעגל ODC   ->  centre O, ends D and C, span 90    ✓
 * גזרה ODC       ->  centre O, ends D and C, span free   ✓
 * חצי מעגל ODC   ->  not-handled                         ✗
 * חצי עיגול ODC  ->  not-handled                         ✗
 * ```
 *
 * Both siblings read a 3-run as *centre, then the two ends*; the semicircle read no 3-run at all, so a
 * natural spelling fell to the LLM lane or to «לא הבנתי» while the family was two-thirds consistent.
 *
 * ## The convention is forced, not chosen — which is why this needed no ruling
 *
 * For a semicircle, centre-first plus two ends ON the circle plus a span of 180° says `O` is the midpoint
 * of `DC`. That is what the sentence means, and it is exactly what the 2-run spelling already builds.
 * It lowers to CONSTRAINTS — both ends on a free-radius circle centred at `O` (so |OD| = |OC|), and
 * `set-collinear(D, O, C)` — so a figure that cannot honour it is refused honestly rather than drawn
 * wrong. The geometry is asserted below on the FIGURE, never on the command list.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { useGeoStore, replay } from '@/store/geoStore';
import { runSubmit, type SubmitDeps } from '@/app/submitPipeline';

function harness() {
  const notes: string[] = [];
  const deps: SubmitDeps = {
    t: (key, opts) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    locale: 'he',
    ui: {
      setInputNote: (m) => notes.push(m),
      setRenameNote: () => {},
      setLlmDropped: () => {},
      clearText: () => {},
      setBusy: () => {},
    },
    view: () => {
      const st = useGeoStore.getState();
      const d = replay(st.facts, st.seed);
      return { construction: d.construction, positions: d.positions };
    },
    isBusy: () => false,
    nextPaint: async () => {},
    resolveAfterCommit: () => {},
    llmAbortRef: { current: null },
    explainError: (raw) => raw ?? '',
  };
  return { deps, notes: () => notes.filter(Boolean) };
}

const ctxOf = () => {
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  return buildParseCtx(d.construction, d.positions);
};

/** Parse only — for the rows that are about the GRAMMAR reading a run. */
const cmdsFor = (utterance: string) => {
  const r = parse(utterance, ctxOf());
  return r.ok ? r.commands : null;
};

const figure = () => {
  const st = useGeoStore.getState();
  const d = replay(st.facts, st.seed);
  const at = (id: string) =>
    d.positions instanceof Map ? d.positions.get(id) : (d.positions as Record<string, { x: number; y: number }>)[id];
  return { at, lastError: d.lastError };
};

beforeEach(() => {
  useGeoStore.getState().clear();
});

describe('#1204 — the 3-run parses, and the family agrees', () => {
  it.each(['חצי מעגל ODC', 'חצי עיגול ODC'])('«%s» is read', (utterance) => {
    expect(cmdsFor(utterance)).not.toBeNull();
  });

  /**
   * The shape of the reading, asserted against its SIBLING rather than spelled out: the family must lower
   * a 3-run the same way, and only the span may differ. A written-out command list would let the members
   * drift apart while both tests stayed green.
   */
  it('the semicircle lowers a 3-run like the quarter does — same skeleton, different span', () => {
    // The shared skeleton: a hidden circle at the named centre, both ends on it, and an arc. What differs
    // is the SPAN and how each construct pins it (90° angle vs. through-centre collinearity), so those are
    // excluded rather than asserted equal.
    const skeleton = (u: string) => cmdsFor(u)!.map((c) => c.type).filter((t) => t === 'circle' || t === 'point-on-circle' || t === 'arc');
    expect(skeleton('חצי מעגל ODC')).toEqual(skeleton('רבע מעגל ODC'));
  });

  it('and it is the CENTRE that comes first — the arc is centred on O', () => {
    const arc = cmdsFor('חצי מעגל ODC')!.find((c) => c.type === 'arc') as { center: string; spanDeg: number };
    expect(arc.center).toBe('O');
    expect(arc.spanDeg).toBe(180);
  });

  /**
   * The spellings that already worked are byte-identical — this WIDENS the rule, it does not move it.
   * Written out rather than snapshotted so a reader can see what is being preserved, and MEASURED on the
   * pre-change tree in this same empty-figure context: with D and C absent the rule takes its general
   * branch (a free-radius circle driven by the constraints) rather than the closed form it uses when both
   * ends already exist. Both branches are untouched here; only the run READING changed.
   */
  it.each([
    ['חצי מעגל DC', 'circle+point-on-circle+point-on-circle+arc+segment'],
    ['חצי מעגל שמרכזו O', 'circle+point-on-circle+point-on-circle+arc+segment'],
    ['חצי מעגל שקוטרו DC', 'circle+point-on-circle+point-on-circle+arc+segment'],
  ])('«%s» is unchanged', (utterance, expected) => {
    expect(cmdsFor(utterance)!.map((c) => c.type).join('+')).toBe(expected);
  });
});

/**
 * THE GEOMETRY, READ OFF THE BUILT FIGURE. A semicircle whose centre is named is one whose centre is the
 * MIDPOINT of the stated ends — that is the whole claim, and asserting the command list would not prove it.
 */
describe('#1204 — a named centre really is the midpoint', () => {
  it('«חצי מעגל ODC» puts O at the midpoint of DC, with equal radii', async () => {
    const h = harness();
    await runSubmit('חצי מעגל ODC', h.deps);
    const { at, lastError } = figure();
    expect(lastError).toBeNull();
    const [O, D, C] = ['O', 'D', 'C'].map((id) => at(id)!);
    expect([O, D, C].every(Boolean)).toBe(true);
    const mid = { x: (D.x + C.x) / 2, y: (D.y + C.y) / 2 };
    expect(Math.hypot(O.x - mid.x, O.y - mid.y)).toBeLessThan(1e-6);
    const rOD = Math.hypot(O.x - D.x, O.y - D.y);
    const rOC = Math.hypot(O.x - C.x, O.y - C.y);
    expect(Math.abs(rOD - rOC)).toBeLessThan(1e-6 * Math.max(1, rOD));
  });

  /**
   * THE CONTRAST THAT KEEPS THE ROW HONEST. The quarter has equal radii too, so "equal radii" alone would
   * pass for both — what distinguishes a semicircle is that its centre lies BETWEEN its ends. Measured: on
   * the same bare figure the quarter's centre is 3.54 from the midpoint of its ends.
   */
  it('…while the QUARTER, on the same figure, does not — the span is what differs', async () => {
    const h = harness();
    await runSubmit('רבע מעגל ODC', h.deps);
    const { at } = figure();
    const [O, D, C] = ['O', 'D', 'C'].map((id) => at(id)!);
    const mid = { x: (D.x + C.x) / 2, y: (D.y + C.y) / 2 };
    expect(Math.hypot(O.x - mid.x, O.y - mid.y)).toBeGreaterThan(1e-3);
  });

  it('it builds over points that already exist, too', async () => {
    const h = harness();
    for (const u of ['נקודה D', 'נקודה C', 'חצי מעגל ODC']) await runSubmit(u, h.deps);
    const { at, lastError } = figure();
    expect(lastError).toBeNull();
    const [O, D, C] = ['O', 'D', 'C'].map((id) => at(id)!);
    const mid = { x: (D.x + C.x) / 2, y: (D.y + C.y) / 2 };
    expect(Math.hypot(O.x - mid.x, O.y - mid.y)).toBeLessThan(1e-6);
  });
});

/**
 * #1012'S RE-READ IS INHERITED, AND IT IS DRIVEN RATHER THAN ASSUMED.
 *
 * ADR-521's mechanism keys off the `arc` a construct emits, so it should reach the semicircle the moment
 * the semicircle produces a parse to re-read — which is precisely what it could not do before. The issue
 * asks for this to be proven by driving it, so the family stays ONE mechanism rather than three
 * conventions that happen to agree.
 */
describe('#1204 — the 3-run inherits the role re-reading (#1012 / ADR-521)', () => {
  it('a run whose stated order cannot build is re-read, and the reading that builds is adopted', async () => {
    const h = harness();
    // O is pinned as the midpoint of DC, so ONLY the reading with O as the centre can hold.
    for (const u of ['נקודה D', 'נקודה C', 'O אמצע DC']) await runSubmit(u, h.deps);
    await runSubmit('חצי מעגל DCO', h.deps);
    const { at, lastError } = figure();
    expect(lastError, 'the figure was not left broken').toBeNull();
    const [O, D, C] = ['O', 'D', 'C'].map((id) => at(id)!);
    const mid = { x: (D.x + C.x) / 2, y: (D.y + C.y) / 2 };
    expect(Math.hypot(O.x - mid.x, O.y - mid.y)).toBeLessThan(1e-6);
  });
});
