/**
 * #1990 (ADR-W-152) → #2790 ([ADR-CX-089](../../docs/06d-decisions-complex.md#adr-cx-089), ADR-W-200 / ADR-W-204) —
 * complex's held row. A statement the exact solve already entails (#2268's `known`) is RECORDED as its own row with the
 * one suite notice (`suite.notice.alreadyHeld`), moves no point, and keeps its relation once the earlier row is muted or
 * deleted. Everything runs through the real `submitLine` + `deriveLines`. The table is shared with every builder:
 * `shell/__tests__/fixtures/held-row-2790.ts`.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { complexI18n } from '../i18n';
import { deriveLines, lineEntailed } from '../app/deriveLines';
import { activeLines, decideSubmitCx, submitLine } from '../app/submit';
import { useComplexStore } from '../store/useComplexStore';
import { HELD_CASES_COMPLEX, HELD_CONTROLS_COMPLEX, HELD_NOTICE } from '../../shell/__tests__/fixtures/held-row-2790';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const store = () => useComplexStore.getState();
beforeEach(() => store().resetSession());
const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');
const SEEDS = [0, 1, 2, 3];

const drawn = (seed: number) =>
  new Map(deriveLines(activeLines(), 0, seed).points.map((p) => [p.name, p.z] as const));

describe('#2790 — complex accepts a held line as its own row, with the notice', () => {
  for (const c of HELD_CASES_COMPLEX) {
    it(`${c.lines.join(' · ')} — ${c.why}`, () => {
      const prior = c.lines.slice(0, -1);
      const last = c.lines[c.lines.length - 1];
      for (const l of prior) expect(submitLine(l), l).toBe(true);
      const before = SEEDS.map(drawn);
      // (i) one row appended; (ii) the notice rides the commit
      expect(submitLine(last), last).toBe(true);
      expect(store().lines).toEqual(c.lines);
      expect(store().lastError).toBeNull();
      expect(store().lastNote).toEqual({ key: 'already-held', detail: last });
      // (iii) nothing moves, at 4 seeds
      SEEDS.forEach((s, i) => expect(drawn(s), `seed ${s}`).toEqual(before[i]));
      // (iv) the earlier row muted, then deleted: the restated row holds its relation alone
      if (c.earlier === undefined) return;
      store().setDisabledIdx([c.earlier]);
      const muted = activeLines();
      expect(muted).toHaveLength(c.lines.length - 1);
      const alone = c.lines.filter((_, i) => i !== c.earlier);
      for (const lines of [muted, alone]) {
        const d = deriveLines(lines, 0, 0);
        expect(d.contradiction).toBeNull();
        expect(d.hasConfiguration).toBe(true);
        expect(d.untranslated).toEqual([]);
        expect(lineEntailed(lines, last), 'the row carries the relation').toBe(true);
      }
    });
  }

  it('a load replays every row as saved and tells nothing', () => {
    const v = decideSubmitCx({ lines: ['z1 = 3+4i'], disabled: [], seed: 0 }, 'z1 = 3+4i', true);
    expect(v).toEqual({ kind: 'record', line: 'z1 = 3+4i', seed: 0 });
  });
});

describe('#2790 — controls', () => {
  it.each(HELD_CONTROLS_COMPLEX.refused.map((l) => [l]))('%j is refused', (lines) => {
    const v = decideSubmitCx({ lines: lines.slice(0, -1), disabled: [], seed: 0 }, lines[lines.length - 1]);
    expect(v.kind).toBe('refuse');
  });
  it.each(HELD_CONTROLS_COMPLEX.silent.map((l) => [l]))('%j records with no notice', (lines) => {
    for (const l of lines) expect(submitLine(l), l).toBe(true);
    expect(store().lines).toEqual(lines);
    expect(store().lastNote).toBeNull();
  });
});

describe('#2790 — the App words the note with the suite key', () => {
  it('reads alreadyHeld, not the retired alreadyDrawn', () => {
    expect(app).toContain(`t('${HELD_NOTICE.key}')`);
    expect(app).not.toContain("'suite.notice.alreadyDrawn'");
  });
  it('the key reads the ruled sentence in both languages', () => {
    for (const lng of ['he', 'en'] as const) expect(plain(complexI18n.getFixedT(lng)(HELD_NOTICE.key) as string)).toBe(HELD_NOTICE[lng]);
  });
});
