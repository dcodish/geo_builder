/**
 * #1401 (ADR-W-088) — THE FACT-ROW DIRECTION SUITE BITES. A meta-lock on the checks the four per-tree
 * locks run (the docs/28 §5c pattern): a green suite proves nothing until it is shown to go red.
 *
 * It calls `factRowDirFaults` — the same function the per-tree suites call — against broken stubs of
 * BOTH halves: a wrong `textDir` (the product's side) and a `FactList` that drops the direction (the
 * chrome's side, i.e. the pre-#1401 chrome, where a row's `dir` was whatever the caller remembered).
 *
 * Stubs only: no product imports (ADR-W-016 rule 2).
 */
import { describe, it, expect } from 'vitest';
import { makeBidi } from '../bidi';
import type { FactListProps } from '../frame/FactList';
import { LTR_ROWS, RTL_ROWS, factRowDirFaults } from './fixtures/fact-row-dir-rows';

const kit = makeBidi();

describe('#1401 — the fact-row direction checks catch each way a row loses its direction', () => {
  it('the shared kit passes (the suite is satisfiable)', () => {
    expect(factRowDirFaults(kit.textDir, { product: 'kit' })).toEqual([]);
  });

  it('an inherited RTL on every row (analytic before #1401) is caught on every LTR row', () => {
    const faults = factRowDirFaults(() => 'rtl', { product: 'stub' });
    expect(faults.filter((f) => /want ltr/.test(f))).toHaveLength(LTR_ROWS.length);
  });

  it('a forced LTR on every row (complex before #1401) is caught on every Hebrew row', () => {
    const faults = factRowDirFaults(() => 'ltr', { product: 'stub' });
    expect(faults.filter((f) => /want rtl/.test(f))).toHaveLength(RTL_ROWS.length);
  });

  it('a FIRST-STRONG rule (what dir="auto" does) is caught on the Latin-first Hebrew rows', () => {
    const firstStrong = (s: string): 'rtl' | 'ltr' => {
      const m = /[A-Za-z\u05D0-\u05EA]/.exec(s);
      return m && /[\u05D0-\u05EA]/.test(m[0]) ? 'rtl' : 'ltr';
    };
    const faults = factRowDirFaults(firstStrong, { product: 'stub' });
    expect(faults.join('\n')).toMatch(/K על AB/);
    expect(faults.join('\n')).toMatch(/E אמצע AB/);
  });

  it('a chrome that renders rows with no direction scope is caught', () => {
    const NoDir = ({ rows }: FactListProps) => (
      <ul>
        {rows.map((r) => (
          <li key={r.id}>
            <div>{r.content}</div>
          </li>
        ))}
      </ul>
    );
    expect(factRowDirFaults(kit.textDir, { product: 'stub', List: NoDir }).join('\n')).toMatch(/no content direction/);
  });

  it('a chrome that scopes the row but ignores textDir is caught', () => {
    const Auto = ({ rows }: FactListProps) => (
      <ul>
        {rows.map((r) => (
          <li key={r.id}>
            <div dir="auto" data-fact-text="">
              {r.content}
            </div>
          </li>
        ))}
      </ul>
    );
    const faults = factRowDirFaults(kit.textDir, { product: 'stub', List: Auto });
    expect(faults).toHaveLength(LTR_ROWS.length + RTL_ROWS.length);
  });

  it('a row whose ∠ is not first in its content is caught (the reported shape)', () => {
    const faults = factRowDirFaults(kit.textDir, { product: 'stub', render: (s) => s.replace(/^∠(.*)$/, '$1∠') });
    expect(faults.join('\n')).toMatch(/∠ is not first/);
  });
});
