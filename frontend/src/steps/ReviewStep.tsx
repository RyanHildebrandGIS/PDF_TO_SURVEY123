import { useEffect, useMemo, useState } from "react";
import type { BaseItem, ChoiceLists, FileMeta, Question, QuestionPatch } from "../types";
import { downloadExportUrl, exportFile, getBaseStructure, getChoiceLists, getQuestions, patchQuestion } from "../api";
import { BaseItemView, countBaseItems } from "../components/BaseItemView";
import { ChoiceListsModal } from "../components/ChoiceListsModal";
import { PdfPane } from "../components/PdfPane";
import { QuestionRow } from "../components/QuestionRow";
import { findDuplicates, flattenBaseItems } from "../lib/duplicates";
import "./ReviewStep.css";

type Filter = "all" | "low" | "skipped" | "duplicate";
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
  const [baseStructure, setBaseStructure] = useState<BaseItem[]>([]);
  const [choiceLists, setChoiceLists] = useState<ChoiceLists>({});
  const [showChoiceLists, setShowChoiceLists] = useState(false);
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
    getBaseStructure(templateId).then(setBaseStructure);
    getChoiceLists(templateId).then(setChoiceLists);
  }, [templateId]);

  const duplicates = useMemo(
    () => findDuplicates(questions, flattenBaseItems(baseStructure)),
    [questions, baseStructure],
  );

  function applyPatch(questionId: string, patch: QuestionPatch) {
    setQuestions((qs) => qs.map((q) => (q.id === questionId ? { ...q, ...patch } : q)));
    patchQuestion(jobId, file.id, questionId, patch).catch(() => {
      getQuestions(jobId, file.id).then(setQuestions);
    });
  }

  const lowCount = questions.filter((q) => !q.skipped && q.confidence < LOW_CONFIDENCE).length;
  const skippedCount = questions.filter((q) => q.skipped).length;
  const duplicateCount = questions.filter((q) => !q.skipped && duplicates.has(q.id)).length;
  const unconfirmedCount = questions.filter((q) => !q.skipped && !q.confirmed).length;
  const confirmedCount = questions.filter((q) => !q.skipped && q.confirmed).length;
  const visible = questions.filter((q) => {
    if (filter === "low") return !q.skipped && q.confidence < LOW_CONFIDENCE;
    if (filter === "skipped") return q.skipped;
    if (filter === "duplicate") return !q.skipped && duplicates.has(q.id);
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
        {duplicateCount > 0 && (
          <span className="pill pill-danger">
            {duplicateCount} possible duplicate{duplicateCount === 1 ? "" : "s"}
          </span>
        )}
        {unconfirmedCount > 0 && (
          <button className="btn" onClick={handleConfirmAll}>
            Confirm all {unconfirmedCount}
          </button>
        )}
        <button className="btn" onClick={() => setShowChoiceLists(true)}>
          Choice lists
        </button>
        <button className="btn btn-primary" disabled={exporting} onClick={handleExport}>
          {exporting ? "Exporting…" : "Export .xlsx"}
        </button>
      </div>

      {showChoiceLists && (
        <ChoiceListsModal
          templateId={templateId}
          onClose={() => setShowChoiceLists(false)}
          onSaved={setChoiceLists}
        />
      )}

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
          {baseStructure.length > 0 && (
            <details className="review-base-questions">
              <summary className="text-soft">
                {countBaseItems(baseStructure)} question{countBaseItems(baseStructure) === 1 ? "" : "s"} already
                in this template (unchanged)
              </summary>
              <div className="review-base-list">
                <BaseItemView items={baseStructure} />
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
            {duplicateCount > 0 && (
              <span
                className={`pill pill-danger ${filter === "duplicate" ? "pill-ink" : ""}`}
                onClick={() => setFilter("duplicate")}
              >
                Possible duplicates {duplicateCount}
              </span>
            )}
            <span className={`pill ${filter === "skipped" ? "pill-ink" : ""}`} onClick={() => setFilter("skipped")}>
              Skipped {skippedCount}
            </span>
          </div>

          <div className="review-rows">
            {visible.map((q) => (
              <QuestionRow
                key={q.id}
                question={q}
                choiceLists={choiceLists}
                duplicateOf={duplicates.get(q.id)?.baseLabel ?? null}
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
