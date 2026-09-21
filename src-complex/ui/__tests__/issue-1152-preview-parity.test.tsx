/**
 * #1152 / #1315 — the complex builder's half of the input-preview parity lock, by CALLING the preview.
 */
import { previewTypesetSuite } from '../../../shell/__tests__/fixtures/issue-1152-preview-rows';
import { inputPreviewNodeCx } from '../inputPreviewNodeCx';

previewTypesetSuite(inputPreviewNodeCx, { product: 'complex', isolatesFirst: true });
