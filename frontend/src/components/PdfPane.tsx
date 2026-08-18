import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { pdfjsLib } from "../lib/pdfjs";
import { pdfUrl } from "../api";
import type { Question } from "../types";
import "./PdfPane.css";

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    let cancelled = false;
    pdfjsLib.getDocument(pdfUrl(jobId, fileId)).promise.then((loaded) => {
      if (cancelled) return;
      setDoc(loaded);
      setNumPages(loaded.numPages);
      onPageCount(loaded.numPages);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, fileId]);

  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    doc.getPage(page).then(async (pdfPage) => {
      const viewport = pdfPage.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      await pdfPage.render({ canvasContext: ctx, viewport }).promise;
      if (!cancelled) setSize({ width: viewport.width, height: viewport.height });
    });
    return () => {
      cancelled = true;
    };
  }, [doc, page, scale]);

  const pageQuestions = questions.filter((q) => q.page === page && !q.skipped);

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
          <canvas ref={canvasRef} />
          {pageQuestions.map((q) => {
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
