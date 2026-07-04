/**
 * Single source of truth mapping each detected {@link ShapeType} to its page in the geometry book on
 * the same domain (`themathbible.com`). The shape-badge popup ([FR-SH](docs/02-requirements.md),
 * [FR-REF-1](docs/02-requirements.md)) links here so a student can read the shape's definition,
 * properties and theorems in context. Versioned with the app — if the book's slugs change, update
 * this table (the book and the app share the bagrut geometry numbering, `571`).
 *
 * Display names + one-line definitions live in i18n under `shapes.name.<type>` / `shapes.def.<type>`
 * (the {@link ShapeType} string IS the i18n leaf key), so this file stays UI-string-free.
 */

import type { ShapeType } from '@/engine/detectShapes';

const BOOK_BASE = 'https://themathbible.com/bagrut/5-yehidot/571/geometry/';

/** Book-page slug per shape type (under {@link BOOK_BASE}). Discovered from the `…/571/geometry` index. */
export const SHAPE_BOOK_SLUG: Record<ShapeType, string> = {
  kite: 'dalton',
  parallelogram: 'makbiliyot',
  rhombus: 'maavein',
  rectangle: 'malben',
  square: 'ribua',
  trapezoid: 'trapez-klali',
  'isosceles-trapezoid': 'trapez-shave-shokaim',
  'right-trapezoid': 'trapez-yashar-zavit',
  triangle: 'meshulash-mishpatim-yesodiyim',
  'isosceles-triangle': 'meshulash-shave-shokaim',
  'equilateral-triangle': 'meshulash-shave-tzlaot',
  'right-triangle': 'meshulash-yashar-zavit',
  // No dedicated book page for a right isosceles triangle → link to the right-triangle page
  // (משולש ישר זווית), per the operator's choice (a right-and-isosceles triangle reads there).
  'right-isosceles-triangle': 'meshulash-yashar-zavit',
  // A 30-60-90 is a right triangle → same right-triangle book page (where #33/#34 live).
  '30-60-90-triangle': 'meshulash-yashar-zavit',
  circle: 'hamaagl-mugamim',
};

/** Full URL of the geometry-book page for a shape type. */
export const bookUrl = (type: ShapeType): string => BOOK_BASE + SHAPE_BOOK_SLUG[type];
