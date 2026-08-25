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

Then open http://localhost:5173. The backend seeds the real "Caltrans Common
Form Template" (`backend/sample_templates/caltrans_common_form_template.xlsx`)
as the default template on startup.

## Deploying as one process

This is meant to run as a hosted web tool (a browser app, not something users
download). For deployment, build the frontend once and let the backend serve
it directly — no separate frontend server, no CORS, one port to run:

```
cd frontend && npm install && npm run build && cd ..
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Open http://localhost:8000 — that single process now serves both the API
and the app.

### Docker

```
docker build -t pdf-survey123 .
docker run -p 8000:8000 pdf-survey123
```

The image does the same frontend build + single-process serve in a
multi-stage build (Node to build the frontend, then a slim Python image to
run it). Note: this hasn't been build-tested in this environment because
its network policy blocks pulling base images from Docker Hub — verify the
build somewhere with normal registry access before relying on it.

### Notes for real deployment

Job/template/export state currently lives in an in-memory store (by design —
this is a stateless conversion tool, not something meant to retain history
across restarts). That does mean: only run one backend process/worker at a
time (a second process wouldn't share state), and a restart clears anything
mid-review. Put a reverse proxy in front for TLS/auth if this needs to be
reachable outside a trusted internal network — the app itself does neither.

### Template convention

A template's `survey` sheet may include a `begin group` / `end group` block
named `grp_form_content` (see the sample template) as a placeholder — the
questions extracted from each PDF are inserted there on export, split into
per-page sub-groups when a PDF spans more than one page.
