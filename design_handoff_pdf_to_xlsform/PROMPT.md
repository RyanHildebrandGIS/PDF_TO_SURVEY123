# First prompt for Claude Code

This repo currently contains only a design handoff: `design_handoff_pdf_to_xlsform/`.

Read `design_handoff_pdf_to_xlsform/README.md` and open
`design_handoff_pdf_to_xlsform/PDF to Survey123 Wireframes.dc.html` in a browser to see the
wireframe. Build **option 1a only** (the guided 4-step stepper).

Scope for the first pass:
1. Scaffold a React + TypeScript + Vite front end and a Python (FastAPI) back end.
2. Back end: `POST /jobs` accepts one or more PDFs; extract questions with pypdf (AcroForm
   fields) and a text-layout pass for text PDFs; return per-question label, suggested XLSForm
   type, page, bbox and a confidence score. `POST /jobs/{id}/export` writes one XLSForm
   `.xlsx` per PDF with openpyxl, using the chosen template workbook as the column/choices/
   settings source.
3. Front end: the four screens in the README, with the review screen's PDF pane
   (pdf.js) ↔ question list two-way selection.
4. Keep styling in tokens per the README's Design Tokens section; the palette is a placeholder
   pending official Caltrans values, and the logo is a placeholder text mark.

Ask me before adding anything the README does not describe.
