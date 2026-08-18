import type { BaseQuestion, JobStatus, Question, QuestionPatch, TemplateMeta } from "./types";

// Empty string = relative to the current origin, i.e. "the backend serving this page".
// Overridden for `npm run dev` via .env.development, where frontend and backend run
// as separate processes on different ports.
const API_BASE = import.meta.env.VITE_API_BASE ?? "";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function listTemplates(): Promise<TemplateMeta[]> {
  return fetch(`${API_BASE}/templates`).then((r) => json(r));
}

export function listBaseQuestions(templateId: string): Promise<BaseQuestion[]> {
  return fetch(`${API_BASE}/templates/${templateId}/base-questions`).then((r) => json(r));
}

export function uploadTemplate(file: File): Promise<TemplateMeta> {
  const form = new FormData();
  form.append("file", file);
  return fetch(`${API_BASE}/templates`, { method: "POST", body: form }).then((r) => json(r));
}

export function createJob(files: File[]): Promise<JobStatus> {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  return fetch(`${API_BASE}/jobs`, { method: "POST", body: form }).then((r) => json(r));
}

export function startJob(jobId: string, templateId: string): Promise<JobStatus> {
  return fetch(`${API_BASE}/jobs/${jobId}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ template_id: templateId }),
  }).then((r) => json(r));
}

export function getJob(jobId: string): Promise<JobStatus> {
  return fetch(`${API_BASE}/jobs/${jobId}`).then((r) => json(r));
}

export function getQuestions(jobId: string, fileId: string): Promise<Question[]> {
  return fetch(`${API_BASE}/jobs/${jobId}/files/${fileId}/questions`).then((r) => json(r));
}

export function patchQuestion(
  jobId: string,
  fileId: string,
  questionId: string,
  patch: QuestionPatch,
): Promise<Question> {
  return fetch(`${API_BASE}/jobs/${jobId}/files/${fileId}/questions/${questionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).then((r) => json(r));
}

export function pdfUrl(jobId: string, fileId: string): string {
  return `${API_BASE}/jobs/${jobId}/files/${fileId}/pdf`;
}

export function exportFile(jobId: string, fileId: string): Promise<{ export_id: string; filename: string }> {
  return fetch(`${API_BASE}/jobs/${jobId}/files/${fileId}/export`, { method: "POST" }).then((r) => json(r));
}

export function downloadExportUrl(exportId: string): string {
  return `${API_BASE}/exports/${exportId}/download`;
}
