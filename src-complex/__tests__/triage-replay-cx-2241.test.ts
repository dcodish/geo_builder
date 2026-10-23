/**
 * #2241 ([ADR-W-150](../../docs/06w-decisions-workspace.md#adr-w-150)) — complex's production log joins `/log-triage`.
 *
 * Complex posted `submit` events from prod/2026-09-29 (#1243) and nothing read them: the triage had no
 * complex adapter, and the skill, its agent, `apps.ts`, `triage.mjs`, `server/admin.ts` and ADR-W-083 all
 * said complex posted nothing. The fix has four parts, each locked here:
 *
 *  1. `decideSubmitCx` — the whole submit decision, pure; `submitLine` dispatches on it (the analytic shape
 *     of #1102), so the triage replay calls the App's own decision and mirrors nothing (ADR-346);
 *  2. `replayComplexSession` — one session in order, following the store actions the App now logs, and
 *     degraded (never a live gap) where the prefix stops being the student's;
 *  3. `outcomeOfComplex` — one classifier, ADR-W-083's reading for unruled codes (locked in
 *     `server/__tests__/analytic-dashboard-1362.test.ts`: a product tree may not import `server/`);
 *  4. the App logs its store actions, and `triage.mjs` wires the pair with no product branch.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { ingestTypedText } from '../../shell/bidi';
import { decideSubmitCx, submitLine, type SubmitVerdictCx } from '../app/submit';
import { stateFingerprintCx } from '../app/stateFingerprint';
import { type LoggedEventCx, replayComplexSession } from '../app/triageReplayCx';
import { useComplexStore } from '../store/useComplexStore';

const ROOT = path.join(__dirname, '..', '..');
const S = (lines: string[], disabled: number[] = [], seed = 0) => ({ lines, disabled, seed });
const sub = (utterance: string): LoggedEventCx => ({ ev: 'submit', utterance, source: 'grammar' });
const act = (action: string, detail?: string, result?: string): LoggedEventCx => ({ ev: 'action', action, detail, result });
const LOGGED = { actionsLogged: true } as const;
const Z = 'z1 = 3+4i';
const Z2 = 'z1 = 1+i'; // incompatible with Z while Z is in the figure

describe('#2241 — decideSubmitCx is the whole decision, and submitLine only dispatches on it', () => {
  const cases: [ReturnType<typeof S>, string, SubmitVerdictCx['kind'], string?][] = [
    [S([]), Z, 'record'],
    [S([Z]), Z, 'known'],
    [S([Z]), Z2, 'refuse', 'incompatible'],
    [S([Z], [0]), Z2, 'record'], // a muted line does not veto (B5)
    [S([Z]), '|z1|?', 'ask'],
    [S([]), 'blah blah foo', 'refuse', 'not-handled'],
    [S([]), 'prove that w is real', 'refuse', 'proof-target'],
    [S([]), 'ДЖФ', 'refuse', 'unread-name'],
  ];
  for (const [state, raw, kind, key] of cases) {
    it(`${JSON.stringify(state.lines)}${state.disabled.length ? ' muted' : ''} + «${raw}» → ${kind}${key ? ` (${key})` : ''}`, () => {
      const v = decideSubmitCx(state, raw);
      expect(v.kind).toBe(kind);
      if (key) expect(v.kind === 'refuse' && v.error.key).toBe(key);
    });
  }

  it('submitLine writes exactly what the decision says, for every verdict kind', () => {
    for (const [state, raw, kind] of cases) {
      useComplexStore.getState().resetSession();
      useComplexStore.setState({ lines: [...state.lines], disabled: [...state.disabled], seed: state.seed });
      const v = decideSubmitCx(state, raw);
      const ok = submitLine(raw);
      const st = useComplexStore.getState();
      expect(ok, raw).toBe(kind !== 'refuse');
      if (v.kind === 'refuse') expect(st.lastError).toEqual(v.error);
      if (v.kind === 'record') expect(st.lines).toEqual([...state.lines, v.line]);
      if (v.kind === 'ask') expect(st.queries).toContain(v.line);
      if (v.kind === 'known') expect(st.lastNote).toEqual(v.note);
    }
  });
});

describe('#2241 — replayComplexSession follows the logged actions, and degrades where it cannot', () => {
  beforeEach(() => useComplexStore.getState().resetSession());

  it('submit → delete → submit: the delete is followed, so the second value builds on a faithful prefix', () => {
    const out = replayComplexSession([sub(Z), act('delete', `0:${ingestTypedText(Z)}`), sub(Z2)], LOGGED);
    expect(out.map((o) => o.now)).toEqual(['built', 'skip', 'built']);
    expect(out.every((o) => !o.degraded)).toBe(true);
  });

  it('without the delete the same second line is refused — the replay really threads the figure', () => {
    expect(replayComplexSession([sub(Z), sub(Z2)], LOGGED)[1]).toMatchObject({ now: 'refused', detail: 'incompatible' });
  });

  it('a delete that names a line the replay does not hold degrades the rest', () => {
    const out = replayComplexSession([sub(Z), act('delete', '0:z9 = 1'), sub(Z2)], LOGGED);
    expect(out[2].degraded).toBe(true);
  });

  it('clear is followed', () => {
    const out = replayComplexSession([sub(Z), act('clear'), sub(Z2)], LOGGED);
    expect(out[2]).toEqual({ now: 'built', detail: 'record', degraded: false });
  });

  it('undo / redo land on the state their fingerprint names', () => {
    const empty = stateFingerprintCx([], [], 0);
    const withZ = stateFingerprintCx([ingestTypedText(Z)], [], 0);
    const out = replayComplexSession([sub(Z), act('undo', empty), sub(Z2), act('undo', empty), act('redo', withZ), sub(Z2)], LOGGED);
    expect(out.map((o) => o.now)).toEqual(['built', 'skip', 'built', 'skip', 'skip', 'refused']);
    expect(out.every((o) => !o.degraded)).toBe(true);
  });

  it('an undo to a state the replay never stood on degrades the rest; a later recognised one restores it', () => {
    const out = replayComplexSession([sub(Z), act('undo', 'nope'), sub(Z2), act('undo', stateFingerprintCx([], [], 0)), sub(Z2)], LOGGED);
    expect(out.map((o) => o.degraded)).toEqual([false, true, true, false, false]);
  });

  it('a mute is followed: the muted line no longer vetoes', () => {
    const out = replayComplexSession([sub(Z), act('toggle', '0:off'), sub(Z2)], LOGGED);
    expect(out[2]).toEqual({ now: 'built', detail: 'record', degraded: false });
  });

  it('a refused un-mute changes nothing; a successful one (its seed is not logged) degrades the rest', () => {
    expect(replayComplexSession([sub(Z), act('toggle', '0:off'), act('toggle', '0:on', 'incompatible'), sub('z2 = 1')], LOGGED)[3].degraded).toBe(false);
    expect(replayComplexSession([sub(Z), act('toggle', '0:off'), act('toggle', '0:on'), sub('z2 = 1')], LOGGED)[3].degraded).toBe(true);
  });

  it('show-another steps the seed, as nextConfig does, and keeps the prefix faithful', () => {
    const out = replayComplexSession([sub(Z), act('show-another'), act('undo', stateFingerprintCx([ingestTypedText(Z)], [], 0))], LOGGED);
    expect(out.every((o) => !o.degraded)).toBe(true);
  });

  for (const a of ['edit', 'load', 'drag', 'something-new']) {
    it(`«${a}» degrades the rest of the session`, () => {
      const out = replayComplexSession([sub(Z), act(a, '0:z1 = 2'), sub('z2 = 1')], LOGGED);
      expect(out[0].degraded).toBe(false);
      expect(out[2].degraded).toBe(true);
    });
  }

  it('a session from a build that logged no actions is degraded from its FIRST row (never a live gap)', () => {
    const out = replayComplexSession([sub(Z), sub('blah blah foo')], { actionsLogged: false });
    expect(out.map((o) => o.degraded)).toEqual([true, true]);
    expect(out[1].now).toBe('not-handled');
  });

  it('every verdict kind maps to a triage bucket', () => {
    const out = replayComplexSession([sub(Z), sub(Z), sub('|z1|?'), sub('blah blah foo'), sub('prove that w is real'), sub('')], LOGGED);
    expect(out.map((o) => `${o.now}:${o.detail}`)).toEqual([
      'built:record',
      'built-nothing:already-known',
      'built:ask',
      'not-handled:not-handled',
      'refused:proof-target',
      'skip:',
    ]);
  });

  it('the budget is honest: past it a submit is unverified, never silently dropped', () => {
    expect(replayComplexSession([sub(Z)], { actionsLogged: true, budgetMs: -1 })[0]).toMatchObject({ now: 'unverified' });
  });
});

describe('#2241 — the wiring (read as source: the App renders a canvas, and triage.mjs runs on import)', () => {
  const app = readFileSync(path.join(ROOT, 'src-complex', 'App.tsx'), 'utf8');
  it('the App logs every store action a replay must follow, beside submitCounted', () => {
    for (const a of ['clear', 'undo', 'redo', 'delete', 'edit', 'toggle', 'show-another', 'load'])
      expect(app.includes(`logAction('${a}'`), `App.tsx logs «${a}»`).toBe(true);
    // the row's buttons go through the logging wrappers, never straight to the store
    expect(app).not.toMatch(/onClick=\{(undo|redo|nextConfig)\}/);
    expect(app).toMatch(/onClick=\{undoLogged\}/);
    expect(app).toMatch(/onClick=\{redoLogged\}/);
    expect(app).toMatch(/onClick=\{showAnotherLogged\}/);
    // three load entry points: the file picker, the share link, the restore offer
    expect(app.match(/logLoad\(/g)?.length ?? 0).toBe(3);
  });

  it('triage.mjs imports the replay and the classifier, and keeps no complex branch', () => {
    const src = readFileSync(path.join(ROOT, '.claude', 'skills', 'log-triage', 'triage.mjs'), 'utf8');
    expect(src).toMatch(/import \{ replayComplexSession \} from '\.\.\/\.\.\/\.\.\/src-complex\/app\/triageReplayCx\.ts'/);
    expect(src).toMatch(/import \{ outcomeOfComplex \} from '\.\.\/\.\.\/\.\.\/server\/admin\.ts'/);
    const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
    expect(code).not.toMatch(/=== 'complex'/);
    // the pre-logging probe looks for the very token the App writes
    expect(src).toContain(`src.includes("logAction('undo'")`);
    expect(app).toContain(`logAction('undo'`);
  });
});
