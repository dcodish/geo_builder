/**
 * Build the downloadable question document (FR-HS-11, ADR-251): a real .docx,
 * laid out like a textbook problem — a "נתון:" heading + numbered verbatim
 * givens list beside the figure image (single borderless 1×2 table, text on
 * the right for Hebrew via `visuallyRightToLeft`).
 *
 * RTL/bidi stance: utterances mix Hebrew words with Latin point labels, digits
 * and ∠/⟂/° symbols. We rely on the same Unicode bidi algorithm the browser
 * step list already renders correctly, activated in Word by `w:bidi` on the
 * paragraph + `w:rtl` on the run — the utterance stays verbatim, no LRM/RLM
 * control characters are injected. List numbers use REAL Word numbering, never
 * a literal "1. " prefix: a European digit + neutral period at an RTL run
 * boundary is the classic bidi-scramble case (renders ".1"), while Word's list
 * number is layout chrome resolved by paragraph direction, outside the bidi
 * text stream.
 *
 * This module is browser- and node-safe (no DOM): PNG dimensions are read from
 * the IHDR header bytes, not decoded via Image/canvas, so the same code is
 * unit-tested in node.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';

export interface QuestionDocInput {
  /** Localized list heading — "נתון:" / "Given:". */
  heading: string;
  /** The verbatim givens, one per list item (from questionLines). */
  lines: string[];
  /** The figure PNG (the svgToPng export) + its raw pixel dimensions. */
  png: { data: Uint8Array; width: number; height: number };
  /** Hebrew (or any RTL) document — flips paragraph direction and the table's visual order. */
  rtl: boolean;
}

/**
 * Read a PNG's pixel dimensions from its header: the 8-byte signature, then the
 * IHDR chunk whose first 8 data bytes (offsets 16–23) are width/height as
 * big-endian u32. Deterministic, no async decode, works in node tests.
 */
export function pngDimensions(data: Uint8Array): { width: number; height: number } {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (data.length < 24 || sig.some((b, i) => data[i] !== b)) throw new Error('not a PNG');
  const u32 = (o: number) => ((data[o] << 24) | (data[o + 1] << 16) | (data[o + 2] << 8) | data[o + 3]) >>> 0;
  return { width: u32(16), height: u32(20) };
}

/** `question-YYYY-MM-DD.docx` — mirrors figureFileName. */
export function questionFileName(now: Date): string {
  return `question-${now.toISOString().slice(0, 10)}.docx`;
}

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } as const;
const NO_BORDERS = {
  top: NO_BORDER,
  bottom: NO_BORDER,
  left: NO_BORDER,
  right: NO_BORDER,
  insideHorizontal: NO_BORDER,
  insideVertical: NO_BORDER,
} as const;

/** A4 usable width at default 1" margins ≈ 9026 twips; ~55% text / ~45% image. */
const TEXT_COL_DXA = 4960;
const IMAGE_COL_DXA = 4060;
/** Printed figure width: 8 cm ≈ 302 px at 96 DPI (docx transformation units are px@96dpi). */
const IMAGE_WIDTH_PX = 302;

export function buildQuestionDoc(input: QuestionDocInput): Document {
  const { heading, lines, png } = input;
  // Pass `undefined`, never `false`: docx serializes false as an explicit
  // w:val="false" attribute; an LTR document should simply carry no bidi marks.
  const rtl = input.rtl || undefined;

  const textCell = new TableCell({
    borders: NO_BORDERS,
    verticalAlign: VerticalAlign.TOP,
    margins: { top: 100, bottom: 100, left: 150, right: 150 },
    width: { size: TEXT_COL_DXA, type: WidthType.DXA },
    children: [
      new Paragraph({
        bidirectional: rtl,
        spacing: { after: 120 },
        children: [new TextRun({ text: heading, bold: true, rightToLeft: rtl })],
      }),
      ...lines.map(
        (line) =>
          new Paragraph({
            bidirectional: rtl,
            numbering: { reference: 'givens', level: 0 },
            spacing: { after: 80 },
            children: [new TextRun({ text: line, rightToLeft: rtl })],
          }),
      ),
    ],
  });

  // The 2× oversampled export just prints sharper at the fixed 8 cm width;
  // height follows the blob's real aspect ratio, never assumed square.
  const imageCell = new TableCell({
    borders: NO_BORDERS,
    verticalAlign: VerticalAlign.TOP,
    margins: { top: 100, bottom: 100, left: 150, right: 150 },
    width: { size: IMAGE_COL_DXA, type: WidthType.DXA },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            type: 'png',
            data: png.data,
            transformation: {
              width: IMAGE_WIDTH_PX,
              height: Math.max(1, Math.round((IMAGE_WIDTH_PX * png.height) / png.width)),
            },
          }),
        ],
      }),
    ],
  });

  return new Document({
    styles: {
      default: {
        document: {
          run: {
            // Arial covers the Latin labels/digits/symbols; David is the classic
            // Israeli textbook Hebrew face — rightToLeft runs use the cs font.
            font: { ascii: 'Arial', hAnsi: 'Arial', cs: 'David' },
            size: 24, // half-points: 12pt
            sizeComplexScript: 24,
          },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: 'givens',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.START,
              style: { paragraph: { indent: { start: 360, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        children: [
          new Table({
            visuallyRightToLeft: rtl, // first cell renders on the RIGHT for Hebrew
            width: { size: 100, type: WidthType.PERCENTAGE },
            columnWidths: [TEXT_COL_DXA, IMAGE_COL_DXA],
            borders: NO_BORDERS,
            rows: [new TableRow({ children: [textCell, imageCell] })],
          }),
        ],
      },
    ],
  });
}

/** The browser entry: build + pack to a Blob for the anchor-download pattern. */
export async function questionDocxBlob(input: QuestionDocInput): Promise<Blob> {
  return Packer.toBlob(buildQuestionDoc(input));
}
