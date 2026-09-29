/**
 * #1548 — THE FACT LIST'S THREE OPERATIONS, IN EVERY BUILDER (docs/28 D6, held mechanically).
 *
 * D6 ruled *disable, edit in place and delete — all three, everywhere*, and B5 (#670) built one chrome
 * for it: `shell/frame/FactList.tsx`, which renders each control only when the product passes its
 * handler — *"the chrome never fakes an affordance"*. That rule is right, and it is also exactly what
 * let the analytic builder ship without a mute checkbox: it mounted the chrome with `onEditCommit` and
 * `onDelete` and no `onToggle`, the chrome correctly drew nothing, and no test was looking. The
 * operator found it by comparing four tools by eye (2026-09-29).
 *
 * So the chrome's permissiveness needs a suite-side counterweight: every builder's mount passes all
 * three. A builder that genuinely cannot offer one records it HERE, with its reason — a gap stated,
 * never a gap discovered (the §6 conformance-matrix rule: *unset fails*).
 *
 * Source-scan lock (the `row-parity` pattern): the Apps are not rendered; the `<FactList …/>` element's
 * own props are read by a brace-depth scan, so a prop mentioned inside a row callback cannot satisfy it.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/^﻿/, '');

/** Every builder in the suite — the `row-parity` list; builder five is one line in each. */
const APPS = ['src/App.tsx', 'src3d/App3.tsx', 'src-complex/App.tsx', 'src-analytic/App.tsx'] as const;

/** The D6 operations, as the chrome's handler props. */
const OPERATIONS = { disable: 'onToggle', edit: 'onEditCommit', delete: 'onDelete' } as const;

/** Declared exceptions: `{ [app]: { [operation]: reason } }`. Empty — every builder has all three. */
const EXEMPT: Partial<Record<(typeof APPS)[number], Partial<Record<keyof typeof OPERATIONS, string>>>> = {};

/**
 * The TOP-LEVEL prop names of the one `<FactList` element in `src`: walk from the tag to its closing
 * `/>` at brace depth 0, collecting `name=` only at depth 0 — so props inside `rows={…}` (a row's own
 * `chip: { onToggle }`, for one) never count as the list's.
 */
function factListProps(src: string, file: string): Set<string> {
  const start = src.indexOf('<FactList');
  expect(start, `${file} must mount the shared <FactList>`).toBeGreaterThanOrEqual(0);
  expect(src.indexOf('<FactList', start + 1), `${file} must mount <FactList> once for this lock`).toBe(-1);
  const props = new Set<string>();
  let depth = 0;
  for (let i = start + '<FactList'.length; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (depth === 0 && c === '/' && src[i + 1] === '>') return props;
    else if (depth === 0) {
      const m = /^([A-Za-z]\w*)=/.exec(src.slice(i, i + 40));
      if (m && /\s/.test(src[i - 1])) {
        props.add(m[1]);
        i += m[1].length;
      }
    }
  }
  throw new Error(`${file}: <FactList> is never closed`);
}

describe('#1548 — every builder offers disable, edit and delete on its fact list (D6)', () => {
  for (const app of APPS) {
    it(app, () => {
      const props = factListProps(read(app), app);
      for (const [op, prop] of Object.entries(OPERATIONS) as [keyof typeof OPERATIONS, string][]) {
        if (EXEMPT[app]?.[op]) continue;
        expect(props.has(prop), `${app}: the fact list has no «${op}» (${prop}) — D6 rules all three in every builder`).toBe(true);
      }
    });
  }

  it('the scan reads the element, not its row callbacks (it bites)', () => {
    const src = `<FactList rows={x.map(() => ({ chip: { onToggle: f } }))} onDelete={g} testId="t" />`;
    const props = factListProps(src, 'fixture');
    expect(props.has('onDelete')).toBe(true);
    expect(props.has('onToggle')).toBe(false);
  });
});
