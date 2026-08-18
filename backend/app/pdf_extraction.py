import io
import re
import uuid

from pypdf import PdfReader
from pypdf.generic import IndirectObject

from .models import Question

RADIO_FLAG = 1 << 15  # /Ff bit 16
MULTISELECT_FLAG = 1 << 21  # /Ff bit 22

NUMERIC_HINTS = ("depth", "count", "qty", "quantity", "amount", "number", "num", "total")
DATE_HINTS = ("date", "dob")


def _resolve(obj):
    return obj.get_object() if isinstance(obj, IndirectObject) else obj


def _field_name(annot) -> str:
    parts = []
    node = annot
    while node is not None:
        t = node.get("/T")
        if t:
            parts.append(str(t))
        parent = node.get("/Parent")
        node = _resolve(parent) if parent is not None else None
    return ".".join(reversed(parts)) if parts else f"field_{uuid.uuid4().hex[:6]}"


def _field_type(annot) -> str | None:
    node = annot
    while node is not None:
        ft = node.get("/FT")
        if ft:
            return str(ft)
        parent = node.get("/Parent")
        node = _resolve(parent) if parent is not None else None
    return None


def _field_flags(annot) -> int:
    node = annot
    while node is not None:
        ff = node.get("/Ff")
        if ff is not None:
            return int(ff)
        parent = node.get("/Parent")
        node = _resolve(parent) if parent is not None else None
    return 0


def _tooltip(annot) -> str | None:
    node = annot
    while node is not None:
        tu = node.get("/TU")
        if tu:
            return str(tu)
        parent = node.get("/Parent")
        node = _resolve(parent) if parent is not None else None
    return None


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "_", name).strip("_").lower()
    return slug or f"q_{uuid.uuid4().hex[:6]}"


def prettify(name: str) -> str:
    label = re.sub(r"[._]+", " ", name).strip()
    label = re.sub(r"([a-z])([A-Z])", r"\1 \2", label)
    return label[:1].upper() + label[1:] if label else "Untitled question"


def _guess_type(field_name: str) -> tuple[str, float]:
    lower = field_name.lower()
    if any(h in lower for h in DATE_HINTS):
        return "date", 0.7
    if any(h in lower for h in NUMERIC_HINTS):
        return "decimal", 0.7
    return "text", 0.9


def _export_states(widget) -> list[str]:
    states: list[str] = []
    ap = widget.get("/AP")
    if not ap:
        return states
    normal = _resolve(ap.get("/N")) if ap.get("/N") is not None else None
    if normal is None:
        return states
    try:
        keys = list(normal.keys())
    except AttributeError:
        return states
    for k in keys:
        key = str(k).lstrip("/")
        if key.lower() != "off":
            states.append(key)
    return states


def _norm_bbox(rect, media_box) -> list[float]:
    px0, py0, px1, py1 = (float(v) for v in rect)
    mx0, my0, mx1, my1 = (float(v) for v in media_box)
    width = mx1 - mx0 or 1.0
    height = my1 - my0 or 1.0
    left = (min(px0, px1) - mx0) / width
    right = (max(px0, px1) - mx0) / width
    top = 1 - (max(py0, py1) - my0) / height
    bottom = 1 - (min(py0, py1) - my0) / height
    return [round(v, 4) for v in (left, top, right, bottom)]


def detect_kind(pdf_bytes: bytes) -> tuple[str, int]:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    page_count = len(reader.pages)
    has_fields = bool(reader.get_fields())
    return ("acroform" if has_fields else "text"), page_count


def extract_acroform_questions(pdf_bytes: bytes) -> list[Question]:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    questions: list[Question] = []
    seen_field_names: set[str] = set()
    order = 0

    for page_index, page in enumerate(reader.pages):
        annots = page.get("/Annots")
        if not annots:
            continue
        media_box = page.mediabox
        for annot_ref in annots:
            annot = _resolve(annot_ref)
            if annot.get("/Subtype") != "/Widget":
                continue
            ft = _field_type(annot)
            if ft is None:
                continue
            field_name = _field_name(annot)
            if field_name in seen_field_names:
                continue

            rect = annot.get("/Rect")
            bbox = _norm_bbox(rect, media_box) if rect else [0.0, 0.0, 1.0, 1.0]
            tooltip = _tooltip(annot)
            label = tooltip or prettify(field_name)
            flags = _field_flags(annot)

            if ft == "/Btn":
                if flags & RADIO_FLAG:
                    qtype, confidence = "select_one", 0.75
                else:
                    qtype, confidence = "select_one", 0.8
            elif ft == "/Ch":
                qtype = "select_multiple" if flags & MULTISELECT_FLAG else "select_one"
                confidence = 0.85
            elif ft == "/Sig":
                qtype, confidence = "note", 0.3
            else:
                qtype, confidence = _guess_type(field_name)

            seen_field_names.add(field_name)
            order += 1
            skipped = ft == "/Sig"
            questions.append(
                Question(
                    id=uuid.uuid4().hex,
                    order=order,
                    label=label,
                    name=slugify(field_name),
                    type=qtype,
                    choice_list_id=slugify(field_name) if qtype in ("select_one", "select_multiple") else None,
                    confidence=confidence,
                    page=page_index + 1,
                    bbox=bbox,
                    skipped=skipped,
                    skip_reason="not in template" if skipped else None,
                )
            )
    return questions


QUESTION_LINE_RE = re.compile(r".{2,120}[:?]\s*$|_{3,}")


def extract_text_questions(pdf_bytes: bytes) -> list[Question]:
    reader = PdfReader(io.BytesIO(pdf_bytes))
    questions: list[Question] = []
    order = 0
    for page_index, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        for raw_line in text.splitlines():
            line = raw_line.strip()
            if not line or not QUESTION_LINE_RE.search(line):
                continue
            label = line.rstrip(":?_ ").strip()
            if len(label) < 3:
                continue
            order += 1
            qtype, _ = _guess_type(label)
            questions.append(
                Question(
                    id=uuid.uuid4().hex,
                    order=order,
                    label=prettify(label),
                    name=slugify(label),
                    type=qtype,
                    confidence=0.45,
                    page=page_index + 1,
                    bbox=[0.0, 0.0, 1.0, 1.0],
                )
            )
    return questions


def extract_questions(pdf_bytes: bytes, kind: str) -> list[Question]:
    if kind == "acroform":
        return extract_acroform_questions(pdf_bytes)
    return extract_text_questions(pdf_bytes)
