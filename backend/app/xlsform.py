import html
import io
import re

import openpyxl

from .models import Question, TemplateMeta

_HTML_TAG_RE = re.compile(r"<[^>]+>")


def _strip_html(text: str) -> str:
    return html.unescape(_HTML_TAG_RE.sub("", text)).strip()

PLACEHOLDER_GROUP_NAME = "grp_form_content"


class InvalidTemplateError(Exception):
    pass


def _header(ws) -> list[str]:
    return [str(c.value).strip() for c in next(ws.iter_rows(min_row=1, max_row=1)) if c.value]


def build_template_meta(template_id: str, name: str, path: str) -> TemplateMeta:
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    if "survey" not in wb.sheetnames or "choices" not in wb.sheetnames:
        raise InvalidTemplateError("Template workbook is missing a survey or choices sheet")

    survey = wb["survey"]
    choices = wb["choices"]
    columns = len(_header(survey))

    choices_header = _header(choices)
    list_name_idx = None
    for i, col in enumerate(choices_header):
        if col.lower() == "list_name":
            list_name_idx = i
            break
    list_names: set[str] = set()
    if list_name_idx is not None:
        for row in choices.iter_rows(min_row=2, values_only=True):
            if row and len(row) > list_name_idx and row[list_name_idx]:
                list_names.add(str(row[list_name_idx]))

    type_idx = None
    survey_header = _header(survey)
    for i, col in enumerate(survey_header):
        if col.lower() == "type":
            type_idx = i
            break
    geopoint_required = False
    if type_idx is not None:
        for row in survey.iter_rows(min_row=2, values_only=True):
            if row and len(row) > type_idx and row[type_idx] and "geopoint" in str(row[type_idx]).lower():
                geopoint_required = True
                break

    if "settings" in wb.sheetnames:
        settings_header = _header(wb["settings"])
        title_idx = next((i for i, col in enumerate(settings_header) if col.lower() == "form_title"), None)
        if title_idx is not None:
            first_row = next(wb["settings"].iter_rows(min_row=2, max_row=2, values_only=True), None)
            if first_row and len(first_row) > title_idx and first_row[title_idx]:
                name = str(first_row[title_idx]).strip()

    return TemplateMeta(
        id=template_id,
        name=name,
        columns=columns,
        choice_lists=len(list_names),
        geopoint_required=geopoint_required,
    )


def _matching_end_row(ws, begin_row: int, type_col: int) -> int | None:
    """Walk forward from a begin group/repeat row to find its matching end row, tracking nesting depth."""
    depth = 1
    for r in range(begin_row + 1, ws.max_row + 1):
        t = str(ws.cell(row=r, column=type_col).value or "").strip().lower()
        if t in ("begin group", "begin repeat"):
            depth += 1
        elif t in ("end group", "end repeat"):
            depth -= 1
            if depth == 0:
                return r
    return None


def _find_placeholder_group(ws, col_idx: dict[str, int]) -> tuple[int, int] | None:
    """Locate the template's `begin group grp_form_content ... end group` marker, if present."""
    type_col = col_idx["type"]
    name_col = col_idx["name"]
    for r in range(2, ws.max_row + 1):
        t = str(ws.cell(row=r, column=type_col).value or "").strip().lower()
        n = str(ws.cell(row=r, column=name_col).value or "").strip().lower()
        if t == "begin group" and n == PLACEHOLDER_GROUP_NAME:
            end_row = _matching_end_row(ws, r, type_col)
            if end_row:
                return r, end_row
    return None


def _question_row_type(q: Question) -> str:
    if q.type in ("select_one", "select_multiple") and q.choice_list_id:
        return f"{q.type} {q.choice_list_id}"
    return q.type


def _build_survey_rows(questions: list[Question]) -> list[dict[str, str]]:
    """Build survey-sheet rows for confirmed, non-skipped questions.

    Groups questions by their source PDF page into their own `begin group` /
    `end group` block when the PDF spans more than one page — a single-page
    form's questions are inserted flat.
    """
    by_page: dict[int, list[Question]] = {}
    for q in questions:
        if q.confirmed and not q.skipped:
            by_page.setdefault(q.page, []).append(q)

    pages = sorted(by_page)
    use_subgroups = len(pages) > 1

    rows: list[dict[str, str]] = []
    for page in pages:
        if use_subgroups:
            rows.append({"type": "begin group", "name": f"grp_page_{page}", "label": f"Page {page}"})
        for q in by_page[page]:
            row = {"type": _question_row_type(q), "name": q.name, "label": q.label}
            if q.appearance:
                row["appearance"] = q.appearance
            rows.append(row)
        if use_subgroups:
            rows.append({"type": "end group"})
    return rows


def list_base_structure(template_path: str) -> list[dict]:
    """The template's own fixed survey content — everything outside the
    grp_form_content placeholder — as a nested tree of groups and questions in
    document order, so the reviewer can see the template's real structure (with
    its group headers) rather than a flat list."""
    wb = openpyxl.load_workbook(template_path, data_only=True)
    if "survey" not in wb.sheetnames:
        return []
    ws = wb["survey"]
    header = _header(ws)
    col_idx = {name.lower(): i + 1 for i, name in enumerate(header)}
    if "type" not in col_idx or "name" not in col_idx:
        return []
    label_col = col_idx.get("label")

    placeholder = _find_placeholder_group(ws, col_idx)
    skip_rows = set(range(placeholder[0], placeholder[1] + 1)) if placeholder else set()

    items: list[dict] = []
    stack: list[dict] = []

    def container() -> list[dict]:
        return stack[-1]["questions"] if stack else items

    for r in range(2, ws.max_row + 1):
        if r in skip_rows:
            continue
        raw_type = ws.cell(row=r, column=col_idx["type"]).value
        t = str(raw_type or "").strip()
        if not t:
            continue
        n = str(ws.cell(row=r, column=col_idx["name"]).value or "").strip()
        label_val = ws.cell(row=r, column=label_col).value if label_col else None
        label = _strip_html(str(label_val)) if label_val else n

        tl = t.lower()
        if tl in ("begin group", "begin repeat"):
            group = {"kind": "group", "name": n, "label": label or n, "questions": []}
            container().append(group)
            stack.append(group)
        elif tl in ("end group", "end repeat"):
            if stack:
                stack.pop()
        else:
            container().append({"kind": "question", "type": t, "name": n, "label": label or n})

    return items


def get_choice_lists(path: str) -> dict[str, list[dict[str, str]]]:
    wb = openpyxl.load_workbook(path, data_only=True)
    if "choices" not in wb.sheetnames:
        return {}
    ws = wb["choices"]
    header = _header(ws)
    col_idx = {h.lower(): i for i, h in enumerate(header)}
    if "list_name" not in col_idx or "name" not in col_idx:
        return {}
    label_i = col_idx.get("label")

    lists: dict[str, list[dict[str, str]]] = {}
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row or len(row) <= col_idx["list_name"]:
            continue
        list_name = row[col_idx["list_name"]]
        if not list_name:
            continue
        list_name = str(list_name).strip()
        name = row[col_idx["name"]] if len(row) > col_idx["name"] and row[col_idx["name"]] else ""
        name = str(name).strip()
        label_val = row[label_i] if label_i is not None and len(row) > label_i and row[label_i] else None
        label = str(label_val).strip() if label_val else name
        lists.setdefault(list_name, []).append({"name": name, "label": label})
    return lists


def set_choice_lists(path: str, lists: dict[str, list[dict[str, str]]]) -> None:
    """Replace the entire contents of the choices sheet's data rows with `lists`
    (list_name -> ordered options). Preserves the header row and any other
    columns' positions; other columns are left blank for these rows."""
    wb = openpyxl.load_workbook(path)
    if "choices" not in wb.sheetnames:
        raise InvalidTemplateError("Template workbook is missing a choices sheet")
    ws = wb["choices"]
    header = _header(ws)
    col_idx = {h.lower(): i + 1 for i, h in enumerate(header)}
    if "list_name" not in col_idx or "name" not in col_idx:
        raise InvalidTemplateError("Template choices sheet must have list_name and name columns")
    label_col = col_idx.get("label")

    if ws.max_row > 1:
        ws.delete_rows(2, ws.max_row - 1)

    row_i = 2
    for list_name, options in lists.items():
        for opt in options:
            ws.cell(row=row_i, column=col_idx["list_name"], value=list_name)
            ws.cell(row=row_i, column=col_idx["name"], value=opt.get("name", ""))
            if label_col:
                ws.cell(row=row_i, column=label_col, value=opt.get("label") or opt.get("name", ""))
            row_i += 1

    wb.save(path)


def export_workbook(template_path: str, questions: list[Question]) -> bytes:
    wb = openpyxl.load_workbook(template_path)
    if "survey" not in wb.sheetnames:
        raise InvalidTemplateError("Template workbook is missing a survey sheet")
    ws = wb["survey"]
    header = _header(ws)
    col_idx = {name.lower(): i + 1 for i, name in enumerate(header)}
    if "type" not in col_idx or "name" not in col_idx or "label" not in col_idx:
        raise InvalidTemplateError("Template survey sheet must have type, name and label columns")

    rows = _build_survey_rows(questions)
    placeholder = _find_placeholder_group(ws, col_idx)

    insert_at = placeholder[1] if placeholder else ws.max_row + 1
    if rows:
        ws.insert_rows(insert_at, amount=len(rows))
        for offset, row in enumerate(rows):
            for key, value in row.items():
                if key in col_idx:
                    ws.cell(row=insert_at + offset, column=col_idx[key], value=value)

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
