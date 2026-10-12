/**
 * #1778 ([ADR-W-125](../../../docs/06w-decisions-workspace.md#adr-w-125)) — A PASTED PARAGRAPH BECOMES ONE ROW
 * PER SENTENCE, IN EVERY BUILDER — the shared rows, written per docs/04w "How a cross-product wiring guard is
 * written" (ADR-W-071).
 *
 * The operator, 2026-10-05: **"split into rows"** — each sentence its own row, one given per row, and the
 * student retypes nothing. The split itself is `shell/sentences`; what this guards is that each builder's
 * SUBMIT SEAM actually runs a paste through it, with its own one-sentence submit, in order:
 *
 * - `src/app/__tests__/paste-paragraph-1778.test.ts` — 2-D, through `runSubmit` (the pipeline the input box
 *   calls; the model mocked to answer nothing);
 * - `src-analytic/__tests__/paste-paragraph-1778.test.ts` — analytic, `submitTyped` over `decideSubmit` +
 *   `sentenceOutcome`, the functions `App.tsx` dispatches;
 * - `src3d/__tests__/paste-paragraph-1778.test.ts` — 3-D, `submitTyped` over `decideDeterministic3` and the
 *   store's `dispatchVerdict`;
 * - `src-complex/__tests__/paste-paragraph-1778.test.ts` — complex, `submitTyped` over `submitLine`;
 * - `shell/__tests__/paste-paragraph-meta-1778.test.ts` — the meta-lock: the same checks against broken runners.
 */
import { describe, expect, it } from 'vitest';

export type PasteProduct = '2d' | 'analytic' | '3d' | 'complex';

/** What one paste did: the rows it ADDED, as their row text, and what the input box holds afterwards. */
export interface PasteResult {
  rows: readonly string[];
  box: string;
}

/**
 * On an EMPTY canvas, submit each `setup` line on its own (each must be taken), then submit `paste` exactly as
 * the input box would, through the product's real submit seam. Answer the rows the paste added and the box.
 */
export type PasteRunner = (setup: readonly string[], paste: string) => Promise<PasteResult>;

export interface PasteRow {
  id: string;
  what: string;
  products: readonly PasteProduct[];
  setup: readonly string[];
  paste: string;
  rows: readonly string[];
  box: string;
}

const LRM = '‎';
const PLANE: readonly PasteProduct[] = ['2d', 'analytic', '3d'];

export const PASTE_ROWS: readonly PasteRow[] = [
  {
    id: 'P1',
    what: 'two sentences become two rows, in order, and the box empties',
    products: PLANE,
    setup: [],
    paste: 'משולש ABC. M אמצע BC.',
    rows: ['משולש ABC', 'M אמצע BC'],
    box: '',
  },
  {
    id: 'P2',
    what: 'a paste copied from an exam, with its invisible direction marks around every token',
    products: PLANE,
    setup: [],
    paste: `משולש ${LRM}ABC${LRM}. ${LRM}M${LRM} אמצע ${LRM}BC${LRM}.`,
    rows: ['משולש ABC', 'M אמצע BC'],
    box: '',
  },
  {
    id: 'P3',
    what: 'a sentence the builder does not take stops the chain: the rows before it stay, the box holds it and the rest',
    products: PLANE,
    setup: [],
    paste: 'משולש ABC. שלום לכולם. M אמצע BC.',
    rows: ['משולש ABC'],
    box: 'שלום לכולם. M אמצע BC.',
  },
  {
    id: 'P4',
    what: 'the second sentence reads the figure the first built — «האנך» is the perpendicular just drawn',
    products: ['analytic'],
    setup: ['A(0,0)', 'B(4,2)', 'P(1,3)'],
    paste: `האנך מהנקודה ${LRM}P${LRM} לישר ${LRM}AB${LRM}. האנך חותך את הישר ${LRM}y = 7${LRM} בנקודה ${LRM}C${LRM}.`,
    rows: ['האנך מהנקודה P לישר AB', 'האנך חותך את הישר y = 7 בנקודה C'],
    box: '',
  },
  {
    id: 'P5',
    what: 'a taught imperative (ADR-W-030) stops the chain with its canonical in the box, followed by the rest',
    products: ['analytic'],
    setup: ['A(0,0)', 'B(4,2)', 'P(1,3)'],
    paste: 'מעבירים אנך מהנקודה P לישר AB. האנך חותך את הישר y = 7 בנקודה C.',
    rows: [],
    box: 'אנך מהנקודה P לישר AB. האנך חותך את הישר y = 7 בנקודה C.',
  },
  {
    id: 'P6',
    what: 'pressing Enter on what P5 left builds both rows',
    products: ['analytic'],
    setup: ['A(0,0)', 'B(4,2)', 'P(1,3)'],
    paste: 'אנך מהנקודה P לישר AB. האנך חותך את הישר y = 7 בנקודה C.',
    rows: ['אנך מהנקודה P לישר AB', 'האנך חותך את הישר y = 7 בנקודה C'],
    box: '',
  },
  {
    id: 'C1',
    what: 'two complex givens become two rows; a decimal point is not a sentence end',
    products: ['complex'],
    setup: [],
    paste: 'z = 2.5 + i. w = 1 - i.',
    rows: ['z = 2.5 + i', 'w = 1 - i'],
    box: '',
  },
  {
    id: 'C2',
    what: 'a sentence the builder does not take stops the chain',
    products: ['complex'],
    setup: [],
    paste: 'z = 1 + i. שלום לכולם. w = 2 - i.',
    rows: ['z = 1 + i'],
    box: 'שלום לכולם. w = 2 - i.',
  },
  {
    id: 'S2',
    what: 'a paste carrying a claim to prove reaches the builder WHOLE and is refused whole, as ADR-W-107 rules',
    products: PLANE,
    setup: [],
    paste: 'משולש ABC. הוכיחו כי AB = AC.',
    rows: [],
    box: 'משולש ABC. הוכיחו כי AB = AC.',
  },
  {
    id: 'S1',
    what: 'one sentence with a final dot is ONE sentence — it is submitted as typed, never split',
    products: ['2d', 'analytic', '3d', 'complex'],
    setup: [],
    paste: 'שלום לכולם.',
    rows: [],
    box: 'שלום לכולם.',
  },
];

/** Every fault the runner shows on one row; empty when the product does what the row says. */
export async function pasteFaults(row: PasteRow, run: PasteRunner): Promise<string[]> {
  const got = await run(row.setup, row.paste);
  const faults: string[] = [];
  if (JSON.stringify(got.rows) !== JSON.stringify(row.rows)) faults.push(`${row.id}: rows ${JSON.stringify(got.rows)}, expected ${JSON.stringify(row.rows)}`);
  if (got.box !== row.box) faults.push(`${row.id}: box «${got.box}», expected «${row.box}»`);
  return faults;
}

/** The thin lock's body: every row that names `product`, through its runner. */
export function pasteSuite(product: PasteProduct, run: PasteRunner): void {
  describe(`#1778 — a pasted paragraph, one row per sentence (${product})`, () => {
    for (const row of PASTE_ROWS.filter((r) => r.products.includes(product))) {
      it(`${row.id}: ${row.what}`, async () => {
        expect(await pasteFaults(row, run)).toEqual([]);
      });
    }
  });
}
