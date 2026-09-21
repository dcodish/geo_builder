/**
 * #1152 / #1315 — 3-D's half of the input-preview parity lock, asserted by CALLING the preview.
 *
 * This is the tree whose extraction broke the old source-scanning guard (#1315). `inputPreviewNode3` was
 * correct the whole time; nothing here changes it, and the lock now proves that directly instead of
 * grepping `App3.tsx` for a shape.
 *
 * The vector-name set is empty: these rows carry equations, not vectors, and the vector branch has its
 * own locks in `vecmath.test.tsx`.
 */
import { previewTypesetSuite } from '../../../shell/__tests__/fixtures/issue-1152-preview-rows';
import { inputPreviewNode3 } from '../FactRow3';

previewTypesetSuite((s) => inputPreviewNode3(s, new Set<string>()), { product: '3-D', isolatesFirst: true });
