import { useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { XfaLayer } from "pdfjs-dist";
import { PDFLinkService } from "pdfjs-dist/web/pdf_viewer.mjs";
import { pdfjsLib, STANDARD_FONT_DATA_URL } from "../lib/pdfjs";
import { pdfUrl } from "../api";
import type { Question } from "../types";
import "./PdfPane.css";
import "./XfaLayer.css";

// The XFA tree pdf.js hands back from `getXfa()` (before any DOM is built) is
// plain JSON: `{ name, attributes: { xfaName, class: [...] }, children: [...] }`.
// Field wrappers carry class "xfaField" and the same raw field name we
// slugified into `q.name` — walking this (cheap, no rendering) lets us know
// which page a field actually lands on before the reviewer clicks it, since
// XFA layout is dynamic and extraction can only ever guess page 1.
interface XfaNode {
  attributes?: { xfaName?: string; class?: string[] };
  children?: XfaNode[];
}

function collectFieldNames(node: XfaNode | null | undefined, out: Set<string>): void {
  if (!node) return;
  const { xfaName, class: cls } = node.attributes ?? {};
  if (xfaName && cls?.includes("xfaField")) out.add(xfaName.toLowerCase());
  node.children?.forEach((child) => collectFieldNames(child, out));
}

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
  const fieldPageMapRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    let cancelled = false;
    fieldPageMapRef.current = new Map();
    // enableXfa: true is what makes pdf.js render the real form layout for dynamic
    // (LiveCycle/XFA) PDFs — the same mechanism Firefox's built-in viewer uses for
    // these government forms — instead of the static "open in Adobe Reader" page.
    pdfjsLib
      .getDocument({ url: pdfUrl(jobId, fileId), enableXfa: true, standardFontDataUrl: STANDARD_FONT_DATA_URL })
      .promise.then(async (loaded) => {
        if (cancelled) return;
        if (!linkServiceRef.current) linkServiceRef.current = new PDFLinkService();
        linkServiceRef.current.setDocument(loaded);
        setDoc(loaded);
        setIsXfa(loaded.isPureXfa);
        setNumPages(loaded.numPages);
        onPageCount(loaded.numPages);

        if (loaded.isPureXfa) {
          const map = new Map<string, number>();
          for (let p = 1; p <= loaded.numPages; p++) {
            if (cancelled) return;
            try {
              const pdfPage = await loaded.getPage(p);
              const xfaHtml = await pdfPage.getXfa();
              const names = new Set<string>();
              collectFieldNames(xfaHtml as XfaNode, names);
              names.forEach((n) => {
                if (!map.has(n)) map.set(n, p);
              });
            } catch {
              // A page that fails to lay out just isn't in the map — selecting one
              // of its fields falls back to no page hop instead of breaking this.
            }
          }
          if (!cancelled) fieldPageMapRef.current = map;
        }
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

  // Only the selected question's own field name should ever cause a re-scan —
  // depending on the full `questions` array instead would re-run this (and
  // re-trigger the scroll) on every unrelated edit elsewhere in the review list.
  const selectedName = useMemo(
    () => questions.find((q) => q.id === selectedQuestionId)?.name ?? null,
    [questions, selectedQuestionId],
  );

  // Jump to whichever page actually renders the selected field before trying to
  // highlight it — extraction can only ever guess page 1 for XFA fields, since
  // real page placement isn't known until pdf.js lays the form out.
  useEffect(() => {
    if (!isXfa || !selectedName) return;
    const targetPage = fieldPageMapRef.current.get(selectedName.toLowerCase());
    if (targetPage && targetPage !== page) onPageChange(targetPage);
  }, [isXfa, selectedName, page, onPageChange]);

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
    if (!selectedName) return;
    const target = Array.from(container.querySelectorAll<HTMLElement>(".xfaField[xfaname]")).find(
      (el) => el.getAttribute("xfaname")?.toLowerCase() === selectedName.toLowerCase(),
    );
    if (target) {
      target.classList.add("xfa-field-selected");
      target.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [selectedName, isXfa, xfaRenderTick]);

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
