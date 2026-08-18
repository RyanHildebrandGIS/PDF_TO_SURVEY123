from typing import Literal, Optional

from pydantic import BaseModel

FileKind = Literal["acroform", "text"]
FileStatus = Literal["queued", "parsing", "matching", "done", "failed"]
XLSFormType = Literal[
    "text", "integer", "decimal", "date", "select_one", "select_multiple",
    "geopoint", "image", "note",
]


class TemplateMeta(BaseModel):
    id: str
    name: str
    columns: int
    choice_lists: int
    geopoint_required: bool


class FileMeta(BaseModel):
    id: str
    name: str
    page_count: int
    kind: FileKind
    status: FileStatus = "queued"
    progress: int = 0
    phase: str = ""
    questions_found: int = 0
    error: Optional[str] = None


class Question(BaseModel):
    id: str
    order: int
    label: str
    name: str
    type: XLSFormType
    choice_list_id: Optional[str] = None
    confidence: float
    page: int
    bbox: list[float]
    confirmed: bool = False
    skipped: bool = False
    skip_reason: Optional[str] = None


class QuestionPatch(BaseModel):
    label: Optional[str] = None
    name: Optional[str] = None
    type: Optional[XLSFormType] = None
    choice_list_id: Optional[str] = None
    confirmed: Optional[bool] = None
    skipped: Optional[bool] = None


class StartJobRequest(BaseModel):
    template_id: str


class JobStatus(BaseModel):
    id: str
    template_id: Optional[str] = None
    files: list[FileMeta]
