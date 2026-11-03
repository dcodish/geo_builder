/**
 * #2591 (ADR-773) — a STATED position on a segment, given to a point that already exists, survives the M1 lowering.
 *
 * `reinterpretAsCollinear` used to re-home a free point at the projection of where it stood (free, sliding) and lower
 * a derived one to a bare collinear: «נקודה D» · «D מחלקת את AB ביחס 1:2» drew AD/DB ≈ 0.14, and «D אמצע AB» ·
 * «D מחלקת …» committed green with D at the midpoint. The verifier checked membership only, so both read clean.
 */
import { describe, expect, it } from 'vitest';
import { factsOf } from '../../__tests__/scenario-pipeline';
import { driveThroughGate } from '../../__tests__/submit-gate';
import { replay } from '@/store/geoStore';
import { checkGivens } from '../verify';
import type { Command, Vec } from '../types';
import i18n from '@/i18n';
import { figureExplainer } from '@/app/studentVocabulary';
import { otherUtteranceForError } from '@/app/errorSubject';
import type { Translate } from '@/i18n/humanizeError';

const he: Translate = (k, o) => i18n.getFixedT('he')(k, o) as string;
const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');
const FLOOR = plain(he('errors.floor'));

/**
 * What the STUDENT READS for a refused line — the submit pipeline's own composition (`figureExplainer` over the displayed
 * figure, the refused sentence as `said`, the fold's `[vs #i]` resolved by `otherUtteranceForError`), never `verdict.detail`.
 * The first lock asserted the detail only, and the rendered text was the floor sentence (round #2678's pre-play).
 */
const renderedRefusal = (steps: string[]): string => {
  const { refused, facts } = driveThroughGate(steps);
  expect(refused.map((r) => r.index)).toEqual([steps.length - 1]);
  const v = refused[0].verdict;
  const detail = v.kind === 'refused' ? v.detail : undefined;
  const fig = replay(facts, 0);
  return plain(figureExplainer(he, fig.construction, facts)(detail, refused[0].utterance, otherUtteranceForError(facts, detail)));
};
/** What a committed red row reads (its tooltip and the banner): the same explainer over the row's status. */
const renderedRow = (steps: string[]): string => {
  const facts = factsOf(steps);
  const fig = replay(facts, 0);
  const f = facts[facts.length - 1];
  const st = fig.status[f.id] as string;
  expect(st).not.toBe('ok');
  return plain(figureExplainer(he, fig.construction, facts)(st, f.utterance, otherUtteranceForError(facts, st)));
};

const ratioAt = (steps: string[], a: string, m: string, b: string, seed: number): { r: number; ok: boolean; clean: boolean } => {
  const fig = replay(factsOf(steps), seed);
  const P = (id: string) => fig.positions.get(id) as Vec;
  const d = (p: Vec, q: Vec) => Math.hypot(p.x - q.x, p.y - q.y);
  return { r: d(P(a), P(m)) / d(P(m), P(b)), ok: Object.values(fig.status).every((s) => s === 'ok'), clean: fig.violations.length === 0 };
};

describe('#2591 — a stated ratio on an existing point is kept', () => {
  const cases: [string, string[], [string, string, string], number][] = [
    ['the report: a free point, then the divider', ['נקודה D', 'D מחלקת את AB ביחס 1:2'], ['A', 'D', 'B'], 0.5],
    ['every point placed first', ['נקודה A', 'נקודה B', 'נקודה D', 'D מחלקת את AB ביחס 1:2'], ['A', 'D', 'B'], 0.5],
    ['the prose form', ['קטע AB', 'נקודה D', 'היחס בין AD ל-DB הוא 1:2'], ['A', 'D', 'B'], 0.5],
    ['a point already on the segment', ['משולש ABC', 'D על AB', 'D מחלקת את AB ביחס 1:2'], ['A', 'D', 'B'], 0.5],
    ['a rider on a rectangle side', ['מלבן ABCD', 'E על AB', 'E מחלקת את AB ביחס 1:3'], ['A', 'E', 'B'], 1 / 3],
    ['a derived point: the bisector foot drives the triangle', ['משולש ABC', 'AD חוצה זווית A', 'D מחלקת את BC ביחס 1:2'], ['B', 'D', 'C'], 0.5],
  ];
  for (const [name, steps, [a, m, b], want] of cases) {
    it(name, () => {
      for (const seed of [0, 1, 2, 3]) {
        const got = ratioAt(steps, a, m, b, seed);
        expect(got.ok, `seed ${seed}`).toBe(true);
        expect(got.clean, `seed ${seed}`).toBe(true);
        expect(got.r, `seed ${seed}`).toBeCloseTo(want, 3);
      }
    });
  }

  it('a midpoint stated to divide 1:2 is refused, naming the ratio as the colon form does', () => {
    const { refused } = driveThroughGate(['משולש ABC', 'D אמצע AB', 'D מחלקת את AB ביחס 1:2']);
    expect(refused.map((r) => r.index)).toEqual([2]);
    const v = refused[0].verdict;
    expect(v.kind).toBe('refused');
    expect(v.kind === 'refused' && v.detail).toMatch(/\|AD\| = 0\.5·\|DB\| cannot hold/);
    const colon = replay(factsOf(['משולש ABC', 'D אמצע AB', 'AD:DB = 1:2']), 0);
    expect(Object.values(colon.status).some((s) => /\|AD\| = 0\.5·\|DB\| cannot hold/.test(s))).toBe(true);
  });

  /**
   * Round #2678's pre-play: the line was refused, and the student read the FLOOR sentence. The reason clause
   * «|AD| = 0.5·|DB|» carries a coefficient the student never typed (they typed 1:2), so the provenance check refused to
   * show it — and took the whole message with it. ADR-778: the frame names the student's statements and drops the reason.
   */
  describe('#2591 found in round — the refusal the student READS names the statements, never the floor', () => {
    const cases: [string, string[], string, string | undefined][] = [
      ['the reported line: a midpoint stated to divide 1:2', ['משולש ABC', 'D אמצע AB', 'D מחלקת את AB ביחס 1:2'], 'D מחלקת את AB ביחס 1:2', 'D אמצע AB'],
      ['the prose spelling', ['משולש ABC', 'D אמצע AB', 'היחס בין AD ל-DB הוא 1:2'], 'היחס בין AD ל-DB הוא 1:2', 'D אמצע AB'],
      ['another ratio (3:2 → 1.5·)', ['משולש ABC', 'D אמצע AB', 'D מחלקת את AB ביחס 3:2'], 'D מחלקת את AB ביחס 3:2', 'D אמצע AB'],
      ['a repeating coefficient (1:3 → 0.333…·) on a square side', ['ריבוע ABCD', 'E אמצע AB', 'E מחלקת את AB ביחס 1:3'], 'E מחלקת את AB ביחס 1:3', 'E אמצע AB'],
    ];
    for (const [name, steps, said, other] of cases) {
      it(name, () => {
        const text = renderedRefusal(steps);
        expect(text).not.toBe(FLOOR);
        expect(text).toBe(plain(`${he('errors.restatedSize_said_vs', { said, other })} ${he('errors.retryHint')}`));
        expect(text).not.toMatch(/\d·/); // the tool's arithmetic is never shown
      });
    }
    it('the colon form’s red row reads the same frame (it carries no other side)', () => {
      const text = renderedRow(['משולש ABC', 'D אמצע AB', 'AD:DB = 1:2']);
      expect(text).not.toBe(FLOOR);
      expect(text).toBe(plain(`${he('errors.restatedSize_said', { said: 'AD:DB = 1:2' })} ${he('errors.retryHint')}`));
    });
    it('the rider-with-ratio spelling’s red row names both statements', () => {
      const text = renderedRow(['משולש ABC', 'D אמצע AB', 'D על AB כך ש-AD:DB = 1:2']);
      expect(text).toBe(plain(`${he('errors.restatedSize_said_vs', { said: 'D על AB כך ש-AD:DB = 1:2', other: 'D אמצע AB' })} ${he('errors.retryHint')}`));
    });
    it('control: a coefficient the student typed keeps its reason clause', () => {
      const text = renderedRefusal(['משולש ABC', 'AB = 5', 'AC = 5', 'AB = 2AC']);
      expect(text).toContain('הסיבה: |AB| = 2·|AC|');
    });
  });

  it('the verifier flags a rider whose t is not the t its command states (the class guard)', () => {
    const cmds: Command[] = [
      { type: 'free-point', id: 'A', x: 0, y: 0 },
      { type: 'free-point', id: 'B', x: 6, y: 0 },
      { type: 'point-on-segment', id: 'D', a: 'A', b: 'B', t: 1 / 3 },
    ];
    const at = (x: number) => new Map<string, Vec>([['A', { x: 0, y: 0 }], ['B', { x: 6, y: 0 }], ['D', { x, y: 0 }]]);
    expect(checkGivens(cmds, at(2), new Map())).toEqual([]);
    const off = checkGivens(cmds, at(3), new Map());
    expect(off).toHaveLength(1);
    expect(off[0]).toMatchObject({ relation: 'ratio', messageKey: 'figure.v.constraint' });
    expect(off[0].message).toMatch(/\|AD\| = 0\.5·\|DB\|/);
    // an extension's t is an unstated default, never checked as a ratio
    const ext: Command[] = [cmds[0], cmds[1], { type: 'point-on-segment', id: 'D', a: 'A', b: 'B', t: 1.3, extension: true }];
    expect(checkGivens(ext, at(9), new Map())).toEqual([]);
  });

  it('controls: the blank page, the colon form, and an unstated «D על AB» are unchanged', () => {
    for (const seed of [0, 1, 2, 3]) {
      expect(ratioAt(['D מחלקת את AB ביחס 1:2'], 'A', 'D', 'B', seed).r).toBeCloseTo(0.5, 3);
      expect(ratioAt(['קטע AB', 'נקודה D', 'D על AB כך ש-AD:DB = 1:2'], 'A', 'D', 'B', seed).r).toBeCloseTo(0.5, 3);
    }
    // unstated: still a free rider, so the configurations slide it
    const rs = [0, 1, 2, 3].map((seed) => ratioAt(['קטע AB', 'נקודה D', 'D על AB'], 'A', 'D', 'B', seed).r);
    expect(new Set(rs.map((r) => r.toFixed(2))).size).toBeGreaterThan(1);
    const fig = replay(factsOf(['קטע AB', 'נקודה D', 'D על AB']), 0);
    expect(fig.construction.objects.find((o) => o.id === 'D')).toMatchObject({ kind: 'on-segment', free: true });
  });
});
