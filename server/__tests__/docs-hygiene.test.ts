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
 * `index.grandfathered`, `frIds.grandfathered` and `frIds.duplicatesGrandfathered` use `toEqual`, not "at most".
 * A new violation fails, and so does fixing one without shrinking the list. They are the record of a known debt
 * (#904 Phases 2-3; #1861 step 4), not a place for exceptions to accumulate — the mechanism that lets a guard
 * rot into decoration.
 *
 * ## The #1861 C4 guards (ADR-W-119)
 *
 * A superseded ADR says so; requirement ids are unique; an ADR that names a ladder appears in it; instruction
 * files point at live docs; MEMORY.md has a ceiling (an `orientationFiles` entry). Each reads its enumeration
 * from DOCS.json and opens with a NEGATIVE CONTROL that plants its defect in a synthetic string: a guard that
 * passes by checking nothing is the failure the audit found repeatedly.
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

  /**
   * NO ADR ID IS CLAIMED TWICE (#1140).
   *
   * Two sessions landed an `ADR-AG-072` within minutes of each other on 2026-09-17 — one for the locus
   * lane, one for the answer row. **Both passed this file's 675 tests and both were pushed.** The
   * duplicate surfaced only because the landing session happened to `grep` the log's headers while
   * reconciling external movement on `main`; that is luck, not a gate.
   *
   * An ADR id is a REFERENCE — commit messages, code comments, `Requirements:`/`Design:` lines and the
   * orientation files all cite them — so two decisions sharing one id makes every citation ambiguous,
   * and silently, because the prose around each citation still reads correctly.
   *
   * The numbering convention is *"take the next number after the tail"*, which is right and which two
   * concurrent sessions **cannot both obey**. That is the class
   * [ADR-W-053](../../docs/06w-decisions-workspace.md#adr-w-053) names: a convention held up by everyone
   * remembering, with no mechanism. It stopped being hypothetical when
   * [ADR-W-054](../../docs/06w-decisions-workspace.md#adr-w-054) authorised unattended overnight rounds —
   * every round writes ADRs, and nobody is awake to spot the next collision.
   */
  /**
   * Three collisions predate this guard, all in the 2-D log and all from long before it existed.
   *
   * They are GRANDFATHERED rather than renumbered: an ADR id is a reference, these are cited from
   * commits, comments and other ADRs, and rewriting months-old decision history to satisfy a new test
   * would break more citations than it fixes. The companion case below forbids the list growing, which
   * is the property that matters — a known, bounded, named exception, the shape #1099 proved works.
   */
  const KNOWN_DUPLICATE_ADRS = ['ADR-244', 'ADR-245', 'ADR-500'];

  /** Every heading that INTRODUCES a decision, by log. */
  const declarations = (): Map<string, string[]> => {
    const seen = new Map<string, string[]>();
    for (const [log] of ADR_LOGS) {
      /**
       * A DECLARATION is an id followed directly by its em-dash title.
       *
       * An AMENDMENT («ADR-050 Amendment 1 — …», «ADR-115 Am. — …») shares its parent's id BY DESIGN —
       * that is what an amendment is — and a bare «## ADR-265» with no title is a section wrapper
       * around the real heading beneath it. Measured: matching every `^#+ ADR-N` heading reports 31
       * duplicates, of which 28 are those two legitimate shapes. A guard that fires on 28 correct
       * entries would be turned off within a day.
       */
      for (const heading of read(log).match(new RegExp(String.raw`^#+\s*${ADR_ID}\s+—`, 'gm')) ?? []) {
        const id = heading.replace(/^#+\s*/, '').replace(/\s+—$/, '');
        seen.set(id, [...(seen.get(id) ?? []), log]);
      }
    }
    return seen;
  };

  it('no ADR id is claimed twice, in any log', () => {
    const seen = declarations();
    expect(seen.size, 'no ADR declarations parsed — the log format changed').toBeGreaterThan(100);

    const duplicates = [...seen.entries()]
      .filter(([id, where]) => where.length > 1 && !KNOWN_DUPLICATE_ADRS.includes(id))
      .map(([id, where]) => `${id} claimed ${where.length}x (${[...new Set(where)].join(', ')})`);

    expect(
      duplicates,
      'an ADR id introduces more than one decision. Two decisions cannot share a reference: renumber ' +
        'the one that landed SECOND (the only rule that needs no coordination between concurrent ' +
        'sessions) and record the old number in its body, since the commit that introduced it is ' +
        'already pushed and cannot be rewritten.',
    ).toEqual([]);
  });

  it('the grandfathered list does not grow, and each entry is still real', () => {
    /**
     * Both directions, so the exception cannot quietly become a dumping ground and cannot quietly rot.
     * If one of these is ever renumbered by hand, this fails and the entry is deleted with it — the
     * self-expiring shape, not an exception with no expiry.
     */
    const seen = declarations();
    const actual = [...seen.entries()].filter(([, where]) => where.length > 1).map(([id]) => id).sort();
    expect(actual, 'the set of duplicate ADR ids changed').toEqual([...KNOWN_DUPLICATE_ADRS].sort());
  });

  /**
   * A GAP is reported, never failed.
   *
   * A skipped number is usually a WITHDRAWN decision and entirely legitimate; a repeated one never is.
   * Turning a gap into a gate would make a withdrawn ADR unrenumberable, so this case asserts only that
   * the gap list can be computed — it exists to stop a future reader from "helpfully" tightening the
   * duplicate check above into a contiguity check.
   */
  it('a numbering GAP is information, not a failure', () => {
    for (const [log, meta] of ADR_LOGS) {
      const prefix = meta.idPrefix ?? '';
      const nums = (read(log).match(new RegExp(String.raw`^#+\s*${ADR_ID}`, 'gm')) ?? [])
        .map((h) => Number(h.replace(/^#+\s*/, '').replace(new RegExp(`^ADR-${escapeRe(prefix)}`), '')))
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b);
      if (nums.length === 0) continue;
      const gaps = [];
      for (let i = 1; i < nums.length; i += 1) if (nums[i] - nums[i - 1] > 1) gaps.push(nums[i - 1]);
      // Asserted as computable, deliberately not as empty — see the docblock.
      expect(Array.isArray(gaps), log).toBe(true);
    }
  });
});

/**
 * INSTRUCTION FILES NEVER POINT AT AN ARCHIVED OR DELETED DOC (#1861 C4).
 *
 * A session follows these files as instructions, so a link in one is an instruction to read that file. After the
 * C1 reorganisation two product CLAUDE.md files still sent sessions to their archived build plans, which
 * contradict the specs that replaced them. Every link and every `docs/…/*.md` path must resolve on disk and must
 * not lead into `docs/archive/`. A deleted doc fails the existence half by itself, so no list of deleted names is
 * kept: the next deletion is caught without editing anything.
 */
const INSTR = DOCS.instructionFiles as { roots: string[]; archive: string };

function instructionRefFaults(file: string, text: string, existsRel: (p: string) => boolean): string[] {
  const faults = new Set<string>();
  const check = (cited: string, target: string) => {
    if (target.startsWith(INSTR.archive)) faults.add(`${file} → ${cited}: archived history, not an instruction`);
    else if (!existsRel(target)) faults.add(`${file} → ${cited}: no such file`);
  };
  // markdown links, resolved against the file's own folder (src3d/CLAUDE.md links ../docs/…)
  for (const m of text.matchAll(/\]\((?![a-z]+:)([^)#\s]+\.md)(?:#[^)]*)?\)/g)) {
    check(m[1], path.posix.normalize(path.posix.join(path.posix.dirname(file), m[1])));
  }
  // a bare repo path in prose or code spans, which is read from the repo root
  for (const m of text.matchAll(/(?<![\w./-])docs\/[\w./-]*?\.md/g)) check(m[0], m[0]);
  return [...faults];
}

const instructionFiles = (): string[] => {
  const walk = (dir: string): string[] =>
    fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name.endsWith('.md') ? [`${dir}/${e.name}`] : [],
    );
  return [...new Set([...ORIENTATION.map(([f]) => f), ...INSTR.roots.flatMap(walk)])].sort();
};

describe('instruction files never point at an archived or deleted doc (#1861 C4)', () => {
  it('the reference reader catches an archived link, an archived path and a deleted file (negative control)', () => {
    const live = (p: string) => p === 'docs/README.md' || p === 'docs/22-workflow.md';
    expect(
      instructionRefFaults(
        'src3d/CLAUDE.md',
        [
          'the plan, [docs/20](../docs/archive/20-space-vectors-tool.md), is history',
          'see `docs/archive/21-572-coverage-audit.md`',
          'the log lives in docs/PROJECT-MEMORY.md',
          'live: [README](../docs/README.md), `docs/22-workflow.md`, [web](https://example.com/x.md)',
          '`docs/archive/` holds finished plans', // the folder, named: not a link to a file
        ].join('\n'),
        live,
      ),
    ).toEqual([
      'src3d/CLAUDE.md → ../docs/archive/20-space-vectors-tool.md: archived history, not an instruction',
      'src3d/CLAUDE.md → docs/archive/21-572-coverage-audit.md: archived history, not an instruction',
      'src3d/CLAUDE.md → docs/PROJECT-MEMORY.md: no such file',
    ]);
  });

  it('every link and docs path in an instruction file resolves to a live doc', () => {
    const files = instructionFiles();
    expect(files, 'the orientation files and the skill/agent/memory roots').toEqual(expect.arrayContaining(['CLAUDE.md', '.claude/memory/MEMORY.md']));
    expect(files.length, 'no instruction files found — the roots moved').toBeGreaterThan(10);
    const faults = files.flatMap((f) => instructionRefFaults(f, read(f), exists));
    expect(
      faults,
      `an instruction file points a session at a doc that is archived (history, never rules) or gone. Point it at ` +
        `the live home the archive banner names, or, where the history is the point, name it in plain text ` +
        `("the finished build plan is archived; see docs/README's archive table").`,
    ).toEqual([]);
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

/** An FR id. The workspace-wide requirement family; a doc's own family is DOCS.json `frIds.localIds`. */
const FR_ID = String.raw`FR-[A-Z]+-\d+[a-z]*`;

/**
 * Every requirement DEFINITION in `text`, id → 1-based lines. A definition is `**` + the id + ` (` (a tier:
 * `**FR-IN-4 (Must)**`, `**FR-HS-9 (Could — planned)**`) or ` —` (a title inside the bold: `**FR-IN-4d (Must) —`
 * starts with the tier, `**FR-HS-4 — WITHDRAWN`, `**R59 — …`). Everything else is a citation: `**FR-REF-1** idea`,
 * `**R13** — the open question`, `**R60 amendment`. The tier-only form `**FR-X (Tier)**` the uniqueness check
 * used to match saw 83 of docs/02's 104 definitions, so FR-IN-7d and FR-IN-9 were each defined twice unseen.
 */
const definitionsIn = (text: string, idPattern: string): Map<string, number[]> => {
  const out = new Map<string, number[]>();
  const re = new RegExp(String.raw`\*\*(${idPattern})(?= \(| —)`, 'g');
  text.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(re)) out.set(m[1], [...(out.get(m[1]) ?? []), i + 1]);
  });
  return out;
};

/** The registered requirements docs, deduplicated (the workspace and the server share 02w). */
const REQ_DOCS = [
  ...new Set(
    entries<Record<string, unknown>>(DOCS.products)
      .map(([, cfg]) => cfg.requirements as string | null)
      .filter((p): p is string => Boolean(p)),
  ),
];

describe('every FR id resolves to a definition (ADR-W-041)', () => {
  it('the definition reader sees every declaration form and no citation (negative control)', () => {
    const text = [
      '- **FR-AB-1 (Must)** — tier form',
      '- **FR-AB-2 (Must) — a title inside the bold.** text',
      '**FR-AB-3 — WITHDRAWN (2026-09-06)** text',
      '- **FR-AB-4 (Could — planned)** — text',
      'the **FR-AB-5** idea, and a plain FR-AB-6 citation',
      '**R7 — a local definition**',
      '2. **R8** — an open question that cites it',
      '**R9 amendment (2026-09-21)**',
    ].join('\n');
    expect([...definitionsIn(text, FR_ID).keys()]).toEqual(['FR-AB-1', 'FR-AB-2', 'FR-AB-3', 'FR-AB-4']);
    expect([...definitionsIn(text, String.raw`R\d+[a-z]*`).keys()]).toEqual(['R7']);
    // the duplicate the tier-only matcher could not see: one definition in each form
    expect(definitionsIn('- **FR-AB-2 (Should)** — x\n- **FR-AB-2 (Must) — y.** z', FR_ID).get('FR-AB-2')).toEqual([1, 2]);
  });

  it('cited FR ids are defined in a registered requirements doc', () => {
    expect(REQ_DOCS.length, 'no requirements docs registered').toBeGreaterThan(0);

    // A DEFINITION is the bold declaration form (`definitionsIn`); everything else is a citation.
    const defined = new Set<string>();
    for (const doc of REQ_DOCS) for (const id of definitionsIn(read(doc), FR_ID).keys()) defined.add(id);

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

  // #987 (ADR-W-050): the UNIQUENESS half. The guard above checks that a cited id RESOLVES; an id defined
  // twice resolves fine and still means two different promises — FR-SP-7 and FR-SP-8 were each defined
  // twice in 02b, and every citation of them was ambiguous while the suite reported green. An enumeration
  // checked one way and unchecked the other is the ADR-W-041 class itself. Defined at most once, across
  // every registered requirements doc together (an id is a workspace-wide name, not a per-file one).
  //
  // #1861 C4 widened it to every declaration form (`definitionsIn`) and to each doc's LOCAL id family (02c's
  // `R<n>`, DOCS.json `frIds.localIds`), where R59, R60, R61, R92 and R122 were each defined two or three times.
  // Deduplicated docs: two products may legitimately register ONE requirements doc (the workspace and the
  // shell share 02w), and a shared doc is not a doc that defines its ids twice.
  it('every requirement id is DEFINED once: FR ids across the registered docs, a local id within its doc', () => {
    const where = new Map<string, string[]>();
    const add = (doc: string, defs: Map<string, number[]>) => {
      for (const [id, lines] of defs) where.set(id, [...(where.get(id) ?? []), ...lines.map((l) => `${doc}:${l}`)]);
    };
    for (const doc of REQ_DOCS) add(doc, definitionsIn(read(doc), FR_ID));
    const local = entries<string>(DOCS.frIds.localIds);
    expect(local.length, 'DOCS.json frIds.localIds is empty').toBeGreaterThan(0);
    for (const [doc, prefix] of local) {
      const defs = definitionsIn(read(doc), String.raw`${escapeRe(prefix)}\d+[a-z]*`);
      expect(defs.size, `no ${prefix}<n> definitions in ${doc} — the definition form changed`).toBeGreaterThan(50);
      add(doc, defs);
    }
    expect(where.size, 'no FR definitions found — the definition matcher is broken').toBeGreaterThan(300);

    const duplicates = Object.fromEntries(
      [...where].filter(([, sites]) => sites.length > 1).map(([id, sites]) => [id, sites.length]),
    );
    const sites = Object.keys(duplicates).map((id) => `${id} → ${where.get(id)!.join(', ')}`);
    expect(
      duplicates,
      `requirement ids defined more than once (id → definitions; sites: ${sites.join(' · ')}). Two definitions ` +
        `under one id are two promises with one name, and every citation of that id is ambiguous. Renumber the ` +
        `NEWER definition (the older id is already cited from shipped ADRs) and update its citations in the same ` +
        `commit. Expected exactly DOCS.json frIds.duplicatesGrandfathered (emptied by #${DOCS.frIds.duplicateIssue}); ` +
        `if you FIXED one, shrink the list.`,
    ).toEqual(DOCS.frIds.duplicatesGrandfathered);
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

/** One `^#+ ADR-…` heading and what follows it, up to the next one. */
interface AdrSection {
  log: string;
  id: string;
  /** a DECLARATION (`ADR-N — title`), as opposed to an amendment or a bare wrapper heading */
  decl: boolean;
  /** the heading plus the next `n` lines — where a Status line and its stamps sit */
  block: (n: number) => string;
  body: string;
}

const sectionsOf = (log: string, text: string): AdrSection[] => {
  const lines = text.split('\n');
  const headRe = new RegExp(String.raw`^#+\s*(${ADR_ID})\b`);
  const declRe = new RegExp(String.raw`^#+\s*${ADR_ID}\s+—`);
  const heads = lines.flatMap((l, i) => {
    const m = l.match(headRe);
    return m ? [{ id: m[1], i, decl: declRe.test(l) }] : [];
  });
  return heads.map((h, k) => {
    const end = heads[k + 1]?.i ?? lines.length; // a block never reads into the next entry
    return {
      log,
      id: h.id,
      decl: h.decl,
      block: (n: number) => lines.slice(h.i, Math.min(h.i + 1 + n, end)).join('\n'),
      body: lines.slice(h.i + 1, end).join('\n'),
    };
  });
};

const LOG_TEXTS: [string, string][] = ADR_LOGS.map(([log]) => [log, read(log)]);

/**
 * A SUPERSEDED ADR POINTS TO ITS SUCCESSOR (#1861 C4, ADR-W-118).
 *
 * ADR-513 was superseded by ADR-602 and said nothing, so a session reading 513 built on a withdrawn rule. A
 * supersession is a claim the SUCCESSOR makes, so it is read off the successor's body: one of DOCS.json
 * `supersession.verbs`, then, within `window` characters with no clause break (`, ; . )` or "nothing") before
 * it, an ADR id. The clause-break rule is measured, not tidy: without it «the pass this replaces), [ADR-367]»
 * and «Supersedes nothing; extends [ADR-3D-110]» read as supersessions.
 */
const SUP = DOCS.supersession as { verbs: string[]; window: number; blockLines: number };

function supersessionTargets(body: string): string[] {
  const verb = new RegExp(String.raw`\b(?:${SUP.verbs.map(escapeRe).join('|')})\b`, 'g');
  const id = new RegExp(String.raw`${ADR_ID}\b`);
  const out: string[] = [];
  for (const m of body.matchAll(verb)) {
    const rest = body.slice(m.index! + m[0].length);
    const hit = rest.match(id);
    if (!hit || hit.index! > SUP.window) continue;
    if (/[,;.)]|\bnothing\b/.test(rest.slice(0, hit.index))) continue;
    out.push(hit[0]);
  }
  return out;
}

/** Every successor → target pair whose target's heading block carries no back-pointer. */
function supersessionFaults(logs: [string, string][]): { pairs: number; faults: string[] } {
  const sections = logs.flatMap(([log, text]) => sectionsOf(log, text));
  const declared = new Map(sections.filter((s) => s.decl).map((s) => [s.id, s]));
  const seen = new Set<string>();
  const faults: string[] = [];
  for (const s of sections) {
    for (const target of supersessionTargets(s.body)) {
      const key = `${s.id} → ${target}`;
      if (target === s.id || seen.has(key)) continue;
      seen.add(key);
      const t = declared.get(target);
      if (!t) {
        faults.push(`${key}: ${s.log} supersedes an ADR no log declares`);
        continue;
      }
      const block = t.block(SUP.blockLines);
      if (!/superseded/i.test(block) && !block.includes('⚠') && !new RegExp(String.raw`${escapeRe(s.id)}\b`).test(block)) {
        faults.push(`${key}: ${target} (${t.log}) does not say it is superseded`);
      }
    }
  }
  return { pairs: seen.size, faults };
}

describe('a superseded ADR points to its successor (#1861 C4)', () => {
  it('the claim reader finds supersessions and skips what is not one (negative control)', () => {
    expect(supersessionTargets('**Status:** accepted · **Supersedes:** [ADR-048](#adr-048) · x')).toEqual(['ADR-048']);
    expect(supersessionTargets('This **reverses ADR-211\'s background-fold choice**')).toEqual(['ADR-211']);
    expect(supersessionTargets('**Withdraws** [ADR-3D-002](#adr-3d-002) decision 1')).toEqual(['ADR-3D-002']);
    expect(supersessionTargets('**Supersedes nothing; extends [ADR-3D-110](#adr-3d-110)**')).toEqual([]);
    expect(supersessionTargets('(`withCarrierMembership`, the word-presence pass this replaces), [ADR-367](#adr-367)')).toEqual([]);
    expect(supersessionTargets('the ring in force replaces the ids at lowering, the ADR-341 rotation')).toEqual([]);
    expect(supersessionTargets('supersedes a clause that runs on for far longer than the window allows ADR-100')).toEqual([]);
  });

  it('an unstamped target is a fault, and a stamp, a ⚠ or the successor id clears it (negative control)', () => {
    const log = (status: string) => [
      'docs/x.md',
      ['## ADR-1 — the old rule', '', status, '', '## ADR-2 — the new rule', '', '**Status:** accepted · **Supersedes:** [ADR-1](#adr-1)'].join('\n'),
    ] as [string, string];
    expect(supersessionFaults([log('**Status:** accepted')]).faults).toEqual([expect.stringMatching(/^ADR-2 → ADR-1: ADR-1 .* does not say it is superseded/)]);
    expect(supersessionFaults([log('**Status:** accepted · **⚠ Superseded by [ADR-2](#adr-2) (2026-10-07):** x')]).faults).toEqual([]);
    expect(supersessionFaults([log('**Status:** accepted · amended by ADR-2')]).faults).toEqual([]);
    const orphan: [string, string] = ['docs/y.md', '## ADR-5 — x\n\n**Supersedes** [ADR-4](#adr-4)'];
    expect(supersessionFaults([orphan]).faults).toEqual([expect.stringMatching(/supersedes an ADR no log declares/)]);
  });

  it('every superseded ADR, in every log, carries a back-pointer in its heading block', () => {
    const { pairs, faults } = supersessionFaults(LOG_TEXTS);
    expect(pairs, 'no supersession claims parsed — the verb list or the log format changed').toBeGreaterThan(20);
    expect(
      faults,
      `an ADR is superseded, reversed, withdrawn or replaced by a later one and its heading block (the heading and ` +
        `the next ${SUP.blockLines} lines) says nothing. Stamp the TARGET's Status line: ` +
        `" · **⚠ Superseded by [ADR-N](#adr-n) (date):** <what changed>" — "Partly superseded" when only a clause ` +
        `goes. A session reading the old entry must learn from it that it no longer holds.`,
    ).toEqual([]);
  });
});

/**
 * AN ADR THAT NAMES A LADDER APPEARS IN IT (#1861 C4).
 *
 * docs/LADDER.md says every mechanism ADR "must state 'inserts at stage N.x' and update this file". ADR-551
 * named LADDER as its design home and LADDER had no row for it. From each log's `contractFrom` on (the ADRs
 * bound to carry a Design line), a ladder-claim field (DOCS.json `ladders.fields`) whose value does not start
 * with "none" and names a ladder file obliges that file to contain the ADR's id.
 */
const LADDERS = DOCS.ladders as { files: Record<string, string>; fields: string[] };

function ladderCitations(body: string): string[] {
  const field = new RegExp(String.raw`\*\*(?:${LADDERS.fields.map(escapeRe).join('|')})[:.]\*\*([^\n]*)`, 'g');
  const out = new Set<string>();
  for (const m of body.matchAll(field)) {
    const value = m[1].split(/\*\*[^*\n]{1,30}[:.]\*\*/)[0]; // up to the next bold field on the line
    if (/^\s*none\b/i.test(value)) continue;
    for (const name of Object.keys(LADDERS.files)) {
      if (new RegExp(String.raw`(?<![\w-])${escapeRe(name)}\.md\b|docs/${escapeRe(name)}(?![\w-])`).test(value)) out.add(name);
    }
  }
  return [...out];
}

function ladderFaults(logs: [string, string][], ladderText: (name: string) => string): { cited: number; faults: string[] } {
  let cited = 0;
  const faults: string[] = [];
  for (const [log, text] of logs) {
    const cfg = Object.fromEntries(ADR_LOGS)[log] ?? { idPrefix: '', contractFrom: 0 };
    const own = new RegExp(String.raw`^ADR-${escapeRe(cfg.idPrefix)}(\d+)$`);
    for (const s of sectionsOf(log, text)) {
      const n = s.id.match(own);
      if (!n || Number(n[1]) < cfg.contractFrom) continue;
      for (const name of ladderCitations(s.body)) {
        cited += 1;
        if (!new RegExp(String.raw`${escapeRe(s.id)}\b`).test(ladderText(name))) {
          faults.push(`${s.id} (${log}) names ${LADDERS.files[name]}, which never mentions it`);
        }
      }
    }
  }
  return { cited, faults };
}

describe('an ADR that names a ladder appears in it (#1861 C4)', () => {
  it('the citation reader takes a named file, and not a bare word or a "none" (negative control)', () => {
    expect(ladderCitations('**Design:** docs/LADDER (stage 0, the pre-ladder provers)')).toEqual(['LADDER']);
    expect(ladderCitations('**Design:** [04](04-design.md) · [LADDER](LADDER.md) stage 5')).toEqual(['LADDER']);
    expect(ladderCitations('**Ladder:** stage 0d′ ([LADDER-CX](LADDER-CX.md))')).toEqual(['LADDER-CX']);
    expect(ladderCitations('**Design:** docs/04b — the derive; LADDER unchanged')).toEqual([]);
    expect(ladderCitations('**LADDER stage:** none — pre-ladder. `docs/LADDER.md` needs no edit.')).toEqual([]);
    expect(ladderCitations('**Design:** [04](04-design.md). **LADDER stage:** parse.')).toEqual([]);
  });

  it('a cited ladder that never mentions the ADR is a fault (negative control)', () => {
    const log: [string, string] = ['docs/06-decisions.md', '## ADR-9000 — x\n\n**Design:** [LADDER](LADDER.md) stage 0'];
    expect(ladderFaults([log], () => 'no rows here').faults).toEqual([expect.stringMatching(/^ADR-9000 .* names docs\/LADDER\.md, which never mentions it/)]);
    expect(ladderFaults([log], () => '| 0z | the prover ([ADR-9000](06-decisions.md#adr-9000)) |').faults).toEqual([]);
  });

  it('every ladder an ADR names lists that ADR', () => {
    for (const p of Object.values(LADDERS.files)) expect(exists(p), `${p} is missing`).toBe(true);
    const { cited, faults } = ladderFaults(LOG_TEXTS, (name) => read(LADDERS.files[name]));
    expect(cited, 'no ladder citations parsed — the field list or the log format changed').toBeGreaterThan(20);
    expect(
      faults,
      `these ADRs name a ladder as where their mechanism lives, and the ladder has no row for them. Add the row ` +
        `at the stage the ADR names, after reading the code it describes (the ladder is the ORDER the mechanisms ` +
        `fire in), or correct the ADR's Design line if it never touched the ladder.`,
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

/**
 * A COMMITTED CONFLICT MARKER IS A CORRUPTED DOCUMENT (2026-09-17).
 *
 * `docs/02c-requirements-analytic.md` shipped to production at `prod/2026-09-17-2` carrying three
 * live `<<<<<<<` / `=======` / `>>>>>>>` lines: a fix round's staging merge resolved two doc tails by
 * script and the third file's markers were never removed. **Every other gate stayed green** — the
 * size ceilings, the registry, the FR resolution, the ADR contract — because none of them reads a
 * document as prose, and a docs-only push runs no CI lane at all.
 *
 * Cheap, total, and it cannot be argued with: a tracked text file may not contain a merge marker.
 * Anchored to the LINE START, because `=======` is also a legitimate Markdown setext rule and
 * `>>>>>>>` can open a blockquote — only the seven-character marker at column zero is the defect.
 */
describe('no committed merge conflict markers', () => {
  const MARKER = /^(?:<{7} |={7}$|>{7} )/m;
  const scan = ['docs', 'deploy'].flatMap((dir) => {
    const base = path.join(ROOT, dir);
    if (!fs.existsSync(base)) return [];
    const walk = (d: string): string[] =>
      fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(d, e.name);
        if (e.isDirectory()) return walk(full);
        return /\.(md|json|ya?ml|conf|html)$/.test(e.name) ? [full] : [];
      });
    return walk(base);
  });
  const roots = ['CLAUDE.md', 'DOCS.json', 'BOUNDARIES.json', 'products.json']
    .map((f) => path.join(ROOT, f))
    .filter((f) => fs.existsSync(f));

  it('the scan is not vacuous', () => {
    expect(scan.length + roots.length).toBeGreaterThan(20);
  });

  it.each([...scan, ...roots])('%s', (file) => {
    const text = fs.readFileSync(file, 'utf8');
    const line = text.split(/\r?\n/).findIndex((l) => MARKER.test(l));
    expect(
      line,
      `${path.relative(ROOT, file)} carries a merge conflict marker at line ${line + 1}. ` +
        `A resolved merge leaves none; this file was committed mid-conflict.`,
    ).toBe(-1);
  });
});
