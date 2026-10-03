/**
 * THE EXAM'S CONSTRUCTION IMPERATIVES ARE TAUGHT — #1620, ADR-AG-206 (operator ruling 2026-10-01).
 *
 * «העבירו משיק למעגל בנקודה C», «מן הנקודה B הורידו אנך לציר ה-x», «בחרו נקודה E כרצונכם, …» are the
 * bagrut's own wording, and the ruling is ADR-W-030's: the plain declarative sentence is PRE-FILLED for the
 * student to confirm, never obeyed as typed. Every case goes through {@link decideSubmit} — the function
 * `App.tsx` calls — and the corpus lines are read from the corpus file, never re-typed.
 *
 * Two kinds of case:
 *
 *  - **taught now** — the declarative sentence parses on this branch: the exact contract string is taught,
 *    the next Enter accepts it, and confirming it lowers exactly as typing it does.
 *  - **after integration** — the sentence it lowers onto is another stream's (S2 perpendiculars and
 *    through-lines, S3 diagonals, S4 altitudes). Until it parses the honest outcome stands: nothing is
 *    committed, and nothing ELSE is taught. The moment it parses, the same row demands the contract string.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { confirmTaught, decideSubmit } from '../app/submit';
import { parseLine } from '../parser/parseAnalytic';
import { constructionCandidates, imperativeCandidates } from '../parser/scopeAnalytic';
import { derive } from '../engine/derive';

const CORPUS: { id: string; lines: string[] }[] = JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'corpus471.json'), 'utf8'));

/** A corpus line and the lines the student has typed before it — the exam's own sentences. */
const at = (id: string, index: number) => {
  const q = CORPUS.find((c) => c.id === id);
  if (!q) throw new Error(`no corpus question ${id}`);
  return { typed: q.lines[index], before: confirmTaught(q.lines.slice(0, index), 0) };
};

/** The contract with S2–S4: the exam line (by corpus id), and the ONE sentence it teaches. */
const CONTRACT: ReadonlyArray<readonly [id: string, index: number, taught: string, owner: 'S1' | 'S2' | 'S3' | 'S4']> = [
  ['5/5', 3, 'המשיק למעגל בנקודה C', 'S1'],
  ['21/5', 3, 'המשיק למעגל בנקודה D', 'S1'],
  ['11/5', 3, 'המיתר AD', 'S1'],
  ['2/4', 5, 'הנקודה E נמצאת על הצלע DC', 'S1'],
  ['8/5', 3, 'האלכסון AC במרובע ABCD', 'S3'],
  ['5/5', 4, 'האנך מהנקודה B לציר ה-x', 'S2'],
  ['17/4', 3, 'האנך מהקודקוד C לציר ה-x חותך אותו בנקודה D', 'S2'],
  ['20/4', 2, 'האנכים מהקודקודים A ו-C לציר ה-x חותכים אותו בנקודות E ו-F בהתאמה', 'S2'],
  ['13/4', 8, 'הישר העובר דרך הנקודה E מקביל לציר ה-y וחותך את הצלע AB בנקודה F', 'S2'],
  ['14/4', 6, 'הישר העובר דרך הנקודה D מקביל לציר ה-x וחותך את הצלע AB בנקודה E', 'S2'],
  ['2/4', 1, 'הקטע EF מקביל ל-DA', 'S2'],
  ['7/4', 0, 'במשולש OBC, OD ו-BE הם גבהים לצלעות BC ו-OC בהתאמה', 'S4'],
];

describe('#1620 — the exam construction imperatives are taught (ADR-AG-206)', () => {
  /**
   * The register's half of the contract, as pure strings: whatever the parser makes of it, the FIRST
   * reading the register offers for each exam line is the textbook sentence the other streams build.
   */
  it.each(CONTRACT)('%s #%i — the register reads «…» as «%s»', (id, index, taught) => {
    expect(constructionCandidates(at(id, index).typed)[0]?.remainder).toBe(taught);
  });

  /** The S1 rows parse today: each is taught EXACTLY, and the very next Enter is accepted. */
  it.each(CONTRACT.filter((c) => c[3] === 'S1'))('%s #%i is taught as «%s», and confirming it is accepted', (id, index, taught) => {
    const { typed, before } = at(id, index);
    const v = decideSubmit(typed, before, 0);
    expect(v).toEqual({ kind: 'teach', verb: expect.any(String), canonical: taught });
    if (v.kind !== 'teach') return;
    expect(typed.includes(v.verb), "the verb quoted back is the student's own word").toBe(true);
    expect(['record', 'already-known', 'already-follows']).toContain(decideSubmit(v.canonical, before, 0).kind);
  });

  /**
   * THE ADR-W-030 PROPERTY: the taught sentence re-parses to the same lowering. What is recorded is
   * the canonical string itself — not the imperative, not a rewrite of it — so the figure the student
   * confirms is the figure that sentence draws, fact for fact.
   */
  it.each(CONTRACT.filter((c) => c[3] === 'S1'))('%s #%i — confirming «%s» lowers exactly as typing it', (id, index, taught) => {
    const { typed, before } = at(id, index);
    const parsed = parseLine(taught);
    expect(parsed.ok).toBe(true);
    const confirmed = confirmTaught([...before, typed], 0);
    expect(confirmed.at(-1)).toBe(taught);
    expect(derive(confirmed, 0).construction).toEqual(derive([...before, taught], 0).construction);
  });

  /**
   * NO GIVEN IS DROPPED by the rewrite. «דרך הנקודה D שעל המעגל העבירו משיק למעגל» loses the words
   * «שעל המעגל» because «המשיק למעגל בנקודה D» says it: a tangent AT D touches the circle at D. Measured
   * on the figure, not assumed: D lies on the circle and the tangent is perpendicular to MD there.
   */
  it('21/5 — «שעל המעגל» is implied by the taught tangent, not dropped: D is on the circle', () => {
    const q = CORPUS.find((c) => c.id === '21/5')!;
    const d = derive(confirmTaught(q.lines, 0), 0);
    expect(d.faults).toEqual([]);
    const pt = (id: string) => d.figure.points.find((p) => p.id === id)!;
    const [M, D, O] = [pt('M'), pt('D'), pt('O')];
    // the circle is tangent to the x-axis with its centre on the y-axis, so it touches the axis at O
    const radius = Math.hypot(O.x - M.x, O.y - M.y);
    expect(Math.hypot(D.x - M.x, D.y - M.y)).toBeCloseTo(radius, 6);
    // the stated tangent 4x + 3y = 40 passes through D, perpendicular to MD
    expect(4 * D.x + 3 * D.y).toBeCloseTo(40, 5);
    expect(4 * (D.y - M.y) - 3 * (D.x - M.x)).toBeCloseTo(0, 5);
  });

  /**
   * The lines whose sentence another stream owns. Today: no silent build, and no OTHER lesson. After
   * integration the same assertion demands the contract string — so this row upgrades itself.
   */
  it.each(CONTRACT.filter((c) => c[3] !== 'S1'))('%s #%i — never committed, and if taught then as «%s» (%s)', (id, index, taught) => {
    const { typed, before } = at(id, index);
    const v = decideSubmit(typed, before, 0);
    expect(['refused', 'teach']).toContain(v.kind);
    if (v.kind === 'teach') expect(v.canonical).toBe(taught);
  });

  /**
   * The corpus questions the lesson completes: typed line by line as printed, every lesson confirmed,
   * every line lands. (The 471 ratchet counts the same way, through the same `confirmTaught`.)
   */
  it.each(['11/5', '21/5'])('corpus %s lands whole once its imperative is confirmed', (id) => {
    const q = CORPUS.find((c) => c.id === id)!;
    expect(derive(q.lines, 0).faults.length, 'as printed, the imperative line faults').toBeGreaterThan(0);
    expect(derive(confirmTaught(q.lines, 0), 0).faults).toEqual([]);
  });

  /** «כרצונכם» carries no geometry: the point stays free, and the sentence is the textbook one. */
  it('«בחרו נקודה E כרצונכם, הנמצאת על הצלע DC» on its own (no earlier E) teaches the incidence', () => {
    const v = decideSubmit('בחרו נקודה E כרצונכם, הנמצאת על הצלע DC', ['מלבן ABCD'], 0);
    expect(v).toEqual({ kind: 'teach', verb: 'בחרו', canonical: 'הנקודה E נמצאת על הצלע DC' });
    expect(decideSubmit('הנקודה E נמצאת על הצלע DC', ['מלבן ABCD'], 0).kind).toBe('record');
  });

  it('the singular and present-tense forms take the same frames', () => {
    expect(constructionCandidates('העבר משיק למעגל בנקודה C')[0]?.remainder).toBe('המשיק למעגל בנקודה C');
    expect(constructionCandidates('מעבירים מיתר AD')[0]?.remainder).toBe('המיתר AD');
    expect(constructionCandidates('מן הנקודה B מורידים אנך לציר ה-x')[0]?.remainder).toBe('האנך מהנקודה B לציר ה-x');
  });

  describe('controls — what the register must NOT touch', () => {
    /**
     * «שהורידו» is a relative clause DESCRIBING a drawn object, not an instruction: S2 owns reading it,
     * and the register must neither teach it nor refuse it on its own account.
     */
    it('a descriptive «שהורידו / שהעבירו» line is not an imperative', () => {
      for (const line of ['הנקודה E נמצאת על האנך שהורידו מנקודה B לציר ה-x', 'הנקודה F נמצאת על הישר שהעבירו דרך E']) {
        expect(imperativeCandidates(line), line).toEqual([]);
        expect(decideSubmit(line, [], 0).kind, line).not.toBe('teach');
      }
      const { typed, before } = at('5/5', 6);
      expect(decideSubmit(typed, before, 0).kind).not.toBe('teach');
    });

    it('a verb in the middle of a line is read only after one of the three adverbials', () => {
      expect(constructionCandidates('הנקודה B העבירו משיק למעגל')).toEqual([]);
      expect(constructionCandidates('משולש ABC העבירו גובה')).toEqual([]);
    });

    it('a proof target is still refused as one, never taught', () => {
      for (const line of ['הוכיחו כי AB מקביל ל-CD', 'הראו כי המשיק עובר דרך A', 'הוכיחו כי המשיק למעגל בנקודה C מקביל לציר ה-x']) {
        expect(constructionCandidates(line), line).toEqual([]);
        const v = decideSubmit(line, ['A(0,0)', 'B(2,0)', 'C(2,2)', 'D(0,2)'], 0);
        expect(v.kind, line).toBe('refused');
        if (v.kind === 'refused') expect(v.error.key, line).toBe('proof-target');
      }
    });

    it('and none of the exam imperatives is mistaken for a proof target', () => {
      for (const [id, index] of CONTRACT) {
        const r = parseLine(at(id, index).typed);
        if (!r.ok) expect(r.code, `${id} #${index}`).not.toBe('proof-target');
      }
    });
  });
});
