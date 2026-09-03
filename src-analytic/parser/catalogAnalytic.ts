/**
 * The analytic tool's command catalog (docs/19 §10, ADR-AG-005 D8) — three things at once:
 *
 *  1. the **user-facing reference** that drives the in-app commands panel,
 *  2. the **coverage map** — a guard test re-parses every entry in Hebrew AND English, so an entry
 *     that stops parsing fails the suite rather than quietly becoming documentation,
 *  3. **the only vocabulary the LLM fallback is allowed to emit** — a line the re-parse would
 *     refuse must never be a line the model is taught to produce.
 *
 * Every entry is a phrasing that occurs in the 572 corpus. The governing principle is that the
 * student types the exam's own sentence, so this file grows by reading exams, not by inventing
 * syntax.
 */

export type CatalogCategory = 'parameters' | 'points' | 'lines' | 'circles' | 'conics';

export interface CatalogEntryAnalytic {
  category: CatalogCategory;
  he: string;
  en: string;
  /** The §10 family this entry belongs to — the coverage map's own index. */
  family: 'F1' | 'F3' | 'F5' | 'F6' | 'F11';
}

export const COMMAND_CATALOG_ANALYTIC: CatalogEntryAnalytic[] = [
  // --- F11 · parameters (D7 kind 1 — a DOMAIN, not a constraint) ---
  { category: 'parameters', family: 'F11', he: 'a הוא פרמטר חיובי', en: 'a is a positive parameter' },
  { category: 'parameters', family: 'F11', he: 'a הוא פרמטר שונה מאפס', en: 'a is a nonzero parameter' },
  { category: 'parameters', family: 'F11', he: 't הוא פרמטר קטן מ-9', en: 't is a parameter less than 9' },
  { category: 'parameters', family: 'F11', he: 'k הוא פרמטר', en: 'k is a parameter' },
  { category: 'parameters', family: 'F11', he: '0 < k < 6', en: '0 < k < 6' },
  { category: 'parameters', family: 'F11', he: 'a > 0', en: 'a > 0' },

  // --- F1 · points ---
  { category: 'points', family: 'F1', he: 'נתונה הנקודה A(2,6)', en: 'point A(2,6)' },
  { category: 'points', family: 'F1', he: 'נתונות הנקודות A(0,24), B(18,0)', en: 'points A(0,24), B(18,0)' },
  { category: 'points', family: 'F1', he: 'A(-9a,0)', en: 'A(-9a,0)' },

  // --- F3 · lines by equation ---
  { category: 'lines', family: 'F3', he: 'נתון הישר l1: 4y-3x-20=0', en: 'line l1: 4y-3x-20=0' },
  { category: 'lines', family: 'F3', he: 'משוואת הישר AC היא y=-2x+8', en: 'the line AC is y=-2x+8' },
  { category: 'lines', family: 'F3', he: 'הישר x=-4', en: 'the line x=-4' },
  { category: 'lines', family: 'F3', he: 'הישר y=x', en: 'the line y=x' },

  // --- F5 · circles by equation ---
  {
    category: 'circles',
    family: 'F5',
    he: 'נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9',
    en: 'circle I: (x-3)^2+(y-4)^2=9',
  },
  {
    category: 'circles',
    family: 'F5',
    he: 'נתון מעגל II שמשוואתו (x+5)^2+(y-2)^2=1',
    en: 'circle II: (x+5)^2+(y-2)^2=1',
  },
  { category: 'circles', family: 'F5', he: 'משוואת המעגל x^2+y^2-2ax-2x=0', en: 'the circle x^2+y^2-2ax-2x=0' },

  // --- F6 · conics by equation (canonical only — D6/§2a) ---
  { category: 'conics', family: 'F6', he: 'נתונה פרבולה קנונית שמשוואתה y^2=54x', en: 'canonical parabola y^2=54x' },
  { category: 'conics', family: 'F6', he: 'נתונה פרבולה שמשוואתה y^2=2ax', en: 'parabola y^2=2ax' },
  {
    category: 'conics',
    family: 'F6',
    he: 'נתונה אליפסה שמשוואתה x^2/9+y^2/16=1',
    en: 'ellipse x^2/9+y^2/16=1',
  },
];
