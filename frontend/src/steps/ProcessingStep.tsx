import type { FileMeta } from "../types";
import "./ProcessingStep.css";

export function ProcessingStep({ files }: { files: FileMeta[] }) {
  return (
    <div className="processing-step">
      <h1 className="h1">Reading forms…</h1>

      <div className="processing-list">
        {files.map((f) => {
          const queued = f.status === "queued";
          return (
            <div key={f.id} className={`box processing-card ${queued ? "processing-card-queued" : ""}`}>
              <div className="processing-card-top">
                <span className="text" style={{ fontWeight: 600, flex: 1 }}>
                  {f.name}
                </span>
                <span className="text-soft">
                  {f.status === "failed"
                    ? "failed"
                    : queued
                    ? "queued"
                    : f.status === "done"
                    ? `${f.questions_found} question${f.questions_found === 1 ? "" : "s"} found`
                    : `${f.phase.split(" · ")[0]} · ${f.questions_found} questions found`}
                </span>
              </div>
              <div className="processing-track">
                {!queued && (
                  <div
                    className="processing-fill"
                    style={{ width: `${f.progress}%`, background: f.status === "failed" ? "var(--gold)" : "var(--acc)" }}
                  />
                )}
              </div>
              {!queued && f.status !== "failed" && <div className="text-soft">{f.phase}</div>}
              {f.status === "failed" && (
                <div className="text-soft" style={{ color: "var(--gold-ink)" }}>
                  {f.error ?? "Something went wrong"}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="text-soft">You can leave this page — we'll keep going.</div>
    </div>
  );
}
