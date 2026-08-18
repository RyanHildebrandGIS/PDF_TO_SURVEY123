import { useEffect, useRef, useState } from "react";
import { AppBar } from "./components/AppBar";
import { Stepper } from "./components/Stepper";
import { UploadStep } from "./steps/UploadStep";
import { TemplateStep } from "./steps/TemplateStep";
import { ProcessingStep } from "./steps/ProcessingStep";
import { ReviewStep } from "./steps/ReviewStep";
import { createJob, getJob, listTemplates, startJob } from "./api";
import type { JobStatus, PendingFile, TemplateMeta } from "./types";
import "./styles/tokens.css";
import "./styles/primitives.css";
import "./App.css";

function App() {
  const [step, setStep] = useState(1);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [activeReviewIndex, setActiveReviewIndex] = useState(0);
  const [reviewedFileIds, setReviewedFileIds] = useState<Set<string>>(new Set());
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    listTemplates().then(setTemplates);
  }, []);

  function mergePendingFiles(entries: PendingFile[]) {
    setPendingFiles((prev) => {
      const next = [...prev];
      for (const entry of entries) {
        const i = next.findIndex((f) => f.localId === entry.localId);
        if (i >= 0) next[i] = entry;
        else next.push(entry);
      }
      return next;
    });
  }

  async function handleConvert() {
    if (!templateId) return;
    const files = pendingFiles.filter((f) => !f.error).map((f) => f.file);
    const created = await createJob(files);
    const started = await startJob(created.id, templateId);
    setJob(started);
    setStep(3);
  }

  useEffect(() => {
    if (step !== 3 || !job) return;

    pollRef.current = window.setInterval(async () => {
      const updated = await getJob(job.id);
      setJob(updated);
      const allTerminal = updated.files.every((f) => f.status === "done" || f.status === "failed");
      if (allTerminal) {
        if (pollRef.current) window.clearInterval(pollRef.current);
        window.setTimeout(() => {
          setActiveReviewIndex(0);
          setStep(4);
        }, 400);
      }
    }, 700);

    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, job?.id]);

  const selectedTemplate = templates.find((t) => t.id === templateId);
  const reviewableFiles = job?.files.filter((f) => f.status === "done") ?? [];

  return (
    <div className="app-shell">
      <AppBar />
      {step < 4 && <Stepper step={step} />}

      <main className="app-main">
        {step === 1 && (
          <UploadStep
            files={pendingFiles}
            onFilesAdded={mergePendingFiles}
            onRemove={(id) => setPendingFiles((prev) => prev.filter((f) => f.localId !== id))}
            onCancel={() => setPendingFiles([])}
            onNext={() => setStep(2)}
          />
        )}

        {step === 2 && (
          <TemplateStep
            templates={templates}
            selectedId={templateId}
            onSelect={setTemplateId}
            onTemplateUploaded={(t) => setTemplates((prev) => [...prev, t])}
            fileCount={pendingFiles.filter((f) => !f.error).length}
            onBack={() => setStep(1)}
            onConvert={handleConvert}
          />
        )}

        {step === 3 && job && <ProcessingStep files={job.files} />}

        {step === 4 && job && reviewableFiles.length > 0 && (
          <ReviewStep
            jobId={job.id}
            templateName={selectedTemplate?.name ?? ""}
            files={reviewableFiles}
            activeIndex={Math.min(activeReviewIndex, reviewableFiles.length - 1)}
            onActiveIndexChange={setActiveReviewIndex}
            reviewedFileIds={reviewedFileIds}
            onMarkReviewed={(fileId) => setReviewedFileIds((prev) => new Set(prev).add(fileId))}
          />
        )}
      </main>
    </div>
  );
}

export default App;
