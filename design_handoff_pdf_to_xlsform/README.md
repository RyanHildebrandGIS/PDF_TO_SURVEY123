# Handoff: PDF → XLSForm Converter for Survey123 (option 1a, guided stepper)

## Overview
An internal Caltrans web tool that takes one or more PDF forms (fillable AcroForm PDFs and
text-based documents), extracts the questions, maps them to Survey123 XLSForm field types
against a chosen saved template, lets a user review the mapping side-by-side with the PDF
page, and exports one `.xlsx` per PDF.

Users: GIS analysts building Survey123 forms, consultants converting client paper forms,
a small internal team.

## About the Design Files
The files in this bundle are **design references created in HTML** — a wireframe prototype
showing intended structure, flow and copy. They are **not production code to copy**. The task
is to recreate these screens in the target codebase's existing environment (React, Vue, etc.)
using its established patterns, component library and routing. If no codebase exists yet,
pick a framework (a React + TypeScript SPA with a Python backend for PDF parsing is the
natural fit) and implement the designs there.

## Fidelity
**Low-fidelity wireframe.** Layout, hierarchy, flow, copy and states are the deliverable.
Colors and type here are a Caltrans-flavored placeholder palette — swap in the real Caltrans
brand tokens and logo asset. Treat the visual details below as a starting point, not as pixel spec.

## Screens / Views

The flow is a 4-step stepper: **1 Upload → 2 Template → 3 Processing → 4 Review & Export.**
A persistent app bar sits above it (brand lockup left; Templates / History links right).
Content column is left-aligned, max ~720px in the wireframe; go full-width responsive in the build.

### 1. Upload
- **Purpose:** choose the PDFs to convert.
- **Layout:** stepper chips row; H1 "Drop the PDFs you want to convert"; large dashed
  drop zone (~30px vertical padding, centered icon + "Drop files here, or browse" +
  sub-line "Fillable forms and text documents · one or many"); below it a vertical list of
  queued files, gap 8px.
- **File row:** type chip ("pdf") · filename (flex:1) · meta ("3 pages · fillable") · remove ✕.
- **Footer:** left hint "Each PDF exports as its own .xlsx"; right `Cancel` (secondary) and
  `Choose template →` (primary, disabled until ≥1 file).
- **States:** empty (no list), dragging-over (accent border on drop zone), rejected file
  (non-PDF / encrypted / >N MB → inline error on the row), duplicate filename.

### 2. Template
- **Purpose:** pick the saved XLSForm template the output must follow.
- **Layout:** H1 "Which template should these follow?"; sub-line explaining that column set,
  choice lists and settings sheet come from the template and detected questions fill it in;
  2-column card grid, gap 10px.
- **Template card:** kicker ("selected" / "saved"), name (semibold), meta line
  ("28 columns · 6 choice lists · geopoint required"). Selected card = 2px accent border.
- **Last cell:** dashed "+ Upload a template".
- **Footer:** `Back`, `Convert 2 files →` (primary, label reflects file count).
- **States:** no saved templates (dashed upload cell only), invalid template upload
  (missing survey/choices sheet → error), template applies to the whole batch.

### 3. Processing
- **Purpose:** show extraction progress; user may leave.
- **Layout:** H1 "Reading forms…"; one card per file, gap 10px. Card = filename (semibold,
  flex:1) + status right ("page 2 of 3 · 24 questions found"), 7px progress bar
  (accent fill on #E4E7E5 track), sub-line of the current phase
  ("Extracting fields → matching template columns"). Queued files render at 65% opacity
  with an empty track. Footer note: "You can leave this page — we'll keep going."
- **States:** queued, parsing, matching, done, failed (retry action on the card).

### 4. Review & Export (the core screen)
- **Purpose:** confirm detected questions and their Survey123 types against the PDF.
- **Layout:** toolbar (filename, template chip, right-aligned "5 low confidence" flag chip,
  `Export .xlsx` primary) over a 2-column grid **44% PDF / 56% question list**, min-height 330px,
  divided by a vertical rule.
  - **Left — PDF pane:** "Page 2 / 3" + zoom −/+ ; the rendered page fills the pane.
    Detected fields are highlighted; the field for the selected row gets an accent/gold overlay.
  - **Right — question list:** filter chips ("All 24", "Low confidence 5", "Skipped 2"),
    then rows. Row = index · label (semibold) + `name:` slug beneath · field-type
    `<select>` · status (✓ or "check" flag chip). Low-confidence rows carry a gold tinted
    background and a gold left border. Skipped rows are 55% opacity with an undo ↺.
  - **Footer:** "2 of 2 files reviewed" + `Next file →`.
- **Only flag low-confidence guesses.** Do not surface unmapped-question or template-violation
  warnings in the UI (explicit product decision) — beyond blocking export if the template's
  required questions (e.g. geopoint) are unfilled.
- **States:** clean file (no flag chip), all rows confirmed, editing a field name (inline),
  changing a type (choice-list picker appears for select_one/select_multiple), exporting,
  export complete (download + link to History).

## Interactions & Behavior
- Stepper is linear; steps 1–2 are re-enterable via Back, which preserves the queue.
- Clicking a highlighted field in the PDF pane selects (and scrolls to) its row; selecting a
  row scrolls the PDF to that field's page and highlights it.
- Field-type change is optimistic and local; nothing re-parses.
- Filter chips filter the row list in place.
- `Export .xlsx` writes one workbook per PDF (never a merged sheet, never sheet-per-PDF);
  batch export zips them.
- Processing continues server-side if the user navigates away; History lists past runs.
- Keyboard: Tab/Enter move through unconfirmed rows; ⌘/Ctrl+↵ exports.
- No animation beyond progress bars and 120ms state transitions.

## State Management
- `files[]`: { id, name, pageCount, kind: 'acroform'|'text', status, progress, error }
- `templateId` (one per conversion, applies to the batch) and `templates[]` from the saved list
- `step`: 1–4
- `questions[fileId][]`: { id, order, label, name, type, choiceListId?, confidence,
  page, bbox, confirmed, skipped }
- `activeFileId`, `activeQuestionId`, `filter`
- `reviewedFileIds`, `exports[]`
- Fetching: POST files → job id; poll or stream job progress; GET extraction result per file;
  POST confirmed mapping → GET generated .xlsx.

## Design Tokens (placeholder Caltrans palette — replace with official values)
- Accent / primary: `#00693E`; pressed `#00522F`
- Attention (low-confidence only): `#F2A900`; tint `rgba(242,169,0,.12)`; text on tint `#6B4A00`
- Ink `#1C1F1D` · secondary text `#6B7370` · rule `#C8CDCA` · track `#E4E7E5`
- Surface `#FFFFFF` · app ground `#FAFBFA`
- Type: Archivo — H1 17px/1.2 600; body 12.5px/1.45 500; small 11px/1.4 400;
  label 10px 600 uppercase, letter-spacing .1em (wireframe sizes are compact — scale up
  to the codebase's base 14–16px)
- Radius: 0 everywhere. Rules: 1px hairlines, 2px for major dividers and the app bar.
- Spacing: 4 / 8 / 10 / 12 / 16 / 20px
- No shadows.

## Assets
- **Caltrans logo:** not included. The wireframe uses a green text block reading "Caltrans" as
  a placeholder — replace with the official logo asset and follow Caltrans brand guidance.
- Icons: Lucide (upload, file-text, chevron-left/right, zoom-in/out, check, alert-triangle, undo).
- No photography.

## Files
- `PDF to Survey123 Wireframes.dc.html` — the wireframe document. **Option `1a` is the
  approved direction** (anchor `#1a`); options `1b` (batch workbench) and `1c` (page-first
  annotation) are alternates kept for context — do not build them.
- `PROMPT.md` — a ready-to-paste first prompt for Claude Code.

## Getting this into GitHub + Claude Code
1. Download and unzip this folder.
2. `gh repo create caltrans-pdf-to-xlsform --private --source . --push`
   (or create the repo in the GitHub UI, then `git init && git add . && git commit -m "design handoff" && git remote add origin … && git push -u origin main`).
3. In the repo root run `claude`, then paste the contents of `PROMPT.md`.
