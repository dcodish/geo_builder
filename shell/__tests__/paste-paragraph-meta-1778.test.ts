/**
 * #1778 (ADR-W-125) — the meta-lock for `fixtures/paste-paragraph-rows.ts`: the shared checks, run against
 * deliberately broken runners, must catch each one. It calls the same `pasteFaults` the thin locks call.
 */
import { describe, expect, it } from 'vitest';
import { PASTE_ROWS, pasteFaults, type PasteRunner } from './fixtures/paste-paragraph-rows';
import { splitSentences } from '../sentences';

const row = (id: string) => PASTE_ROWS.find((r) => r.id === id)!;
/** A toy builder: takes any sentence without «שלום» as a row, and refuses the rest. */
const takes = (s: string) => !s.includes('שלום');

/** The wiring done right, over the toy builder. */
const good: PasteRunner = async (_setup, paste) => {
  const sentences = splitSentences(paste);
  if (!sentences) return takes(paste) ? { rows: [paste], box: '' } : { rows: [], box: paste };
  const rows: string[] = [];
  for (const s of sentences) {
    if (!takes(s.text)) return { rows, box: s.rest };
    rows.push(s.text);
  }
  return { rows, box: '' };
};

describe('#1778 meta-lock — each broken wiring is caught', () => {
  it('the right wiring passes P1, P3 and S1', async () => {
    expect(await pasteFaults(row('P1'), good)).toEqual([]);
    expect(await pasteFaults(row('P3'), good)).toEqual([]);
    expect(await pasteFaults(row('S1'), good)).toEqual([]);
  });

  it('a seam that never splits (prod before #1778) is caught', async () => {
    const whole: PasteRunner = async (_s, paste) => ({ rows: [], box: paste });
    expect((await pasteFaults(row('P1'), whole)).length).toBeGreaterThan(0);
  });

  it('a chain that skips a refused sentence and goes on is caught', async () => {
    const skips: PasteRunner = async (_s, paste) => ({ rows: splitSentences(paste)!.map((s) => s.text).filter(takes), box: '' });
    expect((await pasteFaults(row('P3'), skips)).length).toBeGreaterThan(0);
  });

  it('a chain that drops the rest of the paste when it stops is caught', async () => {
    const drops: PasteRunner = async (s, paste) => {
      const r = await good(s, paste);
      return { ...r, box: r.box ? r.box.split('.')[0] : '' };
    };
    expect((await pasteFaults(row('P3'), drops)).length).toBeGreaterThan(0);
  });

  it('a seam that splits a single dotted sentence is caught', async () => {
    const eager: PasteRunner = async (_s, paste) => ({ rows: [], box: paste.replace(/\.$/, '') });
    expect((await pasteFaults(row('S1'), eager)).length).toBeGreaterThan(0);
  });
});
