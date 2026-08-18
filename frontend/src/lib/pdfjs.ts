import * as pdfjsLib from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

export { pdfjsLib };

export async function inspectPdf(file: File): Promise<{ pageCount: number; kind: "acroform" | "text" }> {
  const buffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
  const fields = await doc.getFieldObjects();
  const kind = fields && Object.keys(fields).length > 0 ? "acroform" : "text";
  const pageCount = doc.numPages;
  await doc.destroy();
  return { pageCount, kind };
}
