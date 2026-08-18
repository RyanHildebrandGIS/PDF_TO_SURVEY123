import { useState } from "react";
import type { Question, QuestionPatch, XLSFormType } from "../types";
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

interface Props {
  question: Question;
  selected: boolean;
  onSelect: () => void;
  onPatch: (patch: QuestionPatch) => void;
}

export function QuestionRow({ question: q, selected, onSelect, onPatch }: Props) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(q.label);
  const [name, setName] = useState(q.name);
  const lowConfidence = q.confidence < LOW_CONFIDENCE;

  function saveEdit() {
    setEditing(false);
    if (label !== q.label || name !== q.name) onPatch({ label, name });
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
        <span
          className="q-row-undo"
          onClick={(e) => {
            e.stopPropagation();
            onPatch({ skipped: false });
          }}
        >
          ↺ Undo
        </span>
      </div>
    );
  }

  return (
    <div
      className={`q-row ${lowConfidence && !q.confirmed ? "q-row-flag" : ""} ${selected ? "q-row-selected" : ""}`}
      onClick={onSelect}
    >
      <span className="text-soft q-row-index">{q.order}</span>

      <div style={{ flex: 1, minWidth: 0 }} onDoubleClick={() => setEditing(true)}>
        {editing ? (
          <div className="q-row-edit" onClick={(e) => e.stopPropagation()}>
            <input className="select" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
            <input className="select" value={name} onChange={(e) => setName(e.target.value)} onBlur={saveEdit} />
          </div>
        ) : (
          <>
            <div className="text" style={{ fontWeight: 600 }}>
              {q.label}
            </div>
            <div className="text-soft">name: {q.name}</div>
          </>
        )}
      </div>

      <select
        className={`select ${lowConfidence ? "select-flag" : ""}`}
        value={q.type}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onPatch({ type: e.target.value as XLSFormType, confirmed: true })}
      >
        {TYPES.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      {(q.type === "select_one" || q.type === "select_multiple") && (
        <input
          className="select q-row-list"
          value={q.choice_list_id ?? ""}
          placeholder="list name"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onPatch({ choice_list_id: e.target.value, confirmed: true })}
        />
      )}

      {q.confirmed ? (
        <span className="text-soft">✓</span>
      ) : (
        <button
          className="btn btn-sm pill-flag"
          onClick={(e) => {
            e.stopPropagation();
            onPatch({ confirmed: true });
          }}
        >
          Confirm
        </button>
      )}

      <span
        className="q-row-skip"
        onClick={(e) => {
          e.stopPropagation();
          onPatch({ skipped: true, skip_reason: "skipped by reviewer" });
        }}
      >
        ✕
      </span>
    </div>
  );
}
