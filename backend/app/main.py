import asyncio
import os

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from .models import FileMeta, JobStatus, Question, QuestionPatch, StartJobRequest, TemplateMeta
from .pdf_extraction import detect_kind, extract_questions
from .seed import build_sample_template
from .storage import ExportRecord, FileRecord, JobRecord, TemplateRecord, store
from .xlsform import InvalidTemplateError, build_template_meta, export_workbook

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "templates")
SAMPLE_TEMPLATE_PATH = os.path.join(os.path.dirname(__file__), "..", "sample_templates", "standard_inspection_v4.xlsx")

app = FastAPI(title="PDF to Survey123 Converter")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def seed_sample_template() -> None:
    build_sample_template(SAMPLE_TEMPLATE_PATH)
    template_id = "standard_inspection_v4"
    meta = build_template_meta(template_id, "Standard Inspection v4", SAMPLE_TEMPLATE_PATH)
    store.templates[template_id] = TemplateRecord(meta=meta, path=SAMPLE_TEMPLATE_PATH)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/templates", response_model=list[TemplateMeta])
def list_templates() -> list[TemplateMeta]:
    return [record.meta for record in store.templates.values()]


@app.post("/templates", response_model=TemplateMeta)
async def upload_template(file: UploadFile) -> TemplateMeta:
    template_id = store.new_id()
    os.makedirs(DATA_DIR, exist_ok=True)
    path = os.path.join(DATA_DIR, f"{template_id}.xlsx")
    content = await file.read()
    with open(path, "wb") as f:
        f.write(content)

    name = os.path.splitext(file.filename or "Uploaded template")[0]
    try:
        meta = build_template_meta(template_id, name, path)
    except InvalidTemplateError as exc:
        os.remove(path)
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    store.templates[template_id] = TemplateRecord(meta=meta, path=path)
    return meta


def _job_status(job: JobRecord) -> JobStatus:
    return JobStatus(id=job.id, template_id=job.template_id, files=[r.meta for r in job.files.values()])


@app.post("/jobs", response_model=JobStatus)
async def create_job(files: list[UploadFile]) -> JobStatus:
    if not files:
        raise HTTPException(status_code=400, detail="At least one PDF is required")

    job_id = store.new_id()
    job = JobRecord(id=job_id)
    for upload in files:
        content = await upload.read()
        if not content.startswith(b"%PDF"):
            raise HTTPException(status_code=400, detail=f"{upload.filename} is not a valid PDF")
        try:
            kind, page_count = detect_kind(content)
        except Exception as exc:  # pragma: no cover - malformed PDF
            raise HTTPException(status_code=400, detail=f"Could not read {upload.filename}: {exc}") from exc

        file_id = store.new_id()
        meta = FileMeta(id=file_id, name=upload.filename or "untitled.pdf", page_count=page_count, kind=kind)
        job.files[file_id] = FileRecord(meta=meta, pdf_bytes=content, kind_detected=kind)

    store.jobs[job_id] = job
    return _job_status(job)


async def _process_file(job: JobRecord, file_record: FileRecord) -> None:
    meta = file_record.meta
    meta.status = "parsing"
    meta.phase = "Extracting fields"
    for page in range(1, meta.page_count + 1):
        meta.progress = int(page / meta.page_count * 60)
        meta.phase = f"page {page} of {meta.page_count} · extracting fields"
        await asyncio.sleep(0.1)

    meta.status = "matching"
    meta.phase = "Matching template columns"
    try:
        questions = extract_questions(file_record.pdf_bytes, file_record.kind_detected)
    except Exception as exc:
        meta.status = "failed"
        meta.error = str(exc)
        return

    await asyncio.sleep(0.1)
    file_record.questions = questions
    meta.progress = 100
    meta.questions_found = len(questions)
    meta.status = "done"
    meta.phase = "done"


@app.post("/jobs/{job_id}/start", response_model=JobStatus)
async def start_job(job_id: str, body: StartJobRequest) -> JobStatus:
    job = store.jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if body.template_id not in store.templates:
        raise HTTPException(status_code=404, detail="Template not found")

    job.template_id = body.template_id
    for file_record in job.files.values():
        asyncio.create_task(_process_file(job, file_record))
    return _job_status(job)


@app.get("/jobs/{job_id}", response_model=JobStatus)
def get_job(job_id: str) -> JobStatus:
    job = store.jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return _job_status(job)


def _get_file(job_id: str, file_id: str) -> FileRecord:
    job = store.jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    file_record = job.files.get(file_id)
    if file_record is None:
        raise HTTPException(status_code=404, detail="File not found")
    return file_record


@app.get("/jobs/{job_id}/files/{file_id}/questions", response_model=list[Question])
def get_questions(job_id: str, file_id: str) -> list[Question]:
    return _get_file(job_id, file_id).questions


@app.patch("/jobs/{job_id}/files/{file_id}/questions/{question_id}", response_model=Question)
def patch_question(job_id: str, file_id: str, question_id: str, patch: QuestionPatch) -> Question:
    file_record = _get_file(job_id, file_id)
    for q in file_record.questions:
        if q.id == question_id:
            update = patch.model_dump(exclude_unset=True)
            for k, v in update.items():
                setattr(q, k, v)
            return q
    raise HTTPException(status_code=404, detail="Question not found")


@app.get("/jobs/{job_id}/files/{file_id}/pdf")
def get_pdf(job_id: str, file_id: str) -> Response:
    file_record = _get_file(job_id, file_id)
    return Response(content=file_record.pdf_bytes, media_type="application/pdf")


@app.post("/jobs/{job_id}/files/{file_id}/export")
def export_file(job_id: str, file_id: str) -> dict:
    job = store.jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    file_record = _get_file(job_id, file_id)
    if job.template_id is None:
        raise HTTPException(status_code=400, detail="Job has no template selected")
    template = store.templates.get(job.template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")

    if template.meta.geopoint_required and not any(
        q.type == "geopoint" and q.confirmed and not q.skipped for q in file_record.questions
    ):
        raise HTTPException(status_code=400, detail="Template requires a confirmed geopoint question")

    try:
        content = export_workbook(template.path, file_record.questions)
    except InvalidTemplateError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    export_id = store.new_id()
    filename = os.path.splitext(file_record.meta.name)[0] + ".xlsx"
    store.exports[export_id] = ExportRecord(id=export_id, filename=filename, content=content)
    return {"export_id": export_id, "filename": filename}


@app.get("/exports/{export_id}/download")
def download_export(export_id: str) -> Response:
    export_record = store.exports.get(export_id)
    if export_record is None:
        raise HTTPException(status_code=404, detail="Export not found")
    return Response(
        content=export_record.content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{export_record.filename}"'},
    )
