/**
 * #1990 (ADR-W-152) → #2790 ([ADR-AG-462](../../docs/06c-decisions-analytic.md#adr-ag-462),
 * [ADR-AG-463](../../docs/06c-decisions-analytic.md#adr-ag-463), ADR-W-200 / ADR-W-204) — analytic's held row.
 *
 * A line the figure already holds — a restatement (was `already-known`), a given the figure already settles (was
 * `already-follows`), a held value or its operand ink (recorded silently), a drawn line restated under a new name (was
 * T32's refusal) — is RECORDED as its own row with the one suite notice (`suite.notice.alreadyHeld`), moves no point,
 * and keeps its relation once the earlier row is muted or deleted. The table is shared with every builder:
 * `shell/__tests__/fixtures/held-row-2790.ts`.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyticI18n } from '../i18n';
import { decideSubmit, isHeld, noticeText, type NoticeT } from '../app/submit';
import { derive } from '../engine/derive';
import { HELD_CASES_ANALYTIC, HELD_CONTROLS_ANALYTIC, HELD_NOTICE } from '../../shell/__tests__/fixtures/held-row-2790';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const plain = (s: string | null) => (s ?? '').replace(/[⁦-⁩]/g, '');
const tOf = (lng: 'he' | 'en'): NoticeT => analyticI18n.getFixedT(lng) as unknown as NoticeT;
const SEEDS = [0, 1, 2, 3];

/** The drawing before and after the line, as the App draws them: the trial starts from the configuration on the screen. */
function maxMove(lines: readonly string[], more: readonly string[], seed: number): number {
  const cur = derive(lines, seed);
  const a = cur.figure.points;
  const b = derive(more, cur.configuration, cur.construction.seedNames ?? {}, cur.pins).figure.points;
  let m = 0;
  for (const p of a) {
    const q = b.find((r) => r.id === p.id);
    if (q) m = Math.max(m, Math.hypot(p.x - q.x, p.y - q.y));
  }
  return m;
}

describe('#2790 — analytic accepts a held line as its own row, with the notice', () => {
  for (const c of HELD_CASES_ANALYTIC) {
    it(`${c.lines.join(' · ')} — ${c.why}`, () => {
      const prior = c.lines.slice(0, -1);
      const last = c.lines[c.lines.length - 1];
      const v = decideSubmit(last, prior, 0);
      // (i) a row: the line records; (ii) with the one notice, in both languages
      expect(v.kind, last).toBe('record');
      expect(isHeld(v), last).toBe(true);
      if (v.kind !== 'record') return;
      for (const lng of ['he', 'en'] as const) expect(plain(noticeText(v.notice, tOf(lng))), lng).toBe(HELD_NOTICE[lng]);
      // (iii) nothing moves, at 4 seeds, and nothing faults
      for (const s of SEEDS) {
        expect(maxMove(prior, c.lines, s), `seed ${s}`).toBeLessThan(1e-6);
        expect(derive(c.lines, s).faults, `seed ${s}`).toEqual([]);
      }
      // (iv) the earlier row muted or deleted (analytic folds the ACTIVE lines: both read the same list): the restated row
      // stands alone and holds
      if (c.earlier === undefined) return;
      const alone = c.lines.filter((_, i) => i !== c.earlier);
      for (const s of SEEDS) {
        const d = derive(alone, s);
        expect(d.faults, `seed ${s}`).toEqual([]);
        expect(d.figure.unsatisfied, `seed ${s}`).toEqual([]);
        expect(d.outcomes[alone.length - 1], `seed ${s}: the row now carries the relation`).not.toBe('known');
      }
    });
  }

  it('the T32 line names the drawn line: one perpendicular bisector, called l2', () => {
    const d = derive(['E(0,0)', 'K(4,2)', 'האנך האמצעי לקטע EK', 'l2 אנך אמצעי ל-EK'], 0);
    const lines = d.construction.objects.filter((o) => o.kind === 'line-at');
    expect(lines.map((o) => (o as { name?: string }).name)).toEqual(['l2']);
  });
});

describe('#2790 — controls: what is false is refused, what adds information records with no notice', () => {
  it.each(HELD_CONTROLS_ANALYTIC.refused.map((l) => [l]))('%j is refused', (lines) => {
    expect(decideSubmit(lines[lines.length - 1], lines.slice(0, -1), 0).kind).toBe('refused');
  });
  it.each(HELD_CONTROLS_ANALYTIC.silent.map((l) => [l]))('%j records with no notice', (lines) => {
    const v = decideSubmit(lines[lines.length - 1], lines.slice(0, -1), 0);
    expect(v.kind).toBe('record');
    expect(isHeld(v)).toBe(false);
  });
});

describe('#2790 — the App words a held row with the suite key, through the record commit', () => {
  it('no no-row branch is left, and the retired note is not read', () => {
    expect(app).not.toContain("case 'already-known':");
    expect(app).not.toContain("'suite.notice.alreadyDrawn'");
    expect(app).toContain('commitRecord(verdict, recordLine, t)');
  });
  it('the key reads the ruled sentence in both languages', () => {
    for (const lng of ['he', 'en'] as const) expect(plain(analyticI18n.getFixedT(lng)(HELD_NOTICE.key) as string)).toBe(HELD_NOTICE[lng]);
  });
});
