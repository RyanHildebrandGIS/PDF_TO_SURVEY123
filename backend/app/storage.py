import uuid
from dataclasses import dataclass, field

from .models import FileMeta, NewGroup, Question, TemplateMeta


@dataclass
class TemplateRecord:
    meta: TemplateMeta
    path: str


@dataclass
class FileRecord:
    meta: FileMeta
    pdf_bytes: bytes
    kind_detected: str
    questions: list[Question] = field(default_factory=list)
    groups: list[NewGroup] = field(default_factory=list)


@dataclass
class JobRecord:
    id: str
    template_id: str | None = None
    files: dict[str, FileRecord] = field(default_factory=dict)


@dataclass
class ExportRecord:
    id: str
    filename: str
    content: bytes


class Store:
    def __init__(self) -> None:
        self.templates: dict[str, TemplateRecord] = {}
        self.jobs: dict[str, JobRecord] = {}
        self.exports: dict[str, ExportRecord] = {}

    def new_id(self) -> str:
        return uuid.uuid4().hex


store = Store()
