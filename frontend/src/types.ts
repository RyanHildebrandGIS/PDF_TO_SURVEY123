export type FileKind = "acroform" | "xfa" | "text";
export type FileStatus = "queued" | "parsing" | "matching" | "done" | "failed";
export type XLSFormType =
  | "text"
  | "integer"
  | "decimal"
  | "date"
  | "select_one"
  | "select_multiple"
  | "geopoint"
  | "image"
  | "note";

export interface TemplateMeta {
  id: string;
  name: string;
  columns: number;
  choice_lists: number;
  geopoint_required: boolean;
}

export interface FileMeta {
  id: string;
  name: string;
  page_count: number;
  kind: FileKind;
  status: FileStatus;
  progress: number;
  phase: string;
  questions_found: number;
  error: string | null;
}

/** One node of the template's existing survey structure (outside the
 * grp_form_content placeholder) — a group with nested items, or a leaf
 * question — in document order. Shown read-only in Review so it's clear
 * what's already there, with its real group headers, versus what this PDF
 * is adding. */
export interface BaseItem {
  kind: "group" | "question";
  name: string;
  label: string;
  type: string | null;
  questions: BaseItem[] | null;
}

export interface ChoiceOption {
  name: string;
  label: string;
}

export type ChoiceLists = Record<string, ChoiceOption[]>;

export interface JobStatus {
  id: string;
  template_id: string | null;
  files: FileMeta[];
}

export interface Question {
  id: string;
  order: number;
  label: string;
  name: string;
  type: XLSFormType;
  choice_list_id: string | null;
  appearance: string | null;
  confidence: number;
  page: number;
  bbox: [number, number, number, number];
  confirmed: boolean;
  skipped: boolean;
  skip_reason: string | null;
}

export interface QuestionPatch {
  label?: string;
  name?: string;
  type?: XLSFormType;
  choice_list_id?: string | null;
  confirmed?: boolean;
  skipped?: boolean;
  skip_reason?: string | null;
}

/** A file the user has picked but not yet uploaded to the backend (step 1). */
export interface PendingFile {
  localId: string;
  file: File;
  pageCount: number | null;
  kind: FileKind | null;
  error: string | null;
}
