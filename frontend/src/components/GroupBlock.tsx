import { useState } from "react";
import "./GroupBlock.css";

interface Props {
  label: string;
  locked: boolean;
  defaultOpen?: boolean;
  count?: number;
  onRename?: (label: string) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDelete?: () => void;
  children: React.ReactNode;
}

export function GroupBlock({ label, locked, defaultOpen, count, onRename, onMoveUp, onMoveDown, onDelete, children }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);

  function stop(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  return (
    <details className={`group-block ${locked ? "group-block-locked" : "group-block-new"}`} open={defaultOpen}>
      <summary className="group-block-header">
        {editing ? (
          <input
            className="select group-block-rename"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onClick={stop}
            onBlur={() => {
              setEditing(false);
              const trimmed = draft.trim();
              if (trimmed && trimmed !== label) onRename?.(trimmed);
              else setDraft(label);
            }}
            autoFocus
          />
        ) : (
          <span className="group-block-label">{label}</span>
        )}
        {typeof count === "number" && <span className="text-soft">{count}</span>}
        {locked && <span className="group-block-tag">template</span>}
        {onRename && !editing && (
          <span
            className="group-block-btn"
            onClick={(e) => {
              stop(e);
              setEditing(true);
            }}
          >
            rename
          </span>
        )}
        {onMoveUp && (
          <span className="group-block-btn" onClick={(e) => { stop(e); onMoveUp(); }}>
            ↑
          </span>
        )}
        {onMoveDown && (
          <span className="group-block-btn" onClick={(e) => { stop(e); onMoveDown(); }}>
            ↓
          </span>
        )}
        {onDelete && (
          <span className="group-block-btn" onClick={(e) => { stop(e); onDelete(); }}>
            ungroup
          </span>
        )}
      </summary>
      <div className="group-block-body">{children}</div>
    </details>
  );
}
