import { useState } from "react";
import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";
import type { ChoiceLists, NewGroup, Question, QuestionPatch, XLSFormType } from "../types";
import "./QuestionRow.css";

const TYPES: XLSFormType[] = [
  "text",
  "integer",
  "decimal",
  "date",
  "select_one",
  "select_multiple",
  "geopoint",
  "image",
  "note",
];

const LOW_CONFIDENCE = 0.6;

interface DragHandleProps {
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
}

interface Props {
  question: Question;
  choiceLists: ChoiceLists;
  groups: NewGroup[];
  duplicateOf: string | null;
  selected: boolean;
  onSelect: () => void;
  onPatch: (patch: QuestionPatch) => void;
  dragHandleProps?: DragHandleProps;
}

export function QuestionRow({
  question: q,
  choiceLists,
  groups,
  duplicateOf,
  selected,
  onSelect,
  onPatch,
  dragHandleProps,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(q.label);
  const [alias, setAlias] = useState(q.alias ?? "");
  const lowConfidence = q.confidence < LOW_CONFIDENCE;

  function saveEdit() {
    setEditing(false);
    const nextAlias = alias.trim() || null;
    if (label !== q.label || nextAlias !== q.alias) onPatch({ label, alias: nextAlias });
  }

  if (q.skipped) {
    return (
      <div className="q-row q-row-skipped" onClick={onSelect}>
        <span className="text-soft q-row-index">{q.order}</span>
        <div style={{ flex: 1 }}>
          <div className="text" style={{ fontWeight: 600 }}>
            {q.label}
          </div>
          <div className="text-soft">skipped{q.skip_reason ? ` — ${q.skip_reason}` : ""}</div>
        </div>
        <span className="q-row-undo" onClick={() => onPatch({ skipped: false })}>
          ↺ Undo
        </span>
      </div>
    );
  }

  const flagDuplicate = duplicateOf && !q.confirmed;

  return (
    <div
      className={`q-row ${lowConfidence && !q.confirmed ? "q-row-flag" : ""} ${flagDuplicate ? "q-row-duplicate" : ""} ${selected ? "q-row-selected" : ""}`}
      onClick={onSelect}
    >
      {dragHandleProps && (
        <span
          className="q-row-drag-handle"
          onClick={(e) => e.stopPropagation()}
          {...dragHandleProps.attributes}
          {...dragHandleProps.listeners}
        >
          ⠿
        </span>
      )}
      <span className="text-soft q-row-index">{q.order}</span>

      <div style={{ flex: 1, minWidth: 0 }} onDoubleClick={() => setEditing(true)}>
        {editing ? (
          <div className="q-row-edit" onClick={(e) => e.stopPropagation()}>
            <input
              className="select"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Question label"
              autoFocus
            />
            <input
              className="select"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              onBlur={saveEdit}
              placeholder="Alias (optional display name)"
            />
          </div>
        ) : (
          <>
            <div className="text" style={{ fontWeight: 600 }}>
              {q.label}
            </div>
            <div className="text-soft">
              field: {q.name}
              {q.alias ? ` · alias: ${q.alias}` : ""}
            </div>
            {flagDuplicate && (
              <div className="q-row-duplicate-note">may duplicate "{duplicateOf}" already in the template</div>
            )}
          </>
        )}
      </div>

      <select
        className="select q-row-group"
        value={q.group ?? ""}
        onChange={(e) => onPatch({ group: e.target.value || null })}
      >
        <option value="">— no group —</option>
        {groups.map((g) => (
          <option key={g.name} value={g.name}>
            {g.label}
          </option>
        ))}
      </select>

      <select
        className={`select ${lowConfidence ? "select-flag" : ""}`}
        value={q.type}
        onChange={(e) => onPatch({ type: e.target.value as XLSFormType, confirmed: true })}
      >
        {TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      {(q.type === "select_one" || q.type === "select_multiple") &&
        (() => {
          const listNames = Object.keys(choiceLists);
          const current = q.choice_list_id ?? "";
          const isUnknown = current !== "" && !listNames.includes(current);
          return (
            <select
              className={`select q-row-list ${isUnknown ? "select-flag" : ""}`}
              value={current}
              onChange={(e) => onPatch({ choice_list_id: e.target.value || null, confirmed: true })}
              title={isUnknown ? `"${current}" isn't a list in this template yet — add it under Choice lists` : undefined}
            >
              <option value="">— pick a list —</option>
              {isUnknown && <option value={current}>{current} (new, not saved)</option>}
              {listNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          );
        })()}

      {q.confirmed ? (
        <span className="text-soft">✓</span>
      ) : (
        <button className="btn btn-sm pill-flag" onClick={() => onPatch({ confirmed: true })}>
          Confirm
        </button>
      )}

      <span
        className="q-row-skip"
        onClick={() => onPatch({ skipped: true, skip_reason: "skipped by reviewer" })}
      >
        ✕
      </span>
    </div>
  );
}
