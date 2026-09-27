/**
 * #1477 — the META-lock and the roster net for the About-content checks (docs/28 §5c rule 5,
 * ADR-W-091).
 *
 * Four per-tree locks call `aboutContentFaults` on their product's real declaration and real submit
 * gate. This file proves those calls can FAIL: it runs the same function against deliberately broken
 * subjects — the thin About 3-D/complex/analytic shipped, a missing locale, a refused try step, a
 * runner that returns early, a stray contact address, a layout that drops the steps — and asserts
 * each is caught. The last block reads the roster (`products.json`) so a fifth builder cannot ship
 * without its own lock.
 *
 * Stubs only: no product imports (ADR-W-016 rule 2).
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import type { AboutContent } from '../frame/about';
import {
  aboutContentFaults,
  suiteContactEmail,
  type AboutSubject,
  type StepRunner,
} from './fixtures/about-content-rows';
import { REPO_ROOT, registryProducts } from './fixtures/privacy-disclosure-rows';

const EMAIL = suiteContactEmail();

const full = (steps = ['ריבוע ⁦ABCD⁩', 'נקודה G על AD', 'z1 = 3+4i']): AboutContent => ({
  lead: 'A tool that draws.',
  points: ['For students.', 'One given at a time.', 'It draws, it does not solve.'],
  tryTitle: 'Try:',
  trySteps: steps,
  credit: { by: 'By', name: 'Someone', contact: 'Questions', email: EMAIL },
});
const both = (c: AboutContent): AboutSubject['declarations'] => ({ he: c, en: c });
const acceptAll: StepRunner = (steps) => steps.map((step) => ({ step, ok: true }));
const faultsOf = (s: Partial<AboutSubject>) =>
  aboutContentFaults({ declarations: both(full()), run: acceptAll, ...s }).join(' | ');

describe('#1477 — the About rows really check', () => {
  it('a complete About whose steps all build reports no faults (the suite is satisfiable)', () => {
    expect(aboutContentFaults({ declarations: both(full()), run: acceptAll })).toEqual([]);
  });

  it('CATCHES the one-sentence About the three builders shipped', () => {
    const thin: AboutContent = { ...full(), points: [], tryTitle: '', trySteps: [] };
    const f = faultsOf({ declarations: both(thin) });
    expect(f).toMatch(/0 point\(s\)/);
    expect(f).toMatch(/0 try step\(s\)/);
    expect(f).toMatch(/title is empty/);
  });

  it('CATCHES a missing locale, and a subject with no declaration at all', () => {
    expect(faultsOf({ declarations: { he: full() } })).toMatch(/\[en\] no About declaration/);
    expect(faultsOf({ declarations: {} })).toMatch(/checked nothing/);
  });

  it('CATCHES a try step the submit gate refuses — and names it', () => {
    const refuseSecond: StepRunner = (steps) => steps.map((step, i) => ({ step, ok: i !== 1, why: 'not-understood' }));
    expect(faultsOf({ run: refuseSecond })).toMatch(/try step 2 «נקודה G על AD» is REFUSED by the submit gate: not-understood/);
  });

  it('submits the bare text: the bidi isolates of the displayed line are stripped before the gate', () => {
    const seen: string[] = [];
    aboutContentFaults({ declarations: both(full()), run: (steps) => (seen.push(...steps), acceptAll(steps)) });
    expect(seen).toContain('ריבוע ABCD');
    expect(seen.join('')).not.toMatch(/[⁦-⁩]/);
  });

  it('CATCHES a runner that returns early — an empty verdict list must not read as "all built"', () => {
    expect(faultsOf({ run: () => [] })).toMatch(/returned 0 verdict\(s\) for 3 step\(s\)/);
  });

  it('CATCHES an incomplete credit and a contact address that is not the suite one', () => {
    const c = full();
    expect(faultsOf({ declarations: both({ ...c, credit: { ...c.credit, name: ' ' } }) })).toMatch(/credit line is incomplete/);
    expect(faultsOf({ declarations: both({ ...c, credit: { ...c.credit, email: 'x@example.com' } }) })).toMatch(/not the suite contact/);
  });

  it('CATCHES an empty or repeated point or step', () => {
    const c = full();
    expect(faultsOf({ declarations: both({ ...c, points: [...c.points, ''] }) })).toMatch(/point 4 is empty/);
    expect(faultsOf({ declarations: both({ ...c, trySteps: ['a', 'b', 'a'] }) })).toMatch(/try step «a» appears twice/);
  });

  it('CATCHES a layout that drops the try lines, or loses their direction', () => {
    const noSteps: AboutSubject['Body'] = ({ content }) => createElement('p', null, content.lead);
    expect(faultsOf({ Body: noSteps })).toMatch(/shows 0 try line\(s\) for 3 step\(s\)/);
    const forcedLtr: AboutSubject['Body'] = ({ content }) =>
      createElement(
        'div',
        null,
        content.lead,
        content.tryTitle,
        ...content.points,
        content.credit.name,
        content.credit.email,
        ...content.trySteps.map((s) => createElement('li', { key: s, dir: 'ltr', 'data-about-step': '' }, s)),
      );
    expect(faultsOf({ Body: forcedLtr })).toMatch(/try line 1 renders dir=ltr, want rtl/);
  });
});

describe('#1477 — every registered builder carries its About lock (the roster, not a list)', () => {
  const builders = registryProducts().filter((p) => p.enabled);

  it('the roster is read, not assumed', () => {
    expect(builders.length).toBeGreaterThanOrEqual(4);
  });

  for (const p of builders) {
    it(`${p.id}: its tree has a lock that runs the shared suite for '${p.id}'`, () => {
      const lock = path.join(REPO_ROOT, p.tree, '__tests__', 'about-content-1477.test.ts');
      expect(existsSync(lock), `${p.tree}/__tests__/about-content-1477.test.ts is missing`).toBe(true);
      expect(readFileSync(lock, 'utf8')).toContain(`aboutContentSuite('${p.id}'`);
    });
  }
});
