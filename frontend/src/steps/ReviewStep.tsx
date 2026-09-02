import { useEffect, useMemo, useState } from "react";
import type { BaseItem, ChoiceLists, FileMeta, NewGroup, Question, QuestionPatch } from "../types";
import {
  createGroup,
  deleteGroup,
  downloadExportUrl,
  exportFile,
  getBaseStructure,
  getChoiceLists,
  getGroups,
  getQuestions,
  patchGroup,
  patchQuestion,
} from "../api";
import { BaseItemView, hasPlaceholder } from "../components/BaseItemView";
import { ChoiceListsModal } from "../components/ChoiceListsModal";
import { NewContentSection } from "../components/NewContentSection";
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
  const [groups, setGroups] = useState<NewGroup[]>([]);
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
    getGroups(jobId, file.id).then(setGroups);
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

  function applyGroupPatch(groupName: string, patch: { label?: string; order?: number }) {
    setGroups((gs) => gs.map((g) => (g.name === groupName ? { ...g, ...patch } : g)));
    patchGroup(jobId, file.id, groupName, patch).catch(() => {
      getGroups(jobId, file.id).then(setGroups);
    });
  }

  function handleCreateGroup(label: string) {
    createGroup(jobId, file.id, label).then((g) => setGroups((gs) => [...gs, g]));
  }

  function handleDeleteGroup(groupName: string) {
    setGroups((gs) => gs.filter((g) => g.name !== groupName));
    setQuestions((qs) => qs.map((q) => (q.group === groupName ? { ...q, group: null } : q)));
    deleteGroup(jobId, file.id, groupName).catch(() => {
      getGroups(jobId, file.id).then(setGroups);
      getQuestions(jobId, file.id).then(setQuestions);
    });
  }

  function handleReorderGroup(g: NewGroup, dir: -1 | 1) {
    const sorted = [...groups].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((x) => x.name === g.name);
    const swap = sorted[idx + dir];
    if (!swap) return;
    applyGroupPatch(g.name, { order: swap.order });
    applyGroupPatch(swap.name, { order: g.order });
  }

  function handleReorderQuestion(q: Question, siblings: Question[], dir: -1 | 1) {
    const idx = siblings.findIndex((x) => x.id === q.id);
    const swap = siblings[idx + dir];
    if (!swap) return;
    applyPatch(q.id, { order: swap.order });
    applyPatch(swap.id, { order: q.order });
  }

  function selectQuestion(q: Question) {
    setSelectedId(q.id);
    setPage(q.page);
  }

  const lowCount = questions.filter((q) => !q.skipped && q.confidence < LOW_CONFIDENCE).length;
  const skippedCount = questions.filter((q) => q.skipped).length;
  const duplicateCount = questions.filter((q) => !q.skipped && duplicates.has(q.id)).length;
  const unconfirmedCount = questions.filter((q) => !q.skipped && !q.confirmed).length;
  const confirmedCount = questions.filter((q) => !q.skipped && q.confirmed).length;

  const activeQuestions = questions.filter((q) => !q.skipped);
  const filteredActive = activeQuestions.filter((q) => {
    if (filter === "low") return q.confidence < LOW_CONFIDENCE;
    if (filter === "duplicate") return duplicates.has(q.id);
    return true;
  });
  const skippedQuestions = questions.filter((q) => q.skipped);

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

  function renderNewContent() {
    return (
      <div className="new-content-wrap">
        <div className="review-new-label label">New from this PDF</div>
        <NewContentSection
          questions={filteredActive}
          groups={groups}
          choiceLists={choiceLists}
          duplicates={duplicates}
          selectedId={selectedId}
          onSelect={selectQuestion}
          onPatch={applyPatch}
          onReorderQuestion={handleReorderQuestion}
          onReorderGroup={handleReorderGroup}
          onCreateGroup={handleCreateGroup}
          onRenameGroup={(name, label) => applyGroupPatch(name, { label })}
          onDeleteGroup={handleDeleteGroup}
        />
      </div>
    );
  }

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
            {filter === "skipped" ? (
              skippedQuestions.map((q) => (
                <QuestionRow
                  key={q.id}
                  question={q}
                  choiceLists={choiceLists}
                  groups={groups}
                  duplicateOf={null}
                  selected={q.id === selectedId}
                  onSelect={() => selectQuestion(q)}
                  onPatch={(patch) => applyPatch(q.id, patch)}
                />
              ))
            ) : (
              <>
                <BaseItemView items={baseStructure} renderPlaceholder={renderNewContent} />
                {!hasPlaceholder(baseStructure) && renderNewContent()}
              </>
            )}
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
