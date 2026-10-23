/**
 * #1868 (ADR-W-151) — this builder words an unread line with the ruled "not understood" sentence, through its own
 * refusal path and i18n instance. The assertions are shared: `shell/__tests__/fixtures/not-understood-1868.ts`.
 */
import i18n from '../i18n';
import { rightAngleVertexNote } from '../app/unreadParts';
import { lockNotUnderstood } from '../../shell/__tests__/fixtures/not-understood-1868';

// 2-D's not-understood note is a KEY (submitPipeline sets it; submitPipeline.test holds that the pipeline picks it):
// the one producer that names it outside the pipeline is the right-angle seam with no triangle to name.
lockNotUnderstood('2d', (lng) => i18n.getFixedT(lng)(rightAngleVertexNote({ rest: '' }).key));
