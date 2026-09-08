/**
 * #916 (ADR-3D-232) — the fixture generator's blast radius, and the coverage it used to erase.
 *
 * Found in round #915 while adding a fixture for #909: `GEN_FIXTURES3=1` — the documented way to add
 * one — rewrote all 14 seeded files, and the diff was a schema MIGRATION (v1 → v2), not churn. Those
 * v1 files are the only coverage of the backward-compatible load path. **The suite was green before
 * and after**, which is the real defect: nothing failed when the coverage disappeared, so the deletion
 * would have been committed as noise.
 *
 * The generator is driven here against a TEMP directory rather than by running the env-gated block, so
 * the "writes only what is missing" property is asserted directly instead of inferred.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  generateSeeded,
  schemaVersionCoverage,
  supportedSchemaVersions,
  versionsWithoutCoverage,
  type SeededCorpus,
} from './fixtures3-gen';
import { SCHEMA_VERSION_3D } from '../store/figureFile3';

// Two tiny sessions — the point is the generator's file behaviour, not the corpus's geometry.
const CORPUS: SeededCorpus = {
  'a-cube.geo3.json': ['קובייה ABCD'],
  'b-box.geo3.json': ["תיבה ABCDA'B'C'D'"],
};

let DIR = '';
beforeEach(() => { DIR = mkdtempSync(join(tmpdir(), 'fx3-')); });
afterEach(() => { rmSync(DIR, { recursive: true, force: true }); });

describe('#916 — the generator writes what is MISSING; the blanket rebuild is opt-in', () => {
  it('an empty directory: every seeded file is written', () => {
    const { written, skipped } = generateSeeded(DIR, CORPUS);
    expect(written.sort()).toEqual(Object.keys(CORPUS).sort());
    expect(skipped).toEqual([]);
    expect(readdirSync(DIR).sort()).toEqual(Object.keys(CORPUS).sort());
  });

  it('THE FIX: adding ONE entry writes ONE file and leaves the rest byte-identical', () => {
    generateSeeded(DIR, CORPUS);
    const before = Object.fromEntries(Object.keys(CORPUS).map((f) => [f, readFileSync(join(DIR, f), 'utf8')]));

    // The #915 situation: a new session joins SEEDED and the generator is run to produce it.
    const grown: SeededCorpus = { ...CORPUS, 'c-pyramid.geo3.json': ['פירמידה SABCD שבסיסה ריבוע'] };
    const { written, skipped } = generateSeeded(DIR, grown);

    expect(written, 'exactly the new one — this is the whole bug').toEqual(['c-pyramid.geo3.json']);
    expect(skipped.sort()).toEqual(Object.keys(CORPUS).sort());
    for (const [f, content] of Object.entries(before)) {
      expect(readFileSync(join(DIR, f), 'utf8'), `${f} untouched`).toBe(content);
    }
  });

  it('an EXISTING file is not rewritten even when its content is stale', () => {
    generateSeeded(DIR, CORPUS);
    // Stand in for a v1 file the current pipeline would serialize differently.
    const stale = '{"app":"3d-builder","schemaVersion":1,"facts":[],"seed":0}';
    writeFileSync(join(DIR, 'a-cube.geo3.json'), stale, 'utf8');
    const { written, skipped } = generateSeeded(DIR, CORPUS);
    expect(written, 'nothing missing ⇒ nothing written').toEqual([]);
    expect(skipped.sort()).toEqual(Object.keys(CORPUS).sort());
    expect(readFileSync(join(DIR, 'a-cube.geo3.json'), 'utf8'), 'the older generation survives').toBe(stale);
  });

  it('the ESCAPE HATCH still works: `all` rebuilds every file', () => {
    generateSeeded(DIR, CORPUS);
    const stale = '{"app":"3d-builder","schemaVersion":1,"facts":[],"seed":0}';
    writeFileSync(join(DIR, 'a-cube.geo3.json'), stale, 'utf8');
    const { written, skipped } = generateSeeded(DIR, CORPUS, { all: true });
    expect(written.sort(), 'the deliberate form still rewrites everything').toEqual(Object.keys(CORPUS).sort());
    expect(skipped).toEqual([]);
    expect(readFileSync(join(DIR, 'a-cube.geo3.json'), 'utf8')).not.toBe(stale);
  });

  it('a session that does not build THROWS instead of writing a broken fixture', () => {
    expect(() => generateSeeded(DIR, { 'bad.geo3.json': ['קובייה ABCD', 'זהו משפט חסר משמעות לגמרי'] })).toThrow();
    expect(readdirSync(DIR), 'nothing was written').toEqual([]);
  });
});

describe('#916 — losing a schema generation’s load coverage FAILS, it does not pass as churn', () => {
  it('supported versions are DERIVED from the load path’s own constant', () => {
    expect(supportedSchemaVersions()).toEqual(
      Array.from({ length: SCHEMA_VERSION_3D }, (_, i) => i + 1),
    );
    expect(supportedSchemaVersions(), 'v1 is still accepted, so it is still a promise').toContain(1);
  });

  it('a corpus holding every supported version reports no loss', () => {
    for (const v of supportedSchemaVersions()) {
      writeFileSync(join(DIR, `v${v}.geo3.json`), JSON.stringify({ app: '3d-builder', schemaVersion: v, facts: [], seed: 0 }), 'utf8');
    }
    expect(versionsWithoutCoverage(DIR)).toEqual([]);
    expect([...schemaVersionCoverage(DIR).keys()].sort()).toEqual(supportedSchemaVersions());
  });

  it('THE LOCK: deleting the last v1 fixture is DETECTED, and the version is named', () => {
    // The exact shape of the #915 near-miss: everything migrated to the current version.
    for (const v of supportedSchemaVersions()) {
      writeFileSync(join(DIR, `v${v}.geo3.json`), JSON.stringify({ app: '3d-builder', schemaVersion: v, facts: [], seed: 0 }), 'utf8');
    }
    rmSync(join(DIR, 'v1.geo3.json'));
    expect(versionsWithoutCoverage(DIR), 'the lost generation is named, not just counted').toEqual([1]);
  });

  it('an unparseable or version-less file is ignored rather than counted as coverage', () => {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(join(DIR, 'broken.geo3.json'), '{not json', 'utf8');
    writeFileSync(join(DIR, 'noversion.geo3.json'), '{"app":"3d-builder","facts":[]}', 'utf8');
    expect(schemaVersionCoverage(DIR).size).toBe(0);
    expect(versionsWithoutCoverage(DIR), 'every supported version is reported lost').toEqual(supportedSchemaVersions());
  });

  it('THE REAL CORPUS is healthy today, and its v1 coverage is not accidental', () => {
    const real = join(__dirname, '..', '..', 'fixtures3');
    expect(statSync(real).isDirectory()).toBe(true);
    const coverage = schemaVersionCoverage(real);
    expect(versionsWithoutCoverage(real), 'no supported generation is uncovered').toEqual([]);
    // Stated as a number so a rebuild that quietly migrates 19 files to v2 cannot read as "still ≥1".
    expect((coverage.get(1) ?? []).length, 'the v1 generation carries real coverage').toBeGreaterThan(5);
  });
});
