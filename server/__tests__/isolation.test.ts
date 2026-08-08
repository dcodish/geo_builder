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
  const text = fs.readFileSync(file, 'utf8');
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
