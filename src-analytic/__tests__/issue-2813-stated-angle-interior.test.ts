/**
 * #2813 ([ADR-AG-471](../../docs/06c-decisions-analytic.md#adr-ag-471), 2-D's ADR-823) — A STATED POLYGON ANGLE IS THE
 * INTERIOR ANGLE (operator ruling 2026-11-10 (b)), so «מרובע ABCD · ∠DAB = 70° · ∠BCD = 110°» is convex, and a second
 * order of its letters crosses: «מרובע ABDC» is refused on the line that completes it, naming the angle lines, with the
 * operator's next step of 2026-11-12 («שנו את אחת הזוויות או את סדר האותיות»).
 *
 * Measured on `main` @ caf619a5 through `decideSubmit`: every line recorded (A1, A2), ABDC drawn crossed.
 *
 * pipeline-lock: the verdict is a refused line with a named ring, the angle lines and the blamed line in both orders,
 * plus a view-floor assertion over seeds — bespoke assertions a saved fixture cannot make, and analytic has no scenario
 * corpus.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { errorText } from '../app/errorText';
import { derive } from '../engine/derive';
import { drawableAt } from '../engine/evaluate';
import { analyticI18n } from '../i18n';
import type { InputError } from '../store/useAnalyticStore';

const he = analyticI18n.getFixedT('he') as unknown as Parameters<typeof errorText>[1];
const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');

/** Submit every line but the last through the real gate; return the gate's verdict on the last. */
function last(lines: readonly string[], seed = 0) {
  const recorded: string[] = [];
  for (const line of lines.slice(0, -1)) {
    const v = decideSubmit(line, recorded, seed);
    expect(v.kind, `context line «${line}»`).toBe('record');
    recorded.push(line);
  }
  return decideSubmit(lines[lines.length - 1], recorded, seed);
}

describe('#2813 — a ring its stated interior angles prove convex, and another order of its letters', () => {
  it('A1 (the issue): «מרובע ABDC» after the angles is refused, naming both angle lines', () => {
    const v = last(['מרובע ABCD', '∠DAB = 70°', '∠BCD = 110°', 'מרובע ABDC']);
    expect(v.kind).toBe('refused');
    if (v.kind !== 'refused') return;
    expect(v.error).toMatchObject({ key: 'ring-contradicts-angles', detail: 'מרובע ABDC', polygon: 'ABCD', pair: 'ABDC' });
    expect(plain(errorText(v.error as InputError, he))).toBe(
      'לא ניתן להוסיף את «מרובע ABDC»: לפי «∠DAB = 70°», «∠BCD = 110°» הצורה ABCD קמורה, ולנקודות במצב קמור יש רק סדר אחד שבו הצלעות לא נחתכות — לכן ABDC מתקפלת על עצמה. שנו את אחת הזוויות או את סדר האותיות.',
    );
  });

  it('A2: with the angle last, «∠BCD = 110°» is the line refused', () => {
    const v = last(['מרובע ABCD', 'מרובע ABDC', '∠DAB = 70°', '∠BCD = 110°']);
    expect(v.kind).toBe('refused');
    if (v.kind === 'refused') expect(v.error).toMatchObject({ key: 'ring-contradicts-angles', detail: '∠BCD = 110°' });
  });

  it('no proof, no structural refusal: 170° leaves room for a dent at B or D, and two orders alone record', () => {
    expect(derive(['מרובע ABCD', '∠DAB = 70°', '∠BCD = 100°', 'מרובע ABDC'], 0).faults.some((f) => f.code === 'ring-contradicts-angles')).toBe(false);
    expect(last(['מרובע ABCD', 'מרובע ABDC']).kind).toBe('record');
  });

  it('the view floor: the angle-only quadrilateral draws its stated corners convex at seeds 0–5', () => {
    for (let seed = 0; seed < 6; seed++) {
      const d = derive(['מרובע ABCD', '∠DAB = 70°', '∠BCD = 110°'], seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      const fig = drawableAt(d.construction, seed);
      expect(fig.ringFaults, `seed ${seed}`).toEqual([]);
    }
  });
});
