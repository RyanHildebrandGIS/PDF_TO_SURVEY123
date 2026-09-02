import { useEffect, useState } from "react";
import type { ChoiceLists } from "../types";
import { getChoiceLists, saveChoiceLists } from "../api";
import "./ChoiceListsModal.css";

interface Props {
  templateId: string;
  onClose: () => void;
  onSaved: (lists: ChoiceLists) => void;
}

function slugifyOptionName(label: string): string {
  return (
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "option"
  );
}

export function ChoiceListsModal({ templateId, onClose, onSaved }: Props) {
  const [lists, setLists] = useState<ChoiceLists | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newListName, setNewListName] = useState("");

  useEffect(() => {
    // Guard against a stale response landing after a newer one (or after edits have
    // already started) — without this, React 18 StrictMode's dev-mode double-invoke
    // of this effect fires two fetches, and the second one to resolve unconditionally
    // overwrites `lists`, silently discarding any edit made in between.
    let cancelled = false;
    getChoiceLists(templateId).then((data) => {
      if (!cancelled) setLists(data);
    });
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  function updateOption(listName: string, index: number, field: "name" | "label", value: string) {
    setLists((prev) => {
      if (!prev) return prev;
      const options = [...prev[listName]];
      options[index] = { ...options[index], [field]: value };
      return { ...prev, [listName]: options };
    });
  }

  function addOption(listName: string) {
    setLists((prev) => {
      if (!prev) return prev;
      return { ...prev, [listName]: [...prev[listName], { name: "", label: "" }] };
    });
  }

  function removeOption(listName: string, index: number) {
    setLists((prev) => {
      if (!prev) return prev;
      return { ...prev, [listName]: prev[listName].filter((_, i) => i !== index) };
    });
  }

  function removeList(listName: string) {
    setLists((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      delete next[listName];
      return next;
    });
  }

  function addList() {
    const name = newListName.trim();
    if (!name) return;
    setLists((prev) => ({ ...(prev ?? {}), [name]: [{ name: "", label: "" }] }));
    setNewListName("");
  }

  async function handleSave() {
    if (!lists) return;
    setSaving(true);
    setError(null);
    try {
      // Auto-fill a slug for any option whose name was left blank while typing a label.
      const cleaned: ChoiceLists = {};
      for (const [listName, options] of Object.entries(lists)) {
        cleaned[listName] = options
          .filter((o) => o.label.trim() || o.name.trim())
          .map((o) => ({
            name: o.name.trim() || slugifyOptionName(o.label),
            label: o.label.trim() || o.name.trim(),
          }));
      }
      await saveChoiceLists(templateId, cleaned);
      onSaved(cleaned);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save choice lists");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="cl-modal-backdrop" onClick={onClose}>
      <div className="cl-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cl-modal-header">
          <span className="h1">Choice lists</span>
          <span className="text-soft" style={{ flex: 1 }}>
            Shared by every select_one / select_multiple question in this template
          </span>
          <span className="btn btn-sm" onClick={onClose}>
            Close
          </span>
        </div>

        <div className="cl-modal-body">
          {!lists && <div className="text-soft">Loading…</div>}
          {lists &&
            Object.entries(lists).map(([listName, options]) => (
              <div className="cl-list" key={listName}>
                <div className="cl-list-header">
                  <span className="text" style={{ fontWeight: 600, flex: 1 }}>
                    {listName}
                  </span>
                  <span className="q-row-skip" onClick={() => removeList(listName)}>
                    ✕
                  </span>
                </div>
                <div className="cl-options">
                  {options.map((opt, i) => (
                    <div className="cl-option-row" key={i}>
                      <input
                        className="select"
                        placeholder="value"
                        value={opt.name}
                        onChange={(e) => updateOption(listName, i, "name", e.target.value)}
                      />
                      <input
                        className="select"
                        placeholder="label"
                        style={{ flex: 1 }}
                        value={opt.label}
                        onChange={(e) => updateOption(listName, i, "label", e.target.value)}
                      />
                      <span className="q-row-skip" onClick={() => removeOption(listName, i)}>
                        ✕
                      </span>
                    </div>
                  ))}
                  <span className="btn btn-sm" onClick={() => addOption(listName)}>
                    + Add option
                  </span>
                </div>
              </div>
            ))}

          {lists && (
            <div className="cl-list cl-new-list">
              <input
                className="select"
                placeholder="new list name (e.g. condition)"
                style={{ flex: 1 }}
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addList()}
              />
              <span className="btn btn-sm" onClick={addList}>
                + Add list
              </span>
            </div>
          )}
        </div>

        {error && <div className="review-export-error text-soft">{error}</div>}

        <div className="cl-modal-footer">
          <span className="btn" onClick={onClose}>
            Cancel
          </span>
          <button className="btn btn-primary" disabled={saving || !lists} onClick={handleSave}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
