import { useEffect, useState } from "react";
import type { BaseQuestion, FileMeta, Question, QuestionPatch } from "../types";
import { downloadExportUrl, exportFile, getQuestions, listBaseQuestions, patchQuestion } from "../api";
import { PdfPane } from "../components/PdfPane";
import { QuestionRow } from "../components/QuestionRow";
import "./ReviewStep.css";

type Filter = "all" | "low" | "skipped";
const LOW_CONFIDENCE = 0.6;

interface Props {
  jobId: string;
  templateId: string;
  templateName: string;
  files: FileMeta[];
  activeIndex: number;
  onActiveIndexChange: (i: number) => void;
  reviewedFileIds: Set<string>;
  onMarkReviewed: (fileId: string) => void;
}

export function ReviewStep({
  jobId,
  templateId,
  templateName,
  files,
  activeIndex,
  onActiveIndexChange,
  reviewedFileIds,
  onMarkReviewed,
}: Props) {
  const file = files[activeIndex];
  const [questions, setQuestions] = useState<Question[]>([]);
  const [baseQuestions, setBaseQuestions] = useState<BaseQuestion[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exported, setExported] = useState<{ export_id: string; filename: string } | null>(null);

  useEffect(() => {
    setPage(1);
    setFilter("all");
    setSelectedId(null);
    setExported(null);
    setExportError(null);
    getQuestions(jobId, file.id).then(setQuestions);
  }, [jobId, file.id]);

  useEffect(() => {
    if (!templateId) return;
    listBaseQuestions(templateId).then(setBaseQuestions);
  }, [templateId]);

  function applyPatch(questionId: string, patch: QuestionPatch) {
    setQuestions((qs) => qs.map((q) => (q.id === questionId ? { ...q, ...patch } : q)));
    patchQuestion(jobId, file.id, questionId, patch).catch(() => {
      getQuestions(jobId, file.id).then(setQuestions);
    });
  }

  const lowCount = questions.filter((q) => !q.skipped && q.confidence < LOW_CONFIDENCE).length;
  const skippedCount = questions.filter((q) => q.skipped).length;
  const unconfirmedCount = questions.filter((q) => !q.skipped && !q.confirmed).length;
  const confirmedCount = questions.filter((q) => !q.skipped && q.confirmed).length;
  const visible = questions.filter((q) => {
    if (filter === "low") return !q.skipped && q.confidence < LOW_CONFIDENCE;
    if (filter === "skipped") return q.skipped;
    return true;
  });

  function handleConfirmAll() {
    for (const q of questions) {
      if (!q.skipped && !q.confirmed) applyPatch(q.id, { confirmed: true });
    }
  }

  async function handleExport() {
    if (confirmedCount === 0) {
      setExportError(
        "Nothing is confirmed yet — export only includes confirmed questions. Use \"Confirm all\" or confirm rows individually first.",
      );
      return;
    }
    setExporting(true);
    setExportError(null);
    try {
      const result = await exportFile(jobId, file.id);
      setExported(result);
      onMarkReviewed(file.id);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const isLast = activeIndex === files.length - 1;

  return (
    <div className="review-step">
      <div className="review-toolbar">
        <span className="text" style={{ fontWeight: 600 }}>
          {file.name}
        </span>
        <span className="pill">{templateName}</span>
        <span style={{ flex: 1 }} />
        {lowCount > 0 && (
          <span className="pill pill-flag">
            {lowCount} low confidence
          </span>
        )}
        {unconfirmedCount > 0 && (
          <button className="btn" onClick={handleConfirmAll}>
            Confirm all {unconfirmedCount}
          </button>
        )}
        <button className="btn btn-primary" disabled={exporting} onClick={handleExport}>
          {exporting ? "Exporting…" : "Export .xlsx"}
        </button>
      </div>

      {exportError && <div className="review-export-error text-soft">{exportError}</div>}
      {exported && (
        <div className="review-export-done text-soft">
          Export ready —{" "}
          <a href={downloadExportUrl(exported.export_id)} download={exported.filename}>
            download {exported.filename}
          </a>
        </div>
      )}

      <div className="review-grid">
        <PdfPane
          jobId={jobId}
          fileId={file.id}
          page={page}
          onPageChange={setPage}
          onPageCount={() => {}}
          questions={questions}
          selectedQuestionId={selectedId}
          onSelectQuestion={(id) => {
            setSelectedId(id);
            const q = questions.find((q) => q.id === id);
            if (q) setPage(q.page);
          }}
        />

        <div className="review-questions">
          {baseQuestions.length > 0 && (
            <details className="review-base-questions">
              <summary className="text-soft">
                {baseQuestions.length} question{baseQuestions.length === 1 ? "" : "s"} already in this
                template (unchanged)
              </summary>
              <div className="review-base-list">
                {baseQuestions.map((q, i) => (
                  <div key={i} className="review-base-row">
                    <span className="text" style={{ flex: 1 }}>
                      {q.label}
                    </span>
                    <span className="text-soft">{q.type}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
          <div className="review-new-label label">New from this PDF</div>
          <div className="review-filters">
            <span className={`pill ${filter === "all" ? "pill-ink" : ""}`} onClick={() => setFilter("all")}>
              All {questions.length}
            </span>
            <span className={`pill pill-flag ${filter === "low" ? "pill-ink" : ""}`} onClick={() => setFilter("low")}>
              Low confidence {lowCount}
            </span>
            <span className={`pill ${filter === "skipped" ? "pill-ink" : ""}`} onClick={() => setFilter("skipped")}>
              Skipped {skippedCount}
            </span>
          </div>

          <div className="review-rows">
            {visible.map((q) => (
              <QuestionRow
                key={q.id}
                question={q}
                selected={q.id === selectedId}
                onSelect={() => {
                  setSelectedId(q.id);
                  setPage(q.page);
                }}
                onPatch={(patch) => applyPatch(q.id, patch)}
              />
            ))}
          </div>

          <div className="review-footer">
            <span className="text-soft" style={{ flex: 1 }}>
              {reviewedFileIds.size} of {files.length} files reviewed
            </span>
            {!isLast && (
              <button className="btn" onClick={() => onActiveIndexChange(activeIndex + 1)}>
                Next file →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
