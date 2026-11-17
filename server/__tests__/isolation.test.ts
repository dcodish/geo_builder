/**
 * Product-isolation guard (ADR-266, generalized by ADR-W-003; the docs/20 §12 rule made mechanical).
 *
 * The workspace hosts several products as sibling apps. The operator-authority rule is that product
 * source trees NEVER import from each other — patterns are COPIED, not shared — so a change in one
 * product cannot break another.
 *
 * This test states NOTHING itself: it reads `BOUNDARIES.json`, which is the authoritative map. A
 * registry and a test that restate each other drift, and after they drift the rule is held by
 * interpretation again. Adding a product or an edge means editing the manifest, not this file.
 *
 * It lives in server/__tests__ because the shared-server tests run in EVERY per-product CI lane, so
 * a violating import added in any product fails its own lane.
 *
 * Note the trap this closes: tsconfig maps `@/*` → `src/*` repo-wide, so a stray `@/` import inside
 * a tree forbidden from `src/` would typecheck and even resolve under the shared vitest config —
 * silently coupling the products. Alias specifiers are checked against the same forbidden edges.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');

type Edge = { from: string; to: string; why: string };
type Manifest = {
  layers: Record<string, unknown>;
  trees: Record<string, { product: string; label: string; adrLog: string }>;
  aliases: Record<string, string>;
  imports: { allowed: Edge[]; forbidden: Edge[] };
  exemptDirs: Record<string, string>;
  classification: Record<string, string>;
};

/** Strip the `$comment` keys used for documentation inside the manifest. */
function withoutComments<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([k]) => k !== '$comment')) as T;
}

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'BOUNDARIES.json'), 'utf8')) as Manifest;
const TREES = Object.keys(withoutComments(manifest.trees));
const LAYERS = Object.keys(withoutComments(manifest.layers));
const EXEMPT = new Set(Object.keys(withoutComments(manifest.exemptDirs)));
const CLASSIFICATION = withoutComments(manifest.classification);

/** Recursively collect .ts/.tsx source files under a directory. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__snapshots__') continue;
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Every directory under `tree`, as repo-relative posix paths, including the tree root itself. */
function directories(tree: string): string[] {
  const out: string[] = [tree];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || EXEMPT.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      out.push(path.relative(ROOT, full).split(path.sep).join('/'));
      walk(full);
    }
  };
  walk(path.join(ROOT, tree));
  return out;
}

/** All import/require specifiers in a file (static, dynamic, and re-exports). */
function importSpecifiers(file: string): string[] {
  return specifiersOf(fs.readFileSync(file, 'utf8'));
}

/** The specifiers of a source text (split out so the leaf rule's negative control can feed it a fake file). */
function specifiersOf(text: string): string[] {
  const specs: string[] = [];
  const re = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g;
  for (let m = re.exec(text); m; m = re.exec(text)) specs.push(m[1]);
  return specs;
}

/** Does `spec`, written in `file`, reach into the tree `to`? Relative, alias, or bare path. */
function reachesInto(file: string, spec: string, to: string): boolean {
  const target = path.join(ROOT, to);
  if (spec.startsWith('.')) {
    const resolved = path.resolve(path.dirname(file), spec);
    return resolved === target || resolved.startsWith(target + path.sep);
  }
  for (const [alias, aliasTree] of Object.entries(withoutComments(manifest.aliases))) {
    if (aliasTree !== to) continue;
    const bare = alias.replace(/\/$/, '');
    if (spec === bare || spec.startsWith(alias)) return true;
  }
  // A bare specifier naming the tree as its first segment (e.g. "src3d/engine/…").
  return spec === to || spec.startsWith(to + '/');
}

function violations(edge: Edge): string[] {
  const found: string[] = [];
  for (const file of sourceFiles(path.join(ROOT, edge.from))) {
    for (const spec of importSpecifiers(file)) {
      if (reachesInto(file, spec, edge.to)) {
        found.push(`${path.relative(ROOT, file).split(path.sep).join('/')} -> ${spec}`);
      }
    }
  }
  return found;
}

describe('product boundaries (BOUNDARIES.json is the authority)', () => {
  it('the manifest is well-formed and non-vacuous', () => {
    expect(TREES.length, 'no trees declared').toBeGreaterThan(1);

    for (const tree of TREES) {
      expect(fs.existsSync(path.join(ROOT, tree)), `declared tree ${tree} is missing`).toBe(true);
    }
    for (const edge of [...manifest.imports.allowed, ...manifest.imports.forbidden]) {
      expect(TREES, `edge ${edge.from}->${edge.to} names an undeclared tree`).toContain(edge.from);
      expect(TREES, `edge ${edge.from}->${edge.to} names an undeclared tree`).toContain(edge.to);
      expect(edge.why?.length, `edge ${edge.from}->${edge.to} has no rationale`).toBeGreaterThan(20);
    }
    for (const [dir, layer] of Object.entries(CLASSIFICATION)) {
      expect(LAYERS, `${dir} is classified as unknown layer "${layer}"`).toContain(layer);
    }
    for (const target of Object.values(withoutComments(manifest.aliases))) {
      expect(TREES, `alias points at undeclared tree ${target}`).toContain(target);
    }
  });

  it.each(manifest.imports.forbidden)(
    'forbidden: $from must not import from $to',
    (edge: Edge) => {
      expect(violations(edge), edge.why).toEqual([]);
    },
  );

  it('every directory in every tree carries a layer classification', () => {
    const unclassified: string[] = [];
    for (const tree of TREES) {
      for (const dir of directories(tree)) {
        if (!(dir in CLASSIFICATION)) unclassified.push(dir);
      }
    }
    expect(
      unclassified,
      'unclassified directories. Classify each in BOUNDARIES.json: "engine" if it reasons about ' +
        'points/lines/planes/DOF/constraints, "lexicon" if it names vocabulary or maps a noun to a ' +
        'shape, otherwise "shell". If you are creating it because the sibling tree has one like it, ' +
        'that is the copy tripwire (docs/17 §2) — classify before copying.',
    ).toEqual([]);
  });

  it('the documented sharing points are real, not aspirational', () => {
    // An "allowed" edge records a DELIBERATE coupling (the shared proxy binding both apps' prompts).
    // If the coupling disappears, the manifest must say so rather than keep advertising it.
    for (const edge of manifest.imports.allowed) {
      expect(
        violations(edge).length,
        `BOUNDARIES.json documents ${edge.from} -> ${edge.to} as a deliberate sharing point, but no ` +
          `such import exists. Remove the entry rather than leaving the manifest describing a ` +
          `coupling the code no longer has.`,
      ).toBeGreaterThan(0);
    }
  });
});

/**
 * #2766 ([ADR-W-220](../../docs/06w-decisions-workspace.md#adr-w-220)) — PLANE-GEOMETRY LANGUAGE IS SHARED, ENGINES
 * STAY PER PRODUCT. The lexicon layer's sharing is decided: the vocabulary lives once, in the home tree the manifest
 * names, and every plane builder reads it from there. Three properties make that a rule rather than a folder:
 *  - the home is a LEAF — a file in it imports nothing outside it, so it can never reach a product, the server or
 *    chrome, and a product's parser and engine may both read it without depending on each other (ADR-3D-188's
 *    rule for src3d/lexicon, generalized);
 *  - vocabulary has ONE home — a lexicon directory elsewhere is listed in `productLocal` with its reason, and a plane
 *    builder holds none (its words belong in the home, or the three copies grow back);
 *  - the sharing is real — every plane builder imports the home (the manifest never advertises a sharing the code
 *    lost).
 */
describe('the shared plane-geometry lexicon (ADR-W-220, #2766)', () => {
  type LexiconLayer = {
    sharing: string;
    home: string;
    productLocal: Record<string, string>;
    planeTrees: string[];
  };
  const layer = (manifest.layers as Record<string, LexiconLayer>).lexicon;
  const HOME = layer.home;
  const homeAbs = path.join(ROOT, HOME);
  const inHome = (abs: string) => abs === homeAbs || abs.startsWith(homeAbs + path.sep);

  /** The specifiers of `text` (a file living at `file`) that leave the home: anything not resolving inside it. */
  function leavesHome(file: string, text: string): string[] {
    return specifiersOf(text).filter((spec) => !spec.startsWith('.') || !inHome(path.resolve(path.dirname(file), spec)));
  }

  it('the layer is decided — shared, with a declared home classified lexicon', () => {
    expect(layer.sharing).toBe('shared');
    expect(fs.existsSync(homeAbs), `the lexicon home ${HOME} is missing`).toBe(true);
    expect(CLASSIFICATION[HOME]).toBe('lexicon');
    for (const t of layer.planeTrees) expect(TREES, `planeTrees names undeclared tree ${t}`).toContain(t);
  });

  it('the home is a leaf: it imports nothing outside itself', () => {
    const files = sourceFiles(homeAbs).filter((f) => !f.split(path.sep).includes('__tests__'));
    expect(files.length, 'the home holds no source — the scan would be vacuous').toBeGreaterThan(10);
    const out = files.flatMap((f) =>
      leavesHome(f, fs.readFileSync(f, 'utf8')).map((s) => `${path.relative(ROOT, f).split(path.sep).join('/')} -> ${s}`),
    );
    expect(out, 'a lexicon file names words; what it needs from elsewhere belongs in the caller, not here').toEqual([]);
  });

  it('the leaf rule can fail (negative control)', () => {
    const fake = path.join(homeAbs, 'fake.ts');
    expect(leavesHome(fake, "import { x } from './glyphFold';")).toEqual([]);
    expect(leavesHome(fake, "import { fmtNum } from '../format';")).toEqual(['../format']);
    expect(leavesHome(fake, "import { LABEL } from '../../src/parser/parse';")).toEqual(['../../src/parser/parse']);
    expect(leavesHome(fake, "import x from 'i18next';")).toEqual(['i18next']);
  });

  it('vocabulary has one home: every other lexicon directory is listed with its reason, and none sits in a plane builder', () => {
    const local = withoutComments(layer.productLocal);
    const stray = Object.entries(CLASSIFICATION)
      .filter(([dir, l]) => l === 'lexicon' && dir !== HOME && !dir.startsWith(HOME + '/') && !(dir in local))
      .map(([dir]) => dir);
    expect(stray, `a lexicon directory outside ${HOME}: move its words into the home, or list it in productLocal`).toEqual([]);
    for (const [dir, why] of Object.entries(local)) {
      expect(CLASSIFICATION[dir], `productLocal ${dir} is not classified lexicon`).toBe('lexicon');
      expect(why.length, `productLocal ${dir} has no reason`).toBeGreaterThan(20);
      const tree = layer.planeTrees.find((t) => dir === t || dir.startsWith(t + '/'));
      expect(tree, `${dir} is plane-builder vocabulary kept outside the home`).toBeUndefined();
    }
  });

  it('the sharing is real: every plane builder reads the home', () => {
    for (const tree of layer.planeTrees) {
      const n = sourceFiles(path.join(ROOT, tree)).filter((f) =>
        importSpecifiers(f).some((s) => s.startsWith('.') && inHome(path.resolve(path.dirname(f), s))),
      ).length;
      expect(n, `${tree} imports nothing from ${HOME} — the manifest advertises a sharing the code lost`).toBeGreaterThan(0);
    }
  });
});

describe('the product registry (products.json) matches the manifest (#661 / ADR-W-021)', () => {
  interface RegistryEntry {
    id: string;
    labelKey: string;
    icon: string;
    url: string;
    devUrl: string;
    tree: string;
    buildTarget: string;
    enabled: boolean;
  }
  const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'products.json'), 'utf8')) as {
    products: RegistryEntry[];
  };
  const products = registry.products;
  // A PRODUCT tree serves students. The shared server and the shell/ chrome are declared trees but
  // not products — they must never appear in a student-facing switcher.
  const productTrees = Object.entries(withoutComments(manifest.trees))
    .filter(([, meta]) => !['server', 'workspace'].includes(meta.product))
    .map(([tree]) => tree);

  it('is well-formed and non-vacuous', () => {
    expect(products.length, 'empty registry').toBeGreaterThan(1);
    for (const key of ['id', 'tree', 'url', 'devUrl', 'labelKey', 'buildTarget'] as const) {
      const values = products.map((p) => p[key]);
      expect(new Set(values).size, `duplicate ${key} in products.json`).toBe(values.length);
      for (const v of values)
        expect(typeof v === 'string' && v.length > 0, `${key} must be a non-empty string`).toBe(true);
    }
    for (const p of products) {
      expect(p.url.startsWith('/'), `${p.id}.url must be an absolute path`).toBe(true);
      expect(p.devUrl.startsWith('/'), `${p.id}.devUrl must be an absolute path`).toBe(true);
      expect(typeof p.enabled, `${p.id}.enabled must be boolean`).toBe('boolean');
    }
  });

  it('every product tree has a registry entry, and every entry names a declared product tree', () => {
    expect(
      products.map((p) => p.tree).sort(),
      'the bijection is the point: a registered tree with no roster entry fails, so builder N+1 ' +
        'cannot ship missing from the switcher — and a roster entry for a tree that does not ' +
        'exist fails the other way.',
    ).toEqual([...productTrees].sort());
  });

  it('every buildTarget is a real npm script', () => {
    const scripts = (
      JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
        scripts: Record<string, string>;
      }
    ).scripts;
    for (const p of products)
      expect(
        scripts[p.buildTarget],
        `${p.id}'s buildTarget "${p.buildTarget}" is not an npm script`,
      ).toBeDefined();
  });
});
