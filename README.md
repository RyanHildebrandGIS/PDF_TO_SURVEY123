# PDF_TO_SURVEY123
Takes raw pdfs extracts data and place information into a form.

An internal tool that extracts questions from PDF forms (fillable AcroForm PDFs
and text-based documents), maps them to a chosen Survey123 XLSForm template,
and lets a reviewer confirm the mapping side-by-side with the PDF before
exporting one `.xlsx` per PDF. See `design_handoff_pdf_to_xlsform/README.md`
for the full design spec.

## Running locally

**Backend** (FastAPI):
```
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --port 8000
```

**Frontend** (React + Vite):
```
cd frontend
npm install
npm run dev
```

Then open http://localhost:5173. The backend seeds a sample "Standard
Inspection v4" XLSForm template on first run.

### Template convention

A template's `survey` sheet may include a `begin group` / `end group` block
named `grp_form_content` (see the sample template) as a placeholder — the
questions extracted from each PDF are inserted there on export, split into
per-page sub-groups when a PDF spans more than one page.
