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

/** One node of the template's existing survey structure — a group with
 * nested items, a leaf question, or the placeholder marker showing exactly
 * where this PDF's new content will be inserted — in document order. Shown
 * read-only in Review so it's clear what's already there, with its real
 * group headers, versus what this PDF is adding. */
export interface BaseItem {
  kind: "group" | "question" | "placeholder";
  name: string;
  label: string;
  type: string | null;
  questions: BaseItem[] | null;
}

/** A group the reviewer created to organize this PDF's new content — becomes
 * its own begin group/end group block at export time. */
export interface NewGroup {
  name: string;
  label: string;
  order: number;
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
  alias: string | null;
  group: string | null;
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
  alias?: string | null;
  group?: string | null;
  order?: number;
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
