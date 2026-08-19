/**
 * #738 + #739 — the under-canvas row is STANDARDIZED across the builders (operator, 2026-08-18:
 * "we need to make them as much as possible the same").
 *
 * Three rulings, mechanically held:
 *  - ONE wording for the alternatives button — «הציגו תצורה אחרת» — in every product, and the
 *    retired variants («אפשרות נוספת», «הצג אפשרות אחרת») may not reappear anywhere user-facing.
 *    Three products had grown THREE different labels for the same action; that drift is the defect.
 *  - The row carries only what every builder has (alternatives + undo/redo/clear). Product-specific
 *    DISPLAY options live in the נתונים panel: 2-D's analysis buttons and checkboxes (#738), 3-D's
 *    distance-witness toggle (#739 — reverses its B6-follow-up placement on the row).
 *  - Complex's clear-all sits on the row like everyone's, not on the fact-list footer.
 *
 * Source-scan locks (the import-direction/isolation pattern): the Apps are not rendered here — the
 * zones' SOURCE ORDER inside each App file is asserted first, so a refactor that reorders the zone
 * props fails with a clear message instead of silently mis-slicing the regions.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
/** BOM-tolerant read — a Windows editor's BOM must not turn into a JSON.parse crash here. */
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/^﻿/, '');

/** The one wording (he) and its en mirror. */
const WORDING = 'הציגו תצורה אחרת';
const WORDING_EN = 'Show another configuration';
/** Retired variants — assembled from parts so THIS file never matches its own needles. */
const RETIRED = ['אפשרות' + ' נוספת', 'הצג אפשרות' + ' אחרת'];

/** Assert the marker appears exactly once; return its index. */
function only(src: string, marker: string, file: string): number {
  const first = src.indexOf(marker);
  expect(first, `${file} must contain «${marker}»`).toBeGreaterThanOrEqual(0);
  expect(src.indexOf(marker, first + 1), `«${marker}» must be UNIQUE in ${file} for the region locks`).toBe(-1);
  return first;
}

/** Every value of the given key, anywhere in a parsed JSON tree. */
function valuesOfKey(node: unknown, key: string, out: string[] = []): string[] {
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === key && typeof v === 'string') out.push(v);
      valuesOfKey(v, key, out);
    }
  }
  return out;
}

function* walk(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules') continue;
      yield* walk(p);
    } else if (/\.(ts|tsx|json)$/.test(e.name) && e.name !== 'row-parity.test.ts') {
      // this file's own header NAMES the retired wordings — the one legitimate carrier
      yield p;
    }
  }
}

describe('#739 — ONE wording for the alternatives button', () => {
  it('2-D and 3-D locales label it «הציגו תצורה אחרת» / the en mirror', () => {
    for (const rel of ['src/i18n/locales/he.json', 'src3d/i18n/locales/he.json']) {
      const vals = valuesOfKey(JSON.parse(read(rel)), 'another');
      expect(vals.length, `${rel} must have an "another" action`).toBeGreaterThan(0);
      for (const v of vals) expect(v, rel).toBe(WORDING);
    }
    for (const rel of ['src/i18n/locales/en.json', 'src3d/i18n/locales/en.json']) {
      for (const v of valuesOfKey(JSON.parse(read(rel)), 'another')) expect(v, rel).toBe(WORDING_EN);
    }
  });

  it('the complex builder names it identically (he + en)', () => {
    const src = read('src-complex/i18n/index.ts');
    const labels = [...src.matchAll(/anotherConfig:\s*'([^']+)'/g)].map((m) => m[1]);
    expect(new Set(labels), 'he and en entries').toEqual(new Set([WORDING, WORDING_EN]));
  });

  it('the retired wordings are GONE from every user-facing tree', () => {
    for (const tree of ['src', 'src3d', 'src-complex', 'shell']) {
      for (const file of walk(path.join(ROOT, tree))) {
        const src = fs.readFileSync(file, 'utf8');
        for (const needle of RETIRED) {
          expect(src.includes(needle), `${path.relative(ROOT, file)} still says «${needle}»`).toBe(false);
        }
      }
    }
  });
});

describe('#738 — the 2-D analysis buttons and display toggles live in the נתונים panel', () => {
  const FILE = 'src/App.tsx';
  const src = read(FILE);
  const canvas = only(src, 'canvasZone={', FILE);
  const input = only(src, 'inputZone={', FILE);
  const data = only(src, 'dataZone={', FILE);

  it('the zone props keep their source order (the region locks depend on it)', () => {
    expect(canvas, 'canvasZone before inputZone').toBeLessThan(input);
    expect(input, 'inputZone before dataZone').toBeLessThan(data);
  });

  it('the analysis buttons and the checkboxes render AFTER the dataZone marker', () => {
    for (const m of ["t('actions.viewRelations')", "t('shapes.detect')", 'setShowMeasures(e.target.checked)']) {
      expect(only(src, m, FILE), `${m} belongs to the panel`).toBeGreaterThan(data);
    }
  });

  it('the under-canvas region carries no checkbox and no analysis button', () => {
    const region = src.slice(canvas, input);
    expect(region.includes('type="checkbox"'), 'a checkbox on the row').toBe(false);
    expect(region.includes('actions.viewRelations') || region.includes('shapes.detect'), 'an analysis button on the row').toBe(false);
  });
});

describe('#739 — the 3-D distance-witness toggle lives in the נתונים panel', () => {
  const FILE = 'src3d/App3.tsx';
  const src = read(FILE);
  const canvas = only(src, 'canvasZone={', FILE);
  const data = only(src, 'dataZone={', FILE);

  it('the zone props keep their source order', () => {
    expect(canvas, 'canvasZone before dataZone').toBeLessThan(data);
  });

  it('the toggle renders after the dataZone marker, not on the row', () => {
    const witness = only(src, "t('display.witnesses')", FILE);
    expect(witness, 'the witness toggle belongs to the panel').toBeGreaterThan(data);
    expect(src.slice(canvas, data).includes('display.witnesses'), 'the row must not carry it').toBe(false);
  });
});

describe('#742 / ADR-W-024 — the canvas chrome is contracted', () => {
  it('ONE empty-state copy: title and hint identical in every builder (he)', () => {
    const TITLE = 'מה בונים היום?';
    const HINT = 'לחצו נתון לדוגמה — או הקלידו משלכם, והציור ייבנה מולכם';
    const he2d = JSON.parse(read('src/i18n/locales/he.json'));
    expect(he2d.canvas.emptyTitle, '2-D title').toBe(TITLE);
    expect(he2d.canvas.emptyHint, '2-D hint').toBe(HINT);
    const he3d = JSON.parse(read('src3d/i18n/locales/he.json'));
    expect(valuesOfKey(he3d, 'emptyTitle'), '3-D title').toContain(TITLE);
    expect(valuesOfKey(he3d, 'emptyHintChips'), '3-D hint').toContain(HINT);
    const cx = read('src-complex/i18n/index.ts');
    expect(cx.includes(`emptyTitle: '${TITLE}'`), 'complex title').toBe(true);
    expect(cx.includes(`emptyHintChips: '${HINT}'`), 'complex hint').toBe(true);
  });

  it('every canvas renders the SHARED corner cluster (imports the shell contract)', () => {
    for (const rel of ['src/render/Figure.tsx', 'src3d/render/Figure3.tsx', 'src-complex/App.tsx']) {
      const src = read(rel);
      expect(src.includes('canvasClusterStyle') && src.includes('canvasCtrlStyle'), `${rel} carries the cluster`).toBe(true);
    }
  });

  it('the image exports live in the TOP TOOL ROW, in every builder — never on the canvas toolbar', () => {
    // 2-D: the renderer no longer knows exports exist; App renders them among the ToolButtons
    // (before the Workbench in source — the AppFrame's utility row).
    const fig = read('src/render/Figure.tsx');
    // code markers, not words — comments may (and do) reference where the exports went
    expect(fig.includes('navigator.clipboard') || fig.includes('toBlob('), 'Figure must not carry export code').toBe(false);
    const app2d = read('src/App.tsx');
    expect(app2d.includes('copyImageTop'), '2-D copy handler exists').toBe(true);
    expect(app2d.indexOf("t('canvas.copyImage')"), '2-D copy button in the tool row').toBeLessThan(app2d.indexOf('<Workbench'));
    for (const rel of ['src3d/App3.tsx', 'src-complex/App.tsx']) {
      const src = read(rel);
      expect(src.includes('onCopyImage') || src.includes('copyImage'), `${rel} has the copy export`).toBe(true);
      expect(src.includes('rasterCanvas'), `${rel} rasterises its own canvas`).toBe(true);
    }
  });

  it('the 2-D row renders ALWAYS — disabled, never hidden (the other builders already did)', () => {
    const src = read('src/App.tsx');
    expect(src.includes('the row renders ALWAYS'), 'the #742 ruling marker').toBe(true);
    expect(src.includes('{facts.length > 0 && (\n          <div style={figureActions}>'), 'the old facts-gate').toBe(false);
  });
});

describe('#743 — the row is ONE look: every builder consumes the shell style contract', () => {
  it('the contract module exists with the seeded 2-D look', () => {
    const src = read('shell/frame/figureRow.ts');
    for (const m of ['figureRowStyle', 'rowAccentStyle', 'rowSubtleStyle', 'rowSpacerStyle', 'rowDangerInk']) {
      expect(src.includes(`export const ${m}`), m).toBe(true);
    }
  });

  it('all three rows import it — no product paints its own row buttons', () => {
    for (const rel of ['src/App.tsx', 'src3d/App3.tsx', 'src-complex/App.tsx']) {
      const src = read(rel);
      expect(src.includes("shell/frame/figureRow'"), `${rel} consumes the contract`).toBe(true);
      expect(src.includes('rowAccentStyle') || src.includes('= rowAccentStyle'), `${rel} uses the accent`).toBe(true);
    }
  });
});

describe('#744 — the consuming app owns the ONE font stack, form controls included', () => {
  it('complex and 2-D both carry the form-control inherit rule (3-D gets it from Tailwind preflight)', () => {
    for (const rel of ['src-complex/styles.css', 'src/index.css']) {
      const css = read(rel).replace(/\s+/g, ' ');
      expect(/(input|button)[^{}]*\{[^}]*font-family:\s*inherit/.test(css), `${rel} form controls inherit the font`).toBe(true);
    }
  });
});

describe('#739 — the complex clear-all sits on the row, not the fact-list footer', () => {
  const FILE = 'src-complex/App.tsx';
  const src = read(FILE);
  const footer = only(src, 'footer={', FILE);
  const canvas = only(src, 'canvasZone={', FILE);
  const actions = only(src, 'figure-actions', FILE);
  const data = only(src, 'dataZone={', FILE);

  it('the zone props keep their source order', () => {
    expect(footer, 'footer before canvasZone').toBeLessThan(canvas);
    expect(canvas, 'canvasZone before its actions row').toBeLessThan(actions);
    expect(actions, 'the actions row before dataZone').toBeLessThan(data);
  });

  it('clear-all renders once, on the figure-actions row', () => {
    const clear = only(src, "t('clearAll')", FILE);
    expect(clear, 'after the row opens').toBeGreaterThan(actions);
    expect(clear, 'before the dataZone').toBeLessThan(data);
    expect(src.slice(footer, canvas).includes('clearAll'), 'the footer must not carry it').toBe(false);
  });
});
