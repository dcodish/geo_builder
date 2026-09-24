/**
 * #1386 (ADR-W-086) — the GeoGebra comparison page claims only what the tool really does.
 *
 * The page names a competitor, so its claims about GEOGEBRA are checked by a person against GeoGebra's
 * own site before any edit (the page's head comment says so). Its claims about OUR tool are locked
 * here, through the real pipeline rather than a re-statement of it:
 *
 *  - both example blocks build green — status ok, no error, no violated given;
 *  - the bagrut example IS the locked fixture's sentences, so the page cannot drift from coverage;
 *  - the «open the example» link decodes, loads through the same envelope a student's click uses,
 *    and replays green — a teaching page whose demo is broken would be the worst possible advert;
 *  - the FAQ markup says what the visible FAQ says, word for word;
 *  - the not-affiliated line is present, and nothing imitates GeoGebra's identity.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { factsOf, replayFacts } from '../../src/__tests__/scenario-pipeline';
import { deserializeFigure } from '../../src/store/figureFile';
import { replay } from '../../src/replay/core';
import { decodeFigurePayload, LINK_MAX_CHARS } from '../../shell/session/link';

const ROOT = path.resolve(__dirname, '../..');
const page = readFileSync(path.join(ROOT, 'deploy/homepage/geogebra/index.html'), 'utf8');
const example = (name: string) => {
  const m = new RegExp(`<pre data-example="${name}">([\\s\\S]*?)</pre>`).exec(page);
  if (!m) throw new Error(`no example block ${name}`);
  return m[1].split('\n').map((l) => l.trim()).filter(Boolean);
};
type Status = string | { kind?: string };
const green = (d: { status: Record<string, Status>; lastError: string | null; violations: unknown[]; pending: boolean }) => {
  const notOk = Object.values(d.status).filter((s) => (typeof s === 'string' ? s : s.kind) !== 'ok');
  return { notOk: notOk.length, lastError: d.lastError, violations: d.violations.length, pending: d.pending };
};
const GREEN = { notOk: 0, lastError: null, violations: 0, pending: false };

describe('#1386 — the page', () => {
  it('head: canonical, a title and description that fit a result', () => {
    expect(page).toContain('<link rel="canonical" href="https://themathbible.com/geogebra/">');
    const title = /<title>([^<]+)<\/title>/.exec(page)![1];
    expect(title.length).toBeLessThanOrEqual(62);
    const desc = /<meta name="description" content="([^"]+)">/.exec(page)![1];
    expect(desc.length).toBeGreaterThan(80);
    expect(desc.length).toBeLessThanOrEqual(170);
  });

  it('is in the sitemap', () => {
    expect(readFileSync(path.join(ROOT, 'deploy/homepage/sitemap.xml'), 'utf8')).toContain('<loc>https://themathbible.com/geogebra/</loc>');
  });

  it('says it is not affiliated, and uses no GeoGebra image or asset', () => {
    expect(page).toContain('אתר זה אינו קשור ל-GeoGebra');
    expect(page).not.toMatch(/<img\b/i);
    expect(page).not.toMatch(/geogebra\.org/i);
  });
});

describe('#1386 — every example on the page builds', () => {
  it('the bagrut example is the locked fixture’s own sentences (bare «BC» omitted for reading)', () => {
    const fx = JSON.parse(readFileSync(path.join(ROOT, 'src/__tests__/fixtures/2022-summer-a-issue59.geo.json'), 'utf8'));
    const fixtureLines = [...new Set((fx.facts as { utterance: string }[]).map((f) => f.utterance))].filter((u) => u !== 'BC');
    expect(example('bagrut-2022')).toEqual(fixtureLines);
  });

  it.each(['bagrut-2022', 'defining'])('«%s» builds green through parse → replay', (name) => {
    expect(green(replayFacts(factsOf(example(name))))).toEqual(GREEN);
  });

  it('the «open the example» link opens that figure, green, within the link cap', () => {
    const href = /<a class="cta" data-try="bagrut-2022" href="([^"]+)"/.exec(page)![1];
    expect(href.startsWith('https://themathbible.com/geo-builder/#')).toBe(true);
    expect(href.length).toBeLessThanOrEqual(LINK_MAX_CHARS);
    const text = decodeFigurePayload(href.slice(href.indexOf('#')));
    expect(text, 'the fragment decodes').not.toBeNull();
    const r = deserializeFigure(text!);
    expect(r.ok, 'the envelope loads').toBe(true);
    if (!r.ok) return;
    expect(r.file.name).toBe('בגרות קיץ 2022');
    expect(green(replay(r.file.facts, r.file.seed))).toEqual(GREEN);
    // …and it is the same figure as the example block above it.
    const lines = [...new Set(r.file.facts.map((f) => f.utterance))].filter((u) => u !== 'BC');
    expect(lines).toEqual(example('bagrut-2022'));
  });
});

describe('#1386 — the FAQ markup says what the page says', () => {
  it('every Question and Answer in the JSON-LD is visible, word for word', () => {
    const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(page)![1]);
    const faq = ld['@graph'].find((n: { '@type': string }) => n['@type'] === 'FAQPage');
    const qs = faq.mainEntity as { name: string; acceptedAnswer: { text: string } }[];
    expect(qs.length).toBeGreaterThanOrEqual(5);
    for (const q of qs) {
      expect(page).toContain(`<dt>${q.name}</dt><dd>${q.acceptedAnswer.text}</dd>`);
    }
  });
});
