/**
 * #1152 / #1315 — 2-D's half of the input-preview parity lock, asserted by CALLING the preview.
 *
 * `isolatesFirst: false` is 2-D's documented exclusion: it is the tree the typesetting mechanism came
 * from and it hands `MathText` the raw string. Preserved exactly through the #1315 extraction rather than
 * changed inside a refactor; whether it SHOULD isolate first is #1316.
 */
import { previewTypesetSuite } from '../../../shell/__tests__/fixtures/issue-1152-preview-rows';
import { inputPreviewNode } from '../inputPreviewNode';

previewTypesetSuite(inputPreviewNode, { product: '2-D', isolatesFirst: false });
