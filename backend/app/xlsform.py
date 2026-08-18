import io

import openpyxl

from .models import Question, TemplateMeta


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

    return TemplateMeta(
        id=template_id,
        name=name,
        columns=columns,
        choice_lists=len(list_names),
        geopoint_required=geopoint_required,
    )


def export_workbook(template_path: str, questions: list[Question]) -> bytes:
    wb = openpyxl.load_workbook(template_path)
    if "survey" not in wb.sheetnames:
        raise InvalidTemplateError("Template workbook is missing a survey sheet")
    ws = wb["survey"]
    header = _header(ws)
    col_idx = {name.lower(): i + 1 for i, name in enumerate(header)}
    if "type" not in col_idx or "name" not in col_idx or "label" not in col_idx:
        raise InvalidTemplateError("Template survey sheet must have type, name and label columns")

    next_row = ws.max_row + 1
    for q in questions:
        if q.skipped or not q.confirmed:
            continue
        type_value = q.type
        if q.type in ("select_one", "select_multiple") and q.choice_list_id:
            type_value = f"{q.type} {q.choice_list_id}"
        ws.cell(row=next_row, column=col_idx["type"], value=type_value)
        ws.cell(row=next_row, column=col_idx["name"], value=q.name)
        ws.cell(row=next_row, column=col_idx["label"], value=q.label)
        next_row += 1

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
