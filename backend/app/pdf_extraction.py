import io
import re
import uuid
import xml.etree.ElementTree as ET

from pypdf import PdfReader
from pypdf.generic import IndirectObject

from .models import Question

RADIO_FLAG = 1 << 15  # /Ff bit 16
MULTISELECT_FLAG = 1 << 21  # /Ff bit 22

NUMERIC_HINTS = ("depth", "count", "qty", "quantity", "amount", "number", "num", "total")
DATE_HINTS = ("date", "dob")

NS_RE = re.compile(r"\{.*\}")


def _resolve(obj):
    return obj.get_object() if isinstance(obj, IndirectObject) else obj


def _load_reader(pdf_bytes: bytes) -> PdfReader:
    """Open a PDF, transparently decrypting it if it's encrypted with an empty user
    password — the common case for official forms that only restrict editing."""
    reader = PdfReader(io.BytesIO(pdf_bytes))
    if reader.is_encrypted:
        reader.decrypt("")
    return reader


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


def _xfa_template_xml(reader: PdfReader) -> bytes | None:
    """Pull the `template` XDP packet out of a LiveCycle/XFA form's /AcroForm /XFA entry.

    Dynamic XFA forms (common for Caltrans/Adobe LiveCycle forms) keep their real field
    definitions here rather than as page /Annots — the PDF page itself is just a static
    "open this in Adobe Reader" placeholder.
    """
    root = reader.trailer["/Root"]
    acroform = root.get("/AcroForm")
    if acroform is None:
        return None
    acroform = _resolve(acroform)
    xfa = acroform.get("/XFA")
    if xfa is None:
        return None
    xfa = _resolve(xfa)
    if isinstance(xfa, list):
        for i in range(0, len(xfa) - 1, 2):
            if str(xfa[i]) == "template":
                return _resolve(xfa[i + 1]).get_data()
        return None
    try:
        return xfa.get_data()
    except AttributeError:
        return None


def detect_kind(pdf_bytes: bytes) -> tuple[str, int]:
    reader = _load_reader(pdf_bytes)
    page_count = len(reader.pages)
    if reader.get_fields():
        return "acroform", page_count
    if _xfa_template_xml(reader):
        return "xfa", page_count
    return "text", page_count


def extract_acroform_questions(pdf_bytes: bytes) -> list[Question]:
    reader = _load_reader(pdf_bytes)
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

            choice_list_id = slugify(field_name)
            if ft == "/Btn":
                if flags & RADIO_FLAG:
                    qtype, confidence = "select_one", 0.75
                else:
                    # A lone checkbox (not part of a radio group) is a boolean toggle —
                    # map it to the near-universal "yes_no" list rather than a one-off
                    # list that won't exist in the target template's choices sheet.
                    qtype, confidence, choice_list_id = "select_one", 0.8, "yes_no"
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
                    choice_list_id=choice_list_id if qtype in ("select_one", "select_multiple") else None,
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
    reader = _load_reader(pdf_bytes)
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


def _local_tag(el) -> str:
    return NS_RE.sub("", el.tag)


def _xfa_ui_kind(field_el) -> str | None:
    for child in field_el:
        if _local_tag(child) == "ui":
            for grandchild in child:
                return _local_tag(grandchild)
    return None


# Auto-generated Adobe LiveCycle/XFA bookkeeping fields — not real questions.
XFA_INTERNAL_FIELD_NAMES = {"frmid", "contextpath", "flat", "flattenserver"}

LONG_LABEL_CHARS = 160


def _xfa_field_type(field_el, name: str) -> tuple[str, float, bool, str | None]:
    """Returns (xlsform_type, confidence, skipped, choice_list_override)."""
    ui_kind = _xfa_ui_kind(field_el)
    if ui_kind == "checkButton":
        # A lone checkbox is a boolean toggle — map it to the near-universal "yes_no"
        # list rather than a one-off list that won't exist in the target template.
        return "select_one", 0.8, False, "yes_no"
    if ui_kind == "choiceList":
        return "select_one", 0.75, False, None
    if ui_kind == "dateTimeEdit":
        return "date", 0.85, False, None
    if ui_kind in ("numericEdit", "decimalEdit"):
        return "decimal", 0.8, False, None
    if ui_kind == "imageEdit":
        return "image", 0.75, False, None
    if ui_kind == "signature":
        return "note", 0.3, True, None
    if ui_kind == "passwordEdit":
        return "text", 0.85, False, None
    if ui_kind == "barcode":
        return "text", 0.6, False, None
    if ui_kind == "button" or ui_kind is None:
        return "note", 0.0, True, None
    qtype, confidence = _guess_type(name)
    return qtype, confidence, False, None


def _xfa_field_label(el) -> str | None:
    for child in el:
        if _local_tag(child) != "caption":
            continue
        texts = [t.text.strip() for t in child.iter() if _local_tag(t) == "text" and t.text and t.text.strip()]
        if texts:
            return " ".join(texts)
        # HTML-in-XFA captions (<exData contentType="text/html"><body><p>...</p></body>)
        # can nest inline tags like <span> for tab stops — a <p>'s own `.text` only
        # covers text before the first nested tag, so text after e.g. a numbering
        # <span> (the actual label) would otherwise be silently dropped. itertext()
        # walks the whole subtree in document order, including text after nested tags.
        paras = []
        for p in child.iter():
            if _local_tag(p) != "p":
                continue
            full = re.sub(r"\s+", " ", "".join(p.itertext())).strip()
            if full:
                paras.append(full)
        if paras:
            return " ".join(paras)
    for child in el:
        if _local_tag(child) == "assist":
            for t in child.iter():
                if _local_tag(t) == "speak" and t.text and t.text.strip():
                    return t.text.strip().split("\n")[0][:120]
    return None


def extract_xfa_questions(pdf_bytes: bytes) -> list[Question]:
    reader = _load_reader(pdf_bytes)
    xml_bytes = _xfa_template_xml(reader)
    if not xml_bytes:
        return []

    root = ET.fromstring(xml_bytes)
    questions: list[Question] = []
    used_slugs: set[str] = set()
    order = 0

    def unique_slug(name: str, path: list[str]) -> str:
        candidate = slugify(name)
        if candidate not in used_slugs:
            used_slugs.add(candidate)
            return candidate
        candidate = slugify(".".join(path + [name]))
        while candidate in used_slugs:
            candidate = f"{candidate}_{uuid.uuid4().hex[:4]}"
        used_slugs.add(candidate)
        return candidate

    def walk(el, path: list[str]) -> None:
        nonlocal order
        tag = _local_tag(el)

        if tag in ("pageSet", "draw"):
            return

        if tag == "exclGroup":
            name = el.get("name") or f"group_{uuid.uuid4().hex[:6]}"
            slug = unique_slug(name, path)
            label = _xfa_field_label(el) or prettify(name)
            order += 1
            questions.append(
                Question(
                    id=uuid.uuid4().hex,
                    order=order,
                    label=label,
                    name=slug,
                    type="select_one",
                    choice_list_id=slug,
                    confidence=0.7,
                    page=1,
                    bbox=[0.0, 0.0, 1.0, 1.0],
                )
            )
            return

        if tag == "field":
            name = el.get("name") or f"field_{uuid.uuid4().hex[:6]}"
            if name.lower() in XFA_INTERNAL_FIELD_NAMES:
                return  # LiveCycle bookkeeping field, not a real question
            qtype, confidence, skipped, choice_override = _xfa_field_type(el, name)
            if skipped and confidence == 0.0:
                return  # plain UI buttons carry no data worth surfacing
            slug = unique_slug(name, path)
            raw_label = _xfa_field_label(el) or prettify(name)
            if len(raw_label) > LONG_LABEL_CHARS:
                # A caption this long is almost always instructional/legal boilerplate
                # rather than a real question label — flag it for review and trim it
                # down to something that fits in a spreadsheet cell.
                confidence = min(confidence, 0.3)
                label = raw_label[:LONG_LABEL_CHARS].rsplit(" ", 1)[0] + "…"
            else:
                label = raw_label
            choice_list_id = choice_override or slug
            order += 1
            questions.append(
                Question(
                    id=uuid.uuid4().hex,
                    order=order,
                    label=label,
                    name=slug,
                    type=qtype,
                    choice_list_id=choice_list_id if qtype in ("select_one", "select_multiple") else None,
                    confidence=confidence,
                    page=1,
                    bbox=[0.0, 0.0, 1.0, 1.0],
                    skipped=skipped,
                    skip_reason="signature — not supported" if skipped else None,
                )
            )
            return

        next_path = path
        if tag == "subform":
            subform_name = el.get("name")
            if subform_name:
                next_path = path + [subform_name]
        for child in el:
            walk(child, next_path)

    walk(root, [])
    return questions


def extract_questions(pdf_bytes: bytes, kind: str) -> list[Question]:
    if kind == "acroform":
        return extract_acroform_questions(pdf_bytes)
    if kind == "xfa":
        return extract_xfa_questions(pdf_bytes)
    return extract_text_questions(pdf_bytes)
