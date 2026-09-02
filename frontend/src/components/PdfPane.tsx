import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { XfaLayer } from "pdfjs-dist";
import { PDFLinkService } from "pdfjs-dist/web/pdf_viewer.mjs";
import { pdfjsLib, STANDARD_FONT_DATA_URL } from "../lib/pdfjs";
import { pdfUrl } from "../api";
import type { Question } from "../types";
import "./PdfPane.css";
import "./XfaLayer.css";

interface Props {
  jobId: string;
  fileId: string;
  page: number;
  onPageChange: (page: number) => void;
  onPageCount: (count: number) => void;
  questions: Question[];
  selectedQuestionId: string | null;
  onSelectQuestion: (id: string) => void;
}

export function PdfPane({
  jobId,
  fileId,
  page,
  onPageChange,
  onPageCount,
  questions,
  selectedQuestionId,
  onSelectQuestion,
}: Props) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.1);
  const [isXfa, setIsXfa] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const xfaContainerRef = useRef<HTMLDivElement>(null);
  const linkServiceRef = useRef<PDFLinkService | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [xfaRenderTick, setXfaRenderTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // enableXfa: true is what makes pdf.js render the real form layout for dynamic
    // (LiveCycle/XFA) PDFs — the same mechanism Firefox's built-in viewer uses for
    // these government forms — instead of the static "open in Adobe Reader" page.
    pdfjsLib
      .getDocument({ url: pdfUrl(jobId, fileId), enableXfa: true, standardFontDataUrl: STANDARD_FONT_DATA_URL })
      .promise.then((loaded) => {
        if (cancelled) return;
        if (!linkServiceRef.current) linkServiceRef.current = new PDFLinkService();
        linkServiceRef.current.setDocument(loaded);
        setDoc(loaded);
        setIsXfa(loaded.isPureXfa);
        setNumPages(loaded.numPages);
        onPageCount(loaded.numPages);
      })
      .catch(() => {
        // pdf.js's XFA layout engine can throw on real-world forms with deeply
        // nested subforms (seen as "Maximum call stack size exceeded" during
        // layout) — fall back to the explanatory message rather than a blank pane.
        if (!cancelled) setPreviewFailed(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, fileId]);

  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    setPreviewFailed(false);

    doc
      .getPage(page)
      .then(async (pdfPage) => {
        if (cancelled) return;
        const viewport = pdfPage.getViewport({ scale });

        if (isXfa) {
          const xfaHtml = await pdfPage.getXfa();
          const container = xfaContainerRef.current;
          if (cancelled || !container) return;
          container.innerHTML = "";
          if (!xfaHtml) {
            setPreviewFailed(true);
            return;
          }
          XfaLayer.render({
            viewport: viewport.clone({ dontFlip: true }),
            div: container,
            xfaHtml,
            annotationStorage: doc.annotationStorage,
            linkService: linkServiceRef.current!,
            intent: "display",
          });
          setSize({ width: viewport.width, height: viewport.height });
          setXfaRenderTick((t) => t + 1);
          return;
        }

        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        await pdfPage.render({ canvasContext: ctx, viewport }).promise;
        if (!cancelled) setSize({ width: viewport.width, height: viewport.height });
      })
      .catch(() => {
        if (!cancelled) setPreviewFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [doc, page, scale, isXfa]);

  // The rendered XFA form's field wrappers carry the same raw field name pdf.js
  // read from the XFA template (as `xfaname`) that extraction slugified into
  // `q.name` — lowercasing both is enough to line them up, so a question row
  // click can highlight (and a field click select) without any position data.
  useEffect(() => {
    if (!isXfa) return;
    const container = xfaContainerRef.current;
    if (!container) return;
    container
      .querySelectorAll<HTMLElement>(".xfa-field-selected")
      .forEach((el) => el.classList.remove("xfa-field-selected"));
    if (!selectedQuestionId) return;
    const q = questions.find((qq) => qq.id === selectedQuestionId);
    if (!q) return;
    const target = Array.from(container.querySelectorAll<HTMLElement>(".xfaField[xfaname]")).find(
      (el) => el.getAttribute("xfaname")?.toLowerCase() === q.name.toLowerCase(),
    );
    if (target) {
      target.classList.add("xfa-field-selected");
      target.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [selectedQuestionId, isXfa, questions, xfaRenderTick]);

  function handleXfaContainerClick(e: React.MouseEvent<HTMLDivElement>) {
    const fieldEl = (e.target as HTMLElement).closest<HTMLElement>(".xfaField[xfaname]");
    const name = fieldEl?.getAttribute("xfaname")?.toLowerCase();
    if (!name) return;
    const q = questions.find((qq) => qq.name.toLowerCase() === name && !qq.skipped);
    if (q) onSelectQuestion(q.id);
  }

  const pageQuestions = questions.filter((q) => q.page === page && !q.skipped);

  if (previewFailed) {
    return (
      <div className="pdf-pane">
        <div className="pdf-pane-unavailable text-soft">
          This dynamic (XFA) PDF form couldn't be rendered here. Questions were still
          extracted from the form's embedded field definitions — use the type dropdown
          and label to verify each one against the source PDF.
        </div>
      </div>
    );
  }

  return (
    <div className="pdf-pane">
      <div className="pdf-pane-toolbar">
        <span className="text-soft" style={{ flex: 1 }}>
          Page {page} / {numPages || "…"}
        </span>
        <span className="pill" onClick={() => setScale((s) => Math.max(0.5, s - 0.15))}>
          −
        </span>
        <span className="pill" onClick={() => setScale((s) => Math.min(3, s + 0.15))}>
          +
        </span>
      </div>
      <div className="pdf-pane-scroll">
        <div className="pdf-pane-canvas-wrap" style={{ width: size.width, height: size.height }}>
          {isXfa ? <div ref={xfaContainerRef} onClick={handleXfaContainerClick} /> : <canvas ref={canvasRef} />}
          {!isXfa &&
            pageQuestions.map((q) => {
              const [left, top, right, bottom] = q.bbox;
              const selected = q.id === selectedQuestionId;
              return (
                <div
                  key={q.id}
                  className={`pdf-pane-field ${selected ? "pdf-pane-field-selected" : ""}`}
                  style={{
                    left: `${left * 100}%`,
                    top: `${top * 100}%`,
                    width: `${(right - left) * 100}%`,
                    height: `${(bottom - top) * 100}%`,
                  }}
                  onClick={() => onSelectQuestion(q.id)}
                />
              );
            })}
        </div>
      </div>
      <div className="pdf-pane-nav">
        <button className="btn btn-sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          ← Prev
        </button>
        <button className="btn btn-sm" disabled={page >= numPages} onClick={() => onPageChange(page + 1)}>
          Next →
        </button>
      </div>
    </div>
  );
}
