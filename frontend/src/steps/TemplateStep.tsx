import { useRef, useState } from "react";
import type { TemplateMeta } from "../types";
import { uploadTemplate } from "../api";
import "./TemplateStep.css";

interface Props {
  templates: TemplateMeta[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onTemplateUploaded: (t: TemplateMeta) => void;
  fileCount: number;
  onBack: () => void;
  onConvert: () => void;
}

export function TemplateStep({
  templates,
  selectedId,
  onSelect,
  onTemplateUploaded,
  fileCount,
  onBack,
  onConvert,
}: Props) {
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const meta = await uploadTemplate(file);
      onTemplateUploaded(meta);
      onSelect(meta.id);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Could not read this template");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="template-step">
      <h1 className="h1" style={{ marginBottom: 4 }}>
        Which template should these follow?
      </h1>
      <div className="text-soft" style={{ marginBottom: 14 }}>
        Column set, choice lists and settings sheet come from the template. Detected questions fill it in.
      </div>

      <div className="template-grid">
        {templates.map((t) => {
          const selected = t.id === selectedId;
          return (
            <div
              key={t.id}
              className={`box template-card ${selected ? "template-card-selected" : ""}`}
              onClick={() => onSelect(t.id)}
            >
              <div className="label" style={selected ? { color: "var(--gold-ink)" } : undefined}>
                {selected ? "selected" : "saved"}
              </div>
              <div className="text" style={{ fontWeight: 600, margin: "5px 0" }}>
                {t.name}
              </div>
              <div className="text-soft">
                {t.columns} columns · {t.choice_lists} choice list{t.choice_lists === 1 ? "" : "s"}
                {t.geopoint_required ? " · geopoint required" : ""}
              </div>
            </div>
          );
        })}

        <div className="dash template-upload-cell" onClick={() => inputRef.current?.click()}>
          <span className="text">{uploading ? "Uploading…" : "+ Upload a template"}</span>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {uploadError && (
        <div className="text-soft template-upload-error">{uploadError}</div>
      )}

      {templates.length === 0 && (
        <div className="text-soft" style={{ marginTop: 10 }}>
          No saved templates yet — upload an XLSForm workbook to get started.
        </div>
      )}

      <div className="template-footer">
        <button className="btn" onClick={onBack}>
          Back
        </button>
        <button className="btn btn-primary" disabled={!selectedId} onClick={onConvert}>
          Convert {fileCount} file{fileCount === 1 ? "" : "s"} →
        </button>
      </div>
    </div>
  );
}
