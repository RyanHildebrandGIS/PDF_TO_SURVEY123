import * as pdfjsLib from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

export { pdfjsLib };

// Served from public/standard_fonts (copied from pdfjs-dist at build time — see
// that directory's contents). Without this, pdf.js can throw an
// UnknownErrorException when a document needs a substitute standard font — this
// hits XFA rendering in particular, since XFA forms lean on standard fonts more
// than typical embedded-font PDFs.
export const STANDARD_FONT_DATA_URL = "/standard_fonts/";

export async function inspectPdf(file: File): Promise<{ pageCount: number; kind: "acroform" | "text" }> {
  const buffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
  const fields = await doc.getFieldObjects();
  const kind = fields && Object.keys(fields).length > 0 ? "acroform" : "text";
  const pageCount = doc.numPages;
  await doc.destroy();
  return { pageCount, kind };
}
