from typing import Literal, Optional

from pydantic import BaseModel

FileKind = Literal["acroform", "xfa", "text"]
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


class BaseItem(BaseModel):
    """One node in a template's existing survey structure — a group (with nested
    items), a leaf question, or the placeholder marker showing where this PDF's
    new content will be inserted — in document order."""

    kind: Literal["group", "question", "placeholder"]
    name: str
    label: str
    type: Optional[str] = None
    questions: Optional[list["BaseItem"]] = None


BaseItem.model_rebuild()


class ChoiceOption(BaseModel):
    name: str
    label: str


class ChoiceListsPayload(BaseModel):
    lists: dict[str, list[ChoiceOption]]


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
    alias: Optional[str] = None
    group: Optional[str] = None
    type: XLSFormType
    choice_list_id: Optional[str] = None
    appearance: Optional[str] = None
    confidence: float
    page: int
    bbox: list[float]
    confirmed: bool = False
    skipped: bool = False
    skip_reason: Optional[str] = None


class QuestionPatch(BaseModel):
    label: Optional[str] = None
    alias: Optional[str] = None
    group: Optional[str] = None
    order: Optional[int] = None
    type: Optional[XLSFormType] = None
    choice_list_id: Optional[str] = None
    confirmed: Optional[bool] = None
    skipped: Optional[bool] = None
    skip_reason: Optional[str] = None


class NewGroup(BaseModel):
    """A group the reviewer created to organize this PDF's new content —
    inserted as its own `begin group`/`end group` block at export time."""

    name: str
    label: str
    order: int


class NewGroupCreate(BaseModel):
    label: str


class NewGroupPatch(BaseModel):
    label: Optional[str] = None
    order: Optional[int] = None


class StartJobRequest(BaseModel):
    template_id: str


class JobStatus(BaseModel):
    id: str
    template_id: Optional[str] = None
    files: list[FileMeta]
