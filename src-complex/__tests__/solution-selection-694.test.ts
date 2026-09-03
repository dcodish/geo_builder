/**
 * #694 — SELECT among an enumerated solution set ([ADR-CX-037](../../docs/06d-decisions-complex.md#adr-cx-037)).
 *
 * Four of the eight sampled exams enumerate roots and then pick one by a condition (docs/27 §2,
 * archetype 2) — «z₀ הוא הפתרון של המשוואה הנמצא ברביע הרביעי», and every later part is about that one
 * root. That sentence had no grammar at all: it measured as `line-unaccounted: «הפתרון»`.
 *
 * It is neither a branch prune nor a constraint on a member. An enumeration is ONE configuration
 * containing n points (ADR-CX-021), so there are no n branches left for a filter to thin; and
 * «z₁ ברביע הראשון» constrains the wrong thing — z₁ is a determined point, and the exam is not claiming
 * anything about it. What the exam does is bind a NEW name to the member that satisfies the condition.
 *
 * **The operator's 2026-08-26 ruling: NEW-NAME selection only.** The bare letter stays reserved for the
 * set (ADR-CX-024 untouched), because the exams always introduce a new name — so the named form covers
 * the corpus and the bare form buys a sentence nobody writes. That boundary is locked here so a later
 * widening cannot quietly reverse it.
 */
import { describe, expect, it } from 'vitest';
import { deriveLines } from '../app/deriveLines';
import { v2Labels } from '../replay/scene2';
import { complexI18n } from '../i18n';
import { stripFormatControls } from '../../shell/bidi';

const fold = (lines: string[]) => deriveLines(lines, 0, 0);
/** The `why` codes of anything the grammar could not read. */
const untranslated = (lines: string[]) => fold(lines).untranslated.map((u) => u.why.code);

const SIX = 'z^6 = 1'; // roots at 0°, 60°, 120°, 180°, 240°, 300°

describe('#694 — the exam’s selection sentence', () => {

  it('binds the new name to the fourth-quadrant root; the other five stay drawn and unnamed', () => {
    const labels = v2Labels(fold([SIX, 'z0 הוא הפתרון ברביע הרביעי']));
    // z₆ sits at 300°, the only root in (270°, 360°)
    expect(labels).toContain('z0 (z₆) = 1·cis300°');
    for (const other of ['z₁ = 1·cis0°', 'z₂ = 1·cis60°', 'z₃ = 1·cis120°', 'z₄ = 1·cis180°', 'z₅ = 1·cis240°']) {
      expect(labels, 'the other five keep their own names').toContain(other);
    }
    expect(untranslated([SIX, 'z0 הוא הפתרון ברביע הרביעי'])).toEqual([]);
  });

  it('the English mirror reads the same', () => {
    expect(v2Labels(fold([SIX, 'z0 is the solution in the fourth quadrant']))).toContain('z0 (z₆) = 1·cis300°');
  });

  it.each([
    ['first', 1, 'z₂ = 1·cis60°'],
    ['third', 3, 'z₄ = 1·cis180°'],
  ])('the %s quadrant selects its own member', (_ord, _q, expected) => {
    // sanity that the filter is read, not hard-coded to the fourth
    const labels = v2Labels(fold([SIX, `z0 הוא הפתרון ברביע ה${_ord === 'first' ? 'ראשון' : 'שלישי'}`]));
    expect(labels.some((l) => l.startsWith('z0 ('))).toBe(true);
    expect(labels.join(' ')).toContain(expected.split(' = ')[1]);
  });

  describe('the BARE letter is untouched — ADR-CX-024 stands', () => {
    it('«z ברביע הרביעי» still refuses `reserved-letter`', () => {
      expect(untranslated([SIX, 'z ברביע הרביעי'])).toEqual(['reserved-letter']);
    });

    it('and the set keeps its own six names — nothing was bound', () => {
      const labels = v2Labels(fold([SIX, 'z ברביע הרביעי']));
      expect(labels.some((l) => l.startsWith('z0'))).toBe(false);
      expect(labels).toContain('z₆ = 1·cis300°');
    });
  });

  describe('zero and many are REFUSALS, not choices — and both name the statement', () => {
    it('NO member satisfies the filter → refuse, never bind the nearest', () => {
      const src = 'z0 הוא הפתרון ברביע השני';
      const d = fold(['z^2 = 1', src]); // roots at 0° and 180° — neither is in (90°, 180°)
      expect(d.unsatisfied, 'the refusal quotes the student’s own sentence').toContain(src);
      expect(v2Labels(d).some((l) => l.startsWith('z0'))).toBe(false);
    });

    it('TWO OR MORE satisfy → refuse, never pick one (ADR-052)', () => {
      const src = 'z0 הוא הפתרון ברביע הראשון';
      const d = fold(['z^12 = 1', src]); // 30° and 60° are both in the first quadrant
      expect(d.unsatisfied).toContain(src);
      expect(v2Labels(d).some((l) => l.startsWith('z0'))).toBe(false);
    });

    it('NO enumeration in scope → refuse; the sentence may not invent a set to point at', () => {
      const src = 'z0 הוא הפתרון ברביע הרביעי';
      const d = fold(['z1 = 3+4i', src]);
      expect(d.unsatisfied).toContain(src);
      expect(v2Labels(d).some((l) => l.startsWith('z0'))).toBe(false);
    });
  });

  describe('the neighbouring sentences still read as they did', () => {
    it('«z1 ברביע הראשון» is still a FILTER on a determined member (and still unsatisfied here)', () => {
      const d = fold([SIX, 'z1 ברביע הראשון']); // z₁ is at 0°, in no quadrant
      expect(untranslated([SIX, 'z1 ברביע הראשון'])).toEqual([]);
      expect(d.unsatisfied.length, 'correctly refuses — z₁ is at 0°').toBeGreaterThan(0);
    });

    it('a plain quadrant given on a FREE number is unaffected', () => {
      expect(untranslated(['z1 ברביע הראשון'])).toEqual([]);
    });
  });
});

/**
 * #887 — the three refusals say WHY, and say three different things.
 *
 * Operator, playing T15: *"error message now is המשפט לא נוסף — הוא לא יכול להתקיים … and should be
 * more specific. tell user why it is refused and not some generic message."* — and the rule went into
 * [docs/10-pedagogy.md §5 guideline 8](../../docs/10-pedagogy.md): a refusal teaches the REASON, never
 * just the verdict, and zero / many / not-supported are three different sentences.
 *
 * ADR-CX-037 already said a ≥2 result should read "as information, not as a malfunction". It did not:
 * all three cases were pushed onto the shared `unsatisfied` channel and rendered with one generic tail.
 * They still go through `unsatisfied` — that is what the acceptance gate reads, and the line must not
 * commit — but each now carries its own reason.
 */
describe('#887 — each refusal says why', () => {
  const reasonFor = (lines: string[], src: string) => fold(lines).refusalReasons.get(src);

  it('MANY: names the quadrant AND the candidates, so the student can pick or answer «both»', () => {
    const src = 'z0 הוא הפתרון ברביע הראשון';
    const why = reasonFor(['z^12 = 1', src], src);
    expect(why?.reason).toBe('selectionMany');
    expect(why?.params?.quadrant).toBe('1');
    // 30° and 60° are the two first-quadrant roots of z^12 = 1
    expect(why?.params?.names).toContain('z');
    expect(why!.params!.names!.split(',').length).toBeGreaterThanOrEqual(2);
  });

  it('NONE: names the quadrant that is empty', () => {
    const src = 'z0 הוא הפתרון ברביע השני';
    const why = reasonFor(['z^2 = 1', src], src);
    expect(why?.reason).toBe('selectionNone');
    expect(why?.params?.quadrant).toBe('2');
  });

  it('NO SET: says the equation is missing, not that the statement is false', () => {
    const src = 'z0 הוא הפתרון ברביע הרביעי';
    expect(reasonFor(['z1 = 3+4i', src], src)?.reason).toBe('selectionNoSet');
  });

  it('the three are DIFFERENT sentences — a shared string is exactly the defect', () => {
    const many = reasonFor(['z^12 = 1', 'z0 הוא הפתרון ברביע הראשון'], 'z0 הוא הפתרון ברביע הראשון')!;
    const none = reasonFor(['z^2 = 1', 'z0 הוא הפתרון ברביע השני'], 'z0 הוא הפתרון ברביע השני')!;
    const noSet = reasonFor(['z1 = 3+4i', 'z0 הוא הפתרון ברביע הרביעי'], 'z0 הוא הפתרון ברביע הרביעי')!;
    expect(new Set([many.reason, none.reason, noSet.reason]).size).toBe(3);
  });

  it('every reason key resolves to real Hebrew — never the key echoed back', () => {
    const tHe = complexI18n.getFixedT('he');
    for (const key of ['selectionMany', 'selectionNone', 'selectionNoSet']) {
      const out = stripFormatControls(tHe(key, { quadrant: '1', names: 'z₂, z₃' }) as string);
      expect(out, key).not.toBe(key);
      expect(out, key).toMatch(/[֐-׿]/);
    }
  });

  it('a SUCCESSFUL selection records no refusal reason', () => {
    expect(fold([SIX, 'z0 הוא הפתרון ברביע הרביעי']).refusalReasons.size).toBe(0);
  });
});
