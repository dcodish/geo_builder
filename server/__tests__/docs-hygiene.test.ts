/**
 * DOCUMENTATION CONFORMANCE — orientation hygiene (ADR-W-002, #452) + the requirements/design
 * contract (ADR-W-041, #904).
 *
 * ## Why the enumerations moved into DOCS.json
 *
 * This file used to carry its own hardcoded lists of orientation files and ADR logs. Both were one
 * entry short, and had been since the day the fourth product's tree was created: `src-analytic/
 * CLAUDE.md` was unguarded, and `docs/06c-decisions-analytic.md` was absent from `ADR_LOGS`, so every
 * `ADR-AG-*` id was unresolvable-BY-OMISSION rather than checked. The suite reported green throughout.
 *
 * That is precisely the failure this file's own docblock warned about ("an id whose prefix is missing
 * here is not 'allowed', it is INVISIBLE to the resolution test"), which is the point: a list embedded
 * in a test is a list nobody edits when they add a product. So the lists now live in
 * [`DOCS.json`](../../DOCS.json), the guard reads them, and a `products.json` id with no `DOCS.json`
 * entry fails here — the same registry-and-a-test pattern as `BOUNDARIES.json` + `isolation.test.ts`.
 *
 * ## Why the doc gate is derived
 *
 * `ci.yml` carries `paths-ignore: docs/**`, so a docs-only push runs **no CI lane at all**. The
 * `docGate` set is therefore the only thing standing between a doc edit and a red suite discovered
 * later on someone else's commit. A hand-written grep for that set missed three real readers — two of
 * them BYTE-MATCH gates (`src/theorems` against `docs/07`, `src-complex/formulas` against `docs/29`)
 * where editing the prose alone turns the suite red. So the set is rescanned here rather than recalled.
 *
 * ## Grandfather lists are asserted EXACT
 *
 * `index.grandfathered` and `frIds.grandfathered` use `toEqual`, not "at most". A new violation fails,
 * and so does fixing one without shrinking the list. They are the record of a known debt (#904 Phases
 * 2-3), not a place for exceptions to accumulate — the mechanism that lets a guard rot into decoration.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel));

const DOCS = JSON.parse(read('DOCS.json'));
const PRODUCTS = JSON.parse(read('products.json'));

/** Registry objects carry `$comment` keys; they are documentation, not entries. */
const entries = <T>(o: Record<string, T>): [string, T][] =>
  Object.entries(o).filter(([k]) => !k.startsWith('$'));

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ORIENTATION = entries<{ ceiling: number }>(DOCS.orientationFiles);
const ADR_LOGS = entries<{ idPrefix: string; contractFrom: number }>(DOCS.adrLogs);

/**
 * Built from the registry's prefixes, so a log added to DOCS.json is visible here automatically.
 * Headings are matched with `^#+` because the logs mix `## ADR-N` and `### ADR-N` (390 vs 120 in
 * 06-decisions.md alone) — a `^## ` matcher silently skips a quarter of every log.
 */
const ADR_ID = `ADR-(?:${ADR_LOGS.map(([, v]) => v.idPrefix)
  .filter(Boolean)
  .map(escapeRe)
  .join('|')})?\\d+`;

const docsDir = path.join(ROOT, 'docs');
const DOC_FILES = fs
  .readdirSync(docsDir)
  .filter((f) => f.endsWith('.md') && f !== 'README.md')
  .sort();

describe('orientation files stay orientation files (ADR-W-002)', () => {
  it('the guarded files exist (guard is not vacuous)', () => {
    expect(ORIENTATION.length, 'DOCS.json declares no orientation files').toBeGreaterThan(0);
    for (const [file] of ORIENTATION) {
      expect(exists(file), `${file} is missing`).toBe(true);
    }
  });

  it.each(ORIENTATION)('%s stays under its size ceiling', (file, { ceiling }) => {
    const bytes = Buffer.byteLength(read(file), 'utf8');
    expect(
      bytes,
      `${file} is ${bytes} B, over the ${ceiling} B ceiling. This file is an ORIENTATION file: ` +
        `what exists, where it lives, what must never be done. History belongs in the ADR logs ` +
        `(docs/06*.md), status in the issue queue. Do not raise the ceiling to fit new prose — ` +
        `move the prose to its ADR.`,
    ).toBeLessThan(ceiling);
  });

  it.each(ORIENTATION)('%s carries no dated session chronology', (file) => {
    // The exact form that produced 172 KB of duplicated ADR narrative.
    const chronology = read(file).match(/\*\*Then \(/g) ?? [];
    expect(
      chronology.length,
      `${file} has ${chronology.length} "**Then (" entries. A dated progress entry belongs in its ` +
        `ADR (docs/06*.md), not here — that is the copy that is actually kept current.`,
    ).toBe(0);
  });

  it('every ADR id referenced by an orientation file resolves in a log', () => {
    const declared = new Set<string>();
    for (const [log] of ADR_LOGS) {
      for (const heading of read(log).match(new RegExp(String.raw`^#+\s*${ADR_ID}`, 'gm')) ?? []) {
        declared.add(heading.replace(/^#+\s*/, ''));
      }
    }
    expect(declared.size, 'no ADR headings parsed — the log format changed').toBeGreaterThan(100);

    const dangling: string[] = [];
    for (const [file] of ORIENTATION) {
      // The trailing \b keeps the `ADR-3D-NNN` placeholder from matching as `ADR-3`.
      for (const id of new Set(read(file).match(new RegExp(String.raw`${ADR_ID}\b`, 'g')) ?? [])) {
        if (!declared.has(id)) dangling.push(`${file} -> ${id}`);
      }
    }
    expect(dangling, 'referenced ADR ids with no entry in any log').toEqual([]);
  });
});

describe('the documentation registry is total (ADR-W-041)', () => {
  it('every products.json id has a DOCS.json entry', () => {
    const missing = PRODUCTS.products
      .map((p: { id: string }) => p.id)
      .filter((id: string) => !(id in DOCS.products));
    expect(
      missing,
      `product ids in products.json with no DOCS.json entry: ${missing.join(', ')}. Builder N+1 ` +
        `must declare its requirements and design docs (or a null + 'pending' issue) on arrival.`,
    ).toEqual([]);
  });

  it('every declared requirements/design doc exists on disk', () => {
    const broken: string[] = [];
    for (const [id, cfg] of entries<Record<string, unknown>>(DOCS.products)) {
      for (const kind of ['requirements', 'design'] as const) {
        const p = cfg[kind] as string | null;
        if (p && !exists(p)) broken.push(`${id}.${kind} -> ${p}`);
      }
    }
    expect(broken, 'DOCS.json points at documents that do not exist').toEqual([]);
  });

  it('every UNWRITTEN doc is a declared gap, not an oversight', () => {
    const undeclared: string[] = [];
    for (const [id, cfg] of entries<Record<string, unknown>>(DOCS.products)) {
      const hasNull = !cfg.requirements || !cfg.design;
      if (hasNull && typeof cfg.pending !== 'number') undeclared.push(id);
    }
    expect(
      undeclared,
      `products with a missing doc and no 'pending' issue number: ${undeclared.join(', ')}. ` +
        `A null path is allowed only as a TRACKED gap — that is what separates known debt from drift.`,
    ).toEqual([]);
  });
});

describe('docs/README.md indexes every document (ADR-W-041)', () => {
  it('the omission set is exactly the grandfathered list', () => {
    const index = read(DOCS.index.file);
    const missing = DOC_FILES.filter((f) => !index.includes(f));
    expect(
      missing,
      `docs/README.md is the entry point; a doc it omits is invisible to a session. Expected the ` +
        `omissions to be exactly DOCS.json index.grandfathered (emptied by #${DOCS.index.issue}). ` +
        `If you FIXED one, remove it from the list; if you ADDED a doc, index it.`,
    ).toEqual([...DOCS.index.grandfathered].sort());
  });
});

describe('every FR id resolves to a definition (ADR-W-041)', () => {
  it('cited FR ids are defined in a registered requirements doc', () => {
    const reqDocs = entries<Record<string, unknown>>(DOCS.products)
      .map(([, cfg]) => cfg.requirements as string | null)
      .filter((p): p is string => Boolean(p));
    expect(reqDocs.length, 'no requirements docs registered').toBeGreaterThan(0);

    // A DEFINITION is the bold declaration form (**FR-XX-N (Tier)**); everything else is a citation.
    const defined = new Set<string>();
    for (const doc of reqDocs) {
      for (const m of read(doc).matchAll(/\*\*(FR-[A-Z]+-\d+[a-z]*)/g)) defined.add(m[1]);
    }

    // The lookbehind is load-bearing: without it `NFR-SE-1` reads as a citation of `FR-SE-1`.
    // That false positive appeared twice in the audit that produced #904.
    const cited = new Set<string>();
    for (const f of DOC_FILES) {
      for (const m of read(`docs/${f}`).matchAll(/(?<![A-Za-z])FR-[A-Z]+-\d+[a-z]*/g)) {
        cited.add(m[0]);
      }
    }

    const dangling = [...cited].filter((id) => !defined.has(id)).sort();
    expect(
      dangling,
      `FR ids cited in docs/ but defined nowhere. A requirement referenced but never written is a ` +
        `promise with no contract behind it. Expected exactly DOCS.json frIds.grandfathered ` +
        `(emptied by #${DOCS.frIds.issue}).`,
    ).toEqual([...DOCS.frIds.grandfathered].sort());
  });
});

describe('new ADRs declare their requirements and design impact (ADR-W-041)', () => {
  it.each(ADR_LOGS)('%s — every ADR at or above its cutoff carries both lines', (log, cfg) => {
    const text = read(log);
    const re = new RegExp(String.raw`^#+\s*ADR-${escapeRe(cfg.idPrefix)}(\d+)\b`, 'gm');
    const heads = [...text.matchAll(re)].map((m) => ({
      id: Number(m[1]),
      raw: m[0].replace(/^#+\s*/, ''),
      start: m.index! + m[0].length,
    }));

    const offenders: string[] = [];
    for (const [i, h] of heads.entries()) {
      if (h.id < cfg.contractFrom) continue;
      const body = text.slice(h.start, heads[i + 1]?.start ?? text.length);
      const missing = (['Requirements', 'Design'] as const).filter(
        (k) => !body.includes(`**${k}:**`),
      );
      if (missing.length) offenders.push(`${h.raw} (missing ${missing.join(' + ')})`);
    }

    expect(
      offenders,
      `ADRs from ${cfg.idPrefix}${cfg.contractFrom} onward must carry **Requirements:** and ` +
        `**Design:** lines — naming the FR ids / design sections touched, or the words ` +
        `"none (internal)". Earlier ADRs are grandfathered by id, so this never asks you to ` +
        `backfill history. See ADR-W-041.`,
    ).toEqual([]);
  });
});

describe('the doc gate covers every doc-reading test (ADR-W-041)', () => {
  const TEST_ROOTS = ['src', 'src3d', 'src-complex', 'src-analytic', 'shell', 'server', 'scripts'];

  const testFiles: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir))) {
      const rel = `${dir}/${e}`;
      if (fs.statSync(path.join(ROOT, rel)).isDirectory()) {
        if (e !== 'node_modules') walk(rel);
      } else if (/\.test\.tsx?$/.test(e)) testFiles.push(rel);
    }
  };
  for (const r of TEST_ROOTS) walk(r);

  it('the gate lists real files (guard is not vacuous)', () => {
    const gate = [...DOCS.docGate.derived, ...DOCS.docGate.registryGuards];
    expect(gate.length).toBeGreaterThan(0);
    for (const f of gate) expect(exists(f), `${f} is in docGate but does not exist`).toBe(true);
  });

  it('no test that touches a docs/ path sits outside the gate', () => {
    const gate = new Set([...DOCS.docGate.derived, ...DOCS.docGate.registryGuards]);
    // A quoted docs/*.md path, ignoring markdown links (`](docs/x.md)`) and comment lines, which
    // are prose references rather than reads.
    const QUOTED_DOC = /(?<!\]\()(['"`])((?:\.\.\/)*docs\/[^'"`]*\.md)\1/;

    const outside: string[] = [];
    for (const f of testFiles) {
      if (gate.has(f)) continue;
      const hit = read(f)
        .split('\n')
        .map((l) => l.replace(/^\s*\*.*$/, '').replace(/\/\/.*$/, ''))
        .find((l) => QUOTED_DOC.test(l));
      if (hit) outside.push(`${f} -> ${hit.trim().slice(0, 80)}`);
    }

    expect(
      outside,
      `these tests read a doc but are not in DOCS.json docGate, so a doc-only change would not ` +
        `run them — and ci.yml ignores docs/** entirely, so nothing else would either. Add them ` +
        `to docGate.derived.`,
    ).toEqual([]);
  });
});
