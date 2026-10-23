/**
 * #2201 phase 3b ([ADR-W-130](../../../docs/06w-decisions-workspace.md#adr-w-130) Am. 1) — the provenance check, one
 * rule at a time, in both directions: what the tool made reads the floor (or, for a true unknown-point sentence, the
 * missing point names), and what the student typed or can see renders exactly as without the check.
 */
import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { humanizeErrorOutcome, type Translate } from '@/i18n/humanizeError';
import { internalTextViolations, labelsIn, numbersIn, type StudentVocabulary } from '../../../shell/studentText';

const he: Translate = (k, o) => i18n.getFixedT('he')(k, o) as string;
const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');
const V = (typed: string, names: string[], shownIds: string[] = names, hiddenIds: string[] = []): StudentVocabulary => ({ typed, names, shownIds, hiddenIds });
const run = (raw: string, said: string | undefined, vocab: StudentVocabulary) => humanizeErrorOutcome(raw, he, said, undefined, undefined, vocab);
const same = (raw: string, said: string | undefined, vocab: StudentVocabulary) => expect(plain(run(raw, said, vocab).text)).toBe(plain(humanizeErrorOutcome(raw, he, said).text));

describe('(a) an id must be a name the student can see, or a label they typed', () => {
  const fig = V('מעגל שמרכזו O\nהנקודה P בתוך המעגל', ['O', 'P'], ['O', 'P', 'circle-O'], ['tanaux-OP']);
  it('a hidden scaffold circle, or a minted point nobody typed → the floor', () => {
    expect(run('cannot construct T: circles circle-O and tanaux-OP do not meet', 'x', fig).floor).toBe(true);
    expect(run('cannot construct T: circles circle-O and circle-P do not meet', 'x', V('מעגל O\nמעגל P', ['O', 'P'], ['O', 'P', 'circle-O', 'circle-P'])).floor).toBe(true);
  });
  it('the student’s own point and drawn circles → unchanged (the mirror)', () => {
    const two = V('מעגל O\nמעגל P\nA חיתוך המעגלים', ['O', 'P'], ['O', 'P', 'circle-O', 'circle-P']);
    same('cannot construct A: circles circle-O and circle-P do not meet', 'A חיתוך המעגלים', two);
    same('cannot construct A: circles circle-P and circle-O do not meet', 'A חיתוך המעגלים', two);
  });
  it('a mint suffix is no name («O-2», #2461) → the floor; the same id with no vocabulary is phase 3a’s text', () => {
    const pair = V('שני מעגלים בעלי מרכז משותף O', ['O'], ['O', 'circle-O', 'circle-O-2']);
    expect(run('unresolved dependencies for: circle-O-2', 'x', pair).floor).toBe(true);
    expect(humanizeErrorOutcome('unresolved dependencies for: circle-O-2', he).floor).toBe(false);
  });
});

describe('(b) a repeated-vertex angle shows only if the student wrote it', () => {
  const fig = V('משולש ABC', ['A', 'B', 'C']);
  it('the tool’s angle → the floor', () => expect(run('an angle needs three distinct points — "∠AAB" repeats its vertex', 'קשת AB = 40', fig).floor).toBe(true));
  it('the student’s own typo → unchanged', () => same('an angle needs three distinct points — "∠ABB" repeats its vertex', 'זווית ABB = 40', fig));
});

describe('(c) a fragment’s coefficients and labels are the student’s', () => {
  it('an untyped coefficient on the unknown-point frame → (c′) the missing points, in order', () => {
    expect(plain(run('|AD| = 0.5·|DB| references an unknown point', 'AD:DB = 1:2', V('', [])).text)).toContain('(A, D, B)');
    expect(plain(run('|DB| = 2·|AD| references an unknown point', 'DB:AD = 2:1', V('', [])).text)).toContain('(|DB| = 2·|AD|)');
    expect(plain(run('|OR| = 1·R references an unknown point', 'OR=r', V('מעגל O ברדיוס r', ['O'])).text)).toContain('(R)');
  });
  it('a typed coefficient → unchanged («AB = 2 AD»)', () => same('|AB| = 2·|AD| references an unknown point', 'AB = 2 AD', V('', [])));
  it('an untyped coefficient on any other frame → the floor; a typed one → unchanged', () => {
    const fig = V('מעגל O', ['O', 'B', 'C'], ['O', 'B', 'C']);
    expect(run('over-constrained: |OB| = 1.0583005244258363·|OC| cannot hold', 'OB = OC', fig).floor).toBe(true);
    same('over-constrained: ∠DOE = 2·∠COE cannot hold', '∠DOE = 2∠COE', V('', ['D', 'O', 'E', 'C']));
  });
  it('with no sentence known, (b) and (c) do not judge', () => same('over-constrained: ∠DOE = 2·∠COE cannot hold', undefined, V('', [])));
});

describe('the shared predicate (shell/studentText)', () => {
  it('labels and numbers a text spells', () => {
    expect(labelsIn('OR=r')).toEqual(['O', 'R']);
    expect(labelsIn('S_{ABC}/S_{DEF}')).toEqual(['S', 'A', 'B', 'C', 'S', 'D', 'E', 'F']);
    expect(numbersIn('AD:DB = 1:2, 0.75')).toEqual(['1', '2', '0.75']);
  });
  it('catches each leak kind, and passes the student’s own words', () => {
    const v = V('מעגל O ברדיוס r', ['O']);
    expect(internalTextViolations('הנתון «OR=r» מתייחס לנקודה (|OR| = 1·R).', v, 'OR=r').some((x) => x.includes('coefficient'))).toBe(true);
    expect(internalTextViolations('ב-«∠AAB» הקודקוד חוזר', V('', ['A', 'B']), 'קשת AB = 40').some((x) => x.includes('repeated-vertex'))).toBe(true);
    expect(internalTextViolations('לא ניתן לבנות את T', v).some((x) => x.includes('«T»'))).toBe(true);
    expect(internalTextViolations('הנתון «OR=r» מתייחס לנקודה (R).', v, 'OR=r')).toEqual([]);
    expect(internalTextViolations('the line cannot be built', v, undefined, undefined, { englishProse: true })).toEqual([]);
  });
});
