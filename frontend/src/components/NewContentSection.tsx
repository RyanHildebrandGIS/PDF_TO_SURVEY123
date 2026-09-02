import { useState } from "react";
import type { ChoiceLists, NewGroup, Question, QuestionPatch } from "../types";
import type { DuplicateMatch } from "../lib/duplicates";
import { GroupBlock } from "./GroupBlock";
import { QuestionRow } from "./QuestionRow";
import "./NewContentSection.css";

interface Props {
  questions: Question[];
  groups: NewGroup[];
  choiceLists: ChoiceLists;
  duplicates: Map<string, DuplicateMatch>;
  selectedId: string | null;
  onSelect: (q: Question) => void;
  onPatch: (id: string, patch: QuestionPatch) => void;
  onReorderQuestion: (q: Question, siblings: Question[], dir: -1 | 1) => void;
  onReorderGroup: (g: NewGroup, dir: -1 | 1) => void;
  onCreateGroup: (label: string) => void;
  onRenameGroup: (name: string, label: string) => void;
  onDeleteGroup: (name: string) => void;
}

function byOrder(a: Question, b: Question) {
  return a.order - b.order;
}

export function NewContentSection({
  questions,
  groups,
  choiceLists,
  duplicates,
  selectedId,
  onSelect,
  onPatch,
  onReorderQuestion,
  onReorderGroup,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
}: Props) {
  const [newGroupLabel, setNewGroupLabel] = useState("");
  const groupNames = new Set(groups.map((g) => g.name));
  const ungrouped = questions.filter((q) => !q.group || !groupNames.has(q.group)).sort(byOrder);
  const sortedGroups = [...groups].sort((a, b) => a.order - b.order);

  function row(q: Question, siblings: Question[], i: number) {
    return (
      <QuestionRow
        key={q.id}
        question={q}
        choiceLists={choiceLists}
        groups={groups}
        duplicateOf={duplicates.get(q.id)?.baseLabel ?? null}
        selected={q.id === selectedId}
        onSelect={() => onSelect(q)}
        onPatch={(patch) => onPatch(q.id, patch)}
        onMoveUp={i > 0 ? () => onReorderQuestion(q, siblings, -1) : undefined}
        onMoveDown={i < siblings.length - 1 ? () => onReorderQuestion(q, siblings, 1) : undefined}
      />
    );
  }

  return (
    <div className="new-content-section">
      {ungrouped.map((q, i) => row(q, ungrouped, i))}

      {sortedGroups.map((g, gi) => {
        const members = questions.filter((q) => q.group === g.name).sort(byOrder);
        return (
          <GroupBlock
            key={g.name}
            label={g.label}
            locked={false}
            defaultOpen
            count={members.length}
            onRename={(label) => onRenameGroup(g.name, label)}
            onMoveUp={gi > 0 ? () => onReorderGroup(g, -1) : undefined}
            onMoveDown={gi < sortedGroups.length - 1 ? () => onReorderGroup(g, 1) : undefined}
            onDelete={() => onDeleteGroup(g.name)}
          >
            {members.length === 0 ? (
              <div className="group-block-empty">
                No fields assigned yet — use the group dropdown on a field below to add one here.
              </div>
            ) : (
              members.map((q, i) => row(q, members, i))
            )}
          </GroupBlock>
        );
      })}

      <div className="new-content-add-group">
        <input
          className="select"
          value={newGroupLabel}
          onChange={(e) => setNewGroupLabel(e.target.value)}
          placeholder="New group name"
          onKeyDown={(e) => {
            if (e.key === "Enter" && newGroupLabel.trim()) {
              onCreateGroup(newGroupLabel.trim());
              setNewGroupLabel("");
            }
          }}
        />
        <button
          className="btn btn-sm"
          disabled={!newGroupLabel.trim()}
          onClick={() => {
            onCreateGroup(newGroupLabel.trim());
            setNewGroupLabel("");
          }}
        >
          + Add group
        </button>
      </div>
    </div>
  );
}
