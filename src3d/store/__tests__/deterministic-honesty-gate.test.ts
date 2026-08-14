/**
 * #535 (ADR-3D-147) — the DETERMINISTIC submit path asks the label/number honesty gates.
 *
 * The falsified assumption (its wording lived in the submitSteps comment): "the rules parse the
 * utterance itself, so the deterministic path needs no gate." #530 proved a rule CAN match an
 * utterance and still drop part of it — an optional label capture that goes unfilled commits a
 * partial figure with a green ✓, and `droppedNewLabels3` KNEW but was only ever asked on the LLM
 * seam. The gate is bound to the EVENT (a commit), never to a path.
 *
 * The dropping parse is SIMULATED by mocking `parse3` for two sentinel utterances (the #530 marker
 * fix is landed, so no real rule drops these today — the lock is the WIRING, which must catch the
 * next rule that drops, whatever it is). Everything else passes through to the real parser.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const DROP_LABEL = 'נקודה M על AB ונקודה N על CD';
const DROP_NUMBER = 'AB = 7';

vi.mock('../../parser/parse3', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../parser/parse3')>();
  return {
    ...real,
    parse3: (u: string) => {
      if (u === DROP_LABEL) return real.parse3('M אמצע AB'); // the rule matched, N silently dropped
      if (u === DROP_NUMBER) return real.parse3('קטע AB'); // the rule matched, the 7 silently dropped
      return real.parse3(u);
    },
  };
});

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useGeo3 } from '../store3';
import { applyCommand3 } from '../../engine/apply';
import { emptyConstruction3 } from '../../engine/types';
import { droppedGivenNumbers3, droppedNewLabels3 } from '../../parser/honesty3';
import { deserializeFigure3 } from '../figureFile3';

describe('the gates hold at the DETERMINISTIC commit seam (store3.submit) — wiring lock', () => {
  beforeEach(() => {
    useGeo3.setState({ facts: [], seed: 0, lastError: null });
    useGeo3.temporal.getState().clear();
  });

  it('a rule that drops a stated NEW label refuses dropped-given and keeps the prior figure', () => {
    useGeo3.getState().submit('קובייה ABCD');
    const before = useGeo3.getState().facts.length;
    useGeo3.getState().submit(DROP_LABEL);
    const st = useGeo3.getState();
    expect(st.facts.length).toBe(before); // keep-prior: nothing committed
    expect(st.lastError).toEqual({ code: 'dropped-given', items: 'N' });
  });

  it('a rule that drops a stated magnitude refuses with the number named', () => {
    useGeo3.getState().submit('קובייה ABCD');
    useGeo3.getState().submit(DROP_NUMBER);
    expect(useGeo3.getState().lastError).toEqual({ code: 'dropped-given', items: '7' });
  });

  it('EXISTING labels referenced but not re-created do not block (M1 context)', () => {
    useGeo3.getState().submit('קובייה ABCD');
    useGeo3.getState().submit("M אמצע BB'");
    expect(useGeo3.getState().lastError).toBeNull();
    useGeo3.getState().submit('קטע AC');
    expect(useGeo3.getState().lastError).toBeNull();
  });
});

describe('false-positive net — no stored fixture session trips the deterministic gates', () => {
  // The fixtures are REAL sessions (each fact committed green through submit when saved). Replaying
  // their gate calls with the true prior context (a construction fold, no solve needed — the gates
  // read only label sets) asserts the newly-wired gates would not have refused any of them.
  const DIR = join(__dirname, '..', '..', '..', 'fixtures3');
  const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.geo3.json')) : [];

  it('the net is not empty', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(file, () => {
      const r = deserializeFigure3(readFileSync(join(DIR, file), 'utf8'));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      let c = emptyConstruction3();
      for (const f of r.facts) {
        if (!f.enabled) continue;
        expect(
          droppedNewLabels3(f.utterance, f.cmds, [...c.points.keys()], [...c.vectors.keys()]),
          `labels gate tripped: ${file}: ${f.utterance}`
        ).toEqual([]);
        expect(droppedGivenNumbers3(f.utterance, f.cmds), `numbers gate tripped: ${file}: ${f.utterance}`).toEqual([]);
        for (const cmd of f.cmds) {
          const rr = applyCommand3(c, cmd);
          if (rr.ok) c = rr.next;
        }
      }
    });
  }
});
