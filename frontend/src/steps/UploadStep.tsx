import { useRef, useState } from "react";
import type { PendingFile } from "../types";
import { inspectPdf } from "../lib/pdfjs";
import "./UploadStep.css";

const MAX_MB = 25;

interface Props {
  files: PendingFile[];
  onFilesAdded: (files: PendingFile[]) => void;
  onRemove: (localId: string) => void;
  onCancel: () => void;
  onNext: () => void;
}

export function UploadStep({ files, onFilesAdded, onRemove, onCancel, onNext }: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(fileList: FileList | File[]) {
    const existingNames = new Set(files.map((f) => f.file.name));
    const pending: PendingFile[] = [];

    for (const file of Array.from(fileList)) {
      const localId = crypto.randomUUID();
      let error: string | null = null;
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        error = "Not a PDF file";
      } else if (file.size > MAX_MB * 1024 * 1024) {
        error = `Larger than ${MAX_MB} MB`;
      } else if (existingNames.has(file.name)) {
        error = "Duplicate filename";
      }
      existingNames.add(file.name);

      const entry: PendingFile = { localId, file, pageCount: null, kind: null, error };
      pending.push(entry);
    }

    onFilesAdded(pending);

    for (const entry of pending) {
      if (entry.error) continue;
      try {
        const { pageCount, kind } = await inspectPdf(entry.file);
        onFilesAdded([{ ...entry, pageCount, kind }]);
      } catch {
        onFilesAdded([{ ...entry, error: "Could not read this PDF" }]);
      }
    }
  }

  const validCount = files.filter((f) => !f.error).length;

  return (
    <div className="upload-step">
      <h1 className="h1" style={{ marginBottom: 10 }}>
        Drop the PDFs you want to convert
      </h1>

      <div
        className={`dash upload-drop ${dragging ? "upload-drop-active" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
      >
        <div className="upload-icon text-soft">pdf</div>
        <div className="text">Drop files here, or browse</div>
        <div className="text-soft">Fillable forms and text documents · one or many</div>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {files.length > 0 && (
        <div className="upload-list">
          {files.map((f) => (
            <div key={f.localId} className={`box upload-row ${f.error ? "upload-row-error" : ""}`}>
              <span className="pill">pdf</span>
              <span className="text upload-row-name">{f.file.name}</span>
              <span className="text-soft">
                {f.error
                  ? f.error
                  : f.pageCount
                  ? `${f.pageCount} page${f.pageCount === 1 ? "" : "s"} · ${
                      f.kind === "acroform" ? "fillable" : "text"
                    }`
                  : "reading…"}
              </span>
              <span className="upload-row-remove" onClick={() => onRemove(f.localId)}>
                ✕
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="upload-footer">
        <span className="text-soft" style={{ flex: 1 }}>
          Each PDF exports as its own .xlsx
        </span>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={validCount === 0} onClick={onNext}>
          Choose template →
        </button>
      </div>
    </div>
  );
}
