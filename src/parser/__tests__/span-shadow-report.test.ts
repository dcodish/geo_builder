/**
 * The SPAN-ACCOUNTING SHADOW SWEEP (S3.1 of docs/24) — the divergence report that must precede any
 * enforcement (docs/24 §4.2: the flip is the operator's decision, made over this report + prod-log
 * shadow data, never silently).
 *
 * Always: sweeps every supported catalog example (both locales) through the REAL parse and the
 * accountant, asserting the sweep itself runs; the summary prints to the test log. With
 * SPAN_SHADOW=1: also writes reports/span-accounting-shadow.md — per-utterance divergences grouped
 * by bucket (hard = would-refuse-if-enforcing; words = the accountant's own vocabulary debt).
 */
import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { COMMAND_CATALOG, parse } from '@/parser';
import { spanShadow } from '../spanAccounting';

describe('span-accounting shadow sweep (catalog corpus)', () => {
  it('sweeps every supported catalog example; SPAN_SHADOW=1 writes the operator report', () => {
    const rows: { utterance: string; hard: string[]; words: string[] }[] = [];
    let swept = 0;
    for (const c of COMMAND_CATALOG) {
      if (!c.supported) continue;
      for (const ex of [c.he, c.en]) {
        const r = parse(ex);
        if (!r.ok) continue; // parseability is the catalog guard's job
        swept++;
        const shadow = spanShadow(ex, r.commands);
        if (shadow) {
          rows.push({
            utterance: ex,
            hard: shadow.hard.map((s) => `${s.kind}:${s.text}`),
            words: shadow.words.map((s) => s.text),
          });
        }
      }
    }
    expect(swept).toBeGreaterThan(100); // non-vacuity — the sweep really ran over the corpus
    const hardRows = rows.filter((r) => r.hard.length);
    // Print the summary into the test log every run (the shadow's heartbeat).
    console.log(
      `span-shadow: swept ${swept} catalog utterances — ${hardRows.length} with HARD divergences, ` +
        `${rows.length - hardRows.length} with unknown-word-only debt`,
    );
    if (process.env.SPAN_SHADOW) {
      const lines = [
        '# Span-accounting shadow report (S3.1 of docs/24)',
        '',
        `_Generated ${new Date().toISOString()} over ${swept} supported catalog utterances (both locales)._`,
        '',
        '**HARD divergences** (an enforcing accountant would refuse these — each is either a real',
        'parser drop or an accountant false positive; every row must be dispositioned before the flip):',
        '',
        ...(hardRows.length
          ? hardRows.map((r) => `- \`${r.utterance}\` → ${r.hard.join(', ')}`)
          : ['- none 🎉']),
        '',
        '**Unknown-word debt** (the accountant does not yet classify these words — grow the',
        'lexicon/filler lists in spanAccounting.ts, never auto-treat as filler):',
        '',
        ...rows.filter((r) => r.words.length).map((r) => `- \`${r.utterance}\` → ${r.words.join(', ')}`),
        '',
      ];
      const dir = path.resolve(__dirname, '../../../reports');
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'span-accounting-shadow.md'), lines.join('\n'), 'utf8');
    }
  });
});
