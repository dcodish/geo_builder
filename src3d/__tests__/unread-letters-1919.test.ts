/**
 * #1919 ([ADR-3D-328](../../docs/06b-decisions-3d.md#adr-3d-328), ADR-626) — 3-D's thin lock on the
 * shared unreadable-letter rows (`shell/__tests__/fixtures/unread-letter-rows.ts`, docs/28 §5c).
 *
 * Measured at `ad8df1d3` through `decideSubmit3`: «משולש ДЖФ» RECORDED `polygon3 ["A","B","C"]` and
 * «ריבוע ДЖФИ» recorded `square ["A","B","C","D"]` — a letter outside the label alphabet is invisible to
 * `declLeftover`, so the shape read as UNLABELLED and the noun's default names were recorded. Greek was
 * invisible the same way: «משולש ΓΔΘ» and «משולש αβγ» recorded A, B, C, where 2-D escalates all three.
 * Now the unreadable letters are refused by name and Greek goes to the model, which is 2-D's verdict.
 */
import { describe, expect, it } from 'vitest';
import i18n3d from '../i18n';
import { errorText3 } from '../i18n/errorText3';
import { decideSubmit3, type Fact3 } from '../store/store3';
import { parse3 } from '../parser/parse3';
import { COMMAND_CATALOG_3D } from '../parser/catalog3';
import { unreadScriptRuns } from '../../shell/inputScript';
import { unreadLetterFaults, type UnreadGate } from '../../shell/__tests__/fixtures/unread-letter-rows';

const t = i18n3d.getFixedT('he') as (k: string, o?: Record<string, unknown>) => string;
const tEn = i18n3d.getFixedT('en') as (k: string, o?: Record<string, unknown>) => string;
const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');
const empty: { facts: Fact3[]; seed: number } = { facts: [], seed: 0 };

/** The REAL submit decision — the function `store3.submit` dispatches — on an empty figure. */
const gate: UnreadGate = (line) => {
  const v = decideSubmit3(empty, line);
  const code = v.kind === 'refused' ? v.error.code : null;
  const unread = code === 'unread-name' ? 'name' : code === 'unread-word' ? 'word' : null;
  return { unread, recorded: v.kind === 'record', text: v.kind === 'refused' ? plain(errorText3(t, v.error) ?? '') : null };
};

describe('#1919 — 3-D refuses a letter it cannot read, naming it', () => {
  it('the shared rows hold through decideSubmit3', async () => {
    expect(await unreadLetterFaults(gate)).toEqual([]);
  });

  it('the reported line: refused, nothing recorded, the model never asked', () => {
    const v = decideSubmit3(empty, 'משולש ДЖФ');
    expect(v).toEqual({ kind: 'refused', error: { code: 'unread-name', detail: 'ДЖФ' } });
    if (v.kind !== 'refused') return;
    expect(plain(errorText3(t, v.error)!)).toBe(
      '«ДЖФ» אינו שם של נקודה. שם נקודה הוא אות לטינית גדולה, אפשר עם ספרה — למשל G או A1.',
    );
    expect(plain(errorText3(tEn, v.error)!)).toContain('is not a point name');
  });

  it('a word in another language gets the other ruled sentence', () => {
    const v = decideSubmit3(empty, 'треугольник ABC');
    expect(v).toEqual({ kind: 'refused', error: { code: 'unread-word', detail: 'треугольник' } });
    if (v.kind !== 'refused') return;
    expect(plain(errorText3(t, v.error)!)).toBe(
      'הכלי קורא עברית ואנגלית בלבד — «треугольник» אינו באחת מהן. נסו לכתוב את השורה בעברית או באנגלית.',
    );
  });

  it('the look-alikes fold and build, as the ruling says — K, M, O', () => {
    const v = decideSubmit3(empty, 'משולש КМО');
    expect(v.kind).toBe('record');
    if (v.kind !== 'record') return;
    expect(v.facts.flatMap((f) => f.cmds)).toEqual([{ type: 'solid', kind: 'polygon3', ids: ['K', 'M', 'O'] }]);
  });

  it('a GREEK vertex name declines and goes to the model, as in 2-D — never A, B, C', () => {
    for (const line of ['משולש ΓΔΘ', 'משולש ΑΒΓ', 'משולש αβγ']) {
      expect(parse3(line).ok, line).toBe(false);
      expect(decideSubmit3(empty, line).kind, line).toBe('not-understood');
    }
  });

  it('Greek as NOTATION is unchanged — the declaration gate reads the sentences it always read', () => {
    expect(decideSubmit3(empty, 'משולש ABC').kind).toBe('record');
    expect(decideSubmit3(empty, 'פירמידה ABCD').kind).toBe('record');
    expect(decideSubmit3(empty, "קובייה ABCDA'B'C'D'").kind).toBe('record');
  });

  it('no sentence of the 3-D catalog carries a letter the tool cannot read', () => {
    const hits = COMMAND_CATALOG_3D.flatMap((e) => [e.he, e.en]).filter((s) => s && unreadScriptRuns(s).length > 0);
    expect(hits).toEqual([]);
  });
});
