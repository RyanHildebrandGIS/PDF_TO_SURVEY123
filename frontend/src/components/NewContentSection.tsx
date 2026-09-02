import { useState } from "react";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  onReorderGroup: (g: NewGroup, dir: -1 | 1) => void;
  onCreateGroup: (label: string) => void;
  onRenameGroup: (name: string, label: string) => void;
  onDeleteGroup: (name: string) => void;
}

function byOrder(a: Question, b: Question) {
  return a.order - b.order;
}

const UNGROUPED = "ungrouped";
const groupContainerId = (name: string) => `group:${name}`;

/** A container is always a droppable zone (even with zero rows in it right
 * now) so a field can be dragged into an empty group, not just reordered
 * among rows that already exist. */
function DroppableContainer({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`new-content-droppable ${isOver ? "new-content-droppable-over" : ""}`}>
      {children}
    </div>
  );
}

function SortableRow({
  q,
  children,
}: {
  q: Question;
  children: (handle: { attributes: ReturnType<typeof useSortable>["attributes"]; listeners: ReturnType<typeof useSortable>["listeners"] }) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: q.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      {children({ attributes, listeners })}
    </div>
  );
}

export function NewContentSection({
  questions,
  groups,
  choiceLists,
  duplicates,
  selectedId,
  onSelect,
  onPatch,
  onReorderGroup,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
}: Props) {
  const [newGroupLabel, setNewGroupLabel] = useState("");
  const groupNames = new Set(groups.map((g) => g.name));
  const ungrouped = questions.filter((q) => !q.group || !groupNames.has(q.group)).sort(byOrder);
  const sortedGroups = [...groups].sort((a, b) => a.order - b.order);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function containerOf(q: Question): string {
    return q.group && groupNames.has(q.group) ? groupContainerId(q.group) : UNGROUPED;
  }

  function listFor(containerId: string): Question[] {
    if (containerId === UNGROUPED) return ungrouped;
    const name = containerId.slice("group:".length);
    return questions.filter((q) => q.group === name).sort(byOrder);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeQ = questions.find((q) => q.id === active.id);
    if (!activeQ) return;

    const sourceContainerId = containerOf(activeQ);
    const overQ = questions.find((q) => q.id === over.id);
    const destContainerId = overQ ? containerOf(overQ) : String(over.id);
    if (destContainerId !== UNGROUPED && !groupNames.has(destContainerId.slice("group:".length))) return;

    const destGroupName = destContainerId === UNGROUPED ? null : destContainerId.slice("group:".length);
    const destList = listFor(destContainerId).filter((q) => q.id !== activeQ.id);
    const overIndex = overQ ? destList.findIndex((q) => q.id === overQ.id) : destList.length;
    const insertIndex = overIndex === -1 ? destList.length : overIndex;
    destList.splice(insertIndex, 0, activeQ);

    destList.forEach((q, i) => {
      const order = i + 1;
      if (q.id === activeQ.id) {
        onPatch(q.id, { group: destGroupName, order });
      } else if (q.order !== order) {
        onPatch(q.id, { order });
      }
    });

    if (sourceContainerId !== destContainerId) {
      const remainingSource = listFor(sourceContainerId).filter((q) => q.id !== activeQ.id);
      remainingSource.forEach((q, i) => {
        const order = i + 1;
        if (q.order !== order) onPatch(q.id, { order });
      });
    }
  }

  function row(q: Question) {
    return (
      <SortableRow key={q.id} q={q}>
        {(handle) => (
          <QuestionRow
            question={q}
            choiceLists={choiceLists}
            groups={groups}
            duplicateOf={duplicates.get(q.id)?.baseLabel ?? null}
            selected={q.id === selectedId}
            onSelect={() => onSelect(q)}
            onPatch={(patch) => onPatch(q.id, patch)}
            dragHandleProps={handle}
          />
        )}
      </SortableRow>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="new-content-section">
        <DroppableContainer id={UNGROUPED}>
          <SortableContext items={ungrouped.map((q) => q.id)} strategy={verticalListSortingStrategy}>
            {ungrouped.map(row)}
          </SortableContext>
        </DroppableContainer>

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
              <DroppableContainer id={groupContainerId(g.name)}>
                {members.length === 0 ? (
                  <div className="group-block-empty">Drag a field here, or assign one via its group dropdown.</div>
                ) : (
                  <SortableContext items={members.map((q) => q.id)} strategy={verticalListSortingStrategy}>
                    {members.map(row)}
                  </SortableContext>
                )}
              </DroppableContainer>
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
    </DndContext>
  );
}
