/**
 * #1152 / #1315 — 2-D's half of the input-preview parity lock, asserted by CALLING the preview.
 *
 * `isolatesFirst: true` since #1316. It was `false` — 2-D was the one builder handing `MathText` the raw
 * string, carried over from #1152 as a bare statement rather than an argued exclusion. Measured in a real
 * browser on «מעגל (x-3)^2+(y-5)^2=25»: the islands ran (x-3)² at x=1153 and (y-5)² at x=1107, i.e. the
 * equation read backwards, against analytic's correct 1098/1144 as the control.
 *
 * This row is the CAUSE, not the symptom: jsdom lays out no bidi, so no unit test can see the reversal.
 * What it holds is that the text `MathText` receives carries the isolate controls — which is the thing
 * whose absence produced it.
 */
import { previewTypesetSuite } from '../../../shell/__tests__/fixtures/issue-1152-preview-rows';
import { inputPreviewNode } from '../inputPreviewNode';

previewTypesetSuite(inputPreviewNode, { product: '2-D', isolatesFirst: true });
