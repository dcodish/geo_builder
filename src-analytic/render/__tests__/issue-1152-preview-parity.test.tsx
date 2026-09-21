/**
 * #1152 / #1315 — the analytic builder's half of the input-preview parity lock, by CALLING the preview.
 *
 * ISOLATE FIRST is load-bearing here specifically: #1215 shipped the raw string to `MathText`, which
 * typeset «מעגל (x-3)²+(y-5)²=25» perfectly and drew `=25` at the far LEFT. That regression is what this
 * row would now catch.
 */
import { previewTypesetSuite } from '../../../shell/__tests__/fixtures/issue-1152-preview-rows';
import { inputPreviewNodeAnalytic } from '../inputPreviewNodeAnalytic';

previewTypesetSuite(inputPreviewNodeAnalytic, { product: 'analytic', isolatesFirst: true });
